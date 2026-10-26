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
  if (!act.FX) return { skipped: "장 시간이 아님", act };

  const all: Row[] = await (await rest("seed10k_quotes?select=id,ysym,m,updated_at", { headers: restHeaders() })).json();
  const mark = all.find((r) => r.id === "_run");
  if (mark?.updated_at && Date.now() - Date.parse(mark.updated_at) < MIN_GAP_MS) return { skipped: "방금 실행됨", act };
  await rest("seed10k_quotes?on_conflict=id", {
    method: "POST",
    headers: restHeaders({ Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify([{ id: "_run", ysym: "-", m: "SYS", updated_at: new Date().toISOString() }]),
  });

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
  return { act, wanted: want.length, saved: ok.length, failed: failed.slice(0, 10), failedCount: failed.length, ms: Date.now() - started };
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
