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
//   게임의 한국 100종목 공시만 종목별 최근 10건씩 public.seed10k_dart에 저장한다. 처음에는 최근 7일을 채운다.

import NAMES from "./names.ts";

type Row = { id: string; ysym: string; m: string; updated_at?: string | null };
type Quote = {
  id: string; ysym: string; m: string;
  p: number; t: string; d: string;
  i: { t: number[]; c: number[] };
  updated_at: string;
};

const MIN_GAP_MS = 40_000;   // 이 간격 안에 다시 불리면 건너뛴다
const POOL = 8;              // 야후에 동시에 보내는 요청 수
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
  const path = `/v8/finance/chart/${encodeURIComponent(row.ysym)}?range=1d&interval=5m&includePrePost=false`;
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
      const cl: (number | null)[] = res.indicators?.quote?.[0]?.close || [];
      const it: number[] = [], ic: number[] = [];
      for (let k = 0; k < ts.length; k++) {
        const v = cl[k];
        if (typeof v === "number" && isFinite(v)) { it.push(ts[k]); ic.push(row.m === "FX" ? Math.round(v * 100) / 100 : rnd(v)); }
      }
      const sec = meta.regularMarketTime || (it.length ? it[it.length - 1] : Math.floor(Date.now() / 1000));
      return {
        id: row.id, ysym: row.ysym, m: row.m,
        p: row.m === "FX" ? Math.round(meta.regularMarketPrice * 100) / 100 : rnd(meta.regularMarketPrice),
        t: new Date(sec * 1000).toISOString(),
        d: localDate(tz, sec),
        i: { t: it, c: ic },
        updated_at: new Date().toISOString(),
      };
    } catch (e) { lastErr = String((e as Error).message || e); }
  }
  throw new Error(`${row.ysym}: ${lastErr}`);
}

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

/* ───── 공시 (OpenDART) ───── */
type Filing = { r: string; t: string; f: string; d: string; rm?: string };
const DART_EVERY_MS = 5 * 60_000;   // 공시를 다시 확인하는 간격
const DART_KEEP = 10;               // 종목별로 남기는 공시 수
const ymd = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms)).replaceAll("-", "");

export async function refreshDart() {
  const key = Deno.env.get("DART_API_KEY");
  if (!key) return null;
  const st: { items: { last?: string; at?: number } | null }[] = await (await rest("seed10k_dart?select=items&id=eq._state", { headers: restHeaders() })).json();
  const state = (st[0] && st[0].items) || {};
  if (state.at && Date.now() - state.at < DART_EVERY_MS) return { skipped: "5분 안에 확인함" };
  const krIds = new Map(Object.entries(NAMES).filter(([, v]) => v.m === "KR").map(([id, v]) => [v.t, id]));
  const first = !state.last;
  const bgn = ymd(Date.now() - (first ? 7 : 3) * 864e5), end = ymd(Date.now());
  const found = new Map<string, Filing[]>();
  let newest = state.last || "", pages = 0, stop = false;
  for (let p = 1; p <= (first ? 120 : 10) && !stop; p++) {
    const url = `https://opendart.fss.or.kr/api/list.json?crtfc_key=${encodeURIComponent(key)}&bgn_de=${bgn}&end_de=${end}&sort=date&sort_mth=desc&page_no=${p}&page_count=100`;
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error(`dart HTTP ${r.status}`);
    const j = await r.json();
    pages++;
    if (j.status === "013") break;                       // 조회된 데이터가 없음
    if (j.status !== "000") throw new Error(`dart ${j.status}: ${j.message}`);
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
    if (p >= Number(j.total_page || 1)) break;
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
  await rest("seed10k_quotes?on_conflict=id", {
    method: "POST",
    headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ id: "_run", ysym: "-", m: "SYS", updated_at: new Date().toISOString() }]),
  });

  // 뉴스는 시세와 따로: 실패하거나 뉴스 표가 없어도 시세 수집은 계속한다
  let news: unknown, dart: unknown;
  try { news = await refreshNews(); } catch (e) { news = { error: String((e as Error).message || e) }; }
  try { dart = await refreshDart(); } catch (e) { dart = { error: String((e as Error).message || e) }; }

  if (!act.FX) return { skipped: "장 시간이 아님", act, news, dart };

  const want = all.filter((r) => (r.m === "KR" && act.KR) || (r.m === "US" && act.US) || (r.m === "FX" && act.FX));
  const { ok, failed } = await fetchAll(want);
  for (let k = 0; k < ok.length; k += 100) {
    await rest("seed10k_quotes?on_conflict=id", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(ok.slice(k, k + 100)),
    });
  }
  // 거래일별 마지막 가격(장이 끝나면 그날 종가)도 남긴다. GitHub 수집이 며칠 멈춰도 일별 종가가 비지 않게.
  const daily = ok.map((q) => ({ id: q.id, d: q.d, c: q.p }));
  for (let k = 0; k < daily.length; k += 200) {
    await rest("seed10k_daily?on_conflict=id,d", {
      method: "POST",
      headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(daily.slice(k, k + 200)),
    });
  }
  return { act, wanted: want.length, saved: ok.length, failed: failed.slice(0, 10), failedCount: failed.length, news, dart, ms: Date.now() - started };
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
