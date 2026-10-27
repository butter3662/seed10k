// SEED 10K 실시간 시세 수집 함수 (Supabase Edge Function)
//
// Supabase Cron이 7초마다 부른다. 하는 일은 두 갈래다.
//
// [7초마다] 현재가: 네이버 증권 실시간 시세를 시장 전체 한 번에(150종목씩 묶어) 받아
//   public.seed10k_quotes의 최신가(p, t, d)와 public.seed10k_daily(그날 마지막 가격, 저가, 고가)를 고친다.
//   한국 api/realtime/domestic/stock/{코드,...}, 미국 api/realtime/worldstock/stock/{로이터 코드,...} (polling.finance.naver.com).
//   응답의 pollingInterval이 두 시장 모두 7000(7초)이라 7초로 맞췄다. 지연 시간(delayTime)은 두 시장 모두 0으로 온다.
//   마지막 체결 시각(localTradedAt)이 그 시장의 오늘 정규장 안인 값만 쓴다(평소 한국 09:00~15:45, 미국 09:30~16:05, 특별한 날은 SPECIAL_SESS).
//   한국은 장이 끝난 뒤 시간외 단일가(16:00~18:00)가 현재가를 바꾸므로 이 구간을 버린다.
//   4초 안에 다시 불리면 이 부분은 건너뛴다.
// [약 1분마다] 5분 봉과 나머지: 지금 장이 열려 있는 시장의 종목을 야후 파이낸스에서 받아 그날 5분 봉(i)을 저장한다.
//   네이버 현재가가 최근 90초 안에 들어온 시장은 야후의 최신가로 덮지 않는다(야후 한국 시세는 20분 늦다).
//   네이버가 멈추면 예전처럼 야후 최신가를 쓴다.
//
// - 한국: 한국 시각 08:55~16:00(평일)에 받는다.
// - 미국: 뉴욕 시각 09:25~16:20(평일)에 받는다. 마감 뒤 몇 분은 마감가를 확정하려고 더 받는다.
// - 환율(KRW=X): 두 시장 중 하나라도 받는 동안 1분마다 야후에서 함께 받는다.
// - 아무나 이 주소를 불러도 55초 안에 다시 부르면 1분 작업은 하지 않는다(야후 요청 남용 방지).
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
// - 한국 장 마감 구간: 야후는 한국 정규장을 09:00~15:00으로 잡아 15:00 봉 자리에 종가(거래량 0)를 넣고
//   15:00~15:20 거래를 주지 않는다. 그래서 한국 장이 끝나고 30분 뒤부터(평소 16:01~24:00) 한 번에 60종목씩,
//   네이버 증권 1분 봉(api.stock.naver.com/chart/domestic/item/{코드}/minute)으로 마감 전 90분(평소 14:00~15:30)을 5분 봉으로 바꿔 넣는다.
//   채운 종목은 i.nv = 1, 실패하면 i.nf에 실패 횟수를 남기고 3번 실패하면 더 시도하지 않는다.
//   더 채울 종목이 없으면 _closeKR 줄(d = 그날)을 남긴다. 게임은 이 표시가 와야 한국 시장을 '장 마감'으로 바꾼다.

import NAMES from "./names.ts";

type Row = { id: string; ysym: string; m: string; t?: string | null; updated_at?: string | null };
type DailyRow = { id: string; d: string; c: number; l?: number; h?: number };
type Quote = {
  id: string; ysym: string; m: string;
  p: number; t: string; d: string;
  i: { t: number[]; c: number[]; l: number[]; h: number[] };
  dl?: number; dh?: number;   // 그날 저가·고가
  updated_at: string;
};

let dailyLH = true;           // seed10k_daily에 l, h 열이 있는지 (없다는 오류를 한 번 보면 끈다)
const MIN_GAP_MS = 55_000;   // 1분 작업: 이 간격 안에 다시 불리면 건너뛴다
const FAST_GAP_MS = 4_000;   // 7초 작업: 이 간격 안에 다시 불리면 건너뛴다
const NV_FRESH_MS = 90_000;  // 네이버 현재가가 이 시간 안에 들어왔으면 야후 최신가로 덮지 않는다
const POOL = 16;             // 야후에 동시에 보내는 요청 수 (시장별 300종목을 1분 안에 넉넉히 받도록)
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/* 시간대 tz의 지금 요일·시·분 */
export function zone(tz: string, at: Date) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { wd: p.weekday as string, mins: Number(p.hour) * 60 + Number(p.minute) };
}
const weekday = (wd: string) => wd !== "Sat" && wd !== "Sun";

/* 정규장 시간 (현지 자정부터 분). 평소와 다른 날은 SPECIAL_SESS에 적는다. 게임(app.js)의 SPECIAL_SESS와 같게 유지한다.
   - 미국 2026-11-27, 2026-12-24: 13:00 조기 마감 (NYSE 공지)
   - 한국 2026-11-19(수능): 10:00~16:30 (예년 수능일을 따름, 거래소 공지 전), 2027-01-04(새해 첫 거래일): 10:00 개장 (예년을 따름) */
const SESS: Record<"KR" | "US", { tz: string; o: number; c: number }> = {
  KR: { tz: "Asia/Seoul", o: 9 * 60, c: 15 * 60 + 30 },
  US: { tz: "America/New_York", o: 9 * 60 + 30, c: 16 * 60 },
};
const SPECIAL_SESS: Record<"KR" | "US", Record<string, { o?: number; c?: number }>> = {
  KR: { "2026-11-19": { o: 10 * 60, c: 16 * 60 + 30 }, "2027-01-04": { o: 10 * 60 } },
  US: { "2026-11-27": { c: 13 * 60 }, "2026-12-24": { c: 13 * 60 } },
};
export function sessOf(m: "KR" | "US", at: Date) {
  const tz = SESS[m].tz, date = localDate(tz, Math.floor(at.getTime() / 1000));
  return { ...SESS[m], ...(SPECIAL_SESS[m][date] || {}), date };
}
const hhmm = (mins: number) => String(Math.floor(mins / 60)).padStart(2, "0") + String(mins % 60).padStart(2, "0");
const KR_AFTER = 30, US_AFTER = 20;   // 마감 뒤 이만큼(분) 더 받는다 (늦게 오는 마감 시세)

/* 지금 받아야 할 시장: 개장 5분 전부터 마감 뒤 KR_AFTER/US_AFTER분까지 (평일) */
export function activeMarkets(at: Date) {
  const kr = zone("Asia/Seoul", at), us = zone("America/New_York", at), ks = sessOf("KR", at), us2 = sessOf("US", at);
  const KR = weekday(kr.wd) && kr.mins >= ks.o - 5 && kr.mins <= ks.c + KR_AFTER;
  const US = weekday(us.wd) && us.mins >= us2.o - 5 && us.mins <= us2.c + US_AFTER;
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

/* 한국 장 마감 구간(15:00~15:30)을 네이버 1분 봉으로 채운다 */
const NV_PER_RUN = 60, NV_POOL = 8, NV_TRIES = 3;
type NvBar = { localDateTime: string; currentPrice: number; highPrice?: number; lowPrice?: number };
// "YYYYMMDDhhmmss"(한국 시각) → 유닉스 초
const kstSec = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(8, 10) - 9, +s.slice(10, 12)) / 1000;
export async function fetchNaverClose(code: string, ymd: string, from = "1500", to = "1530"): Promise<{ t: number[]; c: number[]; l: number[]; h: number[] }> {
  const u = `https://api.stock.naver.com/chart/domestic/item/${encodeURIComponent(code)}/minute?startDateTime=${ymd}${from}&endDateTime=${ymd}${to}`;
  const r = await fetch(u, { headers: { "User-Agent": UA, "Accept": "application/json" } });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`naver ${code} HTTP ${r.status}`); }
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`naver ${code}: 형식이 다름`);
  // 5분 봉으로 묶는다: 봉 시각 = 그 5분의 첫 분, 종가 = 마지막 분의 가격
  const b = new Map<number, { c: number; l: number; h: number }>();
  for (const x of j as NvBar[]) {
    const s = String(x?.localDateTime || "");
    if (s.slice(0, 8) !== ymd || s.slice(8, 12) < from || s.slice(8, 12) > to) continue;
    const c = Number(x.currentPrice); if (!(c > 0)) continue;
    const lo = Number(x.lowPrice) > 0 ? Math.min(Number(x.lowPrice), c) : c, hi = Number(x.highPrice) > 0 ? Math.max(Number(x.highPrice), c) : c;
    const sec = kstSec(s), k = sec - (sec % 300), o = b.get(k);
    b.set(k, o ? { c, l: Math.min(o.l, lo), h: Math.max(o.h, hi) } : { c, l: lo, h: hi });   // 응답은 시간순
  }
  const ks = [...b.keys()].sort((a, z) => a - z);
  return { t: ks, c: ks.map((k) => Math.round(b.get(k)!.c)), l: ks.map((k) => Math.round(b.get(k)!.l)), h: ks.map((k) => Math.round(b.get(k)!.h)) };
}
type QI = { t: number[]; c: number[]; l?: number[]; h?: number[]; nv?: number; nf?: number };
export async function fillKrClose(at: Date) {
  const kr = zone("Asia/Seoul", at);
  const ks = sessOf("KR", at);
  if (!weekday(kr.wd) || kr.mins <= ks.c + KR_AFTER) return { skipped: "한국 장 마감 뒤가 아님" };
  // 마감 전 90분(평소 14:00~15:30)을 네이버 분봉으로 바꾼다. 야후가 장 시간을 다르게 잡는 날(수능일 등)에도 끝부분이 비지 않게 넉넉히 잡는다
  const fFrom = hhmm(ks.c - 90), fTo = hhmm(ks.c);
  const today = localDate("Asia/Seoul", Math.floor(at.getTime() / 1000)), ymd = today.replaceAll("-", "");
  const rows: { id: string; ysym: string; m: string; p: number; d: string; i: QI | null }[] = await (await rest(
    `seed10k_quotes?select=id,ysym,m,p,d,i&m=eq.KR&d=eq.${today}&i->>nv=is.null&or=(i->>nf.is.null,i->>nf.lt.${NV_TRIES})&order=id&limit=${NV_PER_RUN}`,
    { headers: restHeaders() })).json();
  if (!rows.length) {
    // 그날 채울 종목이 더 없다: 게임이 '마감 집계 중'을 끝내도록 표시를 남긴다
    await rest("seed10k_quotes?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{ id: "_closeKR", ysym: "-", m: "SYS", d: today, updated_at: new Date().toISOString() }]),
    });
    return { done: 0, settled: today };
  }
  const cut = kstSec(ymd + fFrom + "00");
  const out: { id: string; ysym: string; m: string; i: QI }[] = [], daily: { id: string; d: string; c: number; l?: number; h?: number }[] = [], errs: string[] = [];
  let next = 0;
  async function worker() {
    while (next < rows.length) {
      const r = rows[next++], q = r.i || { t: [], c: [] };
      const ql = q.l && q.l.length === q.t.length ? q.l : q.c, qh = q.h && q.h.length === q.t.length ? q.h : q.c;
      try {
        const nv = await fetchNaverClose(r.id.slice(3), ymd, fFrom, fTo);
        if (!nv.t.length) throw new Error(`naver ${r.id}: ${fFrom}~${fTo} 봉 없음`);
        const k = q.t.findIndex((x) => x >= cut), n = k < 0 ? q.t.length : k;
        const i: QI = { t: q.t.slice(0, n).concat(nv.t), c: q.c.slice(0, n).concat(nv.c), l: ql.slice(0, n).concat(nv.l), h: qh.slice(0, n).concat(nv.h), nv: 1 };
        out.push({ id: r.id, ysym: r.ysym, m: r.m, i });
        daily.push({ id: r.id, d: r.d, c: r.p, l: Math.min(...i.l!), h: Math.max(...i.h!) });
      } catch (e) {
        errs.push(String((e as Error).message || e).slice(0, 80));
        out.push({ id: r.id, ysym: r.ysym, m: r.m, i: { ...q, nf: (q.nf || 0) + 1 } });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(NV_POOL, rows.length) }, worker));
  await rest("seed10k_quotes?on_conflict=id", {
    method: "POST",
    headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(out),
  });
  if (daily.length) await rest("seed10k_daily?on_conflict=id,d", {
    method: "POST",
    headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify(dailyLH ? daily : daily.map(({ l: _l, h: _h, ...x }) => x)),
  });
  return { done: daily.length, failed: errs.length, errs: errs.slice(0, 5) };
}

/* 네이버 증권 실시간 현재가 (7초 작업) */
const NV_CHUNK = 150;
// 체결 시각이 개장 ~ 마감 뒤 after분 안인 값만 쓴다 (평소 한국 09:00~15:45, 미국 09:30~16:05)
const NV_LIVE: Record<"KR" | "US", { after: number; url: string }> = {
  KR: { after: 15, url: "https://polling.finance.naver.com/api/realtime/domestic/stock/" },
  US: { after: 5, url: "https://polling.finance.naver.com/api/realtime/worldstock/stock/" },
};
type NvLive = { itemCode?: string; reutersCode?: string; closePrice?: string; closePriceRaw?: string; highPrice?: string; highPriceRaw?: string; lowPrice?: string; lowPriceRaw?: string; localTradedAt?: string };
const nvNum = (raw?: string, txt?: string) => { const v = parseFloat(String(raw ?? txt ?? "").replace(/,/g, "")); return isFinite(v) ? v : NaN; };
export async function fetchNaverLive(m: "KR" | "US", at: Date) {
  const ss = sessOf(m, at), today = ss.date, w = { url: NV_LIVE[m].url, from: hhmm(ss.o), to: hhmm(ss.c + NV_LIVE[m].after) };
  const byCode = new Map(Object.entries(NAMES).filter(([, v]) => v.m === m && v.v).map(([id, v]) => [v.v as string, { id, y: v.y }]));
  const codes = [...byCode.keys()], now = new Date().toISOString();
  const rnd = (v: number) => (m === "KR" ? Math.round(v) : Math.round(v * 100) / 100);
  const rows: Record<string, unknown>[] = [], daily: DailyRow[] = [];
  let got = 0;
  for (let k = 0; k < codes.length; k += NV_CHUNK) {
    const r = await fetch(w.url + codes.slice(k, k + NV_CHUNK).map(encodeURIComponent).join(","), { headers: { "User-Agent": UA } });
    if (!r.ok) { await r.body?.cancel(); throw new Error(`naver ${m} HTTP ${r.status}`); }
    const j = await r.json();
    for (const x of (j?.datas || []) as NvLive[]) {
      const hit = byCode.get(String((m === "KR" ? x.itemCode : x.reutersCode) || "")); if (!hit) continue;
      got++;
      // localTradedAt은 그 시장 현지 시각("2026-10-27T15:30:01+09:00" 꼴): 오늘 정규장 안의 체결만 쓴다
      const ts = String(x.localTradedAt || ""), hm = ts.slice(11, 13) + ts.slice(14, 16);
      if (ts.slice(0, 10) !== today || hm < w.from || hm > w.to) continue;
      const p = nvNum(x.closePriceRaw, x.closePrice), sec = Date.parse(ts);
      if (!(p > 0) || !isFinite(sec)) continue;
      // updated_at은 바꾸지 않는다: 게임은 '바뀐 줄'을 updated_at으로 고르므로, 7초마다 바뀌는 현재가는 아래 묶음 줄(_snap)로 받는다
      rows.push({ id: hit.id, ysym: hit.y, m, p: rnd(p), t: new Date(sec).toISOString(), d: today });
      const lo = nvNum(x.lowPriceRaw, x.lowPrice), hi = nvNum(x.highPriceRaw, x.highPrice);
      daily.push({ id: hit.id, d: today, c: rnd(p), ...(lo > 0 && hi > 0 ? { l: rnd(Math.min(lo, p)), h: rnd(Math.max(hi, p)) } : {}) });
    }
  }
  if (!got) throw new Error(`naver ${m}: 받은 종목 없음`);
  for (let k = 0; k < rows.length; k += 200) {
    await rest("seed10k_quotes?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(rows.slice(k, k + 200)),
    });
  }
  await saveDaily(daily);
  // 묶음 줄: 이 시장의 현재가 전부를 한 줄에 (게임이 1분마다 300줄 대신 이 한 줄을 읽는다). 시각은 t0(유닉스 초) + 차이(dt)
  const secs = rows.map((r) => Math.floor(Date.parse(r.t as string) / 1000)), t0 = secs.length ? Math.min(...secs) : 0;
  const x = { ids: rows.map((r) => r.id), p: rows.map((r) => r.p), t0, dt: secs.map((v) => v - t0) };
  await rest("seed10k_quotes?on_conflict=id", {
    method: "POST",
    headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ id: "_nv" + m, ysym: "-", m: "SYS", updated_at: now, d: null, i: null }, { id: "_snap" + m, ysym: "-", m: "SYS", updated_at: now, d: today, i: { x } }]),
  });
  return { got, saved: rows.length };
}

/* 거래일별 마지막 가격(+ 저가, 고가)을 seed10k_daily에 남긴다. 표에 l, h 열이 없으면 종가만 남긴다 */
async function saveDaily(all: DailyRow[]) {
  // 저가·고가가 있는 줄과 없는 줄은 열 구성이 달라 따로 보낸다
  for (const daily of [all.filter((r) => r.l != null && r.h != null), all.filter((r) => r.l == null || r.h == null).map(({ l: _l, h: _h, ...r }): DailyRow => r)])
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
  const marks: Row[] = await (await rest("seed10k_quotes?select=id,ysym,m,updated_at&id=in.(_fast,_run)", { headers: restHeaders() })).json();
  const markAt = (id: string) => Date.parse(marks.find((r) => r.id === id)?.updated_at || "") || 0;
  // [7초 작업] 장이 열린 시장의 현재가를 네이버에서
  const live: Record<string, unknown> = {};
  if ((act.KR || act.US) && Date.now() - markAt("_fast") >= FAST_GAP_MS) {
    await rest("seed10k_quotes?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify([{ id: "_fast", ysym: "-", m: "SYS", updated_at: new Date().toISOString() }]),
    });
    for (const m of ["KR", "US"] as const) {
      if (!act[m]) continue;
      try { live[m] = await fetchNaverLive(m, at); } catch (e) { live[m] = { error: String((e as Error).message || e).slice(0, 200) }; }
    }
  }
  // [1분 작업]
  if (Date.now() - markAt("_run") < MIN_GAP_MS) return { skipped: "1분 작업은 방금 함", act, live };
  const all: Row[] = await (await rest("seed10k_quotes?select=id,ysym,m,t,updated_at", { headers: restHeaders() })).json();
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
  let close: unknown;
  try { close = await fillKrClose(at); } catch (e) { close = { error: String((e as Error).message || e) }; }

  // 한 번도 시세를 받지 못한 종목(새로 등록된 종목)은 장 시간이 아니어도 한 번 받는다.
  // 장이 끝난 뒤 종목을 늘려도 그날 5분 봉과 종가가 바로 채워지게 한다.
  const fresh = (r: Row) => !r.updated_at && (r.m === "KR" || r.m === "US" || r.m === "FX") && !!r.ysym && r.ysym !== "-";
  const want = all.filter((r) => (r.m === "KR" && act.KR) || (r.m === "US" && act.US) || (r.m === "FX" && act.FX) || fresh(r));
  if (!want.length) return { skipped: "장 시간이 아님", act, live, added: add.length, news, dart, divs, close };
  const { ok, failed } = await fetchAll(want);
  // 네이버 현재가가 최근에 들어온 시장의 종목은 야후의 최신가(p, t, d)와 일별 가격을 쓰지 않고 5분 봉만 저장한다.
  // 단 그 종목의 저장된 체결 시각이 야후 시각보다 2분 넘게 오래됐으면(네이버가 그 종목만 안 주는 경우) 야후 값을 쓴다
  const nvFresh = (m: string) => Date.now() - (Date.parse(all.find((r) => r.id === "_nv" + m)?.updated_at || "") || 0) < NV_FRESH_MS;
  const tOf = new Map(all.map((r) => [r.id, Date.parse(r.t || "") || 0])), upOf = new Map(all.map((r) => [r.id, !!r.updated_at]));
  // (한 번도 야후로 받은 적 없는 줄(updated_at 없음)은 야후 값으로 먼저 채운다)
  const byNaver = (q: Quote) => (q.m === "KR" || q.m === "US") && !!NAMES[q.id]?.v && nvFresh(q.m) && !!upOf.get(q.id) && (tOf.get(q.id) || 0) >= Date.parse(q.t) - 120_000;
  // 한 번에 보내는 줄들은 열 구성이 같아야 하므로(PostgREST) 두 무리로 나눠 보낸다
  const strip = ({ dl: _l, dh: _h, ...q }: Quote) => q;
  // 네이버 줄은 updated_at도 빼서, 5분 봉만 바뀐 줄이 게임의 '바뀐 줄 읽기'에 매분 끼지 않게 한다
  for (const group of [ok.filter((q) => !byNaver(q)).map(strip), ok.filter(byNaver).map((q) => (({ p: _p, t: _t, d: _d, updated_at: _u, ...r }) => r)(strip(q)))]) {
    for (let k = 0; k < group.length; k += 100) {
      await rest("seed10k_quotes?on_conflict=id", {
        method: "POST",
        headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(group.slice(k, k + 100)),
      });
    }
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
  await saveDaily(ok.filter((q) => !byNaver(q)).map((q) => ({ id: q.id, d: q.d, c: q.p, ...(q.dl != null ? { l: q.dl, h: q.dh } : {}) })));
  return { act, live, added: add.length, wanted: want.length, saved: ok.length, failed: failed.slice(0, 10), failedCount: failed.length, news, dart, divs, close, ms: Date.now() - started };
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
