// 자동 생성: 사이트 src/bm.js의 규칙 부분 (build.py가 만든다. 직접 고치지 말 것)
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

export { BM, BM_SQ, BM_N, BM_IDX, BM_CARDS, BME, bmW, bmV, bmB, bmH, bmLv };
