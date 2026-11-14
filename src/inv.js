/* ───────── 투자 탭: 하위 탭 · 추가 자료(금리·로또·아파트) · 채권 · 주택 ───────── */
const SUBS = [['stock', '주식'], ['bond', '채권'], ['house', '주택'], ['gamble', '도박'], ['lotto', '복권']];
const XD = {rates:null, lotto:null, housing:null, at:{}, err:{}};
const XD_TTL = {rates:5 * 60e3, lotto:10 * 60e3, housing:6 * 3600e3};
const YEAR_MS = 365.25 * 864e5;
async function loadExtra(name, force){
  if (!force && XD.at[name] && Date.now() - XD.at[name] < XD_TTL[name]) return XD[name];
  XD.at[name] = Date.now();
  try {
    const r = await fetch(`data/${name}.json?t=${Math.floor(Date.now() / 60000)}`, {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    XD[name] = await r.json(); XD.err[name] = null;
  } catch(e){ XD.err[name] = String(e.message || e); }
  return XD[name];
}
async function loadExtras(force){
  await Promise.all(['rates', 'lotto', 'housing'].map(n => loadExtra(n, force)));
  if (S && !S._ph && altTick()){ commit(); }
  else if (UI.tab === 'market' && UI.sub && UI.sub !== 'stock') renderMarket();
  else if (UI.tab === 'assets') renderAssets();
}
setTimeout(() => loadExtras(false), 2500);
setInterval(() => { if (!document.hidden) loadExtras(false); }, 5 * 60e3);

/* 돈 내기·받기 (원화·달러 통장). 모자라면 다른 통화에서 자동 환전한다. 마이너스통장은 쓰지 않는다 */
function canPayKRW(a){ return S.krw + Math.max(0, S.usd) * fxRates().sell >= a - 1e-6; }
function payKRW(a){
  if (ACC.tester) return true;   // 테스트 계정: 0원 처리
  if (S.krw < a){ const need = usdForKRW(a - S.krw); if (need > S.usd + 1e-9) return false; if (!exchange('u2k', need, true)) return false; }
  S.krw -= a; return true;
}
function canPayUSD(a){ return S.usd + S.krw / fxRates().buy >= a - 1e-6; }
function payUSD(a){
  if (ACC.tester) return true;   // 테스트 계정: 0원 처리
  if (S.usd < a){ const need = fxFromForTarget('k2u', a - S.usd); if (need > S.krw + 1e-9) return false; if (!exchange('k2u', need, true, true)) return false; }
  S.usd -= a; return true;
}
function altLog(k, s, amt, cur){
  (S.altLog = S.altLog || []).unshift({at:Date.now(), dt:tradeDateLabel(), k, s, amt, cur});
  if (S.altLog.length > 300) S.altLog.length = 300;
}

/* ── 채권 ──
   만기별 국채 금리(연 %, 네이버 증권)를 선형으로 이어 금리 곡선 y(t)를 만들고, 남은 현금흐름을 그 만기의 금리로 할인한다.
   가격 P = Σ CFₖ / (1 + y(tₖ)/2)^(2tₖ)   (tₖ: 지금부터 k번째 현금흐름까지의 햇수, 반기 복리)
   새로 살 때도 같은 식으로 값을 매기므로 사자마자 이익이나 손해가 생기지 않는다. 표면금리는 산 날 그 만기의 금리 */
const BOND_T = {US:[0.25, 1, 2, 5, 10, 30], KR:[1, 3, 5, 10, 20, 30]};
const bondName = (c, T) => `${c === 'US' ? '미국' : '한국'} 국채 ${T < 1 ? Math.round(T * 12) + '개월' : T + '년'}`;
function curve(c){
  const cur = XD.rates && XD.rates.cur; if (!cur) return null;
  const pts = BOND_T[c].map(T => [T, cur[c + T] ? +cur[c + T][0] : NaN]).filter(p => isFinite(p[1]));
  return pts.length >= 2 ? pts : null;
}
function yAt(c, t){
  const p = curve(c); if (!p) return null;
  if (t <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) if (t <= p[i][0]){ const [a, ya] = p[i - 1], [b, yb] = p[i]; return ya + (yb - ya) * (t - a) / (b - a); }
  return p[p.length - 1][1];
}
function bondFlows(b, now){
  if (!b.cpn) return [[(b.mat - now) / YEAR_MS, b.face, b.mat]];
  const n = Math.round(b.T * 2), out = [];
  for (let k = b.paid + 1; k <= n; k++){ const at = b.t0 + k * YEAR_MS / 2; out.push([(at - now) / YEAR_MS, b.face * b.cpn / 100 / 2 + (k === n ? b.face : 0), at]); }
  return out;
}
function bondPV(b, now = Date.now()){
  let pv = 0;
  for (const [t, a] of bondFlows(b, now)){
    if (t <= 0){ pv += a; continue; }
    const y = yAt(b.c, t); if (y === null) return null;
    pv += a / Math.pow(1 + y / 100 / 2, 2 * t);
  }
  return pv;
}
const bondVal = b => { const v = bondPV(b); if (v !== null) b.v = v; return b.v !== undefined ? b.v : b.cost; };
// 이자·만기 처리. 바뀐 것이 있으면 true
function bondTick(){
  if (!Array.isArray(S.bonds) || !S.bonds.length) return false;
  const now = Date.now(); let ch = false;
  S.bonds = S.bonds.filter(b => {
    const credit = a => { if (b.c === 'US') receiveUSD(a); else S.krw += a; };
    if (b.cpn){
      const n = Math.round(b.T * 2);
      while (b.paid < n && b.t0 + (b.paid + 1) * YEAR_MS / 2 <= now){
        b.paid++; const c = b.face * b.cpn / 100 / 2; credit(c); ch = true;
        altLog('bond', `${bondName(b.c, b.T)} 이자 (${b.paid}/${n}회)`, c, b.c === 'US' ? 'USD' : 'KRW');
      }
      if (b.paid >= n){ credit(b.face); altLog('bond', `${bondName(b.c, b.T)} 만기 원금`, b.face, b.c === 'US' ? 'USD' : 'KRW'); toast(`${bondName(b.c, b.T)}이 만기되어 원금이 들어왔습니다`); return false; }
      return true;
    }
    if (b.mat <= now){ credit(b.face); ch = true; altLog('bond', `${bondName(b.c, b.T)} 만기 (액면)`, b.face, b.c === 'US' ? 'USD' : 'KRW'); toast(`${bondName(b.c, b.T)}이 만기되었습니다`); return false; }
    return true;
  });
  return ch;
}
function bondBuy(c, T, amt){
  if (!isLive()) return toast('채권은 실제 시세 모드에서만 살 수 있습니다', true);
  if (S.over) return toast('파산해서 거래할 수 없습니다', true);
  const y = yAt(c, T); if (y === null) return toast('금리를 아직 받지 못했습니다', true);
  const now = Date.now(), cpn = T < 1 ? 0 : Math.round(y * 1000) / 1000;
  const unit = {c, T, face:1, cpn, t0:now, mat:now + T * YEAR_MS, paid:0};
  const pu = bondPV(unit, now); if (!(pu > 0)) return toast('가격을 계산하지 못했습니다', true);
  const face = amt / pu;
  if (c === 'US' ? !payUSD(amt) : !payKRW(amt)) return toast('돈이 모자랍니다', true);
  (S.bonds = S.bonds || []).push({id:Math.random().toString(36).slice(2, 9), ...unit, face, cost:amt, y0:y, v:amt});
  altLog('bond', `${bondName(c, T)} 매수 (표면금리 ${cpn ? cpn.toFixed(3) + '%' : '할인채'})`, -amt, c === 'US' ? 'USD' : 'KRW');
  commit(); toast(`${bondName(c, T)}을 ${c === 'US' ? fmtUSD(amt) : fmtKRW(amt)}어치 샀습니다`);
}
function bondSell(id){
  const b = (S.bonds || []).find(x => x.id === id); if (!b) return;
  const v = bondPV(b); if (v === null) return toast('금리를 아직 받지 못했습니다', true);
  if (b.c === 'US') receiveUSD(v); else S.krw += v;
  S.bonds = S.bonds.filter(x => x !== b);
  altLog('bond', `${bondName(b.c, b.T)} 매도 (손익 ${b.c === 'US' ? signUSD(v - b.cost) : fmtKRW(v - b.cost)})`, v, b.c === 'US' ? 'USD' : 'KRW');
  commit(); toast(`${bondName(b.c, b.T)}을 팔았습니다`);
}
const bpChg = (c, T) => {   // 전 거래일 대비 (bp = 0.01%p)
  const h = XD.rates && XD.rates.hist && XD.rates.hist[c + T]; if (!h) return null;
  const ks = Object.keys(h).sort(); if (ks.length < 2) return null;
  return (h[ks[ks.length - 1]] - h[ks[ks.length - 2]]) * 100;
};
function bondPaneHTML(){
  if (!isLive()) return `<p class="empty">채권은 실제 시세 모드에서만 거래합니다. 규칙·설정에서 실제 시세 모드로 바꾸세요.</p>`;
  if (!XD.rates) return `<p class="empty">${XD.err.rates ? `금리 자료를 받지 못했습니다 (${esc(XD.err.rates)})` : '금리를 불러오는 중…'}</p>`;
  INFO.bond = {t:'채권 계산 방식', h:`<div class="prose"><p>금리는 네이버 증권의 국채 금리(연 %)입니다. 만기 사이의 금리는 이웃한 두 만기의 금리를 직선으로 이어 정합니다.</p>
    <div class="eq">P = Σ CF<sub>k</sub> / (1 + y(t<sub>k</sub>)/2)<sup>2t<sub>k</sub></sup></div>
    <ul class="defs"><li><span class="sym">P</span><span>채권 가격 (경과이자 포함)</span></li><li><span class="sym">CF<sub>k</sub></span><span>k번째로 받을 돈: 6개월마다 이자 = 액면 × 표면금리 ÷ 2, 마지막에는 액면도 함께</span></li><li><span class="sym">t<sub>k</sub></span><span>지금부터 그 돈을 받을 때까지의 햇수</span></li><li><span class="sym">y(t)</span><span>만기 t의 지금 국채 금리 (연 %, 반기 복리로 씀)</span></li></ul>
    <p>새로 살 때 표면금리는 그날 그 만기의 금리이고, 가격도 같은 식으로 매기므로 사자마자 손익이 생기지 않습니다. 금리가 오르면 가격이 내리고, 내리면 오릅니다. 1년보다 짧은 미국 국채(3개월)는 이자 없이 액면보다 싸게 사서 만기에 액면을 받는 할인채입니다.</p>
    <p>이자는 6개월마다, 원금은 만기에 통장으로 들어옵니다(미국 국채는 달러, 한국 국채는 원화). 수수료와 세금은 없습니다. 실제 국채의 발행일·표면금리와는 다르고, 산 날을 발행일로 보는 가상의 채권입니다.</p></div>`};
  const row = (c, T) => {
    const cur = XD.rates.cur[c + T]; if (!cur) return '';
    const ch = bpChg(c, T);
    return `<button class="bd-row" data-bondbuy="${c}|${T}"><span class="bd-n"><b>${bondName(c, T)}</b><small>${T < 1 ? '할인채' : '6개월마다 이자'}</small></span><span class="bd-y num">${(+cur[0]).toFixed(3)}%</span><span class="bd-c num ${ch === null ? 'flat' : ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat'}">${ch === null ? '' : `${ch > 0 ? '+' : ch < 0 ? MINUS : ''}${Math.abs(ch).toFixed(1)}bp`}</span></button>`;
  };
  const mine = (S.bonds || []).map(b => {
    const v = bondVal(b), pl = v - b.cost, f = b.c === 'US' ? fmtUSD : fmtKRW;
    const d = new Date(b.mat);
    return `<div class="bd-hold"><span class="bd-n"><b>${bondName(b.c, b.T)}</b><small>${b.cpn ? `표면 ${b.cpn.toFixed(3)}%` : '할인채'} · 액면 ${f(b.face)} · ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')} 만기</small></span><span class="bd-v"><b class="num">${f(v)}</b><small class="num ${cls(pl)}">${pl >= 0 ? '+' : ''}${f(pl)}</small></span><button class="btn" data-bondsell="${b.id}">팔기</button></div>`;
  }).join('');
  const t = XD.rates.at ? new Date(XD.rates.at * 1000) : null;
  return `<section class="card"><div class="card-h"><h2>내 채권 ${infoBtn('bond')}</h2><small>${(S.bonds || []).length}개</small></div>${mine || '<p class="empty">가진 채권이 없습니다. 아래에서 만기를 골라 사세요.</p>'}</section>
    <section class="card"><div class="card-h"><h2>미국 국채</h2><small>달러로 삽니다</small></div>${BOND_T.US.map(T => row('US', T)).join('')}</section>
    <section class="card"><div class="card-h"><h2>한국 국채</h2><small>원화로 삽니다</small></div>${BOND_T.KR.map(T => row('KR', T)).join('')}</section>
    <p class="muted" style="margin:4px 2px">금리 출처: 네이버 증권${t ? `, ${t.getMonth() + 1}/${t.getDate()} ${kstTime(t)} 받음` : ''}. 전일 대비는 전 거래일 종가 금리와의 차이(1bp = 0.01%p)입니다.</p>`;
}
function bondBuyDialog(c, T){
  const y = yAt(c, T); if (y === null) return toast('금리를 아직 받지 못했습니다', true);
  const usd = c === 'US', cur = usd ? '$' : '원';
  const close = showModal(`<h2>${bondName(c, T)} 사기</h2><p class="muted" style="margin:0 0 8px">지금 금리 ${y.toFixed(3)}% · ${T < 1 ? '할인채 (만기에 액면)' : `표면금리 ${y.toFixed(3)}%, 6개월마다 이자`} · ${T}년 뒤 만기</p>
    <label class="amt"><input id="bdAmt" type="text" inputmode="decimal" placeholder="${usd ? '살 금액 (달러)' : '살 금액 (원)'}"><span>${cur}</span></label>
    <div class="quick" style="margin:8px 0">${(usd ? [100, 500, 1000, 5000] : [100000, 1000000, 5000000]).map(v => `<button data-bdq="${v}">${usd ? '$' + v.toLocaleString() : (v / 10000).toLocaleString() + '만'}</button>`).join('')}</div>
    <div class="bd" id="bdInfo"></div>
    <div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="bdGo" disabled>사기</button></div>`);
  const inp = $('#bdAmt');
  const upd = () => {
    const a = parseFloat(inp.value.replace(/,/g, '')) || 0;
    const now = Date.now(), unit = {c, T, face:1, cpn:T < 1 ? 0 : Math.round(y * 1000) / 1000, t0:now, mat:now + T * YEAR_MS, paid:0};
    const pu = bondPV(unit, now), face = a / pu, f = usd ? fmtUSD : fmtKRW;
    const ok = a > 0 && (usd ? canPayUSD(a) : canPayKRW(a));
    $('#bdInfo').innerHTML = a > 0 ? `<div><span>액면</span><b class="num">${f(face)}</b></div><div><span>가격 (액면 100당)</span><b class="num">${(pu * 100).toFixed(3)}</b></div>${T >= 1 ? `<div><span>6개월마다 받을 이자</span><b class="num">${f(face * unit.cpn / 100 / 2)}</b></div>` : ''}<div><span>만기에 받을 원금</span><b class="num">${f(face)}</b></div>${ok ? '' : `<div class="tot"><span>돈이 모자랍니다</span><b></b></div>`}` : '';
    $('#bdGo').disabled = !ok;
  };
  inp.addEventListener('input', upd);
  $$('[data-bdq]').forEach(b => b.onclick = () => { inp.value = b.dataset.bdq; upd(); });
  $('#bdGo').onclick = () => { const a = parseFloat(inp.value.replace(/,/g, '')) || 0; close(); bondBuy(c, T, a); };
}

/* ── 주택 (한국부동산원 (월) 평균단위매매가격_아파트, 천원/㎡) ── */
const HOUSE_SEOUL = ['530011', '530012', '530013', '530015', '530016', '530017', '530018', '530019', '530020', '530021', '530022', '530024', '530025', '530026', '530029', '530030', '530031', '530032', '530033', '530034', '530035', '530037', '530038', '530039', '530040'];
const HOUSE_PROV = ['500009', '500010', '500011', '500012', '500013', '500014', '500015', '500016', '500017', '500018', '500019', '500020', '500021', '500022', '500023', '500024'];
const HOUSE_AREAS = [59, 84, 114];
function hReg(cls){ return XD.housing && XD.housing.r && XD.housing.r[cls]; }
function hPx(cls){   // 최신 달의 ㎡당 가격(원)
  const r = hReg(cls); if (!r) return null;
  const ks = Object.keys(r.h).sort(); return ks.length ? r.h[ks[ks.length - 1]] * 1000 : null;
}
function hChg(cls){ const r = hReg(cls); if (!r) return null; const ks = Object.keys(r.h).sort(); return ks.length >= 2 ? r.h[ks[ks.length - 1]] / r.h[ks[0]] - 1 : null; }
const hName = cls => { const r = hReg(cls); const n = r ? r.n : cls; return HOUSE_SEOUL.includes(cls) ? `서울 ${n}` : n; };
const ymText = ym => ym ? `${ym.slice(0, 4)}년 ${+ym.slice(4)}월` : '';
const houseVal = h => { const p = hPx(h.cls); if (p !== null) h.v = p * h.m2; return h.v !== undefined ? h.v : h.cost; };
function houseBuy(cls, m2){
  if (!isLive()) return toast('주택은 실제 시세 모드에서만 살 수 있습니다', true);
  if (S.over) return toast('파산해서 거래할 수 없습니다', true);
  const p = hPx(cls); if (p === null) return toast('시세를 아직 받지 못했습니다', true);
  const cost = Math.round(p * m2);
  if (!payKRW(cost)) return toast('돈이 모자랍니다', true);
  (S.houses = S.houses || []).push({id:Math.random().toString(36).slice(2, 9), cls, m2, p0:p, cost, t0:Date.now(), v:cost});
  altLog('house', `${hName(cls)} 아파트 ${m2}㎡ 매수`, -cost, 'KRW');
  commit(); toast(`${hName(cls)} 아파트 ${m2}㎡를 ${fmtKRW(cost)}에 샀습니다`);
}
function houseSell(id){
  const h = (S.houses || []).find(x => x.id === id); if (!h) return;
  const v = houseVal(h);
  S.krw += v; S.houses = S.houses.filter(x => x !== h);
  altLog('house', `${hName(h.cls)} 아파트 ${h.m2}㎡ 매도 (손익 ${fmtKRW(v - h.cost)})`, v, 'KRW');
  commit(); toast(`${hName(h.cls)} 아파트를 ${fmtKRW(v)}에 팔았습니다`);
}
const eok = w => w >= 1e8 ? `${(w / 1e8).toFixed(w >= 1e9 ? 1 : 2)}억` : `${Math.round(w / 1e4).toLocaleString()}만`;
function housePaneHTML(){
  if (!isLive()) return `<p class="empty">주택은 실제 시세 모드에서만 거래합니다. 규칙·설정에서 실제 시세 모드로 바꾸세요.</p>`;
  if (!XD.housing) return `<p class="empty">${XD.err.housing ? `시세 자료를 받지 못했습니다 (${esc(XD.err.housing)})` : '시세를 불러오는 중…'}</p>`;
  const ym = XD.housing.ym, ks = Object.keys((hReg('500001') || {h:{}}).h).sort();
  INFO.house = {t:'주택 시세', h:`<div class="prose"><p>한국부동산원 전국주택가격동향조사의 <b>(월) 평균단위매매가격_아파트</b>(㎡당 평균 매매가격, 통계표 ${XD.housing.tbl || 'A_2024_00061'})를 씁니다. 지금은 ${ymText(ym)} 값이고, 다음 달 통계가 나오면 바뀝니다(보통 다음 달 중순).</p>
    <div class="eq">가격 = ㎡당 평균 매매가격 × 전용면적(㎡)</div>
    <p>서울은 25개 구별, 나머지는 시·도별입니다. 실제 아파트 한 채의 값이 아니라 그 지역 아파트 표본의 평균이므로, 사고판 뒤의 손익은 그 지역 평균 시세가 오르내린 만큼입니다. 세금(취득세·양도세), 중개 수수료, 대출 규제는 넣지 않았습니다. 변동률은 ${ks.length ? ymText(ks[0]) : ''}부터 ${ymText(ym)}까지입니다.</p></div>`};
  const row = cls => {
    const p = hPx(cls); if (p === null) return '';
    const c = hChg(cls), nm = (hReg(cls) || {}).n || cls;
    return `<button class="bd-row" data-housebuy="${cls}"><span class="bd-n"><b>${esc(nm)}</b><small>84㎡ 약 ${eok(p * 84)}</small></span><span class="bd-y num">${Math.round(p / 1e4).toLocaleString()}만/㎡</span><span class="bd-c num ${c === null ? 'flat' : cls2(c)}">${c === null ? '' : fmtPct(c)}</span></button>`;
  };
  const mine = (S.houses || []).map(h => {
    const v = houseVal(h), pl = v - h.cost;
    return `<div class="bd-hold"><span class="bd-n"><b>${esc(hName(h.cls))} 아파트</b><small>${h.m2}㎡ · 산 값 ${eok(h.cost)}</small></span><span class="bd-v"><b class="num">${fmtKRW(v)}</b><small class="num ${cls(pl)}">${pl >= 0 ? '+' : ''}${fmtKRW(pl)} (${fmtPct(h.cost ? pl / h.cost : 0)})</small></span><button class="btn" data-housesell="${h.id}">팔기</button></div>`;
  }).join('');
  UI.hView = UI.hView || 'kr';
  const list = UI.hView === 'seoul' ? HOUSE_SEOUL : HOUSE_PROV;
  return `<section class="card"><div class="card-h"><h2>내 주택 ${infoBtn('house')}</h2><small>${(S.houses || []).length}채</small></div>${mine || '<p class="empty">가진 주택이 없습니다. 아래 지도에서 지역을 골라 사세요.</p>'}</section>
    <section class="card"><div class="card-h"><h2>지역 고르기</h2><small>${ymText(ym)} ㎡당 평균</small></div>
      <div class="seg" style="margin-bottom:10px"><button data-hview="kr" aria-pressed="${UI.hView === 'kr'}">전국 시·도</button><button data-hview="seoul" aria-pressed="${UI.hView === 'seoul'}">서울 25개 구</button></div>
      <div class="hmap-wrap">${houseMapHTML(UI.hView)}<div class="hmap-side" id="hSide">${houseSideHTML()}</div></div>
      <details class="hmap-list"><summary>목록으로 보기</summary>${list.map(row).join('')}</details>
    </section>
    <p class="muted" style="margin:4px 2px">출처: 한국부동산원 부동산통계정보(R-ONE). 변동률은 최근 ${Math.max(0, ks.length - 1)}개월. 지도 경계: 통계청 센서스용 행정구역경계(2013, southkorea-maps), 2023년 대구로 편입된 군위군은 경북에 그려져 있습니다.</p>`;
}
/* 지도 색: ㎡당 가격을 지금 보이는 지역들의 5분위로 나눠 한 색(파랑)의 다섯 단계로 칠한다.
   밝은 화면은 비쌀수록 진하게, 어두운 화면은 비쌀수록 밝게 (어두운 바탕에서 값이 클수록 눈에 띄게) */
const HMAP_RAMP = {light:['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'], dark:['#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4']};
// 전국 지도에서 좁은 광역시 이름: [x, y, 지시선으로 뺄지, 보통 크기 글씨인지]. 나머지는 지역 안쪽 가장 넓은 곳(경계에서 가장 먼 점)에 쓴다
const HMAP_LAB = {'500008':[331, 182], '500010':[222, 236, 1], '500016':[292, 296, 1], '500014':[394, 392], '500012':[552, 467],
                  '500013':[314, 587], '500021':[398, 640, 0, 1], '500015':[700, 512, 1], '500011':[690, 600, 1]};
const HMAP_TXT = {light:['#13203A', '#13203A', '#FFFFFF', '#FFFFFF', '#FFFFFF'], dark:['#FFFFFF', '#FFFFFF', '#0C1320', '#0C1320', '#0C1320']};
function hBreaks(ids){   // 5분위 경계 (만 원/㎡, 10만 원 단위로 내림)
  const v = ids.map(c => hPx(c)).filter(x => x !== null).map(x => x / 1e4).sort((a, b) => a - b);
  if (!v.length) return [];
  const st = UI.hView === 'seoul' ? 50 : 10;
  const b = [1, 2, 3, 4].map(k => Math.floor(v[Math.min(v.length - 1, Math.round(k * v.length / 5))] / st) * st);
  return b.filter((x, i) => i === 0 || x > b[i - 1]);
}
const hClass = (p, br) => { let k = 0; while (k < br.length && p / 1e4 >= br[k]) k++; return br.length === 4 ? k : Math.round(k * 4 / Math.max(1, br.length)); };
function houseMapHTML(view){
  const M = HMAP[view], dark = document.documentElement.dataset.mode === 'dark' ? 'dark' : 'light';
  const ids = Object.keys(M.r), br = hBreaks(ids);
  const regs = ids.map(c => {
    const p = hPx(c), k = p === null ? -1 : hClass(p, br), sel = UI.hSel === c;
    const nm = view === 'kr' ? M.r[c].n : ((hReg(c) || {}).n || '');
    const tip = `${view === 'kr' ? nm : '서울 ' + nm} · ${p === null ? '시세 없음' : Math.round(p / 1e4).toLocaleString() + '만 원/㎡'}`;
    return {c, k, sel, nm, svg:`<path d="${M.r[c].d}" data-hreg="${c}" tabindex="0" role="button" aria-label="${esc(tip)}" fill="${k < 0 ? 'var(--surface-2)' : HMAP_RAMP[dark][k]}" class="${sel ? 'sel' : ''}"><title>${esc(tip)}</title></path>`,
            lab:(() => {
              const t = esc(view === 'kr' ? nm : nm.replace(/구$/, '') || nm), [x, y] = M.r[c].l, o = view === 'kr' && HMAP_LAB[c];
              if (o && o[2]) return `<line x1="${x}" y1="${y}" x2="${o[0]}" y2="${o[1]}" class="lead"/><circle cx="${x}" cy="${y}" r="3" class="lead-dot"/><text x="${o[0]}" y="${o[1]}" class="sm out" style="text-anchor:${o[0] < x ? 'end' : 'start'}" dx="${o[0] < x ? -4 : 4}">${t}</text>`;
              return `<text x="${o ? o[0] : x}" y="${o ? o[1] : y}"${o && !o[3] ? ' class="sm"' : ''} fill="${k < 0 ? 'var(--ink-2)' : HMAP_TXT[dark][k]}">${t}</text>`;
            })()};
  });
  regs.sort((a, b) => a.sel - b.sel);   // 고른 지역의 테두리가 위에 보이게 맨 뒤에
  const dok = view === 'kr' ? (() => { const p = hPx('500022'), k = p === null ? -1 : hClass(p, br); const t = `독도 (경북 울릉군) · ${p === null ? '시세 없음' : Math.round(p / 1e4).toLocaleString() + '만 원/㎡'}`;
    return `<circle cx="${M.dokdo[0] - 4}" cy="${M.dokdo[1]}" r="6" data-hreg="500022" class="${UI.hSel === '500022' ? 'sel' : ''}" fill="${k < 0 ? 'var(--surface-2)' : HMAP_RAMP[dark][k]}"><title>${t}</title></circle><circle cx="${M.dokdo[0] - 4}" cy="${M.dokdo[1]}" r="22" data-hreg="500022" class="hit"><title>${t}</title></circle>`; })() : '';
  const fmt = x => x.toLocaleString();
  const leg = br.length ? HMAP_RAMP[dark].slice(0, br.length + 1).map((col, i) => `<span><i style="background:${col}"></i>${i === 0 ? `${fmt(br[0])}만 미만` : i === br.length ? `${fmt(br[i - 1])}만 이상` : `${fmt(br[i - 1])}~${fmt(br[i])}만`}</span>`).join('') : '';
  return `<div class="hmap"><svg viewBox="-6 -6 ${M.w + 12} ${M.h + 12}" role="group" aria-label="${view === 'kr' ? '전국 시·도' : '서울 구'} 아파트 ㎡당 평균 매매가격 지도">${regs.map(r => r.svg).join('')}${dok}<g class="hmap-lab${view === 'seoul' ? ' gu' : ''}" aria-hidden="true">${regs.map(r => r.lab).join('')}</g></svg>
    <div class="hmap-leg" aria-label="범례 (㎡당 평균, 만 원)">${leg}</div><div class="hmap-tip" id="hTip" hidden></div></div>`;
}
function houseSideHTML(){
  const c = UI.hSel, p = c ? hPx(c) : null;
  if (!c || p === null || !(UI.hView === 'seoul' ? HOUSE_SEOUL : [...HOUSE_PROV, '500008']).includes(c))
    return `<p class="muted" style="margin:0">${UI.hView === 'kr' ? '지도에서 시·도를 누르세요. 서울을 누르면 구별 지도로 바뀝니다.' : '지도에서 구를 누르세요.'}</p>`;
  const ch = hChg(c), ks = Object.keys(hReg(c).h).sort();
  return `<h3>${esc(hName(c))}</h3>
    <div class="kv"><div><span>㎡당 평균</span><b class="num">${Math.round(p / 1e4).toLocaleString()}만 원</b></div>
      <div><span>84㎡ 한 채</span><b class="num">약 ${eok(p * 84)}</b></div>
      <div><span>${ks.length >= 2 ? `${ymText(ks[0])}부터` : '변동'}</span><b class="num ${ch === null ? '' : cls2(ch)}">${ch === null ? '—' : fmtPct(ch)}</b></div></div>
    <button class="btn solid" data-housebuy="${c}" style="width:100%;margin-top:10px">이 지역 아파트 사기</button>`;
}
function houseMapPick(c){
  if (UI.hView === 'kr' && c === '500008'){ UI.hView = 'seoul'; UI.hSel = null; }   // 서울은 구별로 산다
  else UI.hSel = c;
  renderInvest();
}
document.addEventListener('click', e => {
  const r = e.target.closest && e.target.closest('[data-hreg]'); if (r){ houseMapPick(r.dataset.hreg); return; }
  const v = e.target.closest && e.target.closest('[data-hview]'); if (v){ UI.hView = v.dataset.hview; UI.hSel = null; renderInvest(); }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.dataset && e.target.dataset.hreg){ e.preventDefault(); const c = e.target.dataset.hreg; houseMapPick(c); const n = document.querySelector(`[data-hreg="${c}"]`); n && n.focus(); }
});
// 한 지역이 여러 조각(경북 본토·울릉도·독도)이면 하나에 올려도 모두 밝게
document.addEventListener('pointerover', e => {
  const r = e.target.closest && e.target.closest('[data-hreg]');
  $$('.hmap .hot').forEach(x => { if (!r || x.dataset.hreg !== r.dataset.hreg) x.classList.remove('hot'); });
  if (r) $$(`.hmap [data-hreg="${r.dataset.hreg}"]`).forEach(x => x.classList.add('hot'));
});
document.addEventListener('pointermove', e => {   // 마우스를 올리면 지역 이름과 가격
  const tip = document.getElementById('hTip'); if (!tip) return;
  const r = e.pointerType === 'mouse' && e.target.closest && e.target.closest('[data-hreg]');
  if (!r){ tip.hidden = true; return; }
  const box = tip.parentElement.getBoundingClientRect(), t = r.querySelector('title');
  tip.textContent = t ? t.textContent : ''; tip.hidden = false;
  tip.style.left = Math.min(box.width - tip.offsetWidth - 4, e.clientX - box.left + 12) + 'px'; tip.style.top = (e.clientY - box.top + 14) + 'px';
});
const cls2 = c => c > 0.000005 ? 'up' : c < -0.000005 ? 'down' : 'flat';
const HOUSE_MAXA = 300;   // 한 채 전용면적 최대 (㎡). 넘게 적으면 이 값으로 계산하고 그렇다고 알려 준다
function houseBuyDialog(cls){
  const p = hPx(cls); if (p === null) return toast('시세를 아직 받지 못했습니다', true);
  UI.hArea = UI.hArea || 84;
  const close = showModal(`<h2>${esc(hName(cls))} 아파트 사기</h2><p class="muted" style="margin:0 0 8px">${ymText(XD.housing.ym)} ㎡당 평균 ${Math.round(p / 1e4).toLocaleString()}만 원</p>
    <p style="margin:0 0 6px">전용면적</p>
    <div class="seg" style="margin-bottom:8px">${HOUSE_AREAS.map(a => `<button data-harea="${a}">${a}㎡</button>`).join('')}</div>
    <label class="amt"><input id="hAreaIn" type="text" inputmode="numeric" value="${UI.hArea}"><span>㎡</span></label>
    <div class="bd" id="hInfo" style="margin-top:8px"></div>
    <div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="hGo">사기</button></div>`);
  const inp = $('#hAreaIn');
  const upd = () => {
    const raw = parseFloat(String(inp.value).replace(/,/g, '')) || 0, a = clamp(raw, 0, HOUSE_MAXA);
    UI.hArea = a;
    $$('[data-harea]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.harea === a)));
    const cost = Math.round(p * a), ok = a >= 10 && canPayKRW(cost);
    $('#hInfo').innerHTML = `<div><span>가격</span><b class="num">${fmtKRW(cost)}</b></div><div><span>쓸 수 있는 돈 (원화 + 달러 환전)</span><b class="num">${fmtKRW(S.krw + S.usd * fxRates().sell)}</b></div>${a < 10 ? '<div class="tot"><span>면적은 10㎡ 이상</span><b></b></div>' : ok ? '' : '<div class="tot"><span>돈이 모자랍니다</span><b></b></div>'}`;
    if (raw > HOUSE_MAXA) $('#hInfo').insertAdjacentHTML('beforeend', `<div class="tot"><span>⚠️ 한 채의 전용면적은 ${HOUSE_MAXA}㎡까지입니다. ${HOUSE_MAXA}㎡로 계산했습니다 (더 사려면 한 채씩 더 사세요)</span></div>`);
    $('#hGo').disabled = !ok;
  };
  inp.addEventListener('input', upd);
  $$('[data-harea]').forEach(b => b.onclick = () => { inp.value = b.dataset.harea; upd(); });
  upd();
  $('#hGo').onclick = () => { const a = clamp(parseFloat(String(inp.value).replace(/,/g, '')) || 0, 10, HOUSE_MAXA); close(); houseBuy(cls, a); };
}

/* ── 순자산에 더하는 채권·주택 평가액 (달러) ── */
function altUSD(){
  let v = 0;
  for (const b of S.bonds || []){ const x = bondVal(b); v += b.c === 'US' ? x : x / FX(); }
  for (const h of S.houses || []) v += houseVal(h) / FX();
  return v;
}
function altTick(){ return isLive() ? bondTick() : false; }

/* ── 투자 탭 화면 ── */
function renderInvest(){
  const v = $('#v-market');
  UI.sub = UI.sub || 'stock';
  if (!v.dataset.built){
    v.dataset.built = 1;
    v.innerHTML = `<div class="subtabs" role="tablist">${SUBS.map(([k, n]) => `<button role="tab" data-sub="${k}">${n}</button>`).join('')}</div>
      ${SUBS.map(([k]) => `<div class="subpane" id="mk-${k}"${k === 'stock' ? '' : ' hidden'}></div>`).join('')}`;
  }
  const top = document.querySelector('.top'); if (top) document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');   // 하위 탭이 머리글 바로 아래에 붙게
  $$('#v-market [data-sub]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.sub === UI.sub)));
  SUBS.forEach(([k]) => { const p = $('#mk-' + k); if (p) p.hidden = k !== UI.sub; });
  if (UI.sub === 'stock') return renderStockPane();
  const p = $('#mk-' + UI.sub);
  if (UI.sub === 'bond'){ p.innerHTML = bondPaneHTML(); loadExtra('rates'); }
  else if (UI.sub === 'house'){ p.innerHTML = housePaneHTML(); loadExtra('housing'); }
  else if (UI.sub === 'gamble') renderGamblePane(p);
  else if (UI.sub === 'lotto') renderLottoPane(p);
}
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.sub){ UI.sub = t.dataset.sub; renderInvest(); window.scrollTo(0, 0); if (t.dataset.sub !== 'stock') loadExtras(false); return; }
  if (t.dataset.bondbuy){ const [c, T] = t.dataset.bondbuy.split('|'); bondBuyDialog(c, +T); return; }
  if (t.dataset.bondsell){ const id = t.dataset.bondsell, b = (S.bonds || []).find(x => x.id === id); if (!b) return;
    const v = bondPV(b), f = b.c === 'US' ? fmtUSD : fmtKRW;
    const c = showModal(`<h2>${bondName(b.c, b.T)} 팔기</h2><div class="bd"><div><span>지금 가격</span><b class="num">${v === null ? '-' : f(v)}</b></div><div><span>산 값</span><b class="num">${f(b.cost)}</b></div></div><div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="bsGo">팔기</button></div>`);
    $('#bsGo').onclick = () => { c(); bondSell(id); }; return; }
  if (t.dataset.housebuy){ houseBuyDialog(t.dataset.housebuy); return; }
  if (t.dataset.housesell){ const id = t.dataset.housesell, h = (S.houses || []).find(x => x.id === id); if (!h) return;
    const v = houseVal(h);
    const c = showModal(`<h2>${esc(hName(h.cls))} 아파트 팔기</h2><div class="bd"><div><span>지금 시세 (${h.m2}㎡)</span><b class="num">${fmtKRW(v)}</b></div><div><span>산 값</span><b class="num">${fmtKRW(h.cost)}</b></div></div><div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="hsGo">팔기</button></div>`);
    $('#hsGo').onclick = () => { c(); houseSell(id); }; return; }
  if (t.dataset.gosub){ UI.sub = t.dataset.gosub; go('market'); return; }
});

/* 내 자산 탭: 채권·주택 보유와 기타 내역 */
function altAssetsHTML(){
  const bs = S.bonds || [], hs = S.houses || [];
  const rows = [
    ...bs.map(b => { const v = bondVal(b), f = b.c === 'US' ? fmtUSD : fmtKRW, pl = v - b.cost; return `<button class="hold" data-gosub="bond"><span class="mono" style="--h:200">채권</span><span class="nmb"><div class="n">${bondName(b.c, b.T)}</div><div class="s">${b.cpn ? `표면 ${b.cpn.toFixed(3)}%` : '할인채'}</div></span><span class="px"><div class="p num">${f(v)}</div><div class="c num ${cls(pl)}">${pl >= 0 ? '+' : ''}${f(pl)}</div></span></button>`; }),
    ...hs.map(h => { const v = houseVal(h), pl = v - h.cost; return `<button class="hold" data-gosub="house"><span class="mono" style="--h:30">주택</span><span class="nmb"><div class="n">${esc(hName(h.cls))} 아파트</div><div class="s">${h.m2}㎡</div></span><span class="px"><div class="p num">${fmtKRW(v)}</div><div class="c num ${cls(pl)}">${pl >= 0 ? '+' : ''}${fmtKRW(pl)} (${fmtPct(h.cost ? pl / h.cost : 0)})</div></span></button>`; })
  ].join('');
  return (rows ? `<section class="card ao1"><div class="card-h"><h2>채권·주택</h2><small>${bs.length + hs.length}개 · ${fmtUSD(altUSD())}</small></div>${rows}</section>` : '');
}
