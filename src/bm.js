/* ───────── 미니게임: 부루마블 (컴퓨터 상대 보드게임) ─────────
   부루마불(씨앗사) 1탄의 땅값·통행료·건설비·황금열쇠를 따른 40칸 보드. 숫자의 출처: 나무위키 '부루마불/주요 카드'(2023-07-02 판)와
   '부루마불'(2016-12-14 판), 위키백과 '부루마불'(시작 자금 293만, 월급 20만). 자료에 없는 부분(황금열쇠 칸 위치, 카드 장수,
   건물 통행료를 더하는 방식, 우주여행비 등)은 INFO 설명에 따로 적었다.
   돈은 모두 '천 원' 단위 정수로 다룬다 (예: 2천 = 2, 1만 2천 = 12, 293만 = 2930).
   한 명만 남을 때까지(나머지가 모두 파산할 때까지) 한다. 달러 판돈을 걸고, 끝난 순위에 따라 판돈의 배수를 돌려받는다(평균 1배).
   한 턴의 결과는 주사위를 굴리는 순간 모두 계산해 저장한 뒤 애니메이션만 보여 준다 (새로고침으로 다시 굴릴 수 없게). */
const BM = {minBet:10, maxBet:1000, waitDays:0,   // 가입 후 대기 일수 (0이면 끔. 잠시 꺼 둠, 다시 켤 때 3)
  start:2930, salary:200, jail:3, fundIn:150, spaceFee:200,
  pay:{2:[2, 0], 3:[2.5, 0.5, 0], 4:[3, 1, 0, 0]},      // 참가자 수별 순위 배수 (평균 1)
  names:['나', '알파', '베타', '감마'], cols:['#E2B45E', '#4C9AFF', '#FF6B6B', '#36C38A'],
  regions:[{n:'아시아', c:'#E0484E'}, {n:'유럽', c:'#E2B94B'}, {n:'아메리카·오세아니아', c:'#3FB96B'}, {n:'대도시', c:'#4C7DF0'}]};
// 도시: p 땅값, c [별장, 빌딩, 호텔] 건설비, r [대지료, 별장 1채, 별장 2채, 빌딩, 호텔] 통행료 (천 원)
// 특수 땅(sp): 사기만 하고 건물을 못 짓는다. r = 통행료
const BM_SQ = (() => {
  const A = [50, 150, 250], E = [100, 300, 500], G = [150, 450, 750], B = [200, 600, 1000];
  const C = (n, g, p, c, r, s) => ({t:'city', n, s:s || n, g, p, c, r});
  const P = (n, p, r, s) => ({t:'city', sp:true, n, s:s || n, g:-1, p, r:[r]});
  const K = {t:'key', n:'황금열쇠', s:'열쇠'};
  return [
    {t:'start', n:'출발', s:'출발'},
    C('타이베이', 0, 50, A, [2, 10, 30, 90, 250]), K, C('베이징', 0, 80, A, [4, 20, 60, 180, 450]), C('마닐라', 0, 80, A, [4, 20, 60, 180, 450]),
    P('제주도', 200, 300), C('싱가포르', 0, 100, A, [6, 30, 90, 270, 550]), K, C('카이로', 0, 100, A, [6, 30, 90, 270, 550]), C('이스탄불', 0, 120, A, [8, 40, 100, 300, 600], '이스탄불'),
    {t:'island', n:'무인도', s:'무인도'},
    C('아테네', 1, 140, E, [10, 50, 150, 450, 750]), K, C('코펜하겐', 1, 160, E, [12, 60, 180, 500, 900], '코펜하겐'), C('스톡홀름', 1, 160, E, [12, 60, 180, 500, 900], '스톡홀름'),
    P('콩코드 여객기', 200, 300, '콩코드'), C('베른', 1, 180, E, [14, 70, 200, 550, 950]), K, C('베를린', 1, 160, E, [12, 60, 180, 500, 900]), C('오타와', 1, 200, E, [16, 80, 220, 600, 1000]),
    {t:'fundOut', n:'사회복지기금 수령', s:'기금받기'},
    C('부에노스아이레스', 2, 220, [150, 400, 750], [18, 90, 250, 700, 1050], '부에노스'), K, C('상파울루', 2, 240, G, [20, 100, 300, 750, 1100], '상파울루'), C('시드니', 2, 240, G, [20, 100, 300, 750, 1100]),
    P('부산', 500, 600), C('하와이', 2, 260, G, [22, 110, 330, 800, 1150]), C('리스본', 2, 260, G, [22, 110, 330, 800, 1150]), P('퀸 엘리자베스호', 300, 250, '퀸엘리'), C('마드리드', 2, 280, G, [24, 120, 360, 850, 1200], '마드리드'),
    {t:'space', n:'우주여행', s:'우주여행'},
    C('도쿄', 3, 300, B, [26, 130, 390, 900, 1270]), P('컬럼비아호', 450, 300, '컬럼비아'), C('파리', 3, 320, B, [28, 150, 450, 1000, 1400]), C('로마', 3, 320, B, [28, 150, 450, 1000, 1400]), K,
    C('런던', 3, 350, B, [35, 170, 500, 1100, 1500]), C('뉴욕', 3, 350, B, [35, 170, 500, 1100, 1500]), {t:'fundIn', n:'사회복지기금 접수', s:'기금내기'}, P('서울', 1000, 2000)
  ];
})();
const BM_N = BM_SQ.length;   // 40
const BM_IDX = n => BM_SQ.findIndex(c => c.n === n);
// 황금열쇠 30장 (2탄 전용 카드와, 다른 사람이 심사해야 하는 '장기자랑'은 뺐다)
const BM_CARDS = [
  {s:'반액대매출: 가장 비싼 땅을 건물과 함께 은행에 반값에 판다', half:true},
  {s:'정기종합소득세: 호텔 15만, 빌딩 10만, 별장 3만씩 낸다', tax:[30, 100, 150]},
  {s:'건물수리비: 호텔 10만, 빌딩 6만, 별장 3만씩 낸다', tax:[30, 60, 100]},
  {s:'방범비: 호텔 5만, 빌딩 3만, 별장 1만씩 낸다', tax:[10, 30, 50]},
  {s:'무인도 탈출권을 얻었다 (무인도에서 자동으로 쓴다)', free:true},
  {s:'우대권을 얻었다 (통행료 1번 면제, 낼 때 쓸지 고른다)', coupon:true}, {s:'우대권을 얻었다 (통행료 1번 면제, 낼 때 쓸지 고른다)', coupon:true},
  {s:'뒤로 2칸 간다', step:-2}, {s:'뒤로 3칸 간다', step:-3},
  {s:'관광여행: 제주도로 간다', go:'제주도'}, {s:'관광여행: 부산으로 간다', go:'부산'}, {s:'관광여행: 서울로 간다', go:'서울'},
  {s:'무인도로 간다 (출발을 지나도 월급 없음)', jail:true},
  {s:'사회복지기금 배당: 기금 받는 칸으로 간다', go:'사회복지기금 수령'},
  {s:'세계일주 초대권: 한 바퀴 돌아 월급과 사회복지기금을 받는다', world:true},
  {s:'우주여행 초대권: 우주여행 칸으로 간다 (우주여행비 면제)', space:true},
  {s:'유람선 여행: 퀸 엘리자베스호를 타고 베이징으로 간다', go:'베이징'},
  {s:'항공여행: 콩코드 여객기를 타고 타이베이로 간다', go:'타이베이'},
  {s:'고속도로: 출발 칸으로 간다', go:'출발'},
  {s:'노벨평화상 수상: 상금 30만', d:300}, {s:'복권 당첨: 20만', d:200}, {s:'자동차 경주 우승: 상금 10만', d:100},
  {s:'장학금 혜택: 10만', d:100}, {s:'연금 혜택: 5만', d:50},
  {s:'해외유학: 10만 낸다', d:-100}, {s:'병원비: 5만 낸다', d:-50}, {s:'과속운전 벌금: 5만 낸다', d:-50},
  {s:'생일 축하: 모두에게 1천 원씩 받는다', each:1},
  {s:'자동차 경주 우승: 상금 10만', d:100}, {s:'복권 당첨: 20만', d:200}
];
// 건물 상태: lv = 별장 수(0~2) + 3 × 빌딩(0/1) + 6 × 호텔(0/1)
const bmV = x => x % 3, bmB = x => Math.floor(x / 3) % 2, bmH = x => Math.floor(x / 6);
const bmLv = (v, b, h) => v + 3 * b + 6 * h;
// 돈 표시: 천 원 단위 → "1만 2천", "2천", "293만"
function bmW(v){
  const neg = v < 0; v = Math.abs(Math.round(v));
  const m = Math.floor(v / 10), k = v % 10;
  return (neg ? '−' : '') + (m && k ? `${m}만 ${k}천` : m ? `${m}만` : `${k}천`);
}

// 칸 안의 짧은 표시: 10만 이상은 만 단위 반올림(159만), 그 아래는 1.2만·2천
function bmWs(v){ v = Math.round(v); return v >= 100 ? `${Math.round(v / 10)}만` : v % 10 === 0 ? `${v / 10}만` : v >= 10 ? `${(v / 10).toFixed(1)}만` : `${v}천`; }

const BME = {
  newGame(nPl, stake, rnd){
    const g = {v:2, stake, n:nPl, round:1, turn:0, fund:0, dbl:0, again:false, outN:0, over:false,
      pl:Array.from({length:nPl}, (_, i) => ({nm:BM.names[i], me:i === 0, pos:0, cash:BM.start, out:false, outAt:0, jail:0, free:0, coupon:0, space:0})),
      own:BM_SQ.map(() => -1), lv:BM_SQ.map(() => 0), bought:BM_SQ.map(() => 0), deck:[], pending:null, log:[], dice:null};
    // 먼저 굴리는 쪽이 땅을 먼저 사서 유리하므로 첫 차례는 무작위로 정한다
    g.rec = []; BME.rec(g, `시작: ${nPl}명, 판돈 ${stake}달러, 시작 돈 ${bmW(BM.start)}`);
    g.first = g.turn = Math.floor(rnd() * nPl);
    g.pending = g.turn === 0 ? {k:'roll'} : null;
    BME.log(g, `${g.pl[g.turn].nm}부터 시작`);
    BME.shuffle(g, rnd);
    return g;
  },
  shuffle(g, rnd){ const d = BM_CARDS.map((_, i) => i); for (let i = d.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } g.deck = d; },
  snap(g, ev){ if (ev) ev.push({t:'snap', v:BME.view(g)}); },
  view: g => ({cash:g.pl.map(p => p.cash), out:g.pl.map(p => p.out), own:g.own.slice(), lv:g.lv.slice(), fund:g.fund,
    jail:g.pl.map(p => p.jail), free:g.pl.map(p => p.free), coupon:g.pl.map(p => p.coupon), space:g.pl.map(p => p.space)}),
  log(g, s){ g.log.push(s); if (g.log.length > 40) g.log.splice(0, g.log.length - 40); BME.rec(g, s); },
  // 판 전체 기록 (서버 seed10k_bmlog에 남김): "시각 바퀴 내용". 화면 기록과 달리 줄이지 않는다 (안전 상한 6000줄)
  rec(g, s){
    const r = g.rec || (g.rec = []);
    const t = new Date(Date.now() + 9 * 3600e3).toISOString().slice(11, 19);   // 한국 시각 HH:MM:SS
    r.push(`${t} ${g.round || 1}바퀴 ${s}`); if (r.length > 6000) r.splice(0, r.length - 6000);
  },
  // 통행료 = 대지료 + 별장(1채 또는 2채 값) + 빌딩 + 호텔. 특수 땅은 정해진 통행료
  rentOf(sq, lv){
    const c = BM_SQ[sq]; if (c.t !== 'city') return 0;
    if (c.sp) return c.r[0];
    const v = bmV(lv);
    return c.r[0] + (v ? c.r[v] : 0) + (bmB(lv) ? c.r[3] : 0) + (bmH(lv) ? c.r[4] : 0);
  },
  rent: (g, sq) => g.own[sq] < 0 ? 0 : BME.rentOf(sq, g.lv[sq]),
  // 건설비 합 (땅값 제외)
  bldCost(sq, lv){ const c = BM_SQ[sq]; return c.sp ? 0 : bmV(lv) * c.c[0] + bmB(lv) * c.c[1] + bmH(lv) * c.c[2]; },
  assets(g, i){
    let a = g.pl[i].cash;
    g.own.forEach((o, k) => { if (o === i) a += BM_SQ[k].p + BME.bldCost(k, g.lv[k]); });
    return a;
  },
  alive: g => g.pl.filter(p => !p.out).length,
  // 지을 수 있는 것: 별장(2채까지), 빌딩(1), 호텔(1)
  canBuild(g, sq){
    const c = BM_SQ[sq], lv = g.lv[sq], out = [];
    if (c.t !== 'city' || c.sp) return out;
    if (bmV(lv) < 2) out.push({k:'v', cost:c.c[0], nm:'별장'});
    if (!bmB(lv)) out.push({k:'b', cost:c.c[1], nm:'빌딩'});
    if (!bmH(lv)) out.push({k:'h', cost:c.c[2], nm:'호텔'});
    return out;
  },
  // 판 값: 맨 비싼 건물부터 한 개씩(호텔 → 빌딩 → 별장) 건설비의 절반, 건물이 없으면 땅값의 절반
  sellOne(g, k){
    const c = BM_SQ[k], lv = g.lv[k];
    if (bmH(lv)) return Math.floor(c.c[2] / 2);
    if (bmB(lv)) return Math.floor(c.c[1] / 2);
    if (bmV(lv)) return Math.floor(c.c[0] / 2);
    return Math.floor(c.p / 2);
  },
  sellName(g, k){ const lv = g.lv[k]; return bmH(lv) ? '호텔' : bmB(lv) ? '빌딩' : bmV(lv) ? '별장' : '땅'; },
  sellUnit(g, k){   // 한 개 팔고 받은 돈을 돌려준다
    const v = BME.sellOne(g, k), lv = g.lv[k];
    if (bmH(lv)) g.lv[k] -= 6; else if (bmB(lv)) g.lv[k] -= 3; else if (bmV(lv)) g.lv[k] -= 1;
    else { g.own[k] = -1; g.bought[k] = 0; }
    return v;
  },
  sellValue(g, i){
    let v = 0;
    g.own.forEach((o, k) => { if (o !== i) return; const c = BM_SQ[k], lv = g.lv[k]; v += Math.floor(c.p / 2);
      if (!c.sp) v += bmV(lv) * Math.floor(c.c[0] / 2) + bmB(lv) * Math.floor(c.c[1] / 2) + bmH(lv) * Math.floor(c.c[2] / 2); });
    return v;
  },
  need: g => g.pending && g.pending.k === 'sell' ? g.pending.pays.reduce((a, x) => a + x.amt, 0) : 0,
  // 돈 내기. 사람이 모자라면 팔 것을 고르도록 멈추고, 컴퓨터는 통행료가 낮은 것부터 자동으로 판다. 다 팔아도 모자라면 파산
  pay(g, i, amt, to, ev){
    const p = g.pl[i];
    if (amt <= 0) return true;
    // 팔 것 고르기는 한 번에 한 사람만 (같이 하기에서 둘이 동시에 모자라면 뒤 사람은 자동으로 판다)
    if (p.me && g.pending && g.pending.k === 'sell' && g.pending.who === i){ g.pending.pays.push({amt, to}); return true; }
    if (p.me && !(g.pending && g.pending.k === 'sell') && p.cash < amt && p.cash + BME.sellValue(g, i) >= amt){
      g.pending = {k:'sell', who:i, pays:[{amt, to}]};
      BME.log(g, `${p.nm} 돈이 모자람 (${bmW(amt)} 필요)`); ev.push({t:'msg', s:`돈이 모자랍니다! ${bmW(amt)} 필요`, k:'short', i});
      return true;
    }
    if (p.cash < amt) BME.liquidate(g, i, amt, ev);
    if (p.cash >= amt){
      p.cash -= amt;
      if (to >= 0) g.pl[to].cash += amt; else if (to === -2) g.fund += amt;   // -1 은행, -2 사회복지기금
      BME.snap(g, ev);
      return true;
    }
    BME.bankrupt(g, i, to, ev);
    return false;
  },
  bankrupt(g, i, to, ev){
    const p = g.pl[i], got = p.cash; p.cash = 0;
    if (to >= 0) g.pl[to].cash += got; else if (to === -2) g.fund += got;
    p.out = true; p.outAt = ++g.outN; p.jail = 0; p.space = 0;
    g.own.forEach((o, k) => { if (o === i){ g.own[k] = -1; g.lv[k] = 0; g.bought[k] = 0; } });
    BME.log(g, `${p.nm} 파산`); ev.push({t:'msg', s:`${p.nm} 파산!`, k:'bankrupt', i}); BME.snap(g, ev);
  },
  liquidate(g, i, amt, ev){
    const sold = BME._liq(g, i, amt);
    if (sold.length && ev){ ev.push({t:'msg', s:`${g.pl[i].nm} 돈이 모자라 매각: ${BME.soldText(sold)}`, k:'sell', i}); BME.snap(g, ev); }
  },
  // 판 것 목록을 짧게: "서울 땅, 런던 별장 2채"
  soldText(sold){ const c = {}; sold.forEach(x => c[x] = (c[x] || 0) + 1); return Object.entries(c).map(([x, n]) => n > 1 ? `${x} ${n}채` : x).join(', '); },
  // 지금 통행료가 가장 낮은 땅부터 한 개씩 판다 (같으면 땅값이 싼 곳부터). 팔 때마다 통행료가 바뀌므로 매번 다시 고른다
  _liq(g, i, amt){
    const p = g.pl[i], sold = [];
    while (p.cash < amt){
      let k = -1, kr = Infinity;
      g.own.forEach((o, q) => { if (o !== i) return; const r = BME.rent(g, q); if (r < kr || (r === kr && BM_SQ[q].p < BM_SQ[k].p)){ k = q; kr = r; } });
      if (k < 0) break;
      const nm = BME.sellName(g, k), v = BME.sellUnit(g, k);
      p.cash += v; BME.log(g, `${p.nm} ${BM_SQ[k].n} ${nm} 매각 +${bmW(v)}`); sold.push(`${BM_SQ[k].s} ${nm}`);
    }
    return sold;
  },
  sell(g, k, ev, rnd){
    const pd = g.pending; ev = ev || []; rnd = rnd || Math.random;
    if (!pd || pd.k !== 'sell') return ev;
    const i = pd.who, p = g.pl[i];
    BME.rec(g, `[선택] ${p.nm} 빚 ${bmW(BME.need(g))} 정리: ${k === 'auto' ? '자동 팔기' : `${BM_SQ[k] ? BM_SQ[k].n : k} 팔기`} (현금 ${bmW(p.cash)})`);
    if (k === 'auto'){ const sold = BME._liq(g, i, BME.need(g)); if (sold.length){ ev.push({t:'msg', s:`자동 매각: ${BME.soldText(sold)}`, k:'sold', i}); BME.snap(g, ev); } }
    else if (g.own[k] === i){
      const nm = BME.sellName(g, k), v = BME.sellUnit(g, k);
      p.cash += v; BME.log(g, `${p.nm} ${BM_SQ[k].n} ${nm} 매각 +${bmW(v)}`);
      ev.push({t:'msg', s:`${BM_SQ[k].s} ${nm} 매각 +${bmW(v)}`, k:'sold', i, sq:k});
      BME.snap(g, ev);
    }
    if (p.cash >= BME.need(g) || !g.own.some(o => o === i)){
      g.pending = null;
      for (const x of pd.pays) BME.pay(g, i, x.amt, x.to, ev);
      // 우주여행비를 내려고 팔았으면 이어서 날아간다
      if (pd.after && pd.after.space !== undefined && !p.out && !g.pending){
        const to = pd.after.space;
        BME.log(g, `${p.nm} 우주여행으로 ${BM_SQ[to].n}`); ev.push({t:'msg', s:`${BM_SQ[to].s}(으)로 우주여행`, k:'fly', i, sq:to});
        BME.goTo(g, i, to, ev, true); BME.land(g, i, ev, rnd, 1);
      }
      BME.afterAction(g);
    }
    return ev;
  },
  // d칸 이동 (d<0이면 뒤로). 앞으로 가다 출발을 지나거나 서면 월급
  move(g, i, d, ev, noSalary){
    const p = g.pl[i];
    let path = [];
    for (let s = 0; s < Math.abs(d); s++){
      p.pos = (p.pos + (d > 0 ? 1 : BM_N - 1)) % BM_N; path.push(p.pos);
      if (d > 0 && p.pos === 0 && !noSalary){
        ev.push({t:'move', i, path}); path = [];
        p.cash += BM.salary; BME.log(g, `${p.nm} 출발 통과 월급 +${bmW(BM.salary)}`);
        ev.push({t:'msg', s:`월급 +${bmW(BM.salary)}`, k:'salary', i, quick:true}); BME.snap(g, ev);
      }
    }
    if (path.length) ev.push({t:'move', i, path});
  },
  goTo(g, i, sq, ev, salary){
    const p = g.pl[i], d = (sq - p.pos + BM_N) % BM_N;
    if (salary) BME.move(g, i, d, ev);
    else { p.pos = sq; ev.push({t:'move', i, path:[sq], jump:true}); }
  },
  toJail(g, i, ev){ const p = g.pl[i]; BME.goTo(g, i, 10, ev, false); p.jail = BM.jail; g.again = false; BME.log(g, `${p.nm} 무인도에 갇힘`); ev.push({t:'msg', s:'무인도에 갇혔다', k:'jail', i}); BME.snap(g, ev); },
  // 지금 칸의 효과. 사람의 결정이 필요하면 g.pending을 세우고 멈춘다
  land(g, i, ev, rnd, depth = 0){
    const p = g.pl[i], c = BM_SQ[p.pos], sq = p.pos;
    if (p.out || depth > 5) return;
    if (c.t === 'city'){
      const o = g.own[sq];
      if (o < 0){
        if (p.cash >= c.p){ if (p.me) g.pending = {k:'buy', sq}; else if (BME.botBuy(g, i, sq)) BME.buy(g, i, sq, ev); else BME.log(g, `${p.nm} ${c.n} 안 삼 (현금 ${bmW(Math.round(BME.reserve(g, i) * BME.ai.buyF))}은 남겨 둠)`); }
        else if (p.me){ BME.log(g, `${p.nm} 현금이 모자라 ${c.n}(${bmW(c.p)})을 못 삼`); ev.push({t:'msg', s:`현금이 모자라 ${c.s}(${bmW(c.p)}) 못 삼 · 현금 ${bmW(p.cash)}`, k:'nobuy', i}); }
      } else if (o === i){
        // 산 그 차례가 아니면 건물을 지을 수 있다
        if (g.bought[sq] !== BME.turnId(g) && BME.canBuild(g, sq).some(x => p.cash >= x.cost)){ if (p.me) g.pending = {k:'build', sq}; else BME.botBuild(g, i, sq, ev); }
      } else if (!g.pl[o].out){
        const r = BME.rent(g, sq);
        // 우대권이 있으면: 사람은 쓸지 묻고, 컴퓨터는 통행료가 크면(30만 이상이거나 현금의 30% 이상) 쓴다
        if (p.coupon > 0 && p.me){ g.pending = {k:'coupon', sq, r, o}; }
        else if (p.coupon > 0 && (r >= 300 || r >= p.cash * 0.3)) BME.useCoupon(g, i, sq, ev);
        else BME.payRent(g, i, sq, r, o, ev);
      }
    } else if (c.t === 'fundIn'){
      BME.log(g, `${p.nm} 사회복지기금 ${bmW(BM.fundIn)} 냄`); ev.push({t:'msg', s:`사회복지기금 ${bmW(BM.fundIn)}`, k:'tax', i});
      BME.pay(g, i, BM.fundIn, -2, ev);
    } else if (c.t === 'fundOut'){
      if (g.fund > 0){ BME.log(g, `${p.nm} 사회복지기금 ${bmW(g.fund)} 받음`); ev.push({t:'msg', s:`사회복지기금 ${bmW(g.fund)}!`, k:'fund', i}); p.cash += g.fund; g.fund = 0; BME.snap(g, ev); }
    } else if (c.t === 'island'){
      if (!p.jail){ p.jail = BM.jail; g.again = false; BME.log(g, `${p.nm} 무인도에 갇힘`); ev.push({t:'msg', s:'무인도에 갇혔다', k:'jail', i}); BME.snap(g, ev); }
    } else if (c.t === 'space'){
      // 다음 차례에 주사위 대신 원하는 칸으로 간다 (컬럼비아호 주인에게 우주여행비)
      if (!p.space){ p.space = p.spaceFree ? 2 : 1; p.spaceFree = 0; g.again = false; BME.log(g, `${p.nm} 우주여행 대기`); ev.push({t:'msg', s:'다음 차례에 우주여행', k:'fly', i}); BME.snap(g, ev); }
    } else if (c.t === 'key'){
      if (!g.deck.length) BME.shuffle(g, rnd);
      const card = BM_CARDS[g.deck.pop()];
      BME.log(g, `${p.nm} 황금열쇠: ${card.s}`); ev.push({t:'card', s:card.s, i});
      BME.card(g, i, card, ev, rnd, depth);
    }
  },
  payRent(g, i, sq, r, o, ev){ const p = g.pl[i]; BME.log(g, `${p.nm} → ${g.pl[o].nm} 통행료 ${bmW(r)} (${BM_SQ[sq].n})`); ev.push({t:'msg', s:`통행료 ${bmW(r)}`, k:'rent', i, to:o, sq, v:r}); BME.pay(g, i, r, o, ev); },
  useCoupon(g, i, sq, ev){ const p = g.pl[i]; p.coupon--; BME.log(g, `${p.nm} 우대권으로 ${BM_SQ[sq].n} 통행료 면제`); ev.push({t:'msg', s:`우대권으로 통행료 면제`, k:'coupon', i}); BME.snap(g, ev); },
  card(g, i, card, ev, rnd, depth){
    const p = g.pl[i];
    if (card.d > 0){ p.cash += card.d; BME.snap(g, ev); }
    else if (card.d < 0) BME.pay(g, i, -card.d, -1, ev);
    else if (card.tax){
      let t = 0; g.own.forEach((o, k) => { if (o === i){ const lv = g.lv[k]; t += bmV(lv) * card.tax[0] + bmB(lv) * card.tax[1] + bmH(lv) * card.tax[2]; } });
      if (t) BME.pay(g, i, t, -1, ev);
    }
    else if (card.half){
      let k = -1; g.own.forEach((o, q) => { if (o === i && (k < 0 || BM_SQ[q].p > BM_SQ[k].p)) k = q; });
      if (k >= 0){ const v = Math.floor((BM_SQ[k].p + BME.bldCost(k, g.lv[k])) / 2); g.own[k] = -1; g.lv[k] = 0; g.bought[k] = 0; p.cash += v; BME.log(g, `${p.nm} ${BM_SQ[k].n} 반값 매각 +${bmW(v)}`); ev.push({t:'msg', s:`${BM_SQ[k].s} 반값 매각 +${bmW(v)}`, k:'sell', i}); BME.snap(g, ev); }
    }
    else if (card.free){ p.free++; BME.snap(g, ev); }
    else if (card.coupon){ p.coupon++; BME.snap(g, ev); }
    else if (card.each){ g.pl.forEach((q, j) => { if (j === i || q.out || p.out) return; BME.pay(g, j, card.each, i, ev); }); }
    else if (card.jail) BME.toJail(g, i, ev);
    else if (card.world){
      BME.move(g, i, BM_N, ev);
      if (g.fund > 0){ p.cash += g.fund; BME.log(g, `${p.nm} 사회복지기금 ${bmW(g.fund)} 받음`); ev.push({t:'msg', s:`사회복지기금 ${bmW(g.fund)}!`, k:'fund', i}); g.fund = 0; BME.snap(g, ev); }
    }
    else if (card.space){ p.spaceFree = 1; BME.goTo(g, i, 30, ev, true); BME.land(g, i, ev, rnd, depth + 1); }
    else if (card.go !== undefined){ BME.goTo(g, i, BM_IDX(card.go), ev, true); BME.land(g, i, ev, rnd, depth + 1); }
    else if (card.step){ BME.move(g, i, card.step, ev); BME.land(g, i, ev, rnd, depth + 1); }
  },
  // 같은 차례에 산 땅에는 짓지 못하게 차례 번호를 센다
  turnId: g => g.round * 10 + g.turn,
  buy(g, i, sq, ev){
    const p = g.pl[i]; p.cash -= BM_SQ[sq].p; g.own[sq] = i; g.bought[sq] = BME.turnId(g);
    BME.log(g, `${p.nm} ${BM_SQ[sq].n} 구입 (${bmW(BM_SQ[sq].p)})`);
    if (ev){ ev.push({t:'msg', s:`${BM_SQ[sq].s} 구입!`, k:'buy', i, sq}); BME.snap(g, ev); }
  },
  build(g, i, sq, kind, ev){
    const p = g.pl[i], c = BM_SQ[sq], opt = BME.canBuild(g, sq).find(x => x.k === kind);
    if (!opt || p.cash < opt.cost) return false;
    p.cash -= opt.cost; g.lv[sq] += kind === 'v' ? 1 : kind === 'b' ? 3 : 6;
    BME.log(g, `${p.nm} ${c.n}에 ${opt.nm} (${bmW(opt.cost)})`);
    if (ev){ ev.push({t:'msg', s:`${opt.nm} 건설!`, k:'build', i, sq, v:kind}); BME.snap(g, ev); }
    return true;
  },
  // ── 컴퓨터의 판단 ──
  // 위험: 다음 주사위(2~12칸 앞)에 걸릴 수 있는 남의 땅 통행료의 최댓값과 기댓값, 보드 전체에서 가장 비싼 남의 통행료
  danger(g, i){
    const p = g.pl[i]; let exp = 0, max = 0, top = 0;
    const toll = k => { const o = g.own[k]; return o >= 0 && o !== i && !g.pl[o].out ? BME.rent(g, k) : BM_SQ[k].t === 'fundIn' ? BM.fundIn : 0; };
    for (let s = 2; s <= 12; s++){ const r = toll((p.pos + s) % BM_N), pr = (6 - Math.abs(s - 7)) / 36; exp += pr * r; if (r > max) max = r; }
    g.own.forEach((o, k) => { if (o >= 0 && o !== i && !g.pl[o].out) top = Math.max(top, BME.rent(g, k)); });
    return {exp, max, top};
  },
  // 남겨 둘 현금: 바로 앞 위험과 보드 전체 위험을 섞는다 (팔면 반값이 되므로 파산 직전까지 쓰지 않는다)
  reserve(g, i){ const d = BME.danger(g, i), A = BME.ai; return Math.max(A.resMin, Math.round(A.resMax * d.max + A.resTop * d.top + A.resExp * d.exp)); },
  // 값은 자동 대전 수만 판으로 고른 것 (풀매수 전략과 맞붙여 같거나 조금 나은 범위에서, 현금을 남기는 쪽으로)
  ai:{resMin:100, resMax:0.2, resTop:0.03, resExp:0, buyF:0.8, maxBuild:2, minScore:0},
  botBuy(g, i, sq){
    const c = BM_SQ[sq], p = g.pl[i];
    // 땅은 싸고 나중에 건물을 올릴 자리라 짓기보다 덜 아껴 둔다
    return p.cash - c.p >= BME.reserve(g, i) * BME.ai.buyF;
  },
  // 짓기: 늘어나는 통행료 ÷ 건설비가 큰 것부터, 남겨 둘 현금을 지키는 만큼만, 한 번에 maxBuild개까지
  botBuild(g, i, sq, ev){
    let n = 0;
    while (n < BME.ai.maxBuild){
      const lv = g.lv[sq], base = BME.rentOf(sq, lv), res = BME.reserve(g, i);
      const opts = BME.canBuild(g, sq).map(o => ({...o, gain:BME.rentOf(sq, lv + (o.k === 'v' ? 1 : o.k === 'b' ? 3 : 6)) - base}))
        .filter(o => g.pl[i].cash - o.cost >= res && o.gain / o.cost > BME.ai.minScore).sort((x, y) => y.gain / y.cost - x.gain / x.cost);
      if (!opts.length){
        if (!n && BME.canBuild(g, sq).some(o => g.pl[i].cash >= o.cost)) BME.log(g, `${g.pl[i].nm} ${BM_SQ[sq].n}에 안 지음 (다음 위험 대비 현금 ${bmW(res)} 남김)`);
        break;
      }
      BME.build(g, i, sq, opts[0].k, ev); n++;
    }
  },
  // 우주여행 목적지: 살 수 있는 주인 없는 땅(통행료 잠재력 큰 곳) → 지을 수 있는 내 땅 → 기금 → 출발. 남의 땅은 피한다
  botSpace(g, i){
    const p = g.pl[i], res = BME.reserve(g, i);
    let best = -1, bv = -1;
    BM_SQ.forEach((c, k) => { if (c.t !== 'city' || g.own[k] >= 0 || p.cash - c.p < res * BME.ai.buyF) return; const v = c.sp ? c.r[0] : BME.rentOf(k, bmLv(2, 1, 1)) / 4; if (v > bv){ best = k; bv = v; } });
    if (best >= 0) return best;
    BM_SQ.forEach((c, k) => { if (c.t !== 'city' || g.own[k] !== i) return; const o = BME.canBuild(g, k).filter(x => p.cash - x.cost >= res); if (!o.length) return; const v = Math.max(...o.map(x => BME.rentOf(k, g.lv[k] + (x.k === 'v' ? 1 : x.k === 'b' ? 3 : 6)) - BME.rentOf(k, g.lv[k]))); if (v > bv){ best = k; bv = v; } });
    if (best >= 0) return best;
    return g.fund >= BM.salary ? 20 : 0;
  },
  // 우주여행: 컬럼비아호 주인(나 말고)에게 우주여행비를 내고 원하는 칸으로 간다
  space(g, i, to, ev, rnd){
    const p = g.pl[i], col = BM_IDX('컬럼비아호'), o = g.own[col], free = p.space === 2;
    p.space = 0;
    if (!free && o >= 0 && o !== i && !g.pl[o].out){ BME.log(g, `${p.nm} 우주여행비 ${bmW(BM.spaceFee)} → ${g.pl[o].nm}`); ev.push({t:'msg', s:`우주여행비 ${bmW(BM.spaceFee)}`, k:'rent', i, to:o, sq:col, v:BM.spaceFee}); BME.pay(g, i, BM.spaceFee, o, ev); }
    if (p.out || (g.pending && g.pending.k === 'sell')){ if (g.pending) g.pending.after = {space:to}; return; }
    BME.log(g, `${p.nm} 우주여행으로 ${BM_SQ[to].n}`); ev.push({t:'msg', s:`${BM_SQ[to].s}(으)로 우주여행`, k:'fly', i, sq:to});
    BME.goTo(g, i, to, ev, true); BME.land(g, i, ev, rnd, 1);
  },
  // 주사위를 굴려 한 번 움직인다 (같은 눈이면 g.again). 우주여행 대기 중이면 주사위 대신 날아간다(컴퓨터)
  roll(g, rnd){
    const i = g.turn, p = g.pl[i], ev = [];
    g.pending = null; g.again = false;
    if (p.space){ BME.space(g, i, BME.botSpace(g, i), ev, rnd); BME.afterAction(g); return ev; }
    const a = 1 + Math.floor(rnd() * 6), b = 1 + Math.floor(rnd() * 6);
    g.dice = [a, b];
    BME.rec(g, `${p.nm} 주사위 ${a}+${b}=${a + b}${a === b ? ' (같은 눈)' : ''} (${BM_SQ[p.pos].n}에서, 현금 ${bmW(p.cash)})`);
    ev.push({t:'dice', a, b, i});
    if (p.jail > 0){
      if (p.free > 0){ p.free--; p.jail = 0; BME.log(g, `${p.nm} 탈출권으로 무인도 탈출`); ev.push({t:'msg', s:'탈출권으로 무인도 탈출', k:'escape', i}); BME.snap(g, ev); }
      else if (a === b){ p.jail = 0; BME.log(g, `${p.nm} 같은 눈으로 무인도 탈출`); ev.push({t:'msg', s:'무인도 탈출!', k:'escape', i}); BME.snap(g, ev); BME.move(g, i, a + b, ev); BME.land(g, i, ev, rnd); BME.afterAction(g); return ev; }
      else { p.jail--; BME.log(g, `${p.nm} 무인도 (${p.jail ? `${p.jail}턴 더` : '다음 턴에 나감'})`); ev.push({t:'msg', s:'무인도에서 못 나감', k:'stuck', i}); BME.snap(g, ev); BME.afterAction(g); return ev; }
    }
    if (a === b){
      g.dbl++;
      if (g.dbl >= 3){ BME.log(g, `${p.nm} 같은 눈 3번 → 무인도`); BME.toJail(g, i, ev); BME.afterAction(g); return ev; }
      g.again = true;
    }
    BME.move(g, i, a + b, ev);
    BME.land(g, i, ev, rnd);
    BME.afterAction(g);
    return ev;
  },
  // 사람의 결정: buy (yes) / build (arg = 'v'|'b'|'h', yes=false면 그만) / space (arg = 칸)
  decide(g, yes, arg, rnd){
    const i = g.turn, pd = g.pending, ev = [];
    if (!pd) return ev;
    g.pending = null;
    { const nm = g.pl[i].nm, q = pd.sq !== undefined ? BM_SQ[pd.sq].n : '';
      BME.rec(g, `[선택] ${nm} ${pd.k === 'buy' ? `${q} ${yes ? '산다' : '안 산다'}` : pd.k === 'build' ? `${q} ${yes ? `짓기(${arg})` : '그만 짓기'}` : pd.k === 'coupon' ? `우대권 ${yes ? '쓴다' : '안 쓴다'} (${q})` : pd.k === 'space' ? `우주여행 → ${BM_SQ[arg] ? BM_SQ[arg].n : arg}` : pd.k}`); }
    if (pd.k === 'buy' && yes && g.pl[i].cash >= BM_SQ[pd.sq].p) BME.buy(g, i, pd.sq, ev);
    else if (pd.k === 'build' && yes){
      BME.build(g, i, pd.sq, arg, ev);
      if (BME.canBuild(g, pd.sq).some(x => g.pl[i].cash >= x.cost)){ g.pending = {k:'build', sq:pd.sq}; return ev; }   // 더 지을 수 있으면 계속
    }
    else if (pd.k === 'coupon'){
      if (yes && g.pl[i].coupon > 0) BME.useCoupon(g, i, pd.sq, ev);
      else BME.payRent(g, i, pd.sq, pd.r, pd.o, ev);
    }
    else if (pd.k === 'space'){
      const to = arg >= 0 && arg < BM_N && arg !== 30 ? arg : 0;
      BME.space(g, i, to, ev, rnd);
    }
    BME.afterAction(g);
    return ev;
  },
  afterAction(g){
    if (g.pending) return;
    const p = g.pl[g.turn];
    if ((!g.multi && g.pl[0].out) || BME.alive(g) <= 1){ g.over = true; g.pending = null; return; }   // 한 명만 남거나 (혼자 하기에서) 내가 파산하면 끝
    if (g.again && !p.out && !p.jail && !p.space){ g.again = false; g.pending = p.me ? {k:'roll'} : null; return; }
    BME.next(g);
  },
  next(g){
    g.dbl = 0; g.again = false;
    let t = g.turn;
    do { t = (t + 1) % g.n; if (t === (g.first || 0)) g.round++; } while (g.pl[t].out);
    g.turn = t;
    const p = g.pl[t];
    g.pending = p.me ? (p.space ? {k:'space'} : {k:'roll'}) : null;
  },
  // 순위: 살아남은 사람(내가 파산해 일찍 끝났으면 그들끼리는 총자산 순, 같으면 컴퓨터가 앞), 그다음 늦게 파산한 순
  ranking(g){
    return g.pl.map((p, i) => ({i, a:p.out ? -1 : BME.assets(g, i), outAt:p.outAt, me:p.me}))
      .sort((x, y) => (y.a - x.a) || (y.outAt - x.outAt) || (x.me - y.me)).map(x => x.i);
  }
};

/* ───── 화면 ───── */
function bmKey(){ return mgKey(); }
function bmToday(){
  if (!S.bm || typeof S.bm !== 'object') S.bm = {day:bmKey(), n:0, cur:null, hist:[]};
  if (S.bm.day !== bmKey()){ S.bm.day = bmKey(); S.bm.n = 0; }
  if (!Array.isArray(S.bm.hist)) S.bm.hist = [];
  // 예전 32칸 규칙으로 하던 판은 이어 할 수 없어 판돈을 돌려준다
  if (S.bm.cur && S.bm.cur.v !== 2){ const st = +S.bm.cur.stake || 0; S.bm.cur = null; if (st > 0){ receiveUSD(st); setTimeout(() => toast(`규칙이 바뀌어 하던 판을 끝내고 판돈 ${fmtUSD(st)}을 돌려드렸습니다`), 300); } save(); }
  return S.bm;
}
// 가입하고 waitDays일이 지나야 할 수 있다 (가입하자마자 판돈으로 순자산을 불리지 못하게). 로그인 안 했으면 이 기록을 시작한 때부터
function bmLockLeft(){
  if (!BM.waitDays) return 0;
  let t0 = ACC.user ? Date.parse(ACC.user.created_at || '') : NaN;
  if (!Number.isFinite(t0)) t0 = S && S.started;
  if (!Number.isFinite(t0)) return 0;
  return Math.max(0, t0 + BM.waitDays * 864e5 - Date.now());
}
function bmLockText(ms){
  const h = Math.ceil(ms / 36e5), d = Math.floor(h / 24);
  return d ? `${d}일 ${h % 24}시간` : `${h}시간`;
}
function bmCardHTML(){
  const b = bmToday(), g = b.cur;
  INFO.bm = {t:'부루마블', h:`<div class="prose"><p>부루마불(씨앗사) 1탄의 땅값·통행료·건설비·황금열쇠를 따랐습니다. 숫자는 나무위키 '부루마불/주요 카드'(2023년 7월 판)와 위키백과 '부루마불'에서 가져왔고, 자료에 없는 부분은 아래에 '자료 없음'으로 표시했습니다. 돈은 게임 속 돈입니다.</p><ul>
    <li>40칸 보드, 컴퓨터 1~3명. 모두 ${bmW(BM.start)}으로 시작하고, 출발을 지나거나 서면 월급 ${bmW(BM.salary)}을 받습니다.</li>
    <li>주인 없는 땅에 서면 살 수 있습니다. 내 도시에 다시 서면 별장(2채까지)·빌딩(1)·호텔(1)을 원하는 만큼 짓습니다(산 그 차례에는 못 짓습니다). 제주도·부산·서울·콩코드 여객기·퀸 엘리자베스호·컬럼비아호는 건물을 못 짓는 특수 땅입니다.</li>
    <li>통행료 = 대지료 + 별장(1채 또는 2채 값) + 빌딩 + 호텔. 땅을 누르면 금액이 나옵니다. (건물 통행료를 더하는 방식은 자료 없음, 흔히 쓰는 방식)</li>
    <li>같은 눈이면 한 번 더, 세 번 연속이면 무인도. 무인도에서는 ${BM.jail}턴 동안 같은 눈이 나와야 나가고, 탈출권이 있으면 바로 나갑니다(자료 없음: 턴 수는 흔히 쓰는 규칙).</li>
    <li>우주여행 칸에 서면 다음 차례에 주사위 대신 원하는 칸으로 가고, 컬럼비아호 주인에게 우주여행비 ${bmW(BM.spaceFee)}을 냅니다(2016년 판 나무위키 기준).</li>
    <li>사회복지기금 접수 칸에 서면 ${bmW(BM.fundIn)}을 기금에 내고, 사회복지기금 수령 칸에 서면 모인 기금을 모두 받습니다.</li>
    <li>우대권이 있으면 남의 땅에 섰을 때 쓸지 묻습니다(통행료 1번 면제, 우주여행비에는 못 씀). 컴퓨터는 통행료가 30만 이상이거나 현금의 30% 이상일 때 씁니다.</li>
    <li>황금열쇠 30장(2탄 전용 카드와 장기자랑은 뺌). 장수는 자료 없음: 우대권 2장, 관광여행 3장(제주도·부산·서울), 복권·자동차 경주 각 2장, 나머지 1장씩. 황금열쇠 칸 6곳의 정확한 위치도 자료 없음(흔히 알려진 배치).</li>
    <li>돈이 모자라면 팔 땅이나 건물을 직접 고릅니다(호텔 → 빌딩 → 별장 → 땅 순으로 하나씩, 건설비·땅값의 절반). 다 팔아도 모자라면 파산합니다. 자동 팔기와 컴퓨터는 지금 통행료가 낮은 땅부터 팝니다.</li>
    <li>한 명만 남을 때까지(나머지가 모두 파산할 때까지) 합니다. 순위는 늦게 파산한 순이고, 내가 파산하면 그 자리에서 끝납니다.</li>
    <li>판돈 ${fmtUSD(BM.minBet, 0)}~${fmtUSD(GAM.bm.off, 0)}(불법 모드 ${fmtUSD(GAM.bm.on, 0)})을 달러 통장에서 걸고 시작합니다. 끝나면 순위에 따라 판돈의 배수를 돌려받습니다. 2명: 1위 2배 / 3명: 1위 2.5배, 2위 0.5배 / 4명: 1위 3배, 2위 1배 (나머지 0). 배수의 평균이 1배라서 실력이 같으면 기대 손익은 0입니다.</li>
    ${BM.waitDays ? `<li>가입하고 ${BM.waitDays}일이 지나야 할 수 있습니다(로그인하지 않았으면 이 기록을 시작한 때부터).</li>` : ''}
    <li>판 수 제한은 없습니다. 도중에 닫아도 이어서 할 수 있습니다. 기권하면 그 자리에서 파산한 것으로 보고 순위를 매깁니다(아직 남은 컴퓨터 수 + 1위).</li>
    <li>딴 돈과 잃은 돈은 투자 손익처럼 순자산·수익률·랭킹에 그대로 반영됩니다.</li></ul></div>`};
  const lock = g ? 0 : bmLockLeft();
  const label = g ? '이어 하기' : S.over ? '파산해서 할 수 없습니다' : lock ? `${bmLockText(lock)} 뒤부터` : '새 게임';
  const h = b.hist.slice(0, 3).map(x => `<span class="${cls(x.pay - x.stake)}">${x.rank}/${x.n}위 ${signUSD(x.pay - x.stake)}</span>`).join(' · ');
  return `<div class="card-h"><h2>🎲 부루마블 ${infoBtn('bm')}</h2><small>${isLive() ? '오늘' : '이번 거래일'} ${b.n}판</small></div>
    ${lock ? `<p class="mg-desc">${ACC.user ? '가입' : '이 기록을 시작'}하고 ${BM.waitDays}일이 지나야 할 수 있습니다.</p>` : g ? `<p class="mg-desc">진행 중: ${g.round}바퀴째, 판돈 ${fmtUSD(g.stake)}</p>` : h ? `<p class="mg-desc">최근 ${h}</p>` : `<p class="mg-desc">판돈을 걸고 컴퓨터와 도시를 사고파는 주사위 보드게임</p>`}
    <div class="mg-foot"><span class="muted">${g ? '' : `달러 통장 <b class="num">${fmtUSDn(S.usd)}</b>`}</span><span style="display:flex;gap:8px">${b.last ? '<button class="btn" id="bmLastLog">지난 판 기록</button>' : ''}<button class="btn solid" id="bmGo" ${!g && (S.over || lock) ? 'disabled' : ''}>${label}</button></span></div>`;
}
function bmSetup(){
  if (BMV.mp && bmOpenNow()) bmHide();
  BMV.mp = false;
  const b = bmToday();
  if (b.cur) return bmOpen();
  if (S.over) return toast('파산해서 할 수 없습니다', true);
  if (bmLockLeft()) return toast(`가입하고 ${BM.waitDays}일이 지나야 할 수 있습니다 (${bmLockText(bmLockLeft())} 남음)`, true);
  UI.bmN = UI.bmN || 2; UI.bmBet = UI.bmBet || '';
  const close = showModal(`<h2>🎲 부루마블</h2><div id="bmSet"></div>
    <div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="bmStart">시작</button></div>`);
  const draw = () => {
    const box = $('#bmSet'); if (!box) return;
    const max = gamMax('bm');
    const bet = parseFloat(String(UI.bmBet).replace(/,/g, '')) || 0;
    const mult = BM.pay[UI.bmN + 1];
    const err = max < BM.minBet ? `달러 통장에 ${fmtUSDn(BM.minBet)} 이상 있어야 합니다.` : bet && (bet < BM.minBet || bet > max) ? `판돈은 ${fmtUSDn(BM.minBet, 0)}~${fmtUSDn(max, 0)}입니다.` : '';
    box.innerHTML = `<p style="margin:0 0 8px">컴퓨터 상대 수</p>
      <div class="seg" style="margin-bottom:12px">${[1, 2, 3].map(k => `<button data-bmn="${k}" aria-pressed="${UI.bmN === k}">${k}명</button>`).join('')}</div>
      <p style="margin:0 0 6px">판돈 (한도 ${fmtUSDn(gamIl() ? GAM.bm.on : GAM.bm.off, 0)}${gamIl() ? ', 🚨 불법 모드' : ''} · 달러 통장 ${fmtUSDn(S.usd)})</p>
      <label class="amt"><span>$</span><input id="bmBetIn" type="text" inputmode="decimal" placeholder="${BM.minBet}~${max}" value="${esc(UI.bmBet)}"></label>
      <div class="quick" style="margin:8px 0">${[10, 50, 100, 500].filter(v => v <= max).map(v => `<button data-bmbet="${v}">$${v}</button>`).join('')}${max >= BM.minBet ? `<button data-bmbet="${max}">최대</button>` : ''}</div>
      <div class="bd">${mult.map((m, k) => `<div><span>${k + 1}위</span><b class="num">${m}배${bet > 0 ? ` = ${fmtUSD(bet * m)}` : ''}</b></div>`).join('')}</div>
      <div class="err" role="status">${esc(err)}</div>`;
    $('#bmStart').disabled = !!err || !(bet >= BM.minBet && bet <= max);
    const inp = $('#bmBetIn');
    inp.addEventListener('input', () => { UI.bmBet = inp.value.replace(/[^\d.]/g, ''); const pos = inp.selectionStart; draw(); const i2 = $('#bmBetIn'); i2.focus(); try { i2.setSelectionRange(pos, pos); } catch(e){} });
    box.querySelectorAll('[data-bmn]').forEach(x => x.onclick = () => { UI.bmN = +x.dataset.bmn; draw(); });
    box.querySelectorAll('[data-bmbet]').forEach(x => x.onclick = () => { UI.bmBet = x.dataset.bmbet; draw(); });
  };
  draw();
  $('#bmStart').onclick = () => {
    const bet = Math.round((parseFloat(UI.bmBet) || 0) * 100) / 100, max = gamMax('bm');
    const b2 = bmToday();
    if (b2.cur || bmLockLeft() || !(bet >= BM.minBet && bet <= max)) return;
    const key = `bm:${Date.now().toString(36)}`;
    S.usd = Math.round((S.usd - bet) * 100) / 100; betPaid(key, bet);
    b2.n++; b2.cur = BME.newGame(UI.bmN + 1, bet, Math.random); b2.cur.il = gamIl();
    UI.bmBet = '';
    commit(); close();
    setTimeout(bmOpen, 200);
    setTimeout(() => betAudit(key, bet, '부루마블'), 200 + BET_AUDIT_MS);   // 시작 3초 뒤 판돈이 정확히 한 번 빠졌는지
  };
}

const BMV = {busy:false, gen:0, sel:-1, tok:null, view:null, msg:'', built:false, mp:false};
// mp: 같이 하기 판을 보는 중 (게임 상태는 심판이 정한 방 상태, 나는 자리 번호 bmMe())
function bmG(){ return BMV.mp ? (MP.room && MP.room.game === 'bm' && MP.room.state.g) || null : S && S.bm && S.bm.cur; }
const bmMe = () => BMV.mp ? mpMe() : 0;
const bmFast = () => !!SET.bmFast;
const bm3D = () => SET.bm3d === undefined ? window.innerWidth >= 700 : !!SET.bm3d;   // 정하지 않았으면 화면이 넓을 때(태블릿·PC)만 입체   // 입체(비스듬히 눕힌) 판. 끄면 예전 평면 판
const bmReduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } };
// 애니메이션 시간: 빠르게 켜면 절반
const bmMs = ms => Math.round(ms * (bmFast() ? 0.45 : 1) * (bmReduce() ? 0.5 : 1));
function bmWait(ms){ const gen = BMV.gen; return new Promise((res, rej) => setTimeout(() => (gen === BMV.gen && bmOpenNow()) ? res() : rej('stop'), bmMs(ms))); }
function bmOpen(){
  if (!bmG()) return;
  let ov = $('#bmOv');
  if (!ov){ ov = document.createElement('div'); ov.id = 'bmOv'; ov.className = 'bm-ov'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); document.body.appendChild(ov); }
  ov.hidden = false; document.documentElement.classList.add('bm-open');
  BMV.gen++; BMV.busy = false; BMV.sel = -1; BMV.tok = null; BMV.view = null; BMV.msg = ''; BMV.built = false;
  bmBuild(); bmUpdate(); bmTick();
}
function bmHide(){
  BMV.gen++; BMV.busy = false; BMV.tok = null; BMV.view = null;
  const ov = $('#bmOv'); if (!ov || ov.hidden) return;
  ov.hidden = true;
  document.documentElement.classList.remove('bm-open');
  if (UI.tab === 'market') renderTab();
}
const bmOpenNow = () => { const ov = $('#bmOv'); return !!(ov && !ov.hidden); };
// 칸 번호 → 9×9 격자 위치 (0 = 오른쪽 아래, 시계 반대 방향)
function bmCell(k){   // 11×11 격자
  if (k <= 10) return [11, 11 - k];
  if (k <= 20) return [11 - (k - 10), 1];
  if (k <= 30) return [1, 1 + (k - 20)];
  return [1 + (k - 30), 11];
}
const BM_ICON = {start:'🏁', key:'🔑', island:'🏝️', fundOut:'💰', fundIn:'💸', space:'🚀'};
const BM_SPI = {'제주도':'🌴', '부산':'⚓', '서울':'⭐', '콩코드 여객기':'✈️', '퀸 엘리자베스호':'🚢', '컬럼비아호':'🛰️'};
const BM_BI = {v:'🏠', b:'🏢', h:'🏨'};
const bmBldIcons = lv => '🏠'.repeat(bmV(lv)) + (bmB(lv) ? '🏢' : '') + (bmH(lv) ? '🏨' : '');
// 주사위 한 개 (정육면체). 면: 앞 1, 뒤 6, 오른쪽 3, 왼쪽 4, 위 5, 아래 2
const BM_PIPS = {1:[5], 2:[1, 9], 3:[1, 5, 9], 4:[1, 3, 7, 9], 5:[1, 3, 5, 7, 9], 6:[1, 3, 4, 6, 7, 9]};
const BM_FACE = {1:'rotateX(0deg) rotateY(0deg)', 6:'rotateY(180deg)', 3:'rotateY(-90deg)', 4:'rotateY(90deg)', 5:'rotateX(-90deg)', 2:'rotateX(90deg)'};
function bmDieHTML(){
  const face = (n, cls) => `<div class="bm-f ${cls}">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => `<i${BM_PIPS[n].includes(k) ? ' class="on"' : ''}></i>`).join('')}</div>`;
  return `<div class="bm-die"><div class="bm-cube">${face(1, 'f1')}${face(6, 'f6')}${face(3, 'f3')}${face(4, 'f4')}${face(5, 'f5')}${face(2, 'f2')}</div></div>`;
}
// 입체 체스 폰: 판과 나란한 원판을 높이별로 쌓는다 (회전체를 얇게 썬 모양). 반지름 r·높이 z는 말 크기(--S)에 대한 비율
//   받침(넓고 낮다) → 허리(좁아짐) → 깃 → 목 → 둥근 머리. 비스듬히 보면 쌓인 원판의 가장자리가 옆면처럼 보인다
const BM_PAWN = (() => {
  const L = [];
  for (let z = 0; z <= 0.1; z += 0.012) L.push([z, 0.5 - z * 0.6]);                    // 받침
  for (let z = 0.12; z <= 0.5; z += 0.018) L.push([z, 0.36 - (z - 0.12) * 0.5]);      // 허리
  L.push([0.52, 0.31], [0.535, 0.325], [0.55, 0.33], [0.565, 0.322], [0.58, 0.3], [0.595, 0.25], [0.61, 0.19], [0.625, 0.17]);                        // 깃
  for (let a = -0.97; a <= 0.97; a += 0.07) L.push([0.83 + Math.sin(a * Math.PI / 2) * 0.24, Math.cos(a * Math.PI / 2) * 0.25]);   // 머리 (구)
  return L.map(([z, r]) => [+z.toFixed(3), +Math.max(0.02, r).toFixed(3)]);
})();
const bmPawn3D = () => BM_PAWN.map(([z, r], k) => `<i${k === BM_PAWN.length - 1 ? ' class="hd"' : ''} style="--z:${z};--r:${r}"></i>`).join('');
// 체스 폰 그림 (40×64): 받침 → 목 → 깃 → 머리. 좌우 그라데이션으로 둥근 몸을 표현
function bmPawnSVG(i){
  const id = 'bmPg' + i, hl = `color-mix(in srgb,var(--pc) 38%,#fff)`, mid = 'var(--pc)', dk = `color-mix(in srgb,var(--pc) 55%,#000)`;
  return `<svg class="bm-pawn" viewBox="0 0 40 64" aria-hidden="true"><defs>
    <linearGradient id="${id}" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:${dk}"/><stop offset=".28" style="stop-color:${hl}"/><stop offset=".55" style="stop-color:${mid}"/><stop offset="1" style="stop-color:${dk}"/></linearGradient>
    <radialGradient id="${id}h" cx=".36" cy=".32" r=".7"><stop offset="0" style="stop-color:${hl}"/><stop offset=".55" style="stop-color:${mid}"/><stop offset="1" style="stop-color:${dk}"/></radialGradient></defs>
    <path d="M5 60q0-6 6-8h18q6 2 6 8z" fill="url(#${id})"/><ellipse cx="20" cy="60.5" rx="15" ry="3" fill="${dk}"/>
    <path d="M10 52q4-4 5-14h10q1 10 5 14z" fill="url(#${id})"/>
    <ellipse cx="20" cy="37" rx="10" ry="3.2" fill="url(#${id})"/><ellipse cx="20" cy="36" rx="10" ry="2.4" style="fill:${hl}" opacity=".55"/>
    <circle cx="20" cy="23" r="10.5" fill="url(#${id}h)"/><ellipse cx="16.5" cy="19" rx="3.2" ry="2.2" fill="#fff" opacity=".45"/>
  </svg>`;
}
function bmBuild(){
  const ov = $('#bmOv'), g = bmG(); if (!ov || !g) return;
  const cells = BM_SQ.map((c, k) => {
    const [r, col] = bmCell(k), side = k < 10 ? 'b' : k < 20 ? 'l' : k < 30 ? 't' : 'r';
    const body = c.t === 'city'
      ? (c.sp ? `<span class="bm-band" style="background:var(--ink-3)"></span><span class="bm-ic sm">${BM_SPI[c.n] || '★'}</span><span class="bm-n">${c.s}</span><span class="bm-p"></span>`
              : `<span class="bm-band" style="background:${BM.regions[c.g].c}"></span><span class="bm-n">${c.s}</span><span class="bm-p"></span><span class="bm-bld"></span>`)
      : `<span class="bm-ic">${BM_ICON[c.t]}</span><span class="bm-n bm-sp">${c.s}</span><span class="bm-p"></span>`;
    return `<button class="bm-c bm-${side}${k % 10 === 0 ? ' bm-k' : ''} bm-t-${c.t}" data-bmsq="${k}" style="grid-row:${r};grid-column:${col}">${body}</button>`;
  }).join('');
  // 말: 평면 판은 동그라미, 입체 판은 플레이어 색의 체스 폰(빛이 왼쪽 위에서 오는 원통 그늘) + 머리 위 이름표 + 판에 드리운 그림자
  const toks = g.pl.map((p, i) => bm3D()
    ? `<div class="bm-tok b3t" data-tok="${i}" style="--pc:${BM.cols[i]}"><i class="bm-tok-sh"></i><div class="bm-tok-i bm-p3">${bmPawn3D()}</div></div>`
    : `<div class="bm-tok" data-tok="${i}" style="--pc:${BM.cols[i]}"><div class="bm-tok-u"><div class="bm-tok-i"><span>${i === bmMe() ? '나' : esc([...p.nm][0] || '?')}</span></div></div></div>`).join('');
  const top = `<div class="bm-top"><button class="btn" id="bmClose">닫기</button><div class="bm-ttl"><b>🎲 부루마블</b><small id="bmSub"></small></div><div class="bm-tr"><button class="btn bm-spd bm-snd" id="bmSnd" aria-label="${BSA.on ? '소리 끄기' : '소리 켜기'}">${bsaIcon()}</button><button class="btn bm-spd" id="bm3d"></button><button class="btn bm-spd" id="bmSpd"></button><button class="btn" id="bmQuit">기권</button></div></div>`;
  const pls = `<div class="bm-pls" id="bmPls">${g.pl.map((p, i) => `<div class="bm-pl" data-pl="${i}"><i style="background:${BM.cols[i]}"></i><span class="bm-pn"></span><b class="num bm-pc"></b><small class="num bm-pa"></small></div>`).join('')}</div>`;
  const under = `<div class="bm-act" id="bmActBox"></div><div id="bmInfoBox"></div><ul class="bm-log" id="bmLog"></ul>`;
  ov.classList.toggle('b3', bm3D());
  // 입체 판: 판(칸·말·건물)만 비스듬히 눕히고, 주사위·글자·효과는 눕히지 않은 층에 띄운다. 고를 것·기록은 판 아래로
  ov.innerHTML = bm3D() ? `${top}
    <div class="bm-stage" id="bmStage">
      <div class="bm-board" id="bmBoard">${cells}<div class="bm-logo"><b>부루마블</b></div>
        <div class="bm-toks"><div class="bm-blds" id="bmBlds"></div>${toks}</div></div>
      <div class="bm-hud"><div class="bm-dice" id="bmDice">${bmDieHTML()}${bmDieHTML()}</div><div class="bm-msg" id="bmMsg"></div></div>
      <div class="bm-tags" id="bmTags">${g.pl.map((p, i) => `<span class="bm-tag" data-tag="${i}" style="--pc:${BM.cols[i]}">${esc(i === bmMe() ? '나' : p.nm)}</span>`).join('')}</div>
      ${pls}
      <div class="bm-fx" id="bmFx"></div>
    </div>
    <div class="bm-mid bm-under">${under}</div>` : `${top}
    <div class="bm-board" id="bmBoard">${cells}
      <div class="bm-mid">
        <div class="bm-row"><div class="bm-dice" id="bmDice">${bmDieHTML()}${bmDieHTML()}</div><div class="bm-msg" id="bmMsg"></div></div>
        ${under}
      </div>
      <div class="bm-toks">${toks}</div>
      <div class="bm-fx" id="bmFx"></div>
    </div>${pls}`;
  BMV.built = true;
  const d = g.dice || [1, 1];
  $$('#bmDice .bm-cube').forEach((c, k) => { c.style.transform = BM_FACE[d[k]]; });
  if (!bmBuild.rs){ bmBuild.rs = true; window.addEventListener('resize', () => { if (bmOpenNow()) bmPlace(true); }); }
  requestAnimationFrame(() => bmPlace(true));
  if (bm3D()) bmTagLoop();
}
// 이름표: 눕힌 판 안에 두면 뒤쪽 칸에 가려지므로, 눕히지 않은 층에 띄우고 매 프레임 말 머리 위를 따라간다
function bmTagLoop(){
  if (BMV.tagRaf) return;
  const step = () => {
    BMV.tagRaf = 0;
    const box = $('#bmTags'); if (!box || !bmOpenNow()) return;
    const br = box.getBoundingClientRect(), g = bmG();
    box.querySelectorAll('[data-tag]').forEach(t => {
      const i = +t.dataset.tag, pw = document.querySelector(`#bmOv [data-tok="${i}"] .bm-p3 .hd`), tok = pw && pw.closest('.bm-tok');
      if (!pw || !tok || tok.hidden){ t.hidden = true; return; }
      const r = pw.getBoundingClientRect(); t.hidden = false;
      t.style.transform = `translate(${r.left - br.left + r.width / 2}px, ${r.top - br.top}px) translate(-50%, -100%)`;
      t.classList.toggle('on', tok.classList.contains('turn'));
    });
    BMV.tagRaf = requestAnimationFrame(step);
  };
  BMV.tagRaf = requestAnimationFrame(step);
}
// 화면에 보이는 상태: 애니메이션 중에는 재생한 지점까지의 상태
const bmVw = g => BMV.view || BME.view(g);
function bmUpdate(){
  const ov = $('#bmOv'), g = bmG(); if (!ov || !g) return;
  if (!BMV.built) bmBuild();
  const ME = bmMe(), V = bmVw(g), pd = g.pending, myTurn = g.turn === ME && !BMV.busy && !g.over;
  const cur = BMV.busy && BMV.actor !== undefined ? BMV.actor : g.turn;   // 애니메이션 중에는 움직이는 사람
  if (BMV.mp){ mpSetH($('#bmSub'), `${ME < 0 ? '👀 관전 중 · ' : ''}${g.round}바퀴 · 판돈 ${fmtUSD(g.stake)} · <span id="mpTimer"></span>${esc(mpWatchTxt())}`); }
  else { const sb = $('#bmSub'); sb._h = null; sb.textContent = `${g.round}바퀴 · 판돈 ${fmtUSD(g.stake)}`; }
  $('#bmSpd').textContent = bmFast() ? '빠르게 ✓' : '빠르게';
  $('#bm3d').textContent = bm3D() ? '3D ✓' : '3D';
  BMV.lastV = V;
  $('#bmQuit').hidden = g.over || (BMV.mp && ME < 0);   // 관전은 '닫기'로 끝낸다
  BM_SQ.forEach((c, k) => {
    const el = ov.querySelector(`[data-bmsq="${k}"]`); if (!el) return;
    const o = V.own[k];
    el.classList.toggle('own', o >= 0);
    el.style.setProperty('--oc', o >= 0 ? BM.cols[o] : 'transparent');
    el.classList.toggle('fly', !!(pd && pd.k === 'space' && myTurn && k !== 30));
    el.classList.toggle('sel', BMV.sel === k);
    el.classList.toggle('sellable', !!(pd && pd.k === 'sell' && pd.who === ME && !BMV.busy && V.own[k] === ME));
    const pEl = el.querySelector('.bm-p');
    if (c.t === 'city'){
      pEl.textContent = bmWs(o >= 0 ? BME.rentOf(k, V.lv[k]) : c.p);
      const bl = el.querySelector('.bm-bld'); if (bl) bl.textContent = bmBldIcons(V.lv[k]);
    } else pEl.textContent = c.t === 'fundOut' && V.fund ? bmWs(V.fund) : '';
  });
  // 참가자
  g.pl.forEach((p, i) => {
    const el = ov.querySelector(`[data-pl="${i}"]`); if (!el) return;
    const out = V.out[i];
    el.classList.toggle('on', cur === i && !(g.over && !BMV.busy));
    el.classList.toggle('out', out);
    el.querySelector('.bm-pn').textContent = `${BMV.mp && i === ME ? '나' : p.nm}${V.jail[i] ? ' 🏝️' : ''}${V.space && V.space[i] ? ' 🚀' : ''}${V.free[i] ? ' 🎫' : ''}${V.coupon && V.coupon[i] ? ' 🎟️'.repeat(V.coupon[i]) : ''}`;
    el.querySelector('.bm-pc').textContent = out ? '파산' : bmW(V.cash[i]);
    let a = V.cash[i]; V.own.forEach((o, k) => { if (o === i) a += BM_SQ[k].p + BME.bldCost(k, V.lv[k]); });
    el.querySelector('.bm-pa').textContent = out ? '' : `자산 ${bmW(a)}`;
    const t = ov.querySelector(`[data-tok="${i}"]`); if (t){ t.hidden = out; t.classList.toggle('turn', cur === i && !(g.over && !BMV.busy)); }
  });
  // 행동 버튼
  let act = '';
  if (g.over && !BMV.busy) act = BMV.mp ? mbmOverHTML(g) : `<button class="btn solid bm-roll" id="bmEnd">결과 보기</button>${(BM.pay[g.n][BME.ranking(g).indexOf(0)] || 0) < 1 ? '<button class="btn run-btn" id="bmRun">🏃 도망가기</button>' : ''}`;
  else if (!BMV.busy && pd && pd.k === 'sell' && pd.who !== ME) act = `<p class="bm-wait">${esc(g.pl[pd.who].nm)}이(가) 팔 것을 고르는 중…</p>`;
  else if (!BMV.busy && pd && pd.k === 'sell'){
    const need = BME.need(g), cash = g.pl[ME].cash;
    const list = BM_SQ.map((c, k) => g.own[k] === ME ? `<button class="btn bm-sell" data-bmsell="${k}"><span>${c.s} ${BME.sellName(g, k)}</span><b class="num">+${bmW(BME.sellOne(g, k))}</b></button>` : '').join('');
    act = `<p class="bm-q">💸 돈이 모자랍니다. 팔 땅이나 건물을 고르세요 <small>내야 할 돈 ${bmW(need)} · 현금 ${bmW(cash)} · <b>${bmW(Math.max(0, need - cash))} 더 필요</b> (한 도시에서는 호텔 → 빌딩 → 별장 → 땅 순으로 팔립니다)</small></p><div class="bm-sells">${list}</div><div class="bm-acts"><button class="btn" data-bmsell="auto">통행료 낮은 것부터 자동으로 팔기</button></div>`;
  }
  else if (BMV.busy || g.turn !== ME) act = `<p class="bm-wait">${cur === ME ? '내' : esc(g.pl[cur].nm)} 차례…</p>`;
  else if (pd && pd.k === 'roll') act = `<button class="btn solid bm-roll" id="bmRoll">🎲 주사위 굴리기</button>`;
  else if (pd && pd.k === 'buy'){ const c = BM_SQ[pd.sq]; act = `<p class="bm-q">${c.n}을(를) ${bmW(c.p)}에 살까요? <small>${c.sp ? `통행료 ${bmW(c.r[0])} (건물 없음)` : `대지료 ${bmW(c.r[0])}, 건물을 지으면 최대 ${bmW(BME.rentOf(pd.sq, bmLv(2, 1, 1)))}`} · 현금 ${bmW(g.pl[bmMe()].cash)}</small></p><div class="bm-acts"><button class="btn" data-bmyes="0">안 산다</button><button class="btn solid" data-bmyes="1">산다</button></div>`; }
  else if (pd && pd.k === 'build'){
    const c = BM_SQ[pd.sq], lv = g.lv[pd.sq], cash = g.pl[ME].cash;
    const opts = BME.canBuild(g, pd.sq).map(o => { const nl = lv + (o.k === 'v' ? 1 : o.k === 'b' ? 3 : 6); return `<button class="btn bm-sell" data-bmbuild="${o.k}" ${cash < o.cost ? 'disabled' : ''}><span>${BM_BI[o.k]} ${o.nm} ${bmW(o.cost)}</span><b class="num">→ ${bmW(BME.rentOf(pd.sq, nl))}</b></button>`; }).join('');
    act = `<p class="bm-q">${c.n}에 무엇을 지을까요? <small>지금 ${bmBldIcons(lv) || '건물 없음'} · 통행료 ${bmW(BME.rentOf(pd.sq, lv))} · 현금 ${bmW(cash)}</small></p><div class="bm-sells">${opts}</div><div class="bm-acts"><button class="btn" data-bmyes="0">그만 짓기</button></div>`;
  }
  else if (pd && pd.k === 'coupon') act = `<p class="bm-q">🎟️ 우대권을 쓸까요? <small>${BM_SQ[pd.sq].n} 통행료 ${bmW(pd.r)} (${g.pl[pd.o].nm}에게) · 남은 우대권 ${g.pl[ME].coupon}장 · 현금 ${bmW(g.pl[ME].cash)}</small></p><div class="bm-acts"><button class="btn" data-bmyes="0">그냥 낸다</button><button class="btn solid" data-bmyes="1">우대권 쓴다</button></div>`;
  else if (pd && pd.k === 'space') act = `<p class="bm-q">🚀 우주여행: 갈 칸을 누르세요${BMV.sel >= 0 && BMV.sel !== 30 ? `: <b>${BM_SQ[BMV.sel].n}</b>` : ''} <small>컬럼비아호 주인이 다른 사람이면 우주여행비 ${bmW(BM.spaceFee)}${g.pl[bmMe()].space === 2 ? ' (초대권으로 면제)' : ''}</small></p><div class="bm-acts"><button class="btn solid" id="bmSpace" ${BMV.sel < 0 || BMV.sel === 30 ? 'disabled' : ''}>여기로 가기</button></div>`;
  const ab = $('#bmActBox'); if (ab.dataset.h !== act){ ab.innerHTML = act; ab.dataset.h = act; }
  $('#bmMsg').textContent = BMV.msg;
  $('#bmInfoBox').innerHTML = BMV.sel >= 0 && !(pd && pd.k === 'space') ? bmInfo(g, BMV.sel) : '';
  $('#bmLog').innerHTML = BMV.busy ? $('#bmLog').innerHTML : g.log.slice(-4).reverse().map(s => `<li>${esc(s)}</li>`).join('');
  bmPlace(false);
}
const bmRender = bmUpdate;
function bmInfo(g, k){
  const c = BM_SQ[k];
  if (c.t !== 'city') return `<p class="bm-info"><b>${c.n}</b></p>`;
  const o = g.own[k], own = o >= 0 ? ` · 주인 ${g.pl[o].nm}${c.sp ? '' : ` (${bmBldIcons(g.lv[k]) || '땅만'})`}, 지금 통행료 ${bmW(BME.rent(g, k))}` : '';
  if (c.sp) return `<p class="bm-info"><b>${c.n}</b> 땅값 ${bmW(c.p)} · 통행료 ${bmW(c.r[0])} · 건물 없음${own}</p>`;
  return `<p class="bm-info"><b>${c.n}</b> 땅값 ${bmW(c.p)} · 건설비 별장 ${bmW(c.c[0])}/빌딩 ${bmW(c.c[1])}/호텔 ${bmW(c.c[2])} · 통행료 대지 ${bmW(c.r[0])}, 별장 1채 +${bmW(c.r[1])}, 2채 +${bmW(c.r[2])}, 빌딩 +${bmW(c.r[3])}, 호텔 +${bmW(c.r[4])}${own}</p>`;
}
// 말의 위치(보드 기준 픽셀). 같은 칸에 여럿이면 옆으로 비켜 선다
function bmTokXY(i, k){
  const b = $('#bmBoard'), el = b && b.querySelector(`[data-bmsq="${k}"]`); if (!el) return [0, 0];
  // 칸 아래쪽 절반에 2×2로 선다 (이름을 가리지 않게)
  const w = el.offsetWidth, h = el.offsetHeight, b3 = bm3D(), sz = Math.min(w, h) * (b3 ? 0.58 : 0.36);
  const xy = (b3 ? [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]] : [[0.3, 0.58], [0.7, 0.58], [0.3, 0.84], [0.7, 0.84]])[i];
  return [el.offsetLeft + w * xy[0] - sz / 2, el.offsetTop + h * xy[1] - sz / 2, sz];
}
function bmPlace(instant){
  const g = bmG(); if (!g) return;
  const pos = BMV.tok || g.pl.map(p => p.pos);
  g.pl.forEach((p, i) => {
    const t = document.querySelector(`#bmOv [data-tok="${i}"]`); if (!t) return;
    const [x, y, sz] = bmTokXY(i, pos[i]);
    if (instant) t.style.transition = 'none';
    t.style.width = t.style.height = sz + 'px'; t.style.setProperty('--S', sz + 'px');
    t.style.transform = `translate(${x}px, ${y}px)`;
    if (instant){ t.offsetWidth; t.style.transition = ''; }
  });
  bmBldPlace();
}
// 입체 판의 건물: 판 위에 진짜 상자로 세운다 (윗면 + 보이는 옆면 두 개. 보는 쪽이 판의 +x·+y 방향이라 나머지 면은 안 보인다)
//   별장: 낮은 집(빨간 지붕), 빌딩: 중간 높이, 호텔: 가장 높고 창문 줄무늬. 벽은 주인 색을 옅게, 지붕은 주인 색
function bmBox(x, y, w, d, h, cls){
  // 면마다 위치·회전을 통째로 준다 (상자 묶음 없이 판 층에 바로): 아이패드 사파리에서 중첩된 입체가 납작해지는 문제를 피한다.
  // 바닥에서 0.6px 띄워 칸 면과 겹치지 않게 한다 (겹치면 사파리가 옆면을 칸 뒤로 그린다)
  const f = n => n.toFixed(1), z0 = 0.6;
  return `<i class="bm-fc fy ${cls}" style="width:${f(w)}px;height:${f(h)}px;transform:translate3d(${f(x)}px,${f(y + d)}px,${z0}px) rotateX(90deg)"></i>`
    + `<i class="bm-fc fx ${cls}" style="width:${f(h)}px;height:${f(d)}px;transform:translate3d(${f(x + w)}px,${f(y)}px,${z0}px) rotateY(-90deg)"></i>`
    + `<i class="bm-fc ft ${cls}" style="width:${f(w)}px;height:${f(d)}px;transform:translate3d(${f(x)}px,${f(y)}px,${f(h + z0)}px)"></i>`;
}
function bmBldPlace(){
  const box = $('#bmBlds'), g = bmG(), V = BMV.lastV; if (!box || !g || !V) return;
  const html = BM_SQ.map((c, k) => {
    const lv = V.lv[k]; if (c.t !== 'city' || c.sp || !(lv > 0)) return '';
    const el = document.querySelector(`#bmBoard [data-bmsq="${k}"]`); if (!el) return '';
    const w = el.offsetWidth, hh = el.offsetHeight, m = Math.min(w, hh), x0 = el.offsetLeft, y0 = el.offsetTop;
    const items = [];
    for (let v = 0; v < bmV(lv); v++) items.push('v');
    if (bmB(lv)) items.push('b');
    if (bmH(lv)) items.push('h');
    const slot = [[0.2, 0.2], [0.56, 0.2], [0.2, 0.56], [0.56, 0.56]];
    const sz = {v:[0.26, 0.24], b:[0.3, 0.55], h:[0.34, 0.9]};
    return `<div class="bm-bset" style="--oc:${V.own[k] >= 0 ? BM.cols[V.own[k]] : '#999'}">${items.map((t, i) => { const [s0, h0] = sz[t], [sx, sy] = slot[i]; return bmBox(x0 + w * sx, y0 + hh * sy, m * s0, m * s0, m * h0, 'k' + t); }).join('')}</div>`;
  }).join('');
  if (box.dataset.h !== html){ box.innerHTML = html; box.dataset.h = html; }
}
// 효과: 떠오르는 글자, 날아가는 동전, 가운데 배너, 칸 튀기기
function bmCenterOf(el){
  const b = $('#bmFx'); if (!b || !el) return [0, 0];
  const r = el.getBoundingClientRect(), br = b.getBoundingClientRect();
  return [r.left - br.left + r.width / 2, r.top - br.top + r.height / 2];
}
function bmFloat(el, text, cls){
  const fx = $('#bmFx'); if (!fx || !el) return;
  const [x, y] = bmCenterOf(el);
  const f = document.createElement('div'); f.className = 'bm-float ' + (cls || ''); f.textContent = text;
  f.style.left = x + 'px'; f.style.top = y + 'px';
  fx.appendChild(f);
  f.animate([{transform:'translate(-50%,-50%) scale(.6)', opacity:0}, {transform:'translate(-50%,-110%) scale(1.15)', opacity:1, offset:.25}, {transform:'translate(-50%,-260%) scale(1)', opacity:0}], {duration:bmMs(1100), easing:'ease-out'}).onfinish = () => f.remove();
}
function bmCoins(fromEl, toEl, n){
  const fx = $('#bmFx'); if (!fx || !fromEl || !toEl) return;
  const [x0, y0] = bmCenterOf(fromEl), [x1, y1] = bmCenterOf(toEl);
  for (let k = 0; k < n; k++){
    const c = document.createElement('div'); c.className = 'bm-coin'; c.textContent = '₩';
    c.style.left = x0 + 'px'; c.style.top = y0 + 'px';
    fx.appendChild(c);
    const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 60, my = Math.min(y0, y1) - 40 - Math.random() * 40;
    c.animate([{transform:'translate(-50%,-50%) scale(.4)', opacity:0}, {transform:`translate(calc(-50% + ${mx - x0}px), calc(-50% + ${my - y0}px)) scale(1.1)`, opacity:1, offset:.45},
               {transform:`translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(.7)`, opacity:.9}],
      {duration:bmMs(750), delay:bmMs(70 * k), easing:'cubic-bezier(.3,.7,.4,1)', fill:'backwards'}).onfinish = () => c.remove();
  }
}
function bmBanner(text, cls, ms = 900){
  const fx = $('#bmFx'); if (!fx) return;
  const b = document.createElement('div'); b.className = 'bm-banner ' + (cls || ''); b.textContent = text;
  fx.appendChild(b);
  b.animate([{transform:'translate(-50%,-50%) scale(.3) rotate(-6deg)', opacity:0}, {transform:'translate(-50%,-50%) scale(1.12) rotate(2deg)', opacity:1, offset:.18},
             {transform:'translate(-50%,-50%) scale(1)', opacity:1, offset:.3}, {transform:'translate(-50%,-50%) scale(1)', opacity:1, offset:.8}, {transform:'translate(-50%,-62%) scale(.96)', opacity:0}],
    {duration:bmMs(ms), easing:'ease-out'}).onfinish = () => b.remove();
}
function bmPop(k, cls){
  const el = document.querySelector(`#bmOv [data-bmsq="${k}"]`); if (!el) return;
  el.classList.remove('pop', 'shine'); el.offsetWidth; el.classList.add(cls || 'pop');
}
function bmShake(){ const b = $('#bmStage') || $('#bmBoard'); if (!b) return; b.classList.remove('shake'); b.offsetWidth; b.classList.add('shake'); }
function bmConfetti(){
  const fx = $('#bmFx'); if (!fx) return;
  const cols = ['#E2B45E', '#4C9AFF', '#FF6B6B', '#36C38A', '#C58CFF'];
  for (let k = 0; k < 60; k++){
    const c = document.createElement('i'); c.className = 'bm-conf'; c.style.background = cols[k % cols.length];
    c.style.left = (10 + Math.random() * 80) + '%'; fx.appendChild(c);
    const dx = (Math.random() - 0.5) * 160, rot = Math.random() * 720;
    c.animate([{transform:'translate(0,-20px) rotate(0)', opacity:1}, {transform:`translate(${dx}px, ${300 + Math.random() * 200}px) rotate(${rot}deg)`, opacity:0}],
      {duration:1400 + Math.random() * 900, delay:Math.random() * 300, easing:'cubic-bezier(.2,.6,.4,1)'}).onfinish = () => c.remove();
  }
}
// 주사위 굴리기: 몇 바퀴 구른 뒤 나온 눈으로 멈춘다
async function bmRollDice(a, b){
  const cubes = $$('#bmDice .bm-cube'), box = $('#bmDice');
  box.classList.add('rolling');
  cubes.forEach((c, k) => {
    const v = k ? b : a, spin = `rotateX(${720 + 360 * Math.floor(Math.random() * 2)}deg) rotateY(${720 + 360 * Math.floor(Math.random() * 2)}deg) `;
    c.style.transition = 'none';
    c.style.transform = `rotateX(${Math.random() * 360}deg) rotateY(${Math.random() * 360}deg)`;
    c.offsetWidth;
    c.style.transition = `transform ${bmMs(780)}ms cubic-bezier(.2,.75,.25,1)`;
    c.style.transform = spin + BM_FACE[v];
  });
  await bmWait(800);
  box.classList.remove('rolling');
  box.classList.toggle('dbl', a === b);
}
const bmPlEl = i => document.querySelector(`#bmOv [data-pl="${i}"]`);
const bmTokEl = i => document.querySelector(`#bmOv [data-tok="${i}"]`);
async function bmHopTo(i, k, big){
  BMV.tok[i] = k;
  const t = bmTokEl(i); if (!t) return;
  const inner = t.querySelector('.bm-tok-i');
  inner.classList.remove('hop', 'fly'); inner.offsetWidth; inner.classList.add(big ? 'fly' : 'hop');
  t.style.transition = `transform ${bmMs(big ? 620 : 150)}ms ${big ? 'cubic-bezier(.45,0,.3,1)' : 'ease-out'}`;
  bmPlace(false);
  await bmWait(big ? 680 : 165);
}
// 이벤트를 차례로 재생한다. 게임 상태는 이미 저장돼 있고, 화면 상태(BMV.view)만 이벤트를 따라 바뀐다
async function bmPlay(ev, v0, done){
  const g = bmG(); if (!g) return;
  BMV.busy = true; BMV.tok = g.pl.map(p => p.pos); BMV.view = v0; BMV.actor = v0.turn;
  BMV.tok = (v0.pos || BMV.tok).slice();
  bmUpdate();
  try {
    for (const e of ev){
      if (e.t === 'dice'){
        BMV.msg = `${g.pl[e.i].nm} 굴리는 중…`; bmUpdate();
        BMAU.dice(); await bmRollDice(e.a, e.b);
        BMV.msg = `${g.pl[e.i].nm}: ${e.a} + ${e.b} = ${e.a + e.b}`; bmUpdate();
        if (e.a === e.b) bmBanner('같은 눈! 🎲', 'gold', 750);
        await bmWait(e.a === e.b ? 450 : 200);
      } else if (e.t === 'move'){
        if (e.jump){ BMAU.fly(); await bmHopTo(e.i, e.path[0], true); continue; }
        for (const k of e.path){ BMAU.hop(); await bmHopTo(e.i, k, false); }
        await bmWait(90);
      } else if (e.t === 'card'){
        BMAU.card(); await bmCard(e.s);
      } else if (e.t === 'snap'){
        const old = BMV.view; BMV.view = e.v;
        // 돈이 움직인 사람: 떠오르는 숫자, 준 사람 → 받은 사람 동전
        const dl = e.v.cash.map((c, i) => c - old.cash[i]);
        dl.forEach((d, i) => { if (d) bmFloat(bmPlEl(i), `${d > 0 ? '+' : '−'}${bmW(Math.abs(d))}`, d > 0 ? 'up' : 'dn'); });
        const giver = dl.findIndex(d => d < 0), taker = dl.findIndex(d => d > 0);
        if (giver >= 0 && taker >= 0) bmCoins(bmTokEl(giver), bmTokEl(taker), Math.min(8, 3 + Math.round(-dl[giver] / 15)));
        else if (giver >= 0 && e.v.fund > old.fund) bmCoins(bmTokEl(giver), document.querySelector('#bmOv [data-bmsq="20"]'), 4);
        else if (taker >= 0 && e.v.fund < old.fund) bmCoins(document.querySelector('#bmOv [data-bmsq="20"]'), bmTokEl(taker), 6);
        // 새 땅·건물
        e.v.own.forEach((o, k) => { if (o >= 0 && old.own[k] !== o) bmPop(k, 'pop'); if (e.v.lv[k] > old.lv[k]) bmPop(k, 'shine'); });
        bmUpdate();
        if (dl.some(d => d)) await bmWait(260);
      } else if (e.t === 'msg'){
        BMV.msg = e.s; bmUpdate();
        const me = e.i === bmMe(), k = e.k;
        if (k === 'buy'){ BMAU.buy(); bmBanner(`🚩 ${e.s}`, me ? 'gold' : '', 800); await bmWait(500); }
        else if (k === 'build'){ BMAU.build(); bmBanner(`${BM_BI[e.v] || '🏗️'} ${e.s}`, me ? 'gold' : '', 850); await bmWait(550); }
        else if (k === 'coupon'){ bmBanner('🎟️ 우대권 사용', me ? 'green' : '', 800); await bmWait(450); }
        else if (k === 'rent'){ BMAU.rent(e.v >= 40); bmBanner(`💸 ${e.s}`, e.to === bmMe() ? 'green' : me ? 'red' : '', 900); if (e.v >= 40) bmShake(); await bmWait(520); }
        else if (k === 'tax'){ BMAU.coins(4); bmBanner(`💸 ${e.s}`, '', 750); await bmWait(420); }
        else if (k === 'fund'){ BMAU.coins(7); bmBanner(`💰 ${e.s}`, me ? 'green' : '', 900); await bmWait(500); }
        else if (k === 'salary'){ BMAU.salary(); bmFloat(bmTokEl(e.i), `+${bmW(BM.salary)}`, 'up'); await bmWait(120); }
        else if (k === 'jail'){ BMAU.jail(); bmBanner('🏝️ 무인도!', me ? 'red' : '', 900); await bmWait(550); }
        else if (k === 'stuck'){ bmBanner('🏝️ 탈출 실패', '', 700); await bmWait(400); }
        else if (k === 'escape'){ bmBanner('🚤 무인도 탈출!', me ? 'green' : '', 800); await bmWait(450); }
        else if (k === 'fly'){ bmBanner(`🚀 ${e.s}`, '', 800); await bmWait(450); }
        else if (k === 'bankrupt'){ BMAU.bankrupt(); bmBanner(`💥 ${e.s}`, 'red', 1200); bmShake(); await bmWait(800); }
        else if (k === 'sell' || (k === 'sold' && e.sq === undefined)){ bmBanner(`🏚️ ${e.s}`, me ? 'red' : '', 1400); await bmWait(800); }   // 무엇이 팔렸는지 보이게
        else if (k === 'short'){ bmBanner('💸 돈이 모자랍니다!', 'red', 1000); bmShake(); await bmWait(600); }
        else if (k === 'sold'){ await bmWait(300); }
        else if (k === 'nobuy'){ bmBanner(`🚫 ${e.s}`, '', 1400); await bmWait(800); }
        else await bmWait(500);
      }
    }
  } catch(err){ if (err !== 'stop') console.error(err); BMV.busy = false; BMV.tok = null; BMV.view = null; return; }
  BMV.busy = false; BMV.tok = null; BMV.view = null;
  bmUpdate();
  if (g.over){
    const ME = bmMe(), rank = g.rank ? g.rank[ME] : BME.ranking(g).indexOf(ME) + 1;
    if (ME < 0){ const w = g.rank ? g.rank.indexOf(1) : BME.ranking(g)[0]; bmBanner(`🏆 ${g.pl[w] ? g.pl[w].nm : '?'} 1위`, 'gold', 1600); done && done(); return; }   // 관전
    bmBanner(rank === 1 ? '🏆 1위!' : g.pl[ME].out ? '💥 파산' : `${rank}위`, rank === 1 ? 'gold' : '', 1600);
    if (rank === 1){ bmConfetti(); BMAU.win(); } else if (g.pl[ME].out) BMAU.bankrupt();
  } else if (v0.turn !== undefined && g.turn !== v0.turn && (g.turn !== bmMe() || !BMAU.turn())) bmBanner(g.turn === bmMe() ? '내 차례!' : `${g.pl[g.turn].nm} 차례`, 'small ' + (g.turn === bmMe() ? 'gold' : ''), 750);
  done && done();
}
// 황금열쇠 카드: 뒤집어서 보여 준다
async function bmCard(text){
  const fx = $('#bmFx'); if (!fx) return;
  const c = document.createElement('div'); c.className = 'bm-card';
  c.innerHTML = `<div class="bm-card-i"><div class="bm-card-b">🔑<small>황금열쇠</small></div><div class="bm-card-f"><small>황금열쇠</small><b>${esc(text)}</b></div></div>`;
  fx.appendChild(c);
  const inner = c.firstElementChild;
  c.animate([{transform:'translate(-50%,-50%) scale(.2)', opacity:0}, {transform:'translate(-50%,-50%) scale(1)', opacity:1}], {duration:bmMs(260), easing:'ease-out', fill:'forwards'});
  await bmWait(300);
  inner.style.transition = `transform ${bmMs(450)}ms ease-in-out`; inner.style.transform = 'rotateY(180deg)';
  try { await bmWait(1300); }
  finally { c.animate([{opacity:1}, {opacity:0, transform:'translate(-50%,-50%) scale(.85)'}], {duration:bmMs(200), fill:'forwards'}).onfinish = () => c.remove(); }
  await bmWait(150);
}
// 한 단계 진행: 컴퓨터 차례면 자동으로 굴린다
function bmTick(){
  const g = bmG(); if (!g || !bmOpenNow() || BMV.busy) return;
  bmUpdate();
  if (BMV.mp) return;   // 같이 하기: 컴퓨터가 없고, 진행은 심판이 한다
  if (g.over || g.pl[g.turn].me || (g.pending && g.pending.k === 'sell')) return;   // 팔 것 고르기는 남의 차례에도 사람이 해야 한다
  const gen = BMV.gen;
  BMV.busy = true; bmUpdate();
  setTimeout(() => {
    if (gen !== BMV.gen) return;
    const g2 = bmG(); if (!g2 || !bmOpenNow()){ BMV.busy = false; return; }
    const v0 = {...BME.view(g2), pos:g2.pl.map(p => p.pos), turn:g2.turn};
    const ev = BME.roll(g2, Math.random);
    save();
    bmPlay(ev, v0, () => setTimeout(() => { if (gen === BMV.gen) bmTick(); }, bmMs(350)));
  }, bmMs(500));
}
function bmAct(fn){
  const g = bmG(); if (!g || BMV.busy) return;
  const v0 = {...BME.view(g), pos:g.pl.map(p => p.pos), turn:g.turn}, gen = BMV.gen;
  const ev = fn(g);
  BMV.sel = -1;
  save();
  bmPlay(ev, v0, () => setTimeout(() => { if (gen === BMV.gen) bmTick(); }, bmMs(250)));
}
// 기권 = 지금 그 자리에서 파산한 것으로 본다: 아직 남은 컴퓨터 수 + 1위.
// (계속해도 최악은 지금 파산하는 것이라, 기권을 그보다 나쁘게 매기면 안 된다)
function bmQuitRank(g){ return 1 + g.pl.filter((p, i) => i !== 0 && !p.out).length; }
/* 끝난 판의 전체 기록을 서버 표(seed10k_bmlog)에 남긴다. 실패하면 저장에 쌓아 두고(최대 2판) 다음 판이 끝날 때 다시 보낸다 */
async function bmSaveLog(row){
  const b = S.bm; b.unsent = (b.unsent || []).concat([row]).slice(-2);
  if (!ACC.sb || !ACC.user) return;
  const send = b.unsent.slice();
  try {
    const {error} = await ACC.sb.from('seed10k_bmlog').insert(send.map(x => ({user_id:ACC.user.id, ...x})));
    if (error) throw error;
    if (S.bm === b){ b.unsent = (b.unsent || []).filter(x => !send.includes(x)); save(); }
  } catch(e){ console.warn('[seed10k] 부루마블 기록을 서버에 남기지 못함', e); }
}
function bmLastLog(){
  const L = (S.bm || {}).last; if (!L) return;
  const m = showModal(`<h2>지난 판 기록</h2><p class="muted" style="margin:0 0 6px">${new Date(L.at).toLocaleString('ko-KR')} · ${L.forfeit ? '기권 · ' : ''}${L.rank}위 (${L.n}명 중) · ${L.log.length.toLocaleString()}줄</p>
    <div class="info-body bm-rec">${L.log.map(x => `<div>${esc(x)}</div>`).join('')}</div><div class="acts"><button class="btn solid" data-close>닫기</button></div>`);
  $('#modal').dataset.kind = 'info';
  const bx = $('#modal .bm-rec'); if (bx) bx.scrollTop = bx.scrollHeight;
}
function bmFinish(forfeit, run){
  const b = bmToday(), g = b.cur; if (!g) return;
  let rank;
  if (forfeit) rank = bmQuitRank(g);
  else { const r = BME.ranking(g); rank = r.indexOf(0) + 1; }
  const mult0 = BM.pay[g.n][rank - 1] || 0, ran = !!run && !forfeit && mult0 < 1;   // 판돈보다 적게 받는 순위면 도망칠 수 있다
  const loss = Math.round(g.stake * (1 - mult0) * 100) / 100;
  const mult = ran ? 1 : mult0, pay = Math.round(g.stake * mult * 100) / 100;      // 도망치면 판돈을 그대로 돌려받는다
  if (pay > 0) receiveUSD(pay);
  b.hist.unshift({at:Date.now(), stake:g.stake, pay, rank, n:g.n, ...(forfeit ? {ff:1} : {})});
  b.hist = b.hist.slice(0, 10);
  const r = forfeit ? null : BME.ranking(g);
  const fin = BME.ranking(g).map(i => ({nm:g.pl[i].nm, out:g.pl[i].out, outAt:g.pl[i].outAt || 0, cash:g.pl[i].cash, assets:g.pl[i].out ? 0 : BME.assets(g, i)}));
  BME.rec(g, `끝: ${forfeit ? '기권, ' : ''}나 ${rank}위 (${g.n}명 중), ${mult}배 ${pay}달러 받음 · 최종 ${fin.map((x, k) => `${k + 1}.${x.nm}${x.out ? `(파산 ${x.outAt}번째)` : `(자산 ${bmW(x.assets)})`}`).join(' ')}`);
  bmSaveLog({at:new Date().toISOString(), mode:S.mode, n:g.n, stake:g.stake, pay, rank, forfeit:!!forfeit, il:!!g.il, rounds:g.round || 0, standings:fin, log:g.rec || []});
  b.last = {at:Date.now(), rank, n:g.n, forfeit:!!forfeit, log:(g.rec || []).slice(-3000)};   // 지난 판 기록 보기용 (이 기기·내 저장에 1판만)
  b.cur = null;
  altLog('gamble', `부루마블 ${forfeit ? `기권 (${rank}위)` : rank + '위'}${ran ? ' → 도망' : ''}${g.il ? ' (불법)' : ''}`, pay - g.stake, 'USD');
  commit();
  bmHide();
  police('bm', g.il, pay - g.stake);
  runCheck(); if (ran) runAdd('bm', loss);
  const rows = r ? r.map((i, k) => `<div><span>${k + 1}위 ${g.pl[i].nm}</span><b class="num">${g.pl[i].out ? '파산' : '자산 ' + bmW(BME.assets(g, i))}</b></div>`).join('') : '';
  showModal(`<h2 class="${pay > g.stake ? 'up' : ''}">${forfeit ? `기권 · ${rank}위 (${g.n}명 중)` : ran ? `🏃 ${rank}위에서 도망쳤습니다` : `${rank}위 (${g.n}명 중)`}</h2>${ran ? runNote(loss) : ''}
    ${rows ? `<div class="bd" style="margin-bottom:10px">${rows}</div>` : ''}
    <div class="bd"><div><span>판돈</span><b class="num">${fmtUSD(g.stake)}</b></div><div><span>돌려받은 돈 (${mult}배)</span><b class="num">${fmtUSD(pay)}</b></div>
    <div class="tot"><span>손익</span><b class="num ${cls(pay - g.stake)}">${signUSD(pay - g.stake)}</b></div></div>
    <div class="acts"><button class="btn solid" data-close>확인</button></div>`);
}
document.addEventListener('click', e => {
  if (e.target.closest('#bmLastLog')){ bmLastLog(); return; }
  const t = e.target.closest('#bmOv button, #bmGo'); if (!t) return;
  if (t.id === 'bmGo'){ bmSetup(); return; }
  const g = bmG(); if (!g) return;
  if (t.id === 'bmClose'){ const spec = BMV.mp && bmMe() < 0; bmHide(); if (spec && typeof mpForget === 'function'){ BMV.mp = false; mpForget(); } return; }   // 관전은 닫으면 끝
  if (BMV.mp && t.id === 'bmQuit'){ mbmQuit(); return; }
  if (t.id === 'bmSnd' || t.closest && t.closest('#bmSnd')){ bsaToggle(); return; }
  if (t.id === 'bmSpd'){ SET.bmFast = !SET.bmFast; saveSet(); bmUpdate(); return; }
  if (t.id === 'bm3d'){
    if (BMV.busy) return toast('움직이는 중에는 바꿀 수 없습니다. 잠시 뒤에 누르세요', true);
    SET.bm3d = !bm3D(); saveSet(); BMV.built = false; bmBuild(); bmUpdate(); return;
  }
  if (t.id === 'bmQuit'){
    const qr = bmQuitRank(g), qm = BM.pay[g.n][qr - 1] || 0;
    const c = showModal(`<h2>기권할까요?</h2><p>지금 파산한 것으로 보고 <b>${qr}위 (${g.n}명 중)</b>로 끝납니다. ${qm ? `판돈의 ${qm}배인 ${fmtUSD(Math.round(g.stake * qm * 100) / 100)}을 돌려받습니다.` : `판돈 ${fmtUSD(g.stake)}을 잃습니다.`}</p><div class="acts"><button class="btn" data-close>계속하기</button><button class="btn solid" id="bmQuitYes">기권</button></div>`);
    $('#bmQuitYes').onclick = () => { c(); setTimeout(() => bmFinish(true), 200); };
    return;
  }
  if (t.id === 'bmEnd'){ bmFinish(false); return; }
  if (t.id === 'bmRun' && !BMV.mp){ bmFinish(false, true); return; }
  // 팔 것 고르기 (남의 차례에 생길 수도 있다)
  if (!BMV.busy && g.pending && g.pending.k === 'sell'){
    const k = t.dataset.bmsell !== undefined ? t.dataset.bmsell : t.dataset.bmsq !== undefined && g.own[+t.dataset.bmsq] === bmMe() ? t.dataset.bmsq : null;
    if (k !== null && g.pending.who === bmMe()){ if (BMV.mp) return mbmSend({op:'sell', arg:k === 'auto' ? 'auto' : +k}); bmAct(g2 => BME.sell(g2, k === 'auto' ? 'auto' : +k)); return; }
  }
  if (BMV.busy || g.turn !== bmMe() || g.over) { if (t.dataset.bmsq){ BMV.sel = +t.dataset.bmsq; bmRender(); } return; }
  const pk = g.pending && g.pending.k;
  if (t.id === 'bmRoll'){ if (BMV.mp) return mbmSend({op:'roll'}); bmAct(g2 => BME.roll(g2, Math.random)); return; }
  if (t.dataset.bmyes !== undefined){ if (BMV.mp) return mbmSend({op:pk, yes:t.dataset.bmyes === '1'}); bmAct(g2 => BME.decide(g2, t.dataset.bmyes === '1', -1, Math.random)); return; }
  if (t.id === 'bmSpace'){ const to = BMV.sel; if (to >= 0 && to !== 30){ if (BMV.mp) return mbmSend({op:'space', yes:true, arg:to}); bmAct(g2 => BME.decide(g2, true, to, Math.random)); } return; }
  if (t.dataset.bmbuild){ const kd = t.dataset.bmbuild; if (BMV.mp) return mbmSend({op:'build', yes:true, arg:kd}); bmAct(g2 => BME.decide(g2, true, kd, Math.random)); return; }
  if (t.dataset.bmsq){ const k = +t.dataset.bmsq; BMV.sel = BMV.sel === k && !(g.pending && g.pending.k === 'space') ? -1 : k; bmRender(); return; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && bmOpenNow() && $('#modal').hidden) bmHide(); });
