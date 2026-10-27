// SEED 10K 실시간 시세 수집 함수 (Supabase Edge Function)
//
// Supabase Cron이 1분마다 부른다. 지금 장이 열려 있는 시장의 종목만 야후 파이낸스에서 받아
// public.seed10k_quotes 표(최신가, 그날 5분 봉)와 public.seed10k_daily 표(거래일별 마지막 가격)에 저장한다.
// 게임은 이 표들을 1분마다 읽는다.
//
// - 한국: 야후가 한국 시세를 20분 늦게 주므로, 한국 시각 08:55~16:00(평일)에 받는다.
// - 미국: 뉴욕 시각 09:25~16:20(평일)에 받는다. 마감 뒤 몇 분은 마감가를 확정하려고 더 받는다.
// - 환율(KRW=X): 두 시장 중 하나라도 받는 동안 함께 받는다.
// - 아무나 이 주소를 불러도 40초 안에 다시 부르면 아무것도 하지 않는다(야후 요청 남용 방지).
// - 장 시간과 관계없이 불릴 때마다 _beat 줄의 시각을 남긴다. 게임은 이 시각이 3분 안이면 '온라인'으로 표시한다.
// - 뉴스: 장 시간과 관계없이 한 번에 7종목씩, 30분 넘게 묵은 종목부터 받아 public.seed10k_news에 저장한다
//   (200종목이 약 30분에 한 바퀴). 한국어는 NAVER API HUB 뉴스 검색(함수 비밀값 NAVER_CLIENT_ID,
//   NAVER_CLIENT_SECRET가 있을 때만), 미국 종목은 Yahoo Finance 영어 뉴스도 함께 받는다.
//   NAVER API HUB 뉴스 검색: GET https://naverapihub.apigw.ntruss.com/search/v1/news
//   (헤더 X-NCP-APIGW-API-KEY-ID = Client ID, X-NCP-APIGW-API-KEY = Client Secret)
// - 공시: 함수 비밀값 DART_API_KEY가 있으면 5분마다 OpenDART 공시검색(시장 전체 최신순)을 받아,
//   게임의 한국 100종목 공시만 종목별 최근 10건씩 public.seed10k_dart에 저장한다. 처음에는 최근 3일을 채운다.
//   OpenDART 서버는 ECDHE가 없는 옛 TLS 암호(TLS_RSA_*, TLS_DHE_RSA_*)만 받아서 이 함수의 fetch(rustls)로는
//   접속이 안 된다(HandshakeFailure). 그래서 데이터베이스의 pg_net(libcurl)으로 대신 요청한다:
//   public.seed10k_http_get(urls) → 요청 번호들, public.seed10k_http_take(ids) → 끝난 응답(읽은 응답은 지운다).
// - 배당: 장 시간과 관계없이 한 번에 10종목씩, 20시간 넘게 묵은 종목부터 Yahoo 차트 API(events=div)로 최근 2년 배당을 받아
//   public.seed10k_divs에 [배당락일(거래소 현지 날짜), 1주당 배당금(현지 통화)] 목록으로 저장한다 (200종목이 약 20분에 한 바퀴).

import NAMES from "./names.ts";

type Row = { id: string; ysym: string; m: string; updated_at?: string | null };
type Quote = {
  id: string; ysym: string; m: string;
  p: number; t: string; d: string;
  i: { t: number[]; c: number[]; l: number[]; h: number[] };
  dl?: number; dh?: number;   // 그날 저가·고가
  updated_at: string;
};

let dailyLH = true;           // seed10k_daily에 l, h 열이 있는지 (없다는 오류를 한 번 보면 끈다)
const MIN_GAP_MS = 40_000;   // 이 간격 안에 다시 불리면 건너뛴다
const POOL = 16;             // 야후에 동시에 보내는 요청 수 (시장별 300종목을 1분 안에 넉넉히 받도록)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* 시간대 tz의 지금 요일·시·분 */
export function zone(tz: string, at: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { wd: p.weekday as string, mins: Number(p.hour) * 60 + Number(p.minute) };
}
const weekday = (wd: string) => wd !== "Sat" && wd !== "Sun";

/* 지금 받아야 할 시장 */
export function activeMarkets(at: Date) {
  const kr = zone("Asia/Seoul", at), us = zone("America/New_York", at);
  const KR = weekday(kr.wd) && kr.mins >= 8 * 60 + 55 && kr.mins <= 16 * 60;
  const US = weekday(us.wd) && us.mins >= 9 * 60 + 25 && us.mins <= 16 * 60 + 20;
  return { KR, US, FX: KR || US };
}

/* 시간대 tz에서 유닉스 초 sec의 날짜 (YYYY-MM-DD) */
function localDate(tz: string, sec: number) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  return f.format(new Date(sec * 1000));
}

/* 야후 차트 API에서 최신가와 그날 5분 봉을 받는다 */
export async function fetchQuote(row: Row): Promise<Quote> {
  const path = `/v8/finance/chart/${encodeURIComponent(row.ysym)}?range=1d&interval=5m&includePrePost=false&events=split`;
  let lastErr = "";
  for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const r = await fetch(`https://${host}${path}`, { headers: { "User-Agent": UA, "Accept": "application/json" } });
      if (!r.ok) { lastErr = `HTTP ${r.status}`; await r.body?.cancel(); continue; }
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      const meta = res?.meta;
      if (!meta || typeof meta.regularMarketPrice !== "number") { lastErr = "no price"; continue; }
      const krw = row.m === "KR";
      const rnd = (v: number) => (krw ? Math.round(v) : Math.round(v * 100) / 100);
      const tz = meta.exchangeTimezoneName || (krw ? "Asia/Seoul" : "America/New_York");
      const ts: number[] = res.timestamp || [];
      const qt = res.indicators?.quote?.[0] || {};
      const cl: (number | null)[] = qt.close || [], lo: (number | null)[] = qt.low || [], hi: (number | null)[] = qt.high || [];
      const it: number[] = [], ic: number[] = [], il: number[] = [], ih: number[] = [];
      const r2 = (v: number) => (row.m === "FX" ? Math.round(v * 100) / 100 : rnd(v));
      for (let k = 0; k < ts.length; k++) {
        const v = cl[k];
        if (typeof v === "number" && isFinite(v)) {
          const l = typeof lo[k] === "number" && isFinite(lo[k] as number) ? Math.min(lo[k] as number, v) : v;
          const h = typeof hi[k] === "number" && isFinite(hi[k] as number) ? Math.max(hi[k] as number, v) : v;
          it.push(ts[k]); ic.push(r2(v)); il.push(r2(l)); ih.push(r2(h));
        }
      }
      const sec = meta.regularMarketTime || (it.length ? it[it.length - 1] : Math.floor(Date.now() / 1000));
      const spl = Object.values(res.events?.splits || {}) as { date: number; numerator: number; denominator: number }[];
      for (const x of spl) if (typeof x?.date === "number" && x.numerator > 0 && x.denominator > 0) todaySplits.push([row.id, [localDate(tz, x.date), x.numerator, x.denominator]]);
      return {
        id: row.id, ysym: row.ysym, m: row.m,
        p: row.m === "FX" ? Math.round(meta.regularMarketPrice * 100) / 100 : rnd(meta.regularMarketPrice),
        t: new Date(sec * 1000).toISOString(),
        d: localDate(tz, sec),
        i: { t: it, c: ic, l: il, h: ih },
        ...(il.length ? { dl: Math.min(...il), dh: Math.max(...ih) } : {}),
        updated_at: new Date().toISOString(),
      };
    } catch (e) { lastErr = String((e as Error).message || e); }
  }
  throw new Error(`${row.ysym}: ${lastErr}`);
}

const todaySplits: [string, Split][] = [];   // 이번 실행의 1분 시세에서 본 분할
/* 여러 종목을 POOL개씩 동시에 받는다 */
export async function fetchAll(rows: Row[]) {
  const ok: Quote[] = [], failed: string[] = [];
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const row = rows[next++];
      try { ok.push(await fetchQuote(row)); } catch (e) { failed.push(String((e as Error).message || e)); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, rows.length) }, worker));
  return { ok, failed };
}

/* ───── 뉴스 ───── */
type News = { t: string; u: string; s: string; at: number; d?: string; img?: string };
const NEWS_PER_RUN = 7;            // 한 번 불릴 때 뉴스를 새로 받는 종목 수 (네이버 키가 있을 때, 200종목이 약 30분에 한 바퀴)
const NEWS_PER_RUN_US = 10;        // 네이버 키가 없으면 미국 종목만, 이만큼씩 (100종목이 약 10분에 한 바퀴)
const NEWS_TTL_MS = 30 * 60_000;   // 이보다 오래된 종목부터 다시 받는다
const NEWS_N = 5;                  // 종목당 기사 수

const ENT: Record<string, string> = { "&quot;": '"', "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#39;": "'", "&apos;": "'", "&nbsp;": " " };
const clean = (x: string) => String(x || "").replace(/<[^>]*>/g, "").replace(/&(quot|amp|lt|gt|#39|apos|nbsp);/g, (m) => ENT[m] || m).replace(/\s+/g, " ").trim();
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/* NAVER API HUB 뉴스 검색 (한국어). 키가 없으면 null */
export async function naverNews(name: string): Promise<News[] | null> {
  const id = Deno.env.get("NAVER_CLIENT_ID"), sec = Deno.env.get("NAVER_CLIENT_SECRET");
  if (!id || !sec) return null;
  const q = `${name} 주가`;
  const r = await fetch(`https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(q)}&display=${NEWS_N}&start=1&sort=date&format=json`,
    { headers: { "X-NCP-APIGW-API-KEY-ID": id, "X-NCP-APIGW-API-KEY": sec } });
  if (!r.ok) throw new Error(`naver HTTP ${r.status}: ${(await r.text()).slice(0, 120)}`);
  const j = await r.json();
  return (j.items || []).slice(0, NEWS_N).map((x: Record<string, string>) => {
    const u = x.originallink || x.link;
    return { t: clean(x.title), d: clean(x.description).slice(0, 140), u, s: host(u), at: Math.floor(Date.parse(x.pubDate) / 1000) || 0 };
  });
}

/* Yahoo Finance 검색의 뉴스 (영어, 미국 종목) */
export async function yahooNews(sym: string): Promise<News[]> {
  const r = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(sym)}&quotesCount=0&newsCount=${NEWS_N * 4}&enableFuzzyQuery=false`,
    { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) throw new Error(`yahoo news HTTP ${r.status}`);
  const j = await r.json();
  // Yahoo 검색 뉴스에는 다른 종목 기사도 섞인다. 관련 종목(relatedTickers)에 이 종목이 있는 기사만 쓴다.
  const want = new Set([sym, sym.replace("-", "."), sym.replace(".", "-")]);
  const rel = (j.news || []).filter((n: Record<string, unknown>) => ((n.relatedTickers as string[] | undefined) || []).some((t) => want.has(t)));
  return rel.slice(0, NEWS_N).map((n: Record<string, unknown>) => {
    const res = ((n.thumbnail as { resolutions?: { url: string; width: number }[] } | undefined)?.resolutions || []).slice().sort((a, b) => a.width - b.width);
    const img = (res.find((x) => x.width >= 120) || res[res.length - 1])?.url;
    return { t: clean(String(n.title || "")), u: String(n.link || ""), s: String(n.publisher || ""), at: Number(n.providerPublishTime) || 0, ...(img ? { img } : {}) };
  });
}

/* 묵은 종목부터 NEWS_PER_RUN개의 뉴스를 받아 저장한다 */
export async function refreshNews() {
  const rows: { id: string; at: string | null }[] = await (await rest("seed10k_news?select=id,at", { headers: restHeaders() })).json();
  const at = new Map(rows.map((r) => [r.id, r.at ? Date.parse(r.at) : 0]));
  const hasNaver = !!(Deno.env.get("NAVER_CLIENT_ID") && Deno.env.get("NAVER_CLIENT_SECRET"));
  // 네이버 키가 생겼으면, 키가 없어서 한국어 기사가 비어 있던(ko = null) 종목을 먼저 다시 받는다
  if (hasNaver) {
    const noKey: { id: string }[] = await (await rest("seed10k_news?select=id&items->>ko=is.null", { headers: restHeaders() })).json();
    for (const r of noKey) at.set(r.id, 0);
  }
  const now = Date.now();
  // 네이버 키가 없으면 한국 종목은 받을 기사가 없으므로 미국 종목(Yahoo 영어 기사)만 돈다
  const ids = Object.keys(NAMES).filter((id) => (hasNaver || NAMES[id].m === "US") && now - (at.get(id) || 0) > NEWS_TTL_MS)
    .sort((a, b) => (at.get(a) || 0) - (at.get(b) || 0)).slice(0, hasNaver ? NEWS_PER_RUN : NEWS_PER_RUN_US);
  const out = [], errs: string[] = [];
  for (const id of ids) {
    const meta = NAMES[id];
    const [ko, en] = await Promise.all([
      naverNews(meta.n).catch((e) => { errs.push(`${id} 네이버: ${(e as Error).message}`); return [] as News[]; }),
      meta.m === "US" ? yahooNews(meta.t).catch((e) => { errs.push(`${id} Yahoo: ${(e as Error).message}`); return [] as News[]; }) : Promise.resolve([] as News[]),
    ]);
    out.push({ id, at: new Date().toISOString(), items: { ko, en } });
  }
  if (out.length) {
    await rest("seed10k_news?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(out),
    });
  }
  return { done: out.length, errs: errs.slice(0, 5) };
}

/* ───── 배당 (Yahoo 차트 API events=div) ───── */
const DIV_EVERY_MS = 20 * 3600_000;   // 이보다 오래된 종목부터 다시 받는다
const DIV_PER_RUN = 10;               // 한 번 불릴 때 받는 종목 수

type Split = [string, number, number];   // [분할일(거래소 날짜), 분자, 분모]
const lastSplits = new Map<string, Split[]>();   // fetchDivs가 함께 받은 분할 기록
export async function fetchDivs(row: Row): Promise<[string, number][]> {
  const path = `/v8/finance/chart/${encodeURIComponent(row.ysym)}?range=2y&interval=1d&events=div%7Csplit`;
  let lastErr = "";
  for (const h of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
    try {
      const r = await fetch(`https://${h}${path}`, { headers: { "User-Agent": UA, "Accept": "application/json" } });
      if (!r.ok) { lastErr = `HTTP ${r.status}`; await r.body?.cancel(); continue; }
      const j = await r.json();
      const res = j?.chart?.result?.[0];
      if (!res?.meta) { lastErr = "no result"; continue; }
      const tz = res.meta.exchangeTimezoneName || (row.m === "KR" ? "Asia/Seoul" : "America/New_York");
      const dv: Record<string, { date: number; amount: number }> = res.events?.dividends || {};
      const out = Object.values(dv)
        .filter((x) => typeof x?.date === "number" && typeof x?.amount === "number" && x.amount > 0)
        .map((x) => [localDate(tz, x.date), row.m === "KR" ? Math.round(x.amount * 100) / 100 : Math.round(x.amount * 1e6) / 1e6] as [string, number])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const sp: Record<string, { date: number; numerator: number; denominator: number }> = res.events?.splits || {};
      lastSplits.set(row.id, Object.values(sp)
        .filter((x) => typeof x?.date === "number" && x.numerator > 0 && x.denominator > 0)
        .map((x) => [localDate(tz, x.date), x.numerator, x.denominator] as Split)
        .sort((a, b) => (a[0] < b[0] ? -1 : 1)));
      return out;
    } catch (e) { lastErr = String((e as Error).message || e); }
  }
  throw new Error(`${row.ysym}: ${lastErr}`);
}

export async function refreshDivs(all: Row[]) {
  const syms = all.filter((r) => r.m === "KR" || r.m === "US");
  const have: { id: string; at: string | null }[] = await (await rest("seed10k_divs?select=id,at", { headers: restHeaders() })).json();
  const atOf = new Map(have.filter((h) => !h.id.endsWith("#split")).map((h) => [h.id, h.at ? Date.parse(h.at) : 0]));
  const due = syms.filter((r) => Date.now() - (atOf.get(r.id) || 0) > DIV_EVERY_MS)
    .sort((a, b) => (atOf.get(a.id) || 0) - (atOf.get(b.id) || 0)).slice(0, DIV_PER_RUN);
  if (!due.length) return { done: 0 };
  const ok: { id: string; at: string; items: [string, number][] }[] = [], errs: string[] = [], failIds: string[] = [];
  for (const r of due) {
    try { ok.push({ id: r.id, at: new Date().toISOString(), items: await fetchDivs(r) }); }
    catch (e) { errs.push(String((e as Error).message || e).slice(0, 80)); failIds.push(r.id); }
  }
  if (failIds.length) {
    // 실패한 종목은 기존 배당 목록은 두고 시각만 남겨, 1시간쯤 뒤에 다시 시도한다
    const retryAt = new Date(Date.now() - DIV_EVERY_MS + 3600_000).toISOString();
    await rest("seed10k_divs?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(failIds.map((id) => ({ id, at: retryAt }))),
    });
  }
  if (ok.length) {
    // 분할 기록은 같은 표에 'id#split' 줄로 둔다 (표를 새로 만들지 않으려고)
    const sp = ok.map((r) => ({ id: r.id + "#split", at: r.at, items: lastSplits.get(r.id) || [] }));
    await rest("seed10k_divs?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([...ok, ...sp]),
    });
  }
  return { done: ok.length, errs };
}

/* ───── 공시 (OpenDART) ───── */
type Filing = { r: string; t: string; f: string; d: string; rm?: string };
const DART_EVERY_MS = 5 * 60_000;   // 공시를 다시 확인하는 간격
const DART_KEEP = 10;               // 종목별로 남기는 공시 수
const ymd = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)).replaceAll("-", "");

/* pg_net으로 GET 여러 개를 한꺼번에 보내고 JSON 응답을 받는다 (주소 순서대로). */
async function dbGetJSON(urls: string[], waitMs = 30_000): Promise<unknown[]> {
  const rpc = async (fn: string, body: unknown) =>
    (await rest(`rpc/${fn}`, { method: "POST", headers: restHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(body) })).json();
  const ids: number[] = (await rpc("seed10k_http_get", { urls })).map(Number);
  if (ids.length !== urls.length || ids.some((x) => !x)) throw new Error("pg_net 요청을 만들지 못함");
  const got = new Map<number, { status_code: number | null; content: string | null; error_msg: string | null; timed_out: boolean | null }>();
  const until = Date.now() + waitMs;
  while (got.size < ids.length) {
    if (Date.now() > until) throw new Error(`pg_net 응답 시간 초과 (${got.size}/${ids.length})`);
    await new Promise((r) => setTimeout(r, 400));
    const rows: { id: number; status_code: number | null; content: string | null; error_msg: string | null; timed_out: boolean | null }[] =
      await rpc("seed10k_http_take", { ids: ids.filter((x) => !got.has(x)) });
    for (const r of rows) got.set(Number(r.id), r);
  }
  return ids.map((id) => {
    const r = got.get(id)!;
    if (r.timed_out || r.error_msg) throw new Error(`pg_net 오류: ${r.timed_out ? "시간 초과" : r.error_msg}`);
    if (r.status_code !== 200) throw new Error(`HTTP ${r.status_code}`);
    return JSON.parse(r.content || "null");
  });
}

export async function refreshDart() {
  const key = Deno.env.get("DART_API_KEY");
  if (!key) return null;
  const st: { items: { last?: string; at?: number } | null }[] = await (await rest("seed10k_dart?select=items&id=eq._state", { headers: restHeaders() })).json();
  const state = (st[0] && st[0].items) || {};
  if (state.at && Date.now() - state.at < DART_EVERY_MS) return { skipped: "5분 안에 확인함" };
  const krIds = new Map(Object.entries(NAMES).filter(([, v]) => v.m === "KR").map(([id, v]) => [v.t, id]));
  const first = !state.last;
  const bgn = ymd(Date.now() - (first ? 3 : 2) * 864e5), end = ymd(Date.now());
  const pageUrl = (p: number) =>
    `https://opendart.fss.or.kr/api/list.json?crtfc_key=${encodeURIComponent(key)}&bgn_de=${bgn}&end_de=${end}&sort=date&sort_mth=desc&page_no=${p}&page_count=100`;
  const found = new Map<string, Filing[]>();
  let newest = state.last || "", pages = 0, stop = false, total = 1;
  // 처음에는 쪽을 10개씩 한꺼번에, 그다음부터는 지난번에 본 공시가 나올 때까지 1쪽씩 받는다.
  const maxPage = first ? 60 : 10, batch = first ? 10 : 1;
  let next = 1;
  while (!stop && next <= Math.min(maxPage, total)) {
    const last = next === 1 ? 1 : Math.min(maxPage, total, next + batch - 1);   // 1쪽은 혼자 받아 전체 쪽수를 안다
    const nums = Array.from({ length: last - next + 1 }, (_, k) => next + k);
    next = last + 1;
    const res = await dbGetJSON(nums.map(pageUrl));
    for (const j0 of res) {
      const j = j0 as { status?: string; message?: string; total_page?: number; list?: Record<string, unknown>[] };
      pages++;
      if (j.status === "013") { stop = true; break; }                  // 조회된 데이터가 없음
      if (j.status !== "000") throw new Error(`dart ${j.status}: ${j.message}`);
      total = Number(j.total_page || 1);
      for (const x of j.list || []) {
        const rno = String(x.rcept_no || "");
        if (!rno) continue;
        if (state.last && rno <= state.last) { stop = true; break; }   // 지난번에 본 공시까지 왔다
        if (rno > newest) newest = rno;
        const id = krIds.get(String(x.stock_code || "").trim());
        if (!id) continue;
        const arr = found.get(id) || [];
        arr.push({ r: rno, t: clean(String(x.report_nm || "")), f: clean(String(x.flr_nm || "")), d: String(x.rcept_dt || ""), ...(x.rm ? { rm: String(x.rm) } : {}) });
        found.set(id, arr);
      }
      if (stop) break;
    }
  }
  const rows: { id: string; at: string; items: Filing[] }[] = [];
  if (found.size) {
    const ids = [...found.keys()];
    const old: { id: string; items: Filing[] | null }[] = await (await rest(`seed10k_dart?select=id,items&id=in.(${ids.map((i) => `"${i}"`).join(",")})`, { headers: restHeaders() })).json();
    const oldMap = new Map(old.map((o) => [o.id, o.items || []]));
    for (const [id, arr] of found) {
      const seen = new Set<string>(), merged: Filing[] = [];
      for (const f of [...arr, ...(oldMap.get(id) || [])].sort((a, b) => (a.r < b.r ? 1 : -1))) {
        if (seen.has(f.r)) continue; seen.add(f.r); merged.push(f);
      }
      rows.push({ id, at: new Date().toISOString(), items: merged.slice(0, DART_KEEP) });
    }
  }
  rows.push({ id: "_state", at: new Date().toISOString(), items: { last: newest, at: Date.now() } as unknown as Filing[] });
  await rest("seed10k_dart?on_conflict=id", {
    method: "POST",
    headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(rows),
  });
  return { pages, stocks: found.size, filings: [...found.values()].reduce((a, b) => a + b.length, 0) };
}

/* Supabase REST 호출 (비밀 키로 쓰기) */
function secretKey(): string {
  try {
    const j = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const v = Object.values(j)[0];
    if (typeof v === "string" && v) return v;
  } catch (_) { /* 새 키가 없으면 예전 키를 쓴다 */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
function restHeaders(extra: Record<string, string> = {}) {
  const key = secretKey();
  const h: Record<string, string> = { apikey: key, "Content-Type": "application/json", ...extra };
  if (key.startsWith("eyJ")) h.Authorization = `Bearer ${key}`;   // 예전 service_role 키(JWT)
  return h;
}
async function rest(path: string, init: RequestInit = {}) {
  const base = Deno.env.get("SUPABASE_URL");
  const r = await fetch(`${base}/rest/v1/${path}`, init);
  if (!r.ok) throw new Error(`REST ${path.split("?")[0]} HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r;
}

export async function run(at = new Date()) {
  const started = Date.now();
  // 살아 있다는 신호 (1분 예약 작업이 돌고 있는지 게임에서 확인하는 용도)
  await rest("seed10k_quotes?on_conflict=id", {
    method: "POST",
    headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ id: "_beat", ysym: "-", m: "SYS", updated_at: new Date().toISOString() }]),
  });
  const act = activeMarkets(at);
  const all: Row[] = await (await rest("seed10k_quotes?select=id,ysym,m,updated_at", { headers: restHeaders() })).json();
  const mark = all.find((r) => r.id === "_run");
  if (mark?.updated_at && Date.now() - Date.parse(mark.updated_at) < MIN_GAP_MS) return { skipped: "방금 실행됨", act };
  // 게임 종목 이름표(names.ts)에 있는데 시세 표에 없는 종목은 여기서 등록한다 (종목을 늘릴 때 SQL을 따로 돌리지 않아도 되게)
  const have = new Set(all.map((r) => r.id));
  const add = Object.entries(NAMES).filter(([id, v]) => !have.has(id) && v.y).map(([id, v]) => ({ id, ysym: v.y, m: v.m }));
  if (add.length) {
    await rest("seed10k_quotes?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(add),
    });
    all.push(...add);
  }
  await rest("seed10k_quotes?on_conflict=id", {
    method: "POST",
    headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ id: "_run", ysym: "-", m: "SYS", updated_at: new Date().toISOString() }]),
  });

  // 뉴스는 시세와 따로: 실패하거나 뉴스 표가 없어도 시세 수집은 계속한다
  let news: unknown, dart: unknown, divs: unknown;
  try { news = await refreshNews(); } catch (e) { news = { error: String((e as Error).message || e) }; }
  try { dart = await refreshDart(); } catch (e) { dart = { error: String((e as Error).message || e) }; }
  try { divs = await refreshDivs(all); } catch (e) { divs = { error: String((e as Error).message || e) }; }

  if (!act.FX) return { skipped: "장 시간이 아님", act, added: add.length, news, dart, divs };

  const want = all.filter((r) => (r.m === "KR" && act.KR) || (r.m === "US" && act.US) || (r.m === "FX" && act.FX));
  const { ok, failed } = await fetchAll(want);
  for (let k = 0; k < ok.length; k += 100) {
    await rest("seed10k_quotes?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(ok.slice(k, k + 100).map(({ dl: _l, dh: _h, ...q }) => q)),
    });
  }
  // 오늘 분할이 보이면 분할 기록 줄에 바로 더한다 (하루 한 번 수집을 기다리지 않게)
  if (todaySplits.length) {
    const ids = [...new Set(todaySplits.map(([id]) => id))];
    const cur: { id: string; items: Split[] | null }[] = await (await rest(`seed10k_divs?select=id,items&id=in.(${ids.map((i) => encodeURIComponent(`"${i}#split"`)).join(",")})`, { headers: restHeaders() })).json();
    const curMap = new Map(cur.map((r) => [r.id.slice(0, -6), r.items || []]));
    const rows = ids.map((id) => {
      const items = [...(curMap.get(id) || [])];
      for (const [i2, sp] of todaySplits) if (i2 === id && !items.some((x) => x[0] === sp[0])) items.push(sp);
      return { id: id + "#split", at: new Date().toISOString(), items: items.sort((a, b) => (a[0] < b[0] ? -1 : 1)) };
    });
    await rest("seed10k_divs?on_conflict=id", { method: "POST", headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(rows) });
    todaySplits.length = 0;
  }
  // 거래일별 마지막 가격(장이 끝나면 그날 종가)도 남긴다. GitHub 수집이 며칠 멈춰도 일별 종가가 비지 않게.
  // 그날 저가·고가(l, h)도 남긴다 (예약 주문 판정용). 표에 l, h 열이 아직 없으면 종가만 남긴다
  const daily = ok.map((q) => ({ id: q.id, d: q.d, c: q.p, ...(dailyLH && q.dl != null ? { l: q.dl, h: q.dh } : {}) }));
  for (let k = 0; k < daily.length; k += 200) {
    const part = daily.slice(k, k + 200);
    const send = (rows: unknown[]) => rest("seed10k_daily?on_conflict=id,d", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows),
    });
    const plain = () => part.map(({ l: _l, h: _h, ...r }) => r);
    if (!dailyLH) { await send(plain()); continue; }
    try { await send(part); }
    catch (e) {
      if (!/column|PGRST204|42703/i.test(String((e as Error).message || e))) throw e;
      dailyLH = false;
      await send(plain());
    }
  }
  return { act, added: add.length, wanted: want.length, saved: ok.length, failed: failed.slice(0, 10), failedCount: failed.length, news, dart, divs, ms: Date.now() - started };
}

Deno.serve(async () => {
  try {
    const out = await run();
    return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
