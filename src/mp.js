/* ───────── 멀티플레이 (방 코드로 같이 하기) ─────────
   빠른 길: 라즈베리파이 심판에 웹소켓으로 바로 붙어 요청을 보내고 방 상태를 받는다 (주소는 Supabase '__ref' 줄의 state.ws).
   느린 길(웹소켓이 안 될 때): Supabase에 요청(seed10k_room_reqs)을 넣고, 심판이 처리해 방(seed10k_rooms)을 고친다.
   방이 바뀌면 Supabase 실시간이 알려 주고(놓칠 때를 위해 3초마다도 확인), 끝나면 받을 돈(seed10k_payouts)을 '받기'로 가져온다.
   판돈은 판이 시작할 때 서버가 '판돈 냄' 줄(음수)로 가져가고, 이긴 돈은 받기로 들어온다 (예전 방식 자리는 들어갈 때 이 기기에서 냈다) */
const MP_GAMES = {bm:{nm:'부루마블', ic:'🎲', ready:true, desc:'2~4명 · 파산할 때까지, 순위 배수'},   // 도박 탭의 혼자 하기 카드와 같은 순서
                  bs:{nm:'벅샷 룰렛', ic:'💥', ready:true, desc:'2~4명 · 마지막까지 살아남은 사람이 판돈을 모두'},
                  oe:{nm:'홀짝 대결', ic:'✊', ready:true, desc:'2명 · 번갈아 구슬을 쥐고 맞히기, 3점 먼저'},
                  bj:{nm:'블랙잭 대결', ic:'🃏', ready:true, desc:'2~5명 · 딜러 없이, 21에 가장 가까운 사람이 판돈을 모두'},
                  sl:{nm:'뱀사다리', ic:'🐍', ready:false, hide:true, desc:'없어진 게임 (이미 만든 방만 끝까지 할 수 있음)'}};
const MP_MIN = {oe:2, sl:2, bj:1, bm:2};
const MP = {code:null, room:null, ch:null, poll:null, ref:null, refAt:0, busy:false, lastSeq:0, view:{}, payCh:null};
const mpKey = () => ACC.user ? `seed10k.mp.${ACC.user.id}` : null;
const mpMe = () => MP.room && ACC.user ? MP.room.state.seats.findIndex(s => s.uid === ACC.user.id) : -1;
const mpNick = () => (ACC.user && ((ACC.user.user_metadata || {}).nickname || (acctList().find(a => a.id === ACC.user.id) || {}).nick)) || (ACC.user ? ACC.user.email.split('@')[0] : '플레이어');

// 심판(라즈베리파이)이 켜져 있는지: '__ref' 줄의 시각이 30초 안인가
async function mpRefAlive(force){
  if (!ACC.sb) return false;
  if (!force && Date.now() - MP.refAt < 15000) return MP.ref;
  try { const {data} = await ACC.sb.from('seed10k_rooms').select('state').eq('code', '__ref').maybeSingle(); MP.ref = !!(data && data.state && Date.now() - data.state.at < 30000); MP.wsUrl = MP.ref && /^wss?:\/\//.test(data.state.ws || '') ? data.state.ws : ''; }
  catch(e){ MP.ref = false; }
  MP.refAt = Date.now(); return MP.ref;
}
/* ── 웹소켓 (빠른 길) ── */
const MPW = {ws:null, url:'', ok:false, wait:null, seq:0, pend:new Map(), ping:null, fail:0, failAt:0};
function mpWsClose(){
  clearInterval(MPW.ping); MPW.ok = false;
  if (MPW.ws){ try { MPW.ws.onclose = null; MPW.ws.close(); } catch(e){} }
  MPW.ws = null; MPW.wait = null;
  MPW.pend.forEach(f => f({ok:false, err:'게임 서버 연결이 끊겼습니다', timeout:true})); MPW.pend.clear();
}
// 연결하고 로그인 확인까지 (최대 5초). 안 되면 false → 느린 길로
async function mpWs(){
  if (!ACC.user || !ACC.sb || typeof WebSocket === 'undefined') return false;
  if (!MP.wsUrl && !(await mpRefAlive(), MP.wsUrl)) return false;
  if (MPW.uid !== ACC.user.id){ mpWsClose(); MPW.uid = ACC.user.id; MPW.fail = 0; }   // 계정을 바꾸면 새로 로그인 확인
  // 살아 있는지: 10초마다 핑을 보내고 무엇이든 답이 오면 시각을 적는다. 25초 넘게 아무 답이 없으면 죽은 연결로 보고 새로 붙는다
  // (터널이 끊겨도 브라우저가 한참 동안 '열림'으로 알고 있어, 그 사이 보낸 요청이 '응답하지 않습니다'로 끝나던 문제)
  if (MPW.ok && MPW.ws && MPW.ws.readyState === 1 && MPW.url === MP.wsUrl && Date.now() - (MPW.seenAt || 0) > 25000) mpWsClose();
  if (MPW.ok && MPW.ws && MPW.ws.readyState === 1 && MPW.url === MP.wsUrl) return true;
  if (MPW.fail >= 3 && Date.now() - MPW.failAt < 60000) return false;   // 연달아 실패하면 1분 동안은 느린 길만
  if (MPW.wait && MPW.url === MP.wsUrl) return MPW.wait;
  mpWsClose();
  const url = MPW.url = MP.wsUrl;
  MPW.wait = new Promise(done => {
    let fin = false; const end = v => { if (fin) return; fin = true; clearTimeout(to); if (!v){ MPW.fail++; MPW.failAt = Date.now(); MP.refAt = 0; mpWsClose(); } else MPW.fail = 0; done(v); };
    const to = setTimeout(() => end(false), 5000);
    let ws; try { ws = MPW.ws = new WebSocket(url); } catch(e){ return end(false); }
    ws.onopen = async () => {
      let tok = null; try { tok = (await ACC.sb.auth.getSession()).data.session.access_token; } catch(e){}
      if (!tok) return end(false);
      ws.send(JSON.stringify({t:'auth', token:tok}));
    };
    ws.onmessage = e => {
      MPW.seenAt = Date.now();
      let m; try { m = JSON.parse(e.data); } catch(x){ return; }
      if (m.t === 'auth'){
        if (!m.ok) return end(false);
        MPW.ok = true; end(true);
        clearInterval(MPW.ping); MPW.ping = setInterval(() => { try { ws.readyState === 1 && ws.send('{"t":"ping"}'); } catch(x){} }, 10000);
        if (MP.code) ws.send(JSON.stringify({t:'sub', code:MP.code}));
      } else if (m.t === 'res'){ const f = MPW.pend.get(m.id); if (f){ MPW.pend.delete(m.id); f({ok:!!m.ok, err:m.err, res:m.res || {}}); } }
      else if (m.t === 'room' && m.row && m.row.code === MP.code) mpSet(m.row);
      else if (m.t === 'chat' && m.code === MP.code) mpChatGot(m);
    };
    ws.onclose = ws.onerror = () => { if (MPW.ws !== ws) return; const was = MPW.ok; end(false); if (was && MP.code) setTimeout(() => mpWs(), 1000); };
  });
  return MPW.wait;
}
function mpWsSub(code){ if (MPW.ok && MPW.ws && MPW.ws.readyState === 1) try { MPW.ws.send(JSON.stringify({t:'sub', code})); } catch(e){} else mpWs(); }
// 요청: 웹소켓이 되면 바로 보내고 답을 기다린다 (최대 15초). 안 되면 Supabase 표로
async function mpReq(code, kind, arg = {}){
  if (await mpWs()){
    const id = ++MPW.seq;
    const r = await new Promise(res => {
      MPW.pend.set(id, res);
      setTimeout(() => { if (MPW.pend.delete(id)){ mpWsClose(); MP.refAt = 0; res({ok:false, err:'게임 서버가 응답하지 않습니다', timeout:true}); } }, 15000);   // 답이 없는 연결은 끊고 다음에 새로 붙는다
      try { MPW.ws.send(JSON.stringify({t:'req', id, code, kind, arg})); } catch(e){ MPW.pend.delete(id); res({ok:false, err:'게임 서버에 보내지 못했습니다', timeout:true}); }
    });
    return r;
  }
  return mpReqDb(code, kind, arg);
}
// 느린 길: 요청을 넣고 심판이 처리할 때까지 기다린다 (최대 60초)
async function mpReqDb(code, kind, arg = {}){
  const {data, error} = await ACC.sb.from('seed10k_room_reqs').insert({user_id:ACC.user.id, code, kind, arg}).select('id').single();
  if (error) return {ok:false, err:errText(error)};
  const t0 = Date.now();
  while (Date.now() - t0 < 60000){
    await new Promise(r => setTimeout(r, Date.now() - t0 < 3000 ? 300 : 1000));
    const {data:r} = await ACC.sb.from('seed10k_room_reqs').select('done,ok,err,res').eq('id', data.id).maybeSingle();
    if (r && r.done) return {ok:!!r.ok, err:r.err, res:r.res || {}};
    if (Date.now() - t0 > 8000 && !MP.slowWarned){ MP.slowWarned = true; toast('게임 서버(라즈베리파이) 응답이 늦습니다. 조금 더 기다립니다'); }
  }
  return {ok:false, err:'게임 서버가 응답하지 않습니다', timeout:true};
}
const mpCode = () => Array.from({length:6}, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

/* ── 도박 탭 카드 ── */
function mpCardHTML(){
  INFO.mp = {t:'같이 하기 (멀티플레이)', h:`<div class="prose"><ul>
    <li>방장이 게임과 판돈을 정해 방을 만들면 6자리 코드가 나옵니다. 친구는 "코드로 참가"에 그 코드를 넣습니다.</li>
    <li>판돈은 판이 <b>시작할 때</b> 달러 통장에서 빠집니다. 대기실에 있는 동안에는 빠지지 않아서, 나가거나 방이 닫혀도 잃는 돈이 없습니다.</li>
    <li>주사위·카드·숨긴 값은 게임 서버(라즈베리파이)가 정하고 판정해서, 누구도 결과를 조작할 수 없습니다.</li>
    <li>끝나면 이긴 돈이 자동으로 들어옵니다. 불법 모드 방이면 받을 때 혼자 할 때와 같은 확률로 경찰 단속이 있습니다.</li>
    <li>👀 관전: 진행 중인 방을 골라 구경할 수 있습니다 (돈이 들지 않고, 숨긴 값은 관전자에게도 보이지 않습니다). 코드로 참가에서 이미 시작한 방 코드를 넣어도 관전할 수 있습니다.</li>
    <li>같은 모드(실제 시세/시뮬레이션)끼리만 같이 할 수 있습니다. 차례에서 정해진 시간 안에 고르지 않으면 서버가 대신 고릅니다.</li></ul></div>`};
  if (!ACC.user) return `<div class="card-h"><h2>👥 같이 하기</h2></div><p class="mg-desc">로그인하면 방 코드로 친구와 같이 할 수 있습니다.</p>`;
  if (MP.banned) return `<div class="card-h"><h2>👥 같이 하기 ${infoBtn('mp')}</h2></div><p class="mg-desc down"><b>🚫 부계정을 이용한 부정행위가 적발되어 이 계정은 멀티플레이가 제한되었습니다.</b></p>`;
  if (ACC.tester) return `<div class="card-h"><h2>👥 같이 하기 ${infoBtn('mp')}</h2></div><p class="mg-desc"><b>🧪 테스트 계정은 멀티플레이를 할 수 없습니다</b></p>`;
  const saved = (() => { try { return localStorage.getItem(mpKey()); } catch(e){ return null; } })();
  return `<div class="card-h"><h2>👥 같이 하기 ${infoBtn('mp')}</h2><small id="mpRef">${MP.ref === false ? '<span class="down">게임 서버 꺼짐</span>' : MP.ref ? '게임 서버 켜짐' : ''}</small></div>
    <p class="mg-desc">방을 만들고 코드를 알려 주면 친구가 들어옵니다. ${Object.values(MP_GAMES).filter(g => g.ready).map(g => g.ic + g.nm).join(' · ')}</p>
    ${saved ? `<p class="mg-desc">들어가 있는 방 <b class="num">${esc(saved)}</b> <button class="btn" id="mpResume" style="margin-left:6px">이어가기</button></p>` : ''}
    <div class="mg-foot"><button class="btn" id="onlBtn">🟢 접속 중 <span class="num" id="onlN">${ONL.list.length}</span>명</button><span class="mg-btns"><button class="btn" id="mpWatchBtn">👀 관전</button><button class="btn" id="mpJoinBtn">코드로 참가</button><button class="btn solid" id="mpNewBtn">방 만들기</button></span></div>`;
}


/* ── 방 만들기 / 참가 ── */
// 처음 같이 하기를 쓸 때 한 번 (계정마다)
const MP_WARN = '부계정을 이용한 부정행위 적발시 영구적으로 멀티플레이가 제한될 수 있습니다';
function mpWarned(go){
  const k = 'seed10k.mpwarn.' + (ACC.user ? ACC.user.id : '');
  try { if (localStorage.getItem(k)) return true; } catch(e){}
  const c = showModal(`<h2>⚠️ 같이 하기 전에</h2><p><b>${MP_WARN}.</b></p><p class="muted">부계정으로 일부러 져 주거나 돈을 몰아주는 행동이 적발되면, 그렇게 얻은 돈은 모두 회수되고 멀티플레이를 더 할 수 없습니다.</p>
    <div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="mpWarnOk">확인했습니다</button></div>`);
  $('#mpWarnOk').onclick = () => { try { localStorage.setItem(k, '1'); } catch(e){} c(); setTimeout(go, 200); };
  return false;
}
async function mpBanCheck(){
  MP.banned = false;
  if (!ACC.user || !ACC.sb) return;
  try { const {data} = await ACC.sb.from('seed10k_mp_bans').select('user_id').eq('user_id', ACC.user.id).maybeSingle(); MP.banned = !!data; } catch(e){}
  if (MP.banned && $('#mpCard')) $('#mpCard').innerHTML = mpCardHTML();
}
async function mpNew(to){   // to: 대결을 신청할 사람 {uid, nick} (없으면 코드로 친구를 부른다)
  if (!ACC.user) return toast('로그인해야 합니다', true);
  if (ACC.tester) return toast('테스트 계정은 멀티플레이를 할 수 없습니다', true);
  if (MP.banned) return toast('멀티플레이가 제한된 계정입니다', true);
  if (!mpWarned(() => mpNew(to))) return;
  if (!(await mpRefAlive(true))) return toast('게임 서버(라즈베리파이)가 꺼져 있어 지금은 방을 만들 수 없습니다', true);
  const list = Object.entries(MP_GAMES).filter(([k, g]) => !g.hide);
  const c = showModal(`<h2>👥 ${to ? `${esc(to.nick)}에게 대결 신청` : '방 만들기'}</h2><p class="muted" style="margin:0 0 8px">게임을 고르세요</p>
    <div class="mp-games">${list.map(([k, g]) => `<button class="btn mp-g" data-mpg="${k}" ${g.ready ? '' : 'disabled'}><b>${g.ic} ${g.nm}</b><small>${g.ready ? g.desc : '준비 중'}</small></button>`).join('')}</div>
    <div class="acts"><button class="btn" data-close>닫기</button></div>`);
  $$('#modal [data-mpg]').forEach(b => b.onclick = () => {
    const k = b.dataset.mpg; c();
    // 판돈 정하기 (혼자 할 때와 같은 한도·같은 창). 낸 뒤 방을 만든다
    betDialog(k, `👥 ${MP_GAMES[k].nm} 방`, `<p class="muted" style="margin:0 0 8px">방에 들어오는 사람 모두 같은 판돈을 냅니다. 판돈은 <b>판이 시작할 때</b> 달러 통장에서 빠집니다 (대기실에서는 빠지지 않음). ${gamIl() ? '🚨 불법 모드 방이 됩니다' : ''}</p>`, async bet => {
      if (MP.busy) return; MP.busy = true;   // 연타 방지
      const code = mpCode();
      toast('방을 만드는 중…');
      const r = await mpReq(code, 'create', {game:k, mode:S.mode, stake:bet, il:gamIl(), nick:mpNick(), payAtStart:true}).finally(() => { MP.busy = false; });
      if (!r.ok) return toast(`방을 만들지 못했습니다: ${r.err}`, true);
      mpEnter(code);
      if (to) onlSend(to, code, k, bet);
    }, true);
  });
}
async function mpJoin(pre, auto){   // auto: 대결 신청을 받아 바로 방을 찾는다
  if (!ACC.user) return toast('로그인해야 합니다', true);
  if (ACC.tester) return toast('테스트 계정은 멀티플레이를 할 수 없습니다', true);
  if (MP.banned) return toast('멀티플레이가 제한된 계정입니다', true);
  if (!mpWarned(() => mpJoin(pre))) return;
  const c = showModal(`<h2>👥 코드로 참가</h2><label class="amt"><input id="mpCodeIn" type="text" maxlength="6" autocapitalize="characters" autocomplete="off" placeholder="방 코드 6자리" value="${esc(pre || '')}"></label>
    <p class="muted" id="mpJoinMsg" style="margin:6px 0 0"></p><div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="mpJoinGo">찾기</button></div>`);
  const inp = $('#mpCodeIn'); inp.focus();
  inp.oninput = () => { inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  if (auto) setTimeout(() => $('#mpJoinGo') && $('#mpJoinGo').click(), 0);
  $('#mpJoinGo').onclick = async () => {
    const code = inp.value.trim(), msg = t => { $('#mpJoinMsg').textContent = t; };
    if (code.length !== 6) return msg('6자리 코드를 넣으세요');
    const {data:room} = await ACC.sb.from('seed10k_rooms').select('*').eq('code', code).maybeSingle();
    if (!room || room.status === 'sys') return msg('없는 방 코드입니다');
    if (room.state.seats.some(s => s.uid === ACC.user.id)){ c(); return mpEnter(code); }   // 이미 들어가 있음
    if (room.status === 'closed') return msg('닫힌 방입니다');
    if (room.status !== 'lobby'){ c(); return mpEnter(code, true); }   // 이미 시작한 방은 관전
    if (room.mode !== S.mode) return msg(`이 방은 ${room.mode === 'live' ? '실제 시세' : '시뮬레이션'} 모드 방입니다. 규칙·설정에서 모드를 바꾼 뒤 참가하세요`);
    const g = MP_GAMES[room.game] || {nm:room.game, ic:''};
    $('#modal').innerHTML = `<h2>${g.ic} ${g.nm} · 방 ${code}</h2>
      <p>방장 <b>${esc(room.state.seats[0] ? room.state.seats[0].nick : '')}</b> · ${room.state.seats.length}/${room.state.maxP}명${room.il ? ' · <b class="down">🚨 불법 모드 방</b>' : ''}</p>
      <p>판돈은 <b class="num">${fmtUSD(room.stake)}</b>입니다. <b>판이 시작할 때</b> 달러 통장에서 빠지고, 대기실에서 나가면 아무것도 빠지지 않습니다.</p>
      ${room.il && !gamIl() ? '<p class="down">불법 모드 방이라 들어가면 불법 모드가 켜집니다 (끝날 때 경찰 단속 확률이 있습니다).</p>' : ''}
      <div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="mpPay">참가 (판돈 ${fmtUSD(room.stake)})</button></div>`;
    $('#mpPay').onclick = async () => {
      if (S.usd < room.stake) return toast(`달러 통장에 ${fmtUSD(room.stake)}이 있어야 합니다`, true);
      if (room.il && !gamIl()){ gamS().il = true; commit(); }
      if (MP.busy) return; MP.busy = true; c();   // 연타 방지
      toast('참가하는 중…');
      const r = await mpReq(code, 'join', {mode:S.mode, il:gamIl(), nick:mpNick(), payAtStart:true}).finally(() => { MP.busy = false; });
      if (!r.ok) return toast(`참가하지 못했습니다: ${r.err}`, true);
      mpEnter(code);
    };
  };
}

/* ── 방 화면 ── */
function mpEnter(code, spec){
  MP.spec = !!spec; MP.code = code;
  if (!spec) try { localStorage.setItem(mpKey(), code); } catch(e){}   // 관전은 '이어가기'에 남기지 않는다
  mpSub(code); mpOpen(); mpFetch();
}
const mpSpec = () => !!(MP.spec && MP.room && mpMe() < 0);   // 관전 중 (자리가 없는 채로 방을 보는 중)
function mpSub(code){
  if (MP.ch){ try { ACC.sb.removeChannel(MP.ch); } catch(e){} MP.ch = null; }
  try {
    // 방 채널: 방 상태 변경 + 채팅 방송 + 접속(Presence: 이 방 화면을 보고 있는 사람. 자리에 없는 사람이 관전자)
    MP.watch = [];
    const ch = MP.ch = ACC.sb.channel('room-' + code, {config:{presence:{key:ACC.user ? ACC.user.id : 'anon'}}}).on('postgres_changes', {event:'*', schema:'public', table:'seed10k_rooms', filter:`code=eq.${code}`}, p => { if (p.new && p.new.code === MP.code) mpSet(p.new); })
      .on('broadcast', {event:'chat'}, m => { const p = m && m.payload; if (p && p.code === MP.code) mpChatGot(p); })
      .on('presence', {event:'sync'}, () => { if (MP.ch === ch) mpWatchSync(ch); })
      .subscribe(st => { if (st === 'SUBSCRIBED' && ACC.user) try { ch.track({uid:ACC.user.id, nick:mpNick()}); } catch(e){} });
  } catch(e){}
  mpWsSub(code);
  clearInterval(MP.poll); MP.poll = setInterval(() => { if (!document.hidden && MP.code) mpFetch(); }, 3000);   // 실시간을 놓칠 때를 위해
}
async function mpFetch(){
  if (!MP.code || !ACC.sb) return;
  const {data} = await ACC.sb.from('seed10k_rooms').select('*').eq('code', MP.code).maybeSingle();
  if (data) mpSet(data);
}
function mpSet(room){
  const prev = MP.room;
  if (prev && prev.code === room.code && (room.ver || 0) < (prev.ver || 0)) return;   // 늦게 온 옛 상태는 버린다 (웹소켓과 Supabase 양쪽에서 온다)
  MP.room = room;
  if (mpMe() >= 0) mpPendSeated(room.code);
  // 판이 시작했다 → 3초 뒤 판돈 장부 확인 (시작 번호가 바뀐 것을 처음 본 때 한 번)
  const meS = mpMe() >= 0 ? room.state.seats[mpMe()] : null;
  if (meS && meS.pay === 'start' && room.state.startN && room.status !== 'lobby'){
    const bk = `mp:${room.code}:${room.state.startN}`;
    if (!MP.audited) MP.audited = new Set();
    if (!MP.audited.has(bk)){ MP.audited.add(bk); setTimeout(() => mpBetAudit(room, bk), BET_AUDIT_MS); }
  }
  if (MP.ch && MP.ch.presenceState && (!prev || prev.state.seats.length !== room.state.seats.length)) try { mpWatchSync(MP.ch); } catch(e){}   // 자리가 바뀌면 관전자 목록도
  if (room.status === 'lobby') MP.view.bjV = null;   // 새 판이면 카드를 처음부터 날아오게
  const ev = room.state.ev;
  if (ev && ev.seq > MP.lastSeq){ MP.lastSeq = ev.seq; mpOnEv(ev, prev); }
  if (room.status === 'closed' || (room.status !== 'lobby' && mpMe() < 0 && !(prev && prev.state.seats.some(s => ACC.user && s.uid === ACC.user.id)))) {}
  if (room.game === 'bm') mbmSync(room);
  mpRender();
  if ((room.status === 'over' || room.status === 'closed') && !MP.view.bmHold) mpClaim();   // 부루마블은 움직임을 다 보여 준 뒤에 받는다
}
function mpOnEv(ev, prev){
  if (ev.t === 'bs'){ if (prev && prev.code === MP.room.code && prev.status === 'play'){ (MP.view.bsQ = MP.view.bsQ || []).push(ev); MP.view.bmHold = true; mbsRun(); } return; }
  if (ev.t === 'bm'){ if (prev && prev.code === MP.room.code && prev.status === 'play' && BMV.mp && bmOpenNow()){ (MP.view.bmQ = MP.view.bmQ || []).push(ev); MP.view.bmHold = true; mbmRun(); } return; }
  if (ev.t === 'sl'){ if (prev && prev.code === MP.room.code && prev.status === 'play'){ (MP.view.slQ = MP.view.slQ || []).push(ev); mslRun(); } return; }
  if (ev.t === 'oe_reveal'){ MP.view.oeShow = ev; clearTimeout(MP.view.oeT); MP.view.oeT = setTimeout(() => { MP.view.oeShow = null; mpRender(); }, 2200); }
}
function mpOpen(){
  let ov = $('#mpOv');
  if (!ov){ ov = document.createElement('div'); ov.id = 'mpOv'; ov.className = 'bm-ov gm-ov'; ov.setAttribute('role', 'dialog'); document.body.appendChild(ov); }
  ov.hidden = false; document.documentElement.classList.add('bm-open');
  mpRender();
}
function mpHide(){
  const ov = $('#mpOv'); if (ov && !ov.hidden){ ov.hidden = true; ov.innerHTML = ''; document.documentElement.classList.remove('bm-open'); }
  if (UI.tab === 'market') renderInvest();
}
function mpReset(){ mpHide(); MP.spec = false; MP.code = null; MP.room = null; MP.lastSeq = 0; MP.view = {}; clearInterval(MP.poll); if (MP.ch){ try { ACC.sb.removeChannel(MP.ch); } catch(e){} MP.ch = null; } }
function mpForget(){
  MP.spec = false; MP.code = null; MP.room = null; MP.lastSeq = 0; MP.view = {};
  clearInterval(MP.poll); if (MP.ch){ try { ACC.sb.removeChannel(MP.ch); } catch(e){} MP.ch = null; }
  try { localStorage.removeItem(mpKey()); } catch(e){}
}
function mpRender(){
  const ov = $('#mpOv'); if (!ov || ov.hidden) return;
  const R = MP.room, g = R ? MP_GAMES[R.game] : null;
  if (R && R.game === 'bm' && (R.status === 'play' || R.status === 'over') && (mpMe() >= 0 || MP.spec)){ mbmOpen(); return; }
  if (R && MP_UPD[R.game] && (R.status === 'play' || R.status === 'over') && MP_UPD[R.game](R)){
    const sm = ov.querySelector('.bm-ttl small'); if (sm) sm.textContent = `${mpSpec() ? '👀 관전 중 · ' : ''}방 ${MP.code || ''} · 달러 통장 ${fmtUSD(S.usd)}${mpWatchTxt()}`;
    return;
  }
  const body = !R ? '<p class="muted">방을 불러오는 중…</p>' : R.status === 'closed' ? `<p>방이 닫혔습니다.</p><p class="muted">시작 전에 닫힌 방은 판돈이 빠지지 않습니다.</p>` : R.status === 'lobby' ? mpLobbyHTML(R) : (MP_VIEW[R.game] || (() => ''))(R);
  ov.innerHTML = `<div class="bm-top"><button class="btn" id="mpClose">닫기</button><div class="bm-ttl"><b>${g ? g.ic + ' ' + g.nm : '👥 같이 하기'}</b><small>${mpSpec() ? '👀 관전 중 · ' : ''}방 ${esc(MP.code || '')} · 달러 통장 ${fmtUSD(S.usd)}${esc(mpWatchTxt())}</small></div>${mpSpec() ? '<span class="gm-sp"></span>' : '<button class="btn" id="mpLeave">나가기</button>'}</div>
    <section class="card c-mg gm-body">${body}</section>`;
  mpTick();
  if (R && MP_UPD[R.game] && (R.status === 'play' || R.status === 'over')) MP_UPD[R.game](R);
}
function mpSeatsHTML(R, extra){
  const me = mpMe();
  return `<div class="mp-seats">${R.state.seats.map((s, i) => `<div class="mp-seat ${i === me ? 'me' : ''} ${s.left ? 'left' : ''}"><b data-seatnm="${i}">${esc(s.nick)}</b><small>${s.uid === R.host ? '방장' : ''}${i === me ? (s.uid === R.host ? ' · 나' : '나') : ''}${s.left ? ' · 나감' : ''}${extra ? extra(s, i) : ''}</small></div>`).join('')}</div>`;
}
function mpLobbyHTML(R){
  const me = mpMe(), host = ACC.user && R.host === ACC.user.id, n = R.state.seats.length, min = MP_MIN[R.game] || 2;
  const prev = R.state.prev;
  return `<div class="mp-code"><small>방 코드</small><b class="num">${esc(R.code)}</b><button class="btn" id="mpCopy">복사</button></div>
    <p class="muted" style="margin:0 0 8px">판돈 ${fmtUSD(R.stake)} · ${n}/${R.state.maxP}명${R.il ? ' · <b class="down">🚨 불법 모드 방</b>' : ''} · ${R.mode === 'live' ? '실제 시세' : '시뮬레이션'} 모드</p>
    ${prev && prev.seats ? `<p class="muted" style="margin:0 0 8px">지난 판: ${prev.score ? prev.seats.map((nm, i) => `${esc(nm)} ${prev.score[i]}`).join(' : ') + ' · ' : ''}${prev.win >= 0 && prev.seats[prev.win] !== undefined ? `${esc(prev.seats[prev.win])} 승` : ''}</p>` : ''}
    ${mpSeatsHTML(R)}
    ${me >= 0 && n < R.state.maxP ? '<div class="mg-foot" style="margin:0 0 8px"><button class="btn" id="onlInv">🟢 접속 중인 사람 부르기</button></div>' : ''}
    <div class="bm-acts">${me < 0 ? `<button class="btn solid" id="mpRejoin">참가 (판돈 ${fmtUSD(R.stake)})</button>`
      : host ? `<button class="btn solid" id="mpStart" ${n >= min ? '' : 'disabled'}>${n >= min ? '시작' : `${min}명이 되면 시작할 수 있습니다`}</button>` : '<p class="bm-wait">방장이 시작하기를 기다리는 중…</p>'}</div>`;
}
async function mpAct(kind, arg, spent){
  if (MP.busy) return; MP.busy = true; mpRender();
  try {
    const pid = spent ? mpPendAdd(MP.code, spent) : null;
    const r = await mpReq(MP.code, kind, arg);
    if (pid && (r.ok || !r.timeout)) mpPendDone(pid);
    if (!r.ok){ if (spent && !r.timeout){ receiveUSD(spent); commit(); } toast(r.err, true); }
    await mpFetch();
  } finally { MP.busy = false; mpRender(); }
}
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.id === 'mpNewBtn') return mpNew();
  if (t.id === 'onlBtn') return onlOpen(null);
  if (t.id === 'onlInv') return onlOpen(MP.room);
  if (t.id === 'mpJoinBtn') return mpJoin();
  if (t.id === 'mpWatchBtn') return mpWatchList();
  if (t.id === 'mpResume'){ let c = null; try { c = localStorage.getItem(mpKey()); } catch(e){} if (c) mpEnter(c); return; }
  if (t.id === 'mpClose'){
    // 대기실에서 닫으면 나가기와 같다: 자리를 비우고 판돈을 바로 돌려받는다 (예전에는 자리를 둔 채 창만 닫혀, 20분 뒤에야 환불이 들어왔다)
    const R = MP.room;
    if (R && R.status === 'lobby' && mpMe() >= 0){
      t.disabled = true;
      const r = await mpReq(MP.code, 'leave');
      if (!r.ok){ t.disabled = false; return toast(r.err, true); }
      mpForget(); mpHide(); setTimeout(mpClaim, 800); toast('대기실에서 나왔습니다');
      return;
    }
    if (MP.spec && mpMe() < 0){ mpForget(); }   // 관전은 닫으면 끝
    return mpHide();
  }
  if (t.id === 'mpCopy'){ try { await navigator.clipboard.writeText(MP.code); toast('방 코드를 복사했습니다'); } catch(e){ toast(`방 코드: ${MP.code}`); } return; }
  if (t.id === 'mpStart') return mpAct('start');
  if (t.id === 'mpLeave'){
    const R = MP.room;
    if (!R || R.status === 'closed' || mpMe() < 0 || R.status === 'over'){ if (R && R.status === 'over' && mpMe() >= 0) mpReq(MP.code, 'leave'); mpForget(); mpHide(); return; }
    const playing = R.status === 'play';
    const c = showModal(`<h2>방에서 나갈까요?</h2><p>${playing ? '진행 중에 나가면 <b>기권</b>으로 처리되어 판돈을 잃습니다.' : R.host === ACC.user.id ? '방장이 나가면 방이 닫힙니다. 아직 시작 전이라 판돈은 빠지지 않습니다.' : '아직 시작 전이라 판돈은 빠지지 않습니다.'}</p>
      <div class="acts"><button class="btn" data-close>취소</button><button class="btn solid" id="mpLeaveYes">나가기</button></div>`);
    $('#mpLeaveYes').onclick = async () => { c(); const r = await mpReq(MP.code, 'leave'); if (!r.ok) return toast(r.err, true); mpForget(); mpHide(); setTimeout(mpClaim, 800); };
    return;
  }
  if (t.id === 'mpRejoin' || t.id === 'mpAgain'){
    const R = MP.room; if (!R) return;
    if (S.usd < R.stake) return toast(`달러 통장에 ${fmtUSD(R.stake)}이 있어야 합니다`, true);
    if (R.mode !== S.mode) return toast('같은 모드에서만 참가할 수 있습니다', true);
    if (R.il && !gamIl()){ gamS().il = true; commit(); }
    return mpAct(t.id === 'mpAgain' ? 'again' : 'join', {mode:S.mode, il:gamIl(), nick:mpNick(), payAtStart:true});   // 판돈은 시작할 때 서버가 가져간다
  }
  if (t.dataset.mpa){ const a = JSON.parse(t.dataset.mpa); return mpAct('act', a); }
});

/* ── 받을 돈 가져오기 (끝난 판, 환불) ── */
async function mpClaim(){
  if (!ACC.sb || !ACC.user || MP.claiming) return;
  MP.claiming = true;
  try {
    const {data} = await ACC.sb.from('seed10k_payouts').select('*').eq('user_id', ACC.user.id).eq('mode', S.mode).is('claimed_at', null).order('id', {ascending:true}).limit(20);
    for (const p of data || []){
      // 받음 표시가 먼저 성공한 기기만 돈을 받는다 (여러 탭·기기에서 두 번 받지 않게)
      const {data:got} = await ACC.sb.from('seed10k_payouts').update({claimed_at:new Date().toISOString()}).eq('id', p.id).is('claimed_at', null).select('id');
      if (!got || !got.length) continue;
      const amt = +p.amount || 0, net = Math.round((amt - (+p.cost || 0)) * 100) / 100;
      const bk = amt < 0 ? mpBetKey(p.code, p.note) : null;
      if (bk && betHas(bk)) continue;   // 이 판의 판돈은 이미 장부에 있다 (시작 확인 때 먼저 청구했거나 이미 냄) → 두 번 빼지 않는다
      if (amt > 0) receiveUSD(amt);
      else if (amt < 0){ spendUSD(-amt); if (bk) betPaid(bk, -amt); }   // 판이 시작할 때 서버가 가져가는 판돈 (모자라면 마이너스통장)
      const gnm = (MP_GAMES[p.game] || {}).nm || '같이 하기';
      altLog('gamble', amt < 0 ? `👥 ${gnm} 판돈 냄` : `👥 ${p.note || gnm}${p.il ? ' (불법)' : ''}`, amt < 0 ? amt : net, 'USD');
      commit();
      if (amt > 0) toast(`👥 ${p.note || '같이 하기'}: ${fmtUSD(amt)}을 받았습니다`);
      else if (amt < 0){ toast(`👥 ${gnm} 시작: 판돈 ${fmtUSD(-amt)}을 냈습니다`); continue; }
      if (p.il && GAM[p.game] && !/환불/.test(p.note || '')) police(p.game, true, net);   // 환불은 단속하지 않는다
      if (!/환불/.test(p.note || '')) runCheck();   // 도망친 뒤의 '이후 판'에는 같이 하기 판도 들어간다
    }
  } catch(e){ console.warn('[seed10k] 받을 돈 확인 실패', e); }
  finally { MP.claiming = false; }
}
function mpWatchPayouts(){
  if (!ACC.sb || !ACC.user) return;
  mpBanCheck();
  if (MP.payCh){ try { ACC.sb.removeChannel(MP.payCh); } catch(e){} }
  try { MP.payCh = ACC.sb.channel('pay-' + ACC.user.id).on('postgres_changes', {event:'INSERT', schema:'public', table:'seed10k_payouts', filter:`user_id=eq.${ACC.user.id}`}, () => mpClaim()).subscribe(); } catch(e){}
  setTimeout(mpClaim, 2500); setTimeout(mpPendCheck, 3000);
}
setInterval(() => { if (!document.hidden && ACC.user) mpClaim(); }, 30000);
setInterval(() => { if (!document.hidden && ACC.user && UI.tab === 'market' && $('#mpRef')) mpRefAlive().then(() => { const el = $('#mpRef'); if (el) el.innerHTML = MP.ref === false ? '<span class="down">게임 서버 꺼짐</span>' : MP.ref ? '게임 서버 켜짐' : ''; }); }, 15000);

/* ── 게임별 화면 ── */
const MP_VIEW = {}, MP_UPD = {};   // MP_VIEW: 처음 그리기, MP_UPD: 이미 그린 화면을 그 자리에서 고치기 (그렸으면 true)
const mpLeft = dl => dl ? Math.max(0, Math.ceil((dl - Date.now()) / 1000)) : null;
function mpTick(){ const el = $('#mpTimer'); if (el && MP.room){ const s = mpLeft(MP.room.state.deadline), t = s === null ? '' : `${s}초`; if (el.textContent !== t) el.textContent = t; } }
setInterval(mpTick, 500);

// 홀짝 대결
MP_VIEW.oe = R => {
  if (mpMe() < 0) return moeSpecHTML(R);
  const st = R.state, g = st.g || {}, me = mpMe(), opp = 1 - me, seats = st.seats;
  const show = MP.view.oeShow && MP.view.oeShow.seq <= st.seq ? MP.view.oeShow : null;
  const over = R.status === 'over';
  const sc = `<div class="oe-score"><span><b data-seatnm="${me}">${esc(seats[me] ? seats[me].nick : '')}</b> (나) <b class="num up">${g.score ? g.score[me] : 0}</b></span><span class="muted">${over ? '끝' : `${g.round}판 · 3점 먼저`}</span><span><b class="num">${g.score ? g.score[opp] : 0}</b> <b data-seatnm="${opp}">${esc(seats[opp] ? seats[opp].nick : '')}</b></span></div>`;
  let hand, msg, acts = '';
  if (show){
    const iWon = show.pt === me;
    hand = `<div class="oe-hand open"><div class="oe-marbles">${Array.from({length:show.n}, (_, k) => `<i style="--d:${k * 25}ms"></i>`).join('')}</div><b class="num">${show.n}개 · ${show.n % 2 ? '홀' : '짝'}</b></div>`;
    msg = `<p class="oe-res ${iWon ? 'up' : 'down'}">${show.guesser === me ? `내가 ${show.pick === 'odd' ? '홀' : '짝'}을 골라 ${show.ok ? '맞혔다!' : '틀렸다'}` : `상대가 ${show.pick === 'odd' ? '홀' : '짝'}을 골라 ${show.ok ? '맞혔다' : '틀렸다!'}`} · ${iWon ? '내' : '상대'} 1점</p>`;
  } else if (over){
    const iWon = g.win === me;
    hand = `<div class="oe-hand"><span class="fist">${iWon ? '🏆' : '😵'}</span></div>`;
    msg = `<p class="oe-res ${iWon ? 'up' : 'down'}">${iWon ? `이겼다! ${fmtUSD(R.stake * 2)}을 받습니다` : '졌다'} (${g.score[me]}:${g.score[opp]}${g.why && g.why !== '3점 먼저' ? ', ' + esc(g.why) : ''})</p>`;
    const host = ACC.user && R.host === ACC.user.id;
    acts = host ? `<button class="btn solid" id="mpAgain">한 판 더 (${fmtUSD(R.stake)})</button>` : '<p class="bm-wait">방장이 한 판 더 열면 다시 참가할 수 있습니다</p>';
  } else if (g.phase === 'hide'){
    hand = `<div class="oe-hand"><span class="fist">✊</span></div>`;
    if (g.hider === me){
      msg = `<p class="oe-res">구슬을 몇 개 쥘까요? <span class="muted" id="mpTimer"></span></p>`;
      acts = `<div class="oe-pick">${Array.from({length:20}, (_, k) => `<button class="btn" data-mpa='{"n":${k + 1}}' ${MP.busy ? 'disabled' : ''}>${k + 1}</button>`).join('')}</div>`;
    } else msg = `<p class="oe-res muted">상대가 구슬을 쥐는 중… <span id="mpTimer"></span></p>`;
  } else {
    hand = `<div class="oe-hand"><span class="fist">✊</span></div>`;
    if (g.hider !== me){
      msg = `<p class="oe-res">상대가 쥔 구슬은 홀일까 짝일까? <span class="muted" id="mpTimer"></span></p>`;
      acts = `<button class="btn" data-mpa='{"pick":"odd"}' ${MP.busy ? 'disabled' : ''}>홀</button><button class="btn" data-mpa='{"pick":"even"}' ${MP.busy ? 'disabled' : ''}>짝</button>`;
    } else msg = `<p class="oe-res muted">상대가 고르는 중… <span id="mpTimer"></span></p>`;
  }
  return `<div class="card-h"><h2>✊ 홀짝 대결</h2><small>판돈 ${fmtUSD(R.stake)}${R.il ? ' · 🚨 불법' : ''}</small></div>${sc}${hand}${msg}<div class="bm-acts">${acts}</div>`;
};

// 뱀사다리 (2~4명). 판은 혼자 할 때와 같다. 굴림 결과는 심판이 정하고, 화면은 받은 이벤트를 차례로 움직여 보여 준다
MP_VIEW.sl = R => {
  const st = R.state, n = st.seats.length;
  return `<div class="card-h"><h2>🐍 뱀사다리</h2><small>판돈 ${fmtUSD(R.stake)} · ${n}명 · 1등 ${fmtUSD(R.stake * n)}${R.il ? ' · 🚨 불법' : ''}</small></div>
    <div class="sl-board" id="mslBoard">${slCellsHTML()}<svg class="sl-svg" id="mslSvg"></svg>${st.seats.map((p, i) => `<div class="sl-tok" data-msltok="${i}" style="--pc:${BM.cols[i % BM.cols.length]}"><span>${esc([...(p.nick || '?')][0])}</span></div>`).join('')}<div class="bm-fx" id="mslFx"></div></div>
    <div class="sl-panel" style="margin-top:10px"><div id="mslSeats"></div><div class="bm-row"><div class="bm-dice" id="mslDice">${bmDieHTML()}</div><div class="bm-msg" id="mslMsg"></div></div><div class="bm-acts" id="mslAct"></div><ul class="bm-log" id="mslLog"></ul></div>`;
};
const mpSetH = (el, h) => { if (el && el._h !== h){ el._h = h; el.innerHTML = h; mpTick(); } };   // 바뀐 것만 다시 그린다 (누르는 중인 버튼이 사라지지 않게)
const mslNm = (R, i) => i === mpMe() ? '나' : (R.state.seats[i] || {}).nick || '?';
function mslPlace(R, instant){
  const b = $('#mslBoard'), g = R.state.g; if (!b || !g) return;
  const w = b.clientWidth, pos = MP.view.slTok || g.pos, sz = w / 10 * 0.46, n = pos.length;
  const off = n <= 2 ? [[-0.32, 0], [0.32, 0]] : [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]];
  pos.forEach((p, i) => {
    const t = document.querySelector(`[data-msltok="${i}"]`); if (!t) return;
    const [x, y] = slXY(p, w), [ox, oy] = off[i] || [0, 0];
    if (instant) t.style.transition = 'none';
    t.style.width = t.style.height = sz + 'px';
    t.style.opacity = R.state.seats[i].left ? '.35' : '';
    t.style.transform = `translate(${x - sz / 2 + ox * sz}px, ${y - sz / 2 + oy * sz}px)`;
    if (instant){ t.offsetWidth; t.style.transition = ''; }
  });
}
MP_UPD.sl = R => {
  const b = $('#mslBoard'), svg = $('#mslSvg'), g = R.state.g; if (!b || !svg || !g) return false;
  const w = b.clientWidth;
  if (+svg.dataset.w !== w){ svg.dataset.w = w; svg.setAttribute('viewBox', `0 0 ${w} ${w}`); svg.innerHTML = slSvgHTML(w); mslPlace(R, true); }
  const busy = !!MP.view.slBusy, pos = MP.view.slTok || g.pos, me = mpMe(), over = R.status === 'over' && !busy;
  mpSetH($('#mslSeats'), mpSeatsHTML(R, (s, i) => `<span style="display:block"><span class="mp-dot" style="background:${BM.cols[i % BM.cols.length]}"></span> ${pos[i]}칸${!over && !busy && R.status === 'play' && i === g.turn ? ' · 🎲 차례' : ''}${over && i === g.win ? ' · 🏆' : ''}</span>`));
  const msg = $('#mslMsg'), act = $('#mslAct');
  if (busy){ mpSetH(act, '<p class="bm-wait">움직이는 중…</p>'); mslPlace(R, false); return true; }
  if (over){
    const iWon = g.win === me, pot = R.stake * R.state.seats.length, host = ACC.user && R.host === ACC.user.id;
    mpSetH(msg, iWon ? `<b class="up">🏆 이겼다! ${fmtUSD(pot)}을 받습니다</b>` : `<b class="down">${esc(mslNm(R, g.win))} 승리</b>${g.why && g.why !== '100칸 도착' ? ` (${esc(g.why)})` : ''}`);
    mpSetH(act, host ? `<button class="btn solid" id="mpAgain">한 판 더 (${fmtUSD(R.stake)})</button>` : '<p class="bm-wait">방장이 한 판 더 열면 다시 참가할 수 있습니다</p>');
  } else if (g.turn === me){
    mpSetH(msg, `내 차례 <span class="muted" id="mpTimer"></span>`);
    mpSetH(act, `<button class="btn solid bm-roll" data-mpa='{"roll":1}' ${MP.busy ? 'disabled' : ''}>🎲 주사위 굴리기</button>`);
  } else {
    mpSetH(msg, `${esc(mslNm(R, g.turn))} 차례… <span class="muted" id="mpTimer"></span>`);
    mpSetH(act, '<p class="bm-wait">기다리는 중 (20초가 지나면 자동으로 굴립니다)</p>');
  }
  mpSetH($('#mslLog'), (g.log || []).slice(-4).reverse().map(t => `<li>${esc(t)}</li>`).join(''));
  mslPlace(R, false);
  return true;
};
function mslSay(t){ const m = $('#mslMsg'); if (m){ m._h = null; m.textContent = t; } }
function mslWait(ms){ const gen = MP.view.slGen; return new Promise((res, rej) => setTimeout(() => (gen === MP.view.slGen && $('#mslBoard')) ? res() : rej('stop'), bmMs(ms))); }
async function mslRun(){
  if (MP.view.slBusy) return;
  MP.view.slBusy = true; MP.view.slGen = (MP.view.slGen || 0) + 1;
  try {
    while (MP.view.slQ && MP.view.slQ.length){
      const ev = MP.view.slQ.shift(), R = MP.room, me = mpMe();
      if (!R || !$('#mslBoard')) throw 'stop';
      MP.view.slTok = ev.pos0.slice(); MP_UPD.sl(R);
      const fx = $('#mslFx'), tokEl = i => document.querySelector(`[data-msltok="${i}"]`);
      for (const e of ev.list){
        const nm = mslNm(R, e.i);
        if (e.t === 'dice'){
          mslSay(`${nm} 굴리는 중…`);
          const c = $('#mslDice .bm-cube'), box = $('#mslDice');
          box.classList.add('rolling'); c.style.transition = 'none'; c.style.transform = `rotateX(${Math.random() * 360}deg) rotateY(${Math.random() * 360}deg)`; c.offsetWidth;
          c.style.transition = `transform ${bmMs(700)}ms cubic-bezier(.2,.75,.25,1)`; c.style.transform = `rotateX(720deg) rotateY(720deg) ` + BM_FACE[e.d];
          await mslWait(720); box.classList.remove('rolling');
          mslSay(`${nm}: ${e.d}`);
          await mslWait(180);
        } else if (e.t === 'move'){
          for (const k of e.path){
            MP.view.slTok[e.i] = k; const t = tokEl(e.i); if (!t) break; const inner = t.querySelector('span');
            t.style.transition = `transform ${bmMs(140)}ms ease-out`; inner.classList.remove('hop'); inner.offsetWidth; inner.classList.add('hop');
            mslPlace(R, false); await mslWait(150);
          }
        } else if (e.t === 'ladder' || e.t === 'snake'){
          const mine = e.i === me;
          bmBannerIn(fx, e.t === 'ladder' ? `🪜 ${mine ? '' : nm + ' '}사다리! ${e.from} → ${e.to}` : `🐍 ${mine ? '' : nm + ' '}뱀! ${e.from} → ${e.to}`, mine ? (e.t === 'ladder' ? 'green' : 'red') : '', 900);
          await mslWait(380);
          MP.view.slTok[e.i] = e.to; const t = tokEl(e.i);
          if (t) t.style.transition = `transform ${bmMs(e.t === 'ladder' ? 650 : 800)}ms ${e.t === 'ladder' ? 'ease-in-out' : 'cubic-bezier(.5,0,.7,1)'}`;
          mslPlace(R, false); await mslWait(e.t === 'ladder' ? 700 : 850);
        } else if (e.t === 'win'){
          bmBannerIn(fx, e.i === me ? '🏆 내가 이겼다!' : `😵 ${nm} 승리`, e.i === me ? 'gold' : 'red', 1600);
          if (e.i === me) bmConfettiIn(fx);
          await mslWait(600);
        }
      }
    }
  } catch(err){ if (err !== 'stop') console.error(err); MP.view.slQ = []; }
  MP.view.slBusy = false; MP.view.slTok = null;
  mpRender();
}
window.addEventListener('resize', () => { if (MP.room && $('#mslBoard')) MP_UPD.sl(MP.room); });

// 블랙잭 대결 (2~5명, 딜러 없이). 카드는 심판이 나눠 주고 모두에게 보인다. 히트·스탠드만
function mbjBody(R){
  const st = R.state, g = st.g, me = mpMe(), V = MP.view.bjV || (MP.view.bjV = {seen:new Set(), now:new Set()});
  V.now = new Set();
  const RES = {win:['승', 'up'], tie:['동점', ''], lose:['패', 'down'], refund:['환불', '']};
  const over = R.status === 'over';
  const rows = g.order.map(i => {
    const s = st.seats[i], P = g.players[i], turn = !over && g.turn === i, t = BJE.total(P.cards).t, bj = P.cards.length === 2 && t === 21;
    return `<div class="bj-row mbj-row ${i === me ? 'me' : ''} ${s.left ? 'left' : ''}"><span class="bj-who" data-seatnm="${i}">${esc(i === me ? '나' : s.nick)}${turn ? '<small>차례</small>' : ''}${s.left ? '<small>나감</small>' : ''}</span><div class="bj-hands">
      <div class="bj-hand ${turn ? 'cur' : ''}"><div class="bj-cards">${P.cards.map((c, j) => bjCardHTML(c, false, j, `p${i}-${j}-${c}`, V)).join('')}</div>
      <div class="bj-meta"><b class="num">${t > 21 ? `${t} 버스트` : bj ? '블랙잭' : P.done || over ? t : bjTot(P.cards)}</b>${over && P.res ? `<em class="${RES[P.res][1]}">${RES[P.res][0]}${g.pay && g.pay[i] ? ` ${fmtUSD(g.pay[i])}` : ''}</em>` : ''}</div></div></div></div>`;
  }).join('');
  let msg, acts = '';
  if (over){
    const mine = me >= 0 && g.pay ? g.pay[me] : 0, net = Math.round((mine - R.stake) * 100) / 100;
    msg = me < 0 ? `<p class="oe-res">${(() => { const w = st.seats.map((s, i) => i).filter(i => g.pay && g.pay[i] > 0); return w.length ? `🏆 ${w.map(i => esc(st.seats[i].nick)).join(', ')} ${w.length > 1 ? '나눠 가짐' : '승리'}` : '모두 버스트 · 환불'; })()}</p>` : me >= 0 ? `<p class="oe-res ${cls(net)}">${st.seats[me].left ? '기권' : g.players[me].res === 'refund' ? '모두 버스트 · 판돈을 돌려받습니다' : net > 0 ? `이겼다! ${fmtUSD(mine)}을 받습니다` : g.players[me].res === 'tie' ? `동점 · ${fmtUSD(mine)}을 나눠 받습니다` : '졌다'}</p>` : '';
    const host = ACC.user && R.host === ACC.user.id;
    acts = host ? `<button class="btn solid" id="mpAgain">한 판 더 (${fmtUSD(R.stake)})</button>` : me < 0 ? '' : '<p class="bm-wait">방장이 한 판 더 열면 다시 참가할 수 있습니다</p>';
  } else if (g.turn === me){
    msg = `<p class="oe-res">할 행동을 고르세요 <span class="muted" id="mpTimer"></span></p>`;
    acts = ['hit', 'stand'].map(a => `<button class="btn ${a === 'stand' ? 'solid' : ''}" data-mpbj="${a}" ${MP.busy ? 'disabled' : ''}>${BJ_ACT[a]}</button>`).join('');
  } else msg = `<p class="oe-res muted">${g.turn >= 0 ? `${esc(st.seats[g.turn].nick)} 차례…` : ''} <span id="mpTimer"></span></p>`;
  const h = `<div class="bj-table">${rows}</div>${msg}<div class="bm-acts">${acts}</div>
    <p class="muted" style="margin:6px 0 0;font-size:12px">버스트하지 않은 사람 중 21에 가장 가까운 사람이 ${fmtUSD(g.pot)}을 모두 가져갑니다 (블랙잭이 가장 높음, 동점이면 나눔, 모두 버스트면 환불). 20초 안에 고르지 않으면 스탠드</p>`;
  V.now.forEach(x => V.seen.add(x));
  return h;
}
MP_VIEW.bj = R => `<div class="card-h"><h2>🃏 블랙잭 대결</h2><small>판돈 ${fmtUSD(R.stake)} · ${R.state.seats.length}명 · 1등 ${fmtUSD(R.stake * R.state.seats.length)}${R.il ? ' · 🚨 불법' : ''}</small></div><div id="mbjBody"></div>`;
MP_UPD.bj = R => {
  const b = $('#mbjBody'); if (!b || !R.state.g) return false;
  // 예전 규칙(딜러와 하던 블랙잭 테이블)의 심판이 만든 판이면 그릴 수 없다: 심판을 새로 켠 뒤 새 방을 만들어야 한다
  if (!Array.isArray(R.state.g.order)){ mpSetH(b, '<p class="oe-res down">이 판은 예전 규칙(딜러와 하는 블랙잭)으로 만들어졌습니다.</p><p class="muted">게임 서버(라즈베리파이)를 새 버전으로 다시 켠 뒤, 나가기를 누르고 방을 새로 만드세요. 대기실에서 나가면 판돈은 돌려받고, 진행 중이면 기권으로 처리됩니다.</p>'); return true; }
  try { mpSetH(b, mbjBody(R)); } catch(e){ console.error(e); mpSetH(b, `<p class="oe-res down">화면을 그리지 못했습니다</p><p class="muted">${esc(String(e && e.message || e))}</p>`); }
  return true;
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-mpbj]'); if (!t || MP.busy) return;
  const R = MP.room, g = R && R.state.g, a = t.dataset.mpbj;
  if (!g || g.turn !== mpMe() || R.status !== 'play' || (a !== 'hit' && a !== 'stand')) return;
  mpAct('act', {a});
});

// 부루마블: 혼자 할 때의 보드 화면(bm.js)을 그대로 쓰고, 상태는 심판이 보낸 방 상태(BMV.mp)를 본다
function mbmOpen(){
  const ov = $('#mpOv'); if (ov && !ov.hidden){ ov.hidden = true; ov.innerHTML = ''; }
  if (BMV.mp && bmOpenNow()) return bmUpdate();
  BMV.mp = true; MP.view.bmQ = []; MP.view.bmHold = false;
  bmOpen();
}
function mbmSync(room){
  if (!BMV.mp || !bmOpenNow()) return;
  if (room.status === 'lobby' || room.status === 'closed'){ bmHide(); BMV.mp = false; mpOpen(); return; }   // 한 판 더 → 대기실
  if (!BMV.busy) bmUpdate();
}
function mbmRun(){
  if (BMV.busy || !BMV.mp || !bmOpenNow()) return;
  const ev = (MP.view.bmQ || []).shift();
  if (!ev){ MP.view.bmHold = false; if (MP.room && MP.room.status === 'over') setTimeout(mpClaim, 300); bmUpdate(); return; }
  bmPlay(ev.list || [], ev.v0, () => setTimeout(mbmRun, bmMs(200)));
}
function mbmSend(a){
  if (MP.busy || BMV.busy) return;
  BMV.sel = -1;
  mpAct('act', a);
}
function mbmQuit(){
  if (bmMe() < 0){ bmHide(); BMV.mp = false; mpForget(); return; }   // 관전 끝
  const g = bmG(); if (!g || g.over) return;
  const left = g.pl.filter((p, i) => i !== bmMe() && !p.out).length, n = g.n, m = BM.pay[n][left] || 0;
  const c = showModal(`<h2>기권할까요?</h2><p>지금 파산한 것으로 보고 <b>${left + 1}위 (${n}명 중)</b>로 끝납니다. ${m ? `판돈의 ${m}배인 ${fmtUSD(Math.round(g.stake * m * 100) / 100)}을 받습니다.` : `판돈 ${fmtUSD(g.stake)}을 잃습니다.`} 남은 사람들은 계속합니다.</p>
    <div class="acts"><button class="btn" data-close>계속하기</button><button class="btn solid" id="mbmQuitYes">기권</button></div>`);
  $('#mbmQuitYes').onclick = async () => { c(); const r = await mpReq(MP.code, 'leave'); if (!r.ok) return toast(r.err, true); bmHide(); BMV.mp = false; mpForget(); setTimeout(mpClaim, 800); };
}
function mbmOverHTML(g){
  const R = MP.room, me = bmMe(), n = g.n, host = ACC.user && R && R.host === ACC.user.id;
  const order = g.pl.map((p, i) => i).sort((a, b) => (g.rank ? g.rank[a] - g.rank[b] : 0));
  const rows = order.map(i => { const rk = g.rank ? g.rank[i] : 0, m = BM.pay[n][rk - 1] || 0; return `<div><span>${rk}위 ${esc(i === me ? '나' : g.pl[i].nm)}${R && R.state.seats[i] && R.state.seats[i].left ? ' (기권)' : ''}</span><b class="num">${g.pl[i].out ? '파산' : '자산 ' + bmW(BME.assets(g, i))} · ${m}배</b></div>`; }).join('');
  if (me < 0) return `<p class="bm-q">🏆 ${esc(g.rank ? g.pl[order[0]].nm : '?')} 1위</p><div class="bd">${rows}</div>`;
  const myM = g.rank ? BM.pay[n][g.rank[me] - 1] || 0 : 0;
  return `<p class="bm-q">${g.rank && g.rank[me] === 1 ? '🏆 ' : ''}${g.rank ? g.rank[me] : '?'}위 · ${fmtUSD(Math.round(g.stake * myM * 100) / 100)}을 받습니다 (판돈 ${fmtUSD(g.stake)})</p><div class="bd">${rows}</div>
    <div class="bm-acts">${host ? `<button class="btn solid" id="mpAgain">한 판 더 (${fmtUSD(R.stake)})</button>` : '<p class="bm-wait">방장이 한 판 더 열면 다시 참가할 수 있습니다</p>'}</div>`;
}

/* ── 접속 중인 사람 · 대결 신청 ──
   Supabase 실시간 Presence 채널 하나에 로그인한 사람이 모두 들어가 {id, 닉네임, 모드}를 알린다 (데이터베이스에 저장하지 않는다).
   대결 신청은 같은 채널의 Broadcast로 보낸다: 받는 사람 화면에 창이 뜨고, 수락하면 코드로 참가할 때와 같은 확인(판돈 내기)을 거친다.
   신청 내용은 방 코드를 알려 줄 뿐이라, 가짜 신청이 와도 방 확인·판돈 확인을 그대로 거친다 */
const ONL = {ch:null, list:[], sent:'', q:''};
function onlStop(){ if (ONL.ch){ try { ACC.sb.removeChannel(ONL.ch); } catch(e){} } ONL.ch = null; ONL.list = []; ONL.sent = ''; onlCount(); }
function onlStart(){
  onlStop();
  if (!ACC.user || !ACC.sb) return;
  const uid = ACC.user.id;
  try {
    const ch = ACC.sb.channel('seed10k-online', {config:{presence:{key:uid}, broadcast:{self:false}}});
    ch.on('presence', {event:'sync'}, () => onlSync(ch))
      .on('broadcast', {event:'invite'}, m => onlGot(m && m.payload))
      .on('broadcast', {event:'invite_no'}, m => { const p = m && m.payload; if (p && ACC.user && p.to === ACC.user.id) toast(`${p.nick}님이 대결 신청을 거절했습니다`); })
      .subscribe(st => { if (st === 'SUBSCRIBED'){ ONL.sent = ''; onlTrack(); } });
    ONL.ch = ch;
  } catch(e){}
}
function onlTrack(){   // 닉네임·모드가 바뀌었을 때만 다시 알린다
  if (!ONL.ch || !ACC.user) return;
  const me = {uid:ACC.user.id, nick:mpNick(), mode:S.mode}, k = JSON.stringify(me);
  if (k === ONL.sent) return;
  ONL.sent = k;
  try { const r = ONL.ch.track(me); if (r && r.catch) r.catch(() => { ONL.sent = ''; }); } catch(e){ ONL.sent = ''; }
}
setInterval(onlTrack, 15000);
function onlSync(ch){
  const st = ch.presenceState() || {}, me = ACC.user ? ACC.user.id : '';
  ONL.list = Object.values(st).map(a => a[a.length - 1]).filter(p => p && p.uid && p.uid !== me)
    .sort((a, b) => (b.mode === S.mode) - (a.mode === S.mode) || String(a.nick).localeCompare(String(b.nick), 'ko'));
  onlCount(); if ($('#onlList')) onlDraw();
}
function onlCount(){ const n = $('#onlN'); if (n) n.textContent = ONL.list.length; }
function onlOpen(room){   // room: 대기실에서 부를 때 그 방
  if (!ACC.user) return toast('로그인해야 합니다', true);
  if (ACC.tester) return toast('테스트 계정은 멀티플레이를 할 수 없습니다', true);
  if (MP.banned) return toast('멀티플레이가 제한된 계정입니다', true);
  ONL.room = room || null; ONL.q = '';
  showModal(`<h2>🟢 접속 중인 사람</h2><p class="muted" style="margin:0 0 8px">${room ? `방 ${esc(room.code)}(${MP_GAMES[room.game].nm}, 판돈 ${fmtUSD(room.stake)})으로 부릅니다` : '이름을 눌러 대결을 신청하세요. 같은 모드끼리만 할 수 있습니다'}</p>
    <label class="amt"><input id="onlQ" type="search" autocomplete="off" placeholder="닉네임 검색" value="${esc(ONL.q)}"></label>
    <div id="onlList" class="onl-list"></div><div class="acts"><button class="btn" data-close>닫기</button></div>`);
  const q = $('#onlQ'); q.oninput = () => { ONL.q = q.value; onlDraw(); };
  onlDraw();
}
function onlDraw(){
  const box = $('#onlList'); if (!box) return;
  const q = ONL.q.trim().toLowerCase(), room = ONL.room;
  const list = ONL.list.filter(p => !q || String(p.nick).toLowerCase().includes(q));
  const inRoom = room ? new Set(room.state.seats.filter(s => !s.left).map(s => s.uid)) : new Set();
  box.innerHTML = list.length ? list.map(p => {
    const same = p.mode === (room ? room.mode : S.mode), here = inRoom.has(p.uid);
    return `<div class="onl-p"><span><b>${esc(p.nick)}</b><small>${p.mode === 'live' ? '실제 시세' : '시뮬레이션'}</small></span>
      <button class="btn ${same && !here ? 'solid' : ''}" data-onl="${esc(p.uid)}" ${same && !here ? '' : 'disabled'}>${here ? '방에 있음' : same ? (room ? '부르기' : '대결 신청') : '다른 모드'}</button></div>`;
  }).join('') : `<p class="empty">${ONL.list.length ? '찾는 사람이 없습니다' : '지금 접속 중인 다른 사람이 없습니다'}</p>`;
  box.querySelectorAll('[data-onl]').forEach(b => b.onclick = () => {
    const p = ONL.list.find(x => x.uid === b.dataset.onl); if (!p) return;
    if (ONL.room){ const R = ONL.room; onlSend(p, R.code, R.game, R.stake); b.disabled = true; b.textContent = '보냄'; return; }
    $('#modal [data-close]').click(); setTimeout(() => mpNew({uid:p.uid, nick:p.nick}), 200);
  });
}
function onlSend(to, code, game, stake){
  if (!ONL.ch) return toast('접속 목록에 연결되지 않아 신청을 보내지 못했습니다. 방 코드를 알려 주세요', true);
  try {
    ONL.ch.send({type:'broadcast', event:'invite', payload:{to:to.uid, from:ACC.user.id, nick:mpNick(), code, game, stake, mode:S.mode, at:Date.now()}});
    toast(`${to.nick}에게 대결 신청을 보냈습니다`);
  } catch(e){ toast('신청을 보내지 못했습니다', true); }
}
function onlGot(p){
  if (!p || !ACC.user || p.to !== ACC.user.id || !MP_GAMES[p.game]) return;
  if (Date.now() - (+p.at || 0) > 120000) return;            // 2분 지난 신청은 무시
  if (MP.code === p.code) return;                            // 이미 그 방
  const g = MP_GAMES[p.game];
  const html = `<h2>⚔️ 대결 신청</h2><p><b>${esc(p.nick)}</b>님이 <b>${g.ic} ${g.nm}</b>${/대결$/.test(g.nm) ? '을' : ' 대결을'} 신청했습니다.</p>
    <p>판돈 <b class="num">${fmtUSD(+p.stake || 0)}</b> · ${p.mode === 'live' ? '실제 시세' : '시뮬레이션'} 모드 · 방 ${esc(p.code)}</p>
    <div class="acts"><button class="btn" id="onlNo">거절</button><button class="btn solid" id="onlYes">수락</button></div>`;
  const show = () => {
    if (!$('#modal').hidden || bmOpenNow()){ setTimeout(show, 600); return; }
    const c = showModal(html);
    $('#onlNo').onclick = () => { c(); try { ONL.ch.send({type:'broadcast', event:'invite_no', payload:{to:p.from, nick:mpNick()}}); } catch(e){} };
    $('#onlYes').onclick = () => { c(); setTimeout(() => mpJoin(p.code, true), 200); };
  };
  show();
}

// 벅샷 룰렛 (2~4명). 판 그림은 혼자 할 때(bs.js)와 같고, 돋보기로 본 탄은 내 요청 결과로만 받는다
const mbsPeek = g => { const p = MP.view.bsPeek; return p && p.load === g.load && p.left === g.live + g.blank ? p.peek : null; };
function mbsBody(R){
  const g = R.state.g, me = mpMe(), host = ACC.user && R.host === ACC.user.id;
  const foot = R.status === 'over' && !BSV.busy ? (me < 0 ? `<p class="oe-res">🏆 ${esc(g.pl[g.win] ? g.pl[g.win].nm : '?')} 승리 · ${fmtUSD(R.stake * g.n)}</p>` : `<p class="oe-res ${g.win === me ? 'up' : 'down'}">${g.win === me ? `🏆 WIN! ${fmtUSD(R.stake * g.n)}을 받습니다` : `💀 ${esc(g.pl[g.win] ? g.pl[g.win].nm : '?')} 승리`}</p>
    <div class="bm-acts">${host ? `<button class="btn solid" id="mpAgain">한 판 더 (${fmtUSD(R.stake)})</button>` : '<p class="bm-wait">방장이 한 판 더 열면 다시 참가할 수 있습니다</p>'}</div>`) : R.status === 'over' ? ' ' : '';
  return bsTableHTML(g, me < 0 ? 0 : me, {mine:me >= 0, spec:me < 0, peek:me < 0 ? null : mbsPeek(g), wait:MP.busy || me < 0, timer:R.status === 'play', foot});
}
MP_VIEW.bs = R => `<div class="card-h"><h2>💥 벅샷 룰렛</h2><small>판돈 ${fmtUSD(R.stake)} · ${R.state.seats.length}명 · 1등 ${fmtUSD(R.stake * R.state.seats.length)}${R.il ? ' · 🚨 불법' : ''}</small></div><div id="mbsBody"></div>`;
MP_UPD.bs = R => { const b = $('#mbsBody'); if (!b || !R.state.g) return false; mpSetH(b, mbsBody(R)); return true; };
const mbsRer = () => { const R = MP.room; if (R && R.game === 'bs') MP_UPD.bs(R); };
mbsRer.pending = () => (MP.view.bsQ || []).length > 0;   // 받아 두고 아직 안 보여 준 이벤트가 있나
mbsRer.g = () => MP.room && MP.room.state.g; Object.defineProperty(mbsRer, 'me', {get:() => mpMe() < 0 ? 0 : mpMe()}); Object.defineProperty(mbsRer, 'spec', {get:() => mpMe() < 0});   // 관전은 첫 자리 눈으로 본다
function mbsRun(){
  if (BSV.busy) return;
  const ev = (MP.view.bsQ || []).shift();
  if (!ev){ MP.view.bmHold = false; if (MP.room && MP.room.status === 'over') setTimeout(mpClaim, 300); mbsRer(); return; }
  const after = (MP.view.bsQ || []).flatMap(x => x.list || []);
  bsPlay(ev.list || [], () => mbsRer.pending() ? mbsRun() : setTimeout(mbsRun, 150), mbsRer, after);
}
async function mbsSend(a){
  if (MP.busy || BSV.busy) return;
  MP.busy = true; mbsRer();
  try {
    const r = await mpReq(MP.code, 'act', a);
    if (!r.ok) toast(r.err, true);
    else if (r.res && r.res.peek !== undefined) MP.view.bsPeek = r.res;
    await mpFetch();
  } finally { MP.busy = false; mbsRer(); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('#mpOv button'); if (!t || !MP.room || MP.room.game !== 'bs') return;
  const g = MP.room.state.g, me = mpMe(); if (!g || g.turn !== me || MP.room.status !== 'play') return;
  if (t.dataset.bsit){
    const it = t.dataset.bsit;
    if (it !== 'cuff') return mbsSend({op:'use', it});
    const opps = g.pl.map((p, i) => i).filter(i => i !== me && !g.pl[i].out && !g.pl[i].cuffed);
    if (opps.length === 1) return mbsSend({op:'use', it, target:opps[0]});
    const c = showModal(`<h2>⛓️ 누구에게 수갑을 채울까요?</h2><div class="mp-games">${opps.map(i => `<button class="btn" data-bscuff="${i}">${esc(g.pl[i].nm)} (목숨 ${g.pl[i].hp})</button>`).join('')}</div><div class="acts"><button class="btn" data-close>취소</button></div>`);
    $$('#modal [data-bscuff]').forEach(b => b.onclick = () => { c(); mbsSend({op:'use', it, target:+b.dataset.bscuff}); });
  }
});

/* ── 방 채팅 ──
   화면 아래 입력칸에서 보내면, 보낸 사람 이름이 보이는 곳(대기실 자리, 점수판, 말 이름표 등)에 말풍선으로 5초 동안 뜬다.
   보내는 길: 심판 웹소켓(보낸 사람을 서버가 확인해 자리 번호를 붙인다) + Supabase 방 채널 방송(웹소켓이 없는 사람용). 같은 말은 id로 한 번만 보인다.
   기록은 남기지 않는다 */
const MPC = {seen:new Set(), bub:[], raf:0, last:0, log:[]};
const MPC_MAX = 60, MPC_MS = 5000;
function mpChatView(){   // 방 화면이 보이는 중 (관전 포함)
  if (!MP.code || !MP.room || MP.room.status === 'closed') return false;
  const ov = $('#mpOv'); if (ov && !ov.hidden) return true;
  return typeof BMV !== 'undefined' && BMV.mp && bmOpenNow();
}
function mpChatOn(){   // 관전자도 칠 수 있다
  if (!MP.code || !MP.room || MP.room.status === 'closed' || !ACC.user) return false;
  const ov = $('#mpOv'); if (ov && !ov.hidden) return true;
  return typeof BMV !== 'undefined' && BMV.mp && bmOpenNow();
}
function mpChatSync(){
  const on = mpChatOn();
  let bar = $('#mpChat');
  if (on && !bar){
    bar = document.createElement('form'); bar.id = 'mpChat'; bar.className = 'mpc-bar'; bar.autocomplete = 'off';
    bar.innerHTML = `<input id="mpChatIn" type="text" maxlength="${MPC_MAX}" enterkeyhint="send" placeholder="채팅 (${MPC_MAX}자까지)" aria-label="채팅"><button class="btn solid" type="submit">보내기</button>`;
    bar.addEventListener('submit', e => { e.preventDefault(); mpChatSend(); const i = $('#mpChatIn'); if (i) i.blur(); });   // 키보드의 엔터(파란 화살표)로 보내도 키보드를 내린다
    document.body.appendChild(bar);
  }
  if (bar) bar.hidden = !on;
  document.documentElement.classList.toggle('mpc-on', on);
  if (!mpChatView() && MPC.bub.length){ MPC.bub = []; mpBubDraw(); }
  mpLogDraw();
}
setInterval(mpChatSync, 300);
function mpChatSend(){
  const inp = $('#mpChatIn'); if (!inp) return;
  const text = inp.value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MPC_MAX);
  if (!text || !MP.code || !MP.room) return;
  if (Date.now() - MPC.last < 700) return toast('조금 천천히 보내세요', true);
  MPC.last = Date.now(); inp.value = '';
  const me = mpMe(), msg = {id:Date.now().toString(36) + Math.random().toString(36).slice(2, 7), code:MP.code, seat:me, nick:me >= 0 ? MP.room.state.seats[me].nick : mpNick(), text, spec:me < 0};
  mpChatGot(msg);   // 내 말풍선은 바로
  if (MPW.ok && MPW.ws && MPW.ws.readyState === 1) try { MPW.ws.send(JSON.stringify({t:'chat', code:msg.code, id:msg.id, text, nick:msg.nick})); } catch(e){}
  try { MP.ch && MP.ch.send({type:'broadcast', event:'chat', payload:msg}); } catch(e){}
}
function mpChatGot(m){
  if (!m || typeof m.text !== 'string' || !m.id || MPC.seen.has(m.id)) return;
  MPC.seen.add(m.id); if (MPC.seen.size > 300) MPC.seen = new Set([...MPC.seen].slice(-150));
  const R = MP.room; if (!R) return;
  let seat = +m.seat;
  // 웹소켓 길은 서버가 자리를 정해 준다. 방송 길은 보낸 사람이 적은 자리라, 이름이 그 자리와 맞을 때만 그 자리로
  if (!(seat >= 0 && R.state.seats[seat] && (m.v || R.state.seats[seat].nick === m.nick))) seat = -1;
  MPC.bub = MPC.bub.filter(b => !(seat >= 0 && b.seat === seat));   // 같은 사람의 앞 말풍선은 바꾼다
  MPC.bub.push({id:m.id, seat, nick:(seat < 0 ? '👀 ' : '') + String(m.nick || '?').slice(0, 12), text:m.text.slice(0, MPC_MAX), until:Date.now() + MPC_MS});   // 관전자 말은 입력칸 위에 '👀 이름'으로
  if (MPC.bub.length > 8) MPC.bub.shift();
  MPC.log.push({id:m.id, nick:String(m.nick || '?').slice(0, 12), spec:seat < 0, me:ACC.user && m.seat >= 0 && R.state.seats[m.seat] && R.state.seats[m.seat].uid === ACC.user.id, text:m.text.slice(0, MPC_MAX), at:Date.now()});
  if (MPC.log.length > 30) MPC.log.shift();
  mpLogDraw();
  mpBubDraw();
}
// 말풍선을 붙일 이름 자리: 대기실·홀짝·블랙잭은 data-seatnm, 부루마블은 말 이름표(3D) 또는 패널, 벅샷은 이름
function mpSeatEl(i){
  const vis = el => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight ? el : null; };
  return vis(document.querySelector(`#mpOv [data-seatnm="${i}"]`)) || vis(document.querySelector(`#bmOv .bm-tag[data-tag="${i}"]`))
    || vis(document.querySelector(`#bmOv .bm-pl[data-pl="${i}"]`)) || vis(document.querySelector(`#mpOv .bs3-tag[data-tagi="${i}"]:not([hidden])`)) || vis(document.querySelector(`#mpOv .bs-p[data-bsi="${i}"] .bs-pn`))
    || vis(document.querySelector(`#mpOv .bs-p[data-bsi="${i}"]`));
}
function mpBubDraw(){
  cancelAnimationFrame(MPC.raf);
  const now = Date.now(); MPC.bub = MPC.bub.filter(b => b.until > now);
  let lay = $('#mpBubs');
  if (!MPC.bub.length){ if (lay) lay.innerHTML = ''; return; }
  if (!lay){ lay = document.createElement('div'); lay.id = 'mpBubs'; lay.setAttribute('aria-live', 'polite'); document.body.appendChild(lay); }
  // 이미 있는 말풍선은 위치만 바꾼다 (깜빡이지 않게)
  const have = new Map([...lay.children].map(el => [el.dataset.id, el]));
  const bar = $('#mpChat'), barTop = bar && !bar.hidden ? bar.getBoundingClientRect().top : innerHeight;
  let stack = 0; const placed = [];
  for (const b of MPC.bub){
    let el = have.get(b.id); have.delete(b.id);
    if (!el){ el = document.createElement('div'); el.className = 'mpc-bub'; el.dataset.id = b.id; el.innerHTML = `<b></b><span></span>`; el.querySelector('span').textContent = b.text; lay.appendChild(el); }
    const a = b.seat >= 0 ? mpSeatEl(b.seat) : null;
    el.querySelector('b').textContent = a ? '' : b.nick;
    el.classList.toggle('free', !a);
    if (a){
      const r = a.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
      const x = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2));
      const up = r.top - h - 8 > 4;   // 위에 자리가 없으면 아래로
      let y = up ? r.top - h - 8 : r.bottom + 8;
      for (let k = 0; k < 6 && placed.some(p => x < p.x + p.w && p.x < x + w && y < p.y + p.h + 4 && p.y < y + h + 4); k++) y += up ? -(h + 4) : h + 4;   // 이름이 겹치면(말이 같은 칸) 말풍선을 쌓는다
      placed.push({x, y, w, h});
      el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
      el.classList.toggle('dn', !up);
      el.style.setProperty('--tx', `${Math.round(Math.max(10, Math.min(w - 10, r.left + r.width / 2 - x)))}px`);
    } else { el.style.opacity = '0'; continue; }   // 이름이 화면에 없으면(관전자 등) 말풍선 없이 오른쪽 채팅 목록에만
    el.style.opacity = b.until - now < 400 ? String(Math.max(0, (b.until - now) / 400)) : '1';
  }
  have.forEach(el => el.remove());
  MPC.raf = requestAnimationFrame(mpBubDraw);
}

/* ── 판돈을 낸 뒤 답을 못 받은 요청 (방 만들기·참가·한 판 더) ──
   판돈은 요청을 보내기 전에 이 기기 통장에서 뺀다. 답이 늦거나(시간 초과) 그사이 창을 닫으면 돈이 어디로 갔는지 모르게 되므로
   여기 적어 두고, 90초가 지나면 그 방에 내 자리가 있는지 본다: 있으면 판돈은 방에 들어간 것, 없으면 돌려준다.
   심판은 60초가 넘게 늦게 도착한 방 만들기·참가 요청을 처리하지 않으므로, 돌려준 뒤에 방이 생기는 일은 없다 */
const mpPendKey = () => ACC.user ? `seed10k.mppend.${ACC.user.id}` : null;
function mpPends(){ try { return JSON.parse(localStorage.getItem(mpPendKey()) || '[]') || []; } catch(e){ return []; } }
function mpPendSave(a){ try { a.length ? localStorage.setItem(mpPendKey(), JSON.stringify(a)) : localStorage.removeItem(mpPendKey()); } catch(e){} }
function mpPendAdd(code, stake){
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  mpPendSave([...mpPends(), {id, code, stake:+stake, mode:S.mode, at:Date.now()}]);
  return id;
}
function mpPendDone(id){ mpPendSave(mpPends().filter(p => p.id !== id)); }
function mpPendSeated(code){ const a = mpPends(); if (a.some(p => p.code === code)) mpPendSave(a.filter(p => p.code !== code)); }
async function mpPendCheck(){
  if (!ACC.sb || !ACC.user || MP.pendBusy) return;
  const due = mpPends().filter(p => p.mode === S.mode && Date.now() - p.at > 90000);
  if (!due.length) return;
  MP.pendBusy = true;
  try {
    for (const p of due){
      const {data:room, error} = await ACC.sb.from('seed10k_rooms').select('code,status,state').eq('code', p.code).maybeSingle();
      if (error) continue;   // 확인하지 못하면 다음에 다시
      if (!mpPends().some(x => x.id === p.id)) continue;
      if (room && room.state && (room.state.seats || []).some(s => s.uid === ACC.user.id)){   // 방에 들어가 있다 → '이어가기'로 찾을 수 있게
        mpPendDone(p.id);
        if (room.status !== 'closed' && !MP.code){ try { localStorage.setItem(mpKey(), p.code); } catch(e){} toast(`👥 방 ${p.code}에 들어가 있습니다. 도박 탭의 '이어가기'로 돌아갈 수 있습니다`); if ($('#mpCard')) $('#mpCard').innerHTML = mpCardHTML(); }
        continue;
      }
      try { if (localStorage.getItem(mpKey()) === p.code) localStorage.removeItem(mpKey()); } catch(e){}
      mpPendDone(p.id); receiveUSD(p.stake); commit();
      toast(`👥 방 ${p.code}: 서버가 처리하지 못한 판돈 ${fmtUSD(p.stake)}을 돌려받았습니다`);
    }
  } finally { MP.pendBusy = false; }
}
setInterval(() => { if (!document.hidden) mpPendCheck(); }, 20000);

/* ── 관전 ──
   진행 중인 방 목록에서 골라 자리 없이 방을 본다. 방 상태(seed10k_rooms)는 원래 누구나 읽을 수 있는 값만 담고, 숨긴 값(손에 쥔 구슬·탄 순서 등)은 심판만 안다 */
async function mpWatchList(){
  if (!ACC.user) return toast('로그인해야 합니다', true);
  const c = showModal(`<h2>👀 관전할 방</h2><div id="mpWatchL"><p class="muted">불러오는 중…</p></div><div class="acts"><button class="btn" data-close>닫기</button></div>`);
  const {data, error} = await ACC.sb.from('seed10k_rooms').select('code,game,mode,stake,il,status,state,updated_at').eq('status', 'play').order('updated_at', {ascending:false}).limit(30);
  const box = $('#mpWatchL'); if (!box) return;
  if (error){ box.innerHTML = `<p class="down">불러오지 못했습니다: ${esc(errText(error))}</p>`; return; }
  const fresh = (data || []).filter(r => Date.now() - Date.parse(r.updated_at) < 30 * 60000 && MP_GAMES[r.game]);   // 30분 넘게 멈춘 방은 뺀다
  box.innerHTML = fresh.length ? `<div class="mp-watch">${fresh.map(r => { const g = MP_GAMES[r.game];
      return `<button class="btn mp-g" data-mpwatch="${esc(r.code)}"><b>${g.ic} ${g.nm} <small class="muted">${r.mode === 'live' ? '실제 시세' : '시뮬'}${r.il ? ' · 🚨' : ''}</small></b><small>${r.state.seats.map(x => esc(x.nick)).join(' · ')} · 판돈 ${fmtUSD(r.stake)}</small></button>`; }).join('')}</div>`
    : '<p class="empty">지금 진행 중인 방이 없습니다.</p>';
  box.querySelectorAll('[data-mpwatch]').forEach(b => b.onclick = () => {
    const code = b.dataset.mpwatch; c();
    if (MP.code && MP.code !== code && !MP.spec) return toast('들어가 있는 방이 있어서 관전할 수 없습니다. 먼저 그 방에서 나가세요', true);
    mpEnter(code, true);
  });
}
// 홀짝 관전: 두 사람 이름으로 (나/상대 대신)
function moeSpecHTML(R){
  const st = R.state, g = st.g || {}, seats = st.seats, nm = i => esc(seats[i] ? seats[i].nick : '?');
  const show = MP.view.oeShow && MP.view.oeShow.seq <= st.seq ? MP.view.oeShow : null, over = R.status === 'over';
  const sc = `<div class="oe-score"><span><b data-seatnm="0">${nm(0)}</b> <b class="num">${g.score ? g.score[0] : 0}</b></span><span class="muted">${over ? '끝' : `${g.round || 1}판 · 3점 먼저`}</span><span><b class="num">${g.score ? g.score[1] : 0}</b> <b data-seatnm="1">${nm(1)}</b></span></div>`;
  let hand = `<div class="oe-hand"><span class="fist">✊</span></div>`, msg;
  if (show){
    hand = `<div class="oe-hand open"><div class="oe-marbles">${Array.from({length:show.n}, (_, k) => `<i style="--d:${k * 25}ms"></i>`).join('')}</div><b class="num">${show.n}개 · ${show.n % 2 ? '홀' : '짝'}</b></div>`;
    msg = `<p class="oe-res">${nm(show.guesser)}이(가) ${show.pick === 'odd' ? '홀' : '짝'}을 골라 ${show.ok ? '맞혔다' : '틀렸다'} · ${nm(show.pt)} 1점</p>`;
  } else if (over){ hand = `<div class="oe-hand"><span class="fist">🏆</span></div>`; msg = `<p class="oe-res">${nm(g.win)} 승리 (${g.score ? g.score[g.win] + ':' + g.score[1 - g.win] : ''}${g.why && g.why !== '3점 먼저' ? ', ' + esc(g.why) : ''})</p>`; }
  else if (g.phase === 'hide') msg = `<p class="oe-res muted">${nm(g.hider)}이(가) 구슬을 쥐는 중… <span id="mpTimer"></span></p>`;
  else msg = `<p class="oe-res muted">${nm(1 - g.hider)}이(가) 홀짝을 고르는 중… <span id="mpTimer"></span></p>`;
  return `<div class="card-h"><h2>✊ 홀짝 대결</h2><small>판돈 ${fmtUSD(R.stake)}${R.il ? ' · 🚨 불법' : ''}</small></div>${sc}${hand}${msg}<div class="bm-acts"></div>`;
}

// 관전자 목록: 방 채널에 접속해 있는데 자리가 없는 사람 (나 빼고)
function mpWatchSync(ch){
  const st = ch.presenceState() || {}, R = MP.room, seated = new Set(R ? R.state.seats.map(x => x.uid) : []);
  const me = ACC.user ? ACC.user.id : '';
  const list = Object.values(st).map(a => a[a.length - 1]).filter(p => p && p.uid && p.uid !== me && !seated.has(p.uid));
  const k = list.map(p => p.uid).join(',');
  if (k === (MP.watchK || '')) return;
  const before = new Set((MP.watch || []).map(p => p.uid));
  MP.watch = list; MP.watchK = k;
  const fresh = list.filter(p => !before.has(p.uid));
  if (fresh.length && mpMe() >= 0) toast(`👀 ${fresh.map(p => p.nick).join(', ')}님이 관전을 시작했습니다`);
  mpWatchShow();
}
function mpWatchTxt(){ const w = MP.watch || []; return w.length ? ` · 👀 관전 ${w.length}명: ${w.slice(0, 3).map(p => p.nick).join(', ')}${w.length > 3 ? ' 외' : ''}` : ''; }
function mpWatchShow(){   // 방 화면 제목 줄만 고친다 (판을 다시 그리지 않게)
  const sm = document.querySelector('#mpOv:not([hidden]) .bm-ttl small');
  if (sm) sm.textContent = `${mpSpec() ? '👀 관전 중 · ' : ''}방 ${MP.code || ''} · 달러 통장 ${fmtUSD(S.usd)}${mpWatchTxt()}`;
  if (typeof BMV !== 'undefined' && BMV.mp && bmOpenNow()) bmUpdate();
}

// 화면 오른쪽 채팅 목록: 최근 6줄, 20초 지나면 흐려져 사라진다 (말풍선과 함께 보인다)
const MPC_LOG_MS = 20000;
function mpLogDraw(){
  let box = $('#mpChatLog');
  const on = mpChatView(), now = Date.now(), rows = on ? MPC.log.filter(x => now - x.at < MPC_LOG_MS).slice(-6) : [];
  if (!rows.length){ if (box) box.hidden = true; return; }
  if (!box){ box = document.createElement('div'); box.id = 'mpChatLog'; box.className = 'mpc-log'; document.body.appendChild(box); }
  box.hidden = false;
  const k = rows.map(x => x.id + (now - x.at > MPC_LOG_MS - 3000 ? 'f' : '')).join(',');
  if (box._k === k) return; box._k = k;
  box.innerHTML = rows.map(x => `<div class="mpc-l ${now - x.at > MPC_LOG_MS - 3000 ? 'fade' : ''} ${x.me ? 'me' : ''}"><b>${x.spec ? '👀 ' : ''}${esc(x.nick)}</b> ${esc(x.text)}</div>`).join('');
}
setInterval(mpLogDraw, 1000);

// 판돈 장부 열쇠: 방 코드 + 서버가 적은 시작 번호 ('판돈 냄 #3'). 번호가 없는 예전 줄은 장부에 넣지 않는다
function mpBetKey(code, note){ const m = /#(\d+)/.exec(note || ''); return code && m ? `mp:${code}:${m[1]}` : null; }
// 같이 하기 판이 시작하고 3초 뒤: 서버가 낸 '판돈 냄' 줄을 받았는지 보고, 장부에 이 판 줄이 정확히 하나인지 맞춘다
async function mpBetAudit(room, bk){
  if (!ACC.user || !ACC.sb) return;
  const nm = (MP_GAMES[room.game] || {}).nm || '같이 하기', n = room.state.startN;
  if (room.mode !== S.mode) return;   // 다른 모드 판은 그 모드 통장에서
  await mpClaim();
  if (betHas(bk)) return betAudit(bk, room.stake, nm);   // 1줄이면 그대로, 2줄 이상이면 남는 만큼 돌려준다
  // 장부에 없다: 서버 줄을 찾아본다
  const {data, error} = await ACC.sb.from('seed10k_payouts').select('id,amount,claimed_at,note').eq('user_id', ACC.user.id).eq('code', room.code).lt('amount', 0).like('note', `%#${n}`).limit(5);
  if (error) return;   // 확인하지 못하면 다음 받기 때 (서버 줄이 있으면 그때 빠진다)
  const row = (data || [])[0];
  if (row && !row.claimed_at){ await mpClaim(); if (betHas(bk)) return; }
  if (row && row.claimed_at) return;   // 다른 기기(탭)가 이미 받아 그쪽 통장에서 빠졌다
  betAudit(bk, room.stake, nm);   // 서버가 줄을 안 만들었다 → 지금 청구 (나중에 줄이 생겨도 장부에 있으니 두 번 빼지 않는다)
}
