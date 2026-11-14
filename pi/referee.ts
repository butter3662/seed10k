// SEED 10K 멀티플레이 심판 — 라즈베리파이 상시 실행판
//
// 빠른 길(기본): 사이트가 이 프로그램에 웹소켓으로 바로 붙는다.
//   사이트 ──웹소켓──> Cloudflare 임시 터널(seed10k-tunnel, https 주소) ──> 심판(여기, 8787번)
//   요청을 받으면 바로 처리해 방 안 모든 웹소켓에 새 상태를 보내고, 그 뒤에 Supabase에 저장한다.
//   터널 주소는 켤 때마다 바뀌어서, '__ref' 줄(아래 beat)에 적어 두면 사이트가 거기서 읽어 접속한다 (Supabase는 다리 역할).
//   로그인 확인은 사이트가 보낸 Supabase 로그인 토큰을 Supabase에 물어 한 번만 한다.
// 느린 길(예비): 터널이 안 될 때는 예전처럼 Supabase 표를 거친다.
//   사이트 ──요청 넣기──> seed10k_room_reqs ──실시간 알림──> 심판(여기)
//   심판 ──규칙 처리(mp_core.js)──> seed10k_rooms(모두에게 보이는 상태) / seed10k_room_priv(숨긴 상태) / seed10k_payouts(받을 돈)
//   seed10k_rooms가 바뀌면 Supabase 실시간이 방 안 모든 화면에 바로 알린다
// 모든 처리(웹소켓 요청, 표 요청, 시간 초과)는 한 줄로 차례차례 한다 (serial).
// 실시간 알림을 놓쳐도 5초마다 남은 요청을 다시 확인하고, 1초마다 시간 초과(자동 행동)를 본다.
// 10초마다 seed10k_rooms의 '__ref' 줄에 시각을 남겨, 사이트가 심판이 켜져 있는지 알 수 있게 한다.
//
// 환경 변수 (pi/.env, 시세 수집기와 같은 파일): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   NTFY_TOPIC (선택): 악용 의심 알림을 휴대폰 ntfy 앱으로도 보낸다. 남이 못 맞힐 긴 이름으로 정한다
//
// 판이 끝나면 결과를 seed10k_mp_results에 적고, 악용 의심이면 seed10k_alerts에 적는다 (관리 탭에 뜬다).
// 멀티플레이가 제한된 계정(seed10k_mp_bans)은 방을 만들거나 들어올 수 없다.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { BM } from "./bm_engine.js";
import { handle, tick, resultOf, streakOf, streakHit, newFlags, WATCH, bjLowStreak, netOf, pairFlow, pairTop } from "./mp_core.js";

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
async function save(out: { room: Room; priv: any; payouts?: any[] }, room0: Room | undefined, shown?: () => void) {
  const room = out.room;
  room.ver = (room0?.ver || 0) + 1;
  // 받을 돈을 먼저 적고 방을 고친다 (방이 '끝'으로 보이는데 돈이 없는 일이 없게)
  const pays = (out.payouts || []).map((p) => ({ ...p, code: room.code, game: room.game, mode: room.mode }));
  if (pays.length) await rest("POST", "seed10k_payouts", pays, "return=minimal");
  // 메모리를 먼저 바꾸고 웹소켓으로 바로 보낸 뒤 데이터베이스에 저장한다 (화면은 저장을 기다리지 않는다)
  if (room.status === "closed") { rooms.delete(room.code); privs.delete(room.code); }
  else { rooms.set(room.code, room); privs.set(room.code, out.priv || {}); }
  broadcast(room); shown?.();
  const row = { code: room.code, game: room.game, mode: room.mode, host: room.host, stake: room.stake, il: room.il, status: room.status, state: room.state, ver: room.ver, updated_at: new Date().toISOString() };
  await rest("POST", "seed10k_rooms?on_conflict=code", [row], "resolution=merge-duplicates,return=minimal");
  await rest("POST", "seed10k_room_priv?on_conflict=code", [{ code: room.code, priv: out.priv || {} }], "resolution=merge-duplicates,return=minimal");
  // 기록·알림은 실패해도 게임은 계속된다
  watch(room0, room, out.priv || {}, out.payouts || []).catch((e) => console.error("[seed10k-ref] 기록·알림 실패:", String((e as Error)?.message || e).slice(0, 300)));
}

/* ── 판 결과 기록과 악용 의심 알림 ── */
const NTFY = (Deno.env.get("NTFY_TOPIC") || "").trim();
async function alert(a: { kind: string; game: string; code: string; mode: string; uid?: string; other?: string; msg: string; detail?: unknown }) {
  if ((a.uid && await tester(a.uid)) || (a.other && await tester(a.other))) return;   // 테스트 계정은 anticheat 대상이 아님
  await rest("POST", "seed10k_alerts", [a], "return=minimal");
  console.log("[seed10k-ref] 알림:", a.msg);
  if (NTFY) await fetch("https://ntfy.sh/", { method: "POST", body: JSON.stringify({ topic: NTFY, title: "SEED 10K 부정행위 의심", message: a.msg, tags: ["rotating_light"] }), signal: AbortSignal.timeout(10_000) }).catch(() => {});
}
async function watch(room0: Room | undefined, room: Room, priv: any, payouts: any[] = []) {
  const nick = (i: number) => (room.state.seats[i] || {}).nick || "?";
  for (const f of newFlags(room0, room)) {
    await alert({ kind: f.kind, game: room.game, code: room.code, mode: room.mode, uid: room.state.seats[f.seat]?.uid, msg: f.msg, detail: f });
  }
  if (!(room0 && room0.status !== "over" && room.status === "over")) return;   // 판이 막 끝났을 때만 (블랙잭은 시작하자마자 끝날 수 있다)
  const res = resultOf(room);
  res.summary = { ...(res.summary || {}), net: netOf(payouts) };   // 각자의 손익: 몰아주기(두 계정 사이에 넘어간 돈) 계산용
  await rest("POST", "seed10k_mp_results", [res], "return=minimal");
  await pairWatch(room, res);
  if (room.game === "bj") await bjWatch(room, res);
  if (room.game === "bm") {   // 부루마블: 혼자 할 때처럼 판 전체 기록을 각자의 seed10k_bmlog에 남긴다
    const g = room.state.g, n = room.state.seats.length, at = new Date().toISOString();
    const standings = g.pl.map((p: any, i: number) => ({ nm: p.nm, rank: g.rank[i], out: p.out, outAt: p.outAt || 0, cash: p.cash })).sort((a: any, b: any) => a.rank - b.rank);
    await rest("POST", "seed10k_bmlog", room.state.seats.map((s: any, i: number) => ({ user_id: s.uid, at, mode: room.mode, n, stake: room.stake,
      pay: Math.round(room.stake * (BM.pay[n][g.rank[i] - 1] || 0) * 100) / 100,
      rank: g.rank[i], forfeit: !!s.left, il: room.il, rounds: g.round || 0, standings, log: (priv.rec || []).slice(-6000) })), "return=minimal");
  }
  if (room.game === "oe" && res.pair && res.winner) {   // 홀짝: 같은 상대에게 계속 이기면 (부계정이 일부러 져 주는지)
    const rows = await rest("GET", `seed10k_mp_results?game=eq.oe&pair=eq.${encodeURIComponent(res.pair)}&order=id.desc&limit=60&select=winner`) || [];
    const n = streakOf(rows);
    if (streakHit(n, WATCH.oeStreak)) {
      const w = res.win as number, l = 1 - w;
      await alert({ kind: "oe_streak", game: "oe", code: room.code, mode: room.mode, uid: res.winner, other: res.uids[l],
        msg: `홀짝 대결: ${nick(w)}이(가) 같은 상대 ${nick(l)}에게 ${n}연승 (판돈 $${room.stake}, 방 ${room.code})`, detail: { n, stake: room.stake } });
    }
  }
}
/* ── 몰아주기 ──
   ① 한도 (블랙잭 제외): 두 계정 사이에 최근 24시간 동안 블랙잭이 아닌 판에서 한쪽으로 넘어간 돈이 WATCH.pairCap($4,000) 이상이면 같은 방에 들어오거나 시작할 수 없다
   ② 승률: 같은 두 사람의 판이 WATCH.pairWinMin(10)판 이상이고, 최근 WATCH.pairWinWin(20)판에서 한쪽이 WATCH.pairWinPct(90%) 이상 앞서면 알림 (같이 한 판이 5판 늘 때마다)
   ③ 같은 기기·같은 네트워크: 접속할 때 기기 ID(사이트가 만든 무작위 값)와 IP 해시(IP 원문은 저장하지 않는다)를 적어 두고, 같은 방에 겹치는 사람이 있으면 알림 */
const DAY = 24 * 3600_000;
const pairRows = async (a: string, b: string, q: string) => await rest("GET", `seed10k_mp_results?uids=cs.%7B${a},${b}%7D&${q}`) || [];
async function pairCapHit(uids: string[]): Promise<string> {   // 한도를 넘은 두 사람이 있으면 그 설명
  for (let i = 0; i < uids.length; i++) for (let j = i + 1; j < uids.length; j++) {
    const a = uids[i], b = uids[j];
    const rows = await pairRows(a, b, `game=neq.bj&at=gte.${new Date(Date.now() - DAY).toISOString()}&select=summary`);   // 블랙잭은 한도에서 뺀다
    const f = pairFlow(rows, a, b);
    if (Math.abs(f) >= WATCH.pairCap) return `${i}:${j}:${f}`;
  }
  return "";
}
const once = new Map<string, number>();   // 같은 알림을 하루에 한 번만
const firstTime = (k: string) => { const t = once.get(k) || 0; if (Date.now() - t < DAY) return false; once.set(k, Date.now()); if (once.size > 5000) once.clear(); return true; };
async function pairWatch(room: Room, res: any) {
  const uids: string[] = res.uids, nick = (u: string) => (res.seats.find((s: any) => s.uid === u) || {}).nick || "?";
  for (let i = 0; i < uids.length; i++) for (let j = i + 1; j < uids.length; j++) {
    const a = uids[i], b = uids[j];
    const rows = await pairRows(a, b, `order=id.desc&limit=${WATCH.pairWinWin}&select=winner,summary`);
    const head = await fetch(`${BASE}/rest/v1/seed10k_mp_results?uids=cs.%7B${a},${b}%7D&select=id`, { method: "HEAD", headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, Prefer: "count=exact" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
    const total = +((head?.headers.get("content-range") || "").split("/")[1] || 0) || rows.length;
    if (total < WATCH.pairWinMin || total % 5 !== 0) continue;
    const tops = rows.map((r: any) => pairTop(r, a, b)).filter(Boolean), wa = tops.filter((x: string) => x === a).length, wb = tops.length - wa;
    const w = wa >= wb ? a : b, l = w === a ? b : a, k = Math.max(wa, wb);
    if (!tops.length || k / tops.length < WATCH.pairWinPct) continue;
    const moved = pairFlow(rows, l, w);
    await alert({ kind: "pair_win", game: room.game, code: room.code, mode: room.mode, uid: w, other: l,
      msg: `몰아주기 의심: ${nick(w)}이(가) 같은 상대 ${nick(l)}에게 최근 ${tops.length}판 중 ${k}판(${Math.round(k / tops.length * 100)}%) 앞섬, 그동안 넘어간 돈 $${moved.toFixed(2)} (같이 한 판 ${total}판, 방 ${room.code})`,
      detail: { total, win: k, n: tops.length, moved } });
  }
}
async function iphOf(req: Request): Promise<string> {   // 터널(Cloudflare)이 붙여 주는 실제 접속 IP → 해시 (원문은 저장하지 않는다)
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim();
  if (!ip) return "";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`seed10k|${KEY.slice(-24)}|${ip}`));
  return Array.from(new Uint8Array(d)).slice(0, 10).map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function linkNote(uid: string, dev: string, iph: string) {   // 이 계정이 쓴 기기·네트워크를 적어 둔다
  if (!dev && !iph) return;
  await rest("POST", "seed10k_links?on_conflict=user_id,dev,iph", [{ user_id: uid, dev: dev || "", iph: iph || "", at: new Date().toISOString() }], "resolution=merge-duplicates,return=minimal").catch(() => {});
}
async function linkWatch(room: Room) {   // 같은 방 사람들 중 기기·네트워크가 겹치는 두 계정
  const seats = room.state.seats || []; if (seats.length < 2) return;
  const ids = seats.map((s: any) => s.uid).join(",");
  const rows: any[] = await rest("GET", `seed10k_links?user_id=in.(${ids})&at=gte.${new Date(Date.now() - 30 * DAY).toISOString()}&select=user_id,dev,iph`).catch(() => []) || [];
  const nick = (u: string) => (seats.find((s: any) => s.uid === u) || {}).nick || "?";
  for (let i = 0; i < seats.length; i++) for (let j = i + 1; j < seats.length; j++) {
    const a = seats[i].uid, b = seats[j].uid, A = rows.filter((r) => r.user_id === a), B = rows.filter((r) => r.user_id === b);
    const dev = A.some((x) => x.dev && B.some((y) => y.dev === x.dev)), net = !dev && A.some((x) => x.iph && B.some((y) => y.iph === x.iph));
    if (!dev && !net) continue;
    const kind = dev ? "same_dev" : "same_net";
    if (!firstTime(`${kind}:${[a, b].sort().join(",")}`)) continue;
    await alert({ kind, game: room.game, code: room.code, mode: room.mode, uid: a, other: b,
      msg: `${dev ? "같은 기기" : "같은 네트워크(IP)"}를 쓴 두 계정이 같은 방에: ${nick(a)} · ${nick(b)} (방 ${room.code})${dev ? "" : " — 학교·집 와이파이일 수도 있음"}` });
  }
}
async function bjWatch(room: Room, res: any) {   // 블랙잭: 버스트할 수 없는 11 이하에서 직접 스탠드한 판이 이어지면
  const low = (res.summary && res.summary.low) || [];
  for (let i = 0; i < res.uids.length; i++) {
    if (!low[i]) continue;
    const uid = res.uids[i];
    const rows = await rest("GET", `seed10k_mp_results?game=eq.bj&uids=cs.%7B${encodeURIComponent(uid)}%7D&order=id.desc&limit=60&select=uids,summary`) || [];
    const n = bjLowStreak(rows, uid);
    if (streakHit(n, WATCH.bjStand)) await alert({ kind: "bj_stand", game: "bj", code: room.code, mode: room.mode, uid,
      msg: `블랙잭 대결: ${room.state.seats[i].nick}이(가) ${n}판 연속 11 이하에서 스탠드 (판돈 $${room.stake}, 방 ${room.code})`, detail: { n } });
  }
}
async function tester(uid: string) {   // 테스트 계정(돈이 줄지 않음)은 다른 계정에 돈을 넘길 수 있어 멀티에 못 들어온다
  try { const r = await rest("GET", `seed10k_testers?user_id=eq.${encodeURIComponent(uid)}&select=user_id`) || []; return r.length > 0; }
  catch { return false; }   // 표가 아직 없으면(SQL 실행 전) 막지 않는다
}
async function banned(uid: string) {
  const r = await rest("GET", `seed10k_mp_bans?user_id=eq.${encodeURIComponent(uid)}&select=user_id`) || [];
  return r.length > 0;
}

// 한 줄로 차례차례: 앞의 일이 끝나야 다음 일을 한다 (방 상태를 동시에 고치지 않게).
// 예전에는 '바쁘면 다시 하라고 표시만 하고 돌아가는' 방식이라, 시간 처리 중에 들어온 요청이 5초 확인 때까지 밀릴 수 있었다
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => {});
  return p;
}
let handled = 0, failed = 0;
// 요청 하나 처리. shown: 새 상태를 웹소켓으로 보낸 직후(데이터베이스 저장 전)에 부른다 → 누른 사람에게 결과를 먼저 알린다
async function processReq(q: any, shown?: (r: { ok: boolean; err?: string; res?: unknown }) => void) {
  let r: { ok: boolean; err?: string; res?: unknown };
  try {
    if (q.kind !== "create") await loadRoom(q.code);
    const room0 = rooms.get(q.code);
    if (q.kind === "create" || q.kind === "join" || q.kind === "again") {
      // 판돈이 걸린 요청이 60초 넘게 늦게 도착하면 처리하지 않는다 (사이트는 90초 뒤 방에 자리가 없으면 판돈을 돌려준다 → 돌려준 뒤에 방이 생기지 않게)
      const at = Date.parse(q.at || "");
      if (at && Date.now() - at > 60_000) { r = { ok: false, err: "요청이 너무 늦게 도착해 처리하지 않았습니다. 판돈은 곧 돌려받습니다" }; shown?.(r); return r; }
      const why = await banned(q.user_id) ? "부정행위로 멀티플레이가 제한된 계정입니다" : await tester(q.user_id) ? "테스트 계정은 멀티플레이를 할 수 없습니다" : "";
      if (why) { handled++; r = { ok: false, err: why }; shown?.(r); return r; }
      await linkNote(q.user_id, q.dev || "", q.iph || "");
    }
    // 몰아주기 한도: 들어올 때(들어올 사람과 이미 앉은 사람들), 시작할 때(앉은 사람 모두) 확인한다
    if ((q.kind === "join" || q.kind === "start") && room0 && room0.status === "lobby" && room0.game !== "bj") {
      const uids = room0.state.seats.map((s: any) => s.uid).filter((u: string) => q.kind === "start" || u !== q.user_id);
      if (q.kind === "join" && !uids.includes(q.user_id)) uids.push(q.user_id);
      const hit = await pairCapHit(uids);
      if (hit) {
        const [i, j] = hit.split(":").map(Number), nk = (u: string) => (room0.state.seats.find((s: any) => s.uid === u) || {}).nick || "새로 들어온 사람";
        const a = uids[i], b = uids[j];
        if (firstTime(`cap:${[a, b].sort().join(",")}`)) await alert({ kind: "pair_cap", game: room0.game, code: room0.code, mode: room0.mode, uid: a, other: b,
          msg: `몰아주기 한도: ${nk(a)} · ${nk(b)} 사이에 24시간 동안 $${Math.abs(+hit.split(":")[2]).toFixed(2)}가 한쪽으로 넘어가 같은 방을 막음 (한도 $${WATCH.pairCap}, 방 ${room0.code})` });
        handled++; r = { ok: false, err: `같이 할 수 없습니다: 최근 24시간 동안 두 사람 사이에 넘어간 돈이 한도($${WATCH.pairCap.toLocaleString()})를 넘었습니다` }; shown?.(r); return r;
      }
    }
    const out = handle(room0 || null, privs.get(q.code) || {}, q, Date.now(), Math.random);
    handled++;
    if (out.err) { r = { ok: false, err: out.err }; shown?.(r); return r; }
    r = { ok: true, res: out.res || {} };
    if (out.room) await save(out as any, room0, () => shown?.(r));
    if (out.room && (q.kind === "join" || q.kind === "start")) linkWatch(out.room).catch(() => {});
    else shown?.(r);
    return r;
  } catch (e) {
    failed++;
    console.error("[seed10k-ref] 요청 처리 실패", q.id, q.kind, e);
    r = { ok: false, err: "서버 오류로 처리하지 못했습니다. 다시 시도하세요" };
    shown?.(r);
    return r;
  }
}
// 느린 길: Supabase 표에 들어온 요청
let workQueued = false;
function work() {
  if (workQueued) return chain;
  workQueued = true;
  return serial(async () => {
    workQueued = false;
    try {
      const reqs = await rest("GET", "seed10k_room_reqs?done=eq.false&order=id.asc&limit=100&select=*") || [];
      for (const q of reqs) {
        const r = await processReq(q);
        await rest("PATCH", `seed10k_room_reqs?id=eq.${q.id}`, { done: true, ok: r.ok, err: r.err ?? null, res: r.ok ? r.res : null }, "return=minimal");
      }
    } catch (e) { console.error("[seed10k-ref] 요청 확인 실패:", String((e as Error)?.message || e).slice(0, 300)); }
  });
}
function ticks() {
  return serial(async () => {
    try {
      for (const [code, room] of [...rooms]) {
        const out = tick(room, privs.get(code) || {}, Date.now(), Math.random);
        if (out && out.room) await save(out as any, room);
      }
    } catch (e) { console.error("[seed10k-ref] 시간 처리 실패:", String((e as Error)?.message || e).slice(0, 300)); }
  });
}

/* ── 빠른 길: 웹소켓 ──
   사이트 → {t:'auth', token} → {t:'auth', ok}
          → {t:'sub', code}  방 구독 (지금 상태를 바로 받는다)
          → {t:'req', id, code, kind, arg} → {t:'res', id, ok, err, res}
          → {t:'chat', code, id, text, nick}  방 채팅 (앉은 사람과 관전자, 0.6초에 한 번, 60자)
   심판 → {t:'room', row}  구독한 방이 바뀔 때마다 (seed10k_rooms 한 줄과 같은 모양)
        → {t:'chat', code, id, seat, nick, text, v:true}  서버가 보낸 사람을 확인한 채팅 */
type Sock = { ws: WebSocket; uid: string | null; codes: Set<string>; chatAt?: number; dev?: string; iph?: string };
const socks = new Set<Sock>();
const roomRow = (room: Room) => ({ code: room.code, game: room.game, mode: room.mode, host: room.host, stake: room.stake, il: room.il, status: room.status, state: room.state, ver: room.ver, updated_at: new Date().toISOString() });
function broadcast(room: Room) {
  let msg = "";
  for (const k of socks) {
    if (!k.codes.has(room.code) || k.ws.readyState !== WebSocket.OPEN) continue;
    if (!msg) msg = JSON.stringify({ t: "room", row: roomRow(room) });
    try { k.ws.send(msg); } catch { /* 끊긴 연결 */ }
  }
}
const send = (k: Sock, m: unknown) => { if (k.ws.readyState === WebSocket.OPEN) try { k.ws.send(JSON.stringify(m)); } catch { /* */ } };
async function whoIs(token: string): Promise<string | null> {   // Supabase 로그인 토큰 → 계정 id
  try {
    const r = await fetch(`${BASE}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return null;
    const u = await r.json();
    return typeof u?.id === "string" ? u.id : null;
  } catch { return null; }
}
let wsReq = 0;
function onSock(ws: WebSocket, iph = "") {
  const k: Sock = { ws, uid: null, codes: new Set(), iph };
  ws.onopen = () => socks.add(k);
  ws.onclose = () => socks.delete(k);
  ws.onerror = () => socks.delete(k);
  ws.onmessage = async (e) => {
    let m: any;
    try { if (typeof e.data !== "string" || e.data.length > 20_000) return; m = JSON.parse(e.data); } catch { return; }
    if (m.t === "ping") return send(k, { t: "pong" });
    if (m.t === "auth") { k.uid = typeof m.token === "string" ? await whoIs(m.token) : null; k.dev = typeof m.dev === "string" && /^[a-z0-9]{8,40}$/.test(m.dev) ? m.dev : ""; return send(k, { t: "auth", ok: !!k.uid }); }
    if (!k.uid) return send(k, { t: "res", id: m.id, ok: false, err: "로그인 확인이 안 됐습니다" });
    if (m.t === "sub" && typeof m.code === "string" && /^[A-Z0-9]{6}$/.test(m.code)) {
      if (k.codes.size > 20) k.codes.clear();
      k.codes.add(m.code);
      await serial(() => loadRoom(m.code)).catch(() => {});
      const room = rooms.get(m.code);
      if (room) send(k, { t: "room", row: roomRow(room) });
      return;
    }
    if (m.t === "chat" && typeof m.code === "string" && typeof m.text === "string") {   // 방 채팅: 저장하지 않고 방 안에만 보낸다
      const now = Date.now();
      if (now - (k.chatAt || 0) < 600) return;
      k.chatAt = now;
      const room = rooms.get(m.code); if (!room) return;
      const seat = room.state.seats.findIndex((x: any) => x.uid === k.uid);   // -1이면 관전자 (이름은 보낸 사람이 적은 것)
      const text = m.text.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 60); if (!text) return;
      const id = typeof m.id === "string" && /^[a-z0-9]{4,20}$/.test(m.id) ? m.id : now.toString(36);
      const nick = seat >= 0 ? room.state.seats[seat].nick : String(m.nick || "관전자").replace(/[<>]/g, "").slice(0, 16);
      const msg = JSON.stringify({ t: "chat", code: m.code, id, seat, nick, text, v: seat >= 0, spec: seat < 0 });
      for (const o of socks) if (o.codes.has(m.code) && o.ws.readyState === WebSocket.OPEN) try { o.ws.send(msg); } catch { /* */ }
      return;
    }
    if (m.t === "req" && typeof m.code === "string" && typeof m.kind === "string") {
      const q = { id: `ws${++wsReq}`, user_id: k.uid, code: m.code, kind: m.kind, arg: m.arg && typeof m.arg === "object" ? m.arg : {}, at: new Date().toISOString(), dev: k.dev || "", iph: k.iph || "" };
      k.codes.add(m.code);
      let sent = false;
      const reply = (r: any) => { if (sent) return; sent = true; send(k, { t: "res", id: m.id, ok: r.ok, err: r.err, res: r.res }); };
      const r = await serial(() => processReq(q, reply));
      reply(r);
    }
  };
  return k;
}
const PORT = 8787;
Deno.serve({ port: PORT, hostname: "0.0.0.0", onListen: () => console.log(`[seed10k-ref] 웹소켓 대기: ${PORT}번`) }, (req) => {
  const u = new URL(req.url);
  if (u.pathname === "/ws" && req.headers.get("upgrade")?.toLowerCase() === "websocket") {
    const { socket, response } = Deno.upgradeWebSocket(req, { idleTimeout: 60 });
    const k = onSock(socket);
    iphOf(req).then((h) => { k.iph = h; }).catch(() => {});
    return response;
  }
  return new Response("seed10k referee", { headers: { "access-control-allow-origin": "*" } });
});
// Cloudflare 임시 터널의 주소를 알아낸다 (seed10k-tunnel 컨테이너의 metrics 서버). 바뀌면 바로 '__ref'에 적는다
const TUNNEL = Deno.env.get("SEED10K_TUNNEL_METRICS") || "http://seed10k-tunnel:2000";
let WS_URL = "";
async function tunnel() {
  let host = "";
  try {
    const r = await fetch(`${TUNNEL}/quicktunnel`, { signal: AbortSignal.timeout(5_000) });
    if (r.ok) host = String((await r.json())?.hostname || "");
  } catch { /* 터널이 아직 안 켜짐 */ }
  const url = /^[a-z0-9-]+\.trycloudflare\.com$/.test(host) ? `wss://${host}/ws` : "";
  if (url !== WS_URL) { WS_URL = url; console.log("[seed10k-ref] 터널 주소:", url || "(없음 → Supabase 길만)"); await beat().catch(() => {}); }
}
// 지금 돌고 있는 코드의 커밋 (관리 탭에 보인다). 저장소가 /app에 읽기 전용으로 붙어 있다
function commit(): string {
  try {
    const head = Deno.readTextFileSync("/app/.git/HEAD").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 7);
    const ref = head.slice(5);
    try { return Deno.readTextFileSync(`/app/.git/${ref}`).trim().slice(0, 7); }
    catch { const line = Deno.readTextFileSync("/app/.git/packed-refs").split("\n").find((l) => l.endsWith(" " + ref)); return line ? line.slice(0, 7) : "?"; }
  } catch { return "?"; }
}
const STARTED = Date.now(), VER = commit();
async function beat() {
  await rest("POST", "seed10k_rooms?on_conflict=code", [{ code: "__ref", game: "-", mode: "-", status: "sys", state: { at: Date.now(), rooms: rooms.size, ver: VER, started: STARTED, ws: WS_URL, socks: socks.size }, updated_at: new Date().toISOString() }], "resolution=merge-duplicates,return=minimal");
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

await tunnel(); await work(); await beat().catch(() => {});
setInterval(() => tunnel().catch(() => {}), 15_000);                 // 터널이 다시 켜져 주소가 바뀌면 알아챈다
setInterval(work, 5_000);                                             // 실시간을 놓쳤을 때를 위한 확인
setInterval(ticks, 1_000);                                            // 시간 초과 → 자동 행동
setInterval(() => beat().catch((e) => console.error("[seed10k-ref] 신호 실패:", e.message)), 10_000);
setInterval(() => cleanup().catch(() => {}), 60 * 60_000);
setInterval(() => { console.log(`[seed10k-ref] 최근 10분: 요청 ${handled}건 처리, 실패 ${failed}건, 진행 중인 방 ${rooms.size}개, 웹소켓 ${socks.size}개`); handled = 0; failed = 0; }, 10 * 60_000);
