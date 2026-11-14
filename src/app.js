'use strict';
/* =========================================================
   SEED 10K — 한·미 시가총액 상위 300 모의투자
   두 가지 모드: 실제 시세(live) / 시뮬레이션(sim)
   ========================================================= */
const VERSION = '2.3.9';
const SAVE_KEYS = {sim:'seed10k.save.v1', live:'seed10k.live.v1'};
const SET_KEY = 'seed10k.settings.v1';
const LIVE_URL = 'data/prices.json';
const LIVE_POLL_MS = 60000;
const HOT_POLL_MS = 7000;    // 장중에 예약·열린 종목의 현재가만 따로 읽는 간격 (서버가 7초마다 네이버에서 받는다)
/* 계정 서버 (MAGI와 같은 Supabase 프로젝트). 공개용 키이며, 데이터는 표의 행 수준 보안(RLS) 정책이 지킨다. */
const SB_URL = 'https://ictjkqbbcaigdvlysdaw.supabase.co';
const SB_KEY = 'sb_publishable_C7jZEKJn_nF2Y3Ngq5f80Q_RA5Wrfux';
const GUEST_KEY = 'seed10k.guest';

const META = {
  baseDate: '2026-10-23',      // 기준가: 2026-10-23(금) 종가
  fx0: 1324.6,                 // 10/26 15:30 1,323.10원(전일 대비 -1.5원)에서 역산한 10/23 원/달러
  seed: 10000,
  feeRate: 0.001,              // 거래 수수료 0.1% (게임 설정)
  baseRate0: 3.0,              // 게임 기준금리 (%)
  krLimit: 0.30,               // 한국 가격제한폭 ±30% (시뮬레이션)
  creditTerm: 60,              // 신용대출 만기 (시뮬레이션: 거래일, 실제 시세: 일)
  loanFee: 0.03,               // 빌릴 때마다 빌린 금액의 3%를 빚에 더한다 (모든 대출, 마이너스통장 포함)
  gradeHold: 7,
  divTax: {KRW:0.154, USD:0.15},  // 배당 세금: 한국 배당소득세 14% + 지방소득세 1.4%, 미국 원천징수 15%(한미 조세조약)                // 신용대출을 이 기간(일/거래일) 이상 쓰고 갚아야 신용등급이 오른다
  ltv: 0.5,                    // 주식담보대출 담보인정비율
  marginWarn: 1.4, marginCall: 1.2, marginRestore: 1.6,
  sellHaircut: 0.02            // 반대매매 체결가 할인
};

/* 정규장 (현지 시각, 분 단위) */
const SESS = {
  KR:{tz:'Asia/Seoul', o:9*60, c:15*60+30, ko:'한국'},
  US:{tz:'America/New_York', o:9*60+30, c:16*60, ko:'미국'}
};
/* 정규장 시간이 평소와 다른 날 (현지 날짜 → 바뀐 개장 o, 마감 c, 현지 자정부터 분). 시세 함수(index.ts)의 SPECIAL_SESS와 같게 유지한다.
   - 미국 2026-11-27(추수감사절 다음 날), 2026-12-24: 13:00 조기 마감 (NYSE 공지)
   - 한국 2026-11-19(2027학년도 수능): 10:00~16:30. 아직 거래소 공지 전이라 예년(2025-11-13 수능일 10:00~16:30)을 따랐다
   - 한국 2027-01-04(새해 첫 거래일): 10:00 개장. 예년(2026-01-02 10:00 개장, 마감은 그대로)을 따랐다 */
const SPECIAL_SESS = {
  KR:{'2026-11-19':{o:10*60, c:16*60+30}, '2027-01-04':{o:10*60}},
  US:{'2026-11-27':{c:13*60}, '2026-12-24':{c:13*60}}
};
const sessOf = (m, date) => ({...SESS[m], ...((SPECIAL_SESS[m] || {})[date] || {})});

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
  game:{ko:'게임',vol:.40,beta:.90,h:290}, robot:{ko:'로봇',vol:.70,beta:1.40,h:268},
  etf:{ko:'ETF',vol:.18,beta:1.00,h:205}
};
const MKT_VOL = {KR:.18, US:.16};
const SIM_KEEP = 300;   // 시뮬레이션에서 종목별로 남기는 거래일 수 (첫날 기준가 + 최근 거래일). 600종목이라 저장 크기 때문에 300으로 둔다
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
/* 금액 표시. 설정의 '표시 통화'(SET.disp)에 따라 바꿔 보여 준다:
   real: 원래 통화 그대로 (한국 주식·원화 통장은 원, 나머지는 달러)
   usd: 모두 달러로 (원 ÷ 매매기준율 X)
   krw: 모두 원화로 (달러 × 매매기준율 X)
   환산에는 지금 매매기준율을 쓴다. 이름 끝 n(fmtUSDn, fmtKRWn, fmtPxN)은 설정과 상관없이 원래 통화로 쓴다
   (주문 조건 가격, 환전 화면, 통장처럼 실제 통화가 중요한 곳) */
// 테스트 계정의 돈은 사실상 무한(1천조): 1백조가 넘는 금액은 ∞로 보여 준다 (테스트 계정에서만)
const bsInf = v => { try { return !!ACC.tester && Math.abs(v) >= 1e14; } catch(e){ return false; } };   // ACC가 아직 없을 때(초기화 전)는 보통대로
function fmtUSDn(v, d = 2){ if (bsInf(v)) return (v < 0 ? MINUS : '') + '$∞'; const s = Math.abs(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}); return (v < 0 ? MINUS : '') + '$' + s; }
function fmtKRWn(v){ if (bsInf(v)) return (v < 0 ? MINUS : '') + '∞원'; return (v < 0 ? MINUS : '') + Math.round(Math.abs(v)).toLocaleString('ko-KR') + '원'; }
const dispMode = () => { try { return SET.disp || 'real'; } catch(e){ return 'real'; } };   // SET이 만들어지기 전이면 실제 통화
const fxNow = () => { try { const x = FX(); return x > 0 ? x : 1; } catch(e){ return 1; } };
function fmtUSD(v, d = 2){ return dispMode() === 'krw' ? fmtKRWn(v * fxNow()) : fmtUSDn(v, d); }
function fmtKRW(v){ return dispMode() === 'usd' ? fmtUSDn(v / fxNow()) : fmtKRWn(v); }
function fmtPx(s, p){ return s.cur === 'KRW' ? fmtKRW(p) : fmtUSD(p); }
function fmtPxN(s, p){ return s.cur === 'KRW' ? fmtKRWn(p) : fmtUSDn(p); }
/* 종목 통화 cur의 값 v를 표시 통화로: {v, cur} */
function toDisp(cur, v){
  const m = dispMode();
  if (m === 'usd' && cur === 'KRW') return {v:v / fxNow(), cur:'USD'};
  if (m === 'krw' && cur === 'USD') return {v:v * fxNow(), cur:'KRW'};
  return {v, cur};
}
function fmtPct(v, d = 2){ if (v === Infinity) return '∞%'; if (v === -Infinity) return MINUS + '∞%'; if (!isFinite(v)) return '0.00%'; const s = Math.abs(v * 100).toFixed(d) + '%'; return (v > 0.000005 ? '+' : v < -0.000005 ? MINUS : '') + s; }
function signUSD(v){ return (v > 0.004 ? '+' : '') + fmtUSD(v); }
function cls(v){ return v > 0.000005 ? 'up' : v < -0.000005 ? 'down' : 'flat'; }
function fmtCapKRW(krw){
  const jo = krw / 1e12;
  return jo >= 1 ? jo.toLocaleString('ko-KR',{maximumFractionDigits:1}) + '조원' : Math.round(krw/1e8).toLocaleString('ko-KR') + '억원';
}
function fmtCapUSD(usd){ return usd >= 1e12 ? '$' + (usd/1e12).toFixed(2) + 'T' : '$' + (usd/1e9).toFixed(1) + 'B'; }
function fmtCap(s){ const d = toDisp(s.cur, capNative(s)); return d.cur === 'KRW' ? fmtCapKRW(d.v) : fmtCapUSD(d.v); }
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
/* ── 정기 서버 점검: 매월 1일 16:55 ~ 17:05 (한국 시각) 접속 차단 ──
   이 기기 시계를 한국 시각으로 바꿔 판단한다. 열려 있던 화면도 그 시각이 되면 저장을 마치고 막고, 끝나면 새로 고친다 */
const MAINT_MSG = '매월 1일  16시 55분부터 17시 5분까지는 정기 서버 점검 시간입니다. 나중에 다시 방문해주세요';
function inMaint(d = now()){ const p = zoneParts('Asia/Seoul', d), hm = p.h * 60 + p.mi; return +p.date.slice(8, 10) === 1 && hm >= 16 * 60 + 55 && hm < 17 * 60 + 5; }
function maintShow(){
  if (document.getElementById('maint')) return;
  const el = document.createElement('div'); el.id = 'maint'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-live', 'assertive');
  el.innerHTML = `<div class="maint-box"><div class="maint-ic" aria-hidden="true">🛠️</div><h1>정기 서버 점검 중</h1><p>${MAINT_MSG}</p></div>`;
  document.body.appendChild(el); document.documentElement.classList.add('maint-on');
}
function maintTick(){
  if (inMaint()){
    if (!document.getElementById('maint')){
      try { if (typeof S !== 'undefined' && S && S.dirty && ACC.user) pushCloud(); } catch(e){}
      maintShow();
    }
  } else if (document.getElementById('maint')) location.reload();
}
function kstTime(d){ const p = zoneParts('Asia/Seoul', d); return `${String(p.h).padStart(2,'0')}:${String(p.mi).padStart(2,'0')}`; }
/* 현지 정규장 시각을 한국 시각 문자열로 (오늘 기준, 서머타임 반영) */
function sessInKST(m){
  const ref = now();
  // 현지 날짜의 o/c 분을 UTC로 바꾸기 위해 현지-UTC 차이를 구한다
  const p = zoneParts(SESS[m].tz, ref), z = sessOf(m, p.date);
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
let SET = Object.assign({conv:'kr', theme:'auto', speed:1, mode:null, krd:'krw'}, safeParse(localStorage.getItem(SET_KEY)));
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
    v:1, mode, usd:META.seed, krw:0, pos:{}, realized:0, interestPaid:0, feesPaid:0, fxFees:0, fxLog:[], orders:[], pts:0, twr:{f:1, b:META.seed}, mg:null,
    loans:{ credit:{bal:0, due:null, overdue:0, clean:true}, margin:{bal:0}, od:{bal:0} },
    grade:4, base:META.baseRate0, trades:[], news:[], warnedDay:-1, over:false, peak:META.seed, started:Date.now()
  };
  if (mode === 'live'){
    const t = kstDate();
    return {...base, nw:[META.seed], nwP:[0], nwD:[t], lastAcc:t, accDays:0, pend:{credit:false, margin:false}, warnedDate:null, liqDate:{}};
  }
  const px = {};
  STOCKS.forEach(s => { px[s.id] = [s.p]; });
  return {...base, day:0, date:META.baseDate, fx:META.fx0, fxH:[META.fx0], px, regime:{KR:1, US:1},
          nw:[META.seed], nwP:[0], idx:{KR:[1000], US:[1000]}, dates:[META.baseDate], rng:(Math.random() * 2**31) | 0};
}
function accKey(mode){ return ACC.user ? `seed10k.u.${ACC.user.id}.${mode}` : SAVE_KEYS[mode]; }
function migrate(s){
  if (s && !Array.isArray(s.orders)) s.orders = [];
  if (s && s.px && typeof s.px === 'object'){
    const L = Math.max(1, ...Object.values(s.px).map(a => Array.isArray(a) ? a.length : 0));
    for (const st of STOCKS) if (!Array.isArray(s.px[st.id])) s.px[st.id] = Array(L).fill(st.p);
  }
  if (s && typeof s.pts !== 'number') s.pts = 0;
  if (s && !(s.twr && isFinite(s.twr.f) && isFinite(s.twr.b))) s.twr = {f:1, b:META.seed};   // 포인트가 없던 기록: 수익률 = N/시드 − 1과 같다
  if (s && Array.isArray(s.nw) && !(Array.isArray(s.nwP) && s.nwP.length === s.nw.length)) s.nwP = s.nw.map(() => 0);
  if (s && s.cash !== undefined && s.usd === undefined){
    s.usd = s.cash; s.krw = 0; delete s.cash;
    const fx = s.fx || META.fx0;
    for (const id in s.pos || {}) if (id.startsWith('KR:')) s.pos[id].cost *= fx;   // 원화 기준 매입 금액으로
    s.fxFees = 0; s.fxLog = [];
  }
  return s;
}
function validSave(s, mode){
  s = migrate(s);
  if (mode === 'sim' && s && s.v === 1 && s.px && STOCKS.every(x => s.px[x.id])){ s.mode = 'sim'; return s; }
  if (mode === 'live' && s && s.v === 1 && s.mode === 'live' && s.nwD) return s;
  return null;
}
function hasProgress(s){ return s && (s.trades.length > 0 || (s.pts || 0) > 0 || (s.mode === 'sim' && s.day > 0) || s.loans.credit.bal > 0 || s.loans.margin.bal > 0); }
/* 저장 규칙
   - S._ph: 모드를 고르기 전에 화면을 채우려고 만든 임시 게임. 어디에도 저장하지 않는다.
   - S.syncBase: 이 기록이 이어받은 서버 기록의 표지(무작위 문자열). 서버에 올릴 때마다 새 표지를 붙인다.
   - S.dirty: 서버에 아직 올리지 않은 변경이 있는지. */
function writeLocal(){
  if (!S || S._ph) return;
  lsSet(accKey(S.mode), JSON.stringify(S));
}
/* ── 이 기기 저장 공간 (localStorage, 한도는 브라우저마다 다름) ──
   계정을 여러 개 쓰면 계정마다 기록이 쌓여(특히 시뮬레이션 가격 기록) 공간이 차고, 그러면 로그인 정보(Supabase 세션)조차
   못 써서 "로그인 만료"·로그인 안 됨이 생긴다. 쓰다가 공간이 모자라면, 지금 계정이 아닌 계정의 기록 중 서버에 다 올라간 것부터
   (큰 것부터) 이 기기에서 지우고 다시 쓴다. 지운 기록은 그 계정으로 바꿀 때 서버에서 다시 받는다 */
const lsUsed = () => { let n = 0; try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); n += k.length + (localStorage.getItem(k) || '').length; } } catch(e){} return n * 2; };   // 바이트 (UTF-16)
function lsPrune(keep){
  const cur = ACC.user ? `seed10k.u.${ACC.user.id}.` : null, c = [];
  try {
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i), v = localStorage.getItem(k) || '';
      if (k === keep || (cur && k.startsWith(cur))) continue;
      if (k === 'seed10k.divs') c.push([k, v.length, 0]);                                   // 배당 캐시: 서버에서 다시 받는다
      else if (/^seed10k\.u\./.test(k)){ let d = true; try { d = !!JSON.parse(v).dirty; } catch(e){} if (!d) c.push([k, v.length, 1]); }   // 서버에 다 올라간 다른 계정 기록
    }
  } catch(e){}
  c.sort((x, y) => x[2] - y[2] || y[1] - x[1]);
  return c.map(x => { try { localStorage.removeItem(x[0]); } catch(e){} return x[0]; });
}
function lsSet(k, v){
  try { localStorage.setItem(k, v); return true; } catch(e){}
  const gone = lsPrune(k);
  try { localStorage.setItem(k, v); if (gone.length) console.warn('[seed10k] 저장 공간이 모자라 이 기기에서 지운 기록', gone); return true; }
  catch(e){
    if (!ACC.spaceWarned){ ACC.spaceWarned = true; toast('이 기기 저장 공간이 가득 차 기록을 저장하지 못했습니다. 규칙·설정에서 저장 공간을 확인하세요', true); }
    return false;
  }
}
// Supabase 로그인 정보도 같은 방식으로 쓴다 (공간이 모자라면 정리하고 다시)
const SB_STORE = {getItem:k => { try { return localStorage.getItem(k); } catch(e){ return null; } }, setItem:(k, v) => { lsSet(k, v); }, removeItem:k => { try { localStorage.removeItem(k); } catch(e){} }};
// 테스트 계정 (서버 seed10k_testers 표가 정한다): 돈이 줄지 않게 채우고 랭킹에 올리지 않는다
const TEST_USD = 1e15, TEST_KRW = 1e15;   // 사실상 무한: 저장할 때마다 다시 채운다 (Infinity는 JSON에 저장되지 않아 큰 수를 쓴다)
function testerFill(){ if (!ACC.tester || !S || S._ph) return; if (!(S.usd >= TEST_USD)) S.usd = TEST_USD; if (!(S.krw >= TEST_KRW)) S.krw = TEST_KRW; }
async function testerCheck(){
  ACC.tester = false; ACC.rankBan = null;
  if (ACC.user && ACC.sb){
    try { const {data} = await ACC.sb.from('seed10k_testers').select('user_id').eq('user_id', ACC.user.id).maybeSingle(); ACC.tester = !!data; } catch(e){}
    try { const {data, error} = await ACC.sb.from('seed10k_rank_bans').select('at,reason').eq('user_id', ACC.user.id).maybeSingle(); if (!error) ACC.rankBan = data || null; } catch(e){}
  }
  if (ACC.tester){
    try { await ACC.sb.from('seed10k_ranks').delete().eq('user_id', ACC.user.id); } catch(e){}   // 예전에 올라간 랭킹 줄도 지운다
    testerFill(); commit();
  }
  whoUpdate();
  if ($('#mpCard')) $('#mpCard').innerHTML = mpCardHTML();
}
function save(){
  if (!S || S._ph) return;
  testerFill();
  S.savedAt = Date.now();
  S.dirty = true; ACC.ver++;
  writeLocal();
  if (ACC.user) scheduleCloud();
}
function load(mode){ return validSave(safeParse(localStorage.getItem(accKey(mode))), mode) || newGame(mode); }
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
  const p = zoneParts(SESS[m].tz), z = sessOf(m, p.date);
  const mins = p.h * 60 + p.mi, wk = p.wd !== 'Sat' && p.wd !== 'Sun';
  if (!wk) return {k:'closed', label:'주말 휴장', open:false};
  if (mins < z.o) return {k:'pre', label:'개장 전', open:false};
  if (mins >= z.c) return isLive() && !closeSettled(m, p.date, mins) ? {k:'settle', label:'마감 집계 중', open:false} : {k:'closed', label:'장 마감', open:false};
  if (!LIVE.ok) return {k:'wait', label:'시세 없음', open:false};
  if (last(LIVE.dates[m]) !== p.date) return {k:'wait', label: mins - z.o > 75 ? '휴장일 추정' : '시세 대기', open:false};
  return {k:'open', label:'장중', open:true};
}
/* 장이 끝난 뒤 그날 시세(차트)가 다 들어왔는가. 다 들어오기 전까지는 '마감 집계 중':
   바로 주문은 막고, 장중에 걸어 둔 예약 주문은 늦게 들어온 장중 가격으로 체결될 수 있다.
   - 한국: 시세 함수가 마감 전 구간을 네이버 분봉으로 다 채운 뒤 남기는 _closeKR 표시(그날 날짜)가 오면. 안 와도 마감 90분 뒤(보통 17:00)에는 끝낸다.
   - 미국: 시세 함수가 마감 20분 뒤(보통 뉴욕 16:20)까지 받으므로 그때 끝낸다.
   - 그날 시세가 없는 날(휴장일)은 바로 끝낸다. */
const SETTLE = {KR:{mark:'_closeKR', after:90}, US:{mark:null, after:20}};   // after: 마감 뒤 이 분이 지나면 표시가 없어도 끝낸다
function closeSettled(m, date, mins){
  const c = SETTLE[m];
  if (mins >= sessOf(m, date).c + c.after || last(LIVE.dates[m] || []) !== date) return true;
  return !!(c.mark && (QT.rows || []).some(r => r.id === c.mark && r.d === date));
}
/* 시간대 tz의 날짜 date(YYYY-MM-DD) 자정에서 mins분 지난 순간의 유닉스 밀리초 (서머타임 반영) */
function zoneTs(tz, date, mins){
  const want = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), 0, mins);
  let t = want;
  for (let k = 0; k < 2; k++){
    const p = zoneParts(tz, new Date(t));
    t += want - Date.UTC(+p.date.slice(0, 4), +p.date.slice(5, 7) - 1, +p.date.slice(8, 10), p.h, p.mi);
  }
  return t;
}
function canTrade(s, side){
  if (S.over) return {ok:false, why:'파산해서 거래할 수 없습니다.'};
  if (s.hide && side === 'buy') return {ok:false, why:'목록에서 빠진 종목이라 새로 살 수 없습니다. 가진 주식은 팔 수 있습니다.'};
  if (!isLive()) return {ok:true};
  if (LIVE.miss.has(s.id)) return {ok:false, why:'이 종목은 실제 시세를 받지 못해 거래할 수 없습니다.'};
  const st = mstate(s.m);
  if (st.open) return {ok:true};
  const hours = `정규장(한국 시각 ${sessInKST(s.m)})`;
  const why = st.k === 'wait'
    ? (st.label === '시세 없음' ? '시세 파일을 아직 받지 못했습니다.' : `${SESS[s.m].ko} 시장의 오늘 시세가 아직 들어오지 않았습니다. 장이 열리고 첫 체결 시세가 들어오면(보통 1분 안) 거래할 수 있습니다. 휴장일이면 오늘은 거래할 수 없습니다.`)
    : `${SESS[s.m].ko} 시장은 지금 ${st.label} 상태입니다. ${hours}에 거래할 수 있습니다. 장이 닫혀 있을 때는 예약 주문을 걸어 둘 수 있습니다.`;
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
const cashUSD = () => S.usd + S.krw / FX();
const netWorth = () => cashUSD() + holdingsUSD() + altUSD() - debt();   // altUSD: 채권·주택 (inv.js)
function capUSD(s){ const r = price(s.id) / basePrice(s); return s.cur === 'KRW' ? s.mc * r / FX() : s.mc * r; }
function capNative(s){ return s.mc * price(s.id) / basePrice(s); }
function g(){ return clamp(Math.round(S.grade), 1, 10); }
/* 신용등급 색: 1등급 초록(색상 120°) → 노랑(60°) → 10등급 빨강(0°). 등급 사이는 연속으로 바뀐다 */
function gradeColor(gr){
  const t = (clamp(gr, 1, 10) - 1) / 9, dark = document.documentElement.dataset.mode === 'dark';
  return `hsl(${Math.round(120 * (1 - t))} ${dark ? 70 : 75}% ${dark ? 55 : 38}%)`;
}
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
    // 빌릴 수 있는 금액 A: 빚이 A × (1 + 수수료)만큼 늘어도 상한을 넘지 않게
    credit: Math.max(0, (Math.min(30000, N * k) - S.loans.credit.bal) / (1 + META.loanFee)),
    margin: Math.max(0, (V * META.ltv - S.loans.margin.bal) / (1 + META.loanFee)),
    odLimit: Math.max(1000, 6000 - 500*(g()-1))
  };
}
const odAvail = () => Math.max(0, (limits().odLimit - S.loans.od.bal) / (1 + META.loanFee));
const marginRatio = () => S.loans.margin.bal > 0 ? holdingsUSD() / S.loans.margin.bal : Infinity;

/* ───────── 통장·환전 ───────── */
/* 달러 통장(S.usd)과 원화 통장(S.krw)을 따로 둔다. 한국 주식은 원화로만, 미국 주식과 대출은 달러로만 오간다.
   환율: 매매기준율 X 에 스프레드 s(1%)를 붙이되, 신용등급에 따른 우대율 p 만큼 깎아 준다. */
const FX_SPREAD = 0.01;
function fxPref(){ return clamp(0.9 - 0.1 * (g() - 1), 0, 0.9); }
function fxFeeRate(){ return FX_SPREAD * (1 - fxPref()); }
function fxRates(){ const X = FX(), f = fxFeeRate(); return {base:X, f, buy:X * (1 + f), sell:X * (1 - f)}; }   // buy: 달러 살 때, sell: 달러 팔 때
function exQuote(dir, amt){
  const r = fxRates();
  if (dir === 'u2k'){ const to = Math.floor(amt * r.sell); return {dir, from:amt, to, rate:r.sell, feeUSD:amt - to / r.base, r}; }
  const to = Math.floor(amt / r.buy * 100) / 100;
  return {dir, from:amt, to, rate:r.buy, feeUSD:amt / r.base - to, r};
}
function spendUSD(x){ if (ACC.tester) return 0;   // 테스트 계정: 무엇을 사든 돈이 줄지 않는다 (0원 처리)
  if (x <= S.usd + 1e-9){ S.usd -= x; return 0; } const od = x - S.usd; S.usd = 0; addLoan('od', od); return od; }
/* 대출 kind에 amt를 빌린다: 빚은 amt × (1 + 수수료)만큼 늘고, 수수료는 낸 이자로 센다 */
function addLoan(kind, amt){ const fee = amt * META.loanFee; S.loans[kind].bal += amt + fee; S.interestPaid += fee; return fee; }
function receiveUSD(x){ if (S.loans.od.bal > 0){ const r = Math.min(x, S.loans.od.bal); S.loans.od.bal -= r; x -= r; } S.usd += x; }
/* noRepay: 원화 → 달러로 받은 달러를 마이너스통장 상환에 먼저 쓰지 않고 그대로 통장에 넣는다 (바로 주식 살 돈으로 쓸 때) */
function exchange(dir, amt, silent, noRepay){
  if (S.over) return toast('파산해서 환전할 수 없습니다', true);
  amt = dir === 'u2k' ? Math.floor(amt * 100 + 1e-6) / 100 : Math.floor(amt + 1e-9);   // 1.13 × 100 = 112.999… 같은 부동소수 오차로 1센트가 깎이지 않게
  if (!(amt > 0)) return toast('금액을 입력하세요', true);
  const q = exQuote(dir, amt);
  if (dir === 'u2k'){
    if (amt > S.usd + odAvail() + 1e-6) return toast(`달러가 부족합니다 (쓸 수 있는 달러 ${fmtUSD(S.usd + odAvail())})`, true);
    const od = spendUSD(amt);
    S.krw += q.to;
    if (od > 0 && !silent) toast(`마이너스통장에서 ${fmtUSD(od)}을 끌어 썼습니다`);
  } else {
    if (amt > S.krw) return toast(`원화가 부족합니다 (원화 통장 ${fmtKRW(S.krw)})`, true);
    S.krw -= amt;
    if (noRepay) S.usd += q.to; else receiveUSD(q.to);
  }
  S.feesPaid += q.feeUSD; S.fxFees = (S.fxFees || 0) + q.feeUSD;
  (S.fxLog = S.fxLog || []).unshift({dt:tradeDateLabel(), at:Date.now(), dir, from:q.from, to:q.to, rate:q.rate});
  if (S.fxLog.length > 200) S.fxLog.length = 200;
  if (!silent) toast(dir === 'u2k' ? `${fmtUSD(q.from)}를 ${fmtKRW(q.to)}으로 바꿨습니다` : `${fmtKRW(q.from)}을 ${fmtUSD(q.to)}로 바꿨습니다`);
  return q;
}
/* 원화가 need 만큼 더 필요할 때, 달러를 팔아 채운다 */
function usdForKRW(need){ return Math.ceil(need / fxRates().sell * 100) / 100 + 0.01; }
/* 달러가 need 만큼 필요할 때 원화 통장에서 자동으로 바꿔 채운다 (대출 만기·반대매매용). 채운 달러를 돌려준다 */
function coverUSDfromKRW(need){
  if (!(need > 0) || S.krw <= 0) return 0;
  const r = fxRates();
  const krw = Math.min(S.krw, Math.ceil(need * r.buy) + 1);
  const q = exchange('k2u', krw, true);
  return q ? q.to : 0;
}

/* ───────── 주문 ───────── */
function quote(id, side, q, px){
  const s = BY_ID[id], p = px ?? price(id);
  const gross = p * q, fee = s.cur === 'KRW' ? Math.round(gross * META.feeRate) : Math.round(gross * META.feeRate * 100) / 100;
  const total = side === 'buy' ? gross + fee : gross - fee;
  return {gross, fee, total, p, cur:s.cur};
}
const walletOf = s => s.cur === 'KRW' ? S.krw : S.usd;
function maxBuy(id, withOd = true){
  const s = BY_ID[id], one = quote(id, 'buy', 1).total;
  const avail = s.cur === 'KRW' ? S.krw : S.usd + (withOd ? odAvail() : 0);
  return Math.max(0, Math.floor(avail / one + 1e-9));
}
/* 매수 자금 계획 (q주, 체결 가격 px): 그 종목 통화 통장 → 모자라면 다른 통화 통장을 바꿔 채움 → 그래도 모자라면 마이너스통장.
   반환(달러 금액은 USD, 원화 금액은 KRW):
   o: 주문 견적, own: 그 종목 통화 통장에서 쓰는 금액(종목 통화), fxFrom: 바꿀 다른 통화 금액, fxTo: 바꿔서 받는 종목 통화 금액,
   od: 마이너스통장으로 빌리는 달러, ok: 마이너스통장 한도 안인가 */
function buyPlan(id, q, px){
  const s = BY_ID[id], o = quote(id, 'buy', q, px);
  let own, fxFrom = 0, fxTo = 0, od = 0;
  if (s.cur === 'KRW'){
    own = Math.min(S.krw, o.total);
    const need = o.total - own;
    if (need > 0){ fxFrom = usdForKRW(need); fxTo = exQuote('u2k', fxFrom).to; od = Math.max(0, fxFrom - S.usd); }
  } else {
    own = Math.min(S.usd, o.total);
    const need = o.total - own;
    if (need > 1e-9 && S.krw >= 1){
      const A = fxFromForTarget('k2u', need);
      fxFrom = Math.min(A, Math.floor(S.krw)); fxTo = exQuote('k2u', fxFrom).to;
    }
    od = Math.max(0, need - fxTo);
  }
  if (od < 0.005) od = 0;   // 1센트 미만 부동소수 찌꺼기
  return {o, own, fxFrom, fxTo, od, ok:od <= odAvail() + 1e-6};
}
/* 마이너스통장 없이(두 통화 통장을 서로 바꿔 써서) 살 수 있는 최대 수량 */
function maxBuyAuto(id){
  const s = BY_ID[id], one = quote(id, 'buy', 1).total, r = fxRates();
  const funds = s.cur === 'KRW' ? S.krw + Math.max(0, S.usd - 0.02) * r.sell : S.usd + S.krw / r.buy;
  let q = Math.max(0, Math.floor(funds / one + 1e-9));
  while (q > 0 && buyPlan(id, q).od > 1e-9) q--;
  return q;
}
/* 한국 주식: 원화가 모자라면 달러를 바꿔서 살 수 있는 최대 수량 */
function maxBuyWithFX(id){
  const s = BY_ID[id]; if (s.cur !== 'KRW') return maxBuy(id, true);
  const one = quote(id, 'buy', 1).total;
  const krw = S.krw + Math.max(0, S.usd + odAvail() - 0.02) * fxRates().sell;
  return Math.max(0, Math.floor(krw / one + 1e-9));
}
function tradeDateLabel(){ return isLive() ? kstDate() : S.date; }
/* 예약 주문이 체결된 시각의 날짜 (실제 시세 모드는 그 시각의 한국 날짜) */
function fillDate(fill){ return fill && isLive() ? zoneParts('Asia/Seoul', new Date(fill.at)).date : tradeDateLabel(); }
function doBuy(id, q, tag, autoFX, fill){
  const s = BY_ID[id];
  if (fill){ if (S.over) return false; }
  else {
    const ct = canTrade(s, 'buy');
    if (!ct.ok) return toast(ct.why, true);
  }
  q = Math.floor(q);
  if (q < 1) return toast('수량을 1주 이상 입력하세요', true);
  const o = quote(id, 'buy', q, fill && fill.p);
  let useOd = 0;
  if (s.cur === 'KRW'){
    if (o.total > S.krw){
      if (!autoFX) return toast(`원화 통장 잔액이 ${fmtKRW(o.total - S.krw)} 부족합니다. 먼저 환전하세요`, true);
      const usd = usdForKRW(o.total - S.krw);
      if (usd > S.usd + odAvail() + 1e-6) return toast('환전할 달러가 부족합니다', true);
      const x = exchange('u2k', usd, true); if (!x) return false;
      toast(`${fmtUSDn(x.from)}를 ${fmtKRWn(x.to)}으로 환전했습니다`);
    }
    if (!ACC.tester) S.krw -= o.total;   // 테스트 계정은 0원 처리
  } else {
    // 달러가 모자라면 원화를 먼저 바꿔 채우고(마이너스통장 상환에 쓰지 않음), 그래도 모자란 만큼만 마이너스통장
    if (o.total > S.usd + 1e-9 && autoFX && S.krw >= 1){
      const pl = buyPlan(id, q, fill && fill.p);
      if (!pl.ok) return toast('주문 가능 금액이 부족합니다', true);
      if (pl.fxFrom > 0){ const x = exchange('k2u', pl.fxFrom, true, true); if (!x) return false; toast(`${fmtKRWn(x.from)}을 ${fmtUSDn(x.to)}로 환전했습니다`); }
    }
    if (o.total > S.usd + odAvail() + 1e-6) return toast('주문 가능 금액이 부족합니다', true);
    useOd = spendUSD(o.total);
  }
  const P = S.pos[id] || (S.pos[id] = {q:0, avg:0, cost:0});
  P.avg = (P.avg * P.q + o.p * q) / (P.q + q);
  P.q += q; P.cost += o.total;
  S.feesPaid += toUSD(s, o.fee);
  S.trades.unshift({d:S.day || 0, dt:fillDate(fill), at:fill ? fill.at : Date.now(), id, side:'buy', q, p:o.p, amt:o.total, cur:s.cur, tag:tag||''});
  trimLog();
  if (useOd > 0) toast(`마이너스통장에서 ${fmtUSD(useOd)}을 끌어 썼습니다`);
  return true;
}
/* 매도대금은 그 나라 통화 통장으로 들어간다. tag(반대매매)가 있으면 입금하지 않고 금액만 돌려준다 */
function doSell(id, q, tag, haircut = 0, fill = null){
  const s = BY_ID[id], P = S.pos[id];
  if (!P || P.q < 1) return false;
  if (fill){ if (S.over) return false; }
  else if (!tag){ const ct = canTrade(s, 'sell'); if (!ct.ok) return toast(ct.why, true); }
  q = Math.min(Math.floor(q), P.q);
  if (q < 1) return toast('수량을 1주 이상 입력하세요', true);
  const o = quote(id, 'sell', q, fill && fill.p);
  const proceeds = s.cur === 'KRW' ? Math.floor(o.total * (1 - haircut)) : Math.round(o.total * (1 - haircut) * 100) / 100;
  const costPart = P.cost * (q / P.q);
  S.realized += toUSD(s, proceeds - costPart);
  P.cost -= costPart; P.q -= q;
  if (P.q === 0) delete S.pos[id];
  S.feesPaid += toUSD(s, o.fee);
  S.trades.unshift({d:S.day || 0, dt:fillDate(fill), at:fill ? fill.at : Date.now(), id, side:'sell', q, p:o.p*(1-haircut), amt:proceeds, cur:s.cur, tag:tag||''});
  trimLog();
  if (tag && !fill) return proceeds;   // 반대매매: 입금하지 않고 금액만 돌려준다
  if (s.cur === 'KRW') S.krw += proceeds; else receiveUSD(proceeds);
  return proceeds;
}
function trimLog(){ if (S.trades.length > 400) S.trades.length = 400; }

/* 반대매매: 거래 가능한 시장의 보유 종목 중 평가액 큰 것부터 매도해 target(달러)을 마련한다.
   한국 주식 매도대금(원화)은 달러 살 때 환율로 바로 바꾼다 */
function forceSell(target, tag){
  let raised = 0;
  const ids = Object.keys(S.pos)
    .filter(id => tradableMkt(BY_ID[id].m) && !(isLive() && LIVE.miss.has(id)))
    .sort((a, b) => S.pos[b].q*toUSD(BY_ID[b], price(b)) - S.pos[a].q*toUSD(BY_ID[a], price(a)));
  for (const id of ids){
    if (raised >= target) break;
    const s = BY_ID[id], P = S.pos[id];
    const r = fxRates();
    const perNat = quote(id, 'sell', 1).total * (1 - META.sellHaircut);
    const per = s.cur === 'KRW' ? perNat / r.buy : perNat;
    const need = Math.ceil((target - raised) / per);
    const q = Math.min(P.q, Math.max(1, need));
    const nat = doSell(id, q, tag, META.sellHaircut) || 0;
    let usd = nat;
    if (s.cur === 'KRW'){ usd = Math.floor(nat / r.buy * 100) / 100; S.feesPaid += nat / r.base - usd; S.fxFees = (S.fxFees || 0) + nat / r.base - usd; }
    raised += usd;
  }
  return raised;
}
const kappa = () => (1 - META.sellHaircut) * (1 - META.feeRate) * (1 - fxFeeRate());
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
    addLoan('credit', amt);
  } else if (kind === 'margin'){
    if (amt > L.margin + 1e-6) return toast(`주식담보대출 한도는 ${fmtUSD(L.margin)}입니다`, true);
    addLoan('margin', amt);
  } else return;
  S.usd += amt;
  toast(`${kind === 'credit' ? '신용대출' : '주식담보대출'} ${fmtUSD(amt)}을 받았습니다. 수수료 ${fmtUSD(amt * META.loanFee)}(3%)가 빚에 더해졌습니다`);
  commit();
}
function repay(kind, amt){
  const ln = S.loans[kind];
  if (!ln || ln.bal <= 0) return;
  amt = Math.min(amt, ln.bal, S.usd);
  if (!(amt > 0)) return toast(S.usd <= 0 ? '달러 통장에 상환할 돈이 없습니다. 원화가 있다면 먼저 달러로 환전하세요' : '금액을 입력하세요', true);
  ln.bal = Math.round((ln.bal - amt) * 100) / 100;
  S.usd -= amt;
  if (ln.bal < 0.005){
    ln.bal = 0;
    if (kind === 'credit'){
      // 대출을 처음 받은 날 = 만기 − 대출 기간
      const held = ln.due === null ? 0 : isLive() ? daysBetween(addDays(ln.due, -META.creditTerm), kstDate()) : S.day - (ln.due - META.creditTerm);
      if (ln.clean && ln.overdue === 0 && held >= META.gradeHold){ S.grade = clamp(S.grade - .5, 1, 10); toast('신용대출을 완납해 신용등급이 좋아졌습니다'); }
      else if (ln.clean && ln.overdue === 0) toast(`신용대출을 완납했습니다. ${META.gradeHold}${termUnit()} 이상 쓰고 갚아야 신용등급이 오릅니다 (이번에는 ${Math.max(0, held)}${termUnit()})`);
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

/* ───────── 예약 주문 ─────────
   예약 매수: 가격이 정한 값 이하가 되면 산다.  예약 매도: 정한 값이 현재가보다 높으면 그 값 이상, 낮으면 그 값 이하가 되면 판다.
   체결가는 조건을 처음 만족한 시세(정한 값이 아님). 유효기간은 실제 시세 30일, 시뮬레이션 30거래일.
   실제 시세 모드는 주문한 뒤의 5분 봉·일별 종가·최신가를 차례로 보며 판정하므로, 꺼 둔 동안 닿았어도 다시 열 때 체결된다.
   돈과 보유 수량은 체결할 때 확인한다. 그 나라 통화가 모자라면 다른 통화 통장을 바꿔 채운다. */
const ORDER_MAX = 30, ORDER_DAYS = 30;
const condMet = (o, p) => o.kind === 'le' ? p <= o.px : p >= o.px;
function ordersOf(id){ return (S.orders || []).filter(o => o.st === 'wait' && (!id || o.id === id)); }
function orderKindLabel(o){ return o.side === 'buy' ? '예약 매수' : '예약 매도'; }
/* 예약 매도의 조건 방향: 조건 가격이 현재가 이상이면 그 값까지 오르면, 아래면 그 값까지 내려가면 판다 */
const sellKind = (px, cur) => px >= cur ? 'ge' : 'le';
function orderCondText(o){ const s = BY_ID[o.id]; return `${fmtPxN(s, o.px)} ${o.kind === 'le' ? '이하' : '이상'}`; }
function orderExpText(o){ return o.exp ? `${fmtDate(zoneParts('Asia/Seoul', new Date(o.exp)).date, false)}까지` : `${Math.max(0, o.expD - S.day)}거래일 남음`; }
const ORDER_LAG_MS = 60e3;   // 예약 주문 판정 시작: 주문 시각보다 최대 이만큼 앞선 시세까지 (화면 가격은 최대 1분 묵을 수 있다)
function placeOrder(id, side, kind, px, q){
  const s = BY_ID[id];
  if (S.over) return toast('파산해서 주문할 수 없습니다', true);
  if (isLive() && LIVE.miss.has(id)) return toast('시세를 받지 못한 종목은 예약할 수 없습니다', true);
  if (s.hide && side === 'buy') return toast('목록에서 빠진 종목이라 새로 살 수 없습니다', true);
  px = s.cur === 'KRW' ? Math.round(px) : Math.round(px * 100) / 100;
  q = Math.floor(q);
  if (!(px > 0)) return toast('조건 가격을 입력하세요', true);
  if (q < 1) return toast('수량을 1주 이상 입력하세요', true);
  const o = {n:Date.now().toString(36) + Math.random().toString(36).slice(2, 6), id, side, kind:side === 'buy' ? 'le' : kind, px, q, at:Date.now(), st:'wait'};
  // 이 시각보다 뒤의 시세만 판정한다: 주문 때 보이던 가격의 시각. 단 주문 시각보다 1분(ORDER_LAG_MS) 넘게 앞설 수는 없다.
  // (장이 끝난 뒤나 시세가 늦게 들어온 종목에 건 주문이, 주문 전에 있었던 가격으로 나중에 체결되지 않게)
  if (isLive()){ const ft = lastPriceTs(id); o.from = Math.max(o.at - ORDER_LAG_MS, ft > 0 ? Math.min(ft, o.at) : 0); }
  if (side === 'sell'){
    const held = S.pos[id] ? S.pos[id].q : 0;
    if (held < 1) return toast('보유하지 않은 종목은 예약 매도할 수 없습니다', true);
    if (q > held) return toast(`보유 수량(${held}주)보다 많이 걸 수 없습니다`, true);
  }
  if (condMet(o, price(id))) return toast('지금 가격이 이미 조건에 맞습니다. 바로 주문을 이용하세요', true);
  if (ordersOf().length >= ORDER_MAX) return toast(`예약 주문은 ${ORDER_MAX}개까지 걸 수 있습니다`, true);
  if (isLive()) o.exp = o.at + ORDER_DAYS * 864e5; else { o.d0 = S.day; o.expD = S.day + ORDER_DAYS; }
  S.orders = S.orders || [];
  S.orders.unshift(o);
  trimOrders();
  return o;
}
function trimOrders(){
  const w = S.orders.filter(o => o.st === 'wait'), done = S.orders.filter(o => o.st !== 'wait').slice(0, 40);
  S.orders = w.concat(done).sort((a, b) => (b.endAt || b.at) - (a.endAt || a.at));
}
function cancelOrder(n){
  const o = (S.orders || []).find(x => x.n === n && x.st === 'wait');
  if (!o) return false;
  o.st = 'cancel'; o.endAt = Date.now(); trimOrders();
  return true;
}
/* 조건에 닿은 주문을 체결한다. 실패하면 이유를 남긴다 */
function fillOrder(o, p, at, notes){
  const s = BY_ID[o.id], fill = {p, at};
  let ok = false, why = '';
  if (o.side === 'buy'){
    ok = !!doBuy(o.id, o.q, '예약', true, fill);
    if (!ok) why = '주문 가능 금액이 부족해';
  } else {
    const held = S.pos[o.id] ? S.pos[o.id].q : 0;
    if (held >= 1){ o.qDone = Math.min(o.q, held); ok = !!doSell(o.id, o.qDone, '예약', 0, fill); }
    if (!ok) why = '보유 수량이 없어';
  }
  o.endAt = at;
  if (ok){
    o.st = 'done'; o.fp = p;
    notes.push({t:`${orderKindLabel(o)} 체결`, b:`${s.n} ${(o.qDone || o.q).toLocaleString()}주가 ${fmtPx(s, p)}에 체결됐습니다${isLive() ? ` (${kstTime(new Date(at))} 시세)` : ''}. (조건 ${orderCondText(o)})`});
  } else {
    o.st = 'fail';
    notes.push({t:`${orderKindLabel(o)} 실패`, b:`${s.n}이(가) 조건(${orderCondText(o)})에 닿았지만 ${why} 체결하지 못했습니다.`, bad:true});
  }
}
/* 실제 시세: 주문 시각(from) 뒤부터 to까지의 시세 점들 (5분 봉, 그 봉이 없는 날의 종가, 최신가) */
function pricePath(id, from, to){
  const s = BY_ID[id], tz = SESS[s.m].tz, pts = [], covered = new Set();
  const i5 = intradayOf(id);
  if (i5) for (let k = 0; k < i5.t.length; k++){
    const t = i5.t[k] * 1000;
    covered.add(zoneParts(tz, new Date(t)).date);
    if (t > from && t <= to) pts.push({t, p:i5.c[k], lo:Math.min(i5.l[k], i5.c[k]), hi:Math.max(i5.h[k], i5.c[k])});
  }
  // 5분 봉이 없는 날은 그날 저가·고가(있으면)와 종가
  const ds = LIVE.dates[s.m] || [], cs = LIVE.s[id] || [];
  const dlh = {}; for (const r of (QT.daily || [])) if (r.id === id && r.l != null && r.h != null) dlh[r.d] = r;
  for (let k = 0; k < ds.length; k++){
    if (covered.has(ds[k])) continue;
    const t = zoneTs(tz, ds[k], sessOf(s.m, ds[k]).c), x = dlh[ds[k]], c = cs[k];
    if (t > from && t <= to && c != null) pts.push({t, p:c, lo:x ? Math.min(+x.l, c) : c, hi:x ? Math.max(+x.h, c) : c});
  }
  const lt = LIVE.updated ? LIVE.updated.getTime() : 0;
  if (lt > from && lt <= to){ const p = price(id); pts.push({t:lt, p, lo:p, hi:p}); }
  return pts.sort((a, b) => a.t - b.t);
}
let ordersBusy = false;
async function processOrdersLive(){
  if (ordersBusy || !isLive() || !LIVE.ok || !S || S._ph || S.over) return;
  const wait = ordersOf(); if (!wait.length) return;
  ordersBusy = true;
  try {
    await Promise.all([...new Set(wait.map(o => o.id))].map(id => loadChart(id, false)));
    const nowMs = Date.now(), notes = [], hits = [];
    for (const o of wait){
      const end = Math.min(nowMs, o.exp || nowMs);
      // 기준 시각: 주문 때 보이던 가격의 시각. 이미 걸려 있던 주문도 주문 시각보다 1분 넘게 앞선 가격으로는 체결하지 않는다
      const from = Math.max(o.from || 0, o.at - ORDER_LAG_MS);
      const pt = pricePath(o.id, from, end).find(x => o.kind === 'le' ? x.lo <= o.px : x.hi >= o.px);
      // 체결가: 조건 가격. 봉 전체가 조건 너머에 있으면(갭) 그 봉에서 가장 가까운 가격
      if (pt) hits.push({o, t:pt.t, p:o.kind === 'le' ? Math.min(o.px, pt.hi) : Math.max(o.px, pt.lo)});
      else if (o.exp && nowMs > o.exp){
        o.st = 'expire'; o.endAt = o.exp;
        notes.push({t:`${orderKindLabel(o)} 기간 끝`, b:`${BY_ID[o.id].n} ${orderCondText(o)} 조건이 ${ORDER_DAYS}일 동안 오지 않아 주문이 취소됐습니다.`});
      }
    }
    hits.sort((a, b) => a.t - b.t);   // 먼저 닿은 주문부터 체결
    for (const h of hits) if (h.o.st === 'wait') fillOrder(h.o, h.p, h.t, notes);
    if (notes.length){ trimOrders(); commit(); showOrderNotes(notes); }
  } finally { ordersBusy = false; }
}
/* 시뮬레이션: 새 거래일 종가로 판정 */
function processOrdersSim(){
  const notes = [];
  for (const o of ordersOf()){
    if (S.day > o.expD){ o.st = 'expire'; o.endAt = Date.now(); notes.push({t:`${orderKindLabel(o)} 기간 끝`, b:`${BY_ID[o.id].n} ${orderCondText(o)} 주문이 ${ORDER_DAYS}거래일이 지나 취소됐습니다.`}); continue; }
    const p = price(o.id);
    if (condMet(o, p)) fillOrder(o, p, Date.now(), notes);
  }
  if (notes.length){ trimOrders(); for (const n of notes) toast(`${n.t}: ${n.b}`, n.bad); }
}
function showOrderNotes(notes){
  showModal(notes.map(n => `<h2 style="${n.bad ? 'color:var(--danger)' : ''}">${esc(n.t)}</h2><p>${esc(n.b)}</p>`).join('') + '<div class="acts"><button class="btn solid" data-close>확인</button></div>');
}

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
  const divAlerts = [];
  for (const s of STOCKS){
    const sec = SECTORS[s.s];
    const vm = MKT_VOL[s.m];
    // 배당락일이면 전날 종가 기준으로 1주당 배당을 주고, 그날 가격의 기준을 배당만큼 낮춘다
    let D = 0;
    const di = simDivInfo(s);
    if (di && S.day % di.period === di.phase){
      const pPrev = price(s.id);
      D = s.m === 'KR' ? Math.round(pPrev * di.yld / di.f) : Math.round(pPrev * di.yld / di.f * 100) / 100;
      const q = (S.pos[s.id] && S.pos[s.id].q) || 0;
      if (D > 0 && q > 0){ const r = payDiv(s.id, q, D, S.date); if (r) divAlerts.push(divMsg(s.id, q, D, r)); }
    }
    const idio = Math.sqrt(Math.max(sec.vol*sec.vol - (sec.beta*vm)**2 - SEC_VOL*SEC_VOL, .02));
    const r = sec.beta * (m[s.m] + macro[s.m]) + sf[s.s] + idio/sq * gauss()
          + (secShock[s.s + s.m] || 0) + (shock[s.id] || 0) - .5 * sec.vol*sec.vol / YD;
    const p0 = Math.max(price(s.id) - D, s.m === 'KR' ? 1 : .01);   // 배당락 기준가
    // ETF: 기초지수를 그 시장 공통 변동으로 보고, 하루 수익률에 배수(레버리지·인버스)를 곱한다. 매일 다시 맞추므로 오래 들면 변동성 손실이 생긴다
    let p = s.etf ? p0 * Math.max(.02, 1 + (s.lev || 1) * (Math.exp(m[s.m] + macro[s.m]) - 1)) : p0 * Math.exp(r);
    if (s.m === 'KR'){ p = clamp(p, p0*(1-META.krLimit), p0*(1+META.krLimit)); p = s.etf ? Math.max(5, Math.round(p / 5) * 5) : tickKR(p); }
    else p = Math.max(.01, Math.round(p * 100) / 100);
    const arr = S.px[s.id]; arr.push(p);
    if (arr.length > SIM_KEEP) arr.splice(1, arr.length - SIM_KEEP);
  }
  S.fx = Math.round(S.fx * Math.exp(.07/sq * gauss() - .25*(m.KR - m.US)) * 100) / 100;
  S.fxH.push(S.fx); if (S.fxH.length > SIM_KEEP) S.fxH.splice(1, S.fxH.length - SIM_KEEP);

  processOrdersSim();
  const alerts = [];
  if (divAlerts.length) alerts.push({t:'배당금 입금', div:true, b:divAlerts.slice(0, 4).join(' / ') + (divAlerts.length > 4 ? ` 외 ${divAlerts.length - 4}건` : '')});
  accrueInterest(1, YD);
  creditDue(alerts);
  marginCheck(alerts);
  if (S.day % 20 === 0 && S.loans.credit.overdue === 0 && netWorth() > 0) S.grade = clamp(S.grade - .1, 1, 10);

  for (const n of todays){ S.news.unshift({d:S.day, dt:S.date, ...n}); }
  if (S.news.length > 120) S.news.length = 120;
  const N = netWorth();
  S.nw.push(N); S.nwP.push(S.pts || 0); if (S.nw.length > SIM_KEEP){ S.nw.splice(1, S.nw.length - SIM_KEEP); S.nwP.splice(1, S.nwP.length - SIM_KEEP); }
  S.peak = Math.max(S.peak, N);
  for (const c of ['KR','US']){
    let a = 0, b = 0;
    for (const s of STOCKS){ if (s.m !== c || s.etf || s.hide) continue; a += s.mc * price(s.id) / s.p; b += s.mc; }
    S.idx[c].push(1000 * a / b);
    if (S.idx[c].length > SIM_KEEP) S.idx[c].splice(1, S.idx[c].length - SIM_KEEP);
  }
  if (S.dates.length > SIM_KEEP) S.dates.splice(1, S.dates.length - SIM_KEEP);
  bankruptCheck(alerts);
  commit();
  if (alerts.length){ stopAuto(); showAlerts(alerts); }
  else if (UI.tab !== 'home'){ const d = N - prevNW; if (Math.abs(d) >= .01) toastQuiet(`${fmtDate(S.date, false)} 정산 ${signUSD(d)}`); }
}

/* 빌리기 전 예상: 수수료 3%를 더한 빚에 지금 금리로 날마다 복리 이자가 붙는다고 보고 계산한다
   신용대출: 만기까지(이미 대출이 있으면 그 만기까지 남은 기간), 주식담보대출: 만기가 없어 하루와 30일 기준 */
function loanEstHTML(kind, A){
  const live = isLive(), YD = live ? 365 : 252, U = termUnit(), L = limits();
  const r = rates()[kind] / 100, grow = n => Math.pow(1 + r / YD, n);
  if (!(A > 0)) return `<span class="muted">금액을 넣으면 ${kind === 'credit' ? '만기에 갚을 금액' : '이자'}을 미리 계산해 보여 줍니다.</span>`;
  const over = A > L[kind] + 1e-6 ? `<div class="alert bad" style="margin:6px 0 0">한도를 넘습니다. 지금 빌릴 수 있는 금액은 ${fmtUSD(L[kind])}입니다.</div>` : '';
  const fee = A * META.loanFee, B0 = A + fee;
  if (kind === 'credit'){
    const C = S.loans.credit, has = C.bal > 0 && C.due !== null;
    const n = has ? Math.max(0, live ? daysBetween(kstDate(), C.due) : C.due - S.day) : META.creditTerm;
    const dueTxt = live ? fmtDate(has ? C.due : addDays(kstDate(), META.creditTerm), false) : `${n}거래일 뒤`;
    const end = B0 * grow(n), all = (C.bal + B0) * grow(n);
    return `<dl class="est">
      <div><dt>빌린 직후 빚</dt><dd class="num">${fmtUSD(B0)} <small class="muted">(수수료 ${fmtUSD(fee)})</small></dd></div>
      <div><dt>만기(${dueTxt})까지 이자</dt><dd class="num">약 ${fmtUSD(end - B0)} <small class="muted">(${n}${U}, 연 ${(r * 100).toFixed(2)}% 복리)</small></dd></div>
      <div><dt>만기에 갚을 금액</dt><dd class="num"><b>약 ${fmtUSD(end)}</b>${has ? ` <small class="muted">(기존 대출과 합쳐 약 ${fmtUSD(all)})</small>` : ''}</dd></div>
      <div><dt>총비용</dt><dd class="num down">약 ${fmtUSD(end - A)} <small class="muted">(빌린 돈의 ${((end / A - 1) * 100).toFixed(2)}%)</small></dd></div>
    </dl><p class="muted" style="margin:4px 0 0">신용등급이 바뀌면 금리도 바뀌어 실제 금액은 달라질 수 있습니다.</p>${over}`;
  }
  return `<dl class="est">
      <div><dt>빌린 직후 빚</dt><dd class="num">${fmtUSD(B0)} <small class="muted">(수수료 ${fmtUSD(fee)})</small></dd></div>
      <div><dt>하루 이자</dt><dd class="num">약 ${fmtUSD(B0 * r / YD)} <small class="muted">(연 ${(r * 100).toFixed(2)}%)</small></dd></div>
      <div><dt>30${U} 쓰면 이자</dt><dd class="num">약 ${fmtUSD(B0 * (grow(30) - 1))} <small class="muted">(복리, 만기 없음)</small></dd></div>
    </dl>${over}`;
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
  if (S.usd < C.bal) coverUSDfromKRW(C.bal - S.usd);
  const pay = Math.min(S.usd, C.bal);
  C.bal -= pay; S.usd -= pay;
  if (C.bal < .005){
    C.bal = 0;
    if (C.clean && C.overdue === 0) S.grade = clamp(S.grade - .5, 1, 10);
    C.due = null; C.overdue = 0; C.clean = true;
    alerts.push({t:'신용대출 만기 상환', b:`만기가 되어 달러 통장에서 ${fmtUSD(pay)}을 꺼내 신용대출을 자동 상환했습니다. 달러가 모자란 만큼은 원화 통장에서 자동으로 환전했습니다.`});
    return;
  }
  C.overdue += 1; C.clean = false;
  S.grade = clamp(S.grade + .4, 1, 10);
  if (C.overdue >= 5){
    if (isLive()) S.pend.credit = true;
    else creditLiquidate(alerts);
  } else {
    alerts.push({t:`신용대출 연체 ${C.overdue}${termUnit()}째`, b:`만기가 지났는데 달러와 원화를 모두 써도 ${fmtUSD(C.bal)}이 남았습니다. 연체 중에는 금리가 연 5%p 더 붙고 신용등급이 매일 떨어집니다. ${5 - C.overdue}${termUnit()} 안에 갚지 않으면 보유 주식이 반대매매됩니다.`, bad:true});
  }
}
function creditLiquidate(alerts){
  const C = S.loans.credit;
  const got = forceSell(C.bal / kappa(), '연체 반대매매');
  if (got <= 0) return false;
  const use = Math.min(got, C.bal); C.bal -= use; S.usd += got - use;
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
      const use = Math.min(got, M.bal); M.bal -= use; S.usd += got - use;
      if (M.bal < .005) M.bal = 0;
      S.grade = clamp(S.grade + 1, 1, 10);
      if (S.pend) S.pend.margin = marginRatio() < META.marginCall;
      alerts.push({t:'담보 부족 반대매매', b:`담보유지비율이 ${(ratio*100).toFixed(0)}%로 떨어져 보유 주식 일부를 매도하고 ${fmtUSD(use)}을 갚았습니다.`, bad:true});
    } else if (isLive()){
      S.pend.margin = true;
      const key = kstDate();
      if (S.warnedDate !== key + 'm'){
        S.warnedDate = key + 'm';
        alerts.push({t:'반대매매 대기', b:`담보유지비율이 ${(ratio*100).toFixed(0)}%입니다. 지금은 보유 종목의 시장이 열려 있지 않아, 다음에 장이 열리면 바로 반대매매됩니다. 그 전에 달러 통장으로 대출을 갚으면 피할 수 있습니다.`, bad:true});
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

/* ───────── 배당 ─────────
   DIVS[id] = [[배당락일 YYYY-MM-DD(거래소 현지 날짜), 1주당 배당금(현지 통화)], ...] 최근 2년 (Supabase seed10k_divs, 하루 한 번 수집)
   실제 시세: 배당락일(거래소 날짜)이 되면, 배당락일 0시(거래소 시각) 직전에 들고 있던 수량 = 전 거래일 장 마감 보유 수량에 준다.
              배당락일에 팔아도 받는다. 세금을 떼고 그 나라 통화 통장에 넣는다.
   시뮬레이션: 종목별 최근 1년 실제 배당수익률 y와 횟수 f로, 252/f 거래일마다 1주당 (전날 종가 × y ÷ f)를 주고 그날 가격도 그만큼 내린다. */
let DIVS = null, DIVS_AT = 0;
/* 분할·병합: SPLITS[id] = [[분할일 YYYY-MM-DD(거래소 날짜), 분자, 분모], ...]. 1주가 분자÷분모주가 된다 (2:1 분할 → 2주, 1:5 병합 → 0.2주) */
let SPLITS = {};
async function loadDivs(force){
  if (!ACC.sb || (!force && DIVS && Date.now() - DIVS_AT < 600e3)) return;   // 분할을 빨리 알도록 10분마다
  DIVS_AT = Date.now();
  try {
    const {data, error} = await ACC.sb.from('seed10k_divs').select('id,items');
    if (error) throw error;
    const m = {}, sp = {};
    for (const r of data || []){
      if (!Array.isArray(r.items)) continue;
      if (r.id.endsWith('#split')){ const id = r.id.slice(0, -6); if (BY_ID[id]) sp[id] = r.items; }
      else if (BY_ID[r.id]) m[r.id] = r.items;
    }
    DIVS = m; SPLITS = sp;
    try { localStorage.setItem('seed10k.divs', JSON.stringify({at:Date.now(), m, sp})); } catch(e){}
  } catch(e){
    if (!DIVS){ try { const c = JSON.parse(localStorage.getItem('seed10k.divs') || 'null'); if (c && c.m){ DIVS = c.m; SPLITS = c.sp || {}; } } catch(_){} }
  }
}
try { const c = JSON.parse(localStorage.getItem('seed10k.divs') || 'null'); if (c && c.m){ DIVS = c.m; SPLITS = c.sp || {}; } } catch(e){}
/* 실제 시세: 분할 전 날짜의 가격이 아직 조정되지 않았으면(시세 파일이 분할 전에 만들어졌거나 일별 표의 값) 분할 비율로 나눈다.
   분할일(거래소 날짜)이 되면 바로 적용해, 보유 수량(분할 반영)과 가격이 어긋나지 않게 한다. loadLive마다 시세를 새로 읽으므로 한 번씩만 적용된다 */
function adjustLiveForSplits(){
  const fileAt = LIVE.fileAt ? LIVE.fileAt.getTime() : 0;
  for (const id in SPLITS){
    const s = BY_ID[id], arr = LIVE.s[id]; if (!s || !arr) continue;
    const tz = exTz(s), today = zoneParts(tz).date, ds = LIVE.dates[s.m];
    for (const [ex, num, den] of SPLITS[id]){
      const mult = num / den;
      if (!(mult > 0) || mult === 1 || ex > today || zoneTs(tz, ex, 0) <= fileAt) continue;
      for (let k = 0; k < ds.length && k < arr.length; k++) if (ds[k] < ex && arr[k] != null) arr[k] = s.cur === 'KRW' ? Math.round(arr[k] / mult) : Math.round(arr[k] / mult * 100) / 100;
    }
  }
}
/* 실제 시세: 분할일이 지난 분할을 보유 수량·평단·예약 주문에 반영한다 (같은 분할은 한 번만) */
function processSplitsLive(alerts){
  if (!isLive() || S.over) return;
  S.splitDone = S.splitDone || [];
  const done = new Set(S.splitDone), startMs = S.started || 0;
  for (const id in SPLITS){
    const s = BY_ID[id]; if (!s) continue;
    const tz = exTz(s), today = zoneParts(tz).date;
    for (const [ex, num, den] of SPLITS[id]){
      const key = id + '@' + ex, mult = num / den;
      if (ex > today || done.has(key) || !(mult > 0) || mult === 1) continue;
      done.add(key); S.splitDone.push(key);
      const cut = zoneTs(tz, ex, 0);
      if (cut < startMs) continue;   // 게임을 시작하기 전의 분할
      const what = mult > 1 ? `주식 분할(1주 → ${+mult.toFixed(4)}주)` : `주식 병합(${+(1 / mult).toFixed(4)}주 → 1주)`;
      const lines = [];
      // 보유 수량: 분할일 0시 직전 수량에만 비율을 곱하고, 그 뒤에 사고판 수량(이미 새 단위)은 그대로 더한다
      const P = S.pos[id];
      if (P && P.q > 0){
        let after = 0; for (const t of S.trades){ if (t.id === id && t.at && t.at >= cut) after += t.side === 'buy' ? t.q : -t.q; }
        const before = P.q - after;
        if (before > 0){
          const exact = before * mult, whole = Math.floor(exact + 1e-9), frac = exact - whole;
          const costBefore = P.cost * (before / P.q);
          P.q = whole + after; P.avg = P.avg / mult;
          if (frac > 1e-9){
            // 1주가 안 되는 남는 몫(단주)은 지금 가격으로 현금 지급
            const cash = s.cur === 'KRW' ? Math.floor(frac * price(id)) : Math.floor(frac * price(id) * 100) / 100;
            const costPart = costBefore * (frac / exact);
            P.cost -= costPart; S.realized += toUSD(s, cash - costPart);
            if (s.cur === 'KRW') S.krw += cash; else receiveUSD(cash);
            lines.push(`단주 ${+frac.toFixed(4)}주는 ${fmtPx(s, cash)}으로 현금 지급`);
          }
          lines.unshift(`보유 ${before.toLocaleString()}주 → ${whole.toLocaleString()}주`);
          if (P.q <= 0) delete S.pos[id];
        }
      }
      // 분할일 전에 걸어 둔 예약 주문: 조건 가격은 나누고 수량은 곱한다
      for (const o of ordersOf()){
        if (o.id !== id || o.at >= cut) continue;
        o.px = s.cur === 'KRW' ? Math.round(o.px / mult) : Math.round(o.px / mult * 100) / 100;
        const nq = Math.floor(o.q * mult + 1e-9);
        if (nq < 1){ o.st = 'cancel'; o.endAt = Date.now(); lines.push(`예약 주문 1건은 수량이 1주 미만이 되어 취소`); }
        else { o.q = nq; lines.push(`예약 주문 조건을 ${fmtPx(s, o.px)}, ${nq.toLocaleString()}주로 조정`); }
      }
      if (lines.length) alerts.push({t:`${s.n} ${what}`, b:`${fmtDate(ex, false)} ${what}. ` + lines.join(', ') + '.', div:true});
    }
  }
  if (S.splitDone.length > 300) S.splitDone.splice(0, S.splitDone.length - 300);
}
const exTz = s => s.m === 'KR' ? 'Asia/Seoul' : 'America/New_York';
/* 최근 1년(오늘 기준 365일) 배당: 1주당 합계와 횟수 */
function divYear(id){
  const it = DIVS && DIVS[id]; if (!it || !it.length) return null;
  const from = addDays(kstDate(), -365);
  const last = it.filter(x => x[0] > from);
  return {sum:last.reduce((a, x) => a + x[1], 0), n:last.length, recent:it.slice(-4).reverse()};
}
/* 세금 계산 (한국: 소득세 14%와 그 10%인 지방소득세를 각각 원 미만 버림, 미국: 15% 센트 미만 반올림) */
function divNet(cur, gross){
  if (cur === 'KRW'){ const g0 = Math.floor(gross), it = Math.floor(g0 * 0.14), lt = Math.floor(it * 0.1); return {gross:g0, tax:it + lt, net:g0 - it - lt}; }
  const g0 = Math.round(gross * 100) / 100, tax = Math.round(g0 * META.divTax.USD * 100) / 100;
  return {gross:g0, tax, net:Math.round((g0 - tax) * 100) / 100};
}
function payDiv(id, q, ps, exDate){
  const s = BY_ID[id], r = divNet(s.cur, q * ps);
  if (!(r.net > 0)) return null;
  if (s.cur === 'KRW') S.krw += r.net; else receiveUSD(r.net);
  S.divUSD = (S.divUSD || 0) + toUSD(s, r.net);
  (S.divLog = S.divLog || []).unshift({id, d:exDate, q, ps, ...r, cur:s.cur, at:Date.now()});
  if (S.divLog.length > 200) S.divLog.length = 200;
  return r;
}
const divMsg = (id, q, ps, r) => { const s = BY_ID[id]; return `${s.n} ${q.toLocaleString()}주 × ${fmtPx(s, ps)} = ${fmtPx(s, r.gross)}, 세금 ${fmtPx(s, r.tax)} 떼고 ${fmtPx(s, r.net)} 입금`; };
/* 실제 시세: 아직 안 준 배당을 정산한다 */
function processDivsLive(alerts){
  if (!isLive() || !DIVS || S.over) return;
  S.divDone = S.divDone || [];
  const done = new Set(S.divDone), startMs = S.started || 0;
  for (const id in DIVS){
    const s = BY_ID[id]; if (!s) continue;
    const tz = exTz(s), today = zoneParts(tz).date, oldest = addDays(today, -30);
    for (const [ex, ps] of DIVS[id]){
      if (ex > today || ex < oldest) continue;
      const key = id + '@' + ex; if (done.has(key)) continue;
      const cut = zoneTs(tz, ex, 0);
      if (cut < startMs){ done.add(key); S.divDone.push(key); continue; }   // 게임을 시작하기 전의 배당락일
      // 배당락일 0시 직전 보유 수량 = 지금 수량 − 그 뒤에 산 수량 + 그 뒤에 판 수량
      let q = (S.pos[id] && S.pos[id].q) || 0;
      for (const t of S.trades){ if (t.id !== id || !t.at || t.at < cut) continue; q += t.side === 'buy' ? -t.q : t.q; }
      done.add(key); S.divDone.push(key);
      if (q > 0){ const r = payDiv(id, q, ps, ex); if (r) alerts.push({t:'배당금 입금', b:divMsg(id, q, ps, r), div:true}); }
    }
  }
  if (S.divDone.length > 600) S.divDone.splice(0, S.divDone.length - 600);
}
/* 시뮬레이션: 종목별 배당수익률과 횟수 (실제 최근 1년 배당 ÷ 게임 시작 기준가) */
function simDivInfo(s){
  const y = divYear(s.id); if (!y || !y.n) return null;
  const f = clamp(y.n, 1, 12), yld = y.sum / s.p;
  if (!(yld > 0) || yld > 0.25) return null;
  const period = Math.round(252 / f);
  let h = 0; for (const ch of s.id) h = (h * 31 + ch.charCodeAt(0)) % 100003;
  return {f, yld, period, phase:h % period};
}

/* 종목 상세의 배당 칸: 실제 시세는 최근 1년 1주당 배당과 배당수익률(현재가 기준), 시뮬레이션은 게임 속 배당 규칙 */
function divStatsHTML(s, p, live){
  if (!DIVS) return '';
  const y = divYear(s.id);
  if (live){
    if (!y || !y.n) return `<div><dt>배당 (최근 1년)</dt><dd class="num">없음</dd></div>`;
    const last = y.recent[0];
    return `<div><dt>배당 (최근 1년, ${y.n}회)</dt><dd class="num">${fmtPx(s, y.sum)} <small class="muted">(${(y.sum / p * 100).toFixed(2)}%)</small></dd></div>
      <div><dt>최근 배당락일</dt><dd class="num">${fmtDate(last[0], false)} <small class="muted">${fmtPx(s, last[1])}</small></dd></div>`;
  }
  const di = simDivInfo(s);
  if (!di) return `<div><dt>배당</dt><dd class="num">없음</dd></div>`;
  const next = di.period - ((S.day - di.phase) % di.period + di.period) % di.period || di.period;
  return `<div><dt>배당 (연 ${di.f}회)</dt><dd class="num">${(di.yld * 100).toFixed(2)}% <small class="muted">/년</small></dd></div>
    <div><dt>다음 배당락</dt><dd class="num">${next}거래일 뒤</dd></div>`;
}

/* ───────── 실제 시세: 데이터 받기 + 정산 ───────── */
async function loadLive(silent){
  if (LIVE.loading) return;
  LIVE.loading = true;
  try {
    // 주소를 고정하고 브라우저 캐시를 확인 요청(no-cache)으로: 파일이 안 바뀌었으면 304로 본문을 다시 받지 않는다
    const r = await fetch(LIVE_URL, {cache:'no-cache'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    applyLive(j);
    LIVE.ok = true; LIVE.err = null;
  } catch(e){
    LIVE.err = String(e.message || e);
    if (!silent && isLive()) toast('시세 파일을 받지 못했습니다', true);
  }
  try { if (LIVE.ok && await loadQuotes()) applyQuotes(); }
  catch(e){}
  try { await loadDivs(); adjustLiveForSplits(); }
  finally {
    LIVE.loading = false;
    LIVE.fetchedAt = new Date();
  }
  if (isLive() && UI.sheet && !UI.refreshing) await loadChart(UI.sheet, false);
  if (isLive()) liveTick();
  if (isLive()) processOrdersLive();
}
function applyLive(j){
  LIVE.updated = j.updated ? new Date(j.updated) : null;
  LIVE.fileAt = LIVE.updated;   // 시세 파일을 만든 시각 (최신가를 덧입히면 LIVE.updated는 바뀐다)
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
    LIVE.idx[m] = dates.map((_, i) => idxValue(m, i));
  }
  if (j.fx && j.fx.c && j.fx.c.length) LIVE.fx = {d:j.fx.d.slice(), c:j.fx.c.slice()};
}
/* 시가총액 가중 지수 (첫 거래일 = 1000): 시장 m의 i번째 거래일 값 */
function idxValue(m, i){
  const ids = STOCKS.filter(s => s.m === m && !s.etf && !s.hide && !LIVE.miss.has(s.id));
  const tot = ids.reduce((a, s) => a + s.mc, 0) || 1;
  return 1000 * ids.reduce((a, s) => a + s.mc * LIVE.s[s.id][i] / LIVE.s[s.id][0], 0) / tot;
}

/* ───────── 실시간 시세 표 (Supabase seed10k_quotes) ─────────
   Supabase 함수가 장중 7초마다 네이버 증권에서 받은 현재가(5분 봉은 1분마다 Yahoo)를 읽어, GitHub 시세 파일 위에 덧입힌다.
   전체는 1분마다(바뀐 줄 + 묶음 줄), 예약·열린 종목은 7초마다(pollHot) 읽는다.
   표가 없거나 읽지 못하면 시세 파일만 쓴다. */
const QT = {rows:null, daily:[], at:null, err:null, beat:0, maxAt:0, fullAt:0, dailyAt:0, dailySince:null};
const QT_FULL_MS = 10 * 60e3;        // 장 시간 근처에는 이 간격마다 시세 표 전체를 다시 읽는다 (그 사이에는 바뀐 줄만)
const QT_FULL_IDLE_MS = 30 * 60e3;   // 두 시장 모두 닫혀 있으면 이 간격마다
const QT_OVERLAP_MS = 90e3;          // 바뀐 줄을 읽을 때 겹쳐 읽는 폭 (함수가 시각을 찍고 저장하기까지 걸리는 시간 여유)
const QT_DAILY_MS = 30 * 60e3;       // 일별 표(지난 거래일만)는 이 간격마다 읽는다
const RT_FRESH_MS = 3 * 60e3;   // 함수의 살아 있다는 신호가 이 시간 안이면 온라인
/* 실시간 수집이 돌고 있는가: 함수가 남긴 _beat 시각이 3분 안이고, 표를 정상으로 읽었을 때 */
function rtOnline(){ return !QT.err && QT.beat > 0 && Date.now() - QT.beat < RT_FRESH_MS; }
async function loadQuotes(){
  if (!ACC.sb) return false;
  try {
    // 시세 파일의 마지막 거래일 뒤로 쌓인 일별 마지막 가격 (GitHub 수집이 멈춘 날 채우기)
    const since = [LIVE.dates.KR, LIVE.dates.US, LIVE.fx.d].map(a => last(a || [])).filter(Boolean).sort()[0];
    // 전송량을 줄이려고, 10분(장이 모두 닫혀 있으면 30분)마다 한 번만 전체를 읽고 그 사이에는 updated_at이 바뀐 줄만 읽는다.
    // 장중 네이버 현재가는 줄마다의 updated_at을 바꾸지 않고, 시장별 묶음 줄(_snapKR, _snapUS)의 x에 모아 둔다
    const busy = ['KR','US'].some(m => sessionNear(m) || mstate(m).k === 'settle');
    const full = !QT.rows || !QT.maxAt || Date.now() - QT.fullAt > (busy ? QT_FULL_MS : QT_FULL_IDLE_MS);
    let qq = ACC.sb.from('seed10k_quotes').select('id,m,p,t,d,updated_at,x:i->x');
    if (!full) qq = qq.gt('updated_at', new Date(QT.maxAt - QT_OVERLAP_MS).toISOString());
    // 일별 표는 지난 거래일(한국 날짜로 오늘 전)만: 오늘 값은 시세 표에서 받는다
    const today = kstDate();
    const wantDaily = since && since < today && (since !== QT.dailySince || Date.now() - QT.dailyAt > QT_DAILY_MS);
    const [q, dl] = await Promise.all([
      qq,
      // 일별 표 읽기가 실패해도 최신가는 쓰도록, 실패를 여기서 삼킨다
      (wantDaily ? Promise.resolve(ACC.sb.from('seed10k_daily').select(QT.lh === false ? 'id,d,c' : 'id,d,c,l,h').gt('d', since).lt('d', today).order('d', {ascending:true}).limit(5000))
        .then(r => (r.error && QT.lh !== false && /column|42703/i.test(r.error.message || '')) ? (QT.lh = false, ACC.sb.from('seed10k_daily').select('id,d,c').gt('d', since).lt('d', today).order('d', {ascending:true}).limit(5000)) : r)
        : Promise.resolve({data:null, error:null})).catch(e => ({data:null, error:e}))
    ]);
    if (q.error) throw q.error;
    const got = q.data || [];
    if (full){ QT.rows = got; QT.fullAt = Date.now(); }
    else {
      const at = new Map(QT.rows.map((r, i) => [r.id, i]));
      for (const r of got){ const i = at.get(r.id); if (i === undefined) QT.rows.push(r); else QT.rows[i] = r; }
    }
    for (const r of got){ const u = Date.parse(r.updated_at || '') || 0; if (u > QT.maxAt) QT.maxAt = u; }
    // 묶음 줄의 현재가를 종목 줄에 덮는다 (7초 읽기 등으로 이미 더 새 체결 시각이 있으면 그대로 둔다)
    for (const sn of QT.rows.filter(r => /^_snap/.test(r.id) && r.x && r.x.ids)) mergeSnap(sn);
    if (wantDaily && !dl.error && dl.data){ QT.daily = dl.data; QT.dailyAt = Date.now(); QT.dailySince = since; }
    else if (!since) QT.daily = [];
    QT.at = new Date(); QT.err = null;
    // 살아 있다는 신호: _beat(장 시간과 무관하게 매분), 예전 함수라 _beat가 없으면 수집 기록 _run
    QT.beat = Math.max(0, ...QT.rows.filter(r => (r.id === '_beat' || r.id === '_run') && r.updated_at).map(r => Date.parse(r.updated_at) || 0));
    return true;
  } catch(e){ QT.err = errText(e); return false; }
}
function mergeSnap(sn){
  const x = sn.x, at = new Map(QT.rows.map((r, i) => [r.id, i]));
  for (let k = 0; k < x.ids.length; k++){
    const id = x.ids[k], tt = new Date((x.t0 + (x.dt[k] || 0)) * 1000).toISOString();
    const i = at.get(id), o = i === undefined ? null : QT.rows[i];
    if (o && (Date.parse(o.t || '') || 0) >= Date.parse(tt)) continue;
    const r = {...(o || {id, m:id.slice(0, 2)}), p:x.p[k], t:tt, d:sn.d};
    if (i === undefined) QT.rows.push(r); else QT.rows[i] = r;
  }
}
/* 시장 m에 새 거래일 d를 붙인다 (값은 전날 값으로 채운 뒤 시세로 덮는다) */
function addLiveDate(m, d){
  LIVE.dates[m] = LIVE.dates[m].concat(d);
  for (const s of STOCKS) if (s.m === m && LIVE.s[s.id]) LIVE.s[s.id].push(last(LIVE.s[s.id]));
  LIVE.idx[m].push(last(LIVE.idx[m]));
}
function applyQuotes(){
  if (!QT.rows) return;
  let newest = 0;
  const touched = new Set();
  // 1) 시세 파일에 없는 지난 거래일들의 마지막 가격을 날짜 순서대로 채운다
  for (const r of QT.daily){
    if (r.c === null || r.c === undefined) continue;
    const c = +r.c;
    if (r.id === 'FX'){
      const fx = LIVE.fx, ld = last(fx.d);
      if (r.d === ld) fx.c[fx.c.length - 1] = c; else if (r.d > ld){ fx.d.push(r.d); fx.c.push(c); }
      continue;
    }
    const s = BY_ID[r.id];
    if (!s || !LIVE.s[r.id] || LIVE.miss.has(r.id)) continue;
    const ds = LIVE.dates[s.m], ld = last(ds);
    if (r.d > ld) addLiveDate(s.m, r.d);
    const i = LIVE.dates[s.m].lastIndexOf(r.d);
    if (i >= 0 && r.d >= ld) LIVE.s[r.id][i] = c;
    touched.add(s.m);
  }
  for (const m of touched){ const ds = LIVE.dates[m]; for (let i = 0; i < ds.length; i++) LIVE.idx[m][i] = idxValue(m, i); }
  touched.clear();
  // 2) 최신가
  for (const r of QT.rows){
    if (r.p === null || r.p === undefined || !r.d) continue;
    const p = +r.p, ut = Math.max(Date.parse(r.updated_at || '') || 0, Date.parse(r.t || '') || 0);
    if (r.m === 'FX'){
      const fx = LIVE.fx, ld = last(fx.d);
      if (r.d === ld) fx.c[fx.c.length - 1] = p;
      else if (!ld || r.d > ld){ fx.d.push(r.d); fx.c.push(p); }
      newest = Math.max(newest, ut);
      continue;
    }
    const s = BY_ID[r.id];
    if (!s || !LIVE.s[r.id] || LIVE.miss.has(r.id)) continue;
    const ld = last(LIVE.dates[s.m]);
    if (r.d < ld) continue;                       // 시세 파일 쪽이 더 새로움
    if (r.d > ld) addLiveDate(s.m, r.d);          // 새 거래일이 시작됨
    const a = LIVE.s[r.id]; a[a.length - 1] = p;
    touched.add(s.m); newest = Math.max(newest, ut);
  }
  for (const m of touched){ const i = LIVE.dates[m].length - 1; LIVE.idx[m][i] = idxValue(m, i); }
  if (newest && (!LIVE.updated || newest > LIVE.updated.getTime())) LIVE.updated = new Date(newest);
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
  processSplitsLive(alerts);
  processDivsLive(alerts);
  if (LIVE.ok){
    if (S.pend.credit && S.loans.credit.bal > 0) creditLiquidate(alerts);
    marginCheck(alerts);
  }
  const N = netWorth();
  if (last(S.nwD) === today){ S.nw[S.nw.length - 1] = N; S.nwP[S.nwP.length - 1] = S.pts || 0; }
  else { S.nw.push(N); S.nwP.push(S.pts || 0); S.nwD.push(today); if (S.nw.length > 800){ S.nw.splice(1, S.nw.length - 800); S.nwP.splice(1, S.nwP.length - 800); S.nwD.splice(1, S.nwD.length - 800); } }
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
/* 7초마다: 지금 장이 열린 시장의 '대기 중인 예약 주문 종목'과 '열어 둔 종목'만 최신가를 읽는다.
   보유 종목과 전체 목록은 1분마다 읽는다 (전송량을 줄이려고). */
let hotBusy = false;
function sessionNear(m){
  const p = zoneParts(SESS[m].tz), z = sessOf(m, p.date), mins = p.h * 60 + p.mi;
  return p.wd !== 'Sat' && p.wd !== 'Sun' && mins >= z.o - 5 && mins <= z.c + 10;
}
async function pollHot(){
  if (hotBusy || document.hidden || !isLive() || !ACC.sb || !LIVE.ok || LIVE.loading || !QT.rows || !S || S._ph) return;
  const ids = new Set();
  for (const o of ordersOf()) ids.add(o.id);
  if (UI.sheet) ids.add(UI.sheet);
  const want = [...ids].filter(id => BY_ID[id] && sessionNear(BY_ID[id].m)).slice(0, 150);
  if (!want.length) return;
  hotBusy = true;
  try {
    const {data, error} = await ACC.sb.from('seed10k_quotes').select('id,m,p,t,d,updated_at').in('id', want);
    if (error || !data || LIVE.loading) return;
    const at = new Map(QT.rows.map((r, i) => [r.id, i]));
    let changed = false;
    for (const r of data){
      const i = at.get(r.id);
      if (i === undefined){ QT.rows.push(r); changed = true; continue; }
      const o = QT.rows[i];
      if (o.p !== r.p || o.t !== r.t || o.d !== r.d){ QT.rows[i] = r; changed = true; }
    }
    if (!changed) return;
    applyQuotes();
    // 화면만 다시 그린다. 저장(서버 기록 올리기)과 이자·담보 확인은 1분 읽기(liveTick)에서 한다 (7초마다 서버에 기록을 올리지 않게)
    renderHeader(); renderTab();
    if (UI.sheet && (UI.scrub === null || UI.scrub === undefined)) renderSheet();
    processOrdersLive();
  } catch(e){ /* 다음 1분 읽기에서 다시 맞춘다 */ }
  finally { hotBusy = false; }
}
setInterval(pollHot, HOT_POLL_MS);
/* 확대 막기: iOS Safari는 viewport의 maximum-scale을 무시하고 두 손가락 확대를 허용하므로, 확대 제스처를 직접 막는다 */
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, e => e.preventDefault(), {passive:false});
document.addEventListener('touchmove', e => { if (e.touches && e.touches.length > 1) e.preventDefault(); }, {passive:false});

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
  if ([...$('#toasts').children].some(x => x.textContent === msg)) return false;   // 같은 알림이 떠 있으면 겹쳐 띄우지 않는다
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
/* iOS Safari: 키보드가 떠 있는 채로 입력칸이 화면에서 사라지면(창 닫기 등) 키보드가 내려간 뒤에도
   화면 기준 위치를 못 되돌려, 아래 탭 바(position:fixed) 같은 고정 요소가 화면 중간에 멈춰 있는 일이 있다.
   (1) 창을 닫기 전에 입력칸의 포커스를 먼저 풀고 (2) 키보드가 내려가면 스크롤을 1px 움직였다 되돌려 위치를 다시 계산하게 한다 */
function blurField(){ const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) a.blur(); }
function refixViewport(){
  requestAnimationFrame(() => { const x = window.scrollX, y = window.scrollY; window.scrollTo(x, y > 0 ? y - 1 : y + 1); window.scrollTo(x, y); });
}
document.addEventListener('focusout', e => { if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) setTimeout(refixViewport, 150); });
if (window.visualViewport){
  let vvH = window.visualViewport.height;
  window.visualViewport.addEventListener('resize', () => { const h = window.visualViewport.height; if (h > vvH + 80) setTimeout(refixViewport, 80); vvH = h; });
}
function showModal(html, onClose, locked){
  const md = $('#modal'), sc = $('#scrim');
  md.innerHTML = html; md.hidden = false; sc.hidden = false; md.dataset.kind = '';
  md.dataset.locked = locked ? '1' : '';
  const tok = md._tok = (md._tok || 0) + 1;   // 닫자마자 다른 창을 열면, 앞 창의 '닫기'가 새 창을 숨기지 않게
  requestAnimationFrame(() => { md.classList.add('on'); sc.classList.add('on'); });
  const close = () => {
    if (md._tok !== tok){ onClose && onClose(); return; }   // 이미 다른 창으로 바뀌었다
    blurField(); md.classList.remove('on'); if (!UI.sheet) sc.classList.remove('on');
    setTimeout(() => { if (md._tok !== tok) return; md.hidden = true; if (!UI.sheet) sc.hidden = true; }, 180); onClose && onClose();
  };
  md.querySelectorAll('[data-close]').forEach(b => b.onclick = close);
  const first = md.querySelector('button'); first && first.focus();
  return close;
}
/* 긴 설명은 화면에 다 펼치지 않고 버튼으로 팝업을 연다. 내용은 화면을 그릴 때 INFO[key]에 넣어 둔다 */
const INFO = {};
const infoBtn = (key, label) => `<button class="info-btn" data-info="${key}" aria-label="${esc(label || '자세히')}">${label ? esc(label) : 'ⓘ'}</button>`;
const infoRow = (key, title, sub) => `<section class="card info-row"><div><h2>${title}</h2>${sub ? `<small class="muted">${sub}</small>` : ''}</div><button class="btn" data-info="${key}">보기</button></section>`;
/* 크게 움직인 종목 전체 목록 (팝업). 상승/하락, 시장(전체·한국·미국)을 고른다 */
function moversAll(){
  const live = isLive();
  const pool = STOCKS.filter(s => !(live && LIVE.miss.has(s.id)) && (UI.mvMkt === 'all' || s.m === UI.mvMkt));
  const ch = pool.map(s => ({s, c:price(s.id)/prevPrice(s.id) - 1}));
  return UI.mvSide === 'dn' ? ch.filter(x => x.c < 0).sort((a, b) => a.c - b.c) : ch.filter(x => x.c > 0).sort((a, b) => b.c - a.c);
}
function openMovers(){
  UI.mvSide = UI.mvSide || 'up'; UI.mvMkt = UI.mvMkt || 'all';
  showModal(`<h2>크게 움직인 종목</h2><div id="mvBox"></div><div class="acts"><button class="btn solid" data-close>닫기</button></div>`);
  $('#modal').dataset.kind = 'info';
  renderMovers();
}
function renderMovers(){
  const box = $('#mvBox'); if (!box) return;
  const list = moversAll();
  const seg = (k, v, l) => `<button data-${k}="${v}" aria-pressed="${UI[k === 'mvside' ? 'mvSide' : 'mvMkt'] === v}">${l}</button>`;
  box.innerHTML = `<div class="mv-tools"><div class="seg">${seg('mvside', 'up', '상승')}${seg('mvside', 'dn', '하락')}</div>
      <div class="seg">${seg('mvmkt', 'all', '전체')}${seg('mvmkt', 'KR', '한국')}${seg('mvmkt', 'US', '미국')}</div></div>
    <small class="muted">전 거래일 종가 대비, ${list.length.toLocaleString()}종목</small>
    <div class="info-body mv-all">${list.length ? list.map((x, i) => `<button class="mv" data-mvopen="${x.s.id}"><span class="nm"><span class="rk num">${i + 1}</span><span class="flag">${x.s.m}</span>${esc(x.s.n)}</span><span class="mv-r"><span class="num muted">${fmtPx(x.s, price(x.s.id))}</span><span class="pc ${cls(x.c)}">${fmtPct(x.c)}</span></span></button>`).join('') : '<p class="empty">없음</p>'}</div>`;
}
function openInfo(key){
  const it = INFO[key]; if (!it) return;
  showModal(`<h2>${it.t}</h2><div class="info-body">${it.h}</div><div class="acts"><button class="btn solid" data-close>닫기</button></div>`);
  $('#modal').dataset.kind = 'info';
}
function showAlerts(list){
  const html = list.map(a => `<h2 style="${a.bad ? 'color:var(--danger)' : ''}">${esc(a.t)}</h2><p>${esc(a.b)}</p>`).join('');
  const over = list.some(a => a.over), onlyDiv = list.every(a => a.div);
  showModal(html + `<div class="acts">${over ? '<button class="btn" data-close>닫기</button><button class="btn solid" id="mdReset">새 게임</button>' : onlyDiv ? '<button class="btn solid" data-close>확인</button>' : '<button class="btn" data-close>확인</button><button class="btn solid" id="mdLoans" data-close>대출 화면 열기</button>'}</div>`);
  const r = $('#mdReset'); if (r) r.onclick = () => { confirmReset(); };
  const l = $('#mdLoans'); if (l) l.addEventListener('click', () => go('loans'));
}
/* 새 게임 확인: 로그인했으면 계정 비밀번호를 다시 입력해야 지운다. 손님은 확인 창만. */
function confirmReset(){
  const title = '새 게임을 시작할까요?';
  const body = `${isLive() ? '실제 시세' : '시뮬레이션'} 모드의 거래, 대출, 기록이 모두 지워지고 시드 $10,000로 다시 시작합니다. 다른 모드의 기록은 그대로입니다.`;
  if (!ACC.user || !ACC.sb || !ACC.user.email) return confirmBox(title, body, '새 게임 시작', resetGame);
  const close = showModal(`<h2>${title}</h2><p>${body}</p>
    <p class="muted" style="margin:10px 0 6px">확인을 위해 계정(${esc(ACC.user.email)}) 비밀번호를 입력하세요.</p>
    <label class="amt"><input id="rsPw" type="password" autocomplete="current-password" placeholder="비밀번호" aria-label="계정 비밀번호"></label>
    <div class="err" id="rsErr" role="status"></div>
    <div class="acts"><button class="btn" data-close>취소</button><button class="btn solid" id="rsOk" style="background:var(--danger);border-color:var(--danger)">새 게임 시작</button></div>`);
  const pw = $('#rsPw'), ok = $('#rsOk'), err = $('#rsErr');
  setTimeout(() => pw && pw.focus(), 60);
  const submit = async () => {
    const v = pw.value;
    if (!v){ err.textContent = '비밀번호를 입력하세요.'; pw.focus(); return; }
    ok.disabled = true; err.textContent = '확인 중…';
    try {
      const {error} = await ACC.sb.auth.signInWithPassword({email:ACC.user.email, password:v});
      if (error) throw error;
    } catch(e){
      ok.disabled = false;
      err.textContent = /invalid/i.test((e && e.message) || '') ? '비밀번호가 맞지 않습니다.' : `확인하지 못했습니다 (${errText(e)}).`;
      pw.select(); return;
    }
    close(); resetGame();
  };
  ok.onclick = submit;
  pw.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); submit(); } });
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
        <span>실제 주가를 따라갑니다. 각 시장의 정규장 시간에 사고팔 수 있고, 현재가는 장중 약 7초마다 수집되어, 열어 둔 종목과 예약 주문 종목은 7초마다, 나머지는 1분마다 화면에 반영됩니다.</span>
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
    const on = rtOnline(), rb = $('#rtBadge');
    rb.dataset.on = on ? '1' : '0';
    rb.querySelector('b').textContent = on ? '온라인' : '오프라인';
    rb.title = on ? '실시간 시세 수집이 돌고 있습니다' : '실시간 시세 수집 신호가 없습니다. GitHub 시세만 씁니다';
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
        <section class="card c-wallet" id="walletCard"></section>
        <section class="card c-mg" id="mgCard"></section>
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
  const ret = twrRet(N);
  // 어제(전 거래일) 기록 이후 받은 포인트는 번 돈이 아니므로 뺀다
  const dToday = S.nw.length > 1 ? (N - (S.pts || 0)) - (S.nw[S.nw.length-2] - (S.nwP[S.nwP.length-2] || 0)) : N - META.seed - (S.pts || 0);
  const started = live || S.day > 0;
  $('#hGrade').textContent = `신용 ${g()}등급`;
  { const c = gradeColor(S.grade), el = $('#hGrade'); el.style.color = c; el.style.borderColor = c; }
  $('#hSub').innerHTML = `<span class="ret ${cls(ret)}">${fmtPct(ret)}</span>${(S.pts || 0) > 0 ? '' : `<span>시드 <b>${fmtUSD(META.seed, 0)}</b> 대비</span>`}<span>${live ? '어제보다' : '오늘'} <b>${signUSD(started ? dToday : 0)}</b></span>`;
  const kr = holdingsUSD('KR'), us = holdingsUSD('US'), cu = S.usd, ck = S.krw / FX();
  const tot = kr + us + cu + ck || 1;
  // 막대 길이는 모두 달러로 환산해 비교하고, 금액 글씨는 설정(한국 자산 표시)에 따라 원화 자산을 원래 원화로 쓴다
  let krKRW = 0; for (const id in S.pos) if (BY_ID[id].cur === 'KRW') krKRW += S.pos[id].q * price(id);
  const inKRW = dispMode() !== 'usd';
  const seg = [{l:'한국 주식', v:kr, c:'#6E8BFF', t:inKRW ? fmtKRW(krKRW) : null}, {l:'미국 주식', v:us, c:'#E2B45E'}, {l:'달러', v:cu, c:'#B9C3D6'}, {l:'원화', v:ck, c:'#8FA0BF', t:inKRW ? fmtKRW(S.krw) : null}];
  $('#mixBar').innerHTML = seg.map(s => `<i style="width:${(s.v/tot*100).toFixed(2)}%;background:${s.c}"></i>`).join('');
  $('#mixLeg').innerHTML = seg.map(s => `<span><i style="background:${s.c}"></i>${s.l} <b>${s.t || fmtUSD(s.v, 0)}</b></span>`).join('')
    + (D > 0 ? `<span><i style="background:#FF8A96"></i>대출 <b>${MINUS}${fmtUSD(D, 0)}</b></span>` : '');
  $('#eqWrap').innerHTML = areaSVG(S.nw.slice(-120), {base:META.seed});
  const nd = nwDates();
  $('#eqL').textContent = fmtDate(nd[Math.max(0, nd.length - Math.min(120, S.nw.length))], false);
  $('#eqR').textContent = live ? (S.nw.length > 1 ? `최고 ${fmtUSD(S.peak, 0)}` : '하루가 지나면 순자산 그래프가 쌓입니다')
                               : (S.day ? `최고 ${fmtUSD(S.peak, 0)}` : '다음 거래일을 눌러 시장을 열어보세요');

  $('#walletCard').innerHTML = walletHTML();
  $('#mgCard').innerHTML = mgCardHTML();
  const tiles = [{l:'한국 300 지수', a:idxHist('KR')}, {l:'미국 300 지수', a:idxHist('US')}, {l:'원/달러 환율', a:fxHist(), fx:true}];
  $('#pulse').innerHTML = tiles.map(t => {
    const a = t.a, cur = last(a), prev = a.length > 1 ? a[a.length-2] : a[0];
    const ch = cur / prev - 1;
    return `<div class="tile"><div class="t-l">${t.l}</div><div class="t-v num">${t.fx ? fmtFX(cur) : cur.toFixed(2)}</div><div class="t-c ${cls(ch)}">${fmtPct(ch)}</div>${sparkSVG(a.slice(-40), t.fx ? 'flat' : cls(cur/a[0]-1), 110, 30).replace('class="spark"','')}</div>`;
  }).join('');

  const pool = STOCKS.filter(s => !(live && LIVE.miss.has(s.id)));
  const ch = pool.map(s => ({s, c:price(s.id)/prevPrice(s.id) - 1}));
  const upsAll = ch.filter(x => x.c > 0).sort((a, b) => b.c - a.c);
  const dnsAll = ch.filter(x => x.c < 0).sort((a, b) => a.c - b.c);
  const ups = upsAll.slice(0, 10), dns = dnsAll.slice(0, 10);
  const more = upsAll.length > 10 || dnsAll.length > 10;
  const mvRow = x => `<button class="mv" data-open="${x.s.id}"><span class="nm"><span class="flag">${x.s.m}</span>${esc(x.s.n)}</span><span class="pc ${cls(x.c)}">${fmtPct(x.c)}</span></button>`;
  const hasMoves = live ? (LIVE.dates.KR.length > 1 || LIVE.dates.US.length > 1) : S.day > 0;
  $('#mvDate').textContent = live ? `한국 ${fmtDate(last(LIVE.dates.KR), false)}, 미국 ${fmtDate(last(LIVE.dates.US), false)}` : (S.day ? fmtDate(S.date, false) : '');
  $('#movers').innerHTML = hasMoves
    ? `<div><h3>상승</h3>${ups.map(mvRow).join('') || '<p class="empty">없음</p>'}</div><div><h3>하락</h3>${dns.map(mvRow).join('') || '<p class="empty">없음</p>'}</div>`
      + (more ? `<button class="mv-more" id="mvMore" aria-label="크게 움직인 종목 더 보기"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg><span>더 보기</span></button>` : '')
    : `<p class="empty" style="grid-column:1/-1">${live ? '시세가 들어오면 전 거래일 대비 등락이 여기에 표시됩니다.' : '지금은 2026년 10월 23일 종가 상태입니다. 위의 다음 거래일 버튼을 누르면 하루치 시세가 움직입니다.'}</p>`;

  if (live){
    $('#newsH').textContent = '시세 상태';
    $('#newsS').textContent = '현재가 네이버 증권 · 차트 Yahoo Finance';
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
    msg = `<p class="prose" style="margin:0">마지막 수집 ${LIVE.updated ? `${fmtDate(zoneParts('Asia/Seoul', LIVE.updated).date, false)} ${kstTime(LIVE.updated)}` : '-'}${ago !== null ? ` (${ago < 1 ? '방금' : ago + '분 전'})` : ''}.<br>${rtOnline() ? `<b style="color:#1FA35A">● 온라인</b>: 실시간 수집이 돌고 있습니다(마지막 신호 ${(Date.now() - QT.beat) < 6e4 ? '방금' : Math.floor((Date.now() - QT.beat) / 6e4) + '분 전'}).<br>장중에는 현재가를 약 7초마다(네이버 증권), 차트의 5분 봉을 1분마다(Yahoo Finance) 받습니다. 한국 5분 봉은 약 20분 늦게 그려집니다.` : `<b style="color:#E5484D">● 오프라인</b>: ${QT.err ? `실시간 시세 표를 읽지 못했습니다(${esc(QT.err)}).` : QT.beat ? `실시간 수집 신호가 ${Math.round((Date.now() - QT.beat) / 6e4)}분째 없습니다.` : '실시간 수집 신호가 아직 없습니다.'}<br>GitHub가 모은 시세만 쓰고 있어 많이 늦을 수 있습니다.`}${LIVE.miss.size ? `<br>시세를 받지 못한 종목 ${LIVE.miss.size}개는 거래할 수 없습니다: ${[...LIVE.miss].map(id => esc(BY_ID[id].n)).join(', ')}.` : ''}</p>`
      + (stale ? `<div class="alert bad" style="margin-top:8px">장중인데 시세가 ${ago}분째 갱신되지 않았습니다. 지금 보이는 가격으로 체결됩니다.</div>` : '');
  }
  return `<div class="st-list">${rows}</div>${msg}<button class="btn" id="btnRefresh2" style="margin-top:10px">시세 새로고침</button>`;
}

/* ───────── 렌더: 시장 ───────── */
function renderMarket(){ renderInvest(); }
function renderStockPane(){
  const v = $('#mk-stock'); if (!v) return renderInvest();
  if (!v.dataset.built){
    v.dataset.built = 1;
    v.innerHTML = `
    <div class="mkt-head">
      <div class="seg" role="group" aria-label="시장 선택"><button data-mkt="KR">한국 300</button><button data-mkt="US">미국 300</button></div>
      <div class="tools">
        <label class="search"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg><span class="sr">종목 검색</span><input id="q" type="search" placeholder="종목명, 티커, 종목코드" autocomplete="off" value="${esc(UI.qRaw || '')}"><button type="button" class="q-clear" id="qClear" aria-label="검색어 지우기"${UI.qRaw ? '' : ' hidden'}>×</button></label>
        <select class="pick" id="sortSel" aria-label="정렬"><option value="cap">시가총액순</option><option value="up">상승률순</option><option value="down">하락률순</option><option value="base">기준가 대비</option><option value="own">보유 종목 먼저</option></select>
        <select class="pick" id="secSel" aria-label="업종"></select>
      </div>
    </div>
    <div class="list-head" aria-hidden="true"><span></span><span>종목</span><span>시가총액</span><span>기준가 대비</span><span>최근 30일</span><span>현재가</span></div>
    <div class="list" id="mktList"></div>
    <p class="muted" style="margin:10px 2px 0" id="mktFoot"></p>`;
    $('#q').addEventListener('input', e => { UI.qRaw = e.target.value; UI.q = e.target.value.trim().toLowerCase(); $('#qClear').hidden = !e.target.value; renderMarketList(); });
    // 검색어 한 번에 지우기 (label 안이라 기본 동작을 막아 입력칸에 다시 초점만 준다)
    $('#qClear').addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const q = $('#q'); q.value = ''; UI.q = ''; UI.qRaw = ''; $('#qClear').hidden = true; renderMarketList(); q.focus(); });
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
  let list = STOCKS.filter(s => s.m === UI.mkt && (!s.hide || S.pos[s.id]));   // 목록에서 빠진 종목은 가진 사람에게만 보인다
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
      <span class="rk">${s.etf ? 'ETF' : rankOf[s.id]}</span>
      <span class="mono" style="--h:${SECTORS[s.s].h}" aria-hidden="true">${esc(monoText(s))}</span>
      <span class="nmb"><div class="n">${esc(s.n)}${own}</div><div class="s">${esc(s.t)} ${s.m === 'KR' ? s.x : ''} ${SECTORS[s.s].ko}</div></span>
      <span class="wcol num">${s.etf ? `<span class="muted">${esc(s.ix)} ${s.lev === 1 ? '' : (s.lev > 0 ? s.lev + '배' : MINUS + Math.abs(s.lev) + '배')}</span>` : fmtCap(s)}</span>
      <span class="wcol num ${cls(bc(s))}">${fmtPct(bc(s))}</span>
      ${sparkSVG(a, cls(p/a[Math.max(0, a.length-30)]-1))}
      <span class="px"><div class="p num">${fmtPx(s, p)}</div><div class="c num ${miss ? 'flat' : cls(c)}">${miss ? '시세 없음' : showChange ? fmtPct(c) : '기준가'}</div></span>
    </button>`;
  }).join('') : `<p class="empty" style="padding:18px">조건에 맞는 종목이 없습니다. 검색어나 업종을 바꿔보세요.</p>`;
  const fx = fmtFX(FX());
  if (live){
    const st = mstate(UI.mkt);
    $('#mktFoot').textContent = `${SESS[UI.mkt].ko} 시장 ${st.label} · 정규장 ${sessInKST(UI.mkt)} · 등락률은 전 거래일 종가 대비`;
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
  let cost = 0; for (const id in S.pos) cost += toUSD(BY_ID[id], S.pos[id].cost);
  const unreal = V - cost;
  const ret = twrRet(N);
  const kRet = last(idxHist('KR'))/1000 - 1, uRet = last(idxHist('US'))/1000 - 1;
  const maxAbs = Math.max(.05, Math.abs(ret), Math.abs(kRet), Math.abs(uRet));
  const benchRow = (l, r, c) => {
    const w = Math.abs(r) / maxAbs * 50;
    return `<div class="bench-r"><span>${l}</span><span class="bar"><i style="${r >= 0 ? `left:50%;width:${w}%` : `right:50%;width:${w}%`};background:${c}"></i></span><span class="num ${cls(r)}" style="text-align:right;font-weight:700">${fmtPct(r)}</span></div>`;
  };
  const ids = Object.keys(S.pos).sort((a, b) => S.pos[b].q*toUSD(BY_ID[b], price(b)) - S.pos[a].q*toUSD(BY_ID[a], price(a)));
  const holdRows = ids.map(id => {
    const s = BY_ID[id], P = S.pos[id], p = price(id);
    const val = P.q * toUSD(s, p), plN = P.q * p - P.cost, plr = P.cost ? plN / P.cost : 0;
    return `<button class="hold" data-open="${id}" data-from="assets">
      <span class="mono" style="--h:${SECTORS[s.s].h}">${esc(monoText(s))}</span>
      <span class="nmb"><div class="n">${esc(s.n)}</div><div class="s">${P.q.toLocaleString()}주, 평균 ${fmtPx(s, P.avg)}</div></span>
      <span class="px"><div class="p num">${s.cur === 'KRW' ? fmtKRW(P.q * p) : fmtUSD(val)}</div><div class="c num ${cls(plN)}">${s.cur === 'KRW' ? (plN > 0 ? '+' : '') + fmtKRW(plN) : signUSD(plN)} (${fmtPct(plr)})</div></span>
    </button>`;
  }).join('');
  const tradeRows = n => S.trades.slice(0, n).map(t => {
    const s = BY_ID[t.id];
    const when = isLive() && t.at ? `${fmtDate(t.dt, false)}<br><span class="muted">${kstTime(new Date(t.at))}</span>` : fmtDate(t.dt, false);
    return `<tr><td>${when}</td><td><span class="side ${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? '매수' : '매도'}</span>${t.tag ? `<br><span class="tag" style="margin:2px 0 0">${esc(t.tag)}</span>` : ''}</td><td>${esc(s.n)}<br><span class="muted">${t.q.toLocaleString()}주 × ${fmtPx(s, t.p)}</span></td><td class="r num">${t.side === 'buy' ? MINUS : '+'}${t.amt !== undefined ? fmtPx(s, t.amt) : fmtUSD(t.usd)}</td></tr>`;
  }).join('');
  UI.tradeRows = tradeRows;
  v.innerHTML = `
  <div class="stack">
    <dl class="sum-grid">
      <div class="s-nw"><dt>순자산</dt><dd class="num">${fmtUSD(N)}</dd></div>
      <div class="s-st"><dt>주식 평가액</dt><dd class="num">${fmtUSD(V)}</dd></div>
      <div class="s-cash"><dt>현금</dt><dd class="num">${fmtUSD(S.usd + S.krw / FX())}</dd><small class="muted">${fmtUSD(S.usd)} + ${fmtKRW(S.krw)}</small></div>
      <div class="s-pts"><dt>포인트</dt><dd class="num">${fmtUSD(S.pts || 0)}</dd><small class="muted">미니게임으로 받은 합계</small></div>
      <div class="s-ret"><dt>수익률</dt><dd class="num ${cls(ret)}">${fmtPct(ret)}</dd></div>
      <div class="s-pl"><dt>손익</dt><dd class="num ${cls(N - META.seed - (S.pts || 0))}">${signUSD(N - META.seed - (S.pts || 0))}</dd><small class="muted">순자산 − 시드 − 포인트</small></div>
    </dl>
    <div class="assets-grid">
      <div class="as-a">
      <section class="card ao1"><div class="card-h"><h2>보유 종목</h2><small>${ids.length}개</small></div>
        ${holdRows || '<p class="empty">아직 보유한 종목이 없습니다. 투자 탭에서 종목을 눌러 매수해 보세요.</p>'}
      </section>
      ${altAssetsHTML()}
        ${(S.divLog || []).length ? `<section class="card ao6"><div class="card-h"><h2>배당금 내역</h2><small>최근 30건, 세후 입금</small></div>
          <div class="tbl-wrap"><table class="trades"><thead><tr><th>배당락일</th><th>종목</th><th class="r">입금</th></tr></thead><tbody>${S.divLog.slice(0, 30).map(x => { const st = BY_ID[x.id]; return `<tr><td>${fmtDate(x.d, false)}</td><td>${esc(st ? st.n : x.id)}<br><span class="muted">${x.q.toLocaleString()}주 × ${fmtPx(st, x.ps)}, 세금 ${fmtPx(st, x.tax)}</span></td><td class="r num up">+${fmtPx(st, x.net)}</td></tr>`; }).join('')}</tbody></table></div></section>` : ''}
        <section class="card ao7"><div class="card-h"><h2>예약 주문</h2><small>대기 ${ordersOf().length}건</small></div>
          ${(S.orders || []).length ? `<div class="olist">${(S.orders || []).slice(0, 20).map(o => orderRowHTML(o, true)).join('')}</div>` : '<p class="empty">걸어 둔 예약 주문이 없습니다. 종목을 열고 "예약 주문"을 고르면 걸 수 있습니다.</p>'}
        </section>
        <section class="card ao3"><div class="card-h"><h2>지수와 비교</h2><small>10월 23일 종가 대비</small></div>
          <div class="bench">${benchRow('내 순자산', ret, 'var(--brass)')}${benchRow('한국 300', kRet, '#6E8BFF')}${benchRow('미국 300', uRet, '#8A93A6')}</div>
        </section>
        <button class="card hist-open ao8" id="histOpen"><span><b>거래 내역</b><small>주식 ${S.trades.length.toLocaleString()}건 · 채권·주택·복권·도박 ${(S.altLog || []).length.toLocaleString()}건 · 환전 ${(S.fxLog || []).length.toLocaleString()}건</small></span><span class="go" aria-hidden="true">›</span></button>
      </div>
      <div class="as-b">
        <section class="card ao2" id="rankCard">${rankCardHTML()}</section>
      </div>
    </div>
  </div>`;
  $('#histOpen').onclick = openHistory;
}
/* 거래 내역 팝업: 주식 / 채권·주택·복권·도박 */
function openHistory(){
  UI.histK = UI.histK || 'stock';
  showModal(`<h2>거래 내역</h2><div id="histBox"></div><div class="acts"><button class="btn solid" data-close>닫기</button></div>`);
  $('#modal').dataset.kind = 'info';
  renderHistory();
}
function renderHistory(){
  const box = $('#histBox'); if (!box) return;
  const k = UI.histK, nS = S.trades.length, nA = (S.altLog || []).length;
  const seg = (v, l) => `<button data-histk="${v}" aria-pressed="${k === v}">${l}</button>`;
  let body;
  if (k === 'stock'){
    const tr = UI.tradeRows ? UI.tradeRows(200) : '';
    body = tr ? `<table class="trades"><thead><tr><th>날짜</th><th>구분</th><th>종목</th><th class="r">결제 금액</th></tr></thead><tbody>${tr}</tbody></table>` : '<p class="empty">주식 거래 내역이 없습니다.</p>';
  } else if (k === 'fx'){
    const fx = (S.fxLog || []).map(x => `<tr><td>${fmtDate(x.dt, false)}</td><td>${x.dir === 'u2k' ? '달러 → 원화' : '원화 → 달러'}<br><span class="muted">1달러 = ${fmtFX(x.rate)}원</span></td><td class="r num">${x.dir === 'u2k' ? fmtUSDn(x.from) : fmtKRWn(x.from)}</td><td class="r num">${x.dir === 'u2k' ? fmtKRWn(x.to) : fmtUSDn(x.to)}</td></tr>`).join('');
    body = fx ? `<table class="trades"><thead><tr><th>날짜</th><th>방향</th><th class="r">낸 금액</th><th class="r">받은 금액</th></tr></thead><tbody>${fx}</tbody></table>` : '<p class="empty">환전 내역이 없습니다.</p>';
  } else {
    const log = (S.altLog || []).map(x => `<tr><td>${esc(x.dt || '')}<br><span class="muted">${kstTime(new Date(x.at))}</span></td><td>${esc(x.s)}</td><td class="r num ${x.amt > 0 ? 'up' : ''}">${x.amt > 0 ? '+' : x.amt < 0 ? MINUS : ''}${x.cur === 'USD' ? fmtUSD(Math.abs(x.amt)) : fmtKRW(Math.abs(x.amt))}</td></tr>`).join('');
    body = log ? `<table class="trades"><thead><tr><th>날짜</th><th>내용</th><th class="r">금액</th></tr></thead><tbody>${log}</tbody></table>` : '<p class="empty">채권·주택·복권·도박 내역이 없습니다.</p>';
  }
  box.innerHTML = `<div class="mv-tools"><div class="seg hist-seg">${seg('stock', '주식')}${seg('alt', '채권·주택·복권·도박')}${seg('fx', '환전')}</div></div>
    <small class="muted">${k === 'stock' ? `최근 ${Math.min(200, nS).toLocaleString()}건${nS > 200 ? ` (전체 ${nS.toLocaleString()}건)` : ''}` : k === 'fx' ? `최근 ${(S.fxLog || []).length.toLocaleString()}건` : `최근 ${nA.toLocaleString()}건 (최대 300건까지 남김)`}</small>
    <div class="info-body hist-body">${body}</div>`;
  $$('#histBox [data-histk]').forEach(b => b.onclick = () => { UI.histK = b.dataset.histk; renderHistory(); });
}

/* ───────── 렌더: 대출 ───────── */
function renderLoans(){
  const v = $('#v-loans');
  const live = isLive();
  const R = rates(), L = limits(), C = S.loans.credit, M = S.loans.margin, O = S.loans.od;
  const gr = g(), U = termUnit(), YD = yearDays();
  const ratio = marginRatio();
  const gaugePos = isFinite(ratio) ? clamp((ratio - 1) / 2, 0, 1) * 100 : 100;
  INFO.loanf = {t:'대출 계산식 <small class="muted">모든 금액은 달러 기준</small>', h:`
      <div class="fx-block">
        <div class="fx-item"><h4>빌릴 때 수수료</h4>
          <div class="eq"><i>B</i> ← <i>B</i> + <i>A</i> × (1 + 0.03)</div>
          <ul class="defs"><li><span class="sym">A</span><span>새로 빌린 금액(달러). 통장에는 <i>A</i>가 그대로 들어옵니다.</span></li><li><span class="sym">B</span><span>대출 잔액(갚아야 할 돈, 달러)</span></li></ul>
          <p class="prose" style="margin:8px 0 0">신용대출, 주식담보대출, 마이너스통장 모두 빌릴 때마다 붙습니다. 한도는 수수료까지 더한 잔액이 상한을 넘지 않게 계산합니다. 수수료는 '낸 이자'에 포함됩니다.</p>
        </div>
        <div class="fx-item"><h4>하루 이자 (복리)</h4>
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
`};
  INFO.grade = {t:'신용등급', h:`<div class="prose"><p>1등급이 가장 좋습니다. 등급이 대출 금리와 한도, 환전 우대율을 정합니다.</p><ul>
    <li>신용대출을 ${META.gradeHold}${U} 이상 쓰고 만기 전에 연체 없이 완납하면 0.5등급 오릅니다.</li>
    <li>연체가 없으면 ${live ? '20일' : '20거래일'}마다 0.1등급 오릅니다.</li>
    <li>신용대출이 연체되면 하루 0.4등급씩 내려가고, 반대매매가 생기면 더 내려갑니다.</li>
    <li>게임 기준금리는 연 ${S.base.toFixed(2)}%입니다${live ? ' (실제 시세 모드에서는 고정)' : ''}.</li></ul></div>`};
  const LOAN_SHORT = {credit:`만기 ${META.creditTerm}${U} · 수수료 3% · 일복리`, margin:`주식 평가액의 ${META.ltv*100}%까지 · 만기 없음 · 반대매매 위험`, od:'모자랄 때 자동으로 빌리고 자동으로 갚음'};
  const card = (key, title, desc, apr, kv, body, warn) => { INFO['loan-' + key] = {t:title, h:`<p class="prose">${desc}</p>`}; return cardHTML(key, title, apr, kv, body, warn); };
  const cardHTML = (key, title, apr, kv, body, warn) => `
    <section class="card loan" data-loan="${key}">
      <div class="loan-top"><div><h3>${title} ${infoBtn('loan-' + key)}</h3><p>${LOAN_SHORT[key]}</p></div><div class="apr"><b class="num">${apr.toFixed(2)}%</b><span>연이율, 등급 따라 변동</span></div></div>
      ${warn || ''}
      <dl class="kv">${kv.map(([k, val]) => `<div><dt>${k}</dt><dd class="num">${val}</dd></div>`).join('')}</dl>
      ${body}
    </section>`;
  const amtBox = key => `<label class="amt"><span>$</span><input inputmode="decimal" type="number" min="0" step="10" placeholder="금액" id="amt-${key}" aria-label="금액(달러)"></label>`;
  const remain = C.due === null ? null : live ? daysBetween(kstDate(), C.due) : C.due - S.day;
  let cWarn = '';
  if (C.overdue > 0) cWarn = `<div class="alert bad">연체 ${C.overdue}${U}째입니다. ${Math.max(0, 5 - C.overdue)}${U} 안에 갚지 않으면 반대매매됩니다.${live && S.pend.credit ? ' 연체 반대매매가 대기 중이어서 장이 열리면 바로 실행됩니다.' : ''}</div>`;
  else if (C.bal > 0 && C.due !== null) cWarn = `<div class="alert">만기${live ? `(${fmtDate(C.due, false)})` : ''}까지 ${Math.max(0, remain)}${U} 남았습니다. 만기일에 달러 통장에서 자동 상환되고, 달러가 모자라면 원화를 자동 환전합니다.</div>`;
  let mWarn = '';
  if (M.bal > 0){
    mWarn = `<div><div class="gauge" role="img" aria-label="담보유지비율 ${isFinite(ratio) ? (ratio*100).toFixed(0) : '-'}%"><i style="left:${gaugePos}%"></i></div><div class="gauge-cap"><span>100%</span><span>반대매매 120%</span><span>경고 140%</span><span>300%+</span></div></div>`
      + (ratio < META.marginWarn ? `<div class="alert bad">담보유지비율 ${(ratio*100).toFixed(0)}%. 120% 아래로 내려가면 ${live ? '보유 종목의 장이 열려 있을 때' : '다음 정산 때'} 자동 반대매매됩니다.</div>` : '');
  }
  v.innerHTML = `
  <div class="loans-grid">
    <section class="card wide">
      <div class="grade">
        <div class="grade-n num" style="color:${gradeColor(S.grade)}">${gr}<small>등급</small></div>
        <div>
          <div style="font-weight:750">신용등급</div>
          <div class="ladder" aria-hidden="true">${Array.from({length:10}, (_, i) => `<i class="${10 - i >= gr ? 'on' : ''}"${10 - i >= gr ? ` style="background:${gradeColor(10 - i)};border-color:${gradeColor(10 - i)}"` : ''}></i>`).join('')}</div>
          <div class="muted">1등급이 가장 좋습니다. 등급이 금리와 한도를 정합니다. ${infoBtn('grade', '등급 규칙')}</div>
        </div>
      </div>
    </section>
    ${card('credit', '신용대출', `순자산과 신용등급으로 한도가 정해지는 대출입니다. 만기 ${META.creditTerm}${U}. 빌릴 때 금액의 3%가 수수료로 빚에 더해지고, 이자는 ${live ? '날마다' : '거래일마다'} 빚에 더해집니다(복리).`, R.credit,
      [['대출 잔액', fmtUSD(C.bal)], ['더 빌릴 수 있는 금액', fmtUSD(L.credit)], ['남은 기간', C.bal > 0 && C.due !== null ? (C.overdue > 0 ? `연체 ${C.overdue}${U}` : `${Math.max(0, remain)}${U}`) : '없음']],
      `<div class="act">${amtBox('credit')}<button class="btn brass" data-borrow="credit">빌리기</button><button class="btn" data-repay="credit" ${C.bal > 0 ? '' : 'disabled'}>갚기</button><button class="btn" data-repayall="credit" ${C.bal > 0 ? '' : 'disabled'}>전액 상환</button></div><div class="loan-est" id="est-credit">${loanEstHTML('credit', 0)}</div>`, cWarn)}
    ${card('margin', '주식담보대출', `보유 주식 평가액의 ${META.ltv*100}%까지 빌립니다. 빌릴 때 3% 수수료가 빚에 더해집니다. 담보유지비율이 120% 아래로 떨어지면 자동 반대매매됩니다.`, R.margin,
      [['대출 잔액', fmtUSD(M.bal)], ['더 빌릴 수 있는 금액', fmtUSD(L.margin)], ['담보유지비율', M.bal > 0 ? (ratio*100).toFixed(0) + '%' : '해당 없음']],
      `<div class="act">${amtBox('margin')}<button class="btn brass" data-borrow="margin" ${L.margin > 1 ? '' : 'disabled'}>빌리기</button><button class="btn" data-repay="margin" ${M.bal > 0 ? '' : 'disabled'}>갚기</button><button class="btn" data-repayall="margin" ${M.bal > 0 ? '' : 'disabled'}>전액 상환</button></div><div class="loan-est" id="est-margin">${loanEstHTML('margin', 0)}</div>`, mWarn)}
    ${card('od', '마이너스통장', '달러 통장에 연결된 한도 대출입니다. 달러보다 큰 미국 주식 주문이나 환전을 하면 자동으로 빌려지고, 달러가 들어오면 먼저 갚습니다. 끌어 쓸 때마다 그 금액의 3%가 수수료로 빚에 더해집니다.', R.od,
      [['사용액', fmtUSD(O.bal)], ['한도', fmtUSD(L.odLimit)], ['더 쓸 수 있는 금액', fmtUSD(odAvail())]],
      `<div class="act">${amtBox('od')}<button class="btn" data-repay="od" ${O.bal > 0 ? '' : 'disabled'}>갚기</button><button class="btn" data-repayall="od" ${O.bal > 0 ? '' : 'disabled'}>전액 상환</button></div>`)}
    ${infoRow('loanf', '대출 계산식', '수수료, 하루 이자(복리), 담보유지비율, 대출 금리, 한도')}
  </div>`;
}

/* ───────── 렌더: 규칙·설정 ───────── */
function renderInfo(){
  const v = $('#v-info');
  const live = isLive();
  const ests = STOCKS.filter(s => s.note);
  INFO.rules = {t:'게임 규칙', h:`<div class="prose">
      <ul>
        <li>시드머니는 달러 통장에 들어 있는 <b>$10,000</b>입니다.</li>
        ${live ? `
        <li><b>실제 시세 모드</b>: 실제 주가를 따라갑니다. 장중에는 현재가를 약 7초마다 받습니다(네이버 증권 실시간 시세). 화면에는 열어 둔 종목과 예약 주문 종목이 7초마다, 나머지(보유 종목, 순자산, 시장 목록)가 1분마다 반영됩니다. 차트의 5분 봉은 Yahoo Finance 자료라 한국은 약 20분 늦게 그려지고, 장이 끝난 뒤 15:00~15:30 구간이 채워집니다. 장이 끝나고 그날 차트가 다 들어올 때까지(한국 보통 16:10 전후, 미국 뉴욕 16:20)는 '마감 집계 중'으로 표시됩니다. 이때 바로 주문은 할 수 없고, 장중에 걸어 둔 예약 주문만 늦게 들어온 장중 가격으로 체결될 수 있습니다. 체결 알림에는 그 가격의 시각이 함께 나옵니다. 수능일(한국 10:00~16:30), 새해 첫 거래일(한국 10:00 개장), 미국 조기 폐장일(11/27, 12/24 뉴욕 13:00 마감)은 바뀐 장 시간을 따릅니다.</li>
        <li>각 시장의 <b>정규장</b>에만 거래할 수 있습니다. 한국 ${sessInKST('KR')}, 미국 ${sessInKST('US')}(한국 시각, 서머타임 반영). 공휴일은 그날 시세가 들어오지 않는 것으로 판단합니다.</li>
        <li>체결가는 마지막으로 수집된 가격입니다. 화면의 시세 시각을 확인하세요.</li>
        <li><b>예약 주문</b>: 예약 매수는 가격이 정한 값 이하가 되면, 예약 매도는 정한 값이 걸 때의 현재가보다 높으면 그 값 이상으로 오를 때, 낮으면 그 값 이하로 내려갈 때 체결됩니다. 체결가는 조건에 처음 닿은 시세이고, 게임을 꺼 둔 동안 닿았어도 다시 열 때 그 시각의 시세로 체결됩니다. 돈과 보유 수량은 체결할 때 확인하며, 유효기간은 ${ORDER_DAYS}일입니다.</li>
        <li>대출 이자는 주말을 포함해 날마다 붙고, 신용대출 만기는 ${META.creditTerm}일입니다.</li>` : `
        <li><b>시뮬레이션 모드</b>: 다음 거래일을 누를 때마다 하루치 시세가 시뮬레이션됩니다. 주말은 건너뛰고, 공휴일은 따로 반영하지 않습니다.</li>
        <li>한국 주식은 하루 ±30% 가격제한폭과 호가 단위를 적용합니다.</li>`}
        <li>주문은 정수 주 단위 시장가로 즉시 체결됩니다. 거래 수수료는 체결 금액의 0.1%입니다.</li>
        <li>계좌는 <b>달러 통장</b>과 <b>원화 통장</b>으로 나뉩니다. 한국 주식은 원화 통장으로, 미국 주식과 대출은 달러 통장으로 오갑니다. 두 통장 사이는 홈의 환전하기로 옮깁니다.</li>
        <li>환전할 때는 매매기준율에 수수료가 붙은 환율이 적용되고, 신용등급이 좋을수록 환전 우대율이 높습니다.</li>
        <li><b>배당</b>: 실제 시세 모드는 종목의 실제 배당락일에, 그 전 거래일 장 마감 때 들고 있던 주식 수만큼 실제 배당금을 줍니다(배당락일에 팔아도 받습니다). 시뮬레이션 모드는 종목별 실제 최근 1년 배당수익률과 횟수에 맞춰 게임 속 날짜에 주고, 그날 주가도 배당만큼 낮아집니다. 세금은 한국 주식 15.4%(배당소득세 14% + 지방소득세 1.4%), 미국 주식 15%(원천징수)를 떼고 그 나라 통화 통장으로 들어옵니다.</li>
        <li>모든 대출은 빌릴 때 금액의 3%가 수수료로 빚에 더해지고, 그 뒤 이자가 날마다 빚에 더해지는 복리입니다. 마이너스통장도 끌어 쓸 때마다 같습니다.</li>
        <li>대출 만기에 달러가 모자라면 원화 통장에서 자동으로 환전해 갚고, 반대매매로 판 한국 주식 대금도 자동으로 달러로 바꿔 대출을 갚습니다.</li>
        <li>순자산이 0 이하가 되면 파산하고 게임이 끝납니다.</li>
        <li>홈 화면의 차트 맞히기: 이름을 가린 실제 종목의 지난 60거래일 종가와 거래량을 보고 3거래일 뒤 종가가 오를지 내릴지 고릅니다. 하루 10문제, 맞히면 $10 포인트(하루 최대 $100)가 달러 통장에 들어옵니다. 시뮬레이션 모드에서는 게임 속 거래일마다 10문제입니다. 포인트는 투자에 쓸 수 있지만 수익률 계산에서는 빠집니다.</li>
        <li>진행 상황은 이 브라우저에 자동 저장됩니다. 다른 기기와는 공유되지 않습니다.</li>
      </ul>
</div>`};
  INFO.formulas = {t:'계산식', h:`
      <div class="fx-block">
        <div class="fx-item"><h4>순자산과 수익률</h4>
          <div class="eq multi"><span class="p"><i>N</i> = <i>C</i><sub>$</sub> + <i>C</i><sub>₩</sub> ÷ <i>X</i> + <i>V</i> − (<i>L</i><sub>c</sub> + <i>L</i><sub>m</sub> + <i>L</i><sub>o</sub>),</span><span class="p">수익률 = (<i>F</i> × <i>N</i> ÷ <i>B</i> − 1) × 100 (%)</span></div>
          <ul class="defs"><li><span class="sym">N</span><span>순자산(달러)</span></li><li><span class="sym">C<sub>$</sub></span><span>달러 통장 잔액(달러)</span></li><li><span class="sym">C<sub>₩</sub></span><span>원화 통장 잔액(원)</span></li><li><span class="sym">X</span><span>매매기준율(1달러당 원). 순자산을 셀 때는 수수료를 빼지 않습니다.</span></li><li><span class="sym">V</span><span>보유 주식 평가액의 합(달러)</span></li><li><span class="sym">L<sub>c</sub></span><span>신용대출 잔액</span></li><li><span class="sym">L<sub>m</sub></span><span>주식담보대출 잔액</span></li><li><span class="sym">L<sub>o</sub></span><span>마이너스통장 사용액</span></li><li><span class="sym">B</span><span>지금 기간이 시작할 때의 순자산. 처음에는 시드 10000, 미니게임 포인트를 받을 때마다 (받기 직전 순자산 + 포인트)로 바뀝니다.</span></li><li><span class="sym">F</span><span>지난 기간들의 (끝 순자산 ÷ 시작 순자산)을 모두 곱한 값. 처음에는 1입니다.</span></li></ul>
          <p class="prose" style="margin:8px 0 0">포인트가 들어올 때마다 기간을 끊고 기간별 수익률을 곱해 잇는 시간가중수익률입니다. 포인트는 수익이 아니므로 빠지고, 같은 매매를 했다면 포인트를 언제 얼마나 받았든 수익률이 같습니다. 포인트를 한 번도 받지 않았다면 (<i>N</i> − 10000) ÷ 10000 × 100과 같습니다.</p>
        </div>
        <div class="fx-item"><h4>한국 주식 평가액(달러 환산)</h4>
          <div class="eq"><i>V</i><sub>i</sub> = <i>q</i><sub>i</sub> × <i>P</i><sub>i</sub> ÷ <i>X</i></div>
          <ul class="defs"><li><span class="sym">V<sub>i</sub></span><span>종목 i의 평가액(달러)</span></li><li><span class="sym">q<sub>i</sub></span><span>종목 i의 보유 수량(주)</span></li><li><span class="sym">P<sub>i</sub></span><span>종목 i의 현재가(원)</span></li><li><span class="sym">X</span><span>원/달러 환율(1달러당 원)${live ? '. 실제 시세 모드에서는 Yahoo Finance의 원/달러 시세' : ''}</span></li></ul>
        </div>
        <div class="fx-item"><h4>환전</h4>
          <div class="eq multi"><span class="p"><i>f</i> = <i>s</i> × (1 − <i>p</i>),</span><span class="p"><i>X</i><sub>살 때</sub> = <i>X</i>(1 + <i>f</i>),</span><span class="p"><i>X</i><sub>팔 때</sub> = <i>X</i>(1 − <i>f</i>)</span></div>
          <div class="eq multi" style="margin-top:6px"><span class="p"><i>W</i> = <i>A</i><sub>$</sub> × <i>X</i><sub>팔 때</sub>,</span><span class="p"><i>D</i> = <i>A</i><sub>₩</sub> ÷ <i>X</i><sub>살 때</sub></span></div>
          <ul class="defs"><li><span class="sym">X</span><span>매매기준율(1달러당 원)</span></li><li><span class="sym">s</span><span>기본 스프레드 0.01 (1%)</span></li><li><span class="sym">p</span><span>환전 우대율. 신용등급 <i>G</i>에 따라 0.9 − 0.1(<i>G</i> − 1), 최소 0</span></li><li><span class="sym">f</span><span>실제로 적용되는 수수료율</span></li><li><span class="sym">X<sub>살 때</sub></span><span>달러를 살 때(원화 → 달러) 환율</span></li><li><span class="sym">X<sub>팔 때</sub></span><span>달러를 팔 때(달러 → 원화) 환율</span></li><li><span class="sym">A<sub>$</sub></span><span>원화로 바꿀 달러 금액</span></li><li><span class="sym">W</span><span>받는 원화 (원 단위 내림)</span></li><li><span class="sym">A<sub>₩</sub></span><span>달러로 바꿀 원화 금액</span></li><li><span class="sym">D</span><span>받는 달러 (센트 단위 내림)</span></li></ul>
          <p class="prose" style="margin:8px 0 0">예: 매매기준율 1,320원, 4등급(우대율 60%)이면 <i>f</i> = 0.01 × 0.4 = 0.004이고, 달러 팔 때 환율은 1,320 × 0.996 = 1,314.72원입니다.</p>
        </div>
        <div class="fx-item"><h4>주식 결제 금액</h4>
          <div class="eq"><i>T</i> = <i>P</i> × <i>q</i> × (1 ± <i>c</i>)</div>
          <ul class="defs"><li><span class="sym">T</span><span>통장에서 빠지거나(매수, +) 들어오는(매도, −) 금액. 한국 주식은 원화 통장, 미국 주식은 달러 통장</span></li><li><span class="sym">P</span><span>체결가</span></li><li><span class="sym">q</span><span>수량(주)</span></li><li><span class="sym">c</span><span>거래 수수료율 0.001</span></li></ul>
          <p class="prose" style="margin:8px 0 0">주식을 살 때 그 나라 통화가 모자라면 다른 통화 통장에서 부족한 만큼만 자동으로 환전해서 삽니다(한국 주식은 달러 → 원화, 미국 주식은 원화 → 달러). 두 통장을 합쳐도 모자라면 마이너스통장 한도 안에서 빌립니다. 주문 화면의 '50%·최대' 버튼은 마이너스통장을 빼고 두 통장만으로 살 수 있는 수량입니다.</p>
        </div>
        <div class="fx-item"><h4>한국 300·미국 300 지수</h4>
          <div class="eq"><i>I</i><sub>t</sub> = 1000 × Σ<sub>i</sub> <i>W</i><sub>i</sub> (<i>P</i><sub>i,t</sub> ÷ <i>P</i><sub>i,0</sub>) ÷ Σ<sub>i</sub> <i>W</i><sub>i</sub></div>
          <ul class="defs"><li><span class="sym">I<sub>t</sub></span><span>t일의 지수 값 (10월 23일 = 1000)</span></li><li><span class="sym">W<sub>i</sub></span><span>종목 i의 10월 23일 시가총액 (가중치)</span></li><li><span class="sym">P<sub>i,t</sub></span><span>종목 i의 t일 가격</span></li><li><span class="sym">P<sub>i,0</sub></span><span>종목 i의 10월 23일 종가</span></li></ul>
          <p class="prose" style="margin:8px 0 0">게임 안 300개 종목만으로 계산한 값이라 코스피나 S&amp;P 500과는 다릅니다.</p>
        </div>
        ${live ? '' : `<div class="fx-item"><h4>하루 가격 변동 모델 (시뮬레이션)</h4>
          <div class="eq multi"><span class="p"><i>P</i><sub>t+1</sub> = <i>P</i><sub>t</sub> · e<sup><i>r</i><sub>t</sub></sup>,</span><span class="p"><i>r</i><sub>t</sub> = <i>β</i>(<i>m</i><sub>t</sub> + <i>M</i><sub>t</sub>) + <i>s</i><sub>t</sub> + <i>ε</i><sub>t</sub> + <i>J</i><sub>t</sub> − <i>σ</i>² ÷ (2 × 252)</span></div>
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
`};
  INFO.data = {t:'데이터 기준', h:`<div class="prose">
      <p>종목 목록과 기준가는 <b>2026년 10월 23일(금) 종가</b>입니다. 한국 시간 10월 26일 오후 9시는 미국 동부 시간 오전 8시라 미국은 정규장 전이었고, 직전 종가가 10월 23일 종가입니다. 한국은 일괄로 확인할 수 있었던 데이터가 10월 23일 종가 기준이어서 두 시장을 같은 날로 맞췄습니다.</p>
      ${live ? `<p><b>실제 시세</b>는 두 곳에서 읽습니다. 장중 현재가는 Supabase 함수가 약 7초마다 네이버 증권 실시간 시세에서, 그날 5분 봉은 1분마다 Yahoo Finance에서 받아 저장한 표에서, 지난 거래일 종가와 장기 차트는 GitHub Actions가 받아 사이트에 함께 배포한 data/prices.json과 data/c/에서 읽습니다. 네이버·Yahoo 시세는 공식 거래소 시세가 아니고, 둘 다 공개된 공식 API가 아니어서 가끔 빠지거나 늦을 수 있습니다. 실제 시세 모드의 기준가는 Yahoo가 준 10월 23일 종가라서 아래 시뮬레이션용 기준가와 조금 다를 수 있습니다.</p>` : '<p>이후 시세는 모두 시뮬레이션입니다.</p>'}
      <ul>
        <li><b>처음 100종목씩</b> (10월 26일 구성): 미국은 companiesmarketcap.com의 미국 기업 시가총액 순위 1~100위, 한국은 같은 사이트의 한국 기업 순위에서 중복 항목(SK이노베이션 우선주)을 빼고 101위(삼성카드)까지. 이 사이트는 한국 기업 178곳만 다뤄 일부 코스닥 대형주가 빠져 있었습니다.</li>
        <li><b>추가 200종목씩</b> (10월 27일 추가): 한국은 한국거래소 상장 목록(코스피·코스닥, 우선주와 스팩 제외)에서 상장주식수 × 10월 23일 종가로 계산한 시가총액 순위, 미국은 companiesmarketcap.com 미국 기업 순위의 시가총액을 10월 23일 종가로 환산한 순위로, 기존 100종목을 빼고 위에서부터 채웠습니다. 추가 종목의 기준가는 Yahoo Finance의 10월 23일 종가입니다. 워너브라더스 디스커버리는 Yahoo에 시세가 없어 뺐습니다.</li>
        <li><b>시뮬레이션 기준가(원화, 처음 100종목)</b>: 사이트의 달러 가격 × 1,325.2원(삼성전자·SK하이닉스·두산에너빌리티 등의 실제 10/23 종가가 그대로 맞아떨어지는 환산율)을 호가 단위로 반올림. 원 단위 가격이 4자리로 반올림돼 있던 종목은 수백 원 오차가 있을 수 있습니다.</li>
        <li><b>예외 ${ests.length}종목</b>: 사이트에 ADR이나 우선주 가격만 있던 종목은 뉴스로 확인한 보통주 종가로 바꿨습니다. KT만 보통주 종가를 확인하지 못해 추정치입니다.</li>
        <li><b>시뮬레이션 시작 환율</b>: 10월 26일 오후 3시 30분 원/달러 1,323.10원(전일 대비 1.5원 하락)에서 역산한 10월 23일 값 1,324.60원.</li>
      </ul>
      <p style="margin-top:6px">예외 종목: ${ests.map(s => `${esc(s.n)}${s.est ? '(추정)' : ''}`).join(', ')}</p>
</div>`};
  v.innerHTML = `
  <div class="loans-grid">
    <section class="card">
      <div class="card-h"><h2>설정</h2></div>
      ${accountRowsHTML()}
      <div class="set-row"><div class="l">게임 모드<small>지금은 ${live ? '실제 시세' : '시뮬레이션'} 모드입니다. 모드마다 기록이 따로 저장됩니다.</small></div>
        <div class="seg"><button data-setmode="live" aria-pressed="${live}">실제 시세</button><button data-setmode="sim" aria-pressed="${!live}">시뮬레이션</button></div></div>
      <div class="set-row"><div class="l">상승·하락 색<small>한국식은 상승 빨강, 미국식은 상승 초록</small></div>
        <div class="seg"><button data-conv="kr" aria-pressed="${SET.conv === 'kr'}">한국식</button><button data-conv="us" aria-pressed="${SET.conv === 'us'}">미국식</button></div></div>
      <div class="set-row"><div class="l">금액 표시 통화<small>실제: 한국 주식·원화는 원, 나머지는 달러. 달러로만·원화로만: 모든 금액을 지금 매매기준율로 바꿔 보여 줍니다(통장, 환전, 예약 주문 조건 가격은 실제 통화 그대로)</small></div>
        <div class="seg"><button data-disp="real" aria-pressed="${dispMode() === 'real'}">실제</button><button data-disp="usd" aria-pressed="${dispMode() === 'usd'}">달러로만</button><button data-disp="krw" aria-pressed="${dispMode() === 'krw'}">원화로만</button></div></div>
      <div class="set-row"><div class="l">화면 테마</div>
        <div class="seg"><button data-theme="auto" aria-pressed="${SET.theme === 'auto'}">자동</button><button data-theme="light" aria-pressed="${SET.theme === 'light'}">밝게</button><button data-theme="dark" aria-pressed="${SET.theme === 'dark'}">어둡게</button></div></div>
      ${live ? '' : `<div class="set-row"><div class="l">자동 진행 속도<small>헤더의 ▶▶ 버튼으로 켜고 끕니다</small></div>
        <div class="seg">${SPEEDS.map((s, i) => `<button data-speed="${i}" aria-pressed="${SET.speed === i}">${s.l}</button>`).join('')}</div></div>`}
      <div class="set-row"><div class="l">새 게임<small>이 모드의 기록을 지우고 시드 $10,000로 다시 시작합니다</small></div>
        <button class="btn" id="btnReset" style="color:var(--danger)">새 게임 시작</button></div>
    </section>
    <div class="info-col">
      ${infoRow('rules', '게임 규칙', '거래 시간, 체결, 통장, 배당, 대출, 파산')}
      ${infoRow('formulas', '계산식', '순자산, 수익률, 환전, 결제 금액, 지수' + (live ? '' : ', 가격 모델'))}
      ${infoRow('data', '데이터 기준', '종목 목록과 시세를 어디서 가져오는지')}
    </div>

  </div>
  <p class="ver">SEED 10K v${VERSION}</p>`;
}

/* ───────── 종목 상세 시트 ───────── */
function openSheet(id){
  UI.sheet = id; UI.side = S.pos[id] ? UI.side : 'buy'; UI.qty = 1; UI.scrub = null; UI.otype = 'now'; UI.rpx = null;
  if (!UI.crange || !rangeList().some(r => r.k === UI.crange)) UI.crange = isLive() ? '1D' : '1M';
  const sh = $('#sheet'), sc = $('#scrim');
  sh.hidden = false; sc.hidden = false;
  renderSheet();
  requestAnimationFrame(() => { sh.classList.add('on'); sc.classList.add('on'); renderChartBox(); });
  setTimeout(() => { const c = sh.querySelector('.close'); c && c.focus({preventScroll:true}); }, 50);
  // 종목을 열면 바로 최신 시세와 차트를 새로 받는다
  if (isLive()){ UI.refreshing = true; Promise.all([loadLive(true), loadChart(id, true)]).finally(() => { UI.refreshing = false; if (UI.sheet === id) renderSheet(); }); loadNews(id); }
}

/* ───────── 종목 뉴스 (Supabase 함수가 30분마다 모아 둔 seed10k_news 표) ───────── */
const NW = {};   // 종목별 {row, at, err}
async function loadNews(id){
  if (!ACC.sb){ NW[id] = {err:'로그인 서버에 연결되지 않았습니다', at:Date.now()}; renderNews(id); return; }
  const c = NW[id];
  if (c && !c.err && Date.now() - c.at < 5 * 60e3){ renderNews(id); return; }
  const kr = BY_ID[id].m === 'KR';
  const safe = pr => Promise.resolve(pr).then(r => r, e => ({data:null, error:e}));
  const [nr, dr] = await Promise.all([
    safe(ACC.sb.from('seed10k_news').select('items,at').eq('id', id).maybeSingle()),
    kr ? safe(ACC.sb.from('seed10k_dart').select('id,items').in('id', [id, '_state'])) : Promise.resolve({data:null, error:null})
  ]);
  const drows = (!dr.error && dr.data) || [];
  const mine = drows.find(r => r.id === id);
  NW[id] = {row:nr.error ? null : nr.data, err:nr.error ? errText(nr.error) : null, at:Date.now(),
            dartOn:drows.some(r => r.id === '_state'), dart:(mine && Array.isArray(mine.items)) ? mine.items : []};
  renderNews(id);
}
function renderNews(id){ const el = $('#apNews'); if (el && UI.sheet === id){ const h = newsHTML(id); el.innerHTML = h; el.hidden = !h; } }
const NEWS_SRC = {'hankyung.com':'한국경제','mk.co.kr':'매일경제','yna.co.kr':'연합뉴스','yonhapnewstv.co.kr':'연합뉴스TV','news1.kr':'뉴스1','newsis.com':'뉴시스',
  'edaily.co.kr':'이데일리','mt.co.kr':'머니투데이','news.mt.co.kr':'머니투데이','sedaily.com':'서울경제','fnnews.com':'파이낸셜뉴스','asiae.co.kr':'아시아경제',
  'chosun.com':'조선일보','biz.chosun.com':'조선비즈','joongang.co.kr':'중앙일보','donga.com':'동아일보','hani.co.kr':'한겨레','khan.co.kr':'경향신문',
  'etnews.com':'전자신문','zdnet.co.kr':'지디넷코리아','heraldcorp.com':'헤럴드경제','inews24.com':'아이뉴스24','ytn.co.kr':'YTN','news.kbs.co.kr':'KBS',
  'news.sbs.co.kr':'SBS','imnews.imbc.com':'MBC','nocutnews.co.kr':'노컷뉴스','seoul.co.kr':'서울신문','dt.co.kr':'디지털타임스','bizwatch.co.kr':'비즈니스워치',
  'thebell.co.kr':'더벨','ajunews.com':'아주경제','newspim.com':'뉴스핌','wowtv.co.kr':'한국경제TV','mbn.co.kr':'MBN','news.jtbc.co.kr':'JTBC',
  'kmib.co.kr':'국민일보','segye.com':'세계일보','hankookilbo.com':'한국일보','ddaily.co.kr':'디지털데일리','bloter.net':'블로터','thelec.kr':'디일렉',
  'businesspost.co.kr':'비즈니스포스트','g-enews.com':'글로벌이코노믹','ebn.co.kr':'EBN','sentv.co.kr':'서울경제TV','econovill.com':'이코노믹리뷰'};
function newsSource(s){ if (!s) return ''; for (const k in NEWS_SRC) if (s === k || s.endsWith('.' + k)) return NEWS_SRC[k]; return s; }
function newsAgo(sec){
  if (!sec) return '';
  const m = Math.floor((Date.now() - sec * 1000) / 6e4);
  return m < 1 ? '방금' : m < 60 ? `${m}분 전` : m < 1440 ? `${Math.floor(m / 60)}시간 전` : `${Math.floor(m / 1440)}일 전`;
}
function newsList(items){
  const ok = (items || []).filter(x => x && x.t && /^https?:\/\//.test(x.u || ''));
  if (!ok.length) return '<p class="empty">최근 기사가 없습니다.</p>';
  return `<ul class="nw-l">${ok.map(x => `<li><a href="${esc(x.u)}" target="_blank" rel="noopener noreferrer">
    <span class="nw-b"><span class="nw-s">${esc(newsSource(x.s))}${x.at ? ` · ${newsAgo(x.at)}` : ''}</span><b class="nw-t">${esc(x.t)}</b></span>
    ${x.img && /^https:\/\//.test(x.img) ? `<img src="${esc(x.img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}</a></li>`).join('')}</ul>`;
}
/* 빈 문자열을 돌려주면 뉴스 칸을 숨긴다 (뉴스 표가 없을 때, 한국어 기사 출처가 없는 한국 종목) */
/* 공시 목록 (OpenDART). 누르면 DART 원문 */
function dartList(items){
  const ok = (items || []).filter(x => x && x.t && /^\d{14}$/.test(String(x.r || '')));
  if (!ok.length) return '<p class="empty">최근 공시가 없습니다.</p>';
  return `<ul class="nw-l">${ok.map(x => {
    const d = String(x.d || ''), dd = d.length === 8 ? `${+d.slice(4, 6)}/${+d.slice(6, 8)}` : '';
    return `<li><a href="https://dart.fss.or.kr/dsaf001/main.do?rcpNo=${x.r}" target="_blank" rel="noopener noreferrer">
      <span class="nw-b"><span class="nw-s">${esc(x.f || '')}${dd ? ` · ${dd}` : ''}</span><b class="nw-t">${esc(x.t)}</b></span></a></li>`;
  }).join('')}</ul>`;
}
/* 빈 문자열을 돌려주면 뉴스 칸을 숨긴다 (보여 줄 출처가 하나도 없을 때) */
function newsHTML(id){
  const s = BY_ID[id], n = NW[id];
  if (!n) return `<div class="card-h"><h2>뉴스</h2></div><p class="empty">불러오는 중입니다.</p>`;
  const it = !n.err && n.row && n.row.items, hasKo = !!(it && Array.isArray(it.ko));
  let body = '';
  if (s.m === 'US' && !n.err){
    if (!it) body = '<p class="empty">이 종목 뉴스는 아직 모으기 전입니다. 30분 안에 채워집니다.</p>';
    else body = (hasKo ? newsList(it.ko) + `<h3 class="nw-h">영어 기사 · Yahoo Finance</h3>` : '<p class="muted nw-f" style="margin:0 0 2px">Yahoo Finance 영어 기사</p>') + newsList(it.en);
  } else if (s.m === 'KR' && hasKo) body = newsList(it.ko);
  const dart = s.m === 'KR' && n.dartOn ? `${body ? '<h3 class="nw-h">공시 · 금융감독원 DART</h3>' : '<p class="muted nw-f" style="margin:0 0 2px">금융감독원 DART 공시</p>'}${dartList(n.dart)}` : '';
  if (!body && !dart) return '';
  const title = body && dart ? '뉴스·공시' : dart ? '공시' : '뉴스';
  const when = n.row && n.row.at && body ? `${newsAgo(Date.parse(n.row.at) / 1000)} 모음` : dart ? '5분마다 확인' : '30분마다 모음';
  return `<div class="card-h"><h2>${title}</h2><small>${when}</small></div>${body}${dart}<p class="muted nw-f">제목을 누르면 원문이 새 창으로 열립니다.</p>`;
}
function closeSheet(){
  blurField();
  const sh = $('#sheet'), sc = $('#scrim');
  sh.classList.remove('on'); sc.classList.remove('on');
  UI.sheet = null;
  setTimeout(() => { if (!UI.sheet){ sh.hidden = true; if ($('#modal').hidden) sc.hidden = true; } }, 280);
}

/* ───────── 투자 수익률 (시간가중수익률) ─────────
   포인트가 들어올 때마다 기간을 끊고, 기간별 수익률을 곱해 이어 붙인다.
   S.twr.f: 지난 기간들의 (끝 순자산 ÷ 시작 순자산)을 곱한 값
   S.twr.b: 지금 기간이 시작할 때의 순자산 (방금 들어온 포인트 포함)
   수익률 = f × N ÷ b − 1. 포인트가 없으면 f = 1, b = 시드라서 N ÷ 시드 − 1과 같다. */
function twrRet(N = netWorth()){
  if (ACC.tester) return Infinity;   // 테스트 계정: 수익률은 ∞로 보여 준다
  const t = S.twr || {f:1, b:META.seed};
  return t.b > 0 ? t.f * N / t.b - 1 : -1;
}
/* 포인트 x달러를 달러 통장에 넣는다 (마이너스통장을 쓰고 있으면 먼저 갚는다) */
function addPoints(x){
  if (!(x > 0)) return;
  const N = netWorth(), t = S.twr || (S.twr = {f:1, b:META.seed});
  t.f = t.b > 0 ? t.f * Math.max(N, 0) / t.b : 0;   // 이번 기간을 닫는다
  t.b = N + x;                                       // 포인트를 넣은 뒤 새 기간 시작
  S.pts = Math.round(((S.pts || 0) + x) * 100) / 100;
  receiveUSD(x);
}

/* ───────── 미니게임: 차트 맞히기 ─────────
   이름을 가린 실제 종목의 과거 일봉 60거래일(종가와 거래량)을 보여 주고, 마지막 날 종가와 3거래일 뒤 종가를 비교해
   오를지 내릴지 맞히게 한다. 하루 10문제, 맞히면 $10 포인트 (하루 최대 $100).
   하루: 실제 시세 모드는 한국 날짜, 시뮬레이션은 게임 속 하루. 문제를 띄우는 순간 1회를 쓴 것으로 센다. */
const MG = {perDay:10, prize:10, cap:100, show:60, ahead:3, minMove:0.01};
const mgAhead = q => q.c.length - MG.show;   // 문제마다 저장된 값으로 센다 (예전에 띄운 20거래일 문제도 그대로 채점)
function mgKey(){ return isLive() ? kstDate() : 'd' + (S.day || 0); }
function mgToday(){
  if (!S.mg || S.mg.day !== mgKey()) S.mg = {day:mgKey(), n:0, won:0, cur:null};
  return S.mg;
}
async function mgLoad(id){
  const r = await fetch(`data/c/${id.replace(':', '_')}.json`, {cache:'no-cache'});
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const doc = await r.json();
  return doc && doc.d1 && Array.isArray(doc.d1.c) ? doc.d1 : null;
}
/* 새 문제: 종목과 구간을 무작위로 고른다. 오르내림이 1% 미만인 구간은 애매해서 뺀다 */
async function mgPick(){
  const need = MG.show + MG.ahead;
  for (let tries = 0; tries < 8; tries++){
    const pool = STOCKS.filter(x => !x.etf && !x.hide), s = pool[Math.floor(Math.random() * pool.length)];
    let d1; try { d1 = await mgLoad(s.id); } catch(e){ continue; }
    if (!d1 || d1.c.length < need + 5) continue;
    for (let k = 0; k < 12; k++){
      const i = Math.floor(Math.random() * (d1.c.length - need + 1));
      const c = d1.c.slice(i, i + need), d = d1.d.slice(i, i + need);
      if (c.some(v => !(v > 0))) continue;
      const a = c[MG.show - 1], b = c[need - 1];
      if (Math.abs(b / a - 1) < MG.minMove) continue;
      const v = Array.isArray(d1.v) && d1.v.length === d1.c.length ? d1.v.slice(i, i + need) : null;   // 거래량(주)
      return {id:s.id, c, ...(v ? {v} : {}), d0:d[0], d1:d[MG.show - 1], d2:d[need - 1]};
    }
  }
  return null;
}
function mgSVG(q, reveal){
  // 위 72%: 종가(첫날 = 100), 아래 20%: 거래량 막대(전날보다 오르면 상승색, 내리면 하락색)
  const W = 600, H = 250, pl = 8, pr = 44, pt = 10, pb = 8;
  const pBot = pt + (H - pt - pb) * 0.72, vTop = pt + (H - pt - pb) * 0.78, vBot = H - pb;
  const ah = mgAhead(q), n = q.c.length, cut = MG.show - 1, upto = reveal ? n : MG.show;
  const base = q.c[0], v = q.c.map(x => x / base * 100);
  const shown = v.slice(0, upto);
  const lo = Math.min(...shown), hi = Math.max(...shown), span = (hi - lo) || 1;
  const X = k => pl + (W - pl - pr) * k / (n - 1), Y = y => pt + (pBot - pt) * (1 - (y - lo) / span);
  const path = (a, b) => v.slice(a, b + 1).map((y, j) => `${j ? 'L' : 'M'}${X(a + j).toFixed(1)},${Y(y).toFixed(1)}`).join('');
  const up = v[n - 1] > v[cut];
  const ticks = [lo, (lo + hi) / 2, hi].map(y => `<line class="ap-grid" x1="${pl}" x2="${W - pr}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}"/><text class="ap-yl" x="${W - pr + 6}" y="${(Y(y) + 4).toFixed(1)}">${y.toFixed(1)}</text>`).join('');
  let vol = '';
  if (q.v){
    const vm = Math.max(...q.v.slice(0, upto), 1), bw = Math.max(1.5, (W - pl - pr) / (n - 1) * 0.7);
    vol = q.v.slice(0, upto).map((x, k) => {
      const h = (vBot - vTop) * x / vm, c = k === 0 ? 'var(--flat)' : q.c[k] > q.c[k - 1] ? 'var(--up)' : q.c[k] < q.c[k - 1] ? 'var(--down)' : 'var(--flat)';
      return `<rect x="${(X(k) - bw / 2).toFixed(1)}" y="${(vBot - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" fill="${c}" opacity="${k > cut ? 1 : .55}"/>`;
    }).join('') + `<text class="ap-yl" x="${W - pr + 6}" y="${(vTop + 9).toFixed(1)}">거래량</text>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${reveal ? '정답이 공개된 차트' : '이름을 가린 차트'}">${ticks}${vol}
    <line class="ap-ref" x1="${X(cut).toFixed(1)}" x2="${X(cut).toFixed(1)}" y1="${pt}" y2="${vBot}"/>
    <path d="${path(0, cut)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-linejoin="round"/>
    ${reveal ? `<path d="${path(cut, n - 1)}" fill="none" stroke="var(--${up ? 'up' : 'down'})" stroke-width="2.6" stroke-linejoin="round"/>` : `<rect x="${(X(cut) + 2).toFixed(1)}" y="${pt}" width="${Math.max(8, W - pr - X(cut) - 2).toFixed(1)}" height="${(vBot - pt).toFixed(1)}" fill="var(--surface-2)" rx="4"/><text class="ap-refl" x="${((X(cut) + W - pr) / 2 + 1).toFixed(1)}" y="${((pt + pBot) / 2).toFixed(1)}" text-anchor="middle">?</text>`}
    <circle cx="${X(cut).toFixed(1)}" cy="${Y(v[cut]).toFixed(1)}" r="3.5" fill="var(--ink)"/></svg>`;
}
const mgDate = dn => { const t = new Date(dn * DAY); return `${t.getUTCFullYear()}.${t.getUTCMonth() + 1}.${t.getUTCDate()}`; };
function mgCardHTML(){
  const m = mgToday(), left = MG.perDay - m.n;
  INFO.mg = {t:'차트 맞히기', h:`<div class="prose"><ul>
    <li>이름을 가린 실제 종목의 지난 ${MG.show}거래일 종가(첫날 = 100)와 거래량을 보여 줍니다.</li>
    <li>점 찍힌 마지막 날 종가보다 ${MG.ahead}거래일 뒤 종가가 오를지 내릴지 고릅니다. 1% 미만으로 움직인 구간은 문제로 내지 않습니다.</li>
    <li>${isLive() ? '하루' : '게임 속 거래일마다'} ${MG.perDay}문제, 맞히면 ${fmtUSD(MG.prize, 0)} 포인트(하루 최대 ${fmtUSD(MG.cap, 0)})가 달러 통장에 들어옵니다.</li>
    <li>문제를 띄우는 순간 1회를 쓴 것으로 셉니다. 창을 닫았다 열면 같은 문제가 다시 나옵니다.</li>
    <li>포인트는 투자에 쓸 수 있지만 수익률과 랭킹 순자산에서는 빠집니다.</li></ul></div>`};
  const label = S.over ? '파산해서 할 수 없습니다' : m.cur ? '풀던 문제 이어서' : left > 0 ? '문제 풀기' : '오늘은 끝 (내일 다시)';
  return `<div class="card-h"><h2>차트 맞히기 ${infoBtn('mg')}</h2><small>${isLive() ? '오늘' : '이번 거래일'} ${m.n}/${MG.perDay}문제 · ${fmtUSD(m.won, 0)}/${fmtUSD(MG.cap, 0)}</small></div>
    <div class="mg-foot"><span class="muted">받은 포인트 합계 <b class="num">${fmtUSD(S.pts || 0)}</b></span><button class="btn solid" id="mgGo" ${S.over || (!m.cur && left <= 0) ? 'disabled' : ''}>${label}</button></div>`;
}
let mgBusy = false;
async function mgStart(){
  if (mgBusy || S.over) return;
  const m = mgToday();
  if (!m.cur){
    if (m.n >= MG.perDay) return toast('오늘 문제를 다 풀었습니다', true);
    mgBusy = true;
    const b = $('#mgGo'); if (b){ b.disabled = true; b.textContent = '문제를 고르는 중…'; }
    let q = null;
    try { q = await mgPick(); } finally { mgBusy = false; }
    if (!q){ toast('차트를 불러오지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요', true); renderTab(); return; }
    const m2 = mgToday();
    if (m2.cur || m2.n >= MG.perDay){ renderTab(); return; }
    m2.cur = q; m2.n++;
    commit();
  }
  mgShow();
}
function mgShow(){
  const m = mgToday(), q = m.cur; if (!q) return;
  const close = showModal(`<h2>차트 맞히기 <small class="muted">${m.n}/${MG.perDay}</small></h2>
    <div class="mg-chart">${mgSVG(q, false)}</div>
    <p style="margin:8px 0 0">${mgAhead(q)}거래일 뒤 종가는 점 찍힌 마지막 날 종가보다…</p>
    <div class="acts"><button class="btn mg-up" data-mgans="up">오른다</button><button class="btn mg-dn" data-mgans="dn">내린다</button></div>
    <div class="acts" style="margin-top:6px"><button class="btn" data-close>닫기</button></div>`);
  $$('[data-mgans]').forEach(b => b.onclick = () => mgAnswer(b.dataset.mgans, close));
}
function mgAnswer(ans, close){
  const m = mgToday(), q = m.cur; if (!q) return close();
  const a = q.c[MG.show - 1], b = q.c[q.c.length - 1], up = b > a, ok = (ans === 'up') === up;
  const prize = ok ? Math.max(0, Math.min(MG.prize, MG.cap - m.won)) : 0;
  if (prize > 0){ addPoints(prize); m.won += prize; }
  m.cur = null;
  commit();
  const s = BY_ID[q.id], chg = b / a - 1;
  close();
  setTimeout(() => {
    const left = MG.perDay - m.n;
    const c2 = showModal(`<h2 class="${ok ? 'up' : ''}">${ok ? `정답! +${fmtUSD(prize, 0)}` : '아쉽네요'}</h2>
      <p style="margin:0 0 6px"><b>${esc(s ? s.n : q.id)}</b> <span class="muted">${s ? (s.m === 'KR' ? '한국' : '미국') : ''} · ${mgDate(q.d0)} ~ ${mgDate(q.d2)}</span></p>
      <div class="mg-chart">${mgSVG(q, true)}</div>
      <p style="margin:8px 0 0">${mgDate(q.d1)} 종가에서 ${mgAhead(q)}거래일 뒤 <b class="${cls(chg)}">${fmtPct(chg)}</b> ${up ? '올랐습니다' : '내렸습니다'}.${ok && prize === 0 ? ' 오늘 받을 수 있는 포인트를 다 받아서 이번에는 지급되지 않았습니다.' : ''}</p>
      <div class="acts"><button class="btn" data-close>닫기</button>${left > 0 ? `<button class="btn solid" id="mgNext">다음 문제 (${left}번 남음)</button>` : ''}</div>`);
    const nx = $('#mgNext'); if (nx) nx.onclick = () => { c2(); setTimeout(mgStart, 200); };
  }, 200);
}

/*__BM__*/

/* ───────── 상세 차트 (애플 주식 앱 방식) ───────── */
const CH = {};   // 종목별 차트 파일 캐시
async function loadChart(id, force){
  if (!isLive()) return;
  const c = CH[id];
  if (!force && c && Date.now() - c.at < 60000) return;
  try {
    const r = await fetch(`data/c/${id.replace(':', '_')}.json`, {cache:'no-cache'});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    CH[id] = {d:await r.json(), at:Date.now()};
  } catch(e){ CH[id] = {d:null, at:Date.now(), err:String(e.message || e)}; }
  if (ACC.sb){
    try {
      const {data, error} = await ACC.sb.from('seed10k_quotes').select('i').eq('id', id).maybeSingle();
      if (!error && data && data.i && data.i.t && data.i.t.length) CH[id].qi = data.i;
    } catch(e){ /* 표가 없으면 시세 파일의 5분 봉만 쓴다 */ }
    await loadNb(id);
  }
}
/* 5분 구간 종가 (서버가 7초 현재가로 남긴 _b5{시장}_{구간 시작} 줄): 야후 5분 봉이 아직 없는 최근 구간(한국 약 20분)을 잇는 데 쓴다.
   한 줄에 시장 전 종목 가격이 고정 순서(ids)로 들어 있어, 이 종목 순번(k)의 값만 골라 받는다 */
const NB = {KR:{idx:null}, US:{idx:null}};
async function loadNb(id){
  const s = BY_ID[id], c = CH[id]; if (!s || !c || !ACC.sb) return;
  const nb = NB[s.m], lo = `_b5${s.m}_`, hi = `_b5${s.m}_9`;
  try {
    if (!nb.idx){
      const {data} = await ACC.sb.from('seed10k_quotes').select('id,ids:i->b->ids').gt('id', lo).lt('id', hi).order('id', {ascending:false}).limit(1);
      if (data && data[0] && Array.isArray(data[0].ids)) nb.idx = new Map(data[0].ids.map((x, i) => [x, i]));
    }
    const k = nb.idx ? nb.idx.get(id) : undefined;
    if (k === undefined){ c.nb = null; return; }
    const i5 = intradayOf(id), since = i5 && i5.t.length ? last(i5.t) : 0;
    const {data, error} = await ACC.sb.from('seed10k_quotes').select(`id,n:i->b->ids->${k},t:i->b->t,v:i->b->p->${k}`).gt('id', lo + since).lt('id', hi).order('id', {ascending:true});
    if (error || !data) return;
    if (data.some(r => r.n && r.n !== id)){ nb.idx = null; c.nb = null; return; }   // 서버의 종목 순서가 바뀌었다: 다음에 다시 맞춘다
    c.nb = data.filter(r => r.v !== null && r.v !== undefined).map(r => ({t:+r.t, c:+r.v}));
  } catch(e){ /* 없으면 예전처럼 직선으로 잇는다 */ }
}
/* 5분 봉: 시세 파일(최근 5거래일)에 실시간 표의 오늘 봉을 이어 붙인다 */
function intradayOf(id){
  const c = CH[id]; if (!c) return null;
  const base = c.d && c.d.i5 && c.d.i5.t && c.d.i5.t.length ? c.d.i5 : null, q = c.qi;
  if (!q) return base ? {t:base.t, c:base.c, l:base.l || base.c, h:base.h || base.c} : null;
  const ql = q.l && q.l.length === q.t.length ? q.l : q.c, qh = q.h && q.h.length === q.t.length ? q.h : q.c;
  if (!base) return {t:q.t.slice(), c:q.c.slice(), l:ql.slice(), h:qh.slice()};
  const bl = base.l && base.l.length === base.t.length ? base.l : base.c, bh = base.h && base.h.length === base.t.length ? base.h : base.c;
  const cut = q.t[0], k = base.t.findIndex(x => x >= cut), n = k < 0 ? base.t.length : k;
  return {t:base.t.slice(0, n).concat(q.t), c:base.c.slice(0, n).concat(q.c), l:bl.slice(0, n).concat(ql), h:bh.slice(0, n).concat(qh)};
}
/* 이 종목에서 지금 화면에 보이는 가격의 시각(시세 자료의 시각 = 마지막 체결 시각) */
function lastPriceTs(id){
  let t = 0;
  const i5 = intradayOf(id); if (i5 && i5.t.length) t = Math.max(t, i5.t[i5.t.length - 1] * 1000);
  const r = (QT.rows || []).find(x => x.id === id); if (r && r.t) t = Math.max(t, Date.parse(r.t) || 0);
  return t;
}
const RANGES_LIVE = [['1D','1일'],['1W','1주'],['1M','1개월'],['3M','3개월'],['6M','6개월'],['YTD','YTD'],['1Y','1년'],['2Y','2년'],['5Y','5년'],['10Y','10년'],['ALL','전체']];
const RANGES_SIM = [['1W','1주'],['1M','1개월'],['3M','3개월'],['6M','6개월'],['1Y','1년'],['ALL','전체']];
const RANGE_TEXT = {'1D':'오늘','1W':'지난 1주','1M':'지난 1개월','3M':'지난 3개월','6M':'지난 6개월','YTD':'올해','1Y':'지난 1년','2Y':'지난 2년','5Y':'지난 5년','10Y':'지난 10년','ALL':'전체 기간'};
function rangeList(){ return (isLive() ? RANGES_LIVE : RANGES_SIM).map(([k, l]) => ({k, l})); }
const DAY = 864e5;
/* 일 단위 시계열(정수 일수)에 오늘 시세를 붙인다 */
function patchDaily(ser, id, m){
  if (!ser || !ser.d || !ser.d.length) return null;
  const d = ser.d.slice(), c = ser.c.slice();
  const ld = last(LIVE.dates[m]);
  if (ld){
    const dn = Math.round(parseD(ld) / DAY), p = price(id);
    if (last(d) === dn) c[c.length - 1] = p;
    else if (last(d) < dn){ d.push(dn); c.push(p); }
  }
  return {t:d.map(x => x * DAY), c, daily:true};
}
function sliceFrom(ser, fromMs){
  const i = ser.t.findIndex(t => t >= fromMs);
  if (i <= 0) return ser;
  return {...ser, t:ser.t.slice(i - 1 >= 0 ? i : 0), c:ser.c.slice(i)};
}
/* 기간별 시계열. t: ms, c: 가격, ref: 등락 기준값, kind: intraday|daily */
function getSeries(id, range){
  const s = BY_ID[id];
  if (!isLive()){
    const a = S.px[id], ds = S.dates;
    const n = {'1W':6, '1M':22, '3M':64, '6M':127, '1Y':253}[range] || a.length;
    const c = a.slice(-n), t = ds.slice(-n).map(x => parseD(x).getTime());
    return {t, c, ref:c[0], kind:'daily'};
  }
  const doc = CH[id] && CH[id].d;
  const fallbackDaily = () => ({t:LIVE.dates[s.m].map(x => parseD(x).getTime()), c:hist(id).slice(), daily:true});
  const nowMs = now().getTime();
  const i5 = intradayOf(id);
  if ((range === '1D' || range === '1W') && i5 && i5.t.length){
    const t = i5.t.map(x => x * 1000), c = i5.c.slice();
    // 야후 5분 봉 뒤로, 끝난 5분 구간의 종가(네이버 현재가로 집계)를 점으로 잇는다. 장 마감 시각 이후 구간은 쓰지 않는다
    const nbs = CH[id] && CH[id].nb, nowS = Date.now() / 1000;
    if (nbs) for (const b of nbs){
      const bd = zoneParts(SESS[s.m].tz, new Date(b.t * 1000)).date;
      if (b.t * 1000 > last(t) && b.t + 300 <= nowS && b.t * 1000 < zoneTs(SESS[s.m].tz, bd, sessOf(s.m, bd).c)){ t.push(b.t * 1000); c.push(b.c); }
    }
    // 마지막 시세가 마지막 5분 봉보다 늦으면(같은 거래일) 그 시각에 점을 하나 더 찍는다.
    // Yahoo는 한국 종목 5분 봉을 15:00 봉까지만 주고, 15:30 종가는 최신가(시각 15:30)로만 준다.
    const qr = (QT.rows || []).find(x => x.id === id), qt = qr && qr.t ? Date.parse(qr.t) : 0;
    if (qr && qt > last(t) + 60e3 && qr.p > 0 && zoneParts(SESS[s.m].tz, new Date(qt)).date === zoneParts(SESS[s.m].tz, new Date(last(t))).date){ t.push(qt); c.push(+qr.p); }
    if (range === '1D'){
      const tz = SESS[s.m].tz, lastDate = zoneParts(tz, new Date(last(t))).date;
      let i = t.length - 1; while (i > 0 && zoneParts(tz, new Date(t[i - 1])).date === lastDate) i--;
      // 전일 종가: 일봉에서 그 세션 날짜보다 앞선 마지막 값
      let ref = null;
      if (doc && doc.d1 && doc.d1.d.length){
        const dn = Math.round(parseD(lastDate) / DAY);
        for (let k = doc.d1.d.length - 1; k >= 0; k--){ if (doc.d1.d[k] < dn){ ref = doc.d1.c[k]; break; } }
      }
      if (ref === null) ref = prevPrice(id);
      return {t:t.slice(i), c:c.slice(i), ref, kind:'intraday', session:lastDate};
    }
    return {t, c, ref:c[0], kind:'intraday'};
  }
  if (range === '1M' && doc && doc.h1 && doc.h1.t.length){
    const t = doc.h1.t.map(x => x * 1000), c = doc.h1.c;
    return {t, c, ref:c[0], kind:'intraday'};
  }
  let base;
  if (['1D','1W','1M','3M','6M','YTD','1Y','2Y'].includes(range)) base = (doc && patchDaily(doc.d1, id, s.m)) || fallbackDaily();
  else if (range === '5Y' || range === '10Y') base = (doc && patchDaily(doc.wk, id, s.m)) || (doc && patchDaily(doc.d1, id, s.m)) || fallbackDaily();
  else base = (doc && patchDaily(doc.mo, id, s.m)) || (doc && patchDaily(doc.wk, id, s.m)) || fallbackDaily();
  const y = new Date(nowMs).getUTCFullYear();
  const from = {'1D':nowMs - 3*DAY, '1W':nowMs - 8*DAY, '1M':nowMs - 31*DAY, '3M':nowMs - 92*DAY, '6M':nowMs - 183*DAY, 'YTD':Date.UTC(y, 0, 1), '1Y':nowMs - 366*DAY, '2Y':nowMs - 731*DAY, '5Y':nowMs - 1827*DAY, '10Y':nowMs - 3653*DAY}[range];
  let ser = from ? sliceFrom(base, from) : base;
  if (ser.c.length < 2) ser = base;
  return {t:ser.t, c:ser.c, ref:ser.c[0], kind:'daily'};
}
function niceTicks(lo, hi, n){
  const span = hi - lo || Math.abs(hi) * .02 || 1;
  const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= raw) || 10 * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}
function fmtAxis(s, v){ const d = toDisp(s.cur, v); return fmtAxisCur(d.cur, d.v); }
function fmtAxisCur(cur, v){ return cur === 'KRW' ? Math.round(v).toLocaleString('ko-KR') : v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(v >= 100 ? 0 : 2); }
function xLabels(ser, range, xs){
  const out = [], seen = new Set();
  const lab = (i, text) => { if (!seen.has(text)){ seen.add(text); out.push({x:xs(i), text}); } };
  ser.t.forEach((t, i) => {
    const d = new Date(t);
    if (ser.kind === 'intraday'){
      const k = zoneParts('Asia/Seoul', d);
      if (range === '1D'){
        // 보이는 시간 길이에 맞춰 눈금 간격을 고른다: 30분 이하 5분, 1시간 반 이하 15분, 3시간 이하 30분, 그 이상 1시간
        const spanMin = (last(ser.t) - ser.t[0]) / 6e4;
        const step = spanMin <= 30 ? 5 : spanMin <= 90 ? 15 : spanMin <= 180 ? 30 : 60;
        if (i && k.mi % step === 0) lab(i, k.mi === 0 ? `${k.h}시` : `${k.h}:${String(k.mi).padStart(2, '0')}`);
      }
      else if (range === '1W'){ const key = k.date; if (!seen.has(key) && (i === 0 || zoneParts('Asia/Seoul', new Date(ser.t[i-1])).date !== key)){ seen.add(key); out.push({x:xs(i), text:`${+key.slice(5,7)}/${+key.slice(8,10)}`}); } }
      else { const key = k.date; if (i === 0 || zoneParts('Asia/Seoul', new Date(ser.t[i-1])).date !== key){ if (DOW[new Date(Date.UTC(+key.slice(0,4), +key.slice(5,7)-1, +key.slice(8,10))).getUTCDay()] === '월') out.push({x:xs(i), text:`${+key.slice(5,7)}/${+key.slice(8,10)}`}); } }
    } else {
      const y = d.getUTCFullYear(), m = d.getUTCMonth();
      const pd = i ? new Date(ser.t[i-1]) : null;
      const newMonth = !pd || pd.getUTCMonth() !== m, newYear = !pd || pd.getUTCFullYear() !== y;
      if (['5Y','10Y','ALL'].includes(range)){ if (newYear && i) out.push({x:xs(i), text:`${y}`}); }
      else if (range === '2Y'){ if (newMonth && i && m % 3 === 0) out.push({x:xs(i), text: m === 0 ? `${y}` : `${m+1}월`}); }
      else if (['1W','1M'].includes(range)){ if (i && (range === '1W' || d.getUTCDay() === 1)) out.push({x:xs(i), text:`${m+1}/${d.getUTCDate()}`}); }
      else if (newMonth && i) out.push({x:xs(i), text: m === 0 ? `${y}` : `${m+1}월`});
    }
  });
  // 겹치지 않게 솎아낸다 (최대 6개)
  const maxN = 6;
  if (out.length > maxN){ const step = Math.ceil(out.length / maxN); return out.filter((_, i) => i % step === 0); }
  return out;
}
function chartTimeLabel(ser, i, range){
  const t = ser.t[i]; if (t === undefined) return '';
  if (ser.kind === 'intraday'){ const k = zoneParts('Asia/Seoul', new Date(t)); return `${+k.date.slice(5,7)}월 ${+k.date.slice(8,10)}일 ${String(k.h).padStart(2,'0')}:${String(k.mi).padStart(2,'0')}`; }
  const d = new Date(t); return `${d.getUTCFullYear()}년 ${d.getUTCMonth()+1}월 ${d.getUTCDate()}일`;
}
function renderChartBox(){
  const id = UI.sheet; if (!id) return;
  const box = $('#apChart'); if (!box) return;
  const s = BY_ID[id];
  const ser = getSeries(id, UI.crange);
  UI.ser = ser;
  const W = Math.max(260, Math.round(box.clientWidth || 340)), H = W < 420 ? 210 : 240;
  const padR = 54, padT = 12, padB = 22, plotW = W - padR, plotH = H - padT - padB;
  const v = ser.c.length >= 2 ? ser.c : [ser.c[0], ser.c[0]];
  let lo = Math.min(...v), hi = Math.max(...v);
  if (UI.crange === '1D' && ser.ref) { lo = Math.min(lo, ser.ref); hi = Math.max(hi, ser.ref); }
  const pad = (hi - lo) * .1 || hi * .01; lo -= pad; hi += pad;
  // 1일 차트: 가로축은 장 시작부터 마지막 시세까지다. 장중에도 선이 가로 폭을 다 채운다.
  // 점 간격은 시각에 비례시켜, 중간에 빠진 봉이 있어도 시간축이 어긋나지 않게 한다.
  let slots = v.length - 1, xIndex = i => i;
  if (UI.crange === '1D' && ser.kind === 'intraday' && ser.t.length >= 2){
    const p0 = zoneParts(SESS[s.m].tz, new Date(ser.t[0])), z = sessOf(s.m, p0.date);
    const open = Math.min(ser.t[0], ser.t[0] - ((p0.h * 60 + p0.mi) - z.o) * 6e4);
    slots = Math.max(1, (last(ser.t) - open) / 3e5);
    xIndex = i => (ser.t[i] - open) / 3e5;
  }
  const X = i => 2 + (plotW - 4) * (slots ? xIndex(i) / slots : 0);
  const Y = val => padT + plotH * (1 - (val - lo) / (hi - lo));
  const lastV = last(v), refV = ser.ref ?? v[0];
  const c = cls(lastV - refV), col = c === 'flat' ? 'var(--ink-3)' : `var(--${c})`;
  let d = ''; v.forEach((val, i) => { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(val).toFixed(1); });
  const area = d + `L${X(v.length-1).toFixed(1)} ${padT + plotH}L${X(0).toFixed(1)} ${padT + plotH}Z`;
  const yt = niceTicks(lo, hi, 4);
  const xl = xLabels({...ser, c:v}, UI.crange, X);
  const gid = 'ag' + id.replace(/\W/g, '');
  // 보유 중이면 평균 매입가 선. 차트 범위 밖이면 선 대신 위·아래 끝에 화살표와 값만 적는다 (차트 모양은 그대로 둔다)
  const hold = S.pos[id], avg = hold && hold.q > 0 && hold.avg > 0 ? hold.avg : null;
  let avgSVG = '';
  if (avg !== null){
    const txt = `평균 매입가 ${fmtPx(s, avg)}`;
    if (avg >= lo && avg <= hi){
      const y = Y(avg), ty = y - padT < 14 ? y + 13 : y - 5;
      avgSVG = `<line x1="0" x2="${plotW}" y1="${y.toFixed(1)}" y2="${y.toFixed(1)}" class="ap-avg"/><text x="4" y="${ty.toFixed(1)}" class="ap-avgl">${esc(txt)}</text>`;
    } else {
      const above = avg > hi;
      avgSVG = `<text x="4" y="${above ? padT + 10 : padT + plotH - 4}" class="ap-avgl">${above ? '↑' : '↓'} ${esc(txt)}</text>`;
    }
  }
  box.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(s.n)} ${RANGE_TEXT[UI.crange]} 가격 차트">
    <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${col}" stop-opacity=".22"/><stop offset="1" stop-color="${col}" stop-opacity="0"/></linearGradient></defs>
    ${yt.map(t => `<line x1="0" x2="${plotW}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="ap-grid"/><text x="${W - 4}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end" class="ap-yl">${fmtAxis(s, t)}</text>`).join('')}
    ${xl.map(l => `<line x1="${l.x.toFixed(1)}" x2="${l.x.toFixed(1)}" y1="${padT}" y2="${padT + plotH}" class="ap-vgrid"/><text x="${l.x.toFixed(1)}" y="${H - 6}" text-anchor="middle" class="ap-xl">${esc(l.text)}</text>`).join('')}
    ${UI.crange === '1D' ? `<line x1="0" x2="${plotW}" y1="${Y(refV).toFixed(1)}" y2="${Y(refV).toFixed(1)}" class="ap-ref"/><text x="${plotW - 4}" y="${(Y(refV) - 5).toFixed(1)}" text-anchor="end" class="ap-refl">전일 종가</text>` : ''}
    <path d="${area}" fill="url(#${gid})"/>
    ${avgSVG}
    <path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    <line id="apCx" x1="0" x2="0" y1="${padT}" y2="${padT + plotH}" class="ap-cx" visibility="hidden"/>
    <circle id="apDot" r="4.5" fill="${col}" stroke="var(--surface)" stroke-width="2" visibility="hidden"/>
    <rect id="apHit" x="0" y="0" width="${plotW}" height="${H}" fill="transparent"/>
  </svg>`;
  const svg = box.querySelector('svg'), hit = svg.querySelector('#apHit');
  const nearest = clientX => {
    const r = svg.getBoundingClientRect(), x = clientX - r.left;
    let best = 0, bd = Infinity;
    for (let i = 0; i < v.length; i++){ const dd = Math.abs(X(i) - x); if (dd < bd){ bd = dd; best = i; } }
    return best;
  };
  const show = e => {
    const i = nearest(e.clientX);
    const cx = svg.querySelector('#apCx'), dot = svg.querySelector('#apDot');
    cx.setAttribute('x1', X(i)); cx.setAttribute('x2', X(i)); cx.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', X(i)); dot.setAttribute('cy', Y(v[i])); dot.setAttribute('visibility', 'visible');
    UI.scrub = i; renderChartHead();
  };
  const hide = () => { UI.scrub = null; svg.querySelector('#apCx').setAttribute('visibility', 'hidden'); svg.querySelector('#apDot').setAttribute('visibility', 'hidden'); renderChartHead(); };
  hit.addEventListener('pointerdown', e => { show(e); try { hit.setPointerCapture(e.pointerId); } catch(_){} });
  hit.addEventListener('pointermove', e => { if (e.pointerType === 'mouse' || e.buttons || e.pressure) show(e); });
  hit.addEventListener('pointerup', hide); hit.addEventListener('pointercancel', hide); hit.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hide(); });
  renderChartHead();
}
function renderChartHead(){
  const id = UI.sheet, el = $('#apHead'), ser = UI.ser; if (!id || !el || !ser) return;
  const s = BY_ID[id];
  const v = ser.c, refV = ser.ref ?? v[0];
  const i = UI.scrub;
  const val = i === null || i === undefined ? price(id) : v[i];
  const ch = val - refV, pct = refV ? ch / refV : 0;
  const when = i === null || i === undefined
    ? (UI.crange === '1D' && ser.session ? `${RANGE_TEXT['1D']}` : RANGE_TEXT[UI.crange])
    : chartTimeLabel(ser, i, UI.crange);
  const chD = toDisp(s.cur, ch);
  const chTxt = chD.cur === 'KRW' ? `${ch > 0 ? '+' : ch < 0 ? MINUS : ''}${Math.abs(Math.round(chD.v)).toLocaleString('ko-KR')}원` : `${ch > 0 ? '+' : ch < 0 ? MINUS : ''}$${Math.abs(chD.v).toFixed(2)}`;
  el.innerHTML = `<div class="big num">${fmtPx(s, val)}</div><div class="ap-chg"><span class="num ${cls(ch)}">${chTxt} (${fmtPct(pct)})</span><span class="ap-when">${esc(when)}</span></div>`;
}
function todayRange(id){
  const doc = CH[id] && CH[id].d;
  if (!doc || !doc.i5 || !doc.i5.t.length) return null;
  const s = BY_ID[id], tz = SESS[s.m].tz;
  const t = doc.i5.t, c = doc.i5.c, lastDate = zoneParts(tz, new Date(last(t) * 1000)).date;
  const today = c.filter((_, i) => zoneParts(tz, new Date(t[i] * 1000)).date === lastDate);
  return {open:today[0], hi:Math.max(...today), lo:Math.min(...today)};
}
function wk52(id){
  const doc = CH[id] && CH[id].d;
  const a = doc && doc.d1 && doc.d1.c.length ? doc.d1.c.slice(-252) : hist(id);
  return {hi:Math.max(...a, price(id)), lo:Math.min(...a, price(id))};
}
function renderSheet(){
  const id = UI.sheet; if (!id) return;
  if (typingOrder()){ renderChartHead(); renderOrder(true); return; }   // 입력 중에는 입력칸을 건드리지 않는다
  const live = isLive();
  const s = BY_ID[id], p = price(id);
  const P = S.pos[id];
  const sh = $('#sheet');
  const val = P ? P.q * toUSD(s, p) : 0, plN = P ? P.q * p - P.cost : 0;
  const st = live ? mstate(s.m) : null;
  const tr = live ? todayRange(id) : null, w52 = wk52(id);
  const chErr = live && CH[id] && CH[id].err;
  const note = live
    ? (LIVE.miss.has(id) ? '실제 시세를 받지 못한 종목입니다.' : `${SESS[s.m].ko} 시장 ${st.label}, 시세 ${LIVE.updated ? kstTime(LIVE.updated) : '-'} 기준${UI.refreshing ? ', 새로고침 중' : ''}`)
    : '';
  const scrollTop = sh.scrollTop;
  sh.innerHTML = `
    <div class="grab"></div>
    <div class="sh-top">
      <span class="mono" style="--h:${SECTORS[s.s].h}">${esc(monoText(s))}</span>
      <div><h2>${esc(s.n)}</h2><p>${esc(s.t)} <span class="sep"></span>${s.m === 'KR' ? s.x : '미국'} <span class="sep"></span>${SECTORS[s.s].ko}</p></div>
      <button class="close" aria-label="닫기"><svg viewBox="0 0 14 14"><path d="M2 2l10 10M12 2L2 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></button>
    </div>
    <div class="ap-head" id="apHead"></div>
    ${(() => {
      // 다른 통화 표시: '실제'면 한국 주식에 달러 환산을, 환산해 보여 주는 중이면 원래 통화 가격을 덧붙인다
      const alt = dispMode() === 'real' ? (s.cur === 'KRW' ? `약 ${fmtUSDn(p / FX())}` : '') : (toDisp(s.cur, p).cur !== s.cur ? `실제 ${fmtPxN(s, p)}` : '');
      return note ? `<div class="sh-sub">${esc(note)}${alt ? `,&nbsp; ${alt}` : ''}</div>` : (alt ? `<div class="sh-sub">${alt}</div>` : '');
    })()}
    <div class="ap-chart" id="apChart"></div>
    <div class="ap-ranges" role="group" aria-label="차트 기간">${rangeList().map(r => `<button data-crange="${r.k}" aria-pressed="${UI.crange === r.k}">${r.l}</button>`).join('')}</div>
    ${chErr ? `<p class="muted" style="margin:4px 0 0">상세 차트 파일을 받지 못해 일별 종가로 그렸습니다.</p>` : ''}
    <dl class="stats">
      ${tr ? `<div><dt>오늘 시작</dt><dd class="num">${fmtPx(s, tr.open)}</dd></div><div><dt>전일 종가</dt><dd class="num">${fmtPx(s, prevPrice(id))}</dd></div><div><dt>오늘 최고</dt><dd class="num">${fmtPx(s, tr.hi)}</dd></div><div><dt>오늘 최저</dt><dd class="num">${fmtPx(s, tr.lo)}</dd></div>` : `<div><dt>전일 종가</dt><dd class="num">${fmtPx(s, prevPrice(id))}</dd></div><div><dt>10/23 종가</dt><dd class="num">${fmtPx(s, basePrice(s))}</dd></div>`}
      <div><dt>${live ? '52주 최고' : '게임 중 최고'}</dt><dd class="num">${fmtPx(s, live ? w52.hi : Math.max(...hist(id)))}</dd></div>
      <div><dt>${live ? '52주 최저' : '게임 중 최저'}</dt><dd class="num">${fmtPx(s, live ? w52.lo : Math.min(...hist(id)))}</dd></div>
      ${s.etf ? `<div><dt>기초지수</dt><dd class="num">${esc(s.ix)} ${s.lev === 1 ? '' : (s.lev > 0 ? s.lev + '배' : MINUS + Math.abs(s.lev) + '배')}</dd></div>` : `<div><dt>시가총액</dt><dd class="num">${fmtCap(s)}</dd></div>`}
      <div><dt>10/23 대비</dt><dd class="num ${cls(p / basePrice(s) - 1)}">${fmtPct(p / basePrice(s) - 1)}</dd></div>
      ${divStatsHTML(s, p, live)}
    </dl>
    ${s.note && !live ? `<p class="note">${esc(s.note)}</p>` : ''}
    ${s.etf && s.lev !== 1 ? `<p class="note">${esc(s.ix)}의 <b>하루</b> 수익률을 ${s.lev > 0 ? s.lev + '배로' : '반대로 ' + Math.abs(s.lev) + '배'} 따라가는 ETF입니다. 매일 배수를 다시 맞추기 때문에 오래 들고 있으면 지수가 제자리여도 값이 줄어들 수 있습니다.</p>` : ''}
    ${s.hide ? `<p class="note">시가총액 순위 밖으로 밀려 목록에서 빠진 종목입니다. 새로 살 수는 없고, 가진 주식은 팔 수 있습니다.</p>` : ''}
    ${P ? `<dl class="pos"><div><dt>보유 수량</dt><dd class="num">${P.q.toLocaleString()}주</dd></div><div><dt>평균 단가</dt><dd class="num">${fmtPx(s, P.avg)}</dd></div><div><dt>평가액</dt><dd class="num">${fmtPx(s, P.q * p)}${s.cur === 'KRW' ? ` <small class="muted">(${fmtUSD(val)})</small>` : ''}</dd></div><div><dt>평가손익</dt><dd class="num ${cls(plN)}">${s.cur === 'KRW' ? (plN > 0 ? '+' : '') + fmtKRW(plN) : signUSD(plN)} (${fmtPct(P.cost ? plN / P.cost : 0)})</dd></div></dl>` : ''}
    <div class="order" id="orderBox"></div>
    ${live ? `<section class="nws" id="apNews" ${newsHTML(id) ? '' : 'hidden'}>${newsHTML(id)}</section>` : ''}`;
  renderOrder();
  renderChartBox();
  sh.scrollTop = scrollTop;
}
function otypeSegHTML(){
  return `<div class="seg" role="group" aria-label="주문 방식"><button data-otype="now" aria-pressed="${UI.otype !== 'resv'}">바로 주문</button><button data-otype="resv" aria-pressed="${UI.otype === 'resv'}">예약 주문</button></div>`;
}
function orderRowHTML(o, showName){
  const s = BY_ID[o.id];
  const st = {wait:'대기', done:'체결', fail:'실패', cancel:'취소', expire:'기간 끝'}[o.st] || o.st;
  return `<div class="orow"><span class="otag ${o.side}">${orderKindLabel(o)}</span>
    <span class="ob">${showName ? `<button class="olink" data-open="${o.id}">${esc(s.n)}</button> ` : ''}${orderCondText(o)}, ${(o.qDone || o.q).toLocaleString()}주
      <small>${o.st === 'wait' ? orderExpText(o) : `${st}${o.fp ? ` ${fmtPx(s, o.fp)}` : ''}${o.endAt ? `, ${fmtDate(isLive() ? zoneParts('Asia/Seoul', new Date(o.endAt)).date : S.date, false)}${isLive() ? ` ${kstTime(new Date(o.endAt))}` : ''}` : ''}`}</small></span>
    ${o.st === 'wait' ? `<button class="btn btn-s" data-ocancel="${o.n}">취소</button>` : `<span class="ost ${o.st}">${st}</span>`}</div>`;
}
function ordersListHTML(id){
  const list = ordersOf(id); if (!list.length) return '';
  return `<div class="olist"><div class="olist-h">걸어 둔 예약 ${list.length}건</div>${list.map(o => orderRowHTML(o)).join('')}</div>`;
}
/* 주문 칸에 숫자를 입력하는 중인지 (그때는 입력칸을 다시 만들지 않는다: 커서가 튀거나 글자가 씹히지 않게) */
function typingOrder(){
  const a = document.activeElement, box = $('#orderBox');
  return !!(a && box && box.contains(a) && (a.id === 'qtyIn' || a.id === 'rpxIn'));
}
/* soft면 입력칸은 그대로 두고 data-dyn 표시가 있는 부분만 새 내용으로 바꾼다 */
/* 매수 화면 위의 통장 잔액 (각 통장의 원래 통화로). 이 종목을 결제하는 통장에 테두리 */
function balStripHTML(krw){
  return `<div class="obal">
      <div${krw ? '' : ' class="main"'}><span>달러 통장</span><b class="num">${fmtUSDn(S.usd)}</b></div>
      <div${krw ? ' class="main"' : ''}><span>원화 통장</span><b class="num">${fmtKRWn(S.krw)}</b></div>
      <div><span>마이너스통장 남은 한도</span><b class="num">${fmtUSDn(odAvail())}</b></div></div>`;
}
function setOrderHTML(box, html, soft){
  // 다른 종목·다른 주문 화면으로 바뀌었으면 입력 중이어도 전부 다시 그린다 (예전 입력칸의 통화·이벤트가 남지 않게)
  const key = `${UI.sheet}|${UI.otype}|${UI.side}`;
  if (soft && box.dataset.key !== key) soft = false;
  if (!soft){ box.innerHTML = html; box.dataset.key = key; return true; }
  const tmp = document.createElement('div'); tmp.innerHTML = html;
  box.querySelectorAll('[data-dyn]').forEach(el => { const n = tmp.querySelector(`[data-dyn="${el.dataset.dyn}"]`); if (n) el.replaceWith(n); });
  return false;
}
/* 숫자 입력칸에 세 자리마다 쉼표: 보이는 값은 '1,415,000', 계산에 쓰는 값은 쉼표 없는 '1415000' */
function groupNum(raw){
  const [i, f] = String(raw ?? '').split('.');
  const g = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return f === undefined ? g : g + '.' + f;
}
/* 입력칸 el의 값을 정리해 쉼표를 넣고, 커서를 같은 숫자 뒤에 둔다. 쉼표 없는 값을 돌려준다.
   dec: 소수점 허용(달러, 소수 둘째 자리까지) */
function commaInput(el, dec, ev){
  const v = el.value, pos = el.selectionStart ?? v.length;
  const keep = ch => /[0-9]/.test(ch) || (dec && ch === '.');
  let before = [...v.slice(0, pos)].filter(keep).length;   // 커서 앞에 있던 숫자(와 소수점) 개수
  let raw = [...v].filter(keep).join('');
  // 쉼표만 지워졌으면(지우기 키가 쉼표에 걸림) 그 옆 숫자를 대신 지운다
  const prev = el.dataset.raw ?? null, it = ev && ev.inputType;
  if (prev !== null && raw === prev && it === 'deleteContentBackward' && before > 0){ raw = raw.slice(0, before - 1) + raw.slice(before); before--; }
  else if (prev !== null && raw === prev && it === 'deleteContentForward' && before < raw.length){ raw = raw.slice(0, before) + raw.slice(before + 1); }
  if (dec){ const k = raw.indexOf('.'); if (k >= 0) raw = raw.slice(0, k + 1) + raw.slice(k + 1).replace(/\./g, '').slice(0, 2); }
  raw = raw.replace(/^0+(?=\d)/, '');
  const shown = groupNum(raw);
  if (shown !== v){
    el.value = shown;
    let n = 0, c = 0;
    while (c < shown.length && n < Math.min(before, raw.length)){ if (shown[c] !== ',') n++; c++; }
    try { el.setSelectionRange(c, c); } catch(e){}
  }
  el.dataset.raw = raw;
  return raw;
}
function renderOrderResv(soft){
  const id = UI.sheet, s = BY_ID[id], box = $('#orderBox'); if (!box) return;
  if (!soft && typingOrder()) soft = true;
  const P = S.pos[id], side = UI.side, krw = s.cur === 'KRW', held = P ? P.q : 0;
  const cur = price(id);
  const kind = side === 'buy' ? 'le' : sellKind(parseFloat(UI.rpx == null ? cur : UI.rpx) || 0, cur);
  const pxStr = UI.rpx == null ? String(cur) : UI.rpx;
  const px = parseFloat(pxStr) || 0;
  const q = Math.max(0, Math.floor(UI.qty) || 0);
  const est = quote(id, side, q, px);
  let err = '';
  if (S.over) err = '파산해서 주문할 수 없습니다.';
  else if (isLive() && LIVE.miss.has(id)) err = '시세를 받지 못한 종목입니다.';
  else if (!(px > 0)) err = '조건 가격을 입력하세요.';
  else if (q < 1) err = '수량을 입력하세요.';
  else if (side === 'sell' && held < 1) err = '보유하지 않은 종목은 예약 매도할 수 없습니다.';
  else if (side === 'sell' && q > held) err = `보유 수량(${held}주)을 넘었습니다.`;
  else if (UI.rpx == null) err = '조건 가격을 정하세요. 지금은 현재가로 채워 두었습니다.';   // 아직 손대지 않은 칸: 현재가라 당연히 조건에 맞으므로 그 오류는 띄우지 않는다
  else if (condMet({kind, px}, cur)) err = '지금 가격이 이미 조건에 맞습니다. 바로 주문을 이용하세요.';
  else if (ordersOf().length >= ORDER_MAX) err = `예약 주문은 ${ORDER_MAX}개까지 걸 수 있습니다.`;
  const desc = side === 'buy' ? `가격이 ${fmtPxN(s, px)} 이하로 내려오면 삽니다.`
    : kind === 'ge' ? `가격이 ${fmtPxN(s, px)} 이상으로 오르면 팝니다.` : `가격이 ${fmtPxN(s, px)} 이하로 내려가면 팝니다.`;
  const label = side === 'buy' ? '예약 매수 걸기' : '예약 매도 걸기';
  // 평균 매수가보다 낮게 파는 예약이면 경고만 한다 (막지는 않는다)
  const lowWarn = side === 'sell' && P && px > 0 && px < P.avg ? `평균 매수가(${fmtPxN(s, P.avg)})보다 가격이 낮습니다.` : '';
  const one = quote(id, 'buy', 1, px > 0 ? px : cur).total;
  const avail = krw ? S.krw + Math.max(0, S.usd + odAvail() - 0.02) * fxRates().sell : S.usd + odAvail();
  const maxB = one > 0 ? Math.max(0, Math.floor(avail / one + 1e-9)) : 0;
  const full = setOrderHTML(box, `${otypeSegHTML()}
    <div class="seg" role="group" aria-label="주문 종류"><button data-side="buy" aria-pressed="${side === 'buy'}">예약 매수</button><button data-side="sell" aria-pressed="${side === 'sell'}">예약 매도</button></div>
    <div class="rsv-l">조건 가격</div>
    <label class="amt"><span>${krw ? '₩' : '$'}</span><input id="rpxIn" type="text" inputmode="${krw ? 'numeric' : 'decimal'}" autocomplete="off" value="${esc(groupNum(pxStr))}" aria-label="조건 가격"></label>
    <p class="muted rsv-d" data-dyn="desc">현재가 ${fmtPxN(s, cur)}. ${desc}</p>
    <div class="rsv-warn" data-dyn="warn">${lowWarn}</div>
    <div data-dyn="bal">${side === 'buy' ? balStripHTML(krw) : ''}</div>
    <div class="qty"><button data-qd="-1" aria-label="1주 줄이기">−</button><input id="qtyIn" type="number" inputmode="numeric" min="1" step="1" value="${q || ''}" aria-label="수량(주)"><button data-qd="1" aria-label="1주 늘리기">+</button></div>
    <div class="quick" data-dyn="quick">${side === 'buy'
      ? `<button data-qn="${Math.max(maxB ? 1 : 0, Math.floor(maxB / 2))}">절반 ${Math.floor(maxB / 2).toLocaleString()}주</button><button data-qn="${maxB}">최대 ${maxB.toLocaleString()}주</button>`
      : `<button data-qn="${Math.max(held ? 1 : 0, Math.floor(held / 2))}">절반</button><button data-qn="${held}">전량 ${held.toLocaleString()}주</button>`}</div>
    <div class="bd" data-dyn="bd">
      <div><span>${side === 'buy' ? '조건 가격에 살 때 금액' : '조건 가격에 팔 때 받을 금액'} (수수료 포함)</span><b class="num">${fmtPxN(s, est.total)}</b></div>
      <div><span>유효기간</span><b>${isLive() ? `${ORDER_DAYS}일` : `${ORDER_DAYS}거래일`}</b></div>
    </div>
    <p class="muted rsv-d">실제 체결가는 조건에 처음 닿은 시세입니다. 돈과 보유 수량은 체결할 때 확인합니다.</p>
    <div class="err" role="status" data-dyn="err">${q >= 1 && px > 0 ? esc(err) : ''}</div>
    <button class="go ${side}" id="rsvBtn" data-dyn="go" ${err ? 'disabled' : ''}>${label}</button>
    <div data-dyn="list">${ordersListHTML(id)}</div>`, soft);
  if (!full) return;
  const inp = $('#qtyIn');
  inp.addEventListener('input', () => { UI.qty = parseInt(inp.value, 10) || 0; renderOrderResv(true); });
  const pin = $('#rpxIn');
  pin.dataset.raw = String(UI.rpx == null ? price(id) : UI.rpx);
  pin.addEventListener('input', e => { UI.rpx = commaInput(pin, !krw, e); renderOrderResv(true); });
}
function renderOrder(soft){
  if (UI.otype === 'resv') return renderOrderResv(soft);
  const id = UI.sheet, s = BY_ID[id], box = $('#orderBox'); if (!box) return;
  if (!soft && typingOrder()) soft = true;
  const P = S.pos[id];
  const side = UI.side;
  const krw = s.cur === 'KRW';
  // 빠른 수량 버튼: 매수는 두 통화 통장을 서로 바꿔 쓰는 것까지, 마이너스통장은 빼고 센다
  const maxQ = side === 'buy' ? maxBuyAuto(id) : (P ? P.q : 0);
  const q = Math.max(0, Math.floor(UI.qty) || 0);
  const o = quote(id, side, Math.max(q, 0));
  const ct = canTrade(s, side);
  const pl = side === 'buy' && q >= 1 ? buyPlan(id, q) : null;
  let err = '';
  if (!ct.ok) err = ct.why;
  else if (q < 1) err = '수량을 입력하세요.';
  else if (side === 'sell' && (!P || q > P.q)) err = P ? `보유 수량(${P.q}주)을 넘었습니다.` : '보유하지 않은 종목입니다.';
  else if (pl && !pl.ok) err = '원화·달러 통장과 마이너스통장 한도를 모두 합쳐도 부족합니다.';
  const r = fxRates(), X = r.base;
  // 아래 금액은 모두 달러로 맞춰 보여 준다 (원화는 매매기준율 X로 환산, 표시 통화 설정이 원화면 원화로)
  const usdOf = v => krw ? v / X : v;
  const nat = v => krw ? `<small class="muted">${fmtKRWn(v)}</small> ` : '';
  const goLabel = !ct.ok ? '지금은 거래할 수 없습니다'
    : side === 'sell' ? `${q ? q.toLocaleString() + '주 ' : ''}매도하기`
    : pl && pl.fxFrom > 0 && !err ? `환전하고 ${q.toLocaleString()}주 매수하기` : `${q ? q.toLocaleString() + '주 ' : ''}매수하기`;
  const full = setOrderHTML(box, `${otypeSegHTML()}
    <div data-dyn="alert">${!ct.ok ? `<div class="alert bad">${esc(ct.why)}</div>` : ''}</div>
    <div class="seg" role="group" aria-label="주문 종류"><button data-side="buy" aria-pressed="${side === 'buy'}">매수</button><button data-side="sell" aria-pressed="${side === 'sell'}">매도</button></div>
    <div data-dyn="bal">${side === 'buy' ? balStripHTML(krw) : ''}</div>
    <div class="qty"><button data-qd="-1" aria-label="1주 줄이기">−</button><input id="qtyIn" type="number" inputmode="numeric" min="1" step="1" value="${q || ''}" aria-label="수량(주)"><button data-qd="1" aria-label="1주 늘리기">+</button></div>
    <div class="quick" data-dyn="quick">${side === 'buy'
      ? `<button data-qf=".5">50%</button><button data-qf="1" title="원화·달러 통장을 서로 바꿔 쓰는 것까지 포함, 마이너스통장 제외">최대 ${maxQ.toLocaleString()}주</button>`
      : `<button data-qf=".5">절반</button><button data-qf="1">전량 ${maxQ.toLocaleString()}주</button>`}</div>
    <div class="bd" data-dyn="bd">
      <div><span>주문 금액</span><b class="num">${nat(o.gross)}${fmtUSD(usdOf(o.gross))}</b></div>
      <div><span>거래 수수료 0.1%</span><b class="num">${nat(o.fee)}${fmtUSD(usdOf(o.fee))}</b></div>
      <div class="tot"><span>${side === 'buy' ? '결제할 금액' : '받을 금액'}</span><b class="num">${nat(o.total)}${fmtUSD(usdOf(o.total))}</b></div>
      ${pl ? `
      ${pl.own > 0 ? `<div><span>${krw ? '원화 통장에서' : '달러 통장에서'}</span><b class="num">${nat(pl.own)}${fmtUSD(usdOf(pl.own))}</b></div>` : ''}
      ${pl.fxFrom > 0 ? `<div class="fxneed"><span>${krw ? `달러 → 원화 환전 (1달러 = ${fmtFX(r.sell)}원, 수수료 ${(r.f*100).toFixed(2)}%)` : `원화 ${fmtKRWn(pl.fxFrom)} → 달러 환전 (1달러 = ${fmtFX(r.buy)}원, 수수료 ${(r.f*100).toFixed(2)}%)`}</span><b class="num">${krw ? fmtUSD(pl.fxFrom) : fmtUSD(pl.fxTo)}</b></div>` : ''}
      ${pl.od > 0 ? `<div><span>마이너스통장 사용 (한도 안에서 자동)</span><b class="num" style="color:var(--warn)">${fmtUSD(pl.od)}</b></div>` : ''}` : ''}
      ${side === 'sell' && krw ? `<div><span>매도대금은 원화 통장으로 들어갑니다</span><b></b></div>` : ''}
    </div>
    <div class="err" role="status" data-dyn="err">${ct.ok && err && q >= 1 ? esc(err) : ''}</div>
    <button class="go ${side}" id="goBtn" data-dyn="go" ${err ? 'disabled' : ''}>${goLabel}</button>
    <div data-dyn="list">${ordersListHTML(id)}</div>`, soft);
  if (!full) return;
  const inp = $('#qtyIn');
  inp.addEventListener('input', () => { UI.qty = parseInt(inp.value, 10) || 0; renderOrder(true); });
}

/* ───────── 화면 전환 / 커밋 ───────── */
function go(tab){
  if (tab === 'admin' && !ADM.on) tab = 'home';
  UI.tab = tab;
  $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + tab));
  $$('[data-tab]').forEach(b => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  renderTab();
  window.scrollTo(0, 0);
}
function renderTab(){
  // 탭 안의 입력칸(대출 금액, 검색 등)에 입력하는 중이면 다시 그리지 않는다 (입력이 지워지지 않게). 다음 갱신 때 그린다
  const a = document.activeElement;
  const av = a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) ? a.closest('.view') : null;
  if (av && av.id === 'v-' + UI.tab) return;
  ({home:renderHome, market:renderInvest, assets:renderAssets, loans:renderLoans, info:renderInfo, admin:renderAdmin})[UI.tab]();
  if (UI.tab === 'assets') refreshRanks(false);
}
function commit(){
  save(); renderHeader(); renderTab();
  if (UI.sheet && (UI.scrub === null || UI.scrub === undefined)) renderSheet();
  if ($('#fxBox')) renderFX();
}
function resetGame(){
  stopAuto();
  const keepBase = S.syncBase; S = newGame(S.mode); if (keepBase !== undefined) S.syncBase = keepBase; save();
  $('#modal').hidden = true; $('#modal').classList.remove('on');
  if (UI.sheet) closeSheet(); else { $('#scrim').classList.remove('on'); $('#scrim').hidden = true; }
  $$('.view').forEach(v => { delete v.dataset.built; });
  go('home'); renderHeader();
  if (isLive()) liveTick();
  toast('새 게임을 시작했습니다. 시드 $10,000');
}
async function setMode(mode){
  stopAuto(); bmHide(); slHide(); gmHide();
  if (S && !S._ph){ save(); if (ACC.user){ clearTimeout(ACC.cloudT); await pushCloud(); } }   // 떠나는 모드의 기록을 먼저 올린다
  SET.mode = mode; saveSet();
  if (ACC.user){ S = await loadAccountMode(mode); writeLocal(); if (S.dirty) scheduleCloud(); }
  else { S = load(mode); save(); }
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



/* ───────── 통장 카드와 환전 창 ───────── */
function walletHTML(){
  const r = fxRates();
  return `<div class="card-h"><h2>통장</h2><small>매매기준율 1달러 = ${fmtFX(r.base)}원</small></div>
    <div class="wallets">
      <div class="wl"><span class="wl-flag">USD</span><div class="wl-b"><div class="wl-n">달러 통장</div><div class="wl-v num">${fmtUSDn(S.usd)}</div>${S.loans.od.bal > 0 ? `<div class="wl-s" style="color:var(--warn)">마이너스통장 ${MINUS}${fmtUSDn(S.loans.od.bal)}</div>` : '<div class="wl-s">미국 주식, 대출</div>'}</div></div>
      <div class="wl"><span class="wl-flag kr">KRW</span><div class="wl-b"><div class="wl-n">원화 통장</div><div class="wl-v num">${fmtKRWn(S.krw)}</div><div class="wl-s">약 ${fmtUSDn(S.krw / r.base)}, 한국 주식</div></div></div>
    </div>
    <button class="btn solid wl-go" id="btnFX">환전하기</button>`;
}
function openFX(dir){
  UI.fxDir = dir || UI.fxDir || 'u2k'; UI.fxAmt = ''; UI.fxBy = 'from';
  UI.fxClose = showModal(`<div id="fxBox"></div>`, () => { UI.fxClose = null; });
  renderFX();
  setTimeout(() => { const i = $('#fxIn'); i && i.focus(); }, 60);
}
/* 받을 금액 T를 정하면, 그만큼 받는 데 필요한 가장 작은 '낼 금액'
   원화 → 달러: 받는 달러 = floor(A ÷ 달러 살 때 환율 × 100) ÷ 100 이 T 이상이 되는 가장 작은 원화 A(1원 단위)
   달러 → 원화: 받는 원화 = floor(D × 달러 팔 때 환율) 이 T 이상이 되는 가장 작은 달러 D(0.01달러 단위) */
function fxFromForTarget(dir, T){
  if (!(T > 0)) return 0;
  const r = fxRates();
  if (dir === 'k2u'){
    T = Math.round(T * 100) / 100;
    let A = Math.max(1, Math.ceil(T * r.buy - 1e-7));
    while (exQuote('k2u', A).to < T - 1e-9) A++;
    return A;
  }
  T = Math.floor(T);
  let D = Math.max(0.01, Math.ceil(T / r.sell * 100 - 1e-7) / 100);
  while (exQuote('u2k', D).to < T) D = Math.round((D + 0.01) * 100) / 100;
  return D;
}
function renderFX(){
  const box = $('#fxBox'); if (!box) return;
  const dir = UI.fxDir, r = fxRates(), u2k = dir === 'u2k', byTo = UI.fxBy === 'to';
  const typed = parseFloat(UI.fxAmt) || 0;
  // 입력 기준: 바꿀(낼) 금액 또는 받을 금액. 받을 금액이면 필요한 낼 금액을 계산한다
  const amt = byTo ? fxFromForTarget(dir, typed) : typed;
  UI.fxFrom = amt;
  const q = amt > 0 ? exQuote(dir, amt) : null;
  const have = u2k ? S.usd : S.krw;
  let err = '';
  if (amt > 0 && u2k && amt > S.usd + odAvail() + 1e-6) err = `쓸 수 있는 달러는 ${fmtUSDn(S.usd + odAvail())}입니다.`;
  if (amt > 0 && !u2k && amt > S.krw) err = `원화 통장에는 ${fmtKRWn(S.krw)}이 있습니다.`;
  if (q && q.to <= 0) err = '금액이 너무 작습니다.';
  box.innerHTML = `<h2>환전</h2>
    <div class="seg fx-seg" role="group" aria-label="환전 방향"><button data-fxdir="u2k" aria-pressed="${u2k}">달러 → 원화</button><button data-fxdir="k2u" aria-pressed="${!u2k}">원화 → 달러</button></div>
    <div class="seg fx-seg" role="group" aria-label="입력 기준"><button data-fxby="from" aria-pressed="${!byTo}">${u2k ? '바꿀 달러' : '바꿀 원화'} 입력</button><button data-fxby="to" aria-pressed="${byTo}">${u2k ? '받을 원화' : '받을 달러'} 입력</button></div>
    <label class="amt fx-amt"><span>${(u2k !== byTo) ? '$' : '₩'}</span><input id="fxIn" type="number" inputmode="decimal" min="0" step="${(u2k !== byTo) ? '0.01' : '1'}" value="${esc(UI.fxAmt)}" placeholder="${byTo ? '받을 금액' : '바꿀 금액'}" aria-label="${byTo ? '받을 금액' : '바꿀 금액'}"></label>
    ${byTo ? '' : '<div class="quick"><button data-fxq=".25">25%</button><button data-fxq=".5">50%</button><button data-fxq="1">전액</button></div>'}
    <div class="bd">
      <div><span>보유 ${u2k ? '달러' : '원화'}</span><b class="num">${u2k ? fmtUSDn(have) : fmtKRWn(have)}</b></div>
      <div><span>매매기준율</span><b class="num">${fmtFX(r.base)}원</b></div>
      <div><span>수수료율 = 1% × (1 − 우대율 ${Math.round(fxPref() * 100)}%)</span><b class="num">${(r.f * 100).toFixed(2)}%</b></div>
      <div><span>적용 환율 (${u2k ? '달러 팔 때' : '달러 살 때'})</span><b class="num">${fmtFX(u2k ? r.sell : r.buy)}원</b></div>
      ${q ? `<div><span>수수료</span><b class="num">${fmtUSDn(q.feeUSD)} 상당</b></div>${byTo ? `<div class="tot"><span>내야 할 금액</span><b class="num">${u2k ? fmtUSDn(amt) : fmtKRWn(amt)}</b></div>` : ''}<div class="tot"><span>받을 금액</span><b class="num">${u2k ? fmtKRWn(q.to) : fmtUSDn(q.to)}</b></div>` : ''}
    </div>
    ${u2k && amt > S.usd && !err ? `<div class="alert">달러가 모자란 ${fmtUSDn(amt - S.usd)}은 마이너스통장에서 빌립니다.</div>` : ''}
    ${!u2k && S.loans.od.bal > 0 ? `<div class="alert">받은 달러는 마이너스통장 사용액(${fmtUSDn(S.loans.od.bal)})을 먼저 갚는 데 씁니다.</div>` : ''}
    <div class="err">${esc(err)}</div>
    <div class="acts"><button class="btn" data-fxclose>닫기</button><button class="btn solid" id="fxGo" ${!q || err ? 'disabled' : ''}>환전하기</button></div>
    <p class="muted" style="margin:10px 0 0">우대율은 신용등급으로 정해집니다. 1등급 90%에서 등급마다 10%p씩 줄어 10등급은 0%입니다. 지금 ${g()}등급.</p>`;
  const inp = $('#fxIn');
  inp.addEventListener('input', () => { UI.fxAmt = inp.value; const pos = inp.selectionStart; renderFX(); const ni = $('#fxIn'); ni.focus(); try { ni.setSelectionRange(pos, pos); } catch(e){} });
  inp.addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); const b = $('#fxGo'); b && !b.disabled && b.click(); } });
}

/* ───────── 계정 (Supabase) ───────── */
const ACC = {sb:null, user:null, nick:'', ready:false, err:null, loadedFor:undefined, cloudT:null, rankT:null,
             lastSync:null, syncErrAt:0, ranks:{}, ranksAt:{}, myRank:{}, gateMode:'login', busy:false,
             ver:0, pushing:false, pushAgain:false};
function isGuestSession(){ try { return sessionStorage.getItem(GUEST_KEY) === '1'; } catch(e){ return false; } }
function setGuestSession(v){ try { v ? sessionStorage.setItem(GUEST_KEY, '1') : sessionStorage.removeItem(GUEST_KEY); } catch(e){} }

/* 이 기기에서 로그인했던 계정들 (빠른 전환용). 지금 계정의 로그인 토큰은 Supabase가 이미 이 기기 저장소에 두므로,
   같은 저장소에 다른 계정들의 토큰도 두고 setSession으로 바꿔 낀다. 비밀번호는 저장하지 않는다. */
const ACCTS_KEY = 'seed10k.accounts.v1', ACCTS_MAX = 5;
function acctList(){ try { const a = JSON.parse(localStorage.getItem(ACCTS_KEY)); return Array.isArray(a) ? a.filter(x => x && x.id && x.rt) : []; } catch(e){ return []; } }
function acctStore(a){ try { localStorage.setItem(ACCTS_KEY, JSON.stringify(a.slice(0, ACCTS_MAX))); } catch(e){} }
function acctRemember(session){
  if (!session || !session.user || !session.refresh_token) return;
  const u = session.user, list = acctList(), old = list.find(x => x.id === u.id);
  const row = {id:u.id, email:u.email || (old && old.email) || '', nick:(u.user_metadata && u.user_metadata.nickname) || (old && old.nick) || '',
               at:session.access_token, rt:session.refresh_token};
  acctStore([row, ...list.filter(x => x.id !== u.id)]);
}
function acctForget(id){ acctStore(acctList().filter(x => x.id !== id)); }
const acctOthers = () => acctList().filter(x => !ACC.user || x.id !== ACC.user.id);
async function leaveAccount(){   // 지금 계정의 기록을 서버에 올리고, 최신 토큰을 목록에 남긴다
  if (!ACC.user) return;
  save(); clearTimeout(ACC.cloudT);
  try { await pushCloud(); await pushRank(); } catch(e){}
  try { const {data} = await ACC.sb.auth.getSession(); acctRemember(data && data.session); } catch(e){}
}
const isMidFlight = e => !!e && (e.status === 409 || /mid-flight|discarded/i.test(e.message || ''));
const isDeadToken = e => !!e && /refresh token|not found|invalid|expired|revoked|session_not_found|already used/i.test(`${e.code || ''} ${e.message || ''}`);
async function switchAccount(id){
  if (!ACC.sb || ACC.busy || (ACC.user && ACC.user.id === id)) return;
  const t = acctList().find(x => x.id === id); if (!t) return;
  ACC.busy = true;
  try {
    await leaveAccount();
    let {error} = await ACC.sb.auth.setSession({access_token:t.at, refresh_token:t.rt});
    // 다른 탭이 같은 때 로그인 정보를 바꾸면 supabase-js가 받은 새 토큰을 버리고 409(mid-flight)를 낸다.
    // 토큰이 잘못된 게 아니므로 잠깐 뒤 다시 시도한다 (같은 토큰은 10초 안에는 다시 써도 같은 결과를 준다)
    for (let k = 0; k < 2 && error && isMidFlight(error); k++){
      await new Promise(r => setTimeout(r, 400 + 400 * k));
      const {data} = await ACC.sb.auth.getSession();
      if (data && data.session && data.session.user.id === id){ error = null; break; }
      ({error} = await ACC.sb.auth.setSession({access_token:t.at, refresh_token:t.rt}));
    }
    if (error){
      console.warn('[seed10k] 계정 전환 실패', error);
      if (isMidFlight(error) || !isDeadToken(error)){   // 토큰 문제가 아니면 목록에서 지우지 않는다
        toast(`${t.nick || t.email} 계정으로 바꾸지 못했습니다. 이 사이트가 열린 다른 탭을 닫고 다시 눌러 보세요 (${errText(error)})`, true);
        return;
      }
      acctForget(id);
      toast(`${t.nick || t.email} 계정은 로그인이 만료되어 다시 로그인해야 합니다 (${errText(error)})`, true);
      if (ACC.user) renderTab();
      openGate(true); $('#gEmail').value = t.email; $('#gPw').value = '';
      return;
    }
    toast(`${t.nick || t.email} 계정으로 바꿨습니다`);
  } catch(e){ console.error('[seed10k] 계정 전환 오류', e); toast(`계정을 바꾸지 못했습니다 (${errText(e)})`, true); }
  finally { ACC.busy = false; }
}
function acctListHTML(btnCls){
  return acctOthers().map(a => `<button class="${btnCls}" data-acct="${esc(a.id)}"><b>${esc(a.nick || a.email)}</b>${a.nick ? `<small>${esc(a.email)}</small>` : ''}</button>`).join('');
}
function initAccount(){
  if (!window.supabase || !window.supabase.createClient){
    ACC.err = '로그인 서버에 연결하지 못했습니다. 인터넷 연결을 확인하거나 로그인 없이 하세요.';
    ACC.ready = true; afterAuthResolved(); return;
  }
  try { ACC.sb = window.supabase.createClient(SB_URL, SB_KEY, {auth:{storage:SB_STORE}}); }
  catch(e){ ACC.err = '로그인 서버 설정이 올바르지 않습니다.'; ACC.ready = true; afterAuthResolved(); return; }
  ACC.sb.auth.onAuthStateChange((ev, session) => { if (ev === 'PASSWORD_RECOVERY') setTimeout(pwRecoverDialog, 600); handleSession(session); });
  ACC.sb.auth.getSession().then(({data}) => handleSession(data && data.session)).catch(() => { ACC.ready = true; afterAuthResolved(); });
}
async function handleSession(session){
  const u = session ? session.user : null, newId = u ? u.id : null;
  ACC.ready = true;
  acctRemember(session);   // 토큰이 갱신될 때마다 목록의 토큰도 최신으로
  if (ACC.loadedFor === newId){ ACC.user = u; if (u) ACC.nick = (u.user_metadata && u.user_metadata.nickname) || ACC.nick; whoUpdate(); return; }
  // 계정이 바뀌었다 (로그인, 로그아웃, 다른 탭에서 계정 전환)
  clearTimeout(ACC.cloudT); clearTimeout(ACC.rankT);
  ACC.loadedFor = newId;
  ACC.user = u;
  ACC.nick = u && u.user_metadata && u.user_metadata.nickname || '';
  ACC.ranks = {}; ACC.ranksAt = {}; ACC.myRank = {};
  stopAuto();
  if (UI.sheet) closeSheet();
  bmHide(); slHide(); gmHide();
  // 검색어는 계정마다 따로 — 바뀐 계정에서는 비운다 (입력칸과 필터가 어긋나지 않게 둘 다)
  UI.q = ''; UI.qRaw = ''; { const q = $('#q'); if (q){ q.value = ''; const c = $('#qClear'); if (c) c.hidden = true; } }
  if (u){
    setGuestSession(false);
    renderGate();   // 로그인됐으니 로그인 화면부터 닫는다 (기록 옮기기 질문이 가려지지 않게)
    if (SET.mode){ S = await loadAccountMode(SET.mode); writeLocal(); if (S.dirty) scheduleCloud(); }
    else { S = newGame('sim'); S._ph = true; }
  } else {
    S = load(SET.mode === 'live' ? 'live' : 'sim');
    if (!SET.mode) S._ph = true;
  }
  $$('.view').forEach(v => { delete v.dataset.built; });
  if (S.mode === 'live') startLivePolling(); else stopLivePolling();
  go(UI.tab); renderHeader();
  afterAuthResolved();
  whoUpdate();
  mpReset(); if (ACC.user) mpWatchPayouts();
  onlStart();   // 접속 중인 사람 목록 (로그아웃이면 나간다)
  admCheck();   // 관리자 계정이면 관리 탭을 보인다
  testerCheck();   // 멀티플레이: 계정이 바뀌면 방 화면을 닫고 그 계정의 받을 돈을 확인
}
function afterAuthResolved(){
  renderGate();
  if (!ACC.user && !isGuestSession()) return;          // 로그인 화면을 보여준다
  if (!SET.mode) showModePicker(true);
}
async function loadAccountMode(mode){
  const local = validSave(safeParse(localStorage.getItem(accKey(mode))), mode);
  let cloud = null, cloudOk = true;
  try {
    const {data, error} = await ACC.sb.from('seed10k_saves').select('data').eq('user_id', ACC.user.id).eq('mode', mode).maybeSingle();
    if (error) throw error;
    cloud = data ? validSave(data.data, mode) : null;
  } catch(e){
    cloudOk = false;
    toast('서버에서 기록을 불러오지 못해 이 기기에 있던 기록으로 시작합니다', true);
  }
  let pick = cloudOk ? chooseSave(local, cloud) : local;
  if (!pick && cloudOk){
    const guest = validSave(safeParse(localStorage.getItem(SAVE_KEYS[mode])), mode);
    if (hasProgress(guest) && await askImport(mode)){
      pick = guest; pick.syncBase = null; pick.dirty = true;
      try { localStorage.removeItem(SAVE_KEYS[mode]); } catch(e){}
    }
  }
  return pick || newGame(mode);
}
/* 이 기기 기록(local)과 서버 기록(cloud) 중 이어서 할 것을 고른다.
   - local이 서버 표지를 가진 새 형식이면: 서버에 올리지 못한 변경이 있고(dirty) 그 변경이 지금 서버 기록 위에서
     이뤄졌을 때(표지가 같을 때)만 local, 그 밖에는 cloud. 다른 기기가 그 사이 올린 기록을 덮어쓰지 않기 위해서다.
   - local이 서버에 한 번도 올라가지 못한 기록이면(표지 없음, 예전 형식 포함): 진행한 쪽(매매·대출·시뮬레이션 날짜가 있는 쪽)을 고르고, 둘 다 진행했거나
     둘 다 아니면 나중에 저장된 쪽을 고른다. 예전 버전이 빈 기록으로 서버를 덮어쓴 경우를 되살리기 위해서다. */
function chooseSave(local, cloud){
  if (!local) return cloud;
  if (!cloud) return local;
  if (local.syncBase != null){   // 서버에 한 번이라도 올라간 기록
    return (local.dirty && (local.syncBase ?? null) === (cloud.syncBase ?? null)) ? local : cloud;
  }
  const lp = hasProgress(local), cp = hasProgress(cloud);
  const useLocal = lp !== cp ? lp : (local.savedAt || 0) > (cloud.savedAt || 0);
  if (!useLocal) return cloud;
  local.syncBase = cloud.syncBase ?? null; local.dirty = true;   // 서버의 지금 기록을 이어받은 것으로 올린다
  return local;
}
/* 서버 기록이 이 기기와 달라졌을 때(다른 기기에서 진행) 서버 기록으로 바꾼다. */
async function adoptCloud(mode, msg){
  if (!ACC.user || !ACC.sb || !S || S.mode !== mode) return;
  const uid = ACC.user.id;
  let cloud;
  try {
    const {data, error} = await ACC.sb.from('seed10k_saves').select('data').eq('user_id', uid).eq('mode', mode).maybeSingle();
    if (error) throw error;
    cloud = data ? validSave(data.data, mode) : null;
  } catch(e){ return; }
  if (!cloud || !ACC.user || ACC.user.id !== uid || S.mode !== mode) return;
  // 빈 기록이, 서버에 아직 못 올린 이 기기의 진행 기록을 덮으려 하면 이 기기 쪽을 지킨다
  // (예전 버전이 올린 빈 기록이거나, 서버 표가 없던 동안 다른 기기가 먼저 올린 빈 기록)
  if ((cloud.syncBase === undefined || S.syncBase == null) && hasProgress(S) && !hasProgress(cloud)){
    S.syncBase = cloud.syncBase ?? null; S.dirty = true; writeLocal(); scheduleCloud(); return;
  }
  stopAuto();
  if (UI.sheet) closeSheet();
  S = cloud; S.dirty = false; writeLocal();
  $$('.view').forEach(v => { delete v.dataset.built; });
  go(UI.tab); renderHeader();
  if (msg) toast(msg);
}
/* 다른 기기가 서버 기록을 바꿨는지 표지만 받아서 확인한다 (기록 전체는 크므로). */
async function checkRemote(){
  if (!ACC.user || !ACC.sb || !S || S._ph || ACC.pushing) return;
  const uid = ACC.user.id, mode = S.mode;
  try {
    const {data, error} = await ACC.sb.from('seed10k_saves').select('sb:data->>syncBase').eq('user_id', uid).eq('mode', mode).maybeSingle();
    if (error || !data || ACC.pushing) return;
    if ((data.sb ?? null) !== (S.syncBase ?? null)) await adoptCloud(mode, '다른 기기에서 진행한 기록을 불러왔습니다');
  } catch(e){}
}
function askImport(mode){
  return new Promise(res => {
    const close = showModal(`<h2>로그인 전 기록을 옮길까요?</h2><p>이 기기에 로그인 없이 하던 ${mode === 'live' ? '실제 시세' : '시뮬레이션'} 모드 기록이 있습니다. 이 계정으로 옮기면 다른 기기에서도 이어서 할 수 있습니다. 옮기지 않으면 이 계정은 시드 $10,000부터 시작합니다.</p><div class="acts"><button class="btn" id="impNo">새로 시작</button><button class="btn solid" id="impYes">기록 옮기기</button></div>`, null, true);
    $('#impYes').onclick = () => { close(); res(true); };
    $('#impNo').onclick = () => { close(); res(false); };
  });
}
function scheduleCloud(){
  clearTimeout(ACC.cloudT);
  ACC.cloudT = setTimeout(pushCloud, 4000);
  // 랭킹은 서버 저장(pushCloud)이 성공한 직후에 올린다 (기기 사이에서 다른 값이 덮어쓰지 않게)
}
function flushCloud(){ if (ACC.user){ clearTimeout(ACC.cloudT); pushCloud(); } }
/* 서버 오류를 사용자에게 보여줄 짧은 글로 (코드, HTTP 상태, 메시지) */
function errText(e){
  if (!e) return '알 수 없는 오류';
  if (e.code === 'PGRST205' || e.code === '42P01' || /schema cache|does not exist/i.test(e.message || '')) return '서버에 저장용 표가 없음. Supabase에서 seed10k.sql 실행 필요';
  if (e.code === '42501') return '로그인 세션과 계정이 맞지 않아 서버가 거절함. 다시 로그인하면 올라갑니다';
  const parts = [e.code, e.status, e.message || e.error_description || (typeof e === 'string' ? e : '')].filter(x => x !== undefined && x !== null && x !== '');
  return (parts.join(' ') || String(e)).slice(0, 160);
}
const isAuthErr = e => !!e && (e.code === 'PGRST301' || e.code === 'PGRST303' || e.status === 401 || /jwt/i.test(e.message || ''));
/* 서버에 올린다. 서버 기록의 표지가 이 기록이 이어받은 표지와 같을 때만 바꾼다(조건부 갱신).
   다르면 다른 기기가 그 사이 진행한 것이므로 덮어쓰지 않고 서버 기록으로 바꾼다. */
/* 이 탭의 Supabase 세션(이 기기 저장소에 하나뿐)이 화면의 계정과 같은지 본다. 다른 탭에서 계정을 바꿨는데
   이 탭이 잠들어 있어 알림을 놓치면 둘이 어긋난다. 어긋났으면 세션 쪽으로 화면을 맞추고 false */
async function sessionMatches(){
  if (!ACC.sb) return true;
  let ses;
  try { const {data} = await ACC.sb.auth.getSession(); ses = data ? data.session : null; } catch(e){ return true; }   // 확인을 못 하면 그대로 진행
  const sid = ses ? ses.user.id : null, uid = ACC.user ? ACC.user.id : null;
  if (sid === uid) return true;
  if (uid && !sid){   // 세션이 사라졌으면 토큰을 한 번 새로 받아 본다
    try { const {data, error} = await ACC.sb.auth.refreshSession(); if (!error && data && data.session && data.session.user.id === uid) return true; } catch(e){}
  }
  const prev = ACC.user;
  save();
  await handleSession(ses);
  toast(ses ? `다른 탭에서 계정이 바뀌어 ${(ses.user.user_metadata && ses.user.user_metadata.nickname) || ses.user.email} 계정으로 맞췄습니다` +
              (prev ? ` (${prev.email} 기록은 이 기기에 저장돼 있고, 그 계정으로 돌아가면 서버에 올라갑니다)` : '')
            : '로그인이 풀려 있습니다. 다시 로그인하면 이 기기에 저장된 기록이 서버에 올라갑니다', true);
  return false;
}
async function pushCloud(){
  if (!ACC.user || !ACC.sb || !S || S._ph) return;
  if (ACC.pushing){ ACC.pushAgain = true; return; }
  ACC.pushing = true;
  const uid = ACC.user.id, snap = S, mode = snap.mode, base = snap.syncBase ?? null, ver = ACC.ver;
  const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  const data = JSON.parse(JSON.stringify(snap)); data.syncBase = token; data.dirty = false; delete data._ph;
  const row = {data, updated_at:new Date().toISOString()};
  let conflict = false;
  // 이 탭의 로그인 세션이 화면의 계정과 같은지 먼저 확인한다. 다르면 남의 세션으로 이 계정 기록을 쓰려다
  // 권한 규칙(RLS)에 막히므로 올리지 않고, 실제 로그인 상태로 화면을 맞춘다 (이 계정 기록은 이 기기에 남아 있다)
  if (!(await sessionMatches())){ ACC.pushing = false; return; }
  const attempt = async () => {
    let q = ACC.sb.from('seed10k_saves').update(row).eq('user_id', uid).eq('mode', mode);
    q = base === null ? q.is('data->>syncBase', null) : q.eq('data->>syncBase', base);
    const {data:upd, error} = await q.select('user_id');
    if (error) throw error;
    if (upd && upd.length) return 'ok';
    const ins = await ACC.sb.from('seed10k_saves').insert({user_id:uid, mode, ...row});
    if (!ins.error) return 'ok';
    if (ins.error.code === '23505') return 'conflict';   // 서버에 다른 기기의 기록이 있다
    throw ins.error;
  };
  try {
    let r;
    try { r = await attempt(); }
    catch(e){
      // 로그인 토큰이 만료됐거나 권한 규칙에 막혔으면 토큰을 새로 받아, 같은 계정일 때만 한 번 더 시도한다
      if (!isAuthErr(e) && e.code !== '42501') throw e;
      const {data:rd, error:re} = await ACC.sb.auth.refreshSession();
      if (re || !rd || !rd.session || rd.session.user.id !== uid) throw e;
      r = await attempt();
    }
    if (r === 'conflict') conflict = true;
    else {
      ACC.lastSync = new Date(); ACC.syncErr = null;
      if (S === snap){ S.syncBase = token; if (ACC.ver === ver) S.dirty = false; writeLocal(); pushRank(); }
    }
  } catch(e){
    ACC.syncErr = {at:new Date(), text:errText(e)};
    console.error('[seed10k] 서버 저장 실패', e);
    // 같은 오류는 한 번만 알린다 (10분이 지나면 다시). 그 뒤로는 규칙·설정의 계정 칸에만 보인다
    if (ACC.syncErrShown !== ACC.syncErr.text || Date.now() - ACC.syncErrAt > 600000){ ACC.syncErrShown = ACC.syncErr.text; ACC.syncErrAt = Date.now(); toast(`서버에 저장하지 못했습니다 (${ACC.syncErr.text}). 이 기기에는 저장돼 있습니다`, true); }
  } finally {
    ACC.pushing = false;
  }
  if (conflict && S === snap && ACC.user && ACC.user.id === uid) await adoptCloud(mode, '다른 기기에서 진행한 기록이 있어 그 기록으로 바꿨습니다');
  if (ACC.pushAgain){ ACC.pushAgain = false; scheduleCloud(); }
}
function rankDays(){ return isLive() ? Math.max(0, Math.floor((Date.now() - (S.started || Date.now())) / 864e5)) : S.day; }
/* 내 랭킹 값: 이 화면에서 지금 계산한 순자산과 수익률 */
function myRankValues(){
  const N = netWorth();
  return {N, ret:clamp(Math.round(twrRet(N) * 10000) / 100, -100, 100000)};
}
async function pushRank(){
  if (!ACC.user || !ACC.sb || !S || S._ph || !ACC.nick || ACC.tester || ACC.rankBan) return;   // 테스트 계정·랭킹 제외 계정은 올리지 않는다
  if (isLive() && !LIVE.ok) return;                 // 시세를 받기 전 값으로 올리지 않는다
  if (S.syncBase === undefined || S.syncBase === null) return;   // 서버 기록과 맞춰진 기록만 올린다
  const {N, ret} = myRankValues();
  // 랭킹의 순자산은 받은 미니게임 포인트를 뺀 금액으로 올린다
  const row = {user_id:ACC.user.id, mode:S.mode, nickname:ACC.nick,
    net_worth:Math.round((N - (S.pts || 0)) * 100) / 100, return_pct:ret, days:rankDays(), updated_at:new Date().toISOString()};
  try {
    const {error} = await ACC.sb.from('seed10k_ranks').upsert(row);
    if (error) throw error;
  } catch(e){ /* 랭킹 저장 실패는 조용히 넘긴다 */ }
}
async function refreshRanks(force){
  const mode = UI.rankMode || S.mode;
  if (!ACC.sb){ renderRankCard(); return; }
  if (!force && ACC.ranksAt[mode] && Date.now() - ACC.ranksAt[mode] < 30000){ renderRankCard(); return; }
  ACC.ranksAt[mode] = Date.now();
  renderRankCard();
  try {
    const {data, error} = await ACC.sb.from('seed10k_ranks').select('user_id,nickname,return_pct,net_worth,days').eq('mode', mode).order('return_pct', {ascending:false}).limit(20);
    if (error) throw error;
    ACC.ranks[mode] = data || [];
    try {   // 경찰 단속 기록 (seed10k_busted 표가 없으면 조용히 넘긴다)
      const ids = (data || []).map(r => r.user_id);
      if (ids.length){
        const cnt = new Map();
        const {data:bc, error:be} = await ACC.sb.from('seed10k_busts').select('user_id').in('user_id', ids);   // 단속마다 한 줄 → 횟수
        if (!be) (bc || []).forEach(x => cnt.set(x.user_id, (cnt.get(x.user_id) || 0) + 1));
        const {data:bz} = await ACC.sb.from('seed10k_busted').select('user_id').in('user_id', ids);           // 횟수 표가 없을 때도 빨간 줄은
        (bz || []).forEach(x => { if (!cnt.has(x.user_id)) cnt.set(x.user_id, 1); });
        ACC.busted = ACC.busted instanceof Map ? ACC.busted : new Map();
        ids.forEach(id => { if (cnt.has(id)) ACC.busted.set(id, Math.max(cnt.get(id), ACC.busted.get(id) || 0)); });
      }
    } catch(e){}
    ACC.myRank[mode] = null;
    if (ACC.user){
      const mine = (data || []).findIndex(r => r.user_id === ACC.user.id);
      if (mine >= 0) ACC.myRank[mode] = mine + 1;
      else {
        const {data:me} = await ACC.sb.from('seed10k_ranks').select('return_pct').eq('mode', mode).eq('user_id', ACC.user.id).maybeSingle();
        if (me){
          const {count} = await ACC.sb.from('seed10k_ranks').select('user_id', {count:'exact', head:true}).eq('mode', mode).gt('return_pct', me.return_pct);
          ACC.myRank[mode] = (count || 0) + 1;
        }
      }
    }
    ACC.rankErr = null;
  } catch(e){ ACC.rankErr = '랭킹을 불러오지 못했습니다. 잠시 뒤 다시 열어보세요.'; }
  renderRankCard();
}
/* 서버 랭킹에서 내 줄을 지금 화면의 값으로 바꾸고 수익률 순으로 다시 정렬한다 */
function rankRowsLive(mode){
  const rows = ACC.ranks[mode];
  if (!rows || !ACC.user || mode !== S.mode || S._ph || (isLive() && !LIVE.ok)) return rows;
  const i = rows.findIndex(r => r.user_id === ACC.user.id);
  if (i < 0) return rows;
  const {N, ret} = myRankValues();
  const out = rows.slice(); out[i] = {...rows[i], net_worth:Math.round((N - (S.pts || 0)) * 100) / 100, return_pct:ret, days:rankDays()};
  out.sort((a, b) => +b.return_pct - +a.return_pct);
  ACC.myRank[mode] = out.findIndex(r => r.user_id === ACC.user.id) + 1;
  return out;
}
function rankCardHTML(){
  const mode = UI.rankMode || S.mode;
  const rows = rankRowsLive(mode);
  const head = `<div class="card-h"><h2>랭킹</h2><div class="seg seg-s"><button data-rankmode="live" aria-pressed="${mode === 'live'}">실제 시세</button><button data-rankmode="sim" aria-pressed="${mode === 'sim'}">시뮬레이션</button></div></div>`;
  let body;
  if (!ACC.sb) body = `<p class="empty">로그인 서버에 연결되지 않아 랭킹을 볼 수 없습니다.</p>`;
  else if (ACC.rankErr) body = `<p class="empty">${esc(ACC.rankErr)}</p>`;
  else if (!rows) body = `<p class="empty">랭킹을 불러오는 중입니다.</p>`;
  else if (!rows.length) body = `<p class="empty">아직 랭킹에 오른 사람이 없습니다. 로그인하고 닉네임을 정하면 첫 번째로 오릅니다.</p>`;
  else body = `<ol class="ranks">${rows.map((r, i) => {
      const me = ACC.user && r.user_id === ACC.user.id;
      return `<li class="${me ? 'me' : ''}"><span class="rn num">${i + 1}</span><span class="rk-n">${(() => { const n = ACC.busted instanceof Map ? ACC.busted.get(r.user_id) || 0 : 0;
          return n ? `<span class="busted" title="불법 도박 단속 ${n}회">${esc(r.nickname)}</span><b class="bust-n" title="불법 도박 단속 ${n}회">X${n}</b>` : `<span>${esc(r.nickname)}</span>`; })()}${me ? ' <small>나</small>' : ''}<span class="rk-d">${r.days}${mode === 'live' ? '일째' : '거래일째'} · ${fmtUSD(+r.net_worth, 0)}</span></span><b class="num ${cls(+r.return_pct)}">${fmtPct(+r.return_pct / 100)}</b></li>`;
    }).join('')}</ol>`;
  let foot = '';
  if (!ACC.user) foot = `<div class="rank-foot"><span>로그인하면 랭킹에 참여할 수 있습니다.</span><button class="btn" id="btnLoginOpen">로그인</button></div>`;
  else if (ACC.rankBan) foot = `<div class="rank-foot"><span class="down">🚫 이 계정은 랭킹에서 제외되었습니다.${ACC.rankBan.reason ? ' (사유: ' + esc(ACC.rankBan.reason) + ')' : ''}</span></div>`;
  else if (!ACC.nick) foot = `<div class="rank-foot"><label class="amt"><input id="rankNickIn" maxlength="12" placeholder="닉네임 (2~12자)" aria-label="닉네임"></label><button class="btn solid" id="btnRankNick">랭킹 참여</button></div>`;
  else if (ACC.myRank[mode]) foot = `<div class="rank-foot"><span>내 순위 <b>${ACC.myRank[mode]}위</b> (${esc(ACC.nick)})</span></div>`;
  else if (mode !== S.mode) foot = `<div class="rank-foot"><span>이 모드는 아직 플레이 기록이 올라가지 않았습니다.</span></div>`;
  INFO.rank = {t:'랭킹 기준', h:`<p class="prose">순자산과 수익률 모두 미니게임 포인트를 뺀 값입니다. 수익률은 포인트가 들어올 때마다 기간을 끊어 계산하는 시간가중수익률이라, 같은 매매를 했다면 포인트를 언제 얼마나 받았든 같은 값이 나옵니다.</p><p class="prose">게임 계산이 브라우저에서 이뤄져 조작을 완전히 막을 수는 없으니 재미로 봐주세요.</p>`};
  return head + body + foot + `<p class="muted" style="margin:8px 0 0">포인트를 뺀 투자 실력 기준입니다. ${infoBtn('rank', '랭킹 기준')}</p>`;
}
// 오른쪽 위 계정 이름 (누르면 규칙·설정의 계정 칸으로)
function whoUpdate(){
  const b = $('#whoBtn'); if (!b) return;
  const u = ACC.user, nm = u ? (ACC.nick || (u.email || '').split('@')[0] || '계정') : '';
  b.hidden = !u; b.querySelector('span').textContent = (ACC.tester ? '🧪 ' : '') + nm; b.title = u ? `${nm} (${u.email || ''}) · 계정 설정` : '';
}
// 오른쪽 위 계정 이름: 계정 전환 창 / 왼쪽 위 로고: 홈
function whoOpen(){
  if (!ACC.user) return;
  const others = acctListHTML('btn acct');
  const c = showModal(`<h2>계정 전환</h2><p class="muted" style="margin:0 0 10px">지금 계정: <b>${esc(ACC.nick || ACC.user.email || '')}</b>${ACC.nick ? ` · ${esc(ACC.user.email || '')}` : ''}</p>
    ${others ? `<div class="acct-list who-list">${others}</div>` : '<p class="muted">이 기기에서 로그인했던 다른 계정이 없습니다.</p>'}
    <div class="acts"><button class="btn" data-close>닫기</button><button class="btn" id="btnLogout">로그아웃</button><button class="btn solid" id="btnAcctAdd">＋ 계정 추가</button></div>`);
  $$('#modal [data-acct], #modal #btnLogout, #modal #btnAcctAdd').forEach(b => b.addEventListener('click', () => c()));   // 창을 닫고 나서 원래 동작
}
document.addEventListener('click', e => {
  if (e.target.closest('#whoBtn')){ whoOpen(); return; }
  if (e.target.closest('.top .brand')){ if ($('#modal').hidden) go('home'); }
});
function renderRankCard(){ const c = $('#rankCard'); if (c) c.innerHTML = rankCardHTML(); }
async function saveNickname(v){
  v = String(v || '').trim();
  if (v.length < 2 || v.length > 12) return toast('닉네임은 2~12자로 정하세요', true);
  if (!ACC.user) return;
  try {
    const {error} = await ACC.sb.auth.updateUser({data:{nickname:v}});
    if (error) throw error;
    ACC.nick = v; whoUpdate();
    toast('닉네임을 저장했습니다');
    await pushRank();
    refreshRanks(true);
    renderTab();
  } catch(e){ toast('닉네임을 저장하지 못했습니다', true); }
}
async function signOut(){
  if (!ACC.sb) return;
  save();
  clearTimeout(ACC.cloudT);
  await pushCloud();
  await pushRank();
  setGuestSession(false);
  if (ACC.user) acctForget(ACC.user.id);
  // scope:'local' — 이 기기의 이 계정만 로그아웃. 기본값(global)은 이 계정의 모든 기기·계정 전환 목록의 로그인까지 끊는다
  await ACC.sb.auth.signOut({scope:'local'});
  toast('로그아웃했습니다');
}
function accountRowsHTML(){
  if (ACC.user){
    return `<div class="set-row"><div class="l">계정<small>${esc(ACC.user.email || '')}${ACC.lastSync ? `, 서버 저장 ${kstTime(ACC.lastSync)}` : ''}</small>${ACC.syncErr ? `<small style="color:var(--down)">서버 저장 실패 ${kstTime(ACC.syncErr.at)}: ${esc(ACC.syncErr.text)}</small>` : ''}</div><button class="btn" id="btnLogout">로그아웃</button></div>
      <div class="set-row"><div class="l">계정 전환<small>이 기기에서 로그인했던 계정으로 비밀번호 없이 바로 바꿉니다 (최대 ${ACCTS_MAX}개) · 이 기기 저장 공간 ${(lsUsed() / 1048576).toFixed(2)}MB 사용 (가득 차면 서버에 다 올라간 다른 계정 기록부터 이 기기에서 지움)</small></div>
        <div class="acct-list">${acctListHTML('btn acct')}<button class="btn" id="btnAcctAdd">＋ 계정 추가</button></div></div>
      <div class="set-row"><div class="l">랭킹 닉네임<small>랭킹에는 이메일이 아니라 닉네임만 보입니다</small></div>
        <div class="act" style="flex:0 1 260px"><label class="amt"><input id="nickIn" maxlength="12" value="${esc(ACC.nick)}" placeholder="2~12자" aria-label="닉네임"></label><button class="btn" id="btnNick">저장</button></div></div>`;
  }
  return `<div class="set-row"><div class="l">계정<small>로그인하면 기기 사이에 기록이 동기화되고 랭킹에 참여할 수 있습니다</small></div><button class="btn solid" id="btnLoginOpen">로그인</button></div>`;
}

/* 로그인 화면 */
function openGate(adding){ if (!ACC.user) setGuestSession(false); ACC.gateMode = 'login'; ACC.gateAdd = !!(adding && ACC.user); gateMsg(''); renderGate(true); }
function renderGate(forceOpen){
  const gate = $('#gate');
  if (!forceOpen) ACC.gateAdd = false;
  const show = forceOpen || (!ACC.user && (!ACC.ready || !isGuestSession()));
  gate.hidden = !show;
  document.documentElement.classList.toggle('gated', show);
  if (!show) return;
  const signup = ACC.gateMode === 'signup';
  $('#gateTitle').textContent = !ACC.ready ? '계정 확인 중' : signup ? '회원가입' : '로그인';
  $('#gateForm').hidden = !ACC.ready || !ACC.sb;
  $('#gPw2').hidden = !signup; $('#gNick').hidden = !signup;
  $('#gPw').setAttribute('autocomplete', signup ? 'new-password' : 'current-password');
  $('#gSubmit').textContent = signup ? '회원가입' : '로그인';
  $('#gForgotRow').hidden = signup;
  $('#gSwitchText').textContent = signup ? '이미 계정이 있나요?' : '계정이 없나요?';
  $('#gSwitch').textContent = signup ? '로그인' : '회원가입';
  // 이 기기에서 로그인했던 다른 계정: 누르면 바로 그 계정으로
  const others = ACC.ready && ACC.sb ? acctOthers() : [];
  $('#gAccts').hidden = !others.length || signup;
  $('#gAccts').innerHTML = others.length ? `<div class="g-acc-h">이 기기에서 로그인했던 계정</div>${acctListHTML('g-acc')}<div class="g-acc-or">또는 다른 계정으로 로그인</div>` : '';
  $('#gGuestHint').hidden = ACC.gateAdd;
  $('#gGuest').textContent = ACC.gateAdd ? '취소' : '로그인 없이 하기';
  if (ACC.err) gateMsg(ACC.err, true);
}
function gateMsg(t, bad){ const m = $('#gMsg'); m.textContent = t || ''; m.classList.toggle('bad', !!bad); }
async function gateSubmit(){
  if (!ACC.sb || ACC.busy) return;
  const email = $('#gEmail').value.trim(), pw = $('#gPw').value;
  if (!email || pw.length < 6) return gateMsg('이메일과 6자 이상 비밀번호를 입력하세요.', true);
  const signup = ACC.gateMode === 'signup';
  if (signup){
    if (pw !== $('#gPw2').value) return gateMsg('비밀번호가 서로 다릅니다.', true);
    const nick = $('#gNick').value.trim();
    if (nick && (nick.length < 2 || nick.length > 12)) return gateMsg('닉네임은 2~12자로 정하거나 비워 두세요.', true);
  }
  ACC.busy = true; $('#gSubmit').disabled = true;
  try {
    if (ACC.user) await leaveAccount();   // 계정 추가: 지금 계정 기록부터 올려 둔다 (로그아웃하지 않으므로 이 계정 토큰은 계속 쓸 수 있다)
    if (signup){
      gateMsg('가입하는 중입니다.');
      const nick = $('#gNick').value.trim();
      const {data, error} = await ACC.sb.auth.signUp({email, password:pw, options:{emailRedirectTo:location.origin + location.pathname, data:nick ? {nickname:nick} : {}}});
      if (error) return gateMsg('가입하지 못했습니다: ' + error.message, true);
      if (!(data && data.session)){   // 이메일 인증을 켜 두면 세션 없이 돌아온다 → 메일의 코드(또는 링크)로 확인
        ACC.gateMode = 'login'; renderGate(true);
        gateMsg(`가입했습니다. ${email}로 보낸 인증 메일의 코드를 입력하세요. (메일의 링크를 눌러도 됩니다)`);
        return signupCodeDialog(email);
      }
    } else {
      gateMsg('로그인하는 중입니다.');
      const {error} = await ACC.sb.auth.signInWithPassword({email, password:pw});
      if (error && /not confirmed/i.test(error.message || '')){ gateMsg('아직 이메일 인증을 하지 않은 계정입니다. 메일의 코드를 입력하세요.', true); return signupCodeDialog(email); }
      if (error) return gateMsg('로그인하지 못했습니다: ' + (error.message === 'Invalid login credentials' ? '이메일이나 비밀번호가 맞지 않습니다.' : error.message), true);
    }
    gateMsg(''); $('#gPw').value = ''; $('#gPw2').value = '';
  } catch(e){
    console.error('[seed10k] 로그인 오류', e);
    gateMsg(`로그인하지 못했습니다: ${/quota/i.test(String(e && (e.name + e.message))) ? '이 기기 저장 공간이 가득 찼습니다.' : errText(e)}`, true);
  } finally { ACC.busy = false; $('#gSubmit').disabled = false; }
}
$('#gSubmit').addEventListener('click', gateSubmit);
// 비밀번호 찾기: 가입한 메일로 재설정 링크를 보낸다 (Supabase가 보내고, 링크를 누르면 이 사이트로 돌아와 새 비밀번호를 정한다)
$('#gForgot').addEventListener('click', async () => {
  if (!ACC.sb || ACC.busy) return;
  const email = $('#gEmail').value.trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return gateMsg('위 칸에 가입한 이메일을 적고 다시 누르세요.', true);
  ACC.busy = true; gateMsg('재설정 메일을 보내는 중입니다.');
  try {
    const {error} = await ACC.sb.auth.resetPasswordForEmail(email, {redirectTo:location.origin + location.pathname});
    if (error){
      const m = String(error.message || '');
      return gateMsg(/not authorized/i.test(m) ? '아직 메일 발송 설정이 끝나지 않아 보낼 수 없습니다. 관리자에게 알려 주세요.' : /rate|security purposes|seconds/i.test(m) ? '잠시 뒤에 다시 시도하세요 (메일을 너무 자주 보냈습니다).' : '메일을 보내지 못했습니다: ' + m, true);
    }
    gateMsg(`${email}로 재설정 메일을 보냈습니다. 메일에 적힌 인증 코드를 입력하세요. (가입한 주소가 아니면 메일이 가지 않습니다)`);
    pwCodeDialog(email);
  } catch(e){ gateMsg('메일을 보내지 못했습니다: ' + errText(e), true); }
  finally { ACC.busy = false; }
});
// 가입 이메일 인증: 메일의 숫자 코드를 넣으면 인증되고 바로 로그인된다. 코드가 안 왔으면 다시 보내기 (Supabase 기본 제한: 같은 주소 60초에 한 번)
function signupCodeDialog(email){
  const c = showModal(`<h2>📧 이메일 인증</h2><p class="muted">${esc(email)}로 보낸 인증 메일의 숫자 코드를 입력하세요. 메일이 안 보이면 스팸함도 확인하세요.</p>
    <input id="scode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="인증 코드" style="width:100%;margin:6px 0;letter-spacing:.2em">
    <p class="gate-msg" id="scMsg"></p>
    <div class="acts"><button class="btn" data-close>닫기</button><button class="btn" id="scAgain">다시 보내기</button><button class="btn solid" id="scGo">인증</button></div>`);
  const msg = t => { const m = $('#scMsg'); if (m) m.textContent = t; };
  $('#scGo').onclick = async () => {
    const code = $('#scode').value.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(code)) return msg('메일에 적힌 숫자 코드를 그대로 입력하세요.');
    $('#scGo').disabled = true; msg('확인하는 중입니다.');
    try {
      const {error} = await ACC.sb.auth.verifyOtp({email, token:code, type:'signup'});
      if (error) return msg(/expired|invalid/i.test(error.message) ? '코드가 틀렸거나 만료됐습니다. 다시 보내기를 눌러 새 코드를 받으세요.' : '인증하지 못했습니다: ' + error.message);
      c(); gateMsg(''); toast('이메일 인증을 마쳤습니다');   // 로그인은 onAuthStateChange가 이어서 처리한다
    } catch(e){ msg('인증하지 못했습니다: ' + errText(e)); }
    finally { const g = $('#scGo'); if (g) g.disabled = false; }
  };
  $('#scAgain').onclick = async () => {
    $('#scAgain').disabled = true;
    try {
      const {error} = await ACC.sb.auth.resend({type:'signup', email, options:{emailRedirectTo:location.origin + location.pathname}});
      msg(error ? (/security purposes|rate|seconds/i.test(error.message) ? '잠시 뒤에 다시 누르세요 (1분에 한 번).' : '보내지 못했습니다: ' + error.message) : '새 인증 메일을 보냈습니다.');
    } catch(e){ msg('보내지 못했습니다: ' + errText(e)); }
    finally { setTimeout(() => { const b = $('#scAgain'); if (b) b.disabled = false; }, 3000); }
  };
}
// 메일의 인증 코드로 재설정: 코드 확인 → 그 계정으로 로그인됨 → 새 비밀번호 저장
let PW_CODE_ON = false;
function pwCodeDialog(email){
  PW_CODE_ON = true;
  const c = showModal(`<h2>🔑 비밀번호 재설정</h2><p class="muted">${esc(email)}로 보낸 메일의 인증 코드와 새 비밀번호를 입력하세요. 메일이 안 보이면 스팸함도 확인하세요.</p>
    <input id="rcode" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="인증 코드" style="width:100%;margin:6px 0;letter-spacing:.2em">
    <input id="rpw1" type="password" placeholder="새 비밀번호 (6자 이상)" autocomplete="new-password" style="width:100%;margin:6px 0">
    <input id="rpw2" type="password" placeholder="새 비밀번호 확인" autocomplete="new-password" style="width:100%;margin:6px 0">
    <p class="gate-msg" id="rpwMsg"></p>
    <div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="rpwGo">바꾸기</button></div>`);
  $('#rpwGo').onclick = async () => {
    const code = $('#rcode').value.replace(/\s/g, ''), a = $('#rpw1').value, b = $('#rpw2').value, msg = $('#rpwMsg');
    if (!/^\d{6,10}$/.test(code)){ msg.textContent = '메일에 적힌 숫자 코드를 그대로 입력하세요.'; return; }
    if (a.length < 6){ msg.textContent = '새 비밀번호는 6자 이상으로 정하세요.'; return; }
    if (a !== b){ msg.textContent = '두 비밀번호 칸이 서로 다릅니다.'; return; }
    $('#rpwGo').disabled = true; msg.textContent = '확인하는 중입니다.';
    try {
      const v = await ACC.sb.auth.verifyOtp({email, token:code, type:'recovery'});
      if (v.error){ msg.textContent = /expired|invalid/i.test(v.error.message) ? '코드가 틀렸거나 만료됐습니다. 최근 메일의 코드인지 확인하세요.' : '확인하지 못했습니다: ' + v.error.message; return; }
      const {error} = await ACC.sb.auth.updateUser({password:a});
      if (error){ msg.textContent = '바꾸지 못했습니다: ' + error.message; return; }
      c(); toast('비밀번호를 바꿨습니다');
    } catch(e){ msg.textContent = '바꾸지 못했습니다: ' + errText(e); }
    finally { const g = $('#rpwGo'); if (g) g.disabled = false; setTimeout(() => { PW_CODE_ON = false; }, 3000); }
  };
}
// 재설정 링크로 들어왔을 때: 새 비밀번호 정하기
function pwRecoverDialog(){
  if (PW_CODE_ON) return;
  const c = showModal(`<h2>🔑 새 비밀번호 정하기</h2><p class="muted">재설정 링크로 들어왔습니다. 새 비밀번호를 정하세요 (6자 이상).</p>
    <input id="rpw1" type="password" placeholder="새 비밀번호" autocomplete="new-password" style="width:100%;margin:6px 0">
    <input id="rpw2" type="password" placeholder="새 비밀번호 확인" autocomplete="new-password" style="width:100%;margin:6px 0">
    <p class="gate-msg" id="rpwMsg"></p>
    <div class="acts"><button class="btn" data-close>나중에</button><button class="btn solid" id="rpwGo">바꾸기</button></div>`);
  $('#rpwGo').onclick = async () => {
    const a = $('#rpw1').value, b = $('#rpw2').value, msg = $('#rpwMsg');
    if (a.length < 6){ msg.textContent = '6자 이상으로 정하세요.'; return; }
    if (a !== b){ msg.textContent = '두 칸이 서로 다릅니다.'; return; }
    $('#rpwGo').disabled = true; msg.textContent = '바꾸는 중입니다.';
    const {error} = await ACC.sb.auth.updateUser({password:a});
    $('#rpwGo').disabled = false;
    if (error){ msg.textContent = '바꾸지 못했습니다: ' + error.message; return; }
    c(); toast('비밀번호를 바꿨습니다');
  };
}
['#gEmail', '#gPw', '#gPw2', '#gNick'].forEach(sel => $(sel).addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); gateSubmit(); } }));
$('#gSwitch').addEventListener('click', () => { ACC.gateMode = ACC.gateMode === 'signup' ? 'login' : 'signup'; gateMsg(''); renderGate(true); });
$('#gGuest').addEventListener('click', () => {
  if (ACC.user){ renderGate(); return; }   // 계정 추가 화면에서 취소
  setGuestSession(true); renderGate();
  if (!SET.mode) showModePicker(true);
});

/* ───────── 이벤트 ───────── */
document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-open]');
  if (!t) return;
  { const a = document.activeElement; if (a && (a.id === 'qtyIn' || a.id === 'rpxIn')) a.blur(); }   // 버튼을 누르면 입력을 끝낸 것으로 본다
  if (t.dataset.pick) return;
  if (t.id === 'btnFX'){ openFX(); return; }
  if (t.id === 'mgGo'){ mgStart(); return; }
  if (t.dataset.info){ openInfo(t.dataset.info); return; }
  if (t.id === 'mvMore'){ openMovers(); return; }
  if (t.dataset.mvside){ UI.mvSide = t.dataset.mvside; renderMovers(); return; }
  if (t.dataset.mvmkt){ UI.mvMkt = t.dataset.mvmkt; renderMovers(); return; }
  if (t.dataset.mvopen){ const id = t.dataset.mvopen, c = $('#modal [data-close]'); c && c.click(); setTimeout(() => openSheet(id), 200); return; }
  if (t.dataset.fxdir){ UI.fxDir = t.dataset.fxdir; UI.fxAmt = ''; renderFX(); return; }
  if (t.dataset.fxby){ UI.fxBy = t.dataset.fxby; UI.fxAmt = ''; renderFX(); const i = $('#fxIn'); i && i.focus(); return; }
  if (t.dataset.fxq){ UI.fxBy = 'from'; const have = UI.fxDir === 'u2k' ? S.usd : S.krw; UI.fxAmt = UI.fxDir === 'u2k' ? String(Math.floor(have * +t.dataset.fxq * 100) / 100) : String(Math.floor(have * +t.dataset.fxq)); renderFX(); return; }
  if (t.dataset.fxclose !== undefined){ UI.fxClose && UI.fxClose(); return; }
  if (t.id === 'fxGo'){ const q = exchange(UI.fxDir, UI.fxFrom); if (q){ UI.fxAmt = ''; UI.fxClose && UI.fxClose(); commit(); } return; }
  if (t.dataset.tab){ go(t.dataset.tab); return; }
  if (t.dataset.open){ if (t.dataset.from === 'assets'){ UI.sub = 'stock'; go('market'); } openSheet(t.dataset.open); return; }
  if (t.dataset.mkt){ UI.mkt = t.dataset.mkt; renderStockPane(); return; }
  if (t.classList.contains('close')){ closeSheet(); return; }
  if (t.dataset.crange){ UI.crange = t.dataset.crange; UI.scrub = null; $$('[data-crange]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.crange === UI.crange))); renderChartBox(); return; }
  if (t.dataset.side){ UI.side = t.dataset.side; UI.qty = 1; UI.rpx = null; renderOrder(); return; }
  if (t.dataset.otype){ UI.otype = t.dataset.otype; UI.qty = 1; UI.rpx = null; renderOrder(); return; }
  if (t.id === 'rsvBtn'){
    const id = UI.sheet, s = BY_ID[id];
    const px = parseFloat(UI.rpx === '' || UI.rpx == null ? price(id) : UI.rpx);
    const o = placeOrder(id, UI.side, sellKind(px, price(id)), px, UI.qty);
    if (o){ toast(`${orderKindLabel(o)}를 걸었습니다: ${s.n} ${orderCondText(o)}, ${o.q.toLocaleString()}주`); UI.qty = 1; UI.rpx = null; commit(); }
    return;
  }
  if (t.dataset.ocancel){ if (cancelOrder(t.dataset.ocancel)){ toast('예약 주문을 취소했습니다'); commit(); } return; }
  if (t.dataset.qn){ UI.qty = +t.dataset.qn; renderOrder(); return; }
  if (t.dataset.qd){ UI.qty = Math.max(1, (UI.qty || 0) + +t.dataset.qd); renderOrder(); return; }
  if (t.dataset.qf){
    const id = UI.sheet, maxQ = UI.side === 'buy' ? maxBuyAuto(id) : (S.pos[id] ? S.pos[id].q : 0);
    UI.qty = Math.max(maxQ ? 1 : 0, Math.floor(maxQ * +t.dataset.qf)); renderOrder(); return;
  }
  if (t.id === 'goBtn'){
    const id = UI.sheet, s = BY_ID[id], q = UI.qty;
    if (UI.side === 'buy'){
      const buyNow = () => { if (doBuy(id, q, '', true)){ toast(`${s.n} ${q.toLocaleString()}주를 매수했습니다`); UI.qty = 1; commit(); } };
      const pl = !ACC.tester && q >= 1 && canTrade(s, 'buy').ok ? buyPlan(id, Math.floor(q)) : null;
      if (pl && pl.ok && pl.od > 0){   // 통장 잔액이 모자라 마이너스통장을 쓰게 되면 먼저 묻는다
        const c = showModal(`<h2>⚠️ 마이너스통장 사용</h2><p>잔액이 부족합니다. 더 매수하기 위해 마이너스통장을 사용하시겠습니까?</p>
          <dl class="kv"><div><dt>마이너스통장에서 빌리는 금액</dt><dd class="num" style="color:var(--warn)">${fmtUSD(pl.od)}</dd></div><div><dt>빌릴 때 붙는 수수료 (3%)</dt><dd class="num">${fmtUSD(pl.od * META.loanFee)}</dd></div></dl>
          <p class="muted">빌린 돈에는 날마다 이자가 붙고, 달러가 들어오면 먼저 갚습니다.</p>
          <div class="acts"><button class="btn" data-close>취소</button><button class="btn solid" id="odGo">사용하고 매수</button></div>`);
        $('#odGo').onclick = () => { c(); buyNow(); };
      } else buyNow();
    }
    else { const r = doSell(id, q); if (r){ toast(`${s.n} ${q.toLocaleString()}주를 매도했습니다 (${fmtPx(s, r)})`); UI.qty = 1; if (!S.pos[id]) UI.side = 'buy'; commit(); } }
    return;
  }
  if (t.dataset.borrow){ const k = t.dataset.borrow; borrow(k, parseFloat($('#amt-' + k).value)); return; }
  if (t.dataset.repay){ const k = t.dataset.repay; repay(k, parseFloat($('#amt-' + k).value)); return; }
  if (t.dataset.repayall){
    const k = t.dataset.repayall, b = S.loans[k].bal;
    if (S.usd + 1e-6 < b) toast(`달러 통장이 ${fmtUSD(b - S.usd)} 부족해 가진 달러만큼만 갚습니다`, true);
    repay(k, b); return;
  }
  if (t.dataset.setmode){ if (t.dataset.setmode !== S.mode){ setMode(t.dataset.setmode); toast(t.dataset.setmode === 'live' ? '실제 시세 모드로 바꿨습니다' : '시뮬레이션 모드로 바꿨습니다'); } return; }
  if (t.dataset.conv){ SET.conv = t.dataset.conv; saveSet(); applyTheme(); renderTab(); return; }
  if (t.dataset.disp){ SET.disp = t.dataset.disp; saveSet(); renderHeader(); renderTab(); if (UI.sheet) renderSheet(); return; }
  if (t.dataset.theme){ SET.theme = t.dataset.theme; saveSet(); applyTheme(); renderTab(); return; }
  if (t.dataset.speed !== undefined){ SET.speed = +t.dataset.speed; saveSet(); if (UI.auto) startAuto(); renderTab(); return; }
  if (t.dataset.rankmode){ UI.rankMode = t.dataset.rankmode; refreshRanks(true); return; }
  if (t.id === 'btnLoginOpen'){ openGate(); return; }
  if (t.id === 'btnLogout'){ signOut(); return; }
  if (t.id === 'btnAcctAdd'){ openGate(true); return; }
  if (t.dataset.acct){ switchAccount(t.dataset.acct); return; }
  if (t.id === 'btnNick'){ saveNickname($('#nickIn').value); return; }
  if (t.id === 'btnRankNick'){ saveNickname($('#rankNickIn').value); return; }
  if (t.id === 'btnRefresh' || t.id === 'btnRefresh2'){ loadLive(false).then(() => { if (LIVE.ok) toast('시세를 새로 받았습니다'); }); return; }
  if (t.id === 'btnReset'){ confirmReset(); return; }
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
  if (e.key === 'n' && !isLive() && !e.target.closest('input') && !UI.sheet && $('#modal').hidden && $('#gate').hidden && !S.over) step();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden){ save(); flushCloud(); }
  else { sessionMatches().then(ok => { if (ok) checkRemote(); }); if (isLive()) loadLive(true); checkUpdate(); }
});
/* ───────── 새 버전 자동 적용 ─────────
   배포된 index.html의 VERSION이 지금 화면의 VERSION보다 높으면, 종목 창·확인 창·입력이 없는 때에
   서버 저장을 마친 뒤 새로고침한다. 같은 버전으로는 한 번만 새로고침한다(캐시 때문에 옛 파일이 오면 반복하지 않게). */
const UPD = {busy:false, want:null};
const verNum = v => String(v).split('.').map(x => parseInt(x, 10) || 0).reduce((a, x) => a * 1000 + x, 0);
async function checkUpdate(){
  if (UPD.busy || location.protocol === 'file:') return;
  UPD.busy = true;
  try {
    if (!UPD.want){
      const r = await fetch(location.pathname + '?vc=' + Date.now(), {cache:'no-store'});
      if (!r.ok) return;
      const m = (await r.text()).match(/const VERSION = '([\d.]+)'/);
      if (!m || verNum(m[1]) <= verNum(VERSION)) return;
      let done = null; try { done = sessionStorage.getItem('seed10k.reloadedFor'); } catch(e){}
      if (done === m[1]) return;
      UPD.want = m[1];
    }
    const a = document.activeElement;
    // 게임 화면(혼자 하는 도박·부루마블·같이 하기 방, 모두 .bm-ov)이 열려 있거나 같이 하기 판이 진행 중이면 미룬다: 새로고침하면 판이 화면에서 꺼진다
    const inGame = !!document.querySelector('.bm-ov:not([hidden])') || (typeof MP !== 'undefined' && MP.code && MP.room && (MP.room.status === 'play' || MP.room.status === 'lobby'));
    const idle = !UI.sheet && $('#modal').hidden && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) && !ACC.pushing && !mgBusy && !inGame;
    if (!idle){ if (inGame && !UPD.told){ UPD.told = true; toast(`새 버전(v${UPD.want})이 있습니다. 게임 화면을 닫으면 적용됩니다`); } return; }   // 지금은 미루고 다음 확인 때 다시 시도
    if (ACC.user && S && S.dirty){ clearTimeout(ACC.cloudT); await pushCloud(); }
    try { sessionStorage.setItem('seed10k.reloadedFor', UPD.want); } catch(e){}
    location.reload();
  } catch(e){ /* 확인 실패는 조용히 넘긴다 */ }
  finally { UPD.busy = false; }
}
setTimeout(checkUpdate, 8000);
setTimeout(() => loadDivs(), 2500);   // 시뮬레이션도 배당수익률을 쓰므로 모드와 관계없이 받는다
let updTick = 0;
setInterval(() => { if (document.hidden) return; updTick++; if (UPD.want || updTick % 5 === 0) checkUpdate(); }, 60000);   // 5분마다 확인, 새 버전을 찾은 뒤에는 1분마다 적용 시도
/* 실제 시세 모드: 1분마다 헤더의 시장 상태와 경과 시간을 다시 그린다 */
setInterval(() => { if (isLive() && !document.hidden){ renderHeader(); if (UI.tab === 'home') renderHome(); } }, 30000);
/* 두 기기를 번갈아 쓸 때를 위해, 화면이 보이는 동안 1분마다 서버 기록이 바뀌었는지 확인한다 */
setInterval(() => { if (!document.hidden) checkRemote(); }, 60000);

document.addEventListener('input', e => {
  const m = e.target && e.target.id && e.target.id.match(/^amt-(credit|margin)$/);
  if (m){ const box = $('#est-' + m[1]); if (box) box.innerHTML = loanEstHTML(m[1], parseFloat(e.target.value) || 0); }
});
let rzT = null;
window.addEventListener('resize', () => { clearTimeout(rzT); rzT = setTimeout(() => { if (UI.sheet) renderChartBox(); }, 120); });
/* ───────── 시작 ───────── */
setInterval(maintTick, 10000);
if (inMaint()) { applyTheme(); maintShow(); throw new Error('정기 서버 점검 시간'); }   // 점검 중에는 앱을 시작하지 않는다
applyTheme();
S = load(SET.mode === 'live' ? 'live' : 'sim');
if (!SET.mode) S._ph = true;
go('home'); renderHeader();
if (S.mode === 'live') startLivePolling();
renderGate();
initAccount();
