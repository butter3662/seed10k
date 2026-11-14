'use strict';
/* =========================================================
   SEED 10K — 한·미 시가총액 상위 100 모의투자
   두 가지 모드: 실제 시세(live) / 시뮬레이션(sim)
   ========================================================= */
const VERSION = '1.1.0';
const SAVE_KEYS = {sim:'seed10k.save.v1', live:'seed10k.live.v1'};
const SET_KEY = 'seed10k.settings.v1';
const LIVE_URL = 'data/prices.json';
const LIVE_POLL_MS = 60000;

const META = {
  baseDate: '2026-10-23',      // 기준가: 2026-10-23(금) 종가
  fx0: 1324.6,                 // 10/26 15:30 1,323.10원(전일 대비 -1.5원)에서 역산한 10/23 원/달러
  seed: 10000,
  feeRate: 0.001,              // 거래 수수료 0.1% (게임 설정)
  fxSpread: 0.002,             // 환전 수수료 0.2% (게임 설정)
  baseRate0: 3.0,              // 게임 기준금리 (%)
  krLimit: 0.30,               // 한국 가격제한폭 ±30% (시뮬레이션)
  creditTerm: 60,              // 신용대출 만기 (시뮬레이션: 거래일, 실제 시세: 일)
  ltv: 0.5,                    // 주식담보대출 담보인정비율
  marginWarn: 1.4, marginCall: 1.2, marginRestore: 1.6,
  sellHaircut: 0.02            // 반대매매 체결가 할인
};

/* 정규장 (현지 시각, 분 단위) */
const SESS = {
  KR:{tz:'Asia/Seoul', o:9*60, c:15*60+30, ko:'한국'},
  US:{tz:'America/New_York', o:9*60+30, c:16*60, ko:'미국'}
};

const SECTORS = {
  semi:{ko:'반도체',vol:.48,beta:1.30,h:262}, hw:{ko:'IT 하드웨어',vol:.32,beta:1.10,h:228}, software:{ko:'소프트웨어',vol:.40,beta:1.15,h:200},
  internet:{ko:'인터넷',vol:.38,beta:1.10,h:186}, space:{ko:'우주',vol:.65,beta:1.40,h:276}, auto:{ko:'자동차',vol:.45,beta:1.20,h:12},
  fin:{ko:'금융',vol:.26,beta:1.00,h:150}, bio:{ko:'제약·바이오',vol:.42,beta:.80,h:330}, retail:{ko:'유통',vol:.24,beta:.80,h:38},
  energy:{ko:'정유·에너지',vol:.30,beta:.80,h:24}, staples:{ko:'필수소비재',vol:.18,beta:.50,h:52}, health:{ko:'헬스케어',vol:.26,beta:.70,h:346},
  indust:{ko:'산업재',vol:.30,beta:1.00,h:96}, defense:{ko:'방산·항공',vol:.40,beta:.90,h:120}, media:{ko:'미디어·엔터',vol:.36,beta:1.00,h:300},
  telecom:{ko:'통신',vol:.20,beta:.50,h:170}, power:{ko:'전력설비',vol:.50,beta:1.20,h:44}, parts:{ko:'전자부품',vol:.45,beta:1.20,h:240},
  consumer:{ko:'소비재',vol:.35,beta:.90,h:316}, transport:{ko:'운송',vol:.32,beta:.90,h:206}, util:{ko:'유틸리티',vol:.20,beta:.50,h:60},
  reit:{ko:'리츠',vol:.24,beta:.70,h:84}, material:{ko:'소재',vol:.36,beta:1.00,h:28}, ins:{ko:'보험',vol:.25,beta:.80,h:140},
  itsvc:{ko:'IT 서비스',vol:.30,beta:.90,h:214}, hold:{ko:'지주회사',vol:.35,beta:1.00,h:250}, battery:{ko:'2차전지',vol:.55,beta:1.30,h:110},
  ship:{ko:'조선',vol:.50,beta:1.20,h:196}, chem:{ko:'화학',vol:.42,beta:1.10,h:70}, build:{ko:'건설',vol:.40,beta:1.00,h:30},
  game:{ko:'게임',vol:.40,beta:.90,h:290}, robot:{ko:'로봇',vol:.70,beta:1.40,h:268}
};
const MKT_VOL = {KR:.18, US:.16};
const SEC_VOL = .12;
const REGIME_MU = [-.22, .06, .18];   // 하락장, 보합장, 상승장 (연율)

/* ───────── 종목 테이블 ───────── */
const STOCKS = [];
DATA.kr.forEach(s => STOCKS.push({...s, m:'KR', cur:'KRW'}));
DATA.us.forEach(s => STOCKS.push({...s, m:'US', cur:'USD'}));
const BY_ID = Object.fromEntries(STOCKS.map(s => [s.id, s]));

/* ───────── 유틸 ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const last = a => a[a.length - 1];
const MINUS = '−';
function fmtUSD(v, d = 2){ const s = Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); return (v < 0 ? MINUS : '') + '$' + s; }
function fmtKRW(v){ return (v < 0 ? MINUS : '') + Math.round(Math.abs(v)).toLocaleString('ko-KR') + '원'; }
function fmtPx(s, p){ return s.cur === 'KRW' ? fmtKRW(p) : fmtUSD(p); }
function fmtPct(v, d = 2){ if (!isFinite(v)) return '0.00%'; const s = Math.abs(v * 100).toFixed(d) + '%'; return (v > 0.000005 ? '+' : v < -0.000005 ? MINUS : '') + s; }
function signUSD(v){ return (v > 0.004 ? '+' : '') + fmtUSD(v); }
function cls(v){ return v > 0.000005 ? 'up' : v < -0.000005 ? 'down' : 'flat'; }
function fmtCapKRW(krw){
  const jo = krw / 1e12;
  return jo >= 1 ? jo.toLocaleString('ko-KR',{maximumFractionDigits:1}) + '조원' : Math.round(krw/1e8).toLocaleString('ko-KR') + '억원';
}
function fmtCapUSD(usd){ return usd >= 1e12 ? '$' + (usd/1e12).toFixed(2) + 'T' : '$' + (usd/1e9).toFixed(1) + 'B'; }
function fmtFX(v){ return v.toLocaleString('ko-KR',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function tickKR(p){
  const t = p < 2000 ? 1 : p < 5000 ? 5 : p < 20000 ? 10 : p < 50000 ? 50 : p < 200000 ? 100 : p < 500000 ? 500 : 1000;
  return Math.max(t, Math.round(p / t) * t);
}
const DOW = ['일','월','화','수','목','금','토'];
function parseD(s){ const [y,m,d] = s.split('-').map(Number); return new Date(Date.UTC(y, m-1, d)); }
function isoD(dt){ return dt.toISOString().slice(0,10); }
function addDays(s, n){ const d = parseD(s); d.setUTCDate(d.getUTCDate() + n); return isoD(d); }
function daysBetween(a, b){ return Math.round((parseD(b) - parseD(a)) / 864e5); }
function nextBiz(s){ const d = parseD(s); do { d.setUTCDate(d.getUTCDate()+1); } while (d.getUTCDay() === 0 || d.getUTCDay() === 6); return isoD(d); }
function fmtDate(s, long = true){ const d = parseD(s); const t = `${d.getUTCMonth()+1}월 ${d.getUTCDate()}일`; return long ? `${t} ${DOW[d.getUTCDay()]}요일` : `${d.getUTCMonth()+1}/${d.getUTCDate()}(${DOW[d.getUTCDay()]})`; }
function monoText(s){ return s.m === 'KR' ? s.n.replace(/[^0-9A-Za-z가-힣]/g, '').slice(0, 2) : s.t.replace(/[^A-Z]/g, '').slice(0, 3); }

/* 시계 (테스트할 때 window.__NOW 로 바꿀 수 있다) */
const now = () => window.__NOW ? new Date(window.__NOW) : new Date();
const ZF = {};
function zoneParts(tz, d = now()){
  const f = ZF[tz] || (ZF[tz] = new Intl.DateTimeFormat('en-US', {timeZone:tz, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hourCycle:'h23', weekday:'short'}));
  const p = Object.fromEntries(f.formatToParts(d).map(x => [x.type, x.value]));
  return {date:`${p.year}-${p.month}-${p.day}`, h:+p.hour, mi:+p.minute, wd:p.weekday};
}
const kstDate = () => zoneParts('Asia/Seoul').date;
function kstTime(d){ const p = zoneParts('Asia/Seoul', d); return `${String(p.h).padStart(2,'0')}:${String(p.mi).padStart(2,'0')}`; }
/* 현지 정규장 시각을 한국 시각 문자열로 (오늘 기준, 서머타임 반영) */
function sessInKST(m){
  const z = SESS[m];
  const ref = now();
  // 현지 날짜의 o/c 분을 UTC로 바꾸기 위해 현지-UTC 차이를 구한다
  const p = zoneParts(z.tz, ref);
  const localAsUTC = Date.UTC(+p.date.slice(0,4), +p.date.slice(5,7)-1, +p.date.slice(8,10), p.h, p.mi);
  const offset = localAsUTC - Math.floor(ref.getTime() / 6e4) * 6e4;
  const day0 = Date.UTC(+p.date.slice(0,4), +p.date.slice(5,7)-1, +p.date.slice(8,10));
  const o = new Date(day0 + z.o * 6e4 - offset), c = new Date(day0 + z.c * 6e4 - offset);
  return `${kstTime(o)}~${kstTime(c)}`;
}

/* ───────── 난수 (시드 고정 mulberry32, 시뮬레이션용) ───────── */
function rand(){
  let t = (S.rng = (S.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function gauss(){ let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2*Math.log(u)) * Math.cos(2*Math.PI*v); }
function pick(a){ return a[Math.floor(rand() * a.length)]; }

/* ───────── 상태 ───────── */
let S = null;
let SET = Object.assign({conv:'kr', theme:'auto', speed:1, mode:null}, safeParse(localStorage.getItem(SET_KEY)));
const UI = {tab:'home', mkt:'KR', sort:'cap', q:'', sector:'all', sheet:null, side:'buy', qty:1, range:60, auto:null};
function safeParse(s){ try { return s ? JSON.parse(s) : null; } catch(e){ return null; } }
const isLive = () => S && S.mode === 'live';

/* 실제 시세 데이터 */
const LIVE = {ok:false, loading:false, err:null, updated:null, fetchedAt:null, dates:{}, s:{}, fx:{d:[META.baseDate], c:[META.fx0]}, idx:{KR:[1000], US:[1000]}, miss:new Set()};
(function initLive(){
  LIVE.dates = {KR:[META.baseDate], US:[META.baseDate]};
  STOCKS.forEach(s => { LIVE.s[s.id] = [s.p]; });
})();

function newGame(mode){
  const base = {
    v:1, mode, cash:META.seed, pos:{}, realized:0, interestPaid:0, feesPaid:0,
    loans:{ credit:{bal:0, due:null, overdue:0, clean:true}, margin:{bal:0}, od:{bal:0} },
    grade:4, base:META.baseRate0, trades:[], news:[], warnedDay:-1, over:false, peak:META.seed, started:Date.now()
  };
  if (mode === 'live'){
    const t = kstDate();
    return {...base, nw:[META.seed], nwD:[t], lastAcc:t, accDays:0, pend:{credit:false, margin:false}, warnedDate:null, liqDate:{}};
  }
  const px = {};
  STOCKS.forEach(s => { px[s.id] = [s.p]; });
  return {...base, day:0, date:META.baseDate, fx:META.fx0, fxH:[META.fx0], px, regime:{KR:1, US:1},
          nw:[META.seed], idx:{KR:[1000], US:[1000]}, dates:[META.baseDate], rng:(Math.random() * 2**31) | 0};
}
function save(){ try { localStorage.setItem(SAVE_KEYS[S.mode], JSON.stringify(S)); } catch(e){ /* 저장 공간 부족 시 무시 */ } }
function load(mode){
  const s = safeParse(localStorage.getItem(SAVE_KEYS[mode]));
  if (mode === 'sim' && s && s.v === 1 && s.px && STOCKS.every(x => s.px[x.id])){ s.mode = 'sim'; return s; }
  if (mode === 'live' && s && s.v === 1 && s.mode === 'live' && s.nwD) return s;
  return newGame(mode);
}
function saveSet(){ try { localStorage.setItem(SET_KEY, JSON.stringify(SET)); } catch(e){} }

/* ───────── 시세 공급 (모드별) ───────── */
const hist = id => isLive() ? LIVE.s[id] : S.px[id];
const histDates = m => isLive() ? LIVE.dates[m] : S.dates;
const price = id => last(hist(id));
const prevPrice = id => { const a = hist(id); return a.length > 1 ? a[a.length-2] : a[0]; };
const basePrice = s => isLive() ? LIVE.s[s.id][0] : s.p;
const FX = () => isLive() ? last(LIVE.fx.c) : S.fx;
const fxHist = () => isLive() ? LIVE.fx.c : S.fxH;
const idxHist = m => isLive() ? LIVE.idx[m] : S.idx[m];
const nwDates = () => isLive() ? S.nwD : S.dates;
const yearDays = () => isLive() ? 365 : 252;
const termUnit = () => isLive() ? '일' : '거래일';

/* 시장 상태 (실제 시세 모드) */
function mstate(m){
  const z = SESS[m], p = zoneParts(z.tz);
  const mins = p.h * 60 + p.mi, wk = p.wd !== 'Sat' && p.wd !== 'Sun';
  if (!wk) return {k:'closed', label:'주말 휴장', open:false};
  if (mins < z.o) return {k:'pre', label:'개장 전', open:false};
  if (mins >= z.c) return {k:'closed', label:'장 마감', open:false};
  if (!LIVE.ok) return {k:'wait', label:'시세 없음', open:false};
  if (last(LIVE.dates[m]) !== p.date) return {k:'wait', label: mins - z.o > 75 ? '휴장일 추정' : '시세 대기', open:false};
  return {k:'open', label:'장중', open:true};
}
function canTrade(s){
  if (S.over) return {ok:false, why:'파산해서 거래할 수 없습니다.'};
  if (!isLive()) return {ok:true};
  if (LIVE.miss.has(s.id)) return {ok:false, why:'이 종목은 실제 시세를 받지 못해 거래할 수 없습니다.'};
  const st = mstate(s.m);
  if (st.open) return {ok:true};
  const hours = `정규장(한국 시각 ${sessInKST(s.m)})`;
  const why = st.k === 'wait'
    ? (st.label === '시세 없음' ? '시세 파일을 아직 받지 못했습니다.' : `${SESS[s.m].ko} 시장의 오늘 시세가 아직 들어오지 않았습니다. 장이 열리고 첫 수집(보통 5~30분 뒤)이 끝나면 거래할 수 있습니다. 휴장일이면 오늘은 거래할 수 없습니다.`)
    : `${SESS[s.m].ko} 시장은 지금 ${st.label} 상태입니다. ${hours}에 거래할 수 있습니다.`;
  return {ok:false, why};
}
const tradableMkt = m => !isLive() || mstate(m).open;

/* ───────── 계산 ───────── */
const toUSD = (s, p) => s.cur === 'KRW' ? p / FX() : p;
function holdingsUSD(filter){
  let v = 0;
  for (const id in S.pos){ const s = BY_ID[id]; if (filter && s.m !== filter) continue; v += S.pos[id].q * toUSD(s, price(id)); }
  return v;
}
const debt = () => S.loans.credit.bal + S.loans.margin.bal + S.loans.od.bal;
const netWorth = () => S.cash + holdingsUSD() - debt();
function capUSD(s){ const r = price(s.id) / basePrice(s); return s.cur === 'KRW' ? s.mc * r / FX() : s.mc * r; }
function capNative(s){ return s.mc * price(s.id) / basePrice(s); }
function g(){ return clamp(Math.round(S.grade), 1, 10); }
function rates(){
  const k = g() - 1, b = S.base;
  return {
    credit: b + 3.2 + .55*k + (S.loans.credit.overdue > 0 ? 5 : 0),
    margin: b + 2.0 + .25*k,
    od: b + 5.0 + .70*k
  };
}
function limits(){
  const N = netWorth(), V = holdingsUSD();
  const k = Math.max(.2, 1.4 - .12*(g()-1));
  return {
    credit: Math.max(0, Math.min(30000, N * k) - S.loans.credit.bal),
    margin: Math.max(0, V * META.ltv - S.loans.margin.bal),
    odLimit: Math.max(1000, 6000 - 500*(g()-1))
  };
}
const odAvail = () => Math.max(0, limits().odLimit - S.loans.od.bal);
const marginRatio = () => S.loans.margin.bal > 0 ? holdingsUSD() / S.loans.margin.bal : Infinity;

/* ───────── 주문 ───────── */
function quote(id, side, q){
  const s = BY_ID[id], p = price(id), fx = FX();
  const gross = p * q, fee = gross * META.feeRate;
  let usd, fxFee = 0;
  if (s.cur === 'KRW'){
    const net = side === 'buy' ? gross + fee : gross - fee;
    const base = net / fx;
    fxFee = base * META.fxSpread;
    usd = side === 'buy' ? base + fxFee : base - fxFee;
  } else {
    usd = side === 'buy' ? gross + fee : gross - fee;
  }
  return {gross, fee, fxFee, usd, p};
}
function maxBuy(id, withOd = true){
  const one = quote(id, 'buy', 1).usd;
  return Math.max(0, Math.floor((S.cash + (withOd ? odAvail() : 0)) / one + 1e-9));
}
function tradeDateLabel(){ return isLive() ? kstDate() : S.date; }
function doBuy(id, q, tag){
  const ct = canTrade(BY_ID[id]);
  if (!ct.ok) return toast(ct.why, true);
  q = Math.floor(q);
  if (q < 1) return toast('수량을 1주 이상 입력하세요', true);
  const o = quote(id, 'buy', q);
  const avail = S.cash + odAvail();
  if (o.usd > avail + 1e-6) return toast('주문 가능 금액이 부족합니다', true);
  let useOd = 0;
  if (o.usd > S.cash){ useOd = o.usd - S.cash; S.cash = 0; S.loans.od.bal += useOd; }
  else S.cash -= o.usd;
  const P = S.pos[id] || (S.pos[id] = {q:0, avg:0, cost:0});
  P.avg = (P.avg * P.q + o.p * q) / (P.q + q);
  P.q += q; P.cost += o.usd;
  S.feesPaid += (BY_ID[id].cur === 'KRW' ? o.fee / FX() : o.fee) + o.fxFee;
  S.trades.unshift({d:S.day || 0, dt:tradeDateLabel(), at:Date.now(), id, side:'buy', q, p:o.p, usd:o.usd, tag:tag||''});
  trimLog();
  if (useOd > 0) toast(`마이너스통장에서 ${fmtUSD(useOd)}을 끌어 썼습니다`);
  return true;
}
function doSell(id, q, tag, haircut = 0){
  const P = S.pos[id];
  if (!P || P.q < 1) return false;
  if (!tag){ const ct = canTrade(BY_ID[id]); if (!ct.ok) return toast(ct.why, true); }
  q = Math.min(Math.floor(q), P.q);
  if (q < 1) return toast('수량을 1주 이상 입력하세요', true);
  const o = quote(id, 'sell', q);
  const usd = o.usd * (1 - haircut);
  const costPart = P.cost * (q / P.q);
  S.realized += usd - costPart;
  P.cost -= costPart; P.q -= q;
  if (P.q === 0) delete S.pos[id];
  S.feesPaid += (BY_ID[id].cur === 'KRW' ? o.fee / FX() : o.fee) + o.fxFee;
  S.trades.unshift({d:S.day || 0, dt:tradeDateLabel(), at:Date.now(), id, side:'sell', q, p:o.p*(1-haircut), usd, tag:tag||''});
  trimLog();
  let rest = usd;
  if (!tag && S.loans.od.bal > 0){ const r = Math.min(rest, S.loans.od.bal); S.loans.od.bal -= r; rest -= r; }
  S.cash += rest;
  return usd;
}
function trimLog(){ if (S.trades.length > 400) S.trades.length = 400; }

/* 반대매매: 거래 가능한 시장의 보유 종목 중 평가액 큰 것부터 매도해 target(USD, 매도대금 기준) 확보 */
function forceSell(target, tag){
  let raised = 0;
  const ids = Object.keys(S.pos)
    .filter(id => tradableMkt(BY_ID[id].m) && !(isLive() && LIVE.miss.has(id)))
    .sort((a, b) => S.pos[b].q*toUSD(BY_ID[b], price(b)) - S.pos[a].q*toUSD(BY_ID[a], price(a)));
  for (const id of ids){
    if (raised >= target) break;
    const P = S.pos[id];
    const per = quote(id, 'sell', 1).usd * (1 - META.sellHaircut);
    const need = Math.ceil((target - raised) / per);
    const q = Math.min(P.q, Math.max(1, need));
    const cashBefore = S.cash;
    const got = doSell(id, q, tag, META.sellHaircut);
    S.cash = cashBefore; // 매도대금은 호출자가 대출 상환에 직접 사용
    raised += got || 0;
  }
  return raised;
}
const kappa = () => (1 - META.sellHaircut) * (1 - META.feeRate - META.fxSpread);
/* 담보유지비율을 marginRestore까지 되돌리는 데 필요한 매도대금 y: (V − y/κ) ÷ (L − y) = R* */
function marginNeed(){
  const V = holdingsUSD(), L = S.loans.margin.bal;
  return Math.max(0, (META.marginRestore * L - V) / (META.marginRestore - 1 / kappa()));
}

/* ───────── 대출 ───────── */
function borrow(kind, amt){
  if (S.over) return;
  amt = Math.floor(amt * 100) / 100;
  if (!(amt > 0)) return toast('금액을 입력하세요', true);
  const L = limits();
  if (kind === 'credit'){
    if (amt > L.credit + 1e-6) return toast(`신용대출 한도는 ${fmtUSD(L.credit)}입니다`, true);
    if (S.loans.credit.bal === 0){
      S.loans.credit.due = isLive() ? addDays(kstDate(), META.creditTerm) : S.day + META.creditTerm;
      S.loans.credit.clean = true; S.loans.credit.overdue = 0;
    }
    S.loans.credit.bal += amt;
  } else if (kind === 'margin'){
    if (amt > L.margin + 1e-6) return toast(`주식담보대출 한도는 ${fmtUSD(L.margin)}입니다`, true);
    S.loans.margin.bal += amt;
  } else return;
  S.cash += amt;
  toast(`${kind === 'credit' ? '신용대출' : '주식담보대출'} ${fmtUSD(amt)}을 받았습니다`);
  commit();
}
function repay(kind, amt){
  const ln = S.loans[kind];
  if (!ln || ln.bal <= 0) return;
  amt = Math.min(amt, ln.bal, S.cash);
  if (!(amt > 0)) return toast(S.cash <= 0 ? '상환할 현금이 없습니다' : '금액을 입력하세요', true);
  ln.bal = Math.round((ln.bal - amt) * 100) / 100;
  S.cash -= amt;
  if (ln.bal < 0.005){
    ln.bal = 0;
    if (kind === 'credit'){
      if (ln.clean && ln.overdue === 0){ S.grade = clamp(S.grade - .5, 1, 10); toast('신용대출을 완납해 신용등급이 좋아졌습니다'); }
      else toast('신용대출을 완납했습니다');
      ln.due = null; ln.overdue = 0; ln.clean = true;
      if (S.pend) S.pend.credit = false;
    } else {
      toast(`${kind === 'margin' ? '주식담보대출' : '마이너스통장'}을 모두 갚았습니다`);
      if (kind === 'margin' && S.pend) S.pend.margin = false;
    }
  } else toast(`${fmtUSD(amt)}을 상환했습니다`);
  commit();
}

/* ───────── 시뮬레이션: 하루 진행 ───────── */
const NEWS_T = {
  coUp:['{n}, 실적 개선 기대감에 매수세 유입','{n}, 대형 계약 기대감 부각','{n}, 기관 순매수 확대로 강세','{n}, 신사업 성장성 재평가','{n}, 목표주가 상향 잇따라'],
  coDn:['{n}, 차익실현 매물 출회로 약세','{n}, 실적 눈높이 하향 우려','{n}, 외국인 순매도 집중','{n}, 업황 둔화 우려에 하락','{n}, 목표주가 하향 잇따라'],
  secUp:['{k} 업종, 업황 회복 기대감에 동반 강세','{k} 업종, 수요 증가 전망에 일제히 상승'],
  secDn:['{k} 업종, 수요 둔화 우려에 동반 약세','{k} 업종, 경쟁 심화 우려에 일제히 하락'],
  krUp:['국내 증시, 외국인 순매수 전환에 반등','국내 증시, 수출 호조 기대감에 강세'],
  krDn:['국내 증시, 대외 불확실성에 하락','국내 증시, 외국인 매도세에 약세'],
  usUp:['뉴욕 증시, 위험선호 회복에 상승','뉴욕 증시, 기술주 반등에 강세'],
  usDn:['뉴욕 증시, 금리 부담에 하락','뉴욕 증시, 경기 둔화 우려에 약세']
};
function fillT(t, o){ return t.replace('{n}', o.n || '').replace('{k}', o.k || ''); }

function step(){
  if (isLive() || S.over) return;
  const prevNW = netWorth();
  const YD = 252;
  S.day += 1;
  S.date = nextBiz(S.date);
  S.dates.push(S.date);

  for (const c of ['KR','US']){
    if (rand() < .015){ const o = [0,1,2].filter(x => x !== S.regime[c]); S.regime[c] = pick(o); }
  }
  const sq = Math.sqrt(YD);
  const zUS = gauss(), zKR = .55*zUS + Math.sqrt(1 - .55*.55) * gauss();
  const m = {
    US: REGIME_MU[S.regime.US]/YD + MKT_VOL.US/sq * zUS,
    KR: REGIME_MU[S.regime.KR]/YD + MKT_VOL.KR/sq * zKR
  };
  const sf = {};
  for (const k in SECTORS) sf[k] = SEC_VOL/sq * gauss();
  const shock = {}, secShock = {}, macro = {KR:0, US:0};
  const todays = [];
  if (rand() < .05){
    const c = rand() < .5 ? 'KR' : 'US', up = rand() < .5, sz = (.008 + rand()*.02) * (up ? 1 : -1);
    macro[c] += sz;
    todays.push({k:'시장', c, t:pick(NEWS_T[(c === 'KR' ? 'kr' : 'us') + (up ? 'Up' : 'Dn')]), e:sz});
    if (rand() < .35){
      const d = up ? -.25 : .25;
      const nb = clamp(Math.round((S.base + d) * 100) / 100, .5, 8);
      if (nb !== S.base){ S.base = nb; todays.push({k:'금리', t:`게임 기준금리 ${d > 0 ? '0.25%p 인상' : '0.25%p 인하'} — 연 ${nb.toFixed(2)}%`, e:0}); }
    }
  }
  if (rand() < .10){
    const s = pick(STOCKS), up = rand() < .5, sz = (.015 + rand()*.035) * (up ? 1 : -1);
    secShock[s.s + s.m] = sz;
    todays.push({k:'업종', c:s.m, t:fillT(pick(NEWS_T[up ? 'secUp' : 'secDn']), {k:(s.m === 'KR' ? '국내 ' : '미국 ') + SECTORS[s.s].ko}), e:sz});
  }
  const nCo = (rand() < .38 ? 1 : 0) + (rand() < .12 ? 1 : 0);
  for (let i = 0; i < nCo; i++){
    const s = pick(STOCKS), up = rand() < .5, sz = (.03 + rand()*.09) * (up ? 1 : -1);
    shock[s.id] = (shock[s.id] || 0) + sz;
    todays.push({k:'종목', id:s.id, t:fillT(pick(NEWS_T[up ? 'coUp' : 'coDn']), {n:s.n}), e:sz});
  }
  for (const s of STOCKS){
    const sec = SECTORS[s.s];
    const vm = MKT_VOL[s.m];
    const idio = Math.sqrt(Math.max(sec.vol*sec.vol - (sec.beta*vm)**2 - SEC_VOL*SEC_VOL, .02));
    const r = sec.beta * (m[s.m] + macro[s.m]) + sf[s.s] + idio/sq * gauss()
          + (secShock[s.s + s.m] || 0) + (shock[s.id] || 0) - .5 * sec.vol*sec.vol / YD;
    const p0 = price(s.id);
    let p = p0 * Math.exp(r);
    if (s.m === 'KR'){ p = clamp(p, p0*(1-META.krLimit), p0*(1+META.krLimit)); p = tickKR(p); }
    else p = Math.max(.01, Math.round(p * 100) / 100);
    const arr = S.px[s.id]; arr.push(p);
    if (arr.length > 520) arr.splice(1, arr.length - 520);
  }
  S.fx = Math.round(S.fx * Math.exp(.07/sq * gauss() - .25*(m.KR - m.US)) * 100) / 100;
  S.fxH.push(S.fx); if (S.fxH.length > 520) S.fxH.splice(1, S.fxH.length - 520);

  const alerts = [];
  accrueInterest(1, YD);
  creditDue(alerts);
  marginCheck(alerts);
  if (S.day % 20 === 0 && S.loans.credit.overdue === 0 && netWorth() > 0) S.grade = clamp(S.grade - .1, 1, 10);

  for (const n of todays){ S.news.unshift({d:S.day, dt:S.date, ...n}); }
  if (S.news.length > 120) S.news.length = 120;
  const N = netWorth();
  S.nw.push(N); if (S.nw.length > 520) S.nw.splice(1, S.nw.length - 520);
  S.peak = Math.max(S.peak, N);
  for (const c of ['KR','US']){
    let a = 0, b = 0;
    for (const s of STOCKS){ if (s.m !== c) continue; a += s.mc * price(s.id) / s.p; b += s.mc; }
    S.idx[c].push(1000 * a / b);
    if (S.idx[c].length > 520) S.idx[c].splice(1, S.idx[c].length - 520);
  }
  if (S.dates.length > 520) S.dates.splice(1, S.dates.length - 520);
  bankruptCheck(alerts);
  commit();
  if (alerts.length){ stopAuto(); showAlerts(alerts); }
  else if (UI.tab !== 'home'){ const d = N - prevNW; if (Math.abs(d) >= .01) toastQuiet(`${fmtDate(S.date, false)} 정산 ${signUSD(d)}`); }
}

/* ───────── 공통: 이자·만기·담보 ───────── */
function accrueInterest(days, yd){
  const R = rates();
  for (const k of ['credit','margin','od']){
    const ln = S.loans[k];
    if (ln.bal > 0){ const i = ln.bal * (R[k]/100) / yd * days; ln.bal += i; S.interestPaid += i; }
  }
}
function creditDueReached(){
  const C = S.loans.credit;
  if (!(C.bal > 0) || C.due === null) return false;
  return isLive() ? S.lastAcc >= C.due : S.day >= C.due;
}
function creditDue(alerts){
  const C = S.loans.credit;
  if (!creditDueReached()) return;
  const pay = Math.min(S.cash, C.bal);
  C.bal -= pay; S.cash -= pay;
  if (C.bal < .005){
    C.bal = 0;
    if (C.clean && C.overdue === 0) S.grade = clamp(S.grade - .5, 1, 10);
    C.due = null; C.overdue = 0; C.clean = true;
    alerts.push({t:'신용대출 만기 상환', b:`만기가 되어 현금 ${fmtUSD(pay)}으로 신용대출을 자동 상환했습니다.`});
    return;
  }
  C.overdue += 1; C.clean = false;
  S.grade = clamp(S.grade + .4, 1, 10);
  if (C.overdue >= 5){
    if (isLive()) S.pend.credit = true;
    else creditLiquidate(alerts);
  } else {
    alerts.push({t:`신용대출 연체 ${C.overdue}${termUnit()}째`, b:`만기가 지났는데 현금이 부족해 ${fmtUSD(C.bal)}이 남았습니다. 연체 중에는 금리가 연 5%p 더 붙고 신용등급이 매일 떨어집니다. ${5 - C.overdue}${termUnit()} 안에 갚지 않으면 보유 주식이 반대매매됩니다.`, bad:true});
  }
}
function creditLiquidate(alerts){
  const C = S.loans.credit;
  const got = forceSell(C.bal / kappa(), '연체 반대매매');
  if (got <= 0) return false;
  const use = Math.min(got, C.bal); C.bal -= use; S.cash += got - use;
  if (!S.liqHit || !S.liqHit.credit){ S.grade = clamp(S.grade + 1.5, 1, 10); (S.liqHit = S.liqHit || {}).credit = true; }
  alerts.push({t:'연체 반대매매', b:`신용대출 연체로 보유 주식을 매도해 ${fmtUSD(use)}을 상환했습니다. 신용등급이 크게 떨어졌습니다.`, bad:true});
  if (C.bal < .005){ C.bal = 0; C.due = null; C.overdue = 0; if (S.pend) S.pend.credit = false; if (S.liqHit) S.liqHit.credit = false; }
  return true;
}
function marginCheck(alerts){
  const M = S.loans.margin;
  if (!(M.bal > 0)) { if (S.pend) S.pend.margin = false; return; }
  const V = holdingsUSD(), ratio = V / M.bal;
  if (ratio < META.marginCall){
    const y = marginNeed();
    const got = forceSell(Math.min(y, V * kappa()), '담보 반대매매');
    if (got > 0){
      const use = Math.min(got, M.bal); M.bal -= use; S.cash += got - use;
      if (M.bal < .005) M.bal = 0;
      S.grade = clamp(S.grade + 1, 1, 10);
      if (S.pend) S.pend.margin = marginRatio() < META.marginCall;
      alerts.push({t:'담보 부족 반대매매', b:`담보유지비율이 ${(ratio*100).toFixed(0)}%로 떨어져 보유 주식 일부를 매도하고 ${fmtUSD(use)}을 갚았습니다.`, bad:true});
    } else if (isLive()){
      S.pend.margin = true;
      const key = kstDate();
      if (S.warnedDate !== key + 'm'){
        S.warnedDate = key + 'm';
        alerts.push({t:'반대매매 대기', b:`담보유지비율이 ${(ratio*100).toFixed(0)}%입니다. 지금은 보유 종목의 시장이 열려 있지 않아, 다음에 장이 열리면 바로 반대매매됩니다. 그 전에 현금으로 대출을 갚으면 피할 수 있습니다.`, bad:true});
      }
    }
  } else {
    if (S.pend) S.pend.margin = false;
    if (ratio < META.marginWarn){
      const key = isLive() ? kstDate() : S.day;
      if (S.warnedDay !== key){
        S.warnedDay = key;
        alerts.push({t:'담보유지비율 경고', b:`현재 담보유지비율은 ${(ratio*100).toFixed(0)}%입니다. ${(META.marginCall*100).toFixed(0)}% 아래로 내려가면 자동으로 반대매매됩니다. 대출을 일부 갚아 두세요.`, bad:true});
      }
    }
  }
}
function bankruptCheck(alerts){
  const N = netWorth();
  if (N <= 0 && !S.over){
    S.over = true;
    alerts.push({t:'파산', b:`순자산이 ${fmtUSD(N)}가 되어 더 이상 거래할 수 없습니다. 규칙·설정에서 새 게임을 시작하세요.`, bad:true, over:true});
  }
}

/* ───────── 실제 시세: 데이터 받기 + 정산 ───────── */
async function loadLive(silent){
  if (LIVE.loading) return;
  LIVE.loading = true;
  try {
    const r = await fetch(LIVE_URL + '?t=' + Date.now(), {cache:'no-store'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    applyLive(j);
    LIVE.ok = true; LIVE.err = null;
  } catch(e){
    LIVE.err = String(e.message || e);
    if (!silent && isLive()) toast('시세 파일을 받지 못했습니다', true);
  } finally {
    LIVE.loading = false;
    LIVE.fetchedAt = new Date();
  }
  if (isLive()) liveTick();
}
function applyLive(j){
  LIVE.updated = j.updated ? new Date(j.updated) : null;
  LIVE.miss = new Set();
  for (const m of ['KR','US']){
    const dates = (j.dates && j.dates[m] && j.dates[m].length) ? j.dates[m] : [META.baseDate];
    LIVE.dates[m] = dates;
    for (const s of STOCKS){
      if (s.m !== m) continue;
      const raw = j.s && j.s[s.id];
      if (!raw || !raw.some(v => v !== null && v !== undefined)){
        LIVE.miss.add(s.id);
        LIVE.s[s.id] = dates.map(() => s.p);
        continue;
      }
      const first = raw.find(v => v !== null && v !== undefined);
      let lv = first;
      LIVE.s[s.id] = dates.map((_, i) => { const v = raw[i]; if (v !== null && v !== undefined) lv = v; return lv; });
    }
    // 시가총액 가중 지수 (첫 거래일 = 1000)
    const ids = STOCKS.filter(s => s.m === m && !LIVE.miss.has(s.id));
    const tot = ids.reduce((a, s) => a + s.mc, 0) || 1;
    LIVE.idx[m] = dates.map((_, i) => 1000 * ids.reduce((a, s) => a + s.mc * LIVE.s[s.id][i] / LIVE.s[s.id][0], 0) / tot);
  }
  if (j.fx && j.fx.c && j.fx.c.length) LIVE.fx = {d:j.fx.d, c:j.fx.c};
}
function liveTick(){
  if (!isLive()) return;
  const alerts = [];
  const today = kstDate();
  // 지난 날짜마다 하루치 이자와 만기를 정산한다
  let guard = 0;
  while (S.lastAcc < today && guard++ < 4000){
    S.lastAcc = addDays(S.lastAcc, 1);
    S.accDays = (S.accDays || 0) + 1;
    accrueInterest(1, 365);
    creditDue(alerts);
    if (S.accDays % 20 === 0 && S.loans.credit.overdue === 0 && netWorth() > 0) S.grade = clamp(S.grade - .1, 1, 10);
  }
  if (LIVE.ok){
    if (S.pend.credit && S.loans.credit.bal > 0) creditLiquidate(alerts);
    marginCheck(alerts);
  }
  const N = netWorth();
  if (last(S.nwD) === today) S.nw[S.nw.length - 1] = N;
  else { S.nw.push(N); S.nwD.push(today); if (S.nw.length > 800){ S.nw.splice(1, S.nw.length - 800); S.nwD.splice(1, S.nwD.length - 800); } }
  S.peak = Math.max(S.peak, N);
  bankruptCheck(alerts);
  commit();
  if (alerts.length) showAlerts(alerts);
}
let livePoll = null;
function startLivePolling(){
  stopLivePolling();
  loadLive(true);
  livePoll = setInterval(() => { if (!document.hidden) loadLive(true); }, LIVE_POLL_MS);
}
function stopLivePolling(){ if (livePoll) clearInterval(livePoll); livePoll = null; }

/* ───────── 자동 진행 (시뮬레이션) ───────── */
const SPEEDS = [{ms:2200, l:'1×'}, {ms:1100, l:'2×'}, {ms:450, l:'4×'}];
function startAuto(){
  stopAuto();
  if (isLive()) return;
  const sp = SPEEDS[SET.speed] || SPEEDS[1];
  UI.auto = setInterval(() => { if (!document.hidden) step(); }, sp.ms);
  $('#btnAuto').setAttribute('aria-pressed','true');
  const b = $('#speedBadge'); b.hidden = false; b.textContent = sp.l;
}
function stopAuto(){
  if (UI.auto) clearInterval(UI.auto);
  UI.auto = null;
  const btn = $('#btnAuto'); if (btn) btn.setAttribute('aria-pressed','false');
  const b = $('#speedBadge'); if (b) b.hidden = true;
}

/* ───────── 알림 ───────── */
function toast(msg, bad){
  const t = document.createElement('div'); t.className = 'toast' + (bad ? ' bad' : ''); t.textContent = msg;
  const box = $('#toasts'); box.appendChild(t);
  while (box.children.length > 3) box.firstElementChild.remove();
  setTimeout(() => t.remove(), bad ? 4200 : 2600);
  return false;
}
let quietT = null;
function toastQuiet(msg){
  const box = $('#toasts');
  let t = box.querySelector('.toast.q');
  if (!t){ t = document.createElement('div'); t.className = 'toast q'; box.appendChild(t); }
  t.textContent = msg;
  clearTimeout(quietT); quietT = setTimeout(() => t.remove(), 1600);
}
function showModal(html, onClose, locked){
  const md = $('#modal'), sc = $('#scrim');
  md.innerHTML = html; md.hidden = false; sc.hidden = false;
  md.dataset.locked = locked ? '1' : '';
  requestAnimationFrame(() => { md.classList.add('on'); sc.classList.add('on'); });
  const close = () => { md.classList.remove('on'); if (!UI.sheet) sc.classList.remove('on'); setTimeout(() => { md.hidden = true; if (!UI.sheet) sc.hidden = true; }, 180); onClose && onClose(); };
  md.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  const first = md.querySelector('button'); first && first.focus();
  return close;
}
function showAlerts(list){
  const html = list.map(a => `<h2 style="${a.bad ? 'color:var(--danger)' : ''}">${esc(a.t)}</h2><p>${esc(a.b)}</p>`).join('');
  const over = list.some(a => a.over);
  showModal(html + `<div class="acts">${over ? '<button class="btn" data-close>닫기</button><button class="btn solid" id="mdReset">새 게임</button>' : '<button class="btn" data-close>확인</button><button class="btn solid" id="mdLoans" data-close>대출 화면 열기</button>'}</div>`);
  const r = $('#mdReset'); if (r) r.onclick = () => { resetGame(); };
  const l = $('#mdLoans'); if (l) l.addEventListener('click', () => go('loans'));
}
function confirmBox(title, body, okLabel, onOk){
  const close = showModal(`<h2>${esc(title)}</h2><p>${body}</p><div class="acts"><button class="btn" data-close>취소</button><button class="btn solid" id="mdOk">${esc(okLabel)}</button></div>`);
  $('#mdOk').onclick = () => { close(); onOk(); };
}
function showModePicker(first){
  const close = showModal(`
    <h2>${first ? '어떻게 플레이할까요?' : '모드 바꾸기'}</h2>
    <p>두 모드는 저장 기록이 따로 있어서, 나중에 언제든 오갈 수 있습니다.</p>
    <div class="modes">
      <button class="mode-card" data-pick="live">
        <b>실제 시세</b>
        <span>실제 주가를 따라갑니다. 각 시장의 정규장 시간에만 사고팔 수 있고, 시세는 5~30분 늦게 반영됩니다.</span>
      </button>
      <button class="mode-card" data-pick="sim">
        <b>시뮬레이션</b>
        <span>10월 23일 종가에서 출발해, 버튼을 누를 때마다 가상의 하루가 흘러갑니다. 모의 뉴스가 시세를 흔듭니다.</span>
      </button>
    </div>
    ${first ? '' : '<div class="acts"><button class="btn" data-close>닫기</button></div>'}`, null, first);
  $$('#modal [data-pick]').forEach(b => b.onclick = () => { close(); setMode(b.dataset.pick); });
}

/* ───────── 그래프 (SVG) ───────── */
function pathFor(vals, w, h, pad = 2, lo, hi){
  if (vals.length < 2) vals = [vals[0], vals[0]];
  let mn = lo !== undefined ? lo : Math.min(...vals); const mx = hi !== undefined ? hi : Math.max(...vals);
  let span = mx - mn;
  if (!span){ span = Math.abs(mx) * .02 || 1; mn -= span / 2; }
  const sx = (w - pad*2) / (vals.length - 1);
  const y = v => pad + (h - pad*2) * (1 - (v - mn) / span);
  let d = '';
  vals.forEach((v, i) => { d += (i ? 'L' : 'M') + (pad + i*sx).toFixed(2) + ' ' + y(v).toFixed(2); });
  return {d, y, x:i => pad + i*sx, mn, mx};
}
function sparkSVG(vals, cls_, w = 72, h = 28){
  const v = vals.slice(-30);
  if (v.length < 2) return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="2" x2="${w-2}" y1="${h/2}" y2="${h/2}" stroke="var(--rule)" stroke-dasharray="3 3" stroke-width="1.5"/></svg>`;
  const P = pathFor(v, w, h, 3);
  const by = P.y(v[0]).toFixed(1);
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="0" x2="${w}" y1="${by}" y2="${by}" stroke="var(--rule)" stroke-dasharray="2 3"/><path d="${P.d}" fill="none" stroke="var(--${cls_ === 'flat' ? 'flat' : cls_})" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
}
function areaSVG(vals, {w = 600, h = 84, stroke = 'var(--brass-hi)', fill = 'rgba(226,180,94,.16)', base, cl = 'equity'} = {}){
  const v = vals.length < 2 ? [vals[0], vals[0]] : vals;
  const lo = Math.min(...v, base ?? Infinity), hi = Math.max(...v, base ?? -Infinity);
  const P = pathFor(v, w, h, 3, lo, hi);
  const area = P.d + `L${P.x(v.length-1).toFixed(2)} ${h}L${P.x(0).toFixed(2)} ${h}Z`;
  const bl = base !== undefined ? `<line x1="0" x2="${w}" y1="${P.y(base).toFixed(1)}" y2="${P.y(base).toFixed(1)}" stroke="currentColor" stroke-opacity=".28" stroke-dasharray="4 4" vector-effect="non-scaling-stroke"/>` : '';
  return `<svg class="${cl}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${area}" fill="${fill}"/>${bl}<path d="${P.d}" fill="none" stroke="${stroke}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg>`;
}

/* ───────── 오도미터 ───────── */
function setOdometer(el, value){
  const s = fmtUSD(value);
  const [whole, cents] = s.split('.');
  const chars = [...whole];
  const sig = chars.map(c => /\d/.test(c) ? 'd' : c).join('') + '|' + (cents ? cents.length : 0);
  if (el.dataset.sig !== sig){
    el.dataset.sig = sig;
    el.innerHTML = chars.map(c => /\d/.test(c) ? digitHTML() : `<span class="ch">${esc(c)}</span>`).join('')
      + (cents ? `<span class="cents">.${[...cents].map(() => digitHTML()).join('')}</span>` : '');
  }
  const ds = [...(whole + (cents || ''))].filter(c => /\d/.test(c)).map(Number);
  el.querySelectorAll('.strip').forEach((st, i) => { st.style.transform = `translateY(${-ds[i]}em)`; });
  el.setAttribute('aria-label', '순자산 ' + s);
}
function digitHTML(){ return `<span class="dg"><span class="strip">${'0123456789'.split('').map(d => `<span>${d}</span>`).join('')}</span></span>`; }

/* ───────── 렌더: 헤더 ───────── */
function minsAgo(d){ return d ? Math.max(0, Math.round((now() - d) / 6e4)) : null; }
function renderHeader(){
  const live = isLive();
  document.documentElement.dataset.game = live ? 'live' : 'sim';
  $('#simCtl').hidden = live;
  $('#liveCtl').hidden = !live;
  if (live){
    for (const m of ['KR','US']){
      const st = mstate(m), el = $('#mk' + m);
      el.dataset.k = st.k;
      el.querySelector('b').textContent = st.label;
    }
    const ago = minsAgo(LIVE.updated);
    $('#liveUpd').textContent = LIVE.ok && LIVE.updated ? `시세 ${kstTime(LIVE.updated)} 기준${ago !== null ? `, ${ago < 1 ? '방금' : ago < 60 ? ago + '분 전' : Math.floor(ago/60) + '시간 전'}` : ''}` : (LIVE.loading ? '시세 받는 중' : '시세 없음');
  } else {
    $('#sessDay').textContent = S.day === 0 ? '기준일 종가' : `${S.day}거래일째`;
    $('#sessDate').textContent = fmtDate(S.date);
    $('#btnNext').disabled = S.over;
  }
  const warn = S.loans.credit.overdue > 0 || (S.loans.margin.bal > 0 && marginRatio() < META.marginWarn);
  $$('[data-tab=loans]').forEach(b => b.classList.toggle('warn', warn));
}

/* ───────── 렌더: 홈 ───────── */
function renderHome(){
  const v = $('#v-home');
  if (!v.dataset.built){
    v.dataset.built = 1;
    v.innerHTML = `
    <div class="home-grid">
      <div class="col-a">
        <article class="hero" aria-label="순자산">
          <div class="hero-top"><span>순자산</span><span class="grade-pill" id="hGrade"></span></div>
          <div class="odo" id="odo"></div>
          <div class="hero-sub" id="hSub"></div>
          <div class="mix"><div class="mix-bar" id="mixBar"></div><div class="mix-leg" id="mixLeg"></div></div>
          <div id="eqWrap"></div>
          <div class="equity-cap"><span id="eqL"></span><span id="eqR"></span></div>
        </article>
        <section class="card c-news"><div class="card-h"><h2 id="newsH"></h2><small id="newsS"></small></div><div id="newsBody"></div></section>
      </div>
      <div class="col-b">
        <div class="pulse" id="pulse"></div>
        <section class="card c-movers"><div class="card-h"><h2>크게 움직인 종목</h2><small id="mvDate"></small></div><div class="movers" id="movers"></div></section>
      </div>
    </div>`;
  }
  const live = isLive();
  const N = netWorth(), D = debt();
  setOdometer($('#odo'), N);
  const ret = (N - META.seed) / META.seed;
  const dToday = S.nw.length > 1 ? N - S.nw[S.nw.length-2] : N - META.seed;
  const started = live || S.day > 0;
  $('#hGrade').textContent = `신용 ${g()}등급`;
  $('#hSub').innerHTML = `<span class="ret ${cls(ret)}">${fmtPct(ret)}</span><span>시드 <b>${fmtUSD(META.seed, 0)}</b> 대비</span><span>${live ? '어제보다' : '오늘'} <b>${signUSD(started ? dToday : 0)}</b></span>`;
  const kr = holdingsUSD('KR'), us = holdingsUSD('US'), cash = S.cash;
  const tot = kr + us + cash || 1;
  const seg = [{l:'한국 주식', v:kr, c:'#6E8BFF'}, {l:'미국 주식', v:us, c:'#E2B45E'}, {l:'현금', v:cash, c:'#B9C3D6'}];
  $('#mixBar').innerHTML = seg.map(s => `<i style="width:${(s.v/tot*100).toFixed(2)}%;background:${s.c}"></i>`).join('');
  $('#mixLeg').innerHTML = seg.map(s => `<span><i style="background:${s.c}"></i>${s.l} <b>${fmtUSD(s.v, 0)}</b></span>`).join('')
    + (D > 0 ? `<span><i style="background:#FF8A96"></i>대출 <b>${MINUS}${fmtUSD(D, 0)}</b></span>` : '');
  $('#eqWrap').innerHTML = areaSVG(S.nw.slice(-120), {base:META.seed});
  const nd = nwDates();
  $('#eqL').textContent = fmtDate(nd[Math.max(0, nd.length - Math.min(120, S.nw.length))], false);
  $('#eqR').textContent = live ? (S.nw.length > 1 ? `최고 ${fmtUSD(S.peak, 0)}` : '하루가 지나면 순자산 그래프가 쌓입니다')
                               : (S.day ? `최고 ${fmtUSD(S.peak, 0)}` : '다음 거래일을 눌러 시장을 열어보세요');

  const tiles = [{l:'한국 100 지수', a:idxHist('KR')}, {l:'미국 100 지수', a:idxHist('US')}, {l:'원/달러 환율', a:fxHist(), fx:true}];
  $('#pulse').innerHTML = tiles.map(t => {
    const a = t.a, cur = last(a), prev = a.length > 1 ? a[a.length-2] : a[0];
    const ch = cur / prev - 1;
    return `<div class="tile"><div class="t-l">${t.l}</div><div class="t-v num">${t.fx ? fmtFX(cur) : cur.toFixed(2)}</div><div class="t-c ${cls(ch)}">${fmtPct(ch)}</div>${sparkSVG(a.slice(-40), t.fx ? 'flat' : cls(cur/a[0]-1), 110, 30).replace('class="spark"','')}</div>`;
  }).join('');

  const pool = STOCKS.filter(s => !(live && LIVE.miss.has(s.id)));
  const ch = pool.map(s => ({s, c:price(s.id)/prevPrice(s.id) - 1}));
  const ups = ch.filter(x => x.c > 0).sort((a, b) => b.c - a.c).slice(0, 5);
  const dns = ch.filter(x => x.c < 0).sort((a, b) => a.c - b.c).slice(0, 5);
  const mvRow = x => `<button class="mv" data-open="${x.s.id}"><span class="nm"><span class="flag">${x.s.m}</span>${esc(x.s.n)}</span><span class="pc ${cls(x.c)}">${fmtPct(x.c)}</span></button>`;
  const hasMoves = live ? (LIVE.dates.KR.length > 1 || LIVE.dates.US.length > 1) : S.day > 0;
  $('#mvDate').textContent = live ? `한국 ${fmtDate(last(LIVE.dates.KR), false)}, 미국 ${fmtDate(last(LIVE.dates.US), false)}` : (S.day ? fmtDate(S.date, false) : '');
  $('#movers').innerHTML = hasMoves
    ? `<div><h3>상승</h3>${ups.map(mvRow).join('') || '<p class="empty">없음</p>'}</div><div><h3>하락</h3>${dns.map(mvRow).join('') || '<p class="empty">없음</p>'}</div>`
    : `<p class="empty" style="grid-column:1/-1">${live ? '시세가 들어오면 전 거래일 대비 등락이 여기에 표시됩니다.' : '지금은 2026년 10월 23일 종가 상태입니다. 위의 다음 거래일 버튼을 누르면 하루치 시세가 움직입니다.'}</p>`;

  if (live){
    $('#newsH').textContent = '시세 상태';
    $('#newsS').textContent = '야후 파이낸스, 5~30분 지연';
    $('#newsBody').innerHTML = liveStatusHTML();
  } else {
    $('#newsH').textContent = '모의 뉴스';
    $('#newsS').textContent = '실제 뉴스가 아닙니다';
    const nl = S.news.slice(0, 8);
    $('#newsBody').innerHTML = `<ul class="news">${nl.length ? nl.map(n => {
      const s = n.id ? BY_ID[n.id] : null;
      const hl = s ? `<button data-open="${s.id}">${esc(n.t)}</button>` : esc(n.t);
      const meta = n.k === '금리' ? '대출 금리에 반영' : n.e ? `영향 ${fmtPct(n.e, 1)} 내외` : '';
      return `<li><span class="d">${fmtDate(n.dt, false).replace(/\(.\)/,'')}</span><span class="hl"><span class="tag">${esc(n.k)}</span>${hl}</span><span class="meta">${meta}</span></li>`;
    }).join('') : `<li class="empty">거래일이 지나면 모의 뉴스가 쌓입니다.</li>`}</ul>`;
  }
}
function liveStatusHTML(){
  const rows = ['KR','US'].map(m => {
    const st = mstate(m);
    return `<div class="st-row"><span class="st-dot" data-k="${st.k}"></span><span class="st-n">${SESS[m].ko} 시장</span><span class="st-h">정규장 ${sessInKST(m)}</span><b class="st-l">${st.label}</b></div>`;
  }).join('');
  const ago = minsAgo(LIVE.updated);
  let msg;
  if (!LIVE.ok){
    msg = `<div class="alert bad">시세 파일(data/prices.json)을 받지 못했습니다${LIVE.err ? ` (${esc(LIVE.err)})` : ''}. GitHub 저장소에서 Actions가 켜져 있는지, Pages 배포 방식이 'GitHub Actions'인지 확인하세요. 그 전까지는 10월 23일 종가가 표시되고 거래는 막힙니다.</div>`;
  } else {
    const stale = ago !== null && ago > 45 && (mstate('KR').open || mstate('US').open);
    msg = `<p class="prose" style="margin:0">마지막 수집 ${LIVE.updated ? `${fmtDate(zoneParts('Asia/Seoul', LIVE.updated).date, false)} ${kstTime(LIVE.updated)}` : '-'}${ago !== null ? ` (${ago < 1 ? '방금' : ago + '분 전'})` : ''}. 장중에는 약 5분마다 수집하지만 GitHub 사정으로 5~30분 늦을 수 있습니다.${LIVE.miss.size ? ` 시세를 받지 못한 종목 ${LIVE.miss.size}개는 거래할 수 없습니다: ${[...LIVE.miss].map(id => esc(BY_ID[id].n)).join(', ')}.` : ''}</p>`
      + (stale ? `<div class="alert bad" style="margin-top:8px">장중인데 시세가 ${ago}분째 갱신되지 않았습니다. 지금 보이는 가격으로 체결됩니다.</div>` : '');
  }
  return `<div class="st-list">${rows}</div>${msg}<button class="btn" id="btnRefresh2" style="margin-top:10px">시세 새로고침</button>`;
}

/* ───────── 렌더: 시장 ───────── */
function renderMarket(){
  const v = $('#v-market');
  if (!v.dataset.built){
    v.dataset.built = 1;
    v.innerHTML = `
    <div class="mkt-head">
      <div class="seg" role="group" aria-label="시장 선택"><button data-mkt="KR">한국 100</button><button data-mkt="US">미국 100</button></div>
      <div class="tools">
        <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><span class="sr">종목 검색</span><input id="q" type="search" placeholder="종목명, 티커, 종목코드" autocomplete="off"></label>
        <select class="pick" id="sortSel" aria-label="정렬"><option value="cap">시가총액순</option><option value="up">상승률순</option><option value="down">하락률순</option><option value="base">기준가 대비</option><option value="own">보유 종목 먼저</option></select>
        <select class="pick" id="secSel" aria-label="업종"></select>
      </div>
    </div>
    <div class="list-head" aria-hidden="true"><span></span><span>종목</span><span>시가총액</span><span>기준가 대비</span><span>최근 30일</span><span>현재가</span></div>
    <div class="list" id="mktList"></div>
    <p class="muted" style="margin:10px 2px 0" id="mktFoot"></p>`;
    $('#q').addEventListener('input', e => { UI.q = e.target.value.trim().toLowerCase(); renderMarketList(); });
    $('#sortSel').addEventListener('change', e => { UI.sort = e.target.value; renderMarketList(); });
    $('#secSel').addEventListener('change', e => { UI.sector = e.target.value; renderMarketList(); });
  }
  $$('#v-market [data-mkt]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mkt === UI.mkt)));
  const opts = Object.keys(SECTORS).filter(k => STOCKS.some(s => s.s === k && s.m === UI.mkt));
  if (UI.sector !== 'all' && !opts.includes(UI.sector)) UI.sector = 'all';
  $('#secSel').innerHTML = `<option value="all">전체 업종</option>` + opts.map(k => `<option value="${k}" ${UI.sector === k ? 'selected' : ''}>${SECTORS[k].ko}</option>`).join('');
  $('#sortSel').value = UI.sort;
  renderMarketList();
}
function renderMarketList(){
  const live = isLive();
  let list = STOCKS.filter(s => s.m === UI.mkt);
  const capRank = [...list].sort((a, b) => capUSD(b) - capUSD(a));
  const rankOf = Object.fromEntries(capRank.map((s, i) => [s.id, i + 1]));
  if (UI.sector !== 'all') list = list.filter(s => s.s === UI.sector);
  if (UI.q) list = list.filter(s => (s.n + ' ' + s.e + ' ' + s.t).toLowerCase().includes(UI.q));
  const dc = s => price(s.id)/prevPrice(s.id) - 1;
  const bc = s => price(s.id)/basePrice(s) - 1;
  const sorters = {
    cap:(a, b) => rankOf[a.id] - rankOf[b.id], up:(a, b) => dc(b) - dc(a), down:(a, b) => dc(a) - dc(b),
    base:(a, b) => bc(b) - bc(a), own:(a, b) => ((S.pos[b.id] ? 1 : 0) - (S.pos[a.id] ? 1 : 0)) || rankOf[a.id] - rankOf[b.id]
  };
  list.sort(sorters[UI.sort] || sorters.cap);
  const showChange = live ? hist(STOCKS.find(s => s.m === UI.mkt).id).length > 1 : S.day > 0;
  $('#mktList').innerHTML = list.length ? list.map(s => {
    const p = price(s.id), c = dc(s), a = hist(s.id);
    const own = S.pos[s.id] ? '<span class="own-dot" title="보유 중"></span>' : '';
    const miss = live && LIVE.miss.has(s.id);
    return `<button class="row" data-open="${s.id}">
      <span class="rk">${rankOf[s.id]}</span>
      <span class="mono" style="--h:${SECTORS[s.s].h}" aria-hidden="true">${esc(monoText(s))}</span>
      <span class="nmb"><div class="n">${esc(s.n)}${own}</div><div class="s">${esc(s.t)} ${s.m === 'KR' ? s.x : ''} ${SECTORS[s.s].ko}</div></span>
      <span class="wcol num">${s.cur === 'KRW' ? fmtCapKRW(capNative(s)) : fmtCapUSD(capNative(s))}</span>
      <span class="wcol num ${cls(bc(s))}">${fmtPct(bc(s))}</span>
      ${sparkSVG(a, cls(p/a[Math.max(0, a.length-30)]-1))}
      <span class="px"><div class="p num">${fmtPx(s, p)}</div><div class="c num ${miss ? 'flat' : cls(c)}">${miss ? '시세 없음' : showChange ? fmtPct(c) : '기준가'}</div></span>
    </button>`;
  }).join('') : `<p class="empty" style="padding:18px">조건에 맞는 종목이 없습니다. 검색어나 업종을 바꿔보세요.</p>`;
  const fx = fmtFX(FX());
  if (live){
    const st = mstate(UI.mkt);
    $('#mktFoot').textContent = `${SESS[UI.mkt].ko} 시장 ${st.label}. 정규장은 한국 시각 ${sessInKST(UI.mkt)}이고 그 시간에만 거래할 수 있습니다. 등락률은 전 거래일 종가 대비입니다.` + (UI.mkt === 'KR' ? ` 원화 가격은 원/달러 ${fx}원으로 환전됩니다.` : '');
  } else {
    $('#mktFoot').textContent = UI.mkt === 'KR'
      ? `순위는 현재 시가총액 기준입니다. 원화 가격은 매수·매도 때 원/달러 ${fx}원으로 환전됩니다. 하루 가격제한폭 ±30%.`
      : '순위는 현재 시가총액 기준입니다. 미국 주식은 달러로 바로 거래됩니다.';
  }
}

/* ───────── 렌더: 내 자산 ───────── */
function renderAssets(){
  const v = $('#v-assets');
  const N = netWorth(), V = holdingsUSD(), D = debt();
  let cost = 0; for (const id in S.pos) cost += S.pos[id].cost;
  const unreal = V - cost;
  const ret = (N - META.seed) / META.seed;
  const kRet = last(idxHist('KR'))/1000 - 1, uRet = last(idxHist('US'))/1000 - 1;
  const maxAbs = Math.max(.05, Math.abs(ret), Math.abs(kRet), Math.abs(uRet));
  const benchRow = (l, r, c) => {
    const w = Math.abs(r) / maxAbs * 50;
    return `<div class="bench-r"><span>${l}</span><span class="bar"><i style="${r >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`};background:${c}"></i></span><span class="num ${cls(r)}" style="text-align:right;font-weight:700">${fmtPct(r)}</span></div>`;
  };
  const ids = Object.keys(S.pos).sort((a, b) => S.pos[b].q*toUSD(BY_ID[b], price(b)) - S.pos[a].q*toUSD(BY_ID[a], price(a)));
  const holdRows = ids.map(id => {
    const s = BY_ID[id], P = S.pos[id], p = price(id);
    const val = P.q * toUSD(s, p), pl = val - P.cost, plr = P.cost ? pl / P.cost : 0;
    return `<button class="hold" data-open="${id}">
      <span class="mono" style="--h:${SECTORS[s.s].h}">${esc(monoText(s))}</span>
      <span class="nmb"><div class="n">${esc(s.n)}</div><div class="s">${P.q.toLocaleString()}주, 평균 ${fmtPx(s, P.avg)}</div></span>
      <span class="px"><div class="p num">${fmtUSD(val)}</div><div class="c num ${cls(pl)}">${signUSD(pl)} (${fmtPct(plr)})</div></span>
    </button>`;
  }).join('');
  const tr = S.trades.slice(0, 60).map(t => {
    const s = BY_ID[t.id];
    const when = isLive() && t.at ? `${fmtDate(t.dt, false)}<br><span class="muted">${kstTime(new Date(t.at))}</span>` : fmtDate(t.dt, false);
    return `<tr><td>${when}</td><td><span class="side ${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? '매수' : '매도'}</span>${t.tag ? `<br><span class="tag" style="margin:2px 0 0">${esc(t.tag)}</span>` : ''}</td><td>${esc(s.n)}<br><span class="muted">${t.q.toLocaleString()}주 × ${fmtPx(s, t.p)}</span></td><td class="r num">${t.side === 'buy' ? MINUS : '+'}${fmtUSD(t.usd)}</td></tr>`;
  }).join('');
  v.innerHTML = `
  <div class="stack">
    <dl class="sum-grid">
      <div><dt>순자산</dt><dd class="num">${fmtUSD(N)}</dd></div>
      <div><dt>총수익률</dt><dd class="num ${cls(ret)}">${fmtPct(ret)}</dd></div>
      <div><dt>주식 평가액</dt><dd class="num">${fmtUSD(V)}</dd></div>
      <div><dt>평가손익</dt><dd class="num ${cls(unreal)}">${signUSD(unreal)}</dd></div>
      <div><dt>현금</dt><dd class="num">${fmtUSD(S.cash)}</dd></div>
      <div><dt>대출 잔액</dt><dd class="num">${fmtUSD(D)}</dd></div>
      <div><dt>실현손익</dt><dd class="num ${cls(S.realized)}">${signUSD(S.realized)}</dd></div>
      <div><dt>낸 이자와 수수료</dt><dd class="num">${fmtUSD(S.interestPaid + S.feesPaid)}</dd></div>
    </dl>
    <div class="assets-grid">
      <section class="card"><div class="card-h"><h2>보유 종목</h2><small>${ids.length}개</small></div>
        ${holdRows || '<p class="empty">아직 보유한 종목이 없습니다. 시장 탭에서 종목을 눌러 매수해 보세요.</p>'}
      </section>
      <div class="stack">
        <section class="card"><div class="card-h"><h2>지수와 비교</h2><small>10월 23일 종가 대비</small></div>
          <div class="bench">${benchRow('내 순자산', ret, 'var(--brass)')}${benchRow('한국 100', kRet, '#6E8BFF')}${benchRow('미국 100', uRet, '#8A93A6')}</div>
        </section>
        <section class="card"><div class="card-h"><h2>거래 내역</h2><small>최근 60건</small></div>
          ${tr ? `<div class="tbl-wrap"><table class="trades"><thead><tr><th>날짜</th><th>구분</th><th>종목</th><th class="r">결제(USD)</th></tr></thead><tbody>${tr}</tbody></table></div>` : '<p class="empty">거래 내역이 없습니다.</p>'}
        </section>
      </div>
    </div>
  </div>`;
}

/* ───────── 렌더: 대출 ───────── */
function renderLoans(){
  const v = $('#v-loans');
  const live = isLive();
  const R = rates(), L = limits(), C = S.loans.credit, M = S.loans.margin, O = S.loans.od;
  const gr = g(), U = termUnit(), YD = yearDays();
  const ratio = marginRatio();
  const gaugePos = isFinite(ratio) ? clamp((ratio - 1) / 2, 0, 1) * 100 : 100;
  const card = (key, title, desc, apr, kv, body, warn) => `
    <section class="card loan" data-loan="${key}">
      <div class="loan-top"><div><h3>${title}</h3><p>${desc}</p></div><div class="apr"><b class="num">${apr.toFixed(2)}%</b><span>연이율, 등급 따라 변동</span></div></div>
      ${warn || ''}
      <dl class="kv">${kv.map(([k, val]) => `<div><dt>${k}</dt><dd class="num">${val}</dd></div>`).join('')}</dl>
      ${body}
    </section>`;
  const amtBox = key => `<label class="amt"><span>$</span><input inputmode="decimal" type="number" min="0" step="10" placeholder="금액" id="amt-${key}" aria-label="금액(달러)"></label>`;
  const remain = C.due === null ? null : live ? daysBetween(kstDate(), C.due) : C.due - S.day;
  let cWarn = '';
  if (C.overdue > 0) cWarn = `<div class="alert bad">연체 ${C.overdue}${U}째입니다. ${Math.max(0, 5 - C.overdue)}${U} 안에 갚지 않으면 반대매매됩니다.${live && S.pend.credit ? ' 연체 반대매매가 대기 중이어서 장이 열리면 바로 실행됩니다.' : ''}</div>`;
  else if (C.bal > 0 && C.due !== null) cWarn = `<div class="alert">만기${live ? `(${fmtDate(C.due, false)})` : ''}까지 ${Math.max(0, remain)}${U} 남았습니다. 만기일에 현금으로 자동 상환됩니다.</div>`;
  let mWarn = '';
  if (M.bal > 0){
    mWarn = `<div><div class="gauge" role="img" aria-label="담보유지비율 ${isFinite(ratio) ? (ratio*100).toFixed(0) : '-'}%"><i style="left:${gaugePos}%"></i></div><div class="gauge-cap"><span>100%</span><span>반대매매 120%</span><span>경고 140%</span><span>300%+</span></div></div>`
      + (ratio < META.marginWarn ? `<div class="alert bad">담보유지비율 ${(ratio*100).toFixed(0)}%. 120% 아래로 내려가면 ${live ? '보유 종목의 장이 열려 있을 때' : '다음 정산 때'} 자동 반대매매됩니다.</div>` : '');
  }
  v.innerHTML = `
  <div class="loans-grid">
    <section class="card wide">
      <div class="grade">
        <div class="grade-n num">${gr}<small>등급</small></div>
        <div>
          <div style="font-weight:750">신용등급</div>
          <div class="ladder" aria-hidden="true">${Array.from({length:10}, (_, i) => `<i class="${10 - i >= gr ? 'on' : ''}"></i>`).join('')}</div>
          <div class="muted">1등급이 가장 좋습니다. 만기 전에 완납하면 오르고, 연체나 반대매매가 생기면 내려갑니다. 등급이 금리와 한도를 정합니다. 게임 기준금리는 연 ${S.base.toFixed(2)}%입니다${live ? ' (실제 시세 모드에서는 고정)' : ''}.</div>
        </div>
      </div>
    </section>
    ${card('credit', '신용대출', `순자산과 신용등급으로 한도가 정해지는 대출입니다. 만기 ${META.creditTerm}${U}, 이자는 ${live ? '날마다' : '거래일마다'} 원금에 더해집니다.`, R.credit,
      [['대출 잔액', fmtUSD(C.bal)], ['추가 한도', fmtUSD(L.credit)], ['남은 기간', C.bal > 0 && C.due !== null ? (C.overdue > 0 ? `연체 ${C.overdue}${U}` : `${Math.max(0, remain)}${U}`) : '없음']],
      `<div class="act">${amtBox('credit')}<button class="btn brass" data-borrow="credit">빌리기</button><button class="btn" data-repay="credit" ${C.bal > 0 ? '' : 'disabled'}>갚기</button><button class="btn" data-repayall="credit" ${C.bal > 0 ? '' : 'disabled'}>전액 상환</button></div>`, cWarn)}
    ${card('margin', '주식담보대출', `보유 주식 평가액의 ${META.ltv*100}%까지 빌립니다. 담보유지비율이 120% 아래로 떨어지면 자동 반대매매됩니다.`, R.margin,
      [['대출 잔액', fmtUSD(M.bal)], ['추가 한도', fmtUSD(L.margin)], ['담보유지비율', M.bal > 0 ? (ratio*100).toFixed(0) + '%' : '해당 없음']],
      `<div class="act">${amtBox('margin')}<button class="btn brass" data-borrow="margin" ${L.margin > 1 ? '' : 'disabled'}>빌리기</button><button class="btn" data-repay="margin" ${M.bal > 0 ? '' : 'disabled'}>갚기</button><button class="btn" data-repayall="margin" ${M.bal > 0 ? '' : 'disabled'}>전액 상환</button></div>`, mWarn)}
    ${card('od', '마이너스통장', '현금보다 큰 주문을 넣으면 한도 안에서 자동으로 빌려집니다. 주식을 팔면 매도대금으로 먼저 갚습니다.', R.od,
      [['사용액', fmtUSD(O.bal)], ['한도', fmtUSD(L.odLimit)], ['남은 한도', fmtUSD(Math.max(0, L.odLimit - O.bal))]],
      `<div class="act">${amtBox('od')}<button class="btn" data-repay="od" ${O.bal > 0 ? '' : 'disabled'}>갚기</button><button class="btn" data-repayall="od" ${O.bal > 0 ? '' : 'disabled'}>전액 상환</button></div>`)}
    <section class="card wide">
      <div class="card-h"><h2>대출 계산식</h2><small>모든 금액은 달러 기준</small></div>
      <div class="fx-block">
        <div class="fx-item"><h4>하루 이자</h4>
          <div class="eq"><i>I</i> = <i>B</i> × <i>r</i> ÷ ${YD}</div>
          <ul class="defs"><li><span class="sym">I</span><span>${live ? '하루(달력 기준)' : '한 거래일'}마다 붙는 이자(달러). 원금에 더해집니다.</span></li><li><span class="sym">B</span><span>정산 직전 대출 잔액(달러)</span></li><li><span class="sym">r</span><span>연이율을 소수로 쓴 값 (예: 연 6.20% → 0.062)</span></li><li><span class="sym">${YD}</span><span>${live ? '1년의 날 수. 실제 시세 모드는 주말도 이자가 붙습니다.' : '게임에서 1년으로 치는 거래일 수'}</span></li></ul>
        </div>
        <div class="fx-item"><h4>담보유지비율</h4>
          <div class="eq"><i>R</i> = <i>V</i> ÷ <i>L</i><sub>m</sub> × 100 (%)</div>
          <ul class="defs"><li><span class="sym">R</span><span>담보유지비율(%)</span></li><li><span class="sym">V</span><span>보유 주식 전체의 평가액(한국 주식은 현재 환율로 달러 환산)</span></li><li><span class="sym">L<sub>m</sub></span><span>주식담보대출 잔액</span></li></ul>
          <p class="prose" style="margin:8px 0 0"><i>R</i>이 140% 미만이면 경고, 120% 미만이면 평가액이 큰 종목부터 현재가보다 2% 낮은 값에 팔아 <i>R</i>을 160%까지 되돌립니다.${live ? ' 실제 시세 모드에서는 장이 열린 시장의 종목만 팔 수 있어서, 둘 다 닫혀 있으면 다음 개장 때 실행됩니다.' : ''}</p>
        </div>
        <div class="fx-item"><h4>대출 금리</h4>
          <div class="eq"><i>r</i> = <i>b</i> + <i>s</i> + <i>k</i>(<i>G</i> − 1)</div>
          <ul class="defs"><li><span class="sym">b</span><span>게임 기준금리 (지금 ${S.base.toFixed(2)}%${live ? ', 고정' : ', 모의 뉴스로 0.25%p씩 변동'})</span></li><li><span class="sym">s</span><span>상품 가산금리: 신용대출 3.2%p, 주식담보대출 2.0%p, 마이너스통장 5.0%p</span></li><li><span class="sym">k</span><span>등급 가산폭: 신용대출 0.55%p, 주식담보대출 0.25%p, 마이너스통장 0.70%p</span></li><li><span class="sym">G</span><span>신용등급 (1~10). 연체 중인 신용대출에는 5%p가 더 붙습니다.</span></li></ul>
        </div>
      </div>
    </section>
  </div>`;
}

/* ───────── 렌더: 규칙·설정 ───────── */
function renderInfo(){
  const v = $('#v-info');
  const live = isLive();
  const ests = STOCKS.filter(s => s.note);
  v.innerHTML = `
  <div class="loans-grid">
    <section class="card">
      <div class="card-h"><h2>설정</h2></div>
      <div class="set-row"><div class="l">게임 모드<small>지금은 ${live ? '실제 시세' : '시뮬레이션'} 모드입니다. 모드마다 기록이 따로 저장됩니다.</small></div>
        <div class="seg"><button data-setmode="live" aria-pressed="${live}">실제 시세</button><button data-setmode="sim" aria-pressed="${!live}">시뮬레이션</button></div></div>
      <div class="set-row"><div class="l">상승·하락 색<small>한국식은 상승 빨강, 미국식은 상승 초록</small></div>
        <div class="seg"><button data-conv="kr" aria-pressed="${SET.conv === 'kr'}">한국식</button><button data-conv="us" aria-pressed="${SET.conv === 'us'}">미국식</button></div></div>
      <div class="set-row"><div class="l">화면 테마</div>
        <div class="seg"><button data-theme="auto" aria-pressed="${SET.theme === 'auto'}">자동</button><button data-theme="light" aria-pressed="${SET.theme === 'light'}">밝게</button><button data-theme="dark" aria-pressed="${SET.theme === 'dark'}">어둡게</button></div></div>
      ${live ? '' : `<div class="set-row"><div class="l">자동 진행 속도<small>헤더의 ▶▶ 버튼으로 켜고 끕니다</small></div>
        <div class="seg">${SPEEDS.map((s, i) => `<button data-speed="${i}" aria-pressed="${SET.speed === i}">${s.l}</button>`).join('')}</div></div>`}
      <div class="set-row"><div class="l">새 게임<small>이 모드의 기록을 지우고 시드 $10,000로 다시 시작합니다</small></div>
        <button class="btn" id="btnReset" style="color:var(--danger)">새 게임 시작</button></div>
    </section>
    <section class="card prose">
      <div class="card-h"><h2>게임 규칙</h2></div>
      <ul>
        <li>시드머니는 <b>$10,000</b>이고, 계좌는 달러로 관리합니다.</li>
        ${live ? `
        <li><b>실제 시세 모드</b>: 실제 주가를 따라갑니다. 장중에는 약 5분마다 시세를 수집하지만, GitHub 예약 실행 사정으로 5~30분 늦을 수 있습니다.</li>
        <li>각 시장의 <b>정규장</b>에만 거래할 수 있습니다. 한국 ${sessInKST('KR')}, 미국 ${sessInKST('US')}(한국 시각, 서머타임 반영). 공휴일은 그날 시세가 들어오지 않는 것으로 판단합니다.</li>
        <li>체결가는 마지막으로 수집된 가격입니다. 화면의 시세 시각을 확인하세요.</li>
        <li>대출 이자는 주말을 포함해 날마다 붙고, 신용대출 만기는 ${META.creditTerm}일입니다.</li>` : `
        <li><b>시뮬레이션 모드</b>: 다음 거래일을 누를 때마다 하루치 시세가 시뮬레이션됩니다. 주말은 건너뛰고, 공휴일은 따로 반영하지 않습니다.</li>
        <li>한국 주식은 하루 ±30% 가격제한폭과 호가 단위를 적용합니다.</li>`}
        <li>주문은 정수 주 단위 시장가로 즉시 체결됩니다. 거래 수수료는 체결 금액의 0.1%입니다.</li>
        <li>한국 주식은 원화로 표시되며, 매수할 때 달러를 원화로, 매도할 때 원화를 달러로 바꿉니다. 이때 환전 수수료 0.2%가 붙습니다.</li>
        <li>순자산이 0 이하가 되면 파산하고 게임이 끝납니다.</li>
        <li>진행 상황은 이 브라우저에 자동 저장됩니다. 다른 기기와는 공유되지 않습니다.</li>
      </ul>
    </section>
    <section class="card wide">
      <div class="card-h"><h2>계산식</h2></div>
      <div class="fx-block">
        <div class="fx-item"><h4>순자산과 수익률</h4>
          <div class="eq"><i>N</i> = <i>C</i> + <i>V</i> − (<i>L</i><sub>c</sub> + <i>L</i><sub>m</sub> + <i>L</i><sub>o</sub>),&nbsp;&nbsp; 수익률 = (<i>N</i> − 10000) ÷ 10000 × 100 (%)</div>
          <ul class="defs"><li><span class="sym">N</span><span>순자산(달러)</span></li><li><span class="sym">C</span><span>현금(달러)</span></li><li><span class="sym">V</span><span>보유 주식 평가액의 합(달러)</span></li><li><span class="sym">L<sub>c</sub></span><span>신용대출 잔액</span></li><li><span class="sym">L<sub>m</sub></span><span>주식담보대출 잔액</span></li><li><span class="sym">L<sub>o</sub></span><span>마이너스통장 사용액</span></li></ul>
        </div>
        <div class="fx-item"><h4>한국 주식 평가액(달러 환산)</h4>
          <div class="eq"><i>V</i><sub>i</sub> = <i>q</i><sub>i</sub> × <i>P</i><sub>i</sub> ÷ <i>X</i></div>
          <ul class="defs"><li><span class="sym">V<sub>i</sub></span><span>종목 i의 평가액(달러)</span></li><li><span class="sym">q<sub>i</sub></span><span>종목 i의 보유 수량(주)</span></li><li><span class="sym">P<sub>i</sub></span><span>종목 i의 현재가(원)</span></li><li><span class="sym">X</span><span>원/달러 환율(1달러당 원)${live ? '. 실제 시세 모드에서는 야후 파이낸스의 원/달러 시세' : ''}</span></li></ul>
        </div>
        <div class="fx-item"><h4>한국 주식 매수 결제액</h4>
          <div class="eq"><i>U</i> = <i>P</i> × <i>q</i> × (1 + <i>f</i>) ÷ <i>X</i> × (1 + <i>h</i>)</div>
          <ul class="defs"><li><span class="sym">U</span><span>계좌에서 빠지는 달러</span></li><li><span class="sym">P</span><span>체결가(원)</span></li><li><span class="sym">q</span><span>주문 수량(주)</span></li><li><span class="sym">f</span><span>거래 수수료율 0.001</span></li><li><span class="sym">X</span><span>원/달러 환율</span></li><li><span class="sym">h</span><span>환전 수수료율 0.002</span></li></ul>
          <p class="prose" style="margin:8px 0 0">매도할 때는 (1 + <i>f</i>)와 (1 + <i>h</i>)가 각각 (1 − <i>f</i>)와 (1 − <i>h</i>)로 바뀝니다. 미국 주식은 환전 단계 없이 <i>U</i> = <i>P</i> × <i>q</i> × (1 ± <i>f</i>)입니다.</p>
        </div>
        <div class="fx-item"><h4>한국 100·미국 100 지수</h4>
          <div class="eq"><i>I</i><sub>t</sub> = 1000 × Σ<sub>i</sub> <i>W</i><sub>i</sub> (<i>P</i><sub>i,t</sub> ÷ <i>P</i><sub>i,0</sub>) ÷ Σ<sub>i</sub> <i>W</i><sub>i</sub></div>
          <ul class="defs"><li><span class="sym">I<sub>t</sub></span><span>t일의 지수 값 (10월 23일 = 1000)</span></li><li><span class="sym">W<sub>i</sub></span><span>종목 i의 10월 23일 시가총액 (가중치)</span></li><li><span class="sym">P<sub>i,t</sub></span><span>종목 i의 t일 가격</span></li><li><span class="sym">P<sub>i,0</sub></span><span>종목 i의 10월 23일 종가</span></li></ul>
          <p class="prose" style="margin:8px 0 0">게임 안 100개 종목만으로 계산한 값이라 코스피나 S&amp;P 500과는 다릅니다.</p>
        </div>
        ${live ? '' : `<div class="fx-item"><h4>하루 가격 변동 모델 (시뮬레이션)</h4>
          <div class="eq"><i>P</i><sub>t+1</sub> = <i>P</i><sub>t</sub> · e<sup><i>r</i><sub>t</sub></sup>,&nbsp;&nbsp; <i>r</i><sub>t</sub> = <i>β</i>(<i>m</i><sub>t</sub> + <i>M</i><sub>t</sub>) + <i>s</i><sub>t</sub> + <i>ε</i><sub>t</sub> + <i>J</i><sub>t</sub> − <i>σ</i>² ÷ (2 × 252)</div>
          <ul class="defs">
            <li><span class="sym">P<sub>t</sub></span><span>t번째 거래일 종가</span></li>
            <li><span class="sym">e</span><span>자연로그의 밑 (≈ 2.71828)</span></li>
            <li><span class="sym">r<sub>t</sub></span><span>그날의 로그수익률</span></li>
            <li><span class="sym">β</span><span>업종별 시장 민감도 (예: 반도체 1.30, 통신 0.50)</span></li>
            <li><span class="sym">m<sub>t</sub></span><span>시장 공통 변동. 한국·미국 따로 뽑되 상관계수 0.55로 함께 움직이고, 숨겨진 상승장·보합장·하락장 국면에 따라 평균이 달라집니다.</span></li>
            <li><span class="sym">M<sub>t</sub></span><span>시장 모의 뉴스 충격 (없으면 0)</span></li>
            <li><span class="sym">s<sub>t</sub></span><span>업종 공통 변동 + 업종 모의 뉴스 충격</span></li>
            <li><span class="sym">ε<sub>t</sub></span><span>종목 고유 변동 (정규분포)</span></li>
            <li><span class="sym">J<sub>t</sub></span><span>종목 모의 뉴스 충격 (±3~12%, 없으면 0)</span></li>
            <li><span class="sym">σ</span><span>업종별 연 변동성 (예: 반도체 0.48, 필수소비재 0.18)</span></li>
          </ul>
          <p class="prose" style="margin:8px 0 0">마지막 항은 변동성 때문에 기대 가격이 부풀려지지 않도록 빼는 보정값입니다. 업종별 <i>β</i>와 <i>σ</i>는 게임 밸런스용 설정값이며 실제 통계가 아닙니다.</p>
        </div>`}
      </div>
    </section>
    <section class="card wide prose">
      <div class="card-h"><h2>데이터 기준</h2></div>
      <p>종목 목록과 기준가는 <b>2026년 10월 23일(금) 종가</b>입니다. 한국 시간 10월 26일 오후 9시는 미국 동부 시간 오전 8시라 미국은 정규장 전이었고, 직전 종가가 10월 23일 종가입니다. 한국은 일괄로 확인할 수 있었던 데이터가 10월 23일 종가 기준이어서 두 시장을 같은 날로 맞췄습니다.</p>
      ${live ? `<p><b>실제 시세</b>는 GitHub Actions가 야후 파이낸스에서 받아 사이트에 함께 배포한 data/prices.json에서 읽습니다. 야후 시세는 공식 거래소 시세가 아니고, 수집 도구(yfinance)도 공식 API가 아니어서 가끔 빠지거나 늦을 수 있습니다. 실제 시세 모드의 기준가는 야후가 준 10월 23일 종가라서 아래 시뮬레이션용 기준가와 조금 다를 수 있습니다.</p>` : '<p>이후 시세는 모두 시뮬레이션입니다.</p>'}
      <ul>
        <li><b>미국 100</b>: companiesmarketcap.com의 미국 기업 시가총액 순위 1~100위.</li>
        <li><b>한국 100</b>: 같은 사이트의 한국 기업 순위에서 중복 항목(SK이노베이션 우선주)을 빼고 101위(삼성카드)까지 포함. 이 사이트는 한국 기업 178곳만 다뤄 HLB, 주성엔지니어링, 이오테크닉스, 삼천당제약 같은 일부 코스닥 대형주가 빠져 있습니다.</li>
        <li><b>시뮬레이션 기준가(원화)</b>: 사이트의 달러 가격 × 1,325.2원(삼성전자·SK하이닉스·두산에너빌리티 등의 실제 10/23 종가가 그대로 맞아떨어지는 환산율)을 호가 단위로 반올림. 원 단위 가격이 4자리로 반올림돼 있던 종목은 수백 원 오차가 있을 수 있습니다.</li>
        <li><b>예외 ${ests.length}종목</b>: 사이트에 ADR이나 우선주 가격만 있던 종목은 뉴스로 확인한 보통주 종가로 바꿨습니다. KT만 보통주 종가를 확인하지 못해 추정치입니다.</li>
        <li><b>시뮬레이션 시작 환율</b>: 10월 26일 오후 3시 30분 원/달러 1,323.10원(전일 대비 1.5원 하락)에서 역산한 10월 23일 값 1,324.60원.</li>
      </ul>
      <p style="margin-top:6px">예외 종목: ${ests.map(s => `${esc(s.n)}${s.est ? '(추정)' : ''}`).join(', ')}</p>
    </section>
  </div>
  <p class="ver">SEED 10K v${VERSION}</p>`;
}

/* ───────── 종목 상세 시트 ───────── */
function openSheet(id){
  UI.sheet = id; UI.side = S.pos[id] ? UI.side : 'buy'; UI.qty = 1;
  const sh = $('#sheet'), sc = $('#scrim');
  sh.hidden = false; sc.hidden = false;
  renderSheet();
  requestAnimationFrame(() => { sh.classList.add('on'); sc.classList.add('on'); });
  setTimeout(() => { const c = sh.querySelector('.close'); c && c.focus({preventScroll:true}); }, 50);
}
function closeSheet(){
  const sh = $('#sheet'), sc = $('#scrim');
  sh.classList.remove('on'); sc.classList.remove('on');
  UI.sheet = null;
  setTimeout(() => { if (!UI.sheet){ sh.hidden = true; if ($('#modal').hidden) sc.hidden = true; } }, 280);
}
function renderSheet(){
  const id = UI.sheet; if (!id) return;
  const live = isLive();
  const s = BY_ID[id], p = price(id), a = hist(id);
  const dc = p / prevPrice(id) - 1, bc = p / basePrice(s) - 1;
  const P = S.pos[id];
  const rng = UI.range === 0 ? a : a.slice(-UI.range - 1);
  const hi = Math.max(...a), lo = Math.min(...a);
  const sh = $('#sheet');
  const val = P ? P.q * toUSD(s, p) : 0, pl = P ? val - P.cost : 0;
  const hasPrev = a.length > 1;
  const st = live ? mstate(s.m) : null;
  const priceNote = live
    ? (LIVE.miss.has(id) ? '실제 시세를 받지 못한 종목입니다.' : `${SESS[s.m].ko} 시장 ${st.label}, 시세 ${LIVE.updated ? kstTime(LIVE.updated) : '-'} 기준`)
    : '';
  sh.innerHTML = `
    <div class="grab"></div>
    <div class="sh-top">
      <span class="mono" style="--h:${SECTORS[s.s].h}">${esc(monoText(s))}</span>
      <div><h2>${esc(s.n)}</h2><p>${esc(s.t)} <span class="sep"></span>${s.m === 'KR' ? s.x : '미국'} <span class="sep"></span>${SECTORS[s.s].ko}</p></div>
      <button class="close" aria-label="닫기"><svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div>
    <div class="sh-price"><span class="big num">${fmtPx(s, p)}</span><span class="chg num ${cls(dc)}">${hasPrev ? `전일 대비 ${fmtPct(dc)}` : '기준가'}</span></div>
    <div class="sh-sub">10/23 종가 대비 <b class="${cls(bc)}">${fmtPct(bc)}</b>${s.cur === 'KRW' ? `,&nbsp; 약 ${fmtUSD(p / FX())}` : ''}${priceNote ? `<br>${esc(priceNote)}` : ''}</div>
    <div class="chart" id="chartBox">${chartSVG(rng, s)}<div class="read" id="chartRead" hidden></div></div>
    <div class="ranges" role="group" aria-label="차트 기간">${[[20,'20일'],[60,'60일'],[0,'전체']].map(([r, l]) => `<button data-range="${r}" aria-pressed="${UI.range === r}">${l}</button>`).join('')}</div>
    <dl class="stats">
      <div><dt>시가총액</dt><dd class="num">${s.cur === 'KRW' ? fmtCapKRW(capNative(s)) : fmtCapUSD(capNative(s))}</dd></div>
      <div><dt>10/23 종가</dt><dd class="num">${fmtPx(s, basePrice(s))}</dd></div>
      <div><dt>${live ? '10/23 이후 최고' : '게임 중 최고'}</dt><dd class="num">${fmtPx(s, hi)}</dd></div>
      <div><dt>${live ? '10/23 이후 최저' : '게임 중 최저'}</dt><dd class="num">${fmtPx(s, lo)}</dd></div>
    </dl>
    ${s.note && !live ? `<p class="note">${esc(s.note)}</p>` : ''}
    ${P ? `<dl class="pos"><div><dt>보유 수량</dt><dd class="num">${P.q.toLocaleString()}주</dd></div><div><dt>평균 단가</dt><dd class="num">${fmtPx(s, P.avg)}</dd></div><div><dt>평가액</dt><dd class="num">${fmtUSD(val)}</dd></div><div><dt>평가손익</dt><dd class="num ${cls(pl)}">${signUSD(pl)} (${fmtPct(P.cost ? pl / P.cost : 0)})</dd></div></dl>` : ''}
    <div class="order" id="orderBox"></div>`;
  renderOrder();
  bindChart(rng, s);
}
function chartSVG(vals, s){
  const w = 600, h = 190;
  const c = cls(last(vals) - vals[0]);
  const col = c === 'flat' ? 'var(--ink-3)' : `var(--${c})`;
  const base = basePrice(s);
  const v = vals.length < 2 ? [vals[0], vals[0]] : vals;
  const lo = Math.min(...v, base), hi = Math.max(...v, base);
  const pad = (hi - lo) * .08 || hi * .01;
  const P = pathFor(v, w, h, 6, lo - pad, hi + pad);
  const area = P.d + `L${P.x(v.length-1).toFixed(2)} ${h}L${P.x(0).toFixed(2)} ${h}Z`;
  const by = P.y(base).toFixed(1);
  const gid = 'g' + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="가격 차트">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".18"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    <line x1="0" x2="${w}" y1="${by}" y2="${by}" stroke="var(--ink-3)" stroke-opacity=".6" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"/>
    <path d="${area}" fill="url(#${gid})"/>
    <path d="${P.d}" fill="none" stroke="${col}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
    <line id="cx" x1="0" x2="0" y1="0" y2="${h}" stroke="var(--ink-2)" stroke-width="1" vector-effect="non-scaling-stroke" visibility="hidden"/>
    <circle id="cdot" r="4" fill="${col}" visibility="hidden"/>
  </svg>`;
}
function bindChart(vals, s){
  const box = $('#chartBox'), svg = box.querySelector('svg'), read = $('#chartRead');
  const v = vals.length < 2 ? [vals[0], vals[0]] : vals;
  const dates = histDates(s.m).slice(-v.length);
  const w = 600, h = 190, base = basePrice(s);
  const lo = Math.min(...v, base), hi = Math.max(...v, base), pad = (hi - lo) * .08 || hi * .01;
  const P = pathFor(v, w, h, 6, lo - pad, hi + pad);
  const move = e => {
    const r = svg.getBoundingClientRect();
    const fx = clamp((e.clientX - r.left) / r.width, 0, 1);
    const i = Math.round(fx * (v.length - 1));
    const x = P.x(i), y = P.y(v[i]);
    const cx = svg.querySelector('#cx'), cd = svg.querySelector('#cdot');
    cx.setAttribute('x1', x); cx.setAttribute('x2', x); cx.setAttribute('visibility', 'visible');
    cd.setAttribute('cx', x); cd.setAttribute('cy', y); cd.setAttribute('visibility', 'visible');
    read.hidden = false;
    read.textContent = `${dates[i] ? fmtDate(dates[i], false) : ''}  ${fmtPx(s, v[i])}`;
    const px = x / w * r.width;
    read.style.left = clamp(px - read.offsetWidth / 2, 0, r.width - read.offsetWidth) + 'px';
  };
  const leave = () => { read.hidden = true; svg.querySelector('#cx').setAttribute('visibility', 'hidden'); svg.querySelector('#cdot').setAttribute('visibility', 'hidden'); };
  svg.addEventListener('pointermove', move);
  svg.addEventListener('pointerdown', move);
  svg.addEventListener('pointerleave', leave);
}
function renderOrder(){
  const id = UI.sheet, s = BY_ID[id], box = $('#orderBox'); if (!box) return;
  const P = S.pos[id];
  const side = UI.side;
  const maxQ = side === 'buy' ? maxBuy(id, false) : (P ? P.q : 0);
  const maxOd = side === 'buy' ? maxBuy(id, true) : 0;
  const q = Math.max(0, Math.floor(UI.qty) || 0);
  const o = quote(id, side, Math.max(q, 0));
  const krw = s.cur === 'KRW';
  const ct = canTrade(s);
  let err = '';
  if (!ct.ok) err = ct.why;
  else if (q < 1) err = '수량을 입력하세요.';
  else if (side === 'buy' && o.usd > S.cash + odAvail() + 1e-6) err = `주문 가능 금액(${fmtUSD(S.cash + odAvail())})을 넘었습니다.`;
  else if (side === 'sell' && (!P || q > P.q)) err = P ? `보유 수량(${P.q}주)을 넘었습니다.` : '보유하지 않은 종목입니다.';
  const odUse = side === 'buy' && !err && o.usd > S.cash ? o.usd - S.cash : 0;
  box.innerHTML = `
    ${!ct.ok ? `<div class="alert bad">${esc(ct.why)}</div>` : ''}
    <div class="seg" role="group" aria-label="주문 종류"><button data-side="buy" aria-pressed="${side === 'buy'}">매수</button><button data-side="sell" aria-pressed="${side === 'sell'}">매도</button></div>
    <div class="qty"><button data-qd="-1" aria-label="1주 줄이기">−</button><input id="qtyIn" type="number" inputmode="numeric" min="1" step="1" value="${q || ''}" aria-label="수량(주)"><button data-qd="1" aria-label="1주 늘리기">+</button></div>
    <div class="quick">${side === 'buy' ? '<button data-qf=".25">현금 25%</button><button data-qf=".5">현금 50%</button>' : '<button data-qf=".5">절반</button>'}<button data-qf="1">${side === 'buy' ? '현금 최대' : '전량'} ${maxQ.toLocaleString()}주</button>${maxOd > maxQ ? `<button data-qn="${maxOd}" title="마이너스통장 한도까지 포함">마통 포함 ${maxOd.toLocaleString()}주</button>` : ''}</div>
    <div class="bd">
      <div><span>주문 금액</span><b class="num">${fmtPx(s, o.gross)}</b></div>
      <div><span>거래 수수료 0.1%</span><b class="num">${fmtPx(s, o.fee)}</b></div>
      ${krw ? `<div><span>환전 (1달러 = ${fmtFX(FX())}원, 수수료 0.2%)</span><b class="num">${fmtUSD(o.fxFee)}</b></div>` : ''}
      <div class="tot"><span>${side === 'buy' ? '결제할 금액' : '받을 금액'}</span><b class="num">${fmtUSD(o.usd)}</b></div>
      ${side === 'buy' ? `<div><span>보유 현금</span><b class="num">${fmtUSD(S.cash)}</b></div>` : ''}
      ${odUse > 0 ? `<div><span>마이너스통장 사용</span><b class="num" style="color:var(--warn)">${fmtUSD(odUse)}</b></div>` : ''}
    </div>
    <div class="err" role="status">${ct.ok && err && q >= 1 ? esc(err) : ''}</div>
    <button class="go ${side}" id="goBtn" ${err ? 'disabled' : ''}>${!ct.ok ? '지금은 거래할 수 없습니다' : side === 'buy' ? `${q ? q.toLocaleString() + '주 ' : ''}매수하기` : `${q ? q.toLocaleString() + '주 ' : ''}매도하기`}</button>`;
  const inp = $('#qtyIn');
  inp.addEventListener('input', () => { UI.qty = parseInt(inp.value, 10) || 0; const pos = inp.selectionStart; renderOrder(); const ni = $('#qtyIn'); ni.focus(); try { ni.setSelectionRange(pos, pos); } catch(e){} });
}

/* ───────── 화면 전환 / 커밋 ───────── */
function go(tab){
  UI.tab = tab;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
  $$('[data-tab]').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  renderTab();
  window.scrollTo(0, 0);
}
function renderTab(){
  ({home:renderHome, market:renderMarket, assets:renderAssets, loans:renderLoans, info:renderInfo})[UI.tab]();
}
function commit(){
  save(); renderHeader(); renderTab();
  if (UI.sheet) renderSheet();
}
function resetGame(){
  stopAuto();
  S = newGame(S.mode); save();
  $('#modal').hidden = true; $('#modal').classList.remove('on');
  if (UI.sheet) closeSheet(); else { $('#scrim').classList.remove('on'); $('#scrim').hidden = true; }
  $$('.view').forEach(v => { delete v.dataset.built; });
  go('home'); renderHeader();
  if (isLive()) liveTick();
  toast('새 게임을 시작했습니다. 시드 $10,000');
}
function setMode(mode){
  stopAuto();
  if (S) save();
  SET.mode = mode; saveSet();
  S = load(mode);
  if (UI.sheet) closeSheet();
  $$('.view').forEach(v => { delete v.dataset.built; });
  if (mode === 'live') startLivePolling(); else stopLivePolling();
  go(UI.tab); renderHeader();
}

/* ───────── 테마 ───────── */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
function applyTheme(){
  const mode = SET.theme === 'auto' ? (mq.matches ? 'dark' : 'light') : SET.theme;
  document.documentElement.dataset.mode = mode;
  document.documentElement.dataset.conv = SET.conv;
  $('meta[name=theme-color]').setAttribute('content', mode === 'dark' ? '#0C1320' : '#ECEEF2');
}
mq.addEventListener ? mq.addEventListener('change', applyTheme) : mq.addListener(applyTheme);

/* ───────── 이벤트 ───────── */
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-open]');
  if (!t) return;
  if (t.dataset.pick) return;
  if (t.dataset.tab){ go(t.dataset.tab); return; }
  if (t.dataset.open){ openSheet(t.dataset.open); return; }
  if (t.dataset.mkt){ UI.mkt = t.dataset.mkt; renderMarket(); return; }
  if (t.classList.contains('close')){ closeSheet(); return; }
  if (t.dataset.range !== undefined){ UI.range = +t.dataset.range; renderSheet(); return; }
  if (t.dataset.side){ UI.side = t.dataset.side; UI.qty = 1; renderOrder(); return; }
  if (t.dataset.qn){ UI.qty = +t.dataset.qn; renderOrder(); return; }
  if (t.dataset.qd){ UI.qty = Math.max(1, (UI.qty || 0) + +t.dataset.qd); renderOrder(); return; }
  if (t.dataset.qf){
    const id = UI.sheet, maxQ = UI.side === 'buy' ? maxBuy(id, false) : (S.pos[id] ? S.pos[id].q : 0);
    UI.qty = Math.max(maxQ ? 1 : 0, Math.floor(maxQ * +t.dataset.qf)); renderOrder(); return;
  }
  if (t.id === 'goBtn'){
    const id = UI.sheet, s = BY_ID[id], q = UI.qty;
    if (UI.side === 'buy'){ if (doBuy(id, q)){ toast(`${s.n} ${q.toLocaleString()}주를 매수했습니다`); UI.qty = 1; commit(); } }
    else { const r = doSell(id, q); if (r){ toast(`${s.n} ${q.toLocaleString()}주를 매도했습니다 (${fmtUSD(r)})`); UI.qty = 1; if (!S.pos[id]) UI.side = 'buy'; commit(); } }
    return;
  }
  if (t.dataset.borrow){ const k = t.dataset.borrow; borrow(k, parseFloat($('#amt-' + k).value)); return; }
  if (t.dataset.repay){ const k = t.dataset.repay; repay(k, parseFloat($('#amt-' + k).value)); return; }
  if (t.dataset.repayall){
    const k = t.dataset.repayall, b = S.loans[k].bal;
    if (S.cash + 1e-6 < b) toast(`현금이 ${fmtUSD(b - S.cash)} 부족해 가진 현금만큼만 갚습니다`, true);
    repay(k, b); return;
  }
  if (t.dataset.setmode){ if (t.dataset.setmode !== S.mode){ setMode(t.dataset.setmode); toast(t.dataset.setmode === 'live' ? '실제 시세 모드로 바꿨습니다' : '시뮬레이션 모드로 바꿨습니다'); } return; }
  if (t.dataset.conv){ SET.conv = t.dataset.conv; saveSet(); applyTheme(); renderTab(); return; }
  if (t.dataset.theme){ SET.theme = t.dataset.theme; saveSet(); applyTheme(); renderTab(); return; }
  if (t.dataset.speed !== undefined){ SET.speed = +t.dataset.speed; saveSet(); if (UI.auto) startAuto(); renderTab(); return; }
  if (t.id === 'btnRefresh' || t.id === 'btnRefresh2'){ loadLive(false).then(() => { if (LIVE.ok) toast('시세를 새로 받았습니다'); }); return; }
  if (t.id === 'btnReset'){ confirmBox('새 게임을 시작할까요?', `${isLive() ? '실제 시세' : '시뮬레이션'} 모드의 거래, 대출, 기록이 모두 지워지고 시드 $10,000로 다시 시작합니다. 다른 모드의 기록은 그대로입니다.`, '새 게임 시작', resetGame); return; }
});
$('#btnNext').addEventListener('click', () => { if (S.over) return; step(); });
$('#btnAuto').addEventListener('click', () => { if (UI.auto) stopAuto(); else if (!S.over) startAuto(); });
$('#scrim').addEventListener('click', () => { if (!$('#modal').hidden) return; closeSheet(); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape'){
    const md = $('#modal');
    if (!md.hidden){ if (!md.dataset.locked){ const c = $('#modal [data-close]'); c && c.click(); } }
    else if (UI.sheet) closeSheet();
  }
  if (e.key === 'n' && !isLive() && !e.target.closest('input') && !UI.sheet && $('#modal').hidden && !S.over) step();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save();
  else if (isLive()) loadLive(true);
});
/* 실제 시세 모드: 1분마다 헤더의 시장 상태와 경과 시간을 다시 그린다 */
setInterval(() => { if (isLive() && !document.hidden){ renderHeader(); if (UI.tab === 'home') renderHome(); } }, 30000);

/* ───────── 시작 ───────── */
applyTheme();
if (SET.mode === 'live' || SET.mode === 'sim'){
  S = load(SET.mode);
  go('home'); renderHeader();
  if (SET.mode === 'live') startLivePolling();
} else {
  S = load('sim');
  go('home'); renderHeader();
  showModePicker(true);
}
