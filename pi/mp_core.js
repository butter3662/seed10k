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

import { BM, BME } from "./bm_engine.js";
import { BS_KEYS, BSE } from "./bs_engine.js";   // 벅샷 룰렛 규칙 (사이트 bs.js에서 떼어 낸 같은 코드)   // 부루마블 규칙 (사이트 bm.js에서 떼어 낸 같은 코드)

export const LIMITS = {   // 사이트의 GAM과 같다 (판돈 한도: 평소 off, 불법 모드 on)
  oe: {nm: "홀짝", min: 1, off: 10, on: 100, minP: 2, maxP: 2},
  sl: {nm: "뱀사다리", min: 5, off: 50, on: 500, minP: 2, maxP: 4},
  bj: {nm: "블랙잭", min: 5, off: 100, on: 1000, minP: 2, maxP: 5},
  bs: {nm: "벅샷 룰렛", min: 5, off: 100, on: 1000, minP: 2, maxP: 4},
  bm: {nm: "부루마블", min: 10, off: 100, on: 1000, minP: 2, maxP: 4},
};
export const LOBBY_IDLE_MS = 20 * 60_000;   // 대기실에서 20분 동안 아무 일도 없으면 닫고 판돈을 돌려준다
export const OVER_KEEP_MS = 30 * 60_000;    // 끝난 방은 30분 뒤 닫는다
const GAMES = {};                           // 게임별 규칙 (아래에서 등록)

const r2 = (x) => Math.round(x * 100) / 100;
const clone = (x) => JSON.parse(JSON.stringify(x));
const seatOf = (room, uid) => room.state.seats.findIndex((s) => s.uid === uid);
const nick = (s) => String(s || "").replace(/[<>]/g, "").slice(0, 16) || "플레이어";
function bump(room, ev) { const st = room.state; st.seq = (st.seq || 0) + 1; if (ev) st.ev = {seq: st.seq, ...ev}; }
// 판돈을 내는 때: 예전 사이트는 들어갈 때 자기 통장에서 미리 뺐다(pay 없음). 새 사이트(arg.payAtStart)는 시작할 때 서버가 '판돈 냄' 줄로 가져간다(pay:"start")
// 그래서 대기실에서 나가거나 방이 닫힐 때 돌려주는 것은 미리 낸 사람(예전 방식)뿐이다
function refundAll(room, note) {
  return room.state.seats.filter((s) => s.pay !== "start").map((s) => ({user_id: s.uid, amount: room.stake, cost: room.stake, il: false, note}));
}
// 시작할 때 판돈 가져가기: 금액이 음수인 줄 (amount = cost = -판돈 → 순손익 0으로 세고, 끝날 때 줄이 amount − cost로 판 전체 손익이 된다)
// note의 '#번호'는 이 방에서 몇 번째 시작인지: 사이트가 판돈 장부의 열쇠(방 코드 + 번호)로 써서, 같은 판의 판돈을 두 번 빼지 않고 빠졌는지 확인한다
function chargeAll(room) {
  const n = room.state.startN = (room.state.startN || 0) + 1;
  return room.state.seats.filter((s) => s.pay === "start").map((s) => ({user_id: s.uid, amount: -room.stake, cost: -room.stake, il: false, note: `판돈 냄 #${n}`}));
}
const seatOf2 = (uid, a) => ({uid, nick: nick(a.nick), ...(a.payAtStart ? {pay: "start"} : {})});
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
      state: {seats: [seatOf2(uid, a)], maxP, seq: 0, at: now}};
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
      st.seats.push(seatOf2(uid, a));
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
        const paid = st.seats[me].pay !== "start";
        st.seats.splice(me, 1); bump(room, {t: "leave"});
        return {room, priv, payouts: paid ? [{user_id: uid, amount: room.stake, cost: room.stake, il: false, note: "대기실에서 나가 판돈 환불"}] : [], res: {}};
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
      const charge = chargeAll(room);                                             // 시작할 때 판돈을 가져간다 (끝난 판의 줄보다 먼저)
      const r = G.init(room, priv, now, rnd);                                     // 블랙잭은 딜러 블랙잭이면 바로 끝난다
      if (room.status === "play") bump(room, {t: "start"});
      return {room, priv, payouts: charge.concat((r && r.payouts) || []), res: {}};
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
      room.state = {seats: [seatOf2(uid, {nick: st.seats[me].nick, payAtStart: a.payAtStart})], maxP: st.maxP, seq: st.seq, startN: st.startN || 0, at: now, prev: G.summary ? G.summary(room) : null};
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

/* ───────── 블랙잭 대결 (2~5명, 딜러 없이 플레이어끼리) ─────────
   6벌을 판마다 새로 섞어 모두 두 장씩 받는다. 카드는 모두에게 보인다.
   자리 순서대로 히트(한 장 더)·스탠드(멈춤)만 고른다 (더블·스플릿 없음). 21이 되거나 넘으면(버스트) 저절로 멈춘다.
   첫 차례는 판마다 무작위 (뒤 차례가 앞사람 카드를 보고 고르는 이점이 한 사람에게 몰리지 않게).
   다 멈추면: 버스트하지 않은 사람 중 21에 가장 가까운 사람이 모두의 판돈을 가져간다.
     처음 두 장의 21(블랙잭)은 석 장 이상의 21보다 높고, 블랙잭끼리는 동점. 동점이면 똑같이 나눈다 (센트 아래는 버림).
     모두 버스트하면 각자 판돈을 돌려받는다 (나간 사람 판돈은 남은 사람들이 나눈다).
   고를 때마다 20초, 넘기면 스탠드. 진행 중에 나가면 그 사람 손은 진 것으로 본다(판돈은 상금에 남는다).
   의심 확인: 버스트할 수 없는 11 이하에서 직접 스탠드한 판을 low[자리]로 남긴다 (심판이 연속 판 수를 센다) */
export const BJM = {decks: 6, turnMs: 20_000};
const bjVal = (c) => Math.min(10, c % 13 + 1);
export function bjTotal(cards) { let t = 0, a = 0; for (const c of cards) { const v = bjVal(c); t += v; if (v === 1) a++; } const soft = a > 0 && t + 10 <= 21; return {t: soft ? t + 10 : t, soft}; }
const bjIsBJ = (cards) => cards.length === 2 && bjTotal(cards).t === 21;
// 겨루는 점수: 버스트·나감 -1, 블랙잭 22, 그 밖에는 합
export const bjScore = (P, left) => { const t = bjTotal(P.cards).t; return left || t > 21 ? -1 : bjIsBJ(P.cards) ? 22 : t; };
const bjDraw = (priv) => priv.shoe[priv.ix++];
GAMES.bj = {
  init(room, priv, now, rnd) {
    const st = room.state, n = st.seats.length, N = 52 * BJM.decks, shoe = Array.from({length: N}, (_, k) => k);
    for (let i = N - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shoe[i], shoe[j]] = [shoe[j], shoe[i]]; }
    priv.shoe = shoe; priv.ix = 0;
    const a = st.seats.map(() => bjDraw(priv)), b = st.seats.map(() => bjDraw(priv)), first = Math.floor(rnd() * n);
    const g = st.g = {players: st.seats.map((s, i) => ({cards: [a[i], b[i]], done: false, res: null})), order: Array.from({length: n}, (_, k) => (first + k) % n),
      step: 0, turn: -1, pot: r2(room.stake * n), low: Array(n).fill(false), log: [`${st.seats[first].nick}부터 시작`]};
    g.players.forEach((P, i) => { if (bjIsBJ(P.cards)) { P.done = true; g.log.push(`${st.seats[i].nick} 블랙잭`); } });
    return GAMES.bj.advance(room, priv, now);
  },
  advance(room, priv, now) {   // 다음으로 고를 사람. 없으면 정산
    const st = room.state, g = st.g;
    for (; g.step < g.order.length; g.step++) {
      const i = g.order[g.step];
      if (!st.seats[i].left && !g.players[i].done) { g.turn = i; st.deadline = now + BJM.turnMs; return {}; }
    }
    return GAMES.bj.settle(room);
  },
  settle(room) {
    const st = room.state, g = st.g, n = st.seats.length;
    g.turn = -1; g.phase = "over";
    const sc = g.players.map((P, i) => bjScore(P, st.seats[i].left)), best = Math.max(...sc);
    let pays;
    if (best < 0) {   // 모두 버스트: 남은 사람은 판돈을 돌려받고, 나간 사람 판돈은 남은 사람끼리 나눈다
      const stay = st.seats.map((s, i) => (s.left ? -1 : i)).filter((i) => i >= 0);
      const extra = stay.length ? Math.floor(room.stake * (n - stay.length) / stay.length * 100) / 100 : 0;
      pays = st.seats.map((s, i) => (s.left ? 0 : r2(room.stake + extra)));
      g.players.forEach((P, i) => { P.res = st.seats[i].left ? "lose" : "refund"; });
      g.why = "모두 버스트";
    } else {
      const win = sc.map((v, i) => (v === best ? i : -1)).filter((i) => i >= 0), each = Math.floor(g.pot / win.length * 100) / 100;
      pays = st.seats.map((s, i) => (win.includes(i) ? each : 0));
      g.players.forEach((P, i) => { P.res = win.includes(i) ? (win.length > 1 ? "tie" : "win") : "lose"; });
      g.win = win.length === 1 ? win[0] : -1; g.why = win.length > 1 ? `${win.length}명 동점` : best === 22 ? "블랙잭" : `${best}`;
    }
    g.pay = pays;
    room.status = "over"; st.deadline = null;
    bump(room, {t: "bj_end"});
    return {payouts: st.seats.map((s, i) => ({user_id: s.uid, amount: pays[i], cost: room.stake, il: room.il,
      note: `블랙잭 대결 ${n}명 ${s.left ? "기권" : ({win: "승", tie: "동점", lose: "패", refund: "모두 버스트 환불"})[g.players[i].res]}`}))};
  },
  // 예전 규칙(딜러와 하는 블랙잭 테이블)으로 시작된 판: 새 규칙으로 이어 갈 수 없으니 건 돈을 모두 돌려주고 끝낸다
  legacy(room) {
    const st = room.state, g = st.g;
    room.status = "over"; st.deadline = null; g.turn = -1; g.why = "규칙이 바뀌어 환불";
    bump(room, {t: "bj_end"});
    return {payouts: st.seats.map((s, i) => { const c = (g.players[i] && g.players[i].cost) || room.stake; return {user_id: s.uid, amount: c, cost: c, il: room.il, note: "블랙잭 규칙이 바뀌어 판돈 환불"}; })};
  },
  act(room, priv, me, a, now) {
    const g = room.state.g;
    if (!Array.isArray(g.order)) return GAMES.bj.legacy(room);
    if (me !== g.turn) return {err: "내 차례가 아닙니다"};
    if (a.a !== "hit" && a.a !== "stand") return {err: "히트나 스탠드만 할 수 있습니다"};
    return GAMES.bj.doAct(room, priv, me, a.a, now, false);
  },
  doAct(room, priv, me, a, now, auto) {
    const st = room.state, g = st.g, P = g.players[me], t0 = bjTotal(P.cards).t;
    if (a === "hit") { P.cards.push(bjDraw(priv)); const t = bjTotal(P.cards).t; if (t >= 21) P.done = true; }
    else { P.done = true; if (!auto && t0 <= 11) g.low[me] = true; }
    const t = bjTotal(P.cards).t;
    g.log.push(`${st.seats[me].nick} ${a === "hit" ? `히트 → ${t}${t > 21 ? " 버스트" : ""}` : `스탠드 (${t0})`}${auto ? " (시간 초과)" : ""}`);
    if (g.log.length > 30) g.log.splice(0, g.log.length - 30);
    bump(room, {t: "bj", who: me, a});
    return GAMES.bj.advance(room, priv, now) || {};
  },
  auto(room, priv, now) { const g = room.state.g; if (!Array.isArray(g.order)) return GAMES.bj.legacy(room); return g.turn >= 0 ? GAMES.bj.doAct(room, priv, g.turn, "stand", now, true) : {}; },
  forfeit(room, priv, me, now) {
    const st = room.state, g = st.g;
    if (!Array.isArray(g.order)) return GAMES.bj.legacy(room).payouts;
    g.players[me].done = true; g.log.push(`${st.seats[me].nick} 나감`);
    if (g.turn === me) { const r = GAMES.bj.advance(room, priv, now); return (r && r.payouts) || []; }
    return [];
  },
  summary(room) {
    const g = room.state.g; if (!g) return null;
    return {seats: room.state.seats.map((s) => s.nick), totals: g.players.map((P) => bjTotal(P.cards).t), pay: g.pay || null, low: g.low};
  },
};
// 블랙잭 '계속 스탠드': rows는 이 사람이 낀 블랙잭 판(최근 것부터). 11 이하 직접 스탠드가 몇 판 연속인가
export function bjLowStreak(rows, uid) {
  let n = 0;
  for (const r of rows) { const i = (r.uids || []).indexOf(uid); if (i < 0 || !(r.summary && r.summary.low && r.summary.low[i])) break; n++; }
  return n;
}

/* ───────── 부루마블 (2~4명, 사람끼리) ─────────
   혼자 할 때와 같은 규칙(bm_engine.js = 사이트 bm.js의 규칙 부분)으로, 한 명만 남을 때까지(나머지가 모두 파산할 때까지) 한다.
   순위 배수도 같다: 2명 2·0배, 3명 2.5·0.5·0배, 4명 3·1·0·0배 (평균 1배).
   황금열쇠 순서(deck)와 판 전체 기록(rec)은 숨긴 상태(priv)에 둔다 (다음 카드를 미리 볼 수 없게).
   고를 때마다 30초. 넘기면 컴퓨터와 같은 판단으로 대신 한다 (사기·우대권·우주여행·팔기), 짓기는 그만둔다.
   진행 중에 나가면 그 자리에서 파산한 것으로 본다 (혼자 할 때 기권과 같다).
   의심 확인: 돈이 있는데(땅값 이상) 직접 '안 산다'를 고른 수를 세어 5번마다 알림 */
const BM_TURN_MS = 30_000;
const bmLoad = (room, priv) => ({...room.state.g, deck: priv.deck, rec: priv.rec || []});
function bmStore(room, priv, g) { const {deck, rec, ...pub} = g; priv.deck = deck; priv.rec = rec; room.state.g = pub; }
const bmV0 = (g) => ({...BME.view(g), pos: g.pl.map((p) => p.pos), turn: g.turn});
export const bmActor = (g) => (g.pending && g.pending.k === "sell" ? g.pending.who : g.turn);
GAMES.bm = {
  init(room, priv, now, rnd) {
    const st = room.state, n = st.seats.length;
    const g = BME.newGame(n, room.stake, rnd);
    g.multi = true; g.nobuy = Array(n).fill(0);
    g.pl.forEach((p, i) => { p.nm = st.seats[i].nick; p.me = true; });
    g.log = []; g.rec = [];
    BME.rec(g, `시작 (같이 하기): ${n}명 ${st.seats.map((s) => s.nick).join(", ")}, 판돈 ${room.stake}달러`);
    BME.log(g, `${g.pl[g.turn].nm}부터 시작`);
    g.pending = {k: "roll"};
    bmStore(room, priv, g);
    st.deadline = now + BM_TURN_MS;
  },
  act(room, priv, me, a, now, rnd) {
    const st = room.state, g = bmLoad(room, priv), pd = g.pending;
    if (g.over) return {err: "끝난 판입니다"};
    if (me !== bmActor(g)) return {err: "내 차례가 아닙니다"};
    const v0 = bmV0(g); let ev;
    const op = a.op;
    if (op === "roll") { if (!pd || pd.k !== "roll") return {err: "지금은 주사위를 굴릴 때가 아닙니다"}; ev = BME.roll(g, rnd); }
    else if (op === "sell") {
      if (!pd || pd.k !== "sell") return {err: "팔 때가 아닙니다"};
      if (a.arg !== "auto" && !(Number.isInteger(a.arg) && g.own[a.arg] === me)) return {err: "내 땅이 아닙니다"};
      ev = BME.sell(g, a.arg === "auto" ? "auto" : a.arg, [], rnd);
    } else if (["buy", "build", "coupon", "space"].includes(op)) {
      if (!pd || pd.k !== op) return {err: "지금 고를 수 없습니다"};
      if (op === "build" && a.yes && !["v", "b", "h"].includes(a.arg)) return {err: "지을 것이 잘못됐습니다"};
      if (op === "space" && !(Number.isInteger(a.arg) && a.arg >= 0 && a.arg < 40 && a.arg !== 30)) return {err: "갈 칸이 잘못됐습니다"};
      if (op === "buy" && !a.yes) {   // 살 수 있을 때만(현금 ≥ 땅값) 묻는다
        g.nobuy[me] = (g.nobuy[me] || 0) + 1;
        if (streakHit(g.nobuy[me], WATCH.bmNoBuy)) (st.flags = st.flags || []).push({kind: "bm_nobuy", seat: me, n: g.nobuy[me],
          msg: `부루마블: ${st.seats[me].nick}이(가) 돈이 있는데 땅을 안 산 것이 ${g.nobuy[me]}번 (판돈 $${room.stake}, 방 ${room.code})`});
      }
      ev = BME.decide(g, !!a.yes, op === "build" || op === "space" ? a.arg : -1, rnd);
    } else return {err: "모르는 행동입니다"};
    return GAMES.bm.after(room, priv, g, ev, v0, now, false);
  },
  after(room, priv, g, ev, v0, now, auto) {
    bmStore(room, priv, g);
    bump(room, {t: "bm", list: ev, v0, auto: !!auto});
    if (g.over) return GAMES.bm.finish(room, priv, g, "한 명만 남음");
    room.state.deadline = now + BM_TURN_MS;
    return {};
  },
  finish(room, priv, g, why) {
    const st = room.state, n = st.seats.length, r = BME.ranking(g);
    g.over = true; g.pending = null; g.win = r[0]; g.why = why; g.rank = st.seats.map((s, i) => r.indexOf(i) + 1);
    BME.rec(g, `끝: ${r.map((i, k) => `${k + 1}.${g.pl[i].nm}${g.pl[i].out ? `(파산 ${g.pl[i].outAt}번째)` : `(자산 ${BME.assets(g, i)})`}`).join(" ")}`);
    bmStore(room, priv, g);
    room.status = "over"; st.deadline = null;
    return {payouts: st.seats.map((s, i) => {
      const rank = g.rank[i], m = BM.pay[n][rank - 1] || 0;
      return {user_id: s.uid, amount: r2(room.stake * m), cost: room.stake, il: room.il, note: `부루마블 ${n}명 ${rank}위${s.left ? " (기권)" : ""}`};
    })};
  },
  auto(room, priv, now, rnd) {
    const g = bmLoad(room, priv), pd = g.pending, i = g.turn, p = g.pl[i], v0 = bmV0(g);
    let ev;
    if (!pd || pd.k === "roll") ev = BME.roll(g, rnd);
    else if (pd.k === "sell") ev = BME.sell(g, "auto", [], rnd);
    else if (pd.k === "buy") ev = BME.decide(g, BME.botBuy(g, i, pd.sq), -1, rnd);
    else if (pd.k === "build") ev = BME.decide(g, false, -1, rnd);
    else if (pd.k === "coupon") ev = BME.decide(g, pd.r >= 300 || pd.r >= p.cash * 0.3, -1, rnd);
    else if (pd.k === "space") ev = BME.decide(g, true, BME.botSpace(g, i), rnd);
    else ev = [];
    BME.rec(g, `(시간 초과: ${g.pl[i].nm} 대신 결정)`);
    return GAMES.bm.after(room, priv, g, ev, v0, now, true);
  },
  forfeit(room, priv, me, now) {
    const g = bmLoad(room, priv), v0 = bmV0(g), ev = [], pd = g.pending;
    if (g.pl[me].out) return [];
    const mySell = pd && pd.k === "sell" && pd.who === me, otherSell = pd && pd.k === "sell" && !mySell, myTurn = g.turn === me;
    if (!otherSell) g.pending = null;                       // 내가 고를 차례였던 것은 없앤다 (남이 팔 것을 고르는 중이면 그대로)
    BME.bankrupt(g, me, mySell ? pd.pays[0].to : -1, ev);   // 그 자리에서 파산: 빚 정리 중이었으면 남은 현금은 받을 사람에게
    BME.log(g, `${g.pl[me].nm} 기권`);
    if (BME.alive(g) <= 1) g.over = true;
    else if (mySell) BME.afterAction(g);
    else if (myTurn && !otherSell) BME.next(g);
    const r = GAMES.bm.after(room, priv, g, ev, v0, now, false);
    if (g.over && !r.payouts) return GAMES.bm.finish(room, priv, g, "한 명만 남음").payouts;
    return r.payouts || [];
  },
  summary(room) {
    const g = room.state.g; if (!g) return null;
    return {seats: room.state.seats.map((s) => s.nick), rank: g.rank || null, nobuy: g.nobuy, rounds: g.round};
  },
};

/* ───────── 벅샷 룰렛 (2~4명) ─────────
   규칙은 bs_engine.js(사이트 bs.js의 규칙 부분)와 같다. 첫 차례는 무작위. 마지막까지 살아남은 사람이 모두의 판돈을 가져간다.
   탄 순서(shells)와 돋보기로 본 것(pk)은 숨긴 상태(priv)에 둔다. 돋보기 결과는 쓴 사람의 요청 결과(res)로만 돌려준다.
   한 번 고를 때마다 30초, 넘기면 컴퓨터 딜러와 같은 판단으로 대신 둔다(쏠 때까지). 진행 중에 나가면 그 자리에서 탈락 */
const BS_TURN_MS = 30_000;
const bsLoad = (room, priv) => ({...room.state.g, shells: priv.shells || [], pk: priv.pk || room.state.g.pl.map(() => null)});
function bsStore(room, priv, g) { const {shells, pk, ...pub} = g; priv.shells = shells; priv.pk = pk; room.state.g = pub; }
const bsPub = (ev) => ev.map((e) => (e.t === "peek" ? {t: "peek", i: e.i} : e));   // 돋보기 결과는 지운다
GAMES.bs = {
  init(room, priv, now, rnd) {
    const st = room.state, n = st.seats.length, first = Math.floor(rnd() * n);
    const {g} = BSE.newGame(st.seats.map((s) => s.nick), room.stake, rnd, first);
    bsStore(room, priv, g);
    st.deadline = now + BS_TURN_MS;
  },
  act(room, priv, me, a, now, rnd) {
    const g = bsLoad(room, priv);
    if (g.over) return {err: "끝난 판입니다"};
    if (g.turn !== me) return {err: "내 차례가 아닙니다"};
    let ev = null;
    if (a.op === "shoot" && Number.isInteger(a.target)) ev = BSE.shoot(g, me, a.target, rnd);
    else if (a.op === "use" && BS_KEYS.includes(a.it)) ev = BSE.use(g, me, a.it, Number.isInteger(a.target) ? a.target : -1, rnd);
    if (!ev) return {err: "지금 할 수 없습니다"};
    const pk = ev.find((e) => e.t === "peek" && e.i === me);
    const r = GAMES.bs.after(room, priv, g, ev, now);
    return {...r, res: pk ? {peek: pk.live, load: g.load, left: g.live + g.blank} : {}};
  },
  after(room, priv, g, ev, now) {
    bsStore(room, priv, g);
    bump(room, {t: "bs", list: bsPub(ev)});
    if (g.over) return GAMES.bs.finish(room);
    room.state.deadline = now + BS_TURN_MS;
    return {};
  },
  finish(room) {
    const st = room.state, g = st.g, n = st.seats.length, r = BSE.ranking(g);
    room.status = "over"; st.deadline = null; g.rank = st.seats.map((s, i) => r.indexOf(i) + 1); g.why = "마지막 생존";
    return {payouts: st.seats.map((s, i) => ({user_id: s.uid, amount: i === g.win ? r2(room.stake * n) : 0, cost: room.stake, il: room.il,
      note: `벅샷 룰렛 ${n}명 ${i === g.win ? "승" : `${g.rank[i]}위`}${s.left ? " (기권)" : ""}`}))};
  },
  auto(room, priv, now, rnd) {   // 시간 초과: 쏠 때까지 컴퓨터처럼 둔다
    const g = bsLoad(room, priv), i = g.turn, ev = [];
    for (let k = 0; k < 12 && !g.over && g.turn === i; k++) {
      const a = BSE.ai(g, i, rnd), e = BSE.step(g, i, a, rnd) || BSE.shoot(g, i, i, rnd);
      if (!e) break;
      ev.push(...e);
      if (a.op === "shoot") break;
    }
    g.log.push(`(시간 초과: ${g.pl[i].nm} 대신 결정)`);
    return GAMES.bs.after(room, priv, g, ev, now);
  },
  forfeit(room, priv, me, now) {
    const g = bsLoad(room, priv), ev = [];
    BSE.forfeit(g, me, ev);
    const r = GAMES.bs.after(room, priv, g, ev, now);
    return r.payouts || [];
  },
  summary(room) { const g = room.state.g; return g ? {seats: room.state.seats.map((s) => s.nick), win: g.win, hp: g.pl.map((p) => p.hp)} : null; },
};
