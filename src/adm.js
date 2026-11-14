/* ───────── 관리 탭 (관리자 계정에만 보인다) ─────────
   관리자 여부는 Supabase의 seed10k_admins 표가 정한다 (사이트 코드에 이메일을 넣지 않는다).
   다른 계정의 기록을 읽는 권한도 데이터베이스 정책(seed10k_is_admin)이 막고 연다. 화면을 고쳐도 일반 계정은 읽을 수 없다.
   - 부정행위 의심 알림: 심판(라즈베리파이)이 판이 끝날 때 확인해 seed10k_alerts에 적는다
   - 유저 검색 → 최근 기록: 저장 기록(주식·기타·환전 내역), 멀티 판 결과, 받은 돈(멀티 누적 순획득), 부루마블 기록
   - 멀티플레이 제한/해제, 멀티로 딴 돈 회수 SQL 만들기 (남의 저장 기록은 사이트에서 고치지 않고 SQL 편집기에서 고친다) */
const ADM = {on:false, alerts:[], unseen:0, q:'', users:null, uid:null, mode:null, data:null, ch:null};
const admT = at => at ? new Date(at).toLocaleString('ko-KR', {timeZone:'Asia/Seoul', year:'2-digit', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false}) : '';
const admUSD = v => `${v < 0 ? MINUS : ''}${fmtUSD(Math.abs(v))}`;
const admR2 = v => Math.round(v * 100) / 100;

async function admCheck(){
  const was = ADM.on;
  ADM.on = false; ADM.alerts = []; ADM.unseen = 0; ADM.uid = null; ADM.data = null; ADM.users = null;
  if (ADM.ch){ try { ACC.sb.removeChannel(ADM.ch); } catch(e){} ADM.ch = null; }
  if (ACC.user && ACC.sb){
    try { const {data} = await ACC.sb.from('seed10k_admins').select('user_id').eq('user_id', ACC.user.id).maybeSingle(); ADM.on = !!data; } catch(e){}
  }
  $$('[data-tab="admin"]').forEach(b => b.hidden = !ADM.on);
  $('.tabbar').classList.toggle('adm', ADM.on);
  if (!ADM.on){ if (UI.tab === 'admin') go('home'); return; }
  try {
    ADM.ch = ACC.sb.channel('adm-alerts').on('postgres_changes', {event:'INSERT', schema:'public', table:'seed10k_alerts'}, p => {
      if (!p.new) return;
      ADM.alerts.unshift(p.new); ADM.unseen++; admBadge();
      toast(`🚨 부정행위 의심: ${p.new.msg}`, true);
      if (UI.tab === 'admin') renderAdmin();
    }).subscribe();
  } catch(e){}
  await admLoadAlerts();
  if (!was && ADM.unseen) toast(`🚨 확인하지 않은 부정행위 의심 알림 ${ADM.unseen}건`, true);
}
async function admLoadAlerts(){
  const {data, error} = await ACC.sb.from('seed10k_alerts').select('*').order('id', {ascending:false}).limit(100);
  if (!error){ ADM.alerts = data || []; ADM.unseen = ADM.alerts.filter(a => !a.seen).length; }
  admBadge();
  if (UI.tab === 'admin') renderAdmin();
}
function admBadge(){ $$('[data-tab="admin"]').forEach(b => b.classList.toggle('warn', ADM.unseen > 0)); }

function renderAdmin(){
  const v = $('#v-admin'); if (!v) return;
  if (!ADM.on){ v.innerHTML = '<p class="empty">관리자만 볼 수 있습니다.</p>'; return; }
  const al = ADM.alerts.slice(0, 50).map(a => `<li class="adm-al ${a.seen ? 'seen' : ''}"><div><small class="muted">${admT(a.at)} · ${esc(({oe_streak:'홀짝 연승', bj_stand:'블랙잭 계속 스탠드', bm_nobuy:'부루마블 땅 안 사기'})[a.kind] || a.kind)} · ${a.mode === 'live' ? '실제 시세' : '시뮬'}</small><p>${esc(a.msg)}</p></div>
      <div class="adm-al-b">${a.uid ? `<button class="btn" data-admu="${a.uid}">이긴/의심 쪽</button>` : ''}${a.other ? `<button class="btn" data-admu="${a.other}">상대</button>` : ''}${a.seen ? '' : `<button class="btn" data-admseen="${a.id}">확인함</button>`}</div></li>`).join('');
  const us = ADM.users === null ? '' : ADM.users.length ? `<ul class="adm-us">${ADM.users.map(u => { const bn = ADM.bans && ADM.bans.get(u.user_id);
      return `<li class="adm-ur"><button class="adm-u ${u.user_id === ADM.uid ? 'on' : ''}" data-admu="${u.user_id}"><b>${esc(u.nickname || '(닉네임 없음)')}${bn ? ' <span class="adm-bn">🚫 랭킹 밴</span>' : ''}</b><small>${esc(u.email || '')}</small><small class="muted">가입 ${admT(u.joined)}${u.last_save ? ` · 마지막 저장 ${admT(u.last_save)}` : ''}${bn && bn.reason ? ` · 사유: ${esc(bn.reason)}` : ''}</small></button>${bn ? `<button class="btn" data-admrkunban="${u.user_id}">밴 풀기</button>` : `<button class="btn" data-admrkban="${u.user_id}" data-nick="${esc(u.nickname || u.email || '')}">밴</button>`}</li>`; }).join('')}</ul>` : '<p class="empty">찾은 계정이 없습니다.</p>';
  v.innerHTML = `<div class="stack">
    <section class="card"><div class="card-h"><h2>🚨 부정행위 의심 알림</h2><small>${ADM.unseen ? `<b class="down">확인 안 함 ${ADM.unseen}건</b>` : '모두 확인함'}</small></div>
      <p class="muted" style="margin:0 0 8px">게임 서버가 판이 끝날 때 확인해 적습니다. 홀짝 대결: 같은 상대에게 ${WATCH_ADM.oe}연승(이후 5판마다). 블랙잭 대결: 버스트할 수 없는 11 이하에서 직접 스탠드한 판이 ${WATCH_ADM.bj}판 연속. 부루마블: 돈이 있는데 직접 '안 산다'를 고른 것이 한 판에 ${WATCH_ADM.bm}번(이후 5번마다).</p>
      ${al ? `<ul class="adm-als">${al}</ul>` : '<p class="empty">알림이 없습니다.</p>'}
      ${ADM.unseen ? '<div class="mg-foot"><button class="btn" id="admSeenAll">모두 확인함</button></div>' : ''}</section>
    <section class="card" id="admSrv">${admSrvHTML()}</section>
    <section class="card"><div class="card-h"><h2>🔎 유저 검색</h2><small>이메일이나 닉네임 일부</small></div>
      <form id="admQF" class="adm-q"><label class="amt"><input id="admQ" type="search" autocomplete="off" placeholder="비우고 검색하면 최근 저장 순 40명" value="${esc(ADM.q)}"></label><button class="btn solid" type="submit">검색</button></form>
      ${us}</section>
    <section class="card" id="admUser"${ADM.uid ? '' : ' hidden'}>${ADM.uid ? admUserHTML() : ''}</section>
  </div>`;
}
const WATCH_ADM = {oe:5, bj:5, bm:5};
/* ── 게임 서버(라즈베리파이) 상태와 '서버 업데이트' 버튼 ──
   버튼은 seed10k_admin_cmds에 요청 한 줄을 넣는다. 파이의 pi/update.py(cron 1분마다)가 git pull + 심판 재시작을 하고 결과를 적는다.
   파이는 새 커밋이 있으면 버튼 없이도 1분 안에 알아서 받는다 */
ADM.srv = null; ADM.cmds = null;
async function admSrvLoad(){
  const [h, c] = await Promise.all([
    ACC.sb.from('seed10k_rooms').select('state,updated_at').eq('code', '__ref').maybeSingle(),
    ACC.sb.from('seed10k_admin_cmds').select('*').order('id', {ascending:false}).limit(5),
  ]);
  ADM.srv = h.data ? h.data.state : null; ADM.cmds = c.error ? {err:c.error.message} : c.data || []; ADM.srvAt = Date.now();
  const el = $('#admSrv'); if (el) el.innerHTML = admSrvHTML();
  clearTimeout(ADM.srvT);
  // 관리 탭이 열려 있는 동안 계속 새로 읽는다 (요청 처리 중이면 5초, 평소 15초). 예전에는 처음 한 번만 읽어서, 탭을 다시 열면 오래된 신호로 '꺼짐'이 떴다
  if (UI.tab === 'admin') ADM.srvT = setTimeout(admSrvLoad, Array.isArray(ADM.cmds) && ADM.cmds.some(x => !x.done) ? 5000 : 15000);
}
function admSrvHTML(){
  if (ADM.cmds !== null && Date.now() - (ADM.srvAt || 0) > 10000){ clearTimeout(ADM.srvT); ADM.srvT = setTimeout(admSrvLoad, 0); }   // 읽은 지 오래됐으면 바로 다시 읽는다
  if (ADM.cmds === null){ setTimeout(admSrvLoad, 0); return '<div class="card-h"><h2>🖥️ 게임 서버</h2></div><p class="muted">불러오는 중…</p>'; }
  const s = ADM.srv, age = s && s.at ? Math.round((Date.now() - s.at) / 1000) : null, alive = age !== null && age < 40;
  const pend = Array.isArray(ADM.cmds) && ADM.cmds.some(x => !x.done);
  const rows = Array.isArray(ADM.cmds) ? ADM.cmds.map(x => `<li><small class="muted">${admT(x.at)}</small> ${x.done ? (x.ok ? '✅' : '⚠️') + ' ' + esc(x.result || '') : '⏳ 파이가 처리하기를 기다리는 중 (1분 안)'}</li>`).join('') : '';
  return `<div class="card-h"><h2>🖥️ 게임 서버</h2><small>${alive ? '<b class="srv-on">● 켜짐</b>' : '<b class="srv-off">● 꺼짐</b>'}</small></div>
    <p class="muted" style="margin:0 0 8px">${s ? `마지막 신호 ${age}초 전 · 진행 중인 방 ${s.rooms || 0}개${s.ver ? ` · 코드 ${esc(s.ver)}` : ''}${s.started ? ` · ${admT(s.started)}에 켜짐` : ''}` : '신호 없음'}</p>
    ${s ? `<p style="margin:0 0 8px">직통 연결(웹소켓): ${s.ws ? `<b class="srv-on">● 켜짐</b> <small class="muted">접속 ${s.socks || 0}개</small>` : '<b class="srv-off">● 꺼짐</b> <small class="muted">Supabase를 거쳐 처리 중 (느림)</small>'}</p>` : ''}
    ${ADM.cmds && ADM.cmds.err ? `<p class="down">버튼을 쓰려면 SQL(supabase/seed10k_admin_cmds.sql)을 먼저 실행하세요 (${esc(ADM.cmds.err)})</p>` : ''}
    ${rows ? `<ul class="adm-cmds">${rows}</ul>` : ''}
    <div class="mg-foot"><span class="muted">새 커밋이 있으면 파이가 1분 안에 알아서 받습니다</span><button class="btn solid" id="admUpd" ${pend || (ADM.cmds && ADM.cmds.err) ? 'disabled' : ''}>서버 업데이트</button></div>`;
}

async function admSearch(q){
  ADM.q = q;
  const [{data, error}, b] = await Promise.all([ACC.sb.rpc('seed10k_admin_users', {q}), ACC.sb.from('seed10k_rank_bans').select('user_id,reason,at')]);
  if (error){ toast(`검색하지 못했습니다: ${error.message}`, true); return; }
  ADM.bans = new Map((b.data || []).map(x => [x.user_id, x]));
  ADM.users = data || []; renderAdmin();
}
async function admOpenUser(uid){
  ADM.uid = uid; ADM.data = null; renderAdmin();
  const sb = ACC.sb;
  const [sv, pay, res, bml, ban, tst, who, rb] = await Promise.all([
    sb.from('seed10k_saves').select('mode,data,updated_at').eq('user_id', uid),
    sb.from('seed10k_payouts').select('id,at,code,game,mode,amount,cost,il,note,claimed_at').eq('user_id', uid).order('id', {ascending:false}).limit(2000),
    sb.from('seed10k_mp_results').select('*').contains('uids', [uid]).order('id', {ascending:false}).limit(30),
    sb.from('seed10k_bmlog').select('at,mode,n,stake,pay,rank,forfeit,il,rounds').eq('user_id', uid).order('at', {ascending:false}).limit(10),
    sb.from('seed10k_mp_bans').select('*').eq('user_id', uid).maybeSingle(),
    sb.from('seed10k_testers').select('user_id').eq('user_id', uid).maybeSingle(),
    ADM.users && ADM.users.find(u => u.user_id === uid) ? Promise.resolve({data:[ADM.users.find(u => u.user_id === uid)]}) : sb.rpc('seed10k_admin_users', {q:''}).then(r => ({data:(r.data || []).filter(u => u.user_id === uid)})),
    sb.from('seed10k_rank_bans').select('*').eq('user_id', uid).maybeSingle(),
  ]);
  if (ADM.uid !== uid) return;
  const saves = sv.data || [];
  ADM.data = {saves, pays:pay.data || [], res:res.data || [], bm:bml.data || [], ban:ban.data || null, tester:!!(tst && tst.data), rban:(rb && rb.data) || null, who:(who.data || [])[0] || null, err:[sv, pay, res, bml].map(r => r.error && r.error.message).filter(Boolean)};
  if (!ADM.mode || !saves.some(s => s.mode === ADM.mode)) ADM.mode = (saves.find(s => s.mode === S.mode) || saves[0] || {}).mode || S.mode;
  renderAdmin();
  const el = $('#admUser'); if (el) el.scrollIntoView({block:'start', behavior:'smooth'});
}
// 멀티 누적 순획득 = 받은 돈 - 낸 판돈 (환불은 둘이 같아 0). 받음 표시된 것만 실제로 통장에 들어간 돈
function admMpNet(pays, mode){
  const ps = pays.filter(p => p.mode === mode && p.claimed_at);
  const net = admR2(ps.reduce((a, p) => a + (+p.amount || 0) - (+p.cost || 0), 0));
  const games = ps.filter(p => !/환불/.test(p.note || '')), wins = games.filter(p => (+p.amount || 0) > (+p.cost || 0));
  return {net, n:games.length, w:wins.length, pending:pays.filter(p => p.mode === mode && !p.claimed_at).length};
}
function admUserHTML(){
  const D = ADM.data;
  if (!D) return '<p class="muted">불러오는 중…</p>';
  const u = D.who || {}, mode = ADM.mode, sv = D.saves.find(s => s.mode === mode), d = sv ? sv.data : null;
  const seg = (v, l) => `<button data-admmode="${v}" aria-pressed="${mode === v}">${l}</button>`;
  const M = admMpNet(D.pays, mode);
  const nm = id => (BY_ID[id] && BY_ID[id].n) || id;
  const money = (v, cur) => cur === 'KRW' ? fmtKRW(v) : fmtUSD(v);
  const trades = d && (d.trades || []).slice(0, 20).map(t => `<tr><td>${esc(String(t.dt || ''))}${t.at ? `<br><span class="muted">${admT(t.at)}</span>` : ''}</td><td><span class="side ${t.side === 'buy' ? 'up' : 'down'}">${t.side === 'buy' ? '매수' : '매도'}</span></td><td>${esc(nm(t.id))}<br><span class="muted">${(+t.q || 0).toLocaleString()}주</span></td><td class="r num">${t.amt !== undefined ? money(+t.amt, t.cur) : fmtUSD(+t.usd || 0)}</td></tr>`).join('');
  const alt = d && (d.altLog || []).slice(0, 30).map(x => `<tr><td>${esc(x.dt || '')}<br><span class="muted">${admT(x.at)}</span></td><td>${esc(x.s)}</td><td class="r num ${x.amt > 0 ? 'up' : ''}">${x.amt > 0 ? '+' : x.amt < 0 ? MINUS : ''}${money(Math.abs(x.amt), x.cur)}</td></tr>`).join('');
  const fx = d && (d.fxLog || []).slice(0, 10).map(x => `<tr><td>${esc(String(x.dt || ''))}</td><td>${x.dir === 'u2k' ? '달러 → 원화' : '원화 → 달러'}</td><td class="r num">${x.dir === 'u2k' ? fmtUSD(+x.from) : fmtKRW(+x.from)}</td></tr>`).join('');
  const res = D.res.filter(r => r.mode === mode).map(r => {
    const me = r.uids.indexOf(ADM.uid), others = (r.seats || []).filter(s => s.uid !== ADM.uid).map(s => esc(s.nick)).join(', ');
    return `<tr><td>${admT(r.at)}</td><td>${esc((MP_GAMES[r.game] || {}).nm || r.game)}<br><span class="muted">vs ${others}</span></td><td>${r.win === me ? '<b class="up">승</b>' : r.win === null ? '-' : '패'}${r.why ? `<br><span class="muted">${esc(r.why)}</span>` : ''}</td><td class="r num">${fmtUSD(+r.stake)}${r.il ? '<br><span class="muted">불법</span>' : ''}</td></tr>`;
  }).join('');
  const pays = D.pays.filter(p => p.mode === mode).slice(0, 20).map(p => `<tr><td>${admT(p.at)}</td><td>${esc(p.note || p.game || '')}</td><td class="r num ${(+p.amount - +p.cost) > 0 ? 'up' : ''}">${admUSD(admR2(+p.amount - +p.cost))}<br><span class="muted">${p.claimed_at ? '받음' : '아직 안 받음'}</span></td></tr>`).join('');
  const bm = D.bm.filter(b => b.mode === mode).map(b => `<tr><td>${admT(b.at)}</td><td>${b.n}명 · ${b.rank}위${b.forfeit ? ' (기권)' : ''}${b.il ? ' · 불법' : ''}</td><td class="r num">${admUSD(admR2(+b.pay - +b.stake))}</td></tr>`).join('');
  const tbl = (h, rows, empty) => rows ? `<table class="trades"><thead><tr>${h}</tr></thead><tbody>${rows}</tbody></table>` : `<p class="empty">${empty}</p>`;
  const G = d && d.gam || {};
  return `<div class="card-h"><h2>👤 ${esc(u.nickname || '(닉네임 없음)')}</h2><small>${esc(u.email || '')}</small></div>
    <p class="muted" style="margin:0 0 8px">계정 id ${esc(ADM.uid)}${u.joined ? ` · 가입 ${admT(u.joined)}` : ''}</p>
    ${D.err.length ? `<p class="down">일부를 불러오지 못했습니다: ${esc(D.err.join(' / '))}</p>` : ''}
    <div class="adm-ban ${D.ban ? 'on' : ''}">${D.ban ? `<b>🚫 멀티플레이 제한됨</b> <small class="muted">${admT(D.ban.at)}${D.ban.reason ? ' · ' + esc(D.ban.reason) : ''}</small><button class="btn" id="admUnban">제한 풀기</button>` : `<span>멀티플레이 가능</span><button class="btn" id="admBan">멀티플레이 제한</button>`}</div>
    <div class="adm-ban ${D.rban ? 'on' : ''}">${D.rban ? `<b>🚫 랭킹 밴</b> <small class="muted">${admT(D.rban.at)}${D.rban.reason ? ' · ' + esc(D.rban.reason) : ''}</small><button class="btn" id="admRankUnban">밴 풀기</button>` : `<span>랭킹 참여 중</span><button class="btn" id="admRankBan">랭킹 밴</button>`}</div>
    <div class="adm-ban ${D.tester ? 'on' : ''}">${D.tester ? '<b>🧪 테스트 계정</b> <small class="muted">돈이 줄지 않음 · 랭킹 제외 · 멀티 불가</small><button class="btn" id="admUntest">해제</button>' : '<span>일반 계정</span><button class="btn" id="admTest">테스트 계정으로</button>'}</div>
    <div class="mv-tools"><div class="seg">${seg('sim', '시뮬레이션')}${seg('live', '실제 시세')}</div></div>
    <dl class="kv adm-kv">
      <div><dt>멀티 누적 순획득</dt><dd class="num ${M.net > 0 ? 'up' : M.net < 0 ? 'down' : ''}">${admUSD(M.net)}</dd></div>
      <div><dt>멀티 판 수</dt><dd class="num">${M.n}판 · ${M.w}승${M.pending ? ` · 안 받은 것 ${M.pending}건` : ''}</dd></div>
      ${d ? `<div><dt>달러 통장</dt><dd class="num">${fmtUSD(+d.usd || 0)}</dd></div><div><dt>원화 통장</dt><dd class="num">${fmtKRW(+d.krw || 0)}</dd></div>
      <div><dt>거래일</dt><dd class="num">${d.day || 0}</dd></div><div><dt>불법 도박 누적 · 단속</dt><dd class="num">${admUSD(+G.ilAcc || 0)} · ${G.bust || 0}회</dd></div>
      <div><dt>마지막 저장</dt><dd>${admT(sv.updated_at)}</dd></div>` : '<div><dt>저장 기록</dt><dd>이 모드 기록 없음</dd></div>'}
    </dl>
    ${M.net > 0 && d ? `<div class="mg-foot"><button class="btn" id="admClaw">멀티로 딴 ${fmtUSD(M.net)} 회수 SQL 만들기</button></div>` : ''}
    <h3 class="adm-h">멀티 판 결과 (최근 30)</h3>${tbl('<th>시각</th><th>게임 · 상대</th><th>결과</th><th class="r">판돈</th>', res, '멀티 판 기록이 없습니다.')}
    <h3 class="adm-h">멀티 받은 돈 (최근 20)</h3>${tbl('<th>시각</th><th>내용</th><th class="r">순손익</th>', pays, '받은 돈 기록이 없습니다.')}
    <h3 class="adm-h">채권·주택·복권·도박 (최근 30)</h3>${tbl('<th>날짜</th><th>내용</th><th class="r">금액</th>', alt, '내역이 없습니다.')}
    <h3 class="adm-h">주식 거래 (최근 20)</h3>${tbl('<th>날짜</th><th>구분</th><th>종목</th><th class="r">금액</th>', trades, '주식 거래 내역이 없습니다.')}
    <h3 class="adm-h">부루마블 (최근 10)</h3>${tbl('<th>시각</th><th>결과</th><th class="r">순손익</th>', bm, '기록이 없습니다.')}
    <h3 class="adm-h">환전 (최근 10)</h3>${tbl('<th>날짜</th><th>방향</th><th class="r">낸 금액</th>', fx, '환전 내역이 없습니다.')}`;
}
// 남의 저장 기록은 사이트에서 못 고친다 (정책). SQL 편집기에서 실행할 문장을 만들어 준다.
// syncBase를 바꾸고 dirty를 false로 두면, 그 계정이 접속했을 때 서버 기록(회수된 것)을 받아 간다
function admClawSQL(uid, mode, amt){
  const tag = 'admin' + Date.now();
  return `-- ${ADM.data && ADM.data.who ? ADM.data.who.nickname || '' : ''} (${mode}) 멀티로 딴 $${amt.toFixed(2)} 회수\n` +
    `update public.seed10k_saves set data = data || jsonb_build_object('usd', round((data->>'usd')::numeric - ${amt.toFixed(2)}, 2), 'syncBase', '${tag}', 'dirty', false), updated_at = now()\n` +
    `where user_id = '${uid}' and mode = '${mode}' returning (data->>'usd')::numeric as usd_after;`;
}
document.addEventListener('submit', e => { if (e.target.id === 'admQF'){ e.preventDefault(); admSearch($('#admQ').value.trim()); } });
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t || !ADM.on) return;
  if (t.dataset.admu) return admOpenUser(t.dataset.admu);
  if (t.dataset.admmode){ ADM.mode = t.dataset.admmode; return renderAdmin(); }
  if (t.dataset.admseen){
    const id = +t.dataset.admseen, {error} = await ACC.sb.from('seed10k_alerts').update({seen:true}).eq('id', id);
    if (error) return toast(error.message, true);
    const a = ADM.alerts.find(x => x.id === id); if (a && !a.seen){ a.seen = true; ADM.unseen--; } admBadge(); return renderAdmin();
  }
  if (t.id === 'admUpd'){
    t.disabled = true;
    const {error} = await ACC.sb.from('seed10k_admin_cmds').insert({kind:'update'});
    if (error){ t.disabled = false; return toast(`요청하지 못했습니다: ${error.message}`, true); }
    toast('요청했습니다. 파이가 1분 안에 받아서 처리합니다'); return admSrvLoad();
  }
  if (t.id === 'admSeenAll'){
    const {error} = await ACC.sb.from('seed10k_alerts').update({seen:true}).eq('seen', false);
    if (error) return toast(error.message, true);
    return admLoadAlerts();
  }
  if (t.id === 'admBan'){
    const c = showModal(`<h2>멀티플레이를 제한할까요?</h2><p>이 계정은 방을 만들거나 들어갈 수 없게 됩니다. 이미 받은 돈은 그대로라, 회수는 "회수 SQL 만들기"로 따로 합니다.</p>
      <label class="amt"><input id="admBanWhy" type="text" maxlength="100" placeholder="사유 (예: 부계정으로 홀짝 몰아주기)"></label>
      <div class="acts"><button class="btn" data-close>취소</button><button class="btn solid" id="admBanGo">제한</button></div>`);
    $('#admBanGo').onclick = async () => {
      const {error} = await ACC.sb.from('seed10k_mp_bans').insert({user_id:ADM.uid, reason:$('#admBanWhy').value.trim() || null});
      c(); if (error) return toast(`제한하지 못했습니다: ${error.message}`, true);
      toast('멀티플레이를 제한했습니다'); admOpenUser(ADM.uid);
    };
    return;
  }
  if (t.id === 'admRankBan'){ const u = ADM.data && ADM.data.who || {}; return admRankBanDlg(ADM.uid, u.nickname || u.email || ''); }
  if (t.id === 'admRankUnban'){
    const {error} = await ACC.sb.from('seed10k_rank_bans').delete().eq('user_id', ADM.uid);
    if (error) return toast(`풀지 못했습니다: ${error.message}`, true);
    toast('랭킹 밴을 풀었습니다 (그 계정이 다시 접속하면 다시 올라갑니다)'); admSearch(ADM.q); return admOpenUser(ADM.uid);
  }
  if (t.id === 'admTest' || t.id === 'admUntest'){
    const q = t.id === 'admTest' ? ACC.sb.from('seed10k_testers').insert({user_id:ADM.uid}) : ACC.sb.from('seed10k_testers').delete().eq('user_id', ADM.uid);
    const {error} = await q;
    if (error) return toast(`바꾸지 못했습니다: ${error.message}`, true);
    toast(t.id === 'admTest' ? '테스트 계정으로 바꿨습니다 (그 계정이 다시 접속하면 적용)' : '테스트 계정을 해제했습니다');
    return admOpenUser(ADM.uid);
  }
  if (t.id === 'admUnban'){
    const {error} = await ACC.sb.from('seed10k_mp_bans').delete().eq('user_id', ADM.uid);
    if (error) return toast(error.message, true);
    toast('제한을 풀었습니다'); return admOpenUser(ADM.uid);
  }
  if (t.id === 'admClaw'){
    const M = admMpNet(ADM.data.pays, ADM.mode), sql = admClawSQL(ADM.uid, ADM.mode, M.net);
    showModal(`<h2>멀티로 딴 돈 회수</h2><p>남의 기록은 사이트에서 고칠 수 없게 막혀 있어서, 아래 SQL을 Supabase SQL 편집기에 붙여넣고 실행합니다. 달러 통장에서 ${fmtUSD(M.net)}을 뺍니다 (모자라면 음수가 됩니다).</p>
      <pre class="adm-sql">${esc(sql)}</pre><p class="muted">불법 모드 단속으로 이미 압류된 돈도 이 합계에 들어 있습니다. 실행하면 그 계정이 다음에 접속할 때 서버 기록을 받아 갑니다.</p>
      <div class="acts"><button class="btn" data-close>닫기</button><button class="btn solid" id="admSqlCopy">복사</button></div>`);
    $('#admSqlCopy').onclick = async () => { try { await navigator.clipboard.writeText(sql); toast('복사했습니다'); } catch(err){ toast('복사하지 못했습니다. 직접 선택해 복사하세요', true); } };
  }
});

// 랭킹 제외: 관리 탭의 계정 화면이나 랭킹 표의 🚫 버튼에서
function admRankBanDlg(uid, nick){
  const c = showModal(`<h2>🚫 랭킹에서 밴할까요?</h2><p><b>${esc(nick || uid)}</b> 계정의 랭킹 줄(실제 시세·시뮬레이션 모두)을 지우고, 다시 오르지 못하게 막습니다. 게임 기록과 돈은 그대로입니다.</p>
    <label class="amt"><input id="admRbWhy" type="text" maxlength="100" placeholder="사유 (그 계정에도 보입니다)"></label>
    <div class="acts"><button class="btn" data-close>취소</button><button class="btn solid" id="admRbGo">밴</button></div>`);
  $('#admRbGo').onclick = async () => {
    $('#admRbGo').disabled = true;
    const {error} = await ACC.sb.from('seed10k_rank_bans').insert({user_id:uid, nick:nick || null, reason:$('#admRbWhy').value.trim() || null});
    c(); if (error) return toast(/duplicate/i.test(error.message) ? '이미 제외된 계정입니다' : `제외하지 못했습니다: ${error.message}`, true);
    toast('랭킹에서 밴했습니다');
    ACC.ranksAt = {}; refreshRanks(true); admSearch(ADM.q);
    if (ADM.uid === uid) admOpenUser(uid);
  };
}
document.addEventListener('click', async e => {
  const t = e.target.closest('button'); if (!t || !ADM.on) return;
  if (t.dataset.admrkban) return admRankBanDlg(t.dataset.admrkban, t.dataset.nick);
  if (t.dataset.admrkunban){
    t.disabled = true;
    const {error} = await ACC.sb.from('seed10k_rank_bans').delete().eq('user_id', t.dataset.admrkunban);
    if (error){ t.disabled = false; return toast(`풀지 못했습니다: ${error.message}`, true); }
    toast('랭킹 밴을 풀었습니다 (그 계정이 다시 접속하면 다시 올라갑니다)'); admSearch(ADM.q);
    if (ADM.uid === t.dataset.admrkunban) admOpenUser(ADM.uid);
  }
});
