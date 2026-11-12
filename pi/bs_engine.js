// 자동 생성: 사이트 src/bs.js의 규칙 부분 (build.py가 만든다. 직접 고치지 말 것)
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
    const s = BSE.take(g), dmg = s ? (g.saw ? 2 : 1) : 0, ev = [];
    g.saw = false; g.shots++;
    if (dmg){ q.hp = Math.max(0, q.hp - dmg); if (!q.hp){ q.out = true; q.outAt = ++g.outs; q.cuffed = false; } }
    ev.push({t:'shot', i, target, live:s, dmg, hp:q.hp, out:q.out});
    BSE.log(g, `${g.pl[i].nm} → ${target === i ? '자기 자신' : q.nm}: ${s ? `💥 실탄${dmg > 1 ? ' (톱, 2배)' : ''}` : '딸깍, 공포탄'}${q.out ? ` · ${q.nm} 탈락` : ''}`);
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
export { BS, BS_IT, BS_KEYS, BSE };
