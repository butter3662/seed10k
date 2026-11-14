/* ───────── 벅샷 룰렛 (모티브: Mike Klubnika의 Buckshot Roulette, 2023) ─────────
   산탄총에 실탄과 공포탄을 섞어 넣는다. 몇 발씩인지는 모두에게 알려 주지만 순서는 모른다.
   내 차례에 아이템을 쓰고(몇 개든), 나 또는 상대를 쏜다.
   - 실탄: 맞은 사람 목숨 −1 (톱을 썼으면 −2). 차례가 넘어간다.
   - 공포탄: 상대를 쐈으면 차례가 넘어가고, 나를 쐈으면 한 번 더 내 차례.
   목숨은 모두 4로 시작(최대 4). 탄을 다 쓰면 다시 장전하고, 장전할 때마다 살아 있는 사람은 아이템 2개씩(최대 8개).
   목숨이 0이 되면 탈락, 마지막까지 남은 사람이 이긴다.
   아이템: 🔍돋보기(지금 탄을 나만 본다) 🚬담배(목숨 +1) 🍺맥주(지금 탄을 쏘지 않고 빼낸다, 모두가 본다)
           🪚톱(다음 한 발 피해 2배) ⛓️수갑(고른 상대가 다음 차례를 한 번 쉰다)
   이 규칙 부분(BS ~ BSE)은 라즈베리파이 심판도 같은 코드를 쓴다 (build.py가 pi/bs_engine.js로 떼어 낸다) */
const BS = {hpMax:4, perLoad:2, itemMax:8, minShells:2, maxShells:8};
const BS_IT = {
  glass:{nm:'돋보기', ic:'🔍', d:'지금 장전된 탄이 실탄인지 공포탄인지 나만 봅니다'},
  cig:{nm:'담배', ic:'🚬', d:'목숨 +1 (최대 4)'},
  beer:{nm:'맥주', ic:'🍺', d:'지금 탄을 쏘지 않고 빼냅니다 (무슨 탄이었는지 모두 봅니다)'},
  saw:{nm:'톱', ic:'🪚', d:'다음 한 발의 피해가 2배'},
  cuff:{nm:'수갑', ic:'⛓️', d:'고른 상대가 다음 차례를 한 번 쉽니다'},
};
const BS_KEYS = Object.keys(BS_IT);
const BSE = {
  newGame(names, stake, rnd, first){
    const g = {v:1, n:names.length, stake, pl:names.map(nm => ({nm, hp:BS.hpMax, items:[], cuffed:false, out:false, outAt:0})),
      turn:first, shells:[], live:0, blank:0, saw:false, load:0, pk:names.map(() => null), log:[], over:false, win:-1, outs:0, shots:0};
    const ev = [];
    BSE.reload(g, rnd, ev);
    BSE.log(g, `${g.pl[first].nm}부터 시작`);
    return {g, ev};
  },
  log(g, t){ g.log.push(t); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); },
  alive(g){ return g.pl.filter(p => !p.out).length; },
  reload(g, rnd, ev){
    const total = BS.minShells + Math.floor(rnd() * (BS.maxShells - BS.minShells + 1)), live = 1 + Math.floor(rnd() * (total - 1));
    const sh = Array.from({length:total}, (_, k) => k < live);
    for (let k = total - 1; k > 0; k--){ const j = Math.floor(rnd() * (k + 1)); [sh[k], sh[j]] = [sh[j], sh[k]]; }
    g.shells = sh; g.live = live; g.blank = total - live; g.saw = false; g.load++; g.pk = g.pl.map(() => null);
    const got = g.pl.map(p => {
      if (p.out) return [];
      const add = [];
      for (let k = 0; k < BS.perLoad && p.items.length < BS.itemMax; k++){ const it = BS_KEYS[Math.floor(rnd() * BS_KEYS.length)]; p.items.push(it); add.push(it); }
      return add;
    });
    ev.push({t:'load', live, blank:total - live, got});
    BSE.log(g, `장전: 실탄 ${live} · 공포탄 ${total - live}`);
  },
  take(g){   // 맨 앞 탄을 꺼낸다 (쏘거나 맥주로 빼거나). 그 탄을 본 기억은 지운다
    const s = g.shells.shift();
    if (s) g.live--; else g.blank--;
    g.pk = g.pl.map(() => null);
    return s;
  },
  // 아이템 쓰기. 할 수 없으면 null
  use(g, i, it, target, rnd){
    const p = g.pl[i], k = p.items.indexOf(it), ev = [];
    if (g.over || g.turn !== i || k < 0 || !g.shells.length) return null;
    if (it === 'saw' && g.saw) return null;
    if (it === 'cuff'){ const q = g.pl[target]; if (!q || target === i || q.out || q.cuffed) return null; }
    if (it === 'cig' && p.hp >= BS.hpMax) return null;
    p.items.splice(k, 1);
    if (it === 'glass'){ g.pk[i] = g.shells[0]; ev.push({t:'peek', i, live:g.shells[0]}); BSE.log(g, `${p.nm} 🔍 돋보기`); }
    else if (it === 'cig'){ p.hp++; ev.push({t:'heal', i, hp:p.hp}); BSE.log(g, `${p.nm} 🚬 담배 (목숨 ${p.hp})`); }
    else if (it === 'beer'){ const s = BSE.take(g); ev.push({t:'beer', i, live:s}); BSE.log(g, `${p.nm} 🍺 맥주: ${s ? '실탄' : '공포탄'}을 빼냄`); if (!g.shells.length) BSE.reload(g, rnd, ev); }
    else if (it === 'saw'){ g.saw = true; ev.push({t:'saw', i}); BSE.log(g, `${p.nm} 🪚 톱`); }
    else if (it === 'cuff'){ g.pl[target].cuffed = true; ev.push({t:'cuff', i, target}); BSE.log(g, `${p.nm} ⛓️ 수갑 → ${g.pl[target].nm}`); }
    return ev;
  },
  shoot(g, i, target, rnd){
    if (g.over || g.turn !== i || !g.shells.length) return null;
    const q = g.pl[target]; if (!q || q.out) return null;
    const s = BSE.take(g), dmg = s ? (g.saw ? 2 : 1) : 0, ev = [], pre = q.hp, sw = !!g.saw;
    g.saw = false; g.shots++;
    if (dmg){ q.hp = Math.max(0, q.hp - dmg); if (!q.hp){ q.out = true; q.outAt = ++g.outs; q.cuffed = false; } }
    ev.push({t:'shot', i, target, live:s, dmg, hp:q.hp, out:q.out, pre, sw});
    BSE.log(g, `${g.pl[i].nm} → ${target === i ? '자기 자신' : q.nm}: ${s ? `💥 실탄${dmg > 1 ? ' (톱, 2배)' : ''}` : '공포탄'}${q.out ? ` · ${q.nm} 탈락` : ''}`);
    if (BSE.alive(g) <= 1){ g.over = true; g.win = g.pl.findIndex(p => !p.out); ev.push({t:'win', i:g.win}); return ev; }
    if (!(s === false && target === i)) BSE.pass(g, ev);   // 나를 쏴서 공포탄이면 한 번 더
    else ev.push({t:'again', i});
    if (!g.shells.length) BSE.reload(g, rnd, ev);
    return ev;
  },
  pass(g, ev){
    let j = g.turn;
    for (let guard = 0; guard < g.n * 3; guard++){
      j = (j + 1) % g.n;
      const p = g.pl[j]; if (p.out) continue;
      if (p.cuffed){ p.cuffed = false; ev.push({t:'skip', i:j}); BSE.log(g, `${p.nm} 수갑에 묶여 쉼`); continue; }
      break;
    }
    g.turn = j; ev.push({t:'turn', i:j});
  },
  // 나간 사람: 그 자리에서 탈락
  forfeit(g, i, ev){
    const p = g.pl[i]; if (p.out) return;
    p.out = true; p.hp = 0; p.outAt = ++g.outs; p.cuffed = false;
    BSE.log(g, `${p.nm} 기권`);
    if (BSE.alive(g) <= 1){ g.over = true; g.win = g.pl.findIndex(q => !q.out); ev.push({t:'win', i:g.win}); return; }
    if (g.turn === i) BSE.pass(g, ev);
  },
  // 순위: 이긴 사람 1위, 나머지는 늦게 탈락한 순
  ranking(g){ return g.pl.map((p, i) => i).sort((a, b) => (g.pl[a].out ? g.pl[a].outAt : 1e9) < (g.pl[b].out ? g.pl[b].outAt : 1e9) ? 1 : -1); },
  // 컴퓨터(또는 시간 초과 대신)의 다음 한 수. know: 지금 탄을 알면 true/false
  ai(g, i, rnd){
    const p = g.pl[i], know = g.pk[i], has = it => p.items.includes(it);
    const opps = g.pl.map((q, j) => j).filter(j => j !== i && !g.pl[j].out).sort((a, b) => g.pl[a].hp - g.pl[b].hp);
    const opp = opps[0];
    const pr = know !== null ? (know ? 1 : 0) : g.live / Math.max(1, g.live + g.blank);
    if (p.hp < BS.hpMax && has('cig')) return {op:'use', it:'cig'};
    if (know === null && has('glass') && g.live && g.blank) return {op:'use', it:'glass'};
    if (pr === 1){
      if (has('saw') && !g.saw) return {op:'use', it:'saw'};
      if (has('cuff') && g.shells.length > 1 && !g.pl[opp].cuffed) return {op:'use', it:'cuff', target:opp};
      return {op:'shoot', target:opp};
    }
    if (pr === 0) return {op:'shoot', target:i};
    if (has('beer') && pr > 0.3 && pr < 0.7 && g.shells.length > 1) return {op:'use', it:'beer'};
    if (has('cuff') && g.shells.length > 1 && !g.pl[opp].cuffed) return {op:'use', it:'cuff', target:opp};
    return {op:'shoot', target: pr >= 0.5 ? opp : i};
  },
  step(g, i, a, rnd){ return a.op === 'use' ? BSE.use(g, i, a.it, a.target, rnd) : a.op === 'shoot' ? BSE.shoot(g, i, a.target, rnd) : null; },
};
/* ───── 화면 ───── */
// 혼자 하기: 컴퓨터 딜러와 1:1. 첫 차례는 동전 던지기(같은 판단을 하면 이길 확률 ½) → 이기면 판돈의 2배, 지면 0 (기대 배수 1)
const BSV = {busy:false, gen:0, msg:'', flash:'', t:null};
function bsS(){ if (!S.bs || typeof S.bs !== 'object') S.bs = {cur:null, hist:[]}; return S.bs; }
function bsInfo(){
  INFO.bs = {t:'벅샷 룰렛', h:`<div class="prose"><ul>
    <li>산탄총에 실탄과 공포탄을 섞어 넣습니다(모두 2~8발, 실탄·공포탄 최소 1발씩). 몇 발씩인지는 알려 주지만 순서는 모릅니다.</li>
    <li>내 차례에 아이템을 원하는 만큼 쓰고, <b>딜러</b> 또는 <b>나</b>를 쏩니다. 실탄에 맞으면 목숨 −1. 나를 쐈는데 공포탄이면 한 번 더 내 차례, 그 밖에는 차례가 넘어갑니다.</li>
    <li>목숨은 모두 ${BS.hpMax}로 시작(최대 ${BS.hpMax}). 탄을 다 쓰면 다시 장전하고, 그때마다 아이템을 ${BS.perLoad}개씩 받습니다(최대 ${BS.itemMax}개). 목숨이 0이 되면 집니다.</li>
    <li>${BS_KEYS.map(k => `${BS_IT[k].ic} ${BS_IT[k].nm}: ${BS_IT[k].d}`).join('<br>')}</li>
    <li>누가 먼저 쏠지는 동전 던지기입니다. 이기면 판돈의 2배, 지면 0입니다. 컴퓨터만큼 판단하면 이길 확률이 ½이라 기대 배수는 1입니다.</li></ul>
    <p>모티브: Mike Klubnika의 게임 Buckshot Roulette(2023). 판돈 한도 ${fmtUSDn(GAM.bs.off, 0)} (불법 모드 ${fmtUSDn(GAM.bs.on, 0)}), 불법 모드 단속 ${(GAM.bs.p * 100).toFixed(1)}%.</p></div>`};
}
// 산탄총 그림 (직접 그린 펌프식 산탄총: 총구가 왼쪽). 겨눌 때 무대가 돌려서 총구가 쏠 사람 쪽을 본다
const BS_GUN = `<svg class="bs-svg" viewBox="0 0 260 64" aria-hidden="true">
  <defs><linearGradient id="bsMetal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8d939b"/><stop offset=".5" stop-color="#5b6068"/><stop offset="1" stop-color="#373a40"/></linearGradient>
  <linearGradient id="bsWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8703f"/><stop offset="1" stop-color="#5e3a1d"/></linearGradient></defs>
  <g class="bs-barrel"><rect x="6" y="18" width="150" height="9" rx="2" fill="url(#bsMetal)"/><rect x="18" y="28" width="132" height="7" rx="2" fill="#41454c"/><rect x="4" y="17" width="6" height="11" rx="1.5" fill="#2a2c30"/></g>
  <rect class="bs-pump" x="58" y="26" width="46" height="13" rx="4" fill="url(#bsWood)"/>
  <path d="M150 15h40l6 5v20h-46z" fill="url(#bsMetal)"/><rect x="160" y="21" width="16" height="4" rx="1" fill="#24262a"/>
  <path d="M176 40q4 12 14 12" stroke="#2a2c30" stroke-width="3" fill="none"/><path d="M180 40l4 8" stroke="#2a2c30" stroke-width="2.5"/>
  <path d="M194 18l62 6v20l-58 12-8-6z" fill="url(#bsWood)"/><path d="M200 22l50 5" stroke="#c48b57" stroke-width="1.2" opacity=".6"/>
</svg>`;
// 딜러 (이 게임만의 캐릭터): 낡은 용접 가면에 붉은 눈구멍 한 줄, 검은 코트, 가죽 장갑. 장전은 딜러가 직접 한다
const BS_DEALER = `<svg class="bs-dsvg" viewBox="0 0 220 130" aria-hidden="true">
  <path d="M30 130c6-38 30-56 80-56s74 18 80 56z" fill="#16100e"/><path d="M70 92l40 20 40-20" stroke="#2c1d18" stroke-width="3" fill="none"/>
  <rect x="98" y="62" width="24" height="16" fill="#241815"/>
  <g class="bs-dhead"><path d="M74 14q36-14 72 0l6 46q-42 14-84 0z" fill="#4b4036"/><path d="M74 14q36-14 72 0l2 10q-38-10-76 0z" fill="#5d5045"/>
  <rect x="84" y="34" width="52" height="9" rx="2" fill="#0c0707"/><rect class="bs-deye" x="88" y="36" width="44" height="5" rx="2" fill="#ff3b2e"/>
  <circle cx="80" cy="22" r="2" fill="#2a221d"/><circle cx="140" cy="22" r="2" fill="#2a221d"/><circle cx="82" cy="52" r="2" fill="#2a221d"/><circle cx="138" cy="52" r="2" fill="#2a221d"/>
  <path d="M96 56h28" stroke="#2a221d" stroke-width="3"/><path d="M146 30q20 10 14 44" stroke="#2a221d" stroke-width="5" fill="none"/></g>
</svg>`;
const BS_HAND = `<svg viewBox="0 0 40 30" aria-hidden="true"><path d="M4 14q2-10 14-10h10q8 0 8 6v10q0 6-8 6H14Q4 26 4 14z" fill="#2b1c16"/><path d="M12 6v-3M18 5V1M24 5V2M30 7V4" stroke="#2b1c16" stroke-width="4" stroke-linecap="round"/></svg>`;
// 아이템 그림 (24×24)
const BS_ICO = {
  glass:`<circle cx="10" cy="10" r="6.5" fill="rgba(150,200,255,.25)" stroke="#c9ccd2" stroke-width="2.2"/><path d="M7 7.5a4 4 0 0 1 4-2" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7"/><path d="M14.8 14.8l6 6" stroke="#5b3a22" stroke-width="3.6" stroke-linecap="round"/>`,
  cig:`<rect x="4" y="7" width="14" height="14" rx="1.5" fill="#d9d2c4"/><rect x="4" y="7" width="14" height="5" fill="#a3261d"/><rect x="7" y="2.5" width="3" height="7" fill="#efe9dc"/><rect x="7" y="2.5" width="3" height="2" fill="#c9893a"/><rect x="11.5" y="4" width="3" height="5" fill="#efe9dc"/><rect x="11.5" y="4" width="3" height="1.6" fill="#c9893a"/>`,
  beer:`<rect x="6.5" y="4" width="11" height="17" rx="2.5" fill="#2f6b3a"/><rect x="6.5" y="9" width="11" height="6" fill="#d8c27a"/><ellipse cx="12" cy="4.4" rx="5.3" ry="1.4" fill="#b9bec4"/><rect x="8" y="5.5" width="1.4" height="14" fill="#fff" opacity=".22"/>`,
  saw:`<path d="M3 15l12-9 3 4-12 9z" fill="#c2c7cd"/><path d="M3 15l1 2 1-2 1 2 1-2 1 2 1-2 1 2 1-2 1 2" stroke="#7d838a" stroke-width="1" fill="none"/><rect x="15" y="3" width="6" height="9" rx="2" transform="rotate(-37 18 7.5)" fill="#7a4a24"/>`,
  cuff:`<circle cx="7.5" cy="14" r="4.8" fill="none" stroke="#b9bec4" stroke-width="2.4"/><circle cx="16.5" cy="14" r="4.8" fill="none" stroke="#b9bec4" stroke-width="2.4"/><path d="M10.5 9.5q1.5-3 3 0" stroke="#8d939b" stroke-width="2" fill="none"/>`,
};
const bsIco = it => `<svg viewBox="0 0 24 24" aria-hidden="true">${BS_ICO[it] || ''}</svg>`;
const bsHP = (hp, flash) => `<span class="bs-hp ${flash ? 'hit' : ''}" aria-label="목숨 ${hp}">${Array.from({length:BS.hpMax}, (_, k) => `<i class="${k < hp ? 'on' : ''}"></i>`).join('')}</span>`;
// 장전할 때 탁자에 탄을 늘어놓았다가 총에 넣는다 (BSV.lay = {live, blank, k}: k는 무작위 배치용). 탄은 모두 같은 모양으로 그린다 (어느 것이 실탄인지 보이면 넣는 순서로 짐작할 수 있어 불공평)
// 조작 줄 (높이 고정). 직접 하기: 장전(탄 넣기) → 펌프 → 총 들기 → 겨누기 → 방아쇠 → 펌프(탄피 빼기)
function bsCtlHTML(g, me, myTurn){
  const W = BSV.want;
  if (W === 'load') return `<button class="btn" data-bsdo="loadall">모두 넣기</button>`;
  if (W === 'rack') return `<button class="btn solid bs-big" data-bsdo="rack">⬅︎ 펌프 당기기</button>`;
  if (!myTurn) return '';
  if (!BSV.hold) return `<button class="btn solid bs-big" data-bsdo="hold">총 들기</button>`;
  return '';   // 총을 든 뒤의 단추(내려놓기·나에게·상대에게)는 무대 위에 띄운다 (bsAimUI)
}
// 총을 들었을 때 무대 위 단추: 가운데 위 '내려놓기', 왼쪽 아래 '👇 나에게', 오른쪽 아래 '👆 상대에게' (상대가 여럿이면 이름별로)
function bsAimUI(g, me){
  const opp = g.pl.map((p, k) => (me + 1 + k) % g.pl.length).filter(i => i !== me && !g.pl[i].out);
  return `<div class="bs-aimui">
    <button class="btn bs-drop" data-bsdo="drop">내려놓기</button>
    <button class="btn bs-me" data-bsaim="${me}">👇 나에게</button>
    <div class="bs-opp">${opp.map(i => `<button class="btn bs-red" data-bsaim="${i}">👆 ${opp.length > 1 ? `${esc(g.pl[i].nm)}에게` : '상대에게'}</button>`).join('')}</div>
  </div>`;
}
// 사람이 할 차례를 기다린다 (장전·펌프). 너무 오래 안 누르면 저절로 넘어간다
function bsAwait(k, ms, rer){
  return new Promise((res, rej) => {
    const gen = BSV.gen; BSV.want = k; if (rer) rer();   // 버튼(펌프·모두 넣기)이 보이게 다시 그린다
    const done = () => { clearTimeout(t); BSV.want = null; BSV.go = null; res(); };
    const t = setTimeout(() => gen === BSV.gen && $('.bs-table') ? done() : rej('stop'), ms);
    BSV.go = done;
  });
}
function bsLayHTML(){
  const L = BSV.lay; if (!L) return '';
  const arr = Array.from({length:L.live}, () => 1).concat(Array.from({length:L.blank}, () => 0));
  return `<div class="bs-lay">${arr.map((v, k) => `<i class="unk ${L.in && L.in.includes(k) ? 'in' : ''}" style="--k:${k};--r:${((k * 37 + L.k) % 23) - 11}deg"></i>`).join('')}</div>`;
}
function bsCardHTML(){
  bsInfo();
  const s = bsS(), g = s.cur;
  if (!g){
    const h = s.hist.slice(0, 3).map(x => `<span class="${cls(x.pay - x.stake)}">${x.win ? '승' : '패'} ${signUSD(x.pay - x.stake)}</span>`).join(' · ');
    return `<div class="card-h"><h2>💥 벅샷 룰렛 ${infoBtn('bs')}</h2><small>이기면 2배</small></div>
      <p class="mg-desc">${h ? `최근 ${h}` : '실탄과 공포탄이 섞인 산탄총으로 딜러와 번갈아 쏩니다. 마지막까지 버티면 판돈 2배'}</p>
      <div class="mg-foot"><span class="muted">한도 ${fmtUSDn(gamMax('bs'), 0)}</span><button class="btn solid" id="bsGo" ${S.over ? 'disabled' : ''}>새 게임</button></div>`;
  }
  return bsTableHTML(g, 0, {mine:true, solo:true});
}
// 판 그리기 (혼자·같이 하기 같이 씀). me: 내 자리, o.mine: 내 아이템을 누를 수 있는지, o.peek: 내가 본 지금 탄
// 버튼·메시지·돋보기 줄은 늘 자리를 차지하게 두고(안 쓸 때는 숨김) 높이를 고정한다: 차례가 바뀌어도 화면이 움직이지 않게
function bsTableHTML(g, me, o){
  o = o || {};
  const V = BSV.busy && BSV.view;
  if (V) g = Object.assign({}, g, {live:V.live, blank:V.blank, turn:V.turn, saw:V.saw, over:V.over, load:V.load, pl:g.pl.map((p, i) => Object.assign({}, p, {hp:V.hp[i], out:V.out[i], items:V.items[i]}))});
  const myTurn = !g.over && g.turn === me && !BSV.busy && !o.wait;
  const peek = o.peek !== undefined ? o.peek : g.pk ? g.pk[me] : null;
  const seat = (p, i, mine) => {
    const items = mine ? p.items.map(it => {
      const dis = !myTurn || !o.mine || BSV.hold || (it === 'saw' && g.saw) || (it === 'cig' && p.hp >= BS.hpMax) || (it === 'cuff' && !g.pl.some((q, j) => j !== me && !q.out && !q.cuffed));
      return `<button class="bs-it" data-bsit="${it}" ${dis ? 'disabled' : ''} title="${BS_IT[it].d}"><span class="bs-ico">${bsIco(it)}</span><small>${BS_IT[it].nm}</small></button>`;
    }).join('') : p.items.map(it => `<span class="bs-it ro" title="${BS_IT[it].nm}"><span class="bs-ico">${bsIco(it)}</span></span>`).join('');
    const can = myTurn && !p.out;
    return `<div class="bs-p ${mine ? 'me' : ''} ${g.turn === i && !g.over ? 'turn' : ''} ${p.out ? 'out' : ''} ${BSV.flash === 'p' + i ? 'shot' : ''} ${can && BSV.hold && !mine ? 'aimable' : ''} ${BSV.aimT === i && can ? 'aimed' : ''}" data-bsi="${i}" ${can && BSV.hold && !mine ? `data-bsaim="${i}"` : ''}>
      <div class="bs-pn"><b>${mine && !o.spec ? '나' : esc(p.nm)}</b><span class="bs-tag">${p.out ? '탈락' : p.cuffed ? '⛓️ 묶임' : g.turn === i && !g.over ? '차례' : ''}</span>${bsHP(p.hp, BSV.flash === 'p' + i)}</div>
      <div class="bs-items ${mine ? 'mine' : ''}">${items || '<span class="bs-none">아이템 없음</span>'}</div>
    </div>`;
  };
  const opp = g.pl.map((p, k) => (me + 1 + k) % g.pl.length).filter(i => i !== me).map(i => seat(g.pl[i], i, false)).join('');   // 내 다음 자리부터: 3D 탁자의 왼쪽 → 오른쪽 순서와 같다
  const msg = BSV.msg || (g.over && o.spec ? `🏆 ${esc(g.pl[g.win] ? g.pl[g.win].nm : '?')} 승리` : g.over ? (g.win === me ? '🏆 WIN!' : g.quit && g.quitHalf ? '🏃 기권하고 자리를 떴다' : g.quit ? '🏳️ 기권했다' : '💀 졌다') : myTurn ? (BSV.hold ? (BSV.aimT !== null && BSV.aimT !== undefined ? `${BSV.aimT === me ? '나' : esc(g.pl[BSV.aimT].nm)}에게 겨눴다` : '누구를 쏠까? (아이템은 총을 내려놓고 쓸 수 있다)') : '아이템을 쓰거나 총을 드세요') : `${esc(g.pl[g.turn].nm)} 차례…`);
  const s3 = bs3Want(); BS3.ctx = {g, me, solo:!!o.solo};
  const aim = BSV.aim || (myTurn && BSV.hold && BSV.aimT !== null && BSV.aimT !== undefined ? (BSV.aimT === me ? 'down' : 'up') : 'rest');
  return `${o.solo ? '' : !g.over && o.mine ? '<div class="bs-quit"><button class="btn" data-bsdo="quit">기권</button></div>' : '<div class="bs-quit"></div>'}<div class="bs-table">
    <div class="bs-opps n${g.n - 1}">${opp}</div>
    <div class="bs-stage ${BSV.fx || ''} ${s3 ? 'bs3' : ''} ${myTurn && BSV.hold ? 'aiming' : ''} ${BSV.fx === 'bang' && BSV.flash === 'p' + me ? 'hitme' : ''}">
      ${s3 ? `<div class="bs3-slot" ${myTurn && !BSV.hold ? 'data-bsgun="1" role="button" aria-label="총 들기"' : ''}></div>` : BS3.st === 'loading' || BS3.st === 'idle' ? '<div class="bs3-wait"><i></i><span>테이블 준비 중…</span></div>' : `<div class="bs-lamp"></div>
      <div class="bs-dealer ${BSV.lay && BSV.lay.in && BSV.lay.in.length ? 'feed' : ''} ${BSV.fx === 'rack' ? 'racking' : ''}">${BS_DEALER}<i class="bs-hand l">${BS_HAND}</i><i class="bs-hand r">${BS_HAND}</i></div>
      ${bsLayHTML()}
      <div class="bs-gunwrap aim-${aim} ${BSV.hold || BSV.aim === 'up' || BSV.aim === 'down' ? 'held' : ''} ${g.saw ? 'sawed' : ''}" ${myTurn && !BSV.hold ? 'data-bsgun="1" role="button" aria-label="총 들기"' : ''}><div class="bs-kick">${BS_GUN}<i class="bs-muzzle"></i></div></div>
      `}${myTurn && BSV.hold ? bsAimUI(g, me) : ''}<button class="bs-snd" data-bsdo="snd" aria-label="${BSA.on ? '소리 끄기' : '소리 켜기'}">${bsaIcon()}</button>${BSV.black && !s3 ? '<div class="bs-black"></div>' : ''}${BSV.banner ? `<div class="bs-banner">${BSV.banner}</div>` : ''}
      ${!s3 && BSV.eject !== undefined && BSV.eject !== null ? `<i class="bs-eject ${BSV.eject ? 'live' : 'blank'}"></i>` : ''}
      <div class="bs-count"><span><i class="live"></i>실탄 <b>${g.live}</b></span><span><i class="blank"></i>공포탄 <b>${g.blank}</b></span>${g.saw ? '<span>🪚 톱</span>' : ''}</div>
    </div>
    <p class="bs-peek ${peek ? 'live' : ''}" style="visibility:${peek !== null && peek !== undefined && !g.over ? 'visible' : 'hidden'}">🔍 지금 탄: <b>${peek ? '실탄' : '공포탄'}</b></p>
    <p class="bs-msg">${o.timer ? '<span class="bs-tmr muted" id="mpTimer"></span>' : ''}<span>${msg}</span></p>
    <div class="bs-ctl">${bsCtlHTML(g, me, myTurn)}</div>
    ${seat(g.pl[me], me, true)}
  </div>
  <div class="bs-foot">${o.foot || (g.over && !BSV.busy && o.mine ? `<div class="bm-acts"><button class="btn solid" id="bsEnd">결과 보기</button>${g.win !== me && !g.quit ? '<button class="btn run-btn" id="bsRun">🏃 도망가기</button>' : ''}</div>` : '')}</div>
  <ul class="bm-log bs-log">${g.log.slice(-5).reverse().map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
}
// 위 막대 오른쪽(닫기와 맞은편)의 기권 단추: 6번째 차례까지는 절반 환불 표시
function bsQuitSlot(){
  const sp = $('#gmOv .gm-sp'); if (!sp) return;
  const g = bsS().cur, on = g && !g.over && $('#bsCard .bs-table');
  sp.innerHTML = on ? `<span class="bs-quit"><button class="btn bs-qbtn" data-bsdo="quit">기권${bsTn(g) <= BS_QUIT_TN ? `<small>절반 환불 ${bsTn(g)}/${BS_QUIT_TN}</small>` : ''}</button></span>` : '';
}
function bsRender(){ const c = $('#bsCard'); if (c) c.innerHTML = bsCardHTML(); gmSync(); bsQuitSlot(); }
function bsPaneHTML(){
  if (window.WebGLRenderingContext) setTimeout(bs3Want, 0);   // 도박 탭에서 카드가 보이면 3D 그림을 미리 받아 둔다
  const g = bsS().cur; bsInfo();
  if (!g) return bsCardHTML().replace('id="bsGo"', 'id="bsOpen"');
  return `<div class="card-h"><h2>💥 벅샷 룰렛 ${infoBtn('bs')}</h2><small>판돈 ${fmtUSD(g.stake)}${g.il ? ' · 🚨 불법' : ''}</small></div>
    <p class="mg-desc">진행 중 · ${g.over ? '끝남, 결과를 확인하세요' : `내 목숨 ${g.pl[0].hp} · 딜러 목숨 ${g.pl[1].hp}`}</p>
    <div class="mg-foot"><span class="muted">한도 ${fmtUSDn(gamMax('bs'), 0)}</span><button class="btn solid" id="bsOpen">이어하기</button></div>`;
}
function bsStart(){
  const s = bsS(); if (s.cur) return;
  if (S.over) return toast('파산해서 할 수 없습니다', true);
  betDialog('bs', '💥 벅샷 룰렛', `<p class="muted" style="margin:0 0 8px">딜러와 1:1, 목숨 ${BS.hpMax}. 마지막까지 버티면 판돈 2배</p>`, bet => {
    const first = Math.random() < 0.5 ? 0 : 1;
    const {g, ev} = BSE.newGame(['나', '딜러'], bet, Math.random, first);
    g.il = gamIl(); g.tn = 1; s.cur = g; commit(); gmOpen('bs');
    BSV.msg = ''; bsRender();
    bsPlay(ev, () => bsTick());
  });
}
const bsLoader = g => g && g.pl.length === 2 && g.pl[1].nm === '딜러' && g.pl[0].nm === '나' ? 0 : g ? g.turn : -1;
const bsWait = ms => { const gen = BSV.gen; return new Promise((res, rej) => setTimeout(() => gen === BSV.gen && $('.bs-table') ? res() : rej('stop'), bmMs(ms))); };   // 혼자(#bsCard)·같이(#mbsBody) 모두 판이 보이는 동안만
// 이벤트를 차례로 보여 준다 (쏘기: 총 흔들림 → 실탄이면 번쩍·맞은 쪽 목숨 깜빡, 공포탄이면 딸깍)
// 연출 시작 때의 화면 상태: 끝난 상태(g)에서 이벤트를 거꾸로 되돌린다. 연출하면서 하나씩 다시 적용한다
const BS_EVIT = {peek:'glass', heal:'cig', beer:'beer', saw:'saw', cuff:'cuff'};
function bsViewOf(g, ev){
  const v = {hp:g.pl.map(p => p.hp), out:g.pl.map(p => !!p.out), items:g.pl.map(p => p.items.slice()), live:g.live, blank:g.blank, turn:g.turn, saw:!!g.saw, over:!!g.over, load:g.load || 0};
  const rm = (a, it) => { const k = a.lastIndexOf(it); if (k >= 0) a.splice(k, 1); };
  for (let k = ev.length - 1; k >= 0; k--){
    const e = ev[k];
    if (e.t === 'win') v.over = false;
    else if (e.t === 'shot'){ v.hp[e.target] = e.pre !== undefined ? e.pre : Math.min(BS.hpMax, e.hp + e.dmg); v.out[e.target] = false; if (e.live) v.live++; else v.blank++; v.saw = e.sw !== undefined ? e.sw : e.dmg > 1; v.turn = e.i; }
    else if (e.t === 'load'){ v.load--; v.live -= e.live; v.blank -= e.blank; (e.got || []).forEach((a, i) => a.forEach(it => rm(v.items[i], it))); }
    else if (e.t === 'turn' || e.t === 'skip'){ const a = ev.slice(0, k).reverse().find(x => x.i !== undefined && x.t !== 'skip' && x.t !== 'turn'); if (a) v.turn = a.i; }
    else if (BS_EVIT[e.t]){ v.turn = e.i;   // 쓴 아이템은 되살리지 않는다: 누르는 순간 인벤토리에서 사라진다
      if (e.t === 'heal') v.hp[e.i]--; if (e.t === 'beer'){ if (e.live) v.live++; else v.blank++; } if (e.t === 'saw') v.saw = false; }
  }
  v.live = Math.max(0, v.live); v.blank = Math.max(0, v.blank);
  return v;
}
function bsViewDo(e){
  const v = BSV.view; if (!v) return;
  const rm = (a, it) => { const k = a.indexOf(it); if (k >= 0) a.splice(k, 1); };
  if (e.t === 'shot'){ v.hp[e.target] = e.hp; v.out[e.target] = !!e.out; if (e.live) v.live = Math.max(0, v.live - 1); else v.blank = Math.max(0, v.blank - 1); v.saw = false; }
  else if (e.t === 'load'){ v.load++; v.live += e.live; v.blank += e.blank; (e.got || []).forEach((a, i) => a.forEach(it => v.items[i] && v.items[i].push(it))); }
  else if (e.t === 'turn') v.turn = e.i;
  else if (e.t === 'win') v.over = true;
  else if (BS_EVIT[e.t]){ if (e.t === 'heal') v.hp[e.i] = e.hp; if (e.t === 'beer'){ if (e.live) v.live = Math.max(0, v.live - 1); else v.blank = Math.max(0, v.blank - 1); } if (e.t === 'saw') v.saw = true; }
}
// after: 이 묶음 뒤에 이미 받아 둔(아직 안 보여 준) 이벤트들. 지금 상태에서 그것까지 거꾸로 되돌려야 이 묶음 직전 모습이 된다
async function bsPlay(ev, done, rerender, after){
  rerender = rerender || bsRender;
  BSV.busy = true; BSV.gen++;
  const me = () => rerender.me !== undefined ? rerender.me : 0, G = () => rerender.g ? rerender.g() : bsS().cur;
  const nm = i => i === me() && !rerender.spec ? '나' : esc(G() ? G().pl[i].nm : '?');
  BSV.view = G() ? bsViewOf(G(), ev.concat(after || [])) : null;
  for (let w = 0; (BS3.st === 'loading' || BS3.st === 'idle') && w < 80; w++){ bs3Want(); try { await bsWait(100); } catch(e){ break; } }   // 3D 그림을 받는 동안 2D로 시작하지 않게
  try {
    for (const e of ev){
      if (e.t === 'load'){
        BSV.aim = 'rest'; BSV.eject = null;
        BSV.hold = false; BSV.aimT = null; const n = e.live + e.blank;
        BSV.lay = {live:e.live, blank:e.blank, k:Math.floor(Math.random() * 23), in:[]}; bsViewDo(e); BSV.msg = `실탄 ${e.live} · 공포탄 ${e.blank}`; rerender();
        for (let k = 0; k < n; k++) BSAU.lay(k * 0.07 + 0.15); await bsWait(1800);
        BSV.msg = '딜러가 장전한다…'; rerender();
        for (let k = 0; k < n; k++){ BSV.lay.in.push(k); rerender(); BSAU.insert(0.42); await bsWait(560); }   // 딜러가 탄을 하나씩 집어 넣는다 (손 동작 한 번 = 탄 한 발)
        BSV.lay = null; BSV.rackBy = null; BSV.fx = 'rack'; BSV.msg = '장전 완료'; rerender(); BSAU.rack(0.43); await bsWait(1300);
        BSV.fx = ''; BSV.msg = e.got && e.got.some(x => x.length) ? '아이템을 나눠 받았다' : '장전 완료'; rerender(); await bsWait(600);
      } else if (e.t === 'shot'){
        const self = e.target === e.i, up = (e.target === me()) ? 'down' : 'up';   // 내 쪽(아래)을 쏘면 총구가 아래로
        const byMe = e.i === me(); BSV.hold = false; BSV.aimT = null; BSV.shooter = byMe ? 'me' : 'op'; BSV.si = e.i; BSV.ti = e.target;
        BSV.eject = null; BSV.aim = up; BSV.msg = `${nm(e.i)} → ${self ? (byMe ? '나' : '자기 자신') : nm(e.target)}`; rerender(); await bsWait(byMe ? (BS3.st === 'on' ? (e.target === me() ? 850 : 650) : 250) : 1100);   // 3D는 총이 겨누는 자세까지 다 움직인 뒤에 쏜다 (나를 겨눌 때 움직임이 가장 크다)
        bsViewDo(e); BSV.dmg = e.dmg || 1; BSV.fx = e.live ? 'bang' : 'click'; BSV.flash = e.live ? 'p' + e.target : '';
        if (e.live){ BSAU.shot(e.dmg > 1); if (e.dmg && e.target === me()) BSAU.ring(e.out ? 3.5 : e.dmg > 1 ? 3.3 : 2.0); /* 이명: 암전(1.35/2.6초)+돌아오는 시간만큼 */ if (e.out) BSAU.thud(e.target === me() ? 1.55 : 0.85); } else BSAU.click();
        BSV.msg = e.live ? `💥 실탄! ${nm(e.target)} 목숨 −${e.dmg}${e.out ? ' · 탈락' : ''}` : '공포탄'; rerender();
        if (e.live && e.dmg){
          const hitMe = e.target === me(), big = e.dmg > 1;
          if (hitMe){   // 내가 맞으면 그 순간 시야가 꺼졌다가 돌아온다 (톱으로 자른 총이면 더 오래). 3D는 장면이 직접 어둡게 한다
            await bsWait(50);   // 총구 불꽃을 0.05초 본 뒤 암전
            if (BS3.st !== 'on'){ BSV.black = true; rerender(); }
            await bsWait(e.out ? 550 : big ? 2600 : 1350);
            if (BSV.black){ BSV.black = false; rerender(); } await bsWait(e.out ? 500 : 650);
          } else await bsWait(e.out ? 1300 : BS3.st === 'on' ? (big ? 3300 : 2200) : 900);   // 상대가 맞으면 뒤로 넘어졌다 일어날 때까지 기다린다
        } else await bsWait(e.live ? 1200 : 900);
        BSV.flash = ''; BSV.fx = '';
        BSV.shooter = null; BSV.si = null; BSV.ti = null;   // 겨누던 자세를 풀고 펌프질로 넘어간다
        BSV.rackBy = byMe ? 'me' : e.i; BSV.fx = 'rack'; BSV.eject = e.live; BSV.aim = 'rest'; rerender(); BSAU.rack(0.43); BSAU.drop(0.95); await bsWait(1300);
        BSV.fx = ''; BSV.eject = null;
      } else if (e.t === 'peek'){ bsViewDo(e); BSAU.peek();
        if (BS3.st === 'on'){ BSV.item = {it:'glass', by:e.i === me() ? 'me' : 'op', i:e.i, d:1.5}; BSV.msg = `🔍 ${nm(e.i)} 돋보기로 총을 들여다본다…`; rerender(); await bsWait(700); }
        BSV.fx = 'peek'; BSV.msg = e.i === me() && e.live !== undefined ? `🔍 지금 탄은 ${e.live ? '실탄' : '공포탄'}` : e.i === me() ? '🔍 돋보기로 탄을 확인했다' : `🔍 ${nm(e.i)}이(가) 돋보기로 탄을 확인했다`; rerender(); await bsWait(BS3.st === 'on' ? 900 : 1000); BSV.fx = ''; BSV.item = null;
      } else if (e.t === 'beer'){ BSAU.beer();
        if (BS3.st === 'on'){ BSV.item = {it:'beer', by:e.i === me() ? 'me' : 'op', i:e.i, d:1.3}; BSV.msg = `🍺 ${nm(e.i)} 맥주를 들이켠다…`; rerender(); await bsWait(1300); BSV.item = null; }
        bsViewDo(e);   // 남은 탄 수는 펌프로 탄이 빠지는 순간에 줄인다 (마시기 전에 줄면 결과가 먼저 보인다)
        BSAU.rack(0.43); BSAU.drop(0.95);
        BSV.rackBy = e.i === me() ? 'me' : e.i; BSV.fx = 'rack'; BSV.eject = e.live; BSV.msg = `🍺 탄을 빼냈다: ${e.live ? '실탄' : '공포탄'}`; rerender(); await bsWait(1400); BSV.fx = ''; BSV.eject = null;
      } else if (e.t === 'cuff'){ bsViewDo(e);
        if (BS3.st === 'on'){ BSV.item = {it:'cuff', by:e.i === me() ? 'me' : 'op', i:e.i, t:e.target, d:1.2}; BSAU.cuff(0.62); } else BSAU.cuff();
        BSV.msg = `⛓️ ${nm(e.target)}에게 수갑`; rerender(); await bsWait(BS3.st === 'on' ? 1300 : 800); BSV.item = null; }
      else if (e.t === 'saw'){ bsViewDo(e); BSV.sawBy = e.i === me() ? 'me' : 'op'; BSV.sawI = e.i; BSV.fx = 'saw'; BSV.msg = `🪚 ${nm(e.i)} 총신을 자른다…`; rerender(); if (BS3.st === 'on') BSAU.saw(); await bsWait(BS3.st === 'on' ? 1350 : 500); BSV.msg = '🪚 총신을 잘랐다 · 다음 한 발 2배'; rerender(); await bsWait(700); BSV.fx = ''; }
      else if (e.t === 'heal'){
        if (BS3.st === 'on'){ BSV.item = {it:'cig', by:e.i === me() ? 'me' : 'op', i:e.i, d:1.6}; BSAU.cig(); BSV.msg = `🚬 ${nm(e.i)} 담배를 피운다…`; rerender(); await bsWait(1000); }
        else BSAU.cig();
        bsViewDo(e); BSV.msg = `🚬 ${nm(e.i)} 목숨 +1`; rerender(); await bsWait(BS3.st === 'on' ? 700 : 800); BSV.item = null; }
      else if (e.t === 'skip'){ BSV.msg = `⛓️ ${nm(e.i)} 수갑 때문에 한 번 쉼`; rerender(); await bsWait(900); }
      else if (e.t === 'again'){ BSV.msg = '공포탄 · 한 번 더!'; rerender(); await bsWait(700); }
      else if (e.t === 'turn' || e.t === 'win') bsViewDo(e);
    }
    const G2 = G();
    if (G2 && !G2.over && G2.turn === me() && ev.some(e => (e.t === 'turn' && e.i === me()) || e.t === 'load') && ev.some(e => e.i !== undefined && e.i !== me() && e.t !== 'skip' && e.t !== 'turn' || e.t === 'load')){
      BSV.banner = 'YOUR TURN'; BSV.msg = ''; rerender(); BSAU.turn(); await bsWait(1100); BSV.banner = '';
    }
  } catch(err){ if (err !== 'stop') console.error(err); }
  BSV.busy = false; BSV.view = null; BSV.shooter = null; BSV.si = null; BSV.ti = null; BSV.black = false; BSV.item = null; BSV.msg = ''; BSV.fx = ''; BSV.aim = null; BSV.eject = null; BSV.lay = null; BSV.flash = ''; BSV.want = null; BSV.go = null; BSV.banner = '';
  if (!(rerender.pending && rerender.pending())) rerender();   // 다음 묶음이 기다리면 최신 상태를 미리 그리지 않는다 (결과가 잠깐 보였다 되돌아가는 깜빡임)
  if (done) done();
}
// 컴퓨터 딜러 차례: 한 수씩 둔다
function bsTick(){
  const g = bsS().cur; if (!g || g.over || BSV.busy || g.turn !== 1 || !$('#bsCard')) return;
  clearTimeout(BSV.t);
  BSV.t = setTimeout(() => {
    const g2 = bsS().cur; if (!g2 || g2.over || BSV.busy || g2.turn !== 1) return;
    const a = BSE.ai(g2, 1, Math.random), ev = BSE.step(g2, 1, a, Math.random) || BSE.shoot(g2, 1, 0, Math.random) || [];
    bsTnAdd(g2, ev);
    save();
    bsPlay(ev, () => bsTick());
  }, bmMs(700));
}
// 몇 번째 차례인가 (혼자 할 때만 센다): 첫 차례가 1, 차례가 넘어갈 때마다 +1 (공포탄으로 나를 쏴서 한 번 더 하는 것은 같은 차례)
const BS_QUIT_TN = 6;   // 이 차례까지 기권하면 판돈의 절반을 돌려받는다 (나와 딜러가 3번씩 총을 잡는 동안)
const bsTn = g => g.tn || (g.shots || 0) + 1;
function bsTnAdd(g, ev){ g.tn = bsTn(g) + ev.filter(e => e.t === 'turn').length; }
function bsMine(a){
  const s = bsS(), g = s.cur; if (!g || g.over || BSV.busy || g.turn !== 0) return;
  const ev = BSE.step(g, 0, a, Math.random); if (!ev) return toast('지금 할 수 없습니다', true);
  bsTnAdd(g, ev);
  save();
  bsPlay(ev, () => bsTick());
}
function bsFinish(run){
  const s = bsS(), g = s.cur; if (!g || !g.over || BSV.busy) return;
  const win = g.win === 0, ran = !!run && !win;
  const half = !win && !ran && g.quit && g.quitHalf;
  const pay = win ? Math.round(g.stake * 2 * 100) / 100 : ran ? g.stake : half ? Math.round(g.stake * 50) / 100 : 0;
  if (pay > 0) receiveUSD(pay);
  s.hist.unshift({at:Date.now(), stake:g.stake, pay, win}); s.hist = s.hist.slice(0, 10);
  altLog('gamble', `벅샷 룰렛 ${win ? '승리' : ran ? '패배 → 도망' : half ? '기권 (절반 환불)' : g.quit ? '기권' : '패배'}${g.il ? ' (불법)' : ''}`, pay - g.stake, 'USD');
  s.cur = null; commit(); gmHide();
  police('bs', g.il, pay - g.stake);
  runCheck(); if (ran) runAdd('bs', g.stake);
  showModal(`<h2 class="${win ? 'up' : ''}">${win ? '🏆 WIN!' : ran ? '🏃 도망쳤습니다' : half ? '🏃 기권하고 자리를 떴습니다' : g.quit ? '🏳️ 기권했습니다' : '💀 졌습니다'}</h2>${half ? `<p class="muted">${BS_QUIT_TN}번째 차례 안에 기권해서 판돈의 절반을 돌려받았습니다.</p>` : ''}${ran ? runNote(g.stake) : ''}<div class="bd"><div><span>판돈</span><b class="num">${fmtUSD(g.stake)}</b></div><div><span>받은 돈</span><b class="num">${fmtUSD(pay)}</b></div><div><span>쏜 횟수</span><b class="num">${g.shots}발 · 장전 ${g.load}번</b></div></div><div class="acts"><button class="btn solid" data-close>확인</button></div>`);
}
// 직접 조작 (혼자·같이 하기 같이): 탄 넣기, 펌프, 총 들기, 겨누기. 방아쇠만 혼자/같이 하기가 따로 보낸다
document.addEventListener('click', e => {
  if (e.target.closest('.bs-it')) return;   // 아이템 단추는 아래 처리기에서만 (자리를 겨누는 것으로 번지지 않게)
  const el = e.target.closest('[data-bsshell], [data-bsdo], [data-bsaim], [data-bsgun]'); if (!el || !el.closest('.bs-table, .bs-ctl, .bs-foot, .bs-quit')) return;
  if (el.dataset.bsshell !== undefined && BSV.want === 'load' && BSV.lay){
    const k = +el.dataset.bsshell; if (!BSV.lay.in.includes(k)) BSV.lay.in.push(k);
    el.classList.add('in');
    if (BSV.lay.in.length >= BSV.lay.live + BSV.lay.blank && BSV.go) setTimeout(() => BSV.go && BSV.go(), 250);
    return;
  }
  const d = el.dataset.bsdo;
  if (d === 'loadall' && BSV.want === 'load' && BSV.go){ BSV.go(); return; }
  if (d === 'rack' && BSV.want === 'rack' && BSV.go){ BSV.go(); return; }
  if (d === 'snd'){ bsaToggle(); return; }
  if (d === 'quit'){   // 기권: 혼자면 그 자리에서 진다, 같이 하기면 방에서 나가기(서버가 기권 처리)
    if (!$('#bsCard')){ const b = $('#mpLeave'); if (b) b.click(); return; }
    const g = bsS().cur; if (!g || g.over) return;
    const early = bsTn(g) <= BS_QUIT_TN;
    const c = showModal(`<h2>기권할까요?</h2><p>${early ? `지금은 ${bsTn(g)}번째 차례라 목숨은 그대로 두고 자리를 뜹니다. 판돈의 절반 <b>${fmtUSD(Math.round(g.stake * 50) / 100)}</b>을 돌려받습니다.` : `지금 그 자리에서 진 것으로 끝나고 판돈 <b>${fmtUSD(g.stake)}</b>을 잃습니다.`} 기권하면 도망갈 수 없습니다.</p><p class="muted">${BS_QUIT_TN}번째 차례(나와 딜러가 3번씩 총을 잡을 때)까지 기권하면 판돈의 절반을 돌려받습니다.</p><div class="acts"><button class="btn" data-close>계속하기</button><button class="btn solid" id="bsQuitYes">기권</button></div>`);
    $('#bsQuitYes').onclick = () => { c(); const g2 = bsS().cur; if (!g2 || g2.over) return; BSV.gen++; clearTimeout(BSV.t); g2.quitHalf = bsTn(g2) <= BS_QUIT_TN; if (g2.quitHalf){ g2.over = true; g2.win = 1; } else BSE.forfeit(g2, 0, []); g2.quit = true; save(); BSV.busy = false; BSV.view = null; BSV.lay = null; BSV.fx = ''; BSV.aim = null; BSV.hold = false; BSV.shooter = null; BSV.banner = ''; BSV.msg = ''; bsRender(); };
    return;
  }
  if (BSV.busy) return;
  const rer = () => { if ($('#bsCard')) bsRender(); else if (typeof mbsRer === 'function') mbsRer(); };
  if (d === 'hold' || el.dataset.bsgun){ BSV.hold = true; BSV.aimT = null; rer(); return; }
  if (d === 'drop'){ BSV.hold = false; BSV.aimT = null; rer(); return; }
  if (d === 'reaim'){ BSV.aimT = null; rer(); return; }
  if (el.dataset.bsaim !== undefined && BSV.hold){   // 겨눈 쪽으로 바로 쏜다 (방아쇠 단계 없음)
    const target = +el.dataset.bsaim; BSV.aimT = target;
    if ($('#bsCard')) bsMine({op:'shoot', target}); else if (typeof mbsSend === 'function') mbsSend({op:'shoot', target});
  }
});
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'bsGo'){ bsStart(); return; }
  if (t.id === 'bsOpen'){ gmOpen('bs'); setTimeout(bsTick, 300); return; }
  if (!t.closest('#bsCard')) return;
  if (t.id === 'bsEnd'){ bsFinish(false); return; }
  if (t.id === 'bsRun'){ bsFinish(true); return; }
  const g = bsS().cur; if (!g) return;

  if (t.dataset.bsit){ bsMine({op:'use', it:t.dataset.bsit, target:1}); return; }
});
