// SEED 10K 멀티플레이 심판 — 라즈베리파이 상시 실행판
//
// 사이트는 Supabase하고만 통신하고, 이 프로그램도 Supabase로 '나가는' 연결만 쓴다 (포트를 열지 않는다).
//   사이트 ──요청 넣기──> seed10k_room_reqs ──실시간 알림──> 심판(여기)
//   심판 ──규칙 처리(mp_core.js)──> seed10k_rooms(모두에게 보이는 상태) / seed10k_room_priv(숨긴 상태) / seed10k_payouts(받을 돈)
//   seed10k_rooms가 바뀌면 Supabase 실시간이 방 안 모든 화면에 바로 알린다
// 실시간 알림을 놓쳐도 5초마다 남은 요청을 다시 확인하고, 1초마다 시간 초과(자동 행동)를 본다.
// 10초마다 seed10k_rooms의 '__ref' 줄에 시각을 남겨, 사이트가 심판이 켜져 있는지 알 수 있게 한다.
//
// 환경 변수 (pi/.env, 시세 수집기와 같은 파일): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { handle, tick } from "./mp_core.js";

const BASE = (Deno.env.get("SUPABASE_URL") || "").replace(/\/+$/, "");
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!BASE || !KEY) { console.error("[seed10k-ref] SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 없습니다. pi/.env를 확인하세요."); Deno.exit(1); }

const H: Record<string, string> = { apikey: KEY, "Content-Type": "application/json", ...(KEY.startsWith("eyJ") ? { Authorization: `Bearer ${KEY}` } : {}) };
async function rest(method: string, path: string, body?: unknown, prefer?: string) {
  const r = await fetch(`${BASE}/rest/v1/${path}`, {
    method, headers: { ...H, ...(prefer ? { Prefer: prefer } : {}) }, body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) throw new Error(`${method} ${path.split("?")[0]} HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}

// 진행 중인 방은 메모리에도 둔다 (심판은 하나뿐이라 메모리가 기준, 데이터베이스는 저장용)
type Room = { code: string; game: string; mode: string; host: string; stake: number; il: boolean; status: string; state: any; ver?: number };
const rooms = new Map<string, Room>(), privs = new Map<string, any>();
async function loadRoom(code: string) {
  if (rooms.has(code)) return;
  const [r] = await rest("GET", `seed10k_rooms?code=eq.${encodeURIComponent(code)}&select=*`) || [];
  if (!r) return;
  rooms.set(code, r);
  const [p] = await rest("GET", `seed10k_room_priv?code=eq.${encodeURIComponent(code)}&select=priv`) || [];
  privs.set(code, p ? p.priv : {});
}
async function save(out: { room: Room; priv: any; payouts?: any[] }, room0: Room | undefined) {
  const room = out.room;
  room.ver = (room0?.ver || 0) + 1;
  // 받을 돈을 먼저 적고 방을 고친다 (방이 '끝'으로 보이는데 돈이 없는 일이 없게)
  const pays = (out.payouts || []).map((p) => ({ ...p, code: room.code, game: room.game, mode: room.mode }));
  if (pays.length) await rest("POST", "seed10k_payouts", pays, "return=minimal");
  const row = { code: room.code, game: room.game, mode: room.mode, host: room.host, stake: room.stake, il: room.il, status: room.status, state: room.state, ver: room.ver, updated_at: new Date().toISOString() };
  await rest("POST", "seed10k_rooms?on_conflict=code", [row], "resolution=merge-duplicates,return=minimal");
  await rest("POST", "seed10k_room_priv?on_conflict=code", [{ code: room.code, priv: out.priv || {} }], "resolution=merge-duplicates,return=minimal");
  if (room.status === "closed") { rooms.delete(room.code); privs.delete(room.code); }
  else { rooms.set(room.code, room); privs.set(room.code, out.priv || {}); }
}

let busy = false, again = false, handled = 0, failed = 0;
async function work() {
  if (busy) { again = true; return; }
  busy = true;
  try {
    do {
      again = false;
      const reqs = await rest("GET", "seed10k_room_reqs?done=eq.false&order=id.asc&limit=100&select=*") || [];
      for (const q of reqs) {
        let patch: Record<string, unknown>;
        try {
          if (q.kind !== "create") await loadRoom(q.code);
          const room0 = rooms.get(q.code);
          const out = handle(room0 || null, privs.get(q.code) || {}, q, Date.now(), Math.random);
          if (out.err) patch = { done: true, ok: false, err: out.err };
          else { if (out.room) await save(out as any, room0); patch = { done: true, ok: true, res: out.res || {} }; }
          handled++;
        } catch (e) {
          failed++;
          console.error("[seed10k-ref] 요청 처리 실패", q.id, q.kind, e);
          patch = { done: true, ok: false, err: "서버 오류로 처리하지 못했습니다. 다시 시도하세요" };
        }
        await rest("PATCH", `seed10k_room_reqs?id=eq.${q.id}`, patch, "return=minimal");
      }
    } while (again);
  } catch (e) { console.error("[seed10k-ref] 요청 확인 실패:", String((e as Error)?.message || e).slice(0, 300)); }
  finally { busy = false; }
}
async function ticks() {
  if (busy) return;
  busy = true;
  try {
    for (const [code, room] of [...rooms]) {
      const out = tick(room, privs.get(code) || {}, Date.now(), Math.random);
      if (out && out.room) await save(out as any, room);
    }
  } catch (e) { console.error("[seed10k-ref] 시간 처리 실패:", String((e as Error)?.message || e).slice(0, 300)); }
  finally { busy = false; }
}
async function beat() {
  await rest("POST", "seed10k_rooms?on_conflict=code", [{ code: "__ref", game: "-", mode: "-", status: "sys", state: { at: Date.now(), rooms: rooms.size }, updated_at: new Date().toISOString() }], "resolution=merge-duplicates,return=minimal");
}
async function cleanup() {   // 하루 지난 처리된 요청과 닫힌 방을 지운다
  const day = new Date(Date.now() - 864e5).toISOString();
  await rest("DELETE", `seed10k_room_reqs?done=eq.true&at=lt.${day}`, undefined, "return=minimal");
  await rest("DELETE", `seed10k_rooms?status=eq.closed&updated_at=lt.${day}`, undefined, "return=minimal");
}

// 시작: 진행 중인 방을 불러온다
for (const r of await rest("GET", "seed10k_rooms?status=in.(lobby,play,over)&select=*") || []) rooms.set(r.code, r);
if (rooms.size) for (const p of await rest("GET", `seed10k_room_priv?code=in.(${[...rooms.keys()].map(encodeURIComponent).join(",")})&select=code,priv`) || []) privs.set(p.code, p.priv);
console.log(`[seed10k-ref] 시작: 진행 중인 방 ${rooms.size}개 → ${BASE}`);

// 실시간: 요청이 들어오면 바로 처리
const sb = createClient(BASE, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
sb.channel("seed10k-ref").on("postgres_changes", { event: "INSERT", schema: "public", table: "seed10k_room_reqs" }, () => work())
  .subscribe((s: string) => console.log("[seed10k-ref] 실시간 연결:", s));

await work(); await beat().catch(() => {});
setInterval(work, 5_000);                                             // 실시간을 놓쳤을 때를 위한 확인
setInterval(ticks, 1_000);                                            // 시간 초과 → 자동 행동
setInterval(() => beat().catch((e) => console.error("[seed10k-ref] 신호 실패:", e.message)), 10_000);
setInterval(() => cleanup().catch(() => {}), 60 * 60_000);
setInterval(() => { console.log(`[seed10k-ref] 최근 10분: 요청 ${handled}건 처리, 실패 ${failed}건, 진행 중인 방 ${rooms.size}개`); handled = 0; failed = 0; }, 10 * 60_000);
