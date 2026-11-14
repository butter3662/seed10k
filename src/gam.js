/* ───────── 도박 탭: 불법 모드 · 경찰 단속 · 뱀사다리 · 홀짝 (부루마블은 bm.js) ───────── */
// 판돈 한도(달러): 불법 모드를 끄면 off, 켜면 on. 불법 모드로 한 판을 끝낼 때마다 p의 확률로 경찰 단속
// 단속되면 벌금 대신, 불법 모드로 번 돈(모든 도박 게임 합산 순이익 누적, 진 판은 빼고 셈)의 seize(50%)를 압류하고 누적을 0으로 되돌린다
const GAM = {
  bm:{nm:'부루마블', min:10, off:100, on:1000, p:0.05},
  sl:{nm:'뱀사다리', min:5, off:50, on:500, p:0.025},
  oe:{nm:'홀짝', min:1, off:10, on:100, p:0.05},
  bj:{nm:'블랙잭', min:5, off:100, on:1000, p:0.05},
  bs:{nm:'벅샷 룰렛', min:5, off:100, on:1000, p:0.05},
  seize:0.5
};
function gamS(){
  if (!S.gam || typeof S.gam !== 'object') S.gam = {il:false, bust:0};
  const G = S.gam;
  if (G.oeAcc !== undefined){ G.ilAcc = Math.round(((G.ilAcc || 0) + G.oeAcc) * 100) / 100; delete G.oeAcc; }   // 홀짝만 압류하던 때의 누적을 합산 누적으로
  return G;
}
const ilAcc = () => gamS().ilAcc || 0;   // 불법 도박 누적 순이익 (달러)
const gamIl = () => !!gamS().il;
const gamMax = k => Math.min(gamIl() ? GAM[k].on : GAM[k].off, Math.floor(Math.max(0, S.usd)));
// 판돈 고르기 공통 화면. onStart(bet)
/* ── 판돈 장부 ──
   판돈이 실제로 빠질 때마다 판 열쇠(key)와 금액을 한 줄씩 적고, 판이 시작하고 3초 뒤 그 판의 줄이 정확히 하나인지 확인한다.
   0줄이면(안 빠졌으면) 지금 청구하고, 2줄 이상이면(두 번 빠졌으면) 남는 만큼 돌려준다. 혼자 하기·같이 하기 모두 */
function betBook(){ const G = gamS(); if (!Array.isArray(G.bets)) G.bets = []; return G.bets; }
function betPaid(key, amt){ const L = betBook(); L.push({k:key, a:Math.round(+amt * 100) / 100, t:Date.now()}); if (L.length > 300) L.splice(0, L.length - 300); }
const betHas = key => betBook().some(x => x.k === key);
function betAudit(key, amt, nm){
  const L = betBook(), mine = L.filter(x => x.k === key), n = mine.length;
  amt = Math.round(+amt * 100) / 100;
  if (n === 1 || !(amt > 0)) return n;
  if (n === 0){
    const od = spendUSD(amt); betPaid(key, amt);
    altLog('gamble', `🧾 ${nm} 판돈 확인: 빠지지 않아 청구`, -amt, 'USD');
    toast(`🧾 ${nm}: 판돈 ${fmtUSDn(amt)}이 빠지지 않아 지금 냈습니다${od > 0 ? ` (마이너스통장 ${fmtUSDn(od)})` : ''}`);
  } else {
    const extra = Math.round(amt * (n - 1) * 100) / 100;
    let keep = false; for (let i = 0; i < L.length; i++) if (L[i].k === key){ if (keep){ L.splice(i, 1); i--; } else keep = true; }
    receiveUSD(extra);
    altLog('gamble', `🧾 ${nm} 판돈 확인: ${n}번 빠져 ${n - 1}번분 돌려줌`, extra, 'USD');
    toast(`🧾 ${nm}: 판돈이 ${n}번 빠져 ${fmtUSDn(extra)}을 돌려받았습니다`);
  }
  commit();
  return n;
}
const BET_AUDIT_MS = 3000;
function betDialog(k, title, extraHTML, onStart, noPay){   // noPay: 판돈을 여기서 빼지 않는다 (같이 하기: 판이 시작할 때 서버가 가져간다)
  const G = GAM[k];
  if (typeof gmHide === 'function') gmHide();   // 판이 끝난 게임 화면에서 '새 게임'을 누르면 그 화면을 닫고 판돈 창만 띄운다 (창 두 겹 방지). 시작하면 onStart가 다시 연다
  UI.betIn = UI.betIn || {};
  const close = showModal(`<h2>${title}</h2>${extraHTML || ''}<div id="betBox"></div>
    <div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="betGo">${noPay ? '방 만들기' : '시작'}</button></div>`);
  const draw = () => {
    const box = $('#betBox'); if (!box) return;
    const max = gamMax(k), lim = gamIl() ? G.on : G.off;
    const bet = parseFloat(String(UI.betIn[k] || '').replace(/,/g, '')) || 0;
    const err = max < G.min ? `달러 통장에 ${fmtUSDn(G.min)} 이상 있어야 합니다.` : bet && (bet < G.min || bet > max) ? `판돈은 ${fmtUSDn(G.min, 0)}~${fmtUSDn(max, 0)}입니다.` : '';
    box.innerHTML = `<p style="margin:0 0 6px">판돈 (한도 ${fmtUSDn(lim, 0)}${gamIl() ? ', 🚨 불법 모드' : ''} · 달러 통장 ${fmtUSDn(S.usd)})</p>
      <label class="amt"><span>$</span><input id="betIn" type="text" inputmode="decimal" placeholder="${G.min}~${max}" value="${esc(UI.betIn[k] || '')}"></label>
      <div class="quick" style="margin:8px 0">${[1, 5, 10, 50, 100, 500].filter(v => v >= G.min && v <= max).map(v => `<button data-betq="${v}">$${v}</button>`).join('')}${max >= G.min ? `<button data-betq="${max}">최대</button>` : ''}</div>
      ${gamIl() ? `<p class="muted" style="margin:0 0 6px">불법 모드: 이 판이 끝날 때 ${(G.p * 100).toFixed(1)}% 확률로 경찰 단속 (불법 도박으로 번 돈(지금 ${fmtUSDn(Math.max(0, ilAcc()))})의 ${GAM.seize * 100}% 압류, 랭킹 이름에 영구 빨간 줄)</p>` : ''}
      <div class="err" role="status">${esc(err)}</div>`;
    $('#betGo').disabled = !!err || !(bet >= G.min && bet <= max);
    const inp = $('#betIn');
    inp.addEventListener('input', () => { UI.betIn[k] = inp.value.replace(/[^\d.]/g, ''); const pos = inp.selectionStart; draw(); const i2 = $('#betIn'); i2.focus(); try { i2.setSelectionRange(pos, pos); } catch(e){} });
    box.querySelectorAll('[data-betq]').forEach(x => x.onclick = () => { UI.betIn[k] = x.dataset.betq; draw(); });
  };
  draw();
  $('#betGo').onclick = () => {
    const bet = Math.round((parseFloat(UI.betIn[k]) || 0) * 100) / 100;
    if (!(bet >= G.min && bet <= gamMax(k))) return;
    const key = `${k}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    if (!noPay){ S.usd = Math.round((S.usd - bet) * 100) / 100; betPaid(key, bet); }
    UI.betIn[k] = '';
    close();
    setTimeout(() => onStart(bet), 180);
    if (!noPay) setTimeout(() => betAudit(key, bet, G.nm), 180 + BET_AUDIT_MS);   // 같이 하기(noPay)는 시작할 때 따로 확인한다
  };
}
// 판이 끝날 때. il: 그 판을 불법 모드로 시작했는지. 단속되면 true
// 판이 끝날 때. il: 그 판을 불법 모드로 시작했는지, net: 그 판의 손익(받은 돈 - 판돈). 단속되면 true
function police(k, il, net){
  if (!il) return false;
  const G = gamS();
  G.ilAcc = Math.round((ilAcc() + (+net || 0)) * 100) / 100;   // 불법 도박 누적 순이익 (단속 판의 손익까지 넣고 압류)
  if (Math.random() >= GAM[k].p){ save(); return false; }
  G.bust = (G.bust || 0) + 1; G.bustAt = Date.now();
  const acc = Math.max(0, G.ilAcc), amt = Math.round(acc * GAM.seize * 100) / 100;
  G.ilAcc = 0;   // 압류하고 누적은 처음부터
  const od = amt > 0 ? spendUSD(amt) : 0;
  if (amt > 0) altLog('police', `🚨 경찰 단속 (${GAM[k].nm}) 압류`, -amt, 'USD');
  commit();
  markBusted(k);
  const what = acc > 0 ? `지금까지 불법 도박으로 번 돈 ${fmtUSDn(acc)}의 ${GAM.seize * 100}%인 <b>${fmtUSDn(amt)}</b>을 압류당했습니다` : '불법 도박으로 번 돈이 없어 압류할 것은 없었습니다';
  const html = `<div class="police"><div class="siren"><i></i><i></i></div><h2>🚨 경찰 단속!</h2>
      <p>불법 도박(${GAM[k].nm}) 현장이 적발됐습니다. ${what}${od > 0 ? ` (달러가 모자라 마이너스통장에서 ${fmtUSDn(od)})` : ''}.</p>
      <p class="muted">랭킹의 이름에 빨간 줄이 영구히 그어지고, 옆에 단속 횟수(지금 ${G.bust}회째)가 표시됩니다.</p></div>
      <div class="acts"><button class="btn solid" data-close>확인</button></div>`;
  // 결과 창이 떠 있으면 닫힌 뒤에 띄운다
  const tryShow = () => { if ($('#modal').hidden) showModal(html); else setTimeout(tryShow, 300); };
  setTimeout(tryShow, 900);
  return true;
}
/* ── 도망가기 (컴퓨터와 하는 판에서 졌을 때) ──
   진 판에서 '도망가기'를 누르면 잃을 돈을 내지 않는다(판돈을 돌려받는다). 대신 그 뒤 도박 판(어떤 게임이든, 같이 하기 포함)이
   끝날 때마다 RUN.p 확률로 적발되는지 본다. RUN.n판 동안 안 걸리면 끝. 걸리면 안 낸 돈의 RUN.mult배를 압수하고 전과(단속 횟수) 1회.
   한 번이라도 걸릴 확률 = 1 − (1 − p)ⁿ = 1 − 0.85⁵ ≈ 55.6%, 평균 압수액 ≈ 0.556 × 2 = 1.11배 → 평균적으로는 그냥 내는 것(1배)보다 조금 손해 */
const RUN = {p:0.15, n:5, mult:2};
function runS(){ const G = gamS(); if (!Array.isArray(G.runs)) G.runs = []; return G.runs; }
function runAdd(k, loss){
  loss = Math.round(loss * 100) / 100; if (!(loss > 0)) return;
  runS().push({k, amt:loss, left:RUN.n, at:Date.now()});
  altLog('gamble', `🏃 ${GAM[k] ? GAM[k].nm : k}에서 도망 (${fmtUSDn(loss)} 안 냄)`, 0, 'USD');
  save();
}
const runNote = loss => `<p class="muted">이후 도박 ${RUN.n}판 동안 판이 끝날 때마다 ${RUN.p * 100}% 확률로 적발됩니다. 걸리면 안 낸 돈의 ${RUN.mult}배(<b>${fmtUSDn(loss * RUN.mult)}</b>)를 압수당하고 전과(랭킹의 단속 횟수)가 1회 늘어납니다.</p>`;
// 도박 한 판이 끝날 때마다 (도망친 그 판보다 먼저 부른다: 그 판은 지난 도주들에게 '이후 판'이다)
function runCheck(){
  const G = gamS(), runs = runS(); if (!runs.length) return;
  const caught = [];
  for (const r of runs){ r.left--; if (Math.random() < RUN.p) caught.push(r); }
  G.runs = runs.filter(r => !caught.includes(r) && r.left > 0);
  if (!caught.length){ save(); return; }
  let tot = 0, od = 0;
  for (const r of caught){
    const amt = Math.round(r.amt * RUN.mult * 100) / 100; tot += amt;
    od += spendUSD(amt) || 0;
    G.bust = (G.bust || 0) + 1; G.bustAt = Date.now();
    altLog('police', `🚔 도주 적발 (${GAM[r.k] ? GAM[r.k].nm : r.k}): 안 낸 ${fmtUSDn(r.amt)}의 ${RUN.mult}배 압수`, -amt, 'USD');
    markBusted('run');
  }
  commit();
  const html = `<div class="police"><div class="siren"><i></i><i></i></div><h2>🚔 도주 적발!</h2>
      <p>${caught.map(r => `${GAM[r.k] ? GAM[r.k].nm : r.k}에서 안 낸 ${fmtUSDn(r.amt)}`).join(', ')}이(가) 들통났습니다. ${RUN.mult}배인 <b>${fmtUSDn(Math.round(tot * 100) / 100)}</b>을 압수당했습니다${od > 0 ? ` (달러가 모자라 마이너스통장에서 ${fmtUSDn(od)})` : ''}.</p>
      <p class="muted">전과가 ${caught.length}회 늘었습니다 (단속 ${G.bust}회째). 랭킹의 이름에 빨간 줄과 횟수가 표시됩니다.</p></div>
      <div class="acts"><button class="btn solid" data-close>확인</button></div>`;
  const tryShow = () => { if ($('#modal').hidden) showModal(html); else setTimeout(tryShow, 300); };
  setTimeout(tryShow, 1400);
}
// 랭킹 빨간 줄: 서버의 seed10k_busted 표에 한 번 남기면 지울 수 없다 (supabase/seed10k_busted.sql)
// 단속 횟수: seed10k_busts 표에 단속마다 한 줄 (supabase/seed10k_busts.sql). 넣기·읽기만 되고 고치기·지우기는 안 된다
async function markBusted(k){
  if (!ACC.sb || !ACC.user) return;
  const uid = ACC.user.id;
  try { await ACC.sb.from('seed10k_busted').insert({user_id:uid}); } catch(e){}
  try { await ACC.sb.from('seed10k_busts').insert({user_id:uid, game:k || null}); } catch(e){}
  ACC.busted = ACC.busted instanceof Map ? ACC.busted : new Map();
  ACC.busted.set(uid, (ACC.busted.get(uid) || 0) + 1);
}

/* ── 도박 탭 화면 ── */
function renderGamblePane(p){
  // 뱀사다리는 없앴다 (벅샷 룰렛으로 바뀜): 하던 판이 있으면 판돈을 돌려준다
  if (S.sl && S.sl.cur){ const st = S.sl.cur.stake || 0; S.sl.cur = null; if (st > 0){ receiveUSD(st); altLog('gamble', '뱀사다리가 없어져 하던 판의 판돈 환불', 0, 'USD'); } commit(); toast(`뱀사다리가 없어져 하던 판의 판돈 ${fmtUSD(st)}을 돌려드렸습니다`); }
  const il = gamIl(), G = gamS();
  p.innerHTML = `<section class="card c-mg" id="mpCard">${mpCardHTML()}</section>
    <section class="card gam-il ${il ? 'on' : ''}"><div class="card-h"><h2>${il ? '🚨' : '🎲'} 불법 모드</h2><button class="sw ${il ? 'on' : ''}" id="ilSw" role="switch" aria-checked="${il}"><i></i></button></div>
      <p class="mg-desc">${il ? '켜짐' : '꺼짐'}: 판돈 한도 ${['bm', 'bs', 'oe', 'bj'].map(k => `${GAM[k].nm} ${fmtUSDn(il ? GAM[k].on : GAM[k].off, 0)}`).join(' · ')}</p>
      <p class="muted" style="margin:4px 0 0">켜면 한도가 10배가 되지만, 한 판이 끝날 때마다 경찰 단속 확률이 있습니다 (${['bm', 'bs', 'oe', 'bj'].map(k => `${GAM[k].nm} ${(GAM[k].p * 100).toFixed(1)}%`).join(' · ')}). 단속되면 지금까지 불법 도박(모든 게임 합산)으로 번 돈의 ${GAM.seize * 100}%를 압류하고, 랭킹 이름에 영구 빨간 줄과 단속 횟수가 표시됩니다.</p>
      ${il || ilAcc() ? `<p class="muted" style="margin:4px 0 0">불법 도박 누적 순이익 <b class="num ${cls(ilAcc())}">${signUSD(ilAcc())}</b> · 단속되면 ${GAM.seize * 100}% 압류</p>` : ''}${G.bust ? `<p style="margin:4px 0 0"><b class="down">단속 ${G.bust}회</b></p>` : ''}</section>
    ${runS().length ? `<section class="card run-card"><div class="card-h"><h2>🏃 도주 중</h2><small>${runS().length}건</small></div>
      <p class="mg-desc">${runS().map(r => `${GAM[r.k] ? GAM[r.k].nm : r.k} ${fmtUSDn(r.amt)} · 남은 ${r.left}판`).join('<br>')}</p>
      <p class="muted" style="margin:4px 0 0">도박 판이 끝날 때마다 건마다 ${RUN.p * 100}% 확률로 적발 → 안 낸 돈의 ${RUN.mult}배 압수 + 전과 1회</p></section>` : ''}
    <section class="card c-mg" id="bmCard">${bmCardHTML()}</section>
    <section class="card c-mg" id="bsPane">${bsPaneHTML()}</section>
    <section class="card c-mg" id="oePane">${oePaneHTML()}</section>
    <section class="card c-mg" id="bjPane">${bjPaneHTML()}</section>`;
}
/* ── 홀짝·블랙잭은 팝업(전체 화면)에서 한다: 탭 화면을 내리지 않아도 되게 ──
   팝업 안 카드의 id가 oeCard/bjCard라 기존 그리기 함수(oeRender, bjRender)가 그대로 팝업을 그린다 */
const GMO = {oe:{t:'✊ 홀짝', id:'oeCard', html:() => oeCardHTML(), start:() => oeStart(), cur:() => oeS().cur},
             bj:{t:'🃏 블랙잭', id:'bjCard', html:() => bjHTML(), start:() => bjStart(), cur:() => bjS().cur},
             bs:{t:'💥 벅샷 룰렛', id:'bsCard', html:() => bsCardHTML(), start:() => bsStart(), cur:() => bsS().cur}};
function gmOpen(k){
  let ov = $('#gmOv');
  // 진행 중인 판이 없으면 판돈 창만 띄운다 (판을 시작하면 그때 이 화면을 연다: 창이 두 겹으로 보이지 않게)
  if (!GMO[k].cur() && (!ov || ov.hidden)){ if (!S.over) GMO[k].start(); else toast('파산해서 할 수 없습니다', true); return; }
  if (!ov){ ov = document.createElement('div'); ov.id = 'gmOv'; ov.className = 'bm-ov gm-ov'; ov.setAttribute('role', 'dialog'); document.body.appendChild(ov); }
  ov.dataset.k = k; ov.hidden = false; document.documentElement.classList.add('bm-open');
  ov.innerHTML = `<div class="bm-top"><button class="btn" id="gmClose">닫기</button><div class="bm-ttl"><b>${GMO[k].t}</b><small>달러 통장 ${fmtUSD(S.usd)}</small></div><span class="gm-sp"></span></div>
    <section class="card c-mg gm-body" id="${GMO[k].id}">${GMO[k].html()}</section>`;
  if (k === 'bs' && typeof bsQuitSlot === 'function') bsQuitSlot();
}
function gmHide(){
  const ov = $('#gmOv'); if (!ov || ov.hidden) return;
  ov.hidden = true; ov.innerHTML = ''; document.documentElement.classList.remove('bm-open');
  if (UI.tab === 'market') renderInvest();
}
const gmSync = () => { const ov = $('#gmOv'); if (ov && !ov.hidden){ const sm = ov.querySelector('.bm-ttl small'); if (sm) sm.textContent = `달러 통장 ${fmtUSD(S.usd)}`; } };
// 도박 탭의 요약 카드 (진행 중이면 '이어하기')
function oePaneHTML(){
  const g = oeS().cur;
  if (!g) return oeCardHTML().replace('id="oeGo"', 'id="oeOpen"');
  return `<div class="card-h"><h2>✊ 홀짝 ${infoBtn('oe')}</h2><small>판돈 ${fmtUSD(g.stake)}${g.il ? ' · 🚨 불법' : ''}</small></div>
    <p class="mg-desc">진행 중 · ${g.over ? '끝남, 결과를 확인하세요' : `${g.k}번 맞힘, 지금 상금 ${fmtUSD(oePot(g))}`}</p>
    <div class="mg-foot"><span class="muted">한도 ${fmtUSDn(gamMax('oe'), 0)}</span><button class="btn solid" id="oeOpen">이어하기</button></div>`;
}
function bjPaneHTML(){
  const g = bjS().cur;
  if (!g) return bjHTML().replace('id="bjGo"', 'id="bjOpen"');
  return `<div class="card-h"><h2>🃏 블랙잭 ${infoBtn('bj')}</h2><small>판돈 ${fmtUSD(g.stake)}${g.il ? ' · 🚨 불법' : ''}</small></div>
    <p class="mg-desc">진행 중 · ${g.phase === 'over' ? '끝남, 정산하세요' : `건 돈 ${fmtUSD(g.cost)}`}</p>
    <div class="mg-foot"><span class="muted">한도 ${fmtUSDn(gamMax('bj'), 0)}</span><button class="btn solid" id="bjOpen">이어하기</button></div>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'ilSw'){ const G = gamS(); G.il = !G.il; save(); renderInvest(); toast(G.il ? '🚨 불법 모드를 켰습니다' : '불법 모드를 껐습니다'); return; }
  if (t.id === 'slGo'){ slStart(); return; }
  if (t.id === 'oeGo'){ oeStart(); return; }
  if (t.id === 'oeOpen'){ gmOpen('oe'); return; }
  if (t.id === 'bjOpen'){ gmOpen('bj'); return; }
  if (t.id === 'gmClose'){ gmHide(); return; }
  if (t.dataset.oe){ oePick(t.dataset.oe); return; }
});

/* ── 뱀사다리: 1~100칸, 주사위 1개, 컴퓨터 1명과 경주 ──
   사다리 아래에 서면 위로, 뱀 머리에 서면 꼬리로. 100을 넘치는 눈이 나오면 넘친 만큼 뒤로 물러난다. 먼저 100에 도착하면 이긴다.
   이기면 판돈의 2배 (먼저 굴리는 쪽은 무작위라 기대값은 판돈과 같다) */
const SL_LAD = {1:38, 4:14, 9:31, 21:42, 28:84, 36:44, 51:67, 71:91, 80:100};
const SL_SNK = {16:6, 47:26, 49:11, 56:53, 62:19, 64:60, 87:24, 93:73, 95:75, 98:78};
const SLE = {
  newGame(stake, il, rnd){ const first = rnd() < 0.5 ? 0 : 1; return {v:1, stake, il, pos:[0, 0], turn:first, first, over:false, win:-1, dice:null, log:[`${first ? '컴퓨터' : '나'}부터 시작`]}; },
  roll(g, rnd){
    const i = g.turn, ev = [], d = 1 + Math.floor(rnd() * 6), from = g.pos[i];
    g.dice = d; ev.push({t:'dice', i, d});
    let to = from + d, path = [];
    for (let k = from + 1; k <= Math.min(to, 100); k++) path.push(k);
    if (to > 100){ const back = to - 100; for (let k = 99; k >= 100 - back; k--) path.push(k); to = 100 - back; }
    ev.push({t:'move', i, path});
    const nm = i ? '컴퓨터' : '나';
    if (SL_LAD[to]){ ev.push({t:'ladder', i, from:to, to:SL_LAD[to]}); g.log.push(`${nm} ${d} → ${to}칸 사다리 타고 ${SL_LAD[to]}칸`); to = SL_LAD[to]; }
    else if (SL_SNK[to]){ ev.push({t:'snake', i, from:to, to:SL_SNK[to]}); g.log.push(`${nm} ${d} → ${to}칸 뱀에게 물려 ${SL_SNK[to]}칸`); to = SL_SNK[to]; }
    else g.log.push(`${nm} ${d} → ${to}칸`);
    if (g.log.length > 30) g.log.splice(0, g.log.length - 30);
    g.pos[i] = to;
    if (to === 100){ g.over = true; g.win = i; ev.push({t:'win', i}); }
    else g.turn = 1 - i;
    return ev;
  }
};
function slS(){ if (!S.sl || typeof S.sl !== 'object') S.sl = {cur:null, hist:[]}; return S.sl; }
function slCardHTML(){
  const s = slS(), g = s.cur;
  const h = s.hist.slice(0, 3).map(x => `<span class="${cls(x.pay - x.stake)}">${x.win ? '승' : '패'} ${signUSD(x.pay - x.stake)}</span>`).join(' · ');
  INFO.sl = {t:'뱀사다리', h:`<div class="prose"><ul><li>1~100칸 보드에서 컴퓨터와 번갈아 주사위 1개를 굴립니다. 누가 먼저 굴릴지는 무작위입니다.</li>
    <li>사다리 아래 칸에 서면 사다리 위로 올라가고, 뱀 머리 칸에 서면 꼬리로 떨어집니다. 사다리 ${Object.keys(SL_LAD).length}개, 뱀 ${Object.keys(SL_SNK).length}마리 (널리 쓰이는 보드 배치).</li>
    <li>정확히 100칸에 서야 합니다. 넘치는 눈이 나오면 넘친 만큼 뒤로 물러납니다.</li>
    <li>먼저 100칸에 도착하면 판돈의 2배를 받고, 지면 판돈을 잃습니다. 판돈 한도: ${fmtUSDn(GAM.sl.off, 0)} (불법 모드 ${fmtUSDn(GAM.sl.on, 0)}).</li></ul></div>`};
  return `<div class="card-h"><h2>🐍 뱀사다리 ${infoBtn('sl')}</h2><small>이기면 2배</small></div>
    <p class="mg-desc">${g ? `진행 중: 나 ${g.pos[0]}칸 · 컴퓨터 ${g.pos[1]}칸, 판돈 ${fmtUSD(g.stake)}` : h ? `최근 ${h}` : '컴퓨터와 1~100칸 경주. 사다리는 올라가고 뱀은 떨어진다'}</p>
    <div class="mg-foot"><span class="muted">${g ? '' : `한도 ${fmtUSDn(gamMax('sl'), 0)}`}</span><button class="btn solid" id="slGo" ${!g && S.over ? 'disabled' : ''}>${g ? '이어 하기' : '새 게임'}</button></div>`;
}
function slStart(){
  const s = slS();
  if (s.cur) return slOpen();
  if (S.over) return toast('파산해서 할 수 없습니다', true);
  betDialog('sl', '🐍 뱀사다리', '<p class="muted" style="margin:0 0 8px">먼저 100칸에 도착하면 판돈의 2배</p>', bet => {
    s.cur = SLE.newGame(bet, gamIl(), Math.random); commit(); slOpen();
  });
}
const SLV = {busy:false, gen:0, tok:null};
// 칸 번호(1~100) → 10×10 격자 [행, 열] (1행이 맨 위. 1칸은 왼쪽 아래, 줄마다 방향이 바뀐다)
function slRC(n){ const r = Math.floor((n - 1) / 10), c = (n - 1) % 10; return [10 - r, r % 2 ? 10 - c : c + 1]; }
function slXY(n, w){ if (n <= 0) return [-0.5 * w / 10, w - 0.5 * w / 10]; const [r, c] = slRC(n), s = w / 10; return [(c - 0.5) * s, (r - 0.5) * s]; }
function slOpen(){
  const g = slS().cur; if (!g) return;
  let ov = $('#slOv');
  if (!ov){ ov = document.createElement('div'); ov.id = 'slOv'; ov.className = 'bm-ov'; ov.setAttribute('role', 'dialog'); document.body.appendChild(ov); }
  ov.hidden = false; document.documentElement.classList.add('bm-open');
  SLV.gen++; SLV.busy = false; SLV.tok = null;
  const cells = slCellsHTML();
  ov.innerHTML = `<div class="bm-top"><button class="btn" id="slClose">닫기</button><div class="bm-ttl"><b>🐍 뱀사다리</b><small>판돈 ${fmtUSD(g.stake)}${g.il ? ' · 🚨 불법' : ''}</small></div><button class="btn" id="slQuit">기권</button></div>
    <div class="sl-board" id="slBoard">${cells}<svg class="sl-svg" id="slSvg"></svg><div class="sl-tok" data-sltok="0" style="--pc:${BM.cols[0]}"><span>나</span></div><div class="sl-tok" data-sltok="1" style="--pc:${BM.cols[1]}"><span>컴</span></div><div class="bm-fx" id="slFx"></div></div>
    <div class="sl-panel"><div class="bm-row"><div class="bm-dice" id="slDice">${bmDieHTML()}</div><div class="bm-msg" id="slMsg"></div></div><div class="bm-act" id="slAct"></div><ul class="bm-log" id="slLog"></ul></div>`;
  slDraw(); slUpdate(); slTick();
}
// 뱀(곡선)·사다리(가로대) 그리기 (같이 하기 판도 같은 그림을 쓴다)
function slSvgHTML(w){
  const s = w / 10;
  let h = '';
  for (const [a, z] of Object.entries(SL_LAD)){
    const [x1, y1] = slXY(+a, w), [x2, y2] = slXY(z, w), dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L * s * 0.16, ny = dx / L * s * 0.16;
    h += `<g class="sl-lad"><line x1="${x1 + nx}" y1="${y1 + ny}" x2="${x2 + nx}" y2="${y2 + ny}"/><line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x2 - nx}" y2="${y2 - ny}"/>`;
    const n = Math.max(2, Math.round(L / (s * 0.4)));
    for (let k = 1; k < n; k++){ const t = k / n, cx = x1 + dx * t, cy = y1 + dy * t; h += `<line class="rung" x1="${cx + nx}" y1="${cy + ny}" x2="${cx - nx}" y2="${cy - ny}"/>`; }
    h += '</g>';
  }
  const cols = ['#3FB96B', '#E0484E', '#9C7BD9', '#E2B94B', '#4C9AFF'];
  Object.entries(SL_SNK).forEach(([a, z], i) => {
    const [x1, y1] = slXY(+a, w), [x2, y2] = slXY(z, w), dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, A = Math.min(s * 0.5, L * 0.18);
    const p1 = [x1 + dx * 0.33 + nx * A, y1 + dy * 0.33 + ny * A], p2 = [x1 + dx * 0.66 - nx * A, y1 + dy * 0.66 - ny * A];
    const c = cols[i % cols.length];
    h += `<path class="sl-snk" stroke="${c}" d="M${x1} ${y1} C ${p1[0]} ${p1[1]}, ${p2[0]} ${p2[1]}, ${x2} ${y2}"/><circle cx="${x1}" cy="${y1}" r="${s * 0.2}" fill="${c}"/><circle cx="${x1 - s * 0.07}" cy="${y1 - s * 0.05}" r="${s * 0.045}" fill="#fff"/><circle cx="${x1 + s * 0.07}" cy="${y1 - s * 0.05}" r="${s * 0.045}" fill="#fff"/>`;
  });
  return h;
}
function slCellsHTML(){ return Array.from({length:100}, (_, k) => { const n = k + 1, [r, c] = slRC(n); return `<div class="sl-c ${(r + c) % 2 ? 'a' : 'b'}" style="grid-row:${r};grid-column:${c}"><span>${n}</span></div>`; }).join(''); }
function slDraw(){
  const b = $('#slBoard'), svg = $('#slSvg'); if (!b || !svg) return;
  const w = b.clientWidth; svg.setAttribute('viewBox', `0 0 ${w} ${w}`);
  svg.innerHTML = slSvgHTML(w);
  slPlace(true);
}
function slPlace(instant){
  const g = slS().cur, b = $('#slBoard'); if (!g || !b) return;
  const w = b.clientWidth, pos = SLV.tok || g.pos, sz = w / 10 * 0.5;
  [0, 1].forEach(i => {
    const t = document.querySelector(`[data-sltok="${i}"]`); if (!t) return;
    const [x, y] = slXY(pos[i], w), off = (i ? 1 : -1) * sz * 0.32;
    if (instant) t.style.transition = 'none';
    t.style.width = t.style.height = sz + 'px';
    t.style.transform = `translate(${x - sz / 2 + off}px, ${y - sz / 2}px)`;
    if (instant){ t.offsetWidth; t.style.transition = ''; }
  });
}
function slUpdate(){
  const g = slS().cur; if (!g || !$('#slOv')) return;
  const act = $('#slAct');
  $('#slQuit').hidden = g.over;
  if (g.over && !SLV.busy) act.innerHTML = `<button class="btn solid bm-roll" id="slEnd">결과 보기</button>${g.win !== 0 ? '<button class="btn run-btn" id="slRun">🏃 도망가기</button>' : ''}`;
  else if (SLV.busy || g.turn !== 0) act.innerHTML = `<p class="bm-wait">${g.turn ? '컴퓨터' : '내'} 차례…</p>`;
  else act.innerHTML = `<button class="btn solid bm-roll" id="slRoll">🎲 주사위 굴리기</button>`;
  $('#slLog').innerHTML = SLV.busy ? $('#slLog').innerHTML : g.log.slice(-4).reverse().map(s => `<li>${esc(s)}</li>`).join('');
  slPlace(false);
}
function slWait(ms){ const gen = SLV.gen; return new Promise((res, rej) => setTimeout(() => (gen === SLV.gen && $('#slOv') && !$('#slOv').hidden) ? res() : rej('stop'), bmMs(ms))); }
async function slPlay(ev, pos0){
  const g = slS().cur; SLV.busy = true; SLV.tok = pos0.slice(); slUpdate();
  const fx = $('#slFx'), w = $('#slBoard').clientWidth;
  const tokEl = i => document.querySelector(`[data-sltok="${i}"]`);
  try {
    for (const e of ev){
      if (e.t === 'dice'){
        $('#slMsg').textContent = `${e.i ? '컴퓨터' : '나'} 굴리는 중…`;
        const c = $('#slDice .bm-cube'), box = $('#slDice');
        box.classList.add('rolling'); c.style.transition = 'none'; c.style.transform = `rotateX(${Math.random() * 360}deg) rotateY(${Math.random() * 360}deg)`; c.offsetWidth;
        c.style.transition = `transform ${bmMs(700)}ms cubic-bezier(.2,.75,.25,1)`; c.style.transform = `rotateX(720deg) rotateY(720deg) ` + BM_FACE[e.d];
        await slWait(720); box.classList.remove('rolling');
        $('#slMsg').textContent = `${e.i ? '컴퓨터' : '나'}: ${e.d}`;
        await slWait(180);
      } else if (e.t === 'move'){
        for (const k of e.path){
          SLV.tok[e.i] = k; const t = tokEl(e.i), inner = t.querySelector('span');
          t.style.transition = `transform ${bmMs(140)}ms ease-out`; inner.classList.remove('hop'); inner.offsetWidth; inner.classList.add('hop');
          slPlace(false); await slWait(150);
        }
      } else if (e.t === 'ladder' || e.t === 'snake'){
        bmBannerIn(fx, e.t === 'ladder' ? `🪜 사다리! ${e.from} → ${e.to}` : `🐍 뱀! ${e.from} → ${e.to}`, e.t === 'ladder' ? (e.i ? '' : 'green') : (e.i ? '' : 'red'), 900);
        await slWait(380);
        SLV.tok[e.i] = e.to; const t = tokEl(e.i);
        t.style.transition = `transform ${bmMs(e.t === 'ladder' ? 650 : 800)}ms ${e.t === 'ladder' ? 'ease-in-out' : 'cubic-bezier(.5,0,.7,1)'}`;
        slPlace(false); await slWait(e.t === 'ladder' ? 700 : 850);
      } else if (e.t === 'win'){
        bmBannerIn(fx, e.i ? '😵 컴퓨터 승리' : '🏆 내가 이겼다!', e.i ? 'red' : 'gold', 1600);
        if (!e.i) bmConfettiIn(fx);
        await slWait(600);
      }
    }
  } catch(err){ if (err !== 'stop') console.error(err); SLV.busy = false; SLV.tok = null; return; }
  SLV.busy = false; SLV.tok = null; slUpdate();
  if (!g.over && g.turn === 1){ const gen = SLV.gen; setTimeout(() => { if (gen === SLV.gen) slTick(); }, bmMs(400)); }
}
function slTick(){
  const g = slS().cur; if (!g || SLV.busy || !$('#slOv') || $('#slOv').hidden) return;
  slUpdate();
  if (g.over || g.turn === 0) return;
  const pos0 = g.pos.slice(), ev = SLE.roll(g, Math.random); save(); slPlay(ev, pos0);
}
function slHide(){ SLV.gen++; SLV.busy = false; const ov = $('#slOv'); if (ov && !ov.hidden){ ov.hidden = true; document.documentElement.classList.remove('bm-open'); if (UI.tab === 'market') renderInvest(); } }
function slFinish(forfeit, run){
  const s = slS(), g = s.cur; if (!g) return;
  const win = !forfeit && g.win === 0, ran = !!run && !win && !forfeit;
  const pay = win ? Math.round(g.stake * 2 * 100) / 100 : ran ? g.stake : 0;   // 도망치면 판돈을 돌려받는다
  if (pay > 0) receiveUSD(pay);
  s.hist.unshift({at:Date.now(), stake:g.stake, pay, win, ...(forfeit ? {ff:1} : {})}); s.hist = s.hist.slice(0, 10);
  altLog('gamble', `뱀사다리 ${win ? '승리' : forfeit ? '기권' : ran ? '패배 → 도망' : '패배'}${g.il ? ' (불법)' : ''}`, pay - g.stake, 'USD');
  s.cur = null; commit(); slHide();
  police('sl', g.il, pay - g.stake);
  runCheck(); if (ran) runAdd('sl', g.stake);
  showModal(`<h2 class="${win ? 'up' : ''}">${win ? '🏆 이겼습니다' : forfeit ? '기권했습니다' : ran ? '🏃 도망쳤습니다' : '졌습니다'}</h2>${ran ? runNote(g.stake) : ''}<div class="bd"><div><span>판돈</span><b class="num">${fmtUSD(g.stake)}</b></div><div><span>받은 돈</span><b class="num">${fmtUSD(pay)}</b></div><div class="tot"><span>손익</span><b class="num ${cls(pay - g.stake)}">${signUSD(pay - g.stake)}</b></div></div><div class="acts"><button class="btn solid" data-close>확인</button></div>`);
}
document.addEventListener('click', e => {
  const t = e.target.closest('#slOv button'); if (!t) return;
  const g = slS().cur; if (!g) return;
  if (t.id === 'slClose'){ slHide(); return; }
  if (t.id === 'slEnd'){ slFinish(false); return; }
  if (t.id === 'slRun'){ slFinish(false, true); return; }
  if (t.id === 'slQuit'){ const c = showModal(`<h2>기권할까요?</h2><p>판돈 ${fmtUSD(g.stake)}을 잃습니다.</p><div class="acts"><button class="btn" data-close>계속하기</button><button class="btn solid" id="slQuitYes">기권</button></div>`); $('#slQuitYes').onclick = () => { c(); setTimeout(() => slFinish(true), 200); }; return; }
  if (t.id === 'slRoll' && !SLV.busy && g.turn === 0 && !g.over){ const pos0 = g.pos.slice(), ev = SLE.roll(g, Math.random); save(); slPlay(ev, pos0); }
});
window.addEventListener('resize', () => { if ($('#slOv') && !$('#slOv').hidden) slDraw(); });
// bm.js의 배너·색종이를 다른 효과 층에도 쓴다
function bmBannerIn(fx, text, cls, ms){
  if (!fx) return;
  const b = document.createElement('div'); b.className = 'bm-banner ' + (cls || ''); b.textContent = text; fx.appendChild(b);
  b.animate([{transform:'translate(-50%,-50%) scale(.3)', opacity:0}, {transform:'translate(-50%,-50%) scale(1.1)', opacity:1, offset:.18}, {transform:'translate(-50%,-50%) scale(1)', opacity:1, offset:.8}, {transform:'translate(-50%,-62%)', opacity:0}], {duration:bmMs(ms), easing:'ease-out'}).onfinish = () => b.remove();
}
function bmConfettiIn(fx){
  if (!fx) return;
  const cols = ['#E2B45E', '#4C9AFF', '#FF6B6B', '#36C38A', '#C58CFF'];
  for (let k = 0; k < 50; k++){
    const c = document.createElement('i'); c.className = 'bm-conf'; c.style.background = cols[k % 5]; c.style.left = (10 + Math.random() * 80) + '%'; fx.appendChild(c);
    c.animate([{transform:'translate(0,-20px) rotate(0)', opacity:1}, {transform:`translate(${(Math.random() - .5) * 160}px, ${300 + Math.random() * 200}px) rotate(${Math.random() * 720}deg)`, opacity:0}], {duration:1400 + Math.random() * 900, delay:Math.random() * 300}).onfinish = () => c.remove();
  }
}

/* ── 홀짝: 맞히면 2배, 틀리면 전부 잃음 ──
   컴퓨터가 구슬을 1~20개 쥔다. 1~20에는 홀수 10개, 짝수 10개라 한 번에 맞힐 확률 p = 1/2.
   맞힐 때마다 상금이 m배(OE_M)가 되고, 틀리면 상금이 0이 된다. 언제든 그만두고 상금을 받을 수 있다(1번 이상 맞힌 뒤).
   k번 맞히고 그만두면 받는 돈은 판돈 × m^k, 그 확률은 p^k 이므로 기대 배수는 (p·m)^k.
   다른 게임(뱀사다리 2배·확률 1/2, 부루마블 순위 배수 평균 1)과 같게 기대 배수를 1로 맞추려면 어떤 k에서도 (p·m)^k = 1 → m = 1/p = 2.
   한 판에 최대 OE_MAX번까지 (그때 자동으로 받는다). 상한이 있어도 기대 배수는 1 그대로다 */
const OE_M = 2, OE_MAX = 10;
function oeS(){
  if (!S.oe || typeof S.oe !== 'object') S.oe = {cur:null, hist:[]};
  const g = S.oe.cur;
  if (g && g.v !== 2){   // 예전 규칙(5판 3선승)으로 하던 판은 판돈을 돌려준다
    receiveUSD(g.stake); S.oe.cur = null;
    setTimeout(() => { commit(); toast(`홀짝 규칙이 바뀌어 하던 판의 판돈 ${fmtUSD(g.stake)}을 돌려드렸습니다`); }, 0);
  }
  return S.oe;
}
const oePot = g => Math.round(g.stake * Math.pow(OE_M, g.k) * 100) / 100;
function oeCardHTML(){
  const s = oeS(), g = s.cur;
  INFO.oe = {t:'홀짝', h:`<div class="prose"><ul><li>컴퓨터가 구슬을 1~20개 쥡니다. 개수가 홀수인지 짝수인지 맞히면 상금이 ${OE_M}배가 되고, 틀리면 상금을 전부 잃습니다.</li>
    <li>한 번 이상 맞힌 뒤에는 언제든 "그만하고 받기"로 상금을 받을 수 있습니다. ${OE_MAX}번 연속 맞히면(판돈의 ${Math.pow(OE_M, OE_MAX).toLocaleString()}배) 자동으로 받습니다.</li>
    <li>1~20에는 홀수 10개, 짝수 10개라 한 번에 맞힐 확률은 1/2입니다.</li></ul>
    <div class="eq">기대 배수 = (맞힐 확률 × 배수)<sup><i>k</i></sup> = (½ × ${OE_M})<sup><i>k</i></sup> = 1</div>
    <ul class="defs"><li><span class="sym"><i>k</i></span><span>그만두기 전까지 연속으로 맞힌 횟수 (1 ≤ <i>k</i> ≤ ${OE_MAX})</span></li></ul>
    <p>몇 번에서 그만두든 평균적으로는 판돈만큼 돌아옵니다(뱀사다리·부루마블과 같은 기대 배수 1). 판돈 한도: ${fmtUSDn(GAM.oe.off, 0)} (불법 모드 ${fmtUSDn(GAM.oe.on, 0)}).</p>
    <p>불법 모드로 한 판이 끝날 때마다 ${(GAM.oe.p * 100).toFixed(0)}% 확률로 경찰이 옵니다. 지금까지 불법 도박(모든 게임 합산)으로 번 돈의 ${GAM.seize * 100}%를 압류하고 누적을 0으로 되돌립니다. 랭킹 이름에는 영구 빨간 줄이 그어집니다.</p></div>`};
  if (!g){
    const h = s.hist.slice(0, 3).map(x => `<span class="${cls(x.pay - x.stake)}">${x.k === undefined ? (x.win ? '승' : '패') : x.pay > x.stake ? `${x.k}연속` : '실패'} ${signUSD(x.pay - x.stake)}</span>`).join(' · ');
    return `<div class="card-h"><h2>✊ 홀짝 ${infoBtn('oe')}</h2><small>맞히면 ${OE_M}배 · 틀리면 전부</small></div>
      <p class="mg-desc">${h ? `최근 ${h}` : '맞힐 때마다 상금 2배, 틀리면 전부 잃습니다. 언제 그만둘지는 내가 정합니다'}</p>
      <div class="mg-foot"><span class="muted">한도 ${fmtUSDn(gamMax('oe'), 0)}</span><button class="btn solid" id="oeGo" ${S.over ? 'disabled' : ''}>새 게임</button></div>`;
  }
  // 손을 펴기 전(흔드는 중)에는 이번 결과를 숨기고 고르기 전 상태를 보여 준다
  const hide = OEV.busy && !OEV.reveal && g.last;
  const L = g.last, k = hide && L.ok ? g.k - 1 : g.k, lost = g.lost && !hide, over = g.over && !hide;
  const pot = Math.round(g.stake * Math.pow(OE_M, k) * 100) / 100, next = Math.round(pot * OE_M * 100) / 100;
  const steps = Array.from({length:OE_MAX}, (_, i) => `<i class="${i < k ? 'on' : ''}${lost && i === k ? ' bad' : ''}"></i>`).join('');
  return `<div class="card-h"><h2>✊ 홀짝</h2><small>판돈 ${fmtUSD(g.stake)}${g.il ? ' · 🚨 불법' : ''}</small></div>
    <div class="oe-score"><span>지금 상금 <b class="num ${lost ? 'down' : k ? 'up' : ''}">${fmtUSD(lost ? 0 : pot)}</b></span><span class="muted">${k}/${OE_MAX}</span><span>맞히면 <b class="num">${over ? '—' : fmtUSD(next)}</b></span></div>
    <div class="oe-steps" aria-hidden="true">${steps}</div>
    <div class="oe-hand ${L && OEV.reveal ? 'open' : ''}" id="oeHand">${L && OEV.reveal ? `<div class="oe-marbles">${Array.from({length:L.n}, (_, k) => `<i style="--d:${k * 25}ms"></i>`).join('')}</div><b class="num">${L.n}개 · ${L.n % 2 ? '홀' : '짝'}</b>` : '<span class="fist">✊</span>'}</div>
    ${L && OEV.reveal ? `<p class="oe-res ${L.ok ? 'up' : 'down'}">${L.ok ? (g.k >= OE_MAX ? `${OE_MAX}연속! 상금을 받습니다` : `맞혔다! 상금 ${fmtUSD(pot)}`) : '틀렸다… 상금을 전부 잃었습니다'} (내 선택: ${L.pick === 'odd' ? '홀' : '짝'})</p>` : `<p class="oe-res muted">${OEV.busy ? '…' : '홀일까 짝일까?'}${L && !OEV.busy ? `<small>지난 판: ${L.n}개 ${L.n % 2 ? '홀' : '짝'} · 맞힘</small>` : ''}</p>`}
    <div class="bm-acts">${over ? `<button class="btn solid" id="oeEnd">결과 보기</button>${lost ? '<button class="btn run-btn" id="oeRun">🏃 도망가기</button>' : ''}`
      : `<button class="btn" data-oe="odd" ${OEV.busy ? 'disabled' : ''}>홀</button><button class="btn" data-oe="even" ${OEV.busy ? 'disabled' : ''}>짝</button>${k ? `<button class="btn solid" id="oeCash" ${OEV.busy ? 'disabled' : ''}>그만하고 ${fmtUSD(pot)} 받기</button>` : ''}`}</div>`;
}
const OEV = {busy:false, reveal:false, t:null};
function oeRender(){ const c = $('#oeCard'); if (c) c.innerHTML = oeCardHTML(); gmSync(); }
function oeStart(){
  const s = oeS(); if (s.cur) return;
  if (S.over) return toast('파산해서 할 수 없습니다', true);
  betDialog('oe', '✊ 홀짝', `<p class="muted" style="margin:0 0 8px">맞힐 때마다 상금 ${OE_M}배, 틀리면 전부 잃음. 1번 이상 맞힌 뒤 언제든 그만두고 받을 수 있습니다 (최대 ${OE_MAX}번)</p>`, bet => {
    s.cur = {v:2, stake:bet, il:gamIl(), k:0, last:null, over:false, lost:false}; OEV.reveal = false; commit(); gmOpen('oe'); oeRender();
  });
}
function oePick(pick){
  const g = oeS().cur; if (!g || g.over || OEV.busy) return;
  const n = 1 + Math.floor(Math.random() * 20), ok = (n % 2 === 1) === (pick === 'odd');
  g.last = {n, pick, ok};
  if (ok){ g.k++; if (g.k >= OE_MAX) g.over = true; }
  else { g.lost = true; g.over = true; }
  save();
  clearTimeout(OEV.t);
  OEV.busy = true; OEV.reveal = false; oeRender();
  const h = $('#oeHand'); if (h) h.classList.add('shake');
  // 흔들고 → 손을 펴서 결과를 2초 보여 주고 → 다시 주먹으로 (끝난 판은 결과를 그대로 둔다)
  OEV.t = setTimeout(() => {
    OEV.reveal = true; oeRender();
    if (g.over){ OEV.busy = false; oeRender(); return; }
    OEV.t = setTimeout(() => { OEV.reveal = false; OEV.busy = false; oeRender(); }, 2000);
  }, bmMs(900));
}
function oeFinish(run){
  const s = oeS(), g = s.cur; if (!g || OEV.busy) return;
  if (!g.over && g.k < 1) return;              // 한 번은 해야 그만둘 수 있다
  clearTimeout(OEV.t);
  const ran = !!run && g.lost;
  const pay = ran ? g.stake : g.lost ? 0 : oePot(g), win = pay > g.stake;   // 도망치면 판돈을 돌려받는다
  if (pay > 0) receiveUSD(pay);
  s.hist.unshift({at:Date.now(), stake:g.stake, pay, win, k:g.k}); s.hist = s.hist.slice(0, 10);
  altLog('gamble', `홀짝 ${g.lost ? `${g.k + 1}번째에서 틀림${ran ? ' → 도망' : ''}` : `${g.k}연속 맞히고 받음`}${g.il ? ' (불법)' : ''}`, pay - g.stake, 'USD');
  s.cur = null; OEV.reveal = false; OEV.busy = false; commit(); gmHide(); oeRender();
  police('oe', g.il, pay - g.stake);
  runCheck(); if (ran) runAdd('oe', g.stake);
  showModal(`<h2 class="${win ? 'up' : ''}">${ran ? '🏃 도망쳤습니다' : g.lost ? `${g.k + 1}번째에서 틀렸습니다` : `🏆 ${g.k}연속 맞힘`}</h2>${ran ? runNote(g.stake) : ''}<div class="bd"><div><span>판돈</span><b class="num">${fmtUSD(g.stake)}</b></div><div><span>받은 돈</span><b class="num">${fmtUSD(pay)}</b></div><div class="tot"><span>손익</span><b class="num ${cls(pay - g.stake)}">${signUSD(pay - g.stake)}</b></div></div><div class="acts"><button class="btn solid" data-close>확인</button></div>`);
}
document.addEventListener('click', e => { if (e.target.closest('#oeCash')) oeFinish(); });
document.addEventListener('click', e => { const t = e.target.closest('#oeEnd'); if (t) oeFinish(); });
document.addEventListener('click', e => { if (e.target.closest('#oeRun')) oeFinish(true); });
