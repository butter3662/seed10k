// SEED 10K 멀티플레이 규칙 — 라즈베리파이 심판(referee.ts)과 시험이 같이 쓰는 순수 코드 (외부 의존 없음)
//
// handle(room, priv, req, now, rnd)  요청 하나를 처리한다
// tick(room, priv, now, rnd)         시간 초과(자동 행동), 오래된 대기실 정리
// 둘 다 {room, priv, payouts, res} 또는 {err}를 돌려준다. room이 null이면 방을 지운 것이 아니라 바뀐 것이 없다는 뜻
//
// room: {code, game, mode, host, stake, il, status, state}
//   status: lobby(대기) → play(진행) → over(끝) / closed(닫힘)
//   state.seats: [{uid, nick}]  자리 순서 = 차례 순서
//   state.ev: {seq, ...}       화면이 연출할 마지막 사건 (seq가 바뀌면 새 사건)
// payouts: [{user_id, amount, cost, il, note}]  끝나거나 환불할 때 각자 받을 돈 (사이트가 '받기'로 가져간다)

export const LIMITS = {   // 사이트의 GAM과 같다 (판돈 한도: 평소 off, 불법 모드 on)
  oe: {nm: "홀짝", min: 1, off: 10, on: 100, minP: 2, maxP: 2},
  sl: {nm: "뱀사다리", min: 5, off: 50, on: 500, minP: 2, maxP: 4},
  bj: {nm: "블랙잭", min: 5, off: 100, on: 1000, minP: 1, maxP: 5},
  bm: {nm: "주사위 세계여행", min: 10, off: 100, on: 1000, minP: 2, maxP: 4},
};
export const LOBBY_IDLE_MS = 20 * 60_000;   // 대기실에서 20분 동안 아무 일도 없으면 닫고 판돈을 돌려준다
export const OVER_KEEP_MS = 30 * 60_000;    // 끝난 방은 30분 뒤 닫는다
const GAMES = {};                           // 게임별 규칙 (아래에서 등록)

const r2 = (x) => Math.round(x * 100) / 100;
const clone = (x) => JSON.parse(JSON.stringify(x));
const seatOf = (room, uid) => room.state.seats.findIndex((s) => s.uid === uid);
const nick = (s) => String(s || "").replace(/[<>]/g, "").slice(0, 16) || "플레이어";
function bump(room, ev) { const st = room.state; st.seq = (st.seq || 0) + 1; if (ev) st.ev = {seq: st.seq, ...ev}; }
function refundAll(room, note) {
  return room.state.seats.map((s) => ({user_id: s.uid, amount: room.stake, cost: room.stake, il: false, note}));
}
export function gameOf(k) { return GAMES[k]; }

export function handle(room0, priv0, req, now = Date.now(), rnd = Math.random) {
  const a = req.arg || {}, uid = req.user_id;
  if (req.kind === "create") {
    if (room0) return {err: "이미 있는 방 코드입니다. 다시 만들어 주세요"};
    const L = LIMITS[a.game];
    if (!L || !GAMES[a.game]) return {err: "모르는 게임입니다"};
    if (!/^[A-Z0-9]{6}$/.test(req.code)) return {err: "방 코드가 잘못됐습니다"};
    if (a.mode !== "live" && a.mode !== "sim") return {err: "모드가 잘못됐습니다"};
    const stake = r2(+a.stake);
    const max = a.il ? L.on : L.off;
    if (!(stake >= L.min && stake <= max)) return {err: `판돈은 $${L.min}~$${max}입니다`};
    const maxP = Math.max(L.minP, Math.min(L.maxP, Math.floor(+a.maxP || L.maxP)));
    const room = {code: req.code, game: a.game, mode: a.mode, host: uid, stake, il: !!a.il, status: "lobby",
      state: {seats: [{uid, nick: nick(a.nick)}], maxP, seq: 0, at: now}};
    bump(room, {t: "join", who: 0});
    return {room, priv: {}, payouts: [], res: {code: req.code}};
  }
  if (!room0) return {err: "없는 방 코드입니다"};
  if (room0.status === "closed") return {err: "닫힌 방입니다"};
  const room = clone(room0), priv = clone(priv0 || {}), st = room.state, G = GAMES[room.game];
  let me = seatOf(room, uid);
  st.at = now;
  switch (req.kind) {
    case "join": {
      if (me >= 0) return {room: null, res: {seat: me}};                         // 이미 들어와 있음
      if (room.status !== "lobby") return {err: "이미 시작한 방입니다"};
      if (a.mode !== room.mode) return {err: `이 방은 ${room.mode === "live" ? "실제 시세" : "시뮬레이션"} 모드 방입니다`};
      if (room.il && !a.il) return {err: "불법 모드 방입니다. 불법 모드를 켜고 들어오세요"};
      if (st.seats.length >= st.maxP) return {err: "방이 가득 찼습니다"};
      st.seats.push({uid, nick: nick(a.nick)});
      bump(room, {t: "join", who: st.seats.length - 1});
      return {room, priv, payouts: [], res: {seat: st.seats.length - 1}};
    }
    case "leave": {
      if (me < 0) return {room: null, res: {}};
      if (room.status === "lobby") {
        if (uid === room.host) {                                                  // 방장이 나가면 닫고 모두 환불
          const p = refundAll(room, "방이 닫혀 판돈 환불");
          room.status = "closed"; bump(room, {t: "closed"});
          return {room, priv, payouts: p, res: {}};
        }
        st.seats.splice(me, 1); bump(room, {t: "leave"});
        return {room, priv, payouts: [{user_id: uid, amount: room.stake, cost: room.stake, il: false, note: "대기실에서 나가 판돈 환불"}], res: {}};
      }
      if (room.status === "play") {                                                // 진행 중에 나가면 게임 규칙대로 기권
        st.seats[me].left = true;
        const out = G.forfeit(room, priv, me, now, rnd);
        bump(room, {t: "left", who: me});
        return {room, priv, payouts: out || [], res: {}};
      }
      st.seats[me].left = true; bump(room);
      return {room, priv, payouts: [], res: {}};
    }
    case "start": {
      if (uid !== room.host) return {err: "방장만 시작할 수 있습니다"};
      if (room.status !== "lobby") return {err: "이미 시작했습니다"};
      const L = LIMITS[room.game];
      if (st.seats.length < L.minP) return {err: `${L.minP}명 이상 있어야 시작할 수 있습니다`};
      room.status = "play";
      G.init(room, priv, now, rnd);
      bump(room, {t: "start"});
      return {room, priv, payouts: [], res: {}};
    }
    case "act": {
      if (room.status !== "play") return {err: "진행 중인 판이 아닙니다"};
      if (me < 0) return {err: "이 방의 플레이어가 아닙니다"};
      const r = G.act(room, priv, me, a, now, rnd);
      if (r && r.err) return {err: r.err};
      return {room, priv, payouts: (r && r.payouts) || [], res: (r && r.res) || {}};
    }
    case "again": {                                                               // 같은 방에서 한 판 더 (방장이 먼저 판돈을 낸다)
      if (uid !== room.host) return {err: "방장만 다시 열 수 있습니다"};
      if (room.status !== "over") return {err: "판이 끝난 뒤에 다시 열 수 있습니다"};
      if (a.il !== undefined && !!a.il !== room.il) return {err: "불법 모드 설정이 방과 다릅니다"};
      room.status = "lobby";
      room.state = {seats: [st.seats[me]], maxP: st.maxP, seq: st.seq, at: now, prev: G.summary ? G.summary(room) : null};
      for (const k of Object.keys(priv)) delete priv[k];
      bump(room, {t: "again"});
      return {room, priv, payouts: [], res: {}};
    }
  }
  return {err: "모르는 요청입니다"};
}

export function tick(room0, priv0, now = Date.now(), rnd = Math.random) {
  if (!room0 || room0.status === "closed" || room0.status === "sys") return null;
  const idle = now - (room0.state.at || 0);
  if (room0.status === "lobby" && idle > LOBBY_IDLE_MS) {
    const room = clone(room0); room.status = "closed"; bump(room, {t: "closed"});
    return {room, priv: priv0, payouts: refundAll(room, "대기실이 오래 비어 판돈 환불")};
  }
  if (room0.status === "over" && idle > OVER_KEEP_MS) {
    const room = clone(room0); room.status = "closed"; bump(room, {t: "closed"});
    return {room, priv: priv0, payouts: []};
  }
  if (room0.status === "play" && room0.state.deadline && now >= room0.state.deadline) {
    const room = clone(room0), priv = clone(priv0 || {});
    const r = GAMES[room.game].auto(room, priv, now, rnd);
    return {room, priv, payouts: (r && r.payouts) || []};
  }
  return null;
}

/* ───────── 홀짝 대결 (2명) ─────────
   한 판(라운드)마다 한 명이 구슬을 1~20개 쥐고(숨김), 다른 한 명이 홀/짝을 고른다.
   맞히면 고른 사람이, 틀리면 쥔 사람이 1점. 먼저 3점이면 이겨서 두 사람 판돈(2배)을 가져간다. 쥐는 사람은 판마다 바뀐다.
   쥐는 시간 30초, 고르는 시간 30초. 시간이 지나면 무작위로 대신 한다 */
const OE_WIN = 3, OE_HIDE_MS = 30_000, OE_GUESS_MS = 30_000;
GAMES.oe = {
  init(room, priv, now) {
    room.state.g = {score: [0, 0], round: 1, hider: 0, phase: "hide", last: null};
    room.state.deadline = now + OE_HIDE_MS;
    priv.n = null;
  },
  act(room, priv, me, a, now) {
    const g = room.state.g, guesser = 1 - g.hider;
    if (g.phase === "hide") {
      if (me !== g.hider) return {err: "지금은 상대가 구슬을 쥐는 차례입니다"};
      const n = Math.floor(+a.n);
      if (!(n >= 1 && n <= 20)) return {err: "1~20개 중에서 쥐세요"};
      priv.n = n; g.phase = "guess"; room.state.deadline = now + OE_GUESS_MS;
      bump(room, {t: "oe_hid", who: me});
      return {};
    }
    if (me !== guesser) return {err: "지금은 상대가 고르는 차례입니다"};
    if (a.pick !== "odd" && a.pick !== "even") return {err: "홀이나 짝을 고르세요"};
    return GAMES.oe.resolve(room, priv, a.pick, now);
  },
  resolve(room, priv, pick, now) {
    const st = room.state, g = st.g, guesser = 1 - g.hider, n = priv.n;
    const ok = (n % 2 === 1) === (pick === "odd");
    const pt = ok ? guesser : g.hider;
    g.score[pt]++;
    g.last = {round: g.round, n, pick, ok, hider: g.hider, guesser, pt};
    bump(room, {t: "oe_reveal", ...g.last});
    priv.n = null;
    if (g.score[pt] >= OE_WIN) return GAMES.oe.finish(room, pt, "3점 먼저");
    g.round++; g.hider = 1 - g.hider; g.phase = "hide"; st.deadline = now + OE_HIDE_MS;
    return {};
  },
  finish(room, win, why) {
    const st = room.state;
    room.status = "over"; st.deadline = null; st.g.phase = "over"; st.g.win = win; st.g.why = why;
    return {payouts: st.seats.map((s, i) => ({user_id: s.uid, amount: i === win ? r2(room.stake * 2) : 0, cost: room.stake, il: room.il,
      note: `홀짝 대결 ${i === win ? "승" : "패"} (${st.g.score[0]}:${st.g.score[1]})`}))};
  },
  auto(room, priv, now, rnd) {
    const g = room.state.g;
    if (g.phase === "hide") { priv.n = 1 + Math.floor(rnd() * 20); g.phase = "guess"; room.state.deadline = now + OE_GUESS_MS; bump(room, {t: "oe_hid", who: g.hider, auto: true}); return {}; }
    if (g.phase === "guess") return GAMES.oe.resolve(room, priv, rnd() < 0.5 ? "odd" : "even", now);
    return {};
  },
  forfeit(room, priv, me) {
    if (room.status !== "play") return [];
    const r = GAMES.oe.finish(room, 1 - me, "상대가 나감");
    return r.payouts;
  },
  summary(room) { const g = room.state.g; return g ? {score: g.score, win: g.win, seats: room.state.seats.map((s) => s.nick)} : null; },
};

/* ───────── 뱀사다리 (2~4명) ─────────
   혼자 할 때와 같은 판(사다리 9개, 뱀 10마리). 자리 순서대로 돌아가며 주사위 1개를 굴린다(첫 차례는 무작위).
   100칸에 정확히 도착하면 이기고 모두의 판돈(인원 × 판돈)을 가져간다. 넘치면 넘친 만큼 되돌아간다.
   차례마다 20초, 넘기면 서버가 대신 굴린다. 나간 사람 차례는 건너뛰고, 한 명만 남으면 그 사람이 이긴다 */
export const SL_LAD = {1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100};
export const SL_SNK = {16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78};
const SL_TURN_MS = 20_000;
const alive = (room) => room.state.seats.map((s, i) => (s.left ? -1 : i)).filter((i) => i >= 0);
function nextTurn(room, from) {
  const n = room.state.seats.length;
  for (let k = 1; k <= n; k++) { const j = (from + k) % n; if (!room.state.seats[j].left) return j; }
  return from;
}
GAMES.sl = {
  init(room, priv, now, rnd) {
    const n = room.state.seats.length, first = Math.floor(rnd() * n);
    room.state.g = {pos: Array(n).fill(0), turn: first, first, win: -1, log: [`${room.state.seats[first].nick}부터 시작`]};
    room.state.deadline = now + SL_TURN_MS;
  },
  act(room, priv, me, a, now, rnd) {
    const g = room.state.g;
    if (me !== g.turn) return {err: "내 차례가 아닙니다"};
    if (!a.roll) return {err: "주사위를 굴리세요"};
    return GAMES.sl.roll(room, now, rnd, false);
  },
  roll(room, now, rnd, auto) {
    const st = room.state, g = st.g, i = g.turn, nm = st.seats[i].nick;
    const d = 1 + Math.floor(rnd() * 6), from = g.pos[i], list = [{t: "dice", i, d}];
    let to = from + d; const path = [];
    for (let k = from + 1; k <= Math.min(to, 100); k++) path.push(k);
    if (to > 100) { const back = to - 100; for (let k = 99; k >= 100 - back; k--) path.push(k); to = 100 - back; }
    list.push({t: "move", i, path});
    let line = `${nm} ${d}${auto ? "(시간 초과, 자동)" : ""} → ${to}칸`;
    if (SL_LAD[to]) { list.push({t: "ladder", i, from: to, to: SL_LAD[to]}); line += ` 사다리 타고 ${SL_LAD[to]}칸`; to = SL_LAD[to]; }
    else if (SL_SNK[to]) { list.push({t: "snake", i, from: to, to: SL_SNK[to]}); line += ` 뱀에게 물려 ${SL_SNK[to]}칸`; to = SL_SNK[to]; }
    const pos0 = g.pos.slice();
    g.pos[i] = to; g.log.push(line); if (g.log.length > 30) g.log.splice(0, g.log.length - 30);
    if (to === 100) { list.push({t: "win", i}); bump(room, {t: "sl", list, pos0}); return GAMES.sl.finish(room, i, "100칸 도착"); }
    g.turn = nextTurn(room, i); st.deadline = now + SL_TURN_MS;
    bump(room, {t: "sl", list, pos0});
    return {};
  },
  finish(room, win, why) {
    const st = room.state, n = st.seats.length, pot = r2(room.stake * n);
    room.status = "over"; st.deadline = null; st.g.win = win; st.g.why = why;
    return {payouts: st.seats.map((s, i) => ({user_id: s.uid, amount: i === win ? pot : 0, cost: room.stake, il: room.il,
      note: `뱀사다리 ${n}명 ${i === win ? "1등" : "패"}`}))};
  },
  auto(room, priv, now, rnd) { return GAMES.sl.roll(room, now, rnd, true); },
  forfeit(room, priv, me, now) {
    const st = room.state, g = st.g, live = alive(room);
    g.log.push(`${st.seats[me].nick} 나감`);
    if (live.length === 1) return GAMES.sl.finish(room, live[0], "혼자 남음").payouts;
    if (g.turn === me) { g.turn = nextTurn(room, me); st.deadline = now + SL_TURN_MS; }
    return [];
  },
  summary(room) { const g = room.state.g; return g ? {win: g.win, seats: room.state.seats.map((s) => s.nick), pos: g.pos} : null; },
};

/* ───────── 판 결과 기록 · 악용 의심 확인 ─────────
   심판은 판이 끝날 때(play → over) resultOf로 결과 한 줄을 seed10k_mp_results에 적고,
   같은 두 사람의 최근 결과로 연승을 센다(streakOf). 게임 규칙이 판 도중 이상한 행동을 보면
   room.state.flags에 [{kind, seat, n, msg}]를 쌓고, 심판은 새로 생긴 것(newFlags)을 알림으로 보낸다. */
export const WATCH = {oeStreak: 5, bjStand: 5, bmNoBuy: 5};
export function resultOf(room) {
  const st = room.state, g = st.g || {}, G = GAMES[room.game];
  const seats = st.seats.map((s) => ({uid: s.uid, nick: s.nick, ...(s.left ? {left: true} : {})})), uids = seats.map((s) => s.uid);
  const win = Number.isInteger(g.win) && g.win >= 0 && g.win < uids.length ? g.win : null;
  return {code: room.code, game: room.game, mode: room.mode, stake: room.stake, il: !!room.il, uids, seats, win,
    winner: win === null ? null : uids[win], pair: uids.length === 2 ? [...uids].sort().join(",") : null,
    why: g.why || null, summary: G && G.summary ? G.summary(room) : null};
}
// rows: 같은 두 사람의 결과, 최근 것부터. 맨 앞 판의 승자가 몇 판 연속 이겼는가
export function streakOf(rows) {
  if (!rows.length || !rows[0].winner) return 0;
  let n = 0;
  for (const r of rows) { if (r.winner !== rows[0].winner) break; n++; }
  return n;
}
// 연승 알림을 보낼 때: 5연승, 10연승, 15연승 … (같은 연승으로 판마다 울리지 않게)
export const streakHit = (n, k = WATCH.oeStreak) => n >= k && (n - k) % k === 0;
export function newFlags(room0, room) {
  const a = (room0 && room0.state && room0.state.flags || []).length, b = (room && room.state && room.state.flags) || [];
  return b.length >= a ? b.slice(a) : b;   // 줄었으면 새 판이 시작된 것
}
