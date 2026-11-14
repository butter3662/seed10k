/* ───────── 복권 탭: 로또6/45 (실제 추첨 결과로 정산) · 스피또2000 (긁는 즉석복권) ─────────
   로또 규칙 출처: 동행복권 '로또6/45 소개' (1게임 1,000원, 1~45 중 6개, 판매 일~금 06:00~24:00·토 06:00~20:00, 토 20:35경 추첨,
   판매점 1인 1회 최대 10만 원, 슬립 1장 5게임, 4등 5만·5등 5천 원 고정, 1~3등은 당첨자 수로 나눔).
   세금: 동행복권 '당첨자 안내' — 200만 원 초과 3억 이하 22%, 3억 초과 33% / 토스뱅크 — 200만 원 이하 비과세. 3억을 넘는 부분만 33%로 본다.
   지급기한: 지급개시일로부터 1년 (여기서는 추첨 다음 날을 지급개시일로 본다).
   당첨번호와 등수별 1게임당 당첨금은 GitHub Actions가 동행복권에서 받아 둔 data/lotto.json을 쓴다 */
const LOT = {price:1000, perRound:100000, perSlip:5, base:1249, baseAt:Date.parse('2026-11-07T20:35:00+09:00'), week:7 * 864e5};
const lotDrawAt = r => LOT.baseAt + (r - LOT.base) * LOT.week;
function lotTax(p){   // 원천징수 세금 (원)
  if (p <= 2e6) return 0;
  return Math.round(Math.min(p, 3e8) * 0.22 + Math.max(0, p - 3e8) * 0.33);
}
// 지금 파는 회차와 판매 중인지
function lotNow(now = Date.now()){
  const k = zoneParts('Asia/Seoul', new Date(now)), dow = new Date(Date.UTC(+k.date.slice(0, 4), +k.date.slice(5, 7) - 1, +k.date.slice(8, 10))).getUTCDay();
  let r = LOT.base; while (lotDrawAt(r) - 35 * 60e3 <= now) r++;      // 그 회차의 판매 마감(추첨 35분 전, 토 20:00)이 지나면 다음 회차
  const hm = k.h * 60 + k.mi;
  const open = dow === 6 ? hm >= 360 && hm < 1200 : hm >= 360;          // 토 06:00~20:00, 일~금 06:00~24:00
  return {r, open, dow, hm};
}
function lotS(){ if (!S.lotto || typeof S.lotto !== 'object') S.lotto = {tix:[]}; return S.lotto; }
const lotResult = r => XD.lotto && Array.isArray(XD.lotto.d) ? XD.lotto.d.find(d => d.r === r) : null;
function lotRank(nums, d){
  const m = nums.filter(n => d.n.includes(n)).length;
  return m === 6 ? 1 : m === 5 && nums.includes(d.b) ? 2 : m === 5 ? 3 : m === 4 ? 4 : m === 3 ? 5 : 0;
}
function lotAuto(fixed){ const s = new Set(fixed); while (s.size < 6) s.add(1 + Math.floor(Math.random() * 45)); return [...s].sort((a, b) => a - b); }
const lotBall = (n, cls2) => `<i class="lb ${cls2 || ''} c${n <= 10 ? 1 : n <= 20 ? 2 : n <= 30 ? 3 : n <= 40 ? 4 : 5}">${n}</i>`;
const lotSpent = r => lotS().tix.filter(t => t.r === r).reduce((a, t) => a + t.g.length * LOT.price, 0);
// 받을 수 있는 당첨금 (세후)과 기한
function lotPrize(t){
  const d = lotResult(t.r); if (!d) return null;
  let gross = 0, tax = 0; const ranks = t.g.map(x => lotRank(x.n, d));
  ranks.forEach(rk => { if (rk){ const a = d.amt[rk - 1] || 0; gross += a; tax += lotTax(a); } });   // 게임마다 따로 과세
  const due = Date.parse(d.date + 'T00:00:00+09:00') + 864e5 + 365 * 864e5;
  return {d, ranks, gross, tax, net:gross - tax, due};
}

/* ── 화면 ── */
const LV = {edit:0, slip:[[], [], [], [], []], tab:'lotto'};
function renderLottoPane(p){
  loadExtra('lotto');
  p.innerHTML = `<div class="seg" style="margin:0 0 12px"><button data-lvt="lotto" aria-pressed="${LV.tab === 'lotto'}">로또6/45</button><button data-lvt="sp" aria-pressed="${LV.tab === 'sp'}">스피또2000</button></div>
    <div id="lotBody">${LV.tab === 'lotto' ? lottoHTML() : spHTML()}</div>`;
}
function lotRender(){ const b = $('#lotBody'); if (b) b.innerHTML = LV.tab === 'lotto' ? lottoHTML() : spHTML(); }
function lottoHTML(){
  if (!isLive()) return `<p class="empty">로또는 실제 추첨 결과로 정산하므로 실제 시세 모드에서만 살 수 있습니다.</p>`;
  const N = lotNow(), spent = lotSpent(N.r), d = new Date(lotDrawAt(N.r));
  const last = XD.lotto && XD.lotto.d && XD.lotto.d.length ? XD.lotto.d[XD.lotto.d.length - 1] : null;
  INFO.lotto = {t:'로또6/45 규칙', h:`<div class="prose"><ul>
    <li>1게임 1,000원. 1~45 중 6개를 고릅니다. 자동(모두 무작위), 반자동(몇 개만 고르고 나머지 무작위), 수동(6개 모두 고름). 슬립 1장에 5게임까지.</li>
    <li>판매: 일~금 06:00~24:00, 토요일 06:00~20:00 (한국 시각). 토요일 20시에 그 회차 판매가 끝나고, 20:35경 추첨, 일요일 06시부터 다음 회차를 팝니다.</li>
    <li>1인 1회차 최대 10만 원(100게임, 판매점 기준).</li>
    <li>당첨: 1등 6개 일치, 2등 5개 + 보너스, 3등 5개, 4등 4개(5만 원 고정), 5등 3개(5천 원 고정). 1~3등은 그 회차 실제 1게임당 당첨금을 그대로 받습니다.</li>
    <li>세금(게임마다): 200만 원 이하 0, 200만 원 초과는 3억까지 22%, 3억을 넘는 부분 33%.</li>
    <li>당첨금은 추첨 다음 날부터 1년 안에 '당첨금 받기'를 눌러야 원화 통장으로 들어옵니다. 지나면 사라집니다.</li>
    <li>당첨번호와 당첨금은 매주 토요일 밤 동행복권 발표를 가져옵니다(한국 시각 21시~다음 날 사이에 반영).</li></ul></div>`};
  const slip = LV.slip.map((g, i) => {
    const m = g.length === 6 ? '수동' : g.length ? '반자동' : '자동';
    return `<button class="ls-row ${LV.edit === i ? 'on' : ''}" data-lsedit="${i}"><b>${'ABCDE'[i]}</b><span class="ls-m">${m}</span><span class="ls-n">${g.length ? g.slice().sort((a, b) => a - b).map(n => lotBall(n)).join('') : '<span class="muted">번호를 고르지 않으면 자동</span>'}</span></button>`;
  }).join('');
  const cur = LV.slip[LV.edit];
  const grid = Array.from({length:45}, (_, k) => k + 1).map(n => `<button class="lg ${cur.includes(n) ? 'on' : ''}" data-lgn="${n}">${n}</button>`).join('');
  const games = +UI.lotGames || 5;
  const tix = lotS().tix.slice().sort((a, b) => b.at - a.at);
  const tixHTML = tix.slice(0, 30).map(t => {
    const pz = lotPrize(t), when = new Date(lotDrawAt(t.r));
    const head = pz ? (pz.gross ? (t.claimed ? `<span class="up">받음 ${fmtKRWn(pz.net)}</span>` : Date.now() > pz.due ? `<span class="down">기한 지남</span>` : `<button class="btn solid" data-lclaim="${t.id}">당첨금 받기 ${fmtKRWn(pz.net)}</button>`) : '<span class="muted">낙첨</span>') : `<span class="muted">${when.getMonth() + 1}/${when.getDate()} 추첨 대기</span>`;
    return `<div class="lt-tix"><div class="lt-h"><b>${t.r}회</b><small class="muted">${t.g.length}게임 · ${fmtKRWn(t.g.length * LOT.price)}</small>${head}</div>
      ${t.g.map((x, i) => { const rk = pz ? pz.ranks[i] : null; return `<div class="lt-g"><b>${'ABCDE'[i % 5]}</b><span class="ls-m">${x.m}</span><span class="ls-n">${x.n.map(n => lotBall(n, pz ? (pz.d.n.includes(n) ? 'hit' : n === pz.d.b ? 'bon' : 'miss') : '')).join('')}</span>${rk === null ? '' : `<span class="lt-rk ${rk ? 'up' : 'muted'}">${rk ? rk + '등' : '낙첨'}</span>`}</div>`; }).join('')}</div>`;
  }).join('');
  return `<section class="card"><div class="card-h"><h2>로또6/45 ${N.r}회 ${infoBtn('lotto')}</h2><small>${d.getMonth() + 1}/${d.getDate()}(토) 20:35 추첨</small></div>
      <p class="mg-desc">${N.open ? `판매 중 · 이번 회차 산 금액 ${fmtKRWn(spent)} / ${fmtKRWn(LOT.perRound)}` : `<b class="down">지금은 판매 시간이 아닙니다</b> (일~금 06~24시, 토 06~20시)`}</p>
      <div class="ls">${slip}</div>
      <div class="lgrid">${grid}</div>
      <div class="bm-acts" style="margin-top:8px"><button class="btn" data-lsauto>${'ABCDE'[LV.edit]} 자동으로 채우기</button><button class="btn" data-lsclr>${'ABCDE'[LV.edit]} 지우기</button></div>
      <div class="bm-acts" style="margin-top:8px"><button class="btn" data-lgames="1" aria-pressed="${games === 1}">A만</button><button class="btn" data-lgames="5" aria-pressed="${games === 5}">A~E 5게임</button><button class="btn solid" id="lotBuy" ${N.open ? '' : 'disabled'}>${games}게임 사기 ${fmtKRWn(games * LOT.price)}</button></div>
    </section>
    ${last ? `<section class="card"><div class="card-h"><h2>${last.r}회 당첨번호</h2><small>${last.date}</small></div><div class="lt-win">${last.n.map(n => lotBall(n)).join('')}<span class="muted">+</span>${lotBall(last.b)}</div>
      <div class="bd" style="margin-top:8px">${last.amt.map((a, i) => `<div><span>${i + 1}등 (${last.cnt[i].toLocaleString()}게임)</span><b class="num">${fmtKRWn(a)}</b></div>`).join('')}</div></section>` : ''}
    <section class="card"><div class="card-h"><h2>내 로또</h2><small>${tix.length}장</small></div>${tixHTML || '<p class="empty">산 로또가 없습니다.</p>'}</section>
    <p class="muted" style="margin:4px 2px">당첨 결과 출처: 동행복권 (매주 토요일 밤 갱신)</p>`;
}
function lotBuy(){
  if (!isLive()) return;
  const N = lotNow(); if (!N.open) return toast('지금은 판매 시간이 아닙니다', true);
  const games = +UI.lotGames || 5, cost = games * LOT.price;
  if (lotSpent(N.r) + cost > LOT.perRound) return toast(`1인 1회차 ${fmtKRWn(LOT.perRound)}까지 살 수 있습니다`, true);
  if (!canPayKRW(cost) || !payKRW(cost)) return toast('돈이 모자랍니다', true);
  const g = LV.slip.slice(0, games).map(x => ({n:lotAuto(x), m:x.length === 6 ? '수동' : x.length ? '반자동' : '자동'}));
  lotS().tix.push({id:Math.random().toString(36).slice(2, 9), r:N.r, at:Date.now(), g});
  altLog('lotto', `로또 ${N.r}회 ${games}게임`, -cost, 'KRW');
  LV.slip = [[], [], [], [], []]; LV.edit = 0;
  commit(); toast(`로또 ${N.r}회 ${games}게임을 샀습니다`);
}
function lotClaim(id){
  const t = lotS().tix.find(x => x.id === id); if (!t || t.claimed) return;
  const pz = lotPrize(t); if (!pz || !pz.gross) return;
  if (Date.now() > pz.due) return toast('지급 기한이 지났습니다', true);
  S.krw += pz.net; t.claimed = Date.now();
  altLog('lotto', `로또 ${t.r}회 당첨금 (${pz.ranks.filter(x => x).map(x => x + '등').join(', ')}${pz.tax ? `, 세금 ${fmtKRWn(pz.tax)}` : ''})`, pz.net, 'KRW');
  commit();
  showModal(`<h2 class="up">🎉 당첨금을 받았습니다</h2><div class="bd"><div><span>당첨금</span><b class="num">${fmtKRWn(pz.gross)}</b></div><div><span>세금</span><b class="num">${fmtKRWn(pz.tax)}</b></div><div class="tot"><span>받은 돈</span><b class="num up">${fmtKRWn(pz.net)}</b></div></div><div class="acts"><button class="btn solid" data-close>확인</button></div>`);
}

/* ── 스피또2000 ──
   당첨구조(동행복권 스피또2000 안내, 발행 500만 매 기준): 1등 10억 1매, 2등 1억 3매, 3등 1천만 25매, 4등 2만 13,750매, 5등 4천 350,000매, 6등 2천 1,400,000매.
   1등은 2매 한 세트로 발행된다(세트로 사면 20억). 한 장을 살 때마다 위 매수 ÷ 500만의 확률로 등수를 정한다(남은 매수·출고율은 따지지 않는다).
   2장 세트의 둘째 장은 첫 장이 1등이면 같이 1등, 아니면 1등이 나올 수 없다(1등은 늘 짝으로만 있으므로). 등수는 사는 순간 정해 저장하고, 긁으면 보여 준다 */
const SP = {price:2000, total:5e6, tiers:[[1e9, 1], [1e8, 3], [1e7, 25], [2e4, 13750], [4e3, 350000], [2e3, 1400000]],
  pics:['🍀', '⭐', '💎', '🍒', '🔔', '🐷', '🎁', '🌙', '🦄', '🍋']};
function spS(){ if (!S.sp || typeof S.sp !== 'object') S.sp = {tix:[]}; return S.sp; }
function spDraw(){
  let u = Math.random() * SP.total;
  for (let i = 0; i < SP.tiers.length; i++){ u -= SP.tiers[i][1]; if (u < 0) return i + 1; }
  return 0;
}
// 표면: 5게임, 게임마다 그림 2개 + 당첨금. 당첨이면 한 게임만 두 그림이 같다
function spFace(rank){
  const amts = SP.tiers.map(t => t[0]);
  const win = rank ? Math.floor(Math.random() * 5) : -1;
  return Array.from({length:5}, (_, k) => {
    const a = SP.pics[Math.floor(Math.random() * SP.pics.length)];
    let b = a; if (k !== win) while (b === a) b = SP.pics[Math.floor(Math.random() * SP.pics.length)];
    return {a, b, amt:k === win ? amts[rank - 1] : amts[Math.floor(Math.random() * amts.length)]};
  });
}
const SP_MAXBUY = 500, SP_MAXOPEN = 1000;   // SP_MAXBUY장 넘게 사면 한 장씩 저장하지 않고 '묶음'으로 산다 (등수별 장수만 저장)
// 이항분포 표본: n장 중 확률 p로 당첨되는 장수. 적으면 직접, 기댓값이 작으면 푸아송 근사, 크면 정규 근사
function spBinom(n, p){
  if (n <= 0 || p <= 0) return 0; if (p >= 1) return n;
  if (n < 2000){ let k = 0; for (let i = 0; i < n; i++) if (Math.random() < p) k++; return k; }
  const mu = n * p;
  if (mu < 30){ const L = Math.exp(-mu); let k = 0, q = Math.random(); while (q > L){ k++; q *= Math.random(); } return Math.min(k, n); }
  const sd = Math.sqrt(mu * (1 - p)), z = Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  return Math.max(0, Math.min(n, Math.round(mu + sd * z)));
}
// 묶음 n장의 등수별 장수: 1등은 2장 세트로만 나온다(세트 ⌊n/2⌋개 중 1등 세트 수 ×2, 남는 한 장은 따로). 나머지 장은 1등을 뺀 확률로 2~6등을 차례로 나눈다
function spBig(n){
  const P = SP.tiers.map(t => t[1] / SP.total), c = [0, 0, 0, 0, 0, 0];
  const sets = Math.floor(n / 2), k1 = spBinom(sets, P[0]), odd = n % 2 && Math.random() < P[0] ? 1 : 0;
  c[0] = k1 * 2 + odd;
  let left = n - c[0], q = 1 - P[0];
  for (let i = 1; i < 6; i++){ const k = spBinom(left, P[i] / q); c[i] = k; left -= k; q -= P[i]; }
  return c;
}
function spBuy(n){
  if (S.over) return toast('파산해서 살 수 없습니다', true);
  n = Math.floor(n);
  if (!(n >= 1) || !isFinite(n)) return toast('살 장수를 1장 이상으로 적어 주세요', true);
  if (n > SP_MAXBUY){   // 묶음으로 사기
    const cost = n * SP.price;
    if (!canPayKRW(cost) || !payKRW(cost)) return toast('돈이 모자랍니다', true);
    const s = spS(); s.big = (s.big || []).concat([{id:Math.random().toString(36).slice(2, 9), at:Date.now(), n, c:spBig(n)}]);
    altLog('sp', `스피또2000 ${n.toLocaleString()}장 (묶음)`, -cost, 'KRW');
    commit(); toast(`스피또2000 ${n.toLocaleString()}장을 샀습니다`);
    spOpenAll(s.big[s.big.length - 1].id); return;
  }
  if (spS().tix.filter(t => !t.done).length + n > SP_MAXOPEN) return toast(`안 긁은 복권은 ${SP_MAXOPEN.toLocaleString()}장까지 둘 수 있습니다. 먼저 긁으세요`, true);
  const cost = n * SP.price;
  if (!canPayKRW(cost) || !payKRW(cost)) return toast('돈이 모자랍니다', true);
  const s = spS(), now = Date.now();
  let prevFirst = false;
  for (let k = 0; k < n; k++){
    // 연속 2매 세트의 두 번째 장은 첫 장이 1등이면 같이 1등
    let rank;
    if (k % 2 === 1) rank = prevFirst ? 1 : (() => { let r; do r = spDraw(); while (r === 1); return r; })();   // 짝의 둘째 장
    else rank = spDraw();
    prevFirst = k % 2 === 0 && rank === 1;
    s.tix.push({id:Math.random().toString(36).slice(2, 9), at:now, rank, face:spFace(rank), done:false});
  }
  spTrim();
  altLog('sp', `스피또2000 ${n}장`, -cost, 'KRW');
  commit(); toast(`스피또2000 ${n}장을 샀습니다`);
  if (n <= 2){ const first = s.tix.find(t => !t.done); if (first) spOpen(first.id); }
  else spOpenAll();
}
// 긁은 복권은 최근 20장만 남긴다. 안 긁은 복권(돈을 낸 것)은 버리지 않는다
function spTrim(){ const s = spS(); s.tix = s.tix.filter(t => !t.done).concat(s.tix.filter(t => t.done).slice(-20)); }
function spSettle(t, bulk){
  if (t.done) return;
  t.done = Date.now();
  if (t.rank){
    const g = SP.tiers[t.rank - 1][0], tax = lotTax(g), net = g - tax;
    S.krw += net; t.net = net;
    if (!bulk) altLog('sp', `스피또2000 ${t.rank}등${tax ? ` (세금 ${fmtKRWn(tax)})` : ''}`, net, 'KRW');
  }
  if (!bulk) commit();
}
function spHTML(){
  const s = spS(), open = s.tix.filter(t => !t.done), done = s.tix.filter(t => t.done).slice(-12).reverse();
  INFO.sp = {t:'스피또2000', h:`<div class="prose"><p>1장 2,000원인 긁는 즉석복권입니다. 게임 5개 중 한 게임의 그림 2개가 모양까지 똑같으면 그 게임에 적힌 금액에 당첨됩니다.</p>
    <table class="mini"><tr><th>등위</th><th>당첨금</th><th>확률</th></tr>${SP.tiers.map((t, i) => `<tr><td>${i + 1}등</td><td>${fmtKRWn(t[0])}</td><td>1/${(SP.total / t[1]).toLocaleString(undefined, {maximumFractionDigits:1})}</td></tr>`).join('')}</table>
    <p>확률은 동행복권 스피또2000 안내의 당첨구조(발행 500만 매 기준 당첨 매수)를 그대로 씁니다(남은 매수는 따지지 않음). 1등은 2장 한 세트로만 나오므로, 2장 세트로 사서 1등이면 두 장 다 1등(20억)이고, 세트의 둘째 장만 따로 1등이 되지는 않습니다. 세금은 로또와 같습니다. 그림과 게임 배치는 이 게임에서 정한 것으로 실제 복권 그림과 다릅니다.</p></div>`};
  return `<section class="card"><div class="card-h"><h2>🎫 스피또2000 ${infoBtn('sp')}</h2><small>1장 2,000원 · 1등 10억</small></div>
      <p class="mg-desc">원화 통장 ${fmtKRWn(S.krw)} (모자라면 달러에서 자동 환전)</p>
      <div class="bm-acts"><button class="btn" data-spbuy="1">1장</button><button class="btn" data-spbuy="2">2장 세트</button><button class="btn" data-spbuy="10">10장</button><button class="btn" data-spbuy="50">50장</button><button class="btn" data-spbuy="100">100장</button></div>
      <div class="sp-custom"><label class="amt"><input id="spN" type="text" inputmode="numeric" placeholder="직접 입력" value="${UI.spN || ''}"><span>장</span></label><button class="btn solid" id="spBuyN">사기</button></div>
      <p class="muted" id="spNInfo" style="margin:6px 0 0">${spNInfo()}</p></section>
    ${(s.big || []).length ? `<section class="card"><div class="card-h"><h2>안 긁은 묶음</h2><small>${s.big.length}묶음</small></div><div class="bm-acts">${s.big.map(b => `<button class="btn solid" data-spbig="${b.id}">🎫 ${b.n.toLocaleString()}장 묶음 긁기</button>`).join('')}</div></section>` : ''}
    ${open.length ? `<section class="card"><div class="card-h"><h2>안 긁은 복권</h2><small>${open.length.toLocaleString()}장</small></div>
      ${open.length >= 2 ? `<button class="btn solid sp-allbtn" data-spall="1">🎫 ${open.length.toLocaleString()}장 한번에 긁기</button>` : ''}
      <div class="sp-list">${open.slice(0, 40).map(t => `<button class="sp-mini" data-spopen="${t.id}">🎫<small>긁기</small></button>`).join('')}${open.length > 40 ? `<span class="sp-more">+${(open.length - 40).toLocaleString()}장</span>` : ''}</div></section>` : ''}
    <section class="card"><div class="card-h"><h2>긁은 복권</h2><small>최근 12장</small></div>${done.length ? done.map(t => `<div class="bd-hold"><span class="bd-n"><b>${t.rank ? `${t.rank}등` : '낙첨'}</b><small>${new Date(t.at).toLocaleDateString()}</small></span><span class="bd-v"><b class="num ${t.rank ? 'up' : ''}">${t.rank ? '+' + fmtKRWn(t.net) : '0원'}</b></span></div>`).join('') : '<p class="empty">아직 없습니다.</p>'}</section>`;
}
// 긁기 화면: 게임 칸 위에 은박 캔버스를 깔고, 손가락·마우스가 지나간 곳을 지운다. 60% 넘게 지우면 다 보여 주고 정산
function spOpen(id){
  const t = spS().tix.find(x => x.id === id); if (!t) return;
  const close = showModal(`<h2>🎫 스피또2000</h2><div class="sp-ticket"><div class="sp-head"><b>SPEETTO 2000</b><small>같은 그림 2개면 당첨</small></div>
      <div class="sp-area" id="spArea">${t.face.map(f => `<div class="sp-g"><span>${f.a}</span><span>${f.b}</span><b>${fmtKRWn(f.amt)}</b></div>`).join('')}<canvas id="spCv"></canvas></div>
      <div class="sp-res" id="spRes"></div></div>
    <div class="acts"><button class="btn" id="spAll">전부 긁기</button><button class="btn solid" data-close>닫기</button></div>`, () => { if (t.done) lotRender(); });
  const area = $('#spArea'), cv = $('#spCv'), r = area.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const gr = ctx.createLinearGradient(0, 0, r.width, r.height); gr.addColorStop(0, '#C9CED8'); gr.addColorStop(.5, '#EEF1F6'); gr.addColorStop(1, '#AEB4C0');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, r.width, r.height);
  ctx.fillStyle = 'rgba(80,88,104,.55)'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText('여기를 긁으세요', r.width / 2, r.height / 2 + 5);
  if (t.done){ cv.remove(); spShow(t); return; }
  ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 28;
  let down = false, last = null, n = 0;
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const reveal = () => { if (t.done && !cv.isConnected) return; cv.style.transition = 'opacity .35s'; cv.style.opacity = 0; setTimeout(() => cv.remove(), 360); spSettle(t); spShow(t); };
  const check = () => {
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let clear = 0;
    for (let i = 3; i < d.length; i += 4 * 16) if (d[i] === 0) clear++;
    if (clear / (d.length / 64) > 0.6) reveal();
  };
  cv.addEventListener('pointerdown', e => { down = true; last = pt(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (!down) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; if (++n % 8 === 0) check(); e.preventDefault(); });
  const up = () => { if (down){ down = false; check(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.style.touchAction = 'none';
  $('#spAll').onclick = reveal;
}
function spNInfo(){
  const n = Math.floor(parseFloat(String(UI.spN || '').replace(/,/g, '')) || 0);
  if (!n) return `2장씩 연속번호 세트 · ${SP_MAXBUY.toLocaleString()}장이 넘으면 묶음으로 한 번에 긁습니다`;
  return `${n.toLocaleString()}장 = ${fmtKRWn(n * SP.price)}${n > SP_MAXBUY ? ' · 묶음으로 한 번에 긁기' : ''}`;
}
/* 안 긁은 복권을 한꺼번에: 은박 한 장을 긁으면(또는 '전부 긁기') 모두 정산하고, 당첨금이 큰 순서로 쌓아 보여 준다 */
function spOpenAll(bigId){
  const big = bigId ? (spS().big || []).find(b => b.id === bigId) : null; if (bigId && !big) return;
  const tix = big ? [] : spS().tix.filter(t => !t.done); if (!big && !tix.length) return;
  const n = big ? big.n : tix.length;
  const close = showModal(`<h2>🎫 스피또2000 ${n.toLocaleString()}장 한번에</h2>
    <div class="sp-ticket"><div class="sp-head"><b>SPEETTO 2000 × ${n.toLocaleString()}</b><small>한 번 긁으면 전부</small></div>
      <div class="sp-area sp-bulk" id="spArea"><div class="sp-bulk-c"><b>${n.toLocaleString()}장</b><small>${fmtKRWn(n * SP.price)}어치</small></div><canvas id="spCv"></canvas></div></div>
    <div id="spBulkRes"></div>
    <div class="acts"><button class="btn" id="spAll">전부 긁기</button><button class="btn solid" data-close>닫기</button></div>`, () => lotRender());
  $('#modal').dataset.kind = 'info';
  const area = $('#spArea'), cv = $('#spCv'), r = area.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
  const gr = ctx.createLinearGradient(0, 0, r.width, r.height); gr.addColorStop(0, '#C9CED8'); gr.addColorStop(.5, '#EEF1F6'); gr.addColorStop(1, '#AEB4C0');
  ctx.fillStyle = gr; ctx.fillRect(0, 0, r.width, r.height);
  ctx.fillStyle = 'rgba(80,88,104,.55)'; ctx.font = '700 15px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`여기를 긁으면 ${n.toLocaleString()}장 모두 확인`, r.width / 2, r.height / 2 + 5);
  ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 30;
  let down = false, last = null, k = 0, done = false;
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const reveal = () => {
    if (done) return; done = true;
    cv.style.transition = 'opacity .35s'; cv.style.opacity = 0; setTimeout(() => cv.remove(), 360);
    const net0 = S.krw, cost = n * SP.price;
    if (big){
      const s2 = spS(); if (!(s2.big || []).some(b => b.id === big.id)) return;   // 이미 긁은 묶음
      big.c.forEach((k, i) => { if (k){ const g = SP.tiers[i][0]; S.krw += k * (g - lotTax(g)); } });
      s2.big = s2.big.filter(b => b.id !== big.id);
      const got = S.krw - net0, wonN = big.c.reduce((a, b) => a + b, 0);
      altLog('sp', `스피또2000 ${n.toLocaleString()}장 묶음 긁기 (당첨 ${wonN.toLocaleString()}장)`, got, 'KRW');
      commit();
      const btn = $('#spAll'); if (btn) btn.remove();
      setTimeout(() => { const tk = $('#modal .sp-ticket'); if (tk) tk.remove(); }, 360);
      spBulkShowC(big.c, n, got, cost); return;
    }
    tix.forEach(t => spSettle(t, true));
    const won = tix.filter(t => t.rank), got = S.krw - net0;
    altLog('sp', `스피또2000 ${n}장 한번에 긁기 (당첨 ${won.length}장)`, got, 'KRW');
    spTrim(); commit();
    const btn = $('#spAll'); if (btn) btn.remove();
    setTimeout(() => { const tk = $('#modal .sp-ticket'); if (tk) tk.remove(); }, 360);   // 결과가 화면에 다 들어오게 복권 그림은 치운다
    spBulkShow(tix, got, cost);
  };
  const check = () => {
    const d = ctx.getImageData(0, 0, cv.width, cv.height).data; let clear = 0;
    for (let i = 3; i < d.length; i += 4 * 16) if (d[i] === 0) clear++;
    if (clear / (d.length / 64) > 0.45) reveal();
  };
  cv.addEventListener('pointerdown', e => { down = true; last = pt(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener('pointermove', e => { if (!down) return; const p = pt(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; if (++k % 8 === 0) check(); e.preventDefault(); });
  const up = () => { if (down){ down = false; check(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.style.touchAction = 'none';
  $('#spAll').onclick = reveal;
}
// 결과: 당첨된 장은 당첨금이 큰 순서로 한 장씩 위에서 떨어져 쌓이고, 꽝은 한 줄로 묶는다
// 묶음 결과: 등수마다 한 줄 (장수와 세후 합계)
function spBulkShowC(c, n, got, cost){
  const box = $('#spBulkRes'); if (!box) return;
  const wonN = c.reduce((a, b) => a + b, 0), lose = n - wonN, pl = got - cost;
  const rows = c.map((k, i) => { if (!k) return ''; const g = SP.tiers[i][0], net = g - lotTax(g); return `<div class="sp-stk r${Math.min(i + 1, 4)}" style="animation-delay:${i * 90}ms"><b>${i + 1}등 × ${k.toLocaleString()}</b><span class="num">${fmtKRWn(k * net)}</span>${net !== g ? `<small>장당 세후 ${fmtKRWn(net)}</small>` : ''}</div>`; }).join('');
  box.innerHTML = `<div class="sp-sum"><div><span>산 돈</span><b class="num">${fmtKRWn(cost)}</b></div><div><span>받은 돈 (세후)</span><b class="num up">${fmtKRWn(got)}</b></div><div><span>손익</span><b class="num ${pl > 0 ? 'up' : pl < 0 ? 'down' : ''}">${pl > 0 ? '+' : pl < 0 ? MINUS : ''}${fmtKRWn(Math.abs(pl))}</b></div></div>
    <p class="muted" style="margin:6px 0">${c.map((k, i) => k ? `${i + 1}등 ${k.toLocaleString()}장` : '').filter(Boolean).join(' · ')}${wonN ? ' · ' : ''}꽝 ${lose.toLocaleString()}장 · 돌려받은 비율 ${(got / cost * 100).toFixed(1)}%</p>
    <div class="info-body sp-stack">${rows}${lose ? `<div class="sp-stk lose" style="animation-delay:${6 * 90}ms"><b>꽝</b><span class="num">${lose.toLocaleString()}장</span></div>` : ''}</div>`;
  const top = c.findIndex(k => k > 0); if (top >= 0 && top <= 2) toast(`🎉 ${top + 1}등 당첨! ${fmtKRWn(SP.tiers[top][0])}`);
}
function spBulkShow(tix, got, cost){
  const box = $('#spBulkRes'); if (!box) return;
  const win = tix.filter(t => t.rank).sort((a, b) => a.rank - b.rank), lose = tix.length - win.length;
  const cnt = {}; win.forEach(t => cnt[t.rank] = (cnt[t.rank] || 0) + 1);
  const pl = got - cost;
  const rows = win.map((t, i) => {
    const g = SP.tiers[t.rank - 1][0];
    return `<div class="sp-stk r${Math.min(t.rank, 4)}" style="animation-delay:${Math.min(i, 40) * 45}ms"><b>${t.rank}등</b><span class="num">${fmtKRWn(g)}</span>${t.net !== g ? `<small>세후 ${fmtKRWn(t.net)}</small>` : ''}</div>`;
  }).join('');
  box.innerHTML = `<div class="sp-sum"><div><span>산 돈</span><b class="num">${fmtKRWn(cost)}</b></div><div><span>받은 돈 (세후)</span><b class="num up">${fmtKRWn(got)}</b></div><div><span>손익</span><b class="num ${pl > 0 ? 'up' : pl < 0 ? 'down' : ''}">${pl > 0 ? '+' : pl < 0 ? MINUS : ''}${fmtKRWn(Math.abs(pl))}</b></div></div>
    <p class="muted" style="margin:6px 0">${win.length ? Object.keys(cnt).map(r => `${r}등 ${cnt[r]}장`).join(' · ') + ' · ' : ''}꽝 ${lose.toLocaleString()}장</p>
    <div class="info-body sp-stack">${rows}${lose ? `<div class="sp-stk lose" style="animation-delay:${Math.min(win.length, 40) * 45}ms"><b>꽝</b><span class="num">${lose.toLocaleString()}장</span></div>` : ''}</div>`;
  if (win.some(t => t.rank <= 3)) toast(`🎉 ${win[0].rank}등 당첨! ${fmtKRWn(SP.tiers[win[0].rank - 1][0])}`);
}
function spShow(t){
  const r = $('#spRes'); if (!r) return;
  $$('#spArea .sp-g').forEach((g, i) => { const f = t.face[i]; if (f.a === f.b) g.classList.add('win'); });
  r.innerHTML = t.rank ? `<b class="up">🎉 ${t.rank}등 당첨! ${fmtKRWn(SP.tiers[t.rank - 1][0])}</b>${t.net !== undefined && t.net !== SP.tiers[t.rank - 1][0] ? `<small>세후 ${fmtKRWn(t.net)}</small>` : ''}` : '<span class="muted">꽝! 다음 기회에</span>';
}
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.lvt){ LV.tab = t.dataset.lvt; renderInvest(); return; }
  if (t.dataset.lsedit !== undefined){ LV.edit = +t.dataset.lsedit; lotRender(); return; }
  if (t.dataset.lgn){ const n = +t.dataset.lgn, g = LV.slip[LV.edit]; const i = g.indexOf(n); if (i >= 0) g.splice(i, 1); else if (g.length < 6) g.push(n); else toast('한 게임에 6개까지 고릅니다', true); lotRender(); return; }
  if (t.dataset.lsauto !== undefined){ LV.slip[LV.edit] = lotAuto(LV.slip[LV.edit]); lotRender(); return; }
  if (t.dataset.lsclr !== undefined){ LV.slip[LV.edit] = []; lotRender(); return; }
  if (t.dataset.lgames){ UI.lotGames = +t.dataset.lgames; lotRender(); return; }
  if (t.id === 'lotBuy'){ lotBuy(); return; }
  if (t.dataset.lclaim){ lotClaim(t.dataset.lclaim); return; }
  if (t.dataset.spbuy){ spBuy(+t.dataset.spbuy); return; }
  if (t.dataset.spopen){ spOpen(t.dataset.spopen); return; }
  if (t.dataset.spall){ spOpenAll(); return; }
  if (t.dataset.spbig){ spOpenAll(t.dataset.spbig); return; }
  if (t.id === 'spBuyN'){ spBuy(parseFloat(String(UI.spN || '').replace(/,/g, '')) || 0); return; }
});

document.addEventListener('input', e => {
  if (e.target.id !== 'spN') return;
  UI.spN = e.target.value.replace(/[^\d]/g, '').slice(0, 15);   // 15자리까지 (그 이상은 정수 계산이 부정확해진다) if (e.target.value !== UI.spN) e.target.value = UI.spN;
  const i = $('#spNInfo'); if (i) i.textContent = spNInfo();
});
document.addEventListener('keydown', e => { if (e.target.id === 'spN' && e.key === 'Enter'){ e.preventDefault(); const b = $('#spBuyN'); b && b.click(); } });
