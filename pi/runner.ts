// SEED 10K 시세 수집기 — 라즈베리파이 상시 실행판
//
// Supabase Edge Function(supabase/functions/seed10k-quotes/index.ts)과 똑같은 run()을
// 파이에서 7초마다 직접 돌린다. 코드가 하나라서 두 곳의 동작이 어긋나지 않는다.
//
// 이중화(파이가 주, Supabase가 예비):
// - 파이는 run()이 성공할 때마다 seed10k_quotes의 _beatPi 줄에 시각을 남긴다.
// - Supabase Cron(supabase/seed10k_pi_backup.sql)은 7초마다 이 시각만 확인하고,
//   30초 넘게 멈춰 있을 때만 Edge Function을 부른다. 파이가 살아 있으면 함수 호출은 0회다.
// - 두 곳이 겹쳐 돌아도 run() 안의 _fast(4초)·_run(55초) 표시가 같은 작업이 겹치지 않게 막는다.
//
// 필요한 환경 변수 (pi/.env, GitHub에 올리지 않는다):
//   SUPABASE_URL                 https://<프로젝트>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY    Supabase 비밀 키 (sb_secret_... 또는 예전 service_role JWT)
//   NAVER_CLIENT_ID / NAVER_CLIENT_SECRET   (선택) 한국어 뉴스. Edge Function 비밀값과 같은 값
//   DART_API_KEY                 (선택) 공시. Edge Function 비밀값과 같은 값
//   SEED10K_NO_SERVE=1           index.ts가 HTTP 서버를 열지 않게 한다 (docker-compose.yml이 넣어 준다)

import { run } from "../supabase/functions/seed10k-quotes/index.ts";

const EVERY_MS = 7_000;          // 실행 간격 (네이버 실시간 시세의 pollingInterval과 같다)
const STALL_MS = 90_000;         // 한 번의 실행이 이보다 오래 걸리면 멈춘 것으로 보고 프로세스를 끝낸다 (Docker가 다시 켠다)
const REPORT_EVERY_MS = 10 * 60_000;

const BASE = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!BASE || !KEY) {
  console.error("[seed10k-pi] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. pi/.env를 확인하세요.");
  Deno.exit(1);
}
if (!Deno.env.get("NAVER_CLIENT_ID") || !Deno.env.get("NAVER_CLIENT_SECRET")) {
  console.warn("[seed10k-pi] 네이버 뉴스 키가 없어 한국어 뉴스는 받지 않습니다 (Edge Function에 키를 넣어 두었다면 pi/.env에도 넣으세요).");
}

const headers: Record<string, string> = {
  apikey: KEY,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=minimal",
  ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}),
};

/* 파이가 살아 있다는 신호. Supabase 예비 일정은 이 시각만 본다 */
async function beatPi() {
  const r = await fetch(`${BASE}/rest/v1/seed10k_quotes?on_conflict=id`, {
    method: "POST",
    headers,
    body: JSON.stringify([{ id: "_beatPi", ysym: "-", m: "SYS", updated_at: new Date().toISOString() }]),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`_beatPi HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  await r.body?.cancel();
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
let runs = 0, fails = 0, lastReport = Date.now(), lastErr = "";

console.log(`[seed10k-pi] 시작: ${EVERY_MS / 1000}초마다 시세 수집 → ${BASE}`);

while (true) {
  const t0 = Date.now();
  const watchdog = setTimeout(() => {
    console.error(`[seed10k-pi] 한 번의 실행이 ${STALL_MS / 1000}초를 넘었습니다. 다시 시작합니다.`);
    Deno.exit(2);
  }, STALL_MS);
  try {
    // 1분 작업(야후 5분 봉, 뉴스, 공시, 배당)은 배경에서 돌리고, 7초 작업만 기다린다
    await run(new Date(), (p) => { p.catch((e) => console.error("[seed10k-pi] 1분 작업 실패:", e)); });
    // 성공했을 때만 신호를 남긴다. 계속 실패하면 30초 뒤 Supabase가 대신 수집한다
    await beatPi();
    runs++;
  } catch (e) {
    fails++;
    lastErr = String((e as Error)?.message || e).slice(0, 300);
    console.error("[seed10k-pi] 실행 실패:", lastErr);
  } finally {
    clearTimeout(watchdog);
  }
  if (Date.now() - lastReport >= REPORT_EVERY_MS) {
    console.log(`[seed10k-pi] 최근 ${REPORT_EVERY_MS / 60_000}분: 성공 ${runs}회, 실패 ${fails}회${fails ? " (마지막 오류: " + lastErr + ")" : ""}`);
    runs = 0; fails = 0; lastReport = Date.now();
  }
  await sleep(Math.max(1_000, EVERY_MS - (Date.now() - t0)));
}
