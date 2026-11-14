/* ───────── 블랙잭 ─────────
   규칙: 6벌(312장)을 판마다 새로 섞는다(카드 세기 없음). 딜러는 소프트 17 포함 17 이상이면 선다(S17).
   딜러 업카드가 A·10이면 먼저 블랙잭인지 확인(피크)하고, 딜러가 블랙잭이면 처음 건 판돈만 잃는다.
   더블다운: 처음 두 장일 때 언제나(스플릿 뒤에도). 스플릿: 같은 숫자 두 장, 최대 4손. A를 나누면 한 장씩만 받고 다시 못 나눈다.
   스플릿한 손의 A+10은 블랙잭이 아니라 21. 보험·서렌더 없음.
   지급(받는 돈, 판돈 포함): 이기면 2배, 비기면 1배, 블랙잭 BJ.bjPay배.
   BJ.bjPay: 보통 카지노처럼 2.5배(3:2). 기본 전략으로 150만 판 돌려 본 처음 판돈 대비 평균 손익은 −0.39% ± 0.18%(95%),
   기본 전략 없이 버스트만 피하면 약 −6%. 가장 잘 해도 조금씩 잃도록 일부러 다른 도박(기대 배수 1)보다 불리하게 둔다 */
const BJ = {decks:6, bjPay:2.5, maxHands:4};
const BJE = {
  // 카드: 0~51 → 숫자 r = c % 13 + 1 (1=A, 11~13=J·Q·K), 무늬 s = floor(c / 13) % 4
  rank: c => c % 13 + 1,
  val: c => Math.min(10, c % 13 + 1),
  total(cards){ let t = 0, a = 0; for (const c of cards){ const v = BJE.val(c); t += v; if (v === 1) a++; } const soft = a > 0 && t + 10 <= 21; return {t:soft ? t + 10 : t, soft}; },
  isBJ: cards => cards.length === 2 && BJE.total(cards).t === 21,
  shoe(rnd){ const n = 52 * BJ.decks, a = Array.from({length:n}, (_, k) => k); for (let i = n - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  draw(g){ return g.shoe[g.ix++]; },
  newRound(stake, rnd){
    const g = {v:1, stake, shoe:BJE.shoe(rnd), ix:0, hands:[], dealer:[], hole:true, phase:'play', cur:0, cost:stake, pay:0, log:[]};
    const p1 = BJE.draw(g), d1 = BJE.draw(g), p2 = BJE.draw(g), d2 = BJE.draw(g);
    g.hands.push({cards:[p1, p2], bet:stake, done:false, dbl:false, split:false, res:null});
    g.dealer = [d1, d2];
    const up = BJE.val(d1), pbj = BJE.isBJ(g.hands[0].cards), dbj = BJE.isBJ(g.dealer);
    if ((up === 1 || up === 10) && dbj){ g.hole = false; g.hands[0].done = true; BJE.settle(g); }   // 딜러 블랙잭 (피크)
    else if (pbj){ g.hands[0].done = true; g.hole = false; BJE.settle(g); }
    return g;
  },
  hand: g => g.hands[g.cur],
  can(g, a){
    if (g.phase !== 'play') return false;
    const h = BJE.hand(g); if (!h || h.done) return false;
    const two = h.cards.length === 2;
    if (a === 'hit' || a === 'stand') return true;
    if (a === 'double') return two;
    if (a === 'split') return two && BJE.rank(h.cards[0]) === BJE.rank(h.cards[1]) && g.hands.length < BJ.maxHands && !(h.split && BJE.rank(h.cards[0]) === 1);
    return false;
  },
  // 사람이 고른 행동. 돈(더블·스플릿 추가 판돈)은 화면 쪽에서 먼저 낸다
  act(g, a){
    if (!BJE.can(g, a)) return false;
    const h = BJE.hand(g);
    if (a === 'hit'){ h.cards.push(BJE.draw(g)); if (BJE.total(h.cards).t >= 21) h.done = true; }
    else if (a === 'stand') h.done = true;
    else if (a === 'double'){ g.cost += h.bet; h.bet *= 2; h.dbl = true; h.cards.push(BJE.draw(g)); h.done = true; }
    else if (a === 'split'){
      const c2 = h.cards.pop(), ace = BJE.rank(c2) === 1;
      const h2 = {cards:[c2], bet:h.bet, done:false, dbl:false, split:true, res:null};
      h.split = true; g.cost += h.bet;
      h.cards.push(BJE.draw(g)); h2.cards.push(BJE.draw(g));
      g.hands.splice(g.cur + 1, 0, h2);
      if (ace){ h.done = true; h2.done = true; }                         // A 스플릿은 한 장씩만
      else { if (BJE.total(h.cards).t === 21) h.done = true; if (BJE.total(h2.cards).t === 21) h2.done = true; }
    }
    BJE.next(g);
    return true;
  },
  next(g){
    while (g.cur < g.hands.length && g.hands[g.cur].done) g.cur++;
    if (g.cur >= g.hands.length) BJE.dealerPlay(g);
  },
  dealerPlay(g){
    g.hole = false;
    const live = g.hands.some(h => BJE.total(h.cards).t <= 21);
    if (live) while (BJE.total(g.dealer).t < 17) g.dealer.push(BJE.draw(g));   // S17: 소프트 17에서도 선다
    BJE.settle(g);
  },
  settle(g){
    const d = BJE.total(g.dealer).t, dbj = BJE.isBJ(g.dealer);
    let pay = 0;
    for (const h of g.hands){
      const p = BJE.total(h.cards).t, pbj = !h.split && g.hands.length === 1 && BJE.isBJ(h.cards);
      let m;
      if (dbj) m = pbj ? 1 : 0;                          // 딜러 블랙잭: 내 블랙잭만 비김
      else if (pbj) m = BJ.bjPay;
      else if (p > 21) m = 0;
      else if (d > 21 || p > d) m = 2;
      else if (p === d) m = 1;
      else m = 0;
      h.res = pbj && m === BJ.bjPay ? 'bj' : m === 2 ? 'win' : m === 1 ? 'push' : 'lose';
      // 블랙잭은 처음 판돈 기준, 나머지는 그 손의 판돈(더블이면 2배) 기준
      pay += h.bet * m;
    }
    g.pay = Math.round(pay * 100) / 100; g.phase = 'over';
  },
  // 기본 전략 (6벌, S17, 더블다운 스플릿 뒤 허용, 서렌더 없음). 지급 배수를 정하는 시뮬레이션에만 쓴다 (화면에 추천을 보여 주지 않는다)
  basic(g){
    const h = BJE.hand(g), up = BJE.val(g.dealer[0]), u = up === 1 ? 11 : up;
    const {t, soft} = BJE.total(h.cards), two = h.cards.length === 2;
    const D = a => (two ? 'double' : a);
    if (BJE.can(g, 'split')){
      const r = BJE.val(h.cards[0]);
      const sp = r === 1 || r === 8 || (r === 9 && u !== 7 && u !== 10 && u !== 11) || (r === 7 && u <= 7) || (r === 6 && u <= 6) || (r === 4 && (u === 5 || u === 6)) || ((r === 2 || r === 3) && u <= 7);
      if (sp) return 'split';
    }
    if (soft){
      if (t >= 19) return 'stand';
      if (t === 18) return u >= 3 && u <= 6 ? D('stand') : u <= 8 ? 'stand' : 'hit';
      if (t === 17) return u >= 3 && u <= 6 ? D('hit') : 'hit';
      if (t === 15 || t === 16) return u >= 4 && u <= 6 ? D('hit') : 'hit';
      return u >= 5 && u <= 6 ? D('hit') : 'hit';         // A2, A3
    }
    if (t >= 17) return 'stand';
    if (t >= 13) return u <= 6 ? 'stand' : 'hit';
    if (t === 12) return u >= 4 && u <= 6 ? 'stand' : 'hit';
    if (t === 11) return u <= 10 ? D('hit') : 'hit';
    if (t === 10) return u <= 9 ? D('hit') : 'hit';
    if (t === 9) return u >= 3 && u <= 6 ? D('hit') : 'hit';
    return 'hit';
  },
};

/* ── 블랙잭 화면 (도박 탭 카드) ── */
function bjS(){ if (!S.bj || typeof S.bj !== 'object') S.bj = {cur:null, hist:[]}; return S.bj; }
const BJV = {shown:null, t:null, anim:false, seen:new Set(), now:new Set()};   // shown: 딜러 카드를 몇 장까지 보였는지. seen: 이미 그린 카드(새 카드만 날아오게)
const BJ_SUIT = ['♠', '♥', '♦', '♣'];
function bjCardHTML(c, back, k, key, V = BJV){   // V: 어떤 카드를 이미 그렸는지 (혼자 하기 BJV / 같이 하기 MP.view.bjV)
  const id = key + (back ? 'b' : 'f'); V.now.add(id);
  const fresh = !V.seen.has(id), flip = fresh && !back && V.seen.has(key + 'b');   // 엎어 둔 카드를 뒤집을 때는 뒤집기 연출
  const cl = fresh ? (flip ? ' flip' : ' new') : '';
  if (back) return `<span class="bjc back${cl}" style="--k:${k}"></span>`;
  const r = BJE.rank(c), s = Math.floor(c / 13) % 4, red = s === 1 || s === 2;
  return `<span class="bjc${red ? ' red' : ''}${cl}" style="--k:${k}"><b>${r === 1 ? 'A' : r === 11 ? 'J' : r === 12 ? 'Q' : r === 13 ? 'K' : r}</b><i>${BJ_SUIT[s]}</i><em>${BJ_SUIT[s]}</em></span>`;
}
const bjTot = cards => { const {t, soft} = BJE.total(cards); return soft && t < 21 ? `${t - 10}/${t}` : `${t}`; };
const BJ_ACT = {hit:'히트', stand:'스탠드', double:'더블', split:'스플릿'};
function bjCardInnerHTML(){
  const s = bjS(), g = s.cur;
  INFO.bj = {t:'블랙잭', h:`<div class="prose"><ul><li>딜러보다 21에 가깝게 만들면 이깁니다. 21을 넘으면 집니다. A는 1이나 11, J·Q·K는 10.</li>
    <li>6벌(312장)을 판마다 새로 섞습니다.</li>
    <li>딜러가 A나 10을 보이면 먼저 블랙잭인지 확인합니다. 딜러가 블랙잭이면 처음 건 판돈만 잃습니다.</li>
    <li><b>히트</b> 한 장 더 · <b>스탠드</b> 그만 · <b>더블</b> 처음 두 장일 때 판돈을 두 배로 하고 한 장만 더 · <b>스플릿</b> 같은 숫자 두 장을 두 손으로 나눔(판돈 한 번 더, 최대 4손, A는 한 장씩만).</li>
    <li>받는 돈(판돈 포함): 이기면 2배, 비기면 1배, 처음 두 장이 블랙잭(A+10)이면 <b>${BJ.bjPay}배</b>. 스플릿한 손의 21은 블랙잭이 아닙니다. 보험·서렌더는 없습니다.</li></ul>
    <p>보통 카지노와 같은 지급(블랙잭 3:2)이라, 매번 가장 유리한 행동을 골라도 평균적으로 판돈의 약 0.4%를 잃습니다. 판돈 한도: ${fmtUSDn(GAM.bj.off, 0)} (불법 모드 ${fmtUSDn(GAM.bj.on, 0)}).</p></div>`};
  if (!g){
    const h = s.hist.slice(0, 3).map(x => `<span class="${cls(x.pay - x.cost)}">${x.res} ${signUSD(x.pay - x.cost)}</span>`).join(' · ');
    return `<div class="card-h"><h2>🃏 블랙잭 ${infoBtn('bj')}</h2><small>블랙잭 ${BJ.bjPay}배</small></div>
      <p class="mg-desc">${h ? `최근 ${h}` : '딜러와 21 대결. 히트·스탠드·더블·스플릿을 직접 고릅니다'}</p>
      <div class="mg-foot"><span class="muted">한도 ${fmtUSDn(gamMax('bj'), 0)}</span><button class="btn solid" id="bjGo" ${S.over ? 'disabled' : ''}>새 게임</button></div>`;
  }
  const over = g.phase === 'over', dn = over && BJV.shown !== null ? Math.min(BJV.shown, g.dealer.length) : g.dealer.length;
  const revealing = over && dn < g.dealer.length, showRes = over && !revealing;
  const dCards = g.dealer.slice(0, Math.max(2, dn)).map((c, k) => bjCardHTML(c, k === 1 && (g.hole || (over && BJV.shown !== null && BJV.shown < 2)), k, `d${k}`)).join('');
  const dShown = g.dealer.slice(0, Math.max(2, dn));
  // 딜러는 고를 것이 없으므로 판이 끝나면 "8/18"이 아니라 최종 합(18)만 보인다
  const dTot = g.hole || (over && BJV.shown !== null && BJV.shown < 2) ? bjTot([g.dealer[0]]) : over ? `${BJE.total(dShown).t}` : bjTot(dShown);
  const RES = {bj:['블랙잭!', 'up'], win:['승', 'up'], push:['무', ''], lose:['패', 'down']};
  const hands = g.hands.map((h, i) => {
    const t = BJE.total(h.cards).t, cur = !over && i === g.cur;
    return `<div class="bj-hand ${cur ? 'cur' : ''}"><div class="bj-cards">${h.cards.map((c, k) => bjCardHTML(c, false, k, `h${i}-${k}-${c}`)).join('')}</div>
      <div class="bj-meta"><b class="num">${t > 21 ? `${t} 버스트` : h.done || over ? t : bjTot(h.cards)}</b><small>${fmtUSD(h.bet)}${h.dbl ? ' · 더블' : ''}</small>${showRes && h.res ? `<em class="${RES[h.res][1]}">${RES[h.res][0]}</em>` : ''}</div></div>`;
  }).join('');
  const h = !over ? BJE.hand(g) : null, more = h ? h.bet : 0, rich = S.usd >= more;
  return `<div class="card-h"><h2>🃏 블랙잭</h2><small>판돈 ${fmtUSD(g.stake)}${g.il ? ' · 🚨 불법' : ''}</small></div>
    <div class="bj-table">
      <div class="bj-row"><span class="bj-who">딜러</span><div class="bj-hand"><div class="bj-cards">${dCards}</div><div class="bj-meta"><b class="num">${dTot}${showRes && BJE.total(g.dealer).t > 21 ? ' 버스트' : ''}</b></div></div></div>
      <div class="bj-row"><span class="bj-who">나</span><div class="bj-hands">${hands}</div></div>
    </div>
    ${showRes ? `<p class="oe-res ${cls(g.pay - g.cost)}">${g.pay > g.cost ? '이겼다!' : g.pay === g.cost ? '비겼다' : '졌다'} · 받을 돈 ${fmtUSD(g.pay)} (건 돈 ${fmtUSD(g.cost)})</p>`
      : revealing ? '<p class="oe-res muted">딜러 차례…</p>' : `<p class="oe-res muted">${g.hands.length > 1 ? `${g.cur + 1}번째 손 · ` : ''}할 행동을 고르세요</p>`}
    <div class="bm-acts">${over ? (showRes ? '<button class="btn solid" id="bjEnd">정산하기</button>' + (g.pay < g.cost ? '<button class="btn run-btn" id="bjRun">🏃 도망가기</button>' : '') : '')
      : ['hit', 'stand', 'double', 'split'].map(a => {
          const ok = BJE.can(g, a) && (a === 'hit' || a === 'stand' || rich);
          return `<button class="btn ${a === 'stand' ? 'solid' : ''}" data-bj="${a}" ${ok && !BJV.anim ? '' : 'disabled'}>${BJ_ACT[a]}${(a === 'double' || a === 'split') && BJE.can(g, a) ? ` +${fmtUSD(more)}` : ''}</button>`;
        }).join('')}</div>`;
}
function bjHTML(){ BJV.now = new Set(); const h = bjCardInnerHTML(); BJV.now.forEach(x => BJV.seen.add(x)); return h; }   // 그린 카드를 기억해 두고 다음엔 새 카드만 날아오게
function bjRender(){ const c = $('#bjCard'); if (c) c.innerHTML = bjHTML(); gmSync(); }
function bjStart(){
  const s = bjS(); if (s.cur) return;
  if (S.over) return toast('파산해서 할 수 없습니다', true);
  betDialog('bj', '🃏 블랙잭', `<p class="muted" style="margin:0 0 8px">블랙잭 ${BJ.bjPay}배, 이기면 2배. 더블·스플릿하면 같은 판돈을 한 번 더 냅니다</p>`, bet => {
    s.cur = BJE.newRound(bet, Math.random); s.cur.il = gamIl();
    BJV.shown = null; BJV.seen = new Set(); commit(); gmOpen('bj');
    if (s.cur.phase === 'over') bjReveal(); else bjRender();
  });
}
// 판이 끝나면 딜러 카드를 한 장씩 보여 준다 (뒤집기 → 뽑기)
function bjReveal(){
  const g = bjS().cur; if (!g) return;
  clearTimeout(BJV.t); BJV.shown = 1; BJV.anim = true; bjRender();
  const step = () => {
    const g2 = bjS().cur; if (!g2 || g2 !== g){ BJV.anim = false; return; }
    BJV.shown++; bjRender();
    if (BJV.shown < g.dealer.length) BJV.t = setTimeout(step, bmMs(600));
    else { BJV.anim = false; bjRender(); }
  };
  BJV.t = setTimeout(step, bmMs(450));
}
function bjAct(a){
  const g = bjS().cur; if (!g || g.phase !== 'play' || BJV.anim || !BJE.can(g, a)) return;
  if (a === 'double' || a === 'split'){
    const more = BJE.hand(g).bet;
    if (S.usd < more) return toast(`달러 통장에 ${fmtUSD(more)}이 있어야 합니다`, true);
    S.usd = Math.round((S.usd - more) * 100) / 100;
  }
  BJE.act(g, a); save();
  if (g.phase === 'over') bjReveal(); else bjRender();
}
function bjFinish(run){
  const s = bjS(), g = s.cur; if (!g || g.phase !== 'over' || BJV.anim) return;
  const ran = !!run && g.pay < g.cost, loss = Math.round((g.cost - g.pay) * 100) / 100;
  const got = ran ? g.cost : g.pay;   // 도망치면 건 돈(판돈 + 더블·스플릿)을 모두 돌려받는다
  if (got > 0) receiveUSD(got);
  const net = Math.round((got - g.cost) * 100) / 100;
  const res = ran ? '도망' : g.hands.some(h => h.res === 'bj') ? '블랙잭' : net > 0 ? '승' : net === 0 ? '무' : '패';
  s.hist.unshift({at:Date.now(), stake:g.stake, cost:g.cost, pay:got, res}); s.hist = s.hist.slice(0, 10);
  altLog('gamble', `블랙잭: ${ran ? '패 → 도망' : res}${g.hands.length > 1 ? ` (${g.hands.length}손)` : ''}${g.il ? ' (불법)' : ''}`, net, 'USD');
  s.cur = null; BJV.shown = null; commit(); gmHide(); bjRender();   // 결과를 보면 게임 화면을 닫고 도박 탭으로 (판 없는 화면이 남지 않게)
  police('bj', g.il, net);
  runCheck();
  if (!ran) toast(`블랙잭 ${res} ${signUSD(net)}`, net < 0);
  if (ran){ runAdd('bj', loss); showModal(`<h2>🏃 도망쳤습니다</h2><p>잃을 ${fmtUSD(loss)}을 내지 않고 건 돈 ${fmtUSD(g.cost)}을 돌려받았습니다.</p>${runNote(loss)}<div class="acts"><button class="btn solid" data-close>확인</button></div>`); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('#bjGo, #bjEnd, #bjRun, [data-bj]'); if (!t) return;
  if (t.id === 'bjGo') bjStart(); else if (t.id === 'bjEnd') bjFinish(); else if (t.id === 'bjRun') bjFinish(true); else bjAct(t.dataset.bj);
});
