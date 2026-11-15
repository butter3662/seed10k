-- SEED 10K 돈 기록(원장) 1단계: 사이트가 현금(달러·원)이 바뀔 때마다 한 줄씩 적는다 (지울 수도 고칠 수도 없다).
-- 줄마다 바뀐 금액(amt)과 바뀐 뒤 잔고(bal)를 적으므로, 앞 줄의 잔고 + 이번 금액 = 이번 잔고여야 한다.
--   ① 이어지지 않는 줄(기록 없이 잔고가 바뀐 뒤 들어온 줄) → 알림 ledger_gap
--   ② 저장 기록(seed10k_saves)의 잔고가 마지막 줄의 잔고와 다름(저장 기록을 직접 고침) → 알림 ledger_save
-- 처음 줄(why='start')은 그때 저장돼 있던 잔고를 시작점으로 인정한다. 관리자가 SQL로 잔고를 고치면(syncBase가 admin…) 'admin' 줄을 대신 적는다.
-- seed10k_admin.sql 다음에 실행한다. 여러 번 실행해도 된다.
create table if not exists public.seed10k_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  mode text not null check (mode in ('live', 'sim')),
  at timestamptz not null default now(),
  amt numeric not null default 0,      -- 달러 변화
  bal numeric not null,                -- 바뀐 뒤 달러 잔고
  amt_k numeric not null default 0,    -- 원화 변화
  bal_k numeric not null default 0,    -- 바뀐 뒤 원화 잔고
  why text                             -- 무엇 때문에 (사이트가 부른 함수 이름 등)
);
create index if not exists seed10k_ledger_um on public.seed10k_ledger (user_id, mode, id desc);
alter table public.seed10k_ledger enable row level security;
drop policy if exists "seed10k_ledger_insert_own" on public.seed10k_ledger;
drop policy if exists "seed10k_ledger_select" on public.seed10k_ledger;
create policy "seed10k_ledger_insert_own" on public.seed10k_ledger for insert with check (auth.uid() = user_id);
create policy "seed10k_ledger_select" on public.seed10k_ledger for select using (auth.uid() = user_id or public.seed10k_is_admin());
-- 고치기·지우기 정책 없음 = 아무도 못 고친다

-- 같은 사람·같은 종류 알림은 하루에 한 번만
create or replace function public.seed10k_ledger_alert(u uuid, m text, k text, msg text, det jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.seed10k_testers where user_id = u) then return; end if;   -- 테스트 계정은 anticheat 대상이 아님
  if exists (select 1 from public.seed10k_alerts where uid = u and kind = k and mode = m and at > now() - interval '1 day') then return; end if;
  insert into public.seed10k_alerts (kind, game, mode, uid, msg, detail) values (k, 'ledger', m, u, msg, det);
end $$;

create or replace function public.seed10k_ledger_chain() returns trigger
language plpgsql security definer set search_path = public as $$
declare last record; g text; lim numeric; tz boolean; lp numeric; nn int; mname text;
begin
  mname := case new.mode when 'live' then '실제 시세' else '시뮬' end;
  begin   -- ③④⑤는 따로 감싼다: 여기서 오류가 나도 아래 '기록 끊김' 확인은 그대로 돈다
  -- ③ 환생 위장: 환생(why = 'reset') 줄은 반드시 시작 자금($10,000 · ₩0)이 된다
  if new.why = 'reset' and (abs(new.bal - 10000) > 0.02 or abs(new.bal_k) > 2) then
    perform public.seed10k_ledger_alert(new.user_id, new.mode, 'ledger_reset',
      format('환생했는데 시작 잔고가 $10,000 · ₩0이 아님 (%s): $%s · ₩%s', mname, round(new.bal, 2), round(new.bal_k)),
      jsonb_build_object('id', new.id, 'bal', new.bal, 'bal_k', new.bal_k));
  end if;
  -- ④ 한도를 넘는 도박 수익: 혼자 하는 판 정산 줄(xxFinish)의 받은 돈이 그 게임에서 타짜 없이 받을 수 있는 최대보다 크다
  --    (불법 모드 판돈 한도 × 최대 배수: 벅샷·뱀사다리 $1,000×2, 부루마블 $1,000×3, 블랙잭 스플릿·더블 $8,000×2, 홀짝 $100×2^10)
  g := substring(coalesce(new.why, '') from '(bs|bj|bm|sl|oe)Finish');
  if g is not null and new.amt > 0 then
    lim := case g when 'bs' then 2000 when 'sl' then 2000 when 'bm' then 3000 when 'bj' then 16000 when 'oe' then 102400 end;
    tz := exists (select 1 from public.seed10k_tazza_uses t where t.user_id = new.user_id and t.game = g and t.at > now() - interval '6 hours');
    if not tz and new.amt > lim + 0.01 then
      perform public.seed10k_ledger_alert(new.user_id, new.mode, 'gam_over',
        format('한도를 넘는 도박 수익 (%s): %s 한 판에서 $%s를 받음 (타짜 없이 최대 $%s)', mname, g, round(new.amt, 2), lim),
        jsonb_build_object('id', new.id, 'game', g, 'amt', new.amt, 'lim', lim));
    elsif tz and new.amt >= 20000 then
      perform public.seed10k_ledger_alert(new.user_id, new.mode, 'tz_big',
        format('타짜 큰 판 (%s): %s에서 $%s를 받음', mname, g, round(new.amt, 2)),
        jsonb_build_object('id', new.id, 'game', g, 'amt', new.amt));
    end if;
  end if;
  -- ⑤ 단속이 너무 안 걸림: 불법 판이 끝날 때 사이트가 남기는 표시 줄(why = 'il:<게임>:p=<적발 확률>[:bust][:hide]')로,
  --    마지막 단속 뒤 단속 없이 지나간 판들의 '한 번도 안 걸릴 확률'을 곱해 0.5% 아래면 알린다 (은신 판은 빼고 셈)
  if coalesce(new.why, '') like 'il:%' and new.why not like '%:bust%' and new.why not like '%:hide%' then
    select coalesce(sum(ln(greatest(1e-6, 1 - least(0.99, (substring(l.why from 'p=([0-9.]+)'))::numeric)))), 0), count(*) into lp, nn
      from public.seed10k_ledger l
      where l.user_id = new.user_id and l.why like 'il:%' and l.why not like '%:hide%' and l.why ~ 'p=[0-9.]+'
        and l.id > coalesce((select max(b.id) from public.seed10k_ledger b where b.user_id = new.user_id and b.why like 'il:%:bust%'), 0);
    if nn >= 20 and exp(lp) < 0.005 then
      perform public.seed10k_ledger_alert(new.user_id, new.mode, 'il_nobust',
        format('불법 판 %s판 연속 단속 0회 (그럴 확률 %s%%) — 단속 결과를 서버에 안 알렸을 수 있음', nn, round(exp(lp) * 100, 3)),
        jsonb_build_object('n', nn, 'p', exp(lp)));
    end if;
  end if;
  exception when others then null;
  end;
  -- 바로 앞 줄 = 이 줄보다 id가 작은 마지막 줄. (예전에는 'id <> new.id'로 찾아서, 여러 줄을 한 번에 올리면 — 행 트리거는 문장이 끝난 뒤 돌므로 —
  --  같이 올라간 뒤쪽 줄을 앞 줄로 잘못 보고 '기록 끊김'을 냈다. 예: 상점에서 연달아 산 변호사 7줄)
  select bal, bal_k into last from public.seed10k_ledger where user_id = new.user_id and mode = new.mode and id < new.id order by id desc limit 1;
  if found and new.why is distinct from 'start'
     and (abs((new.bal - new.amt) - last.bal) > 0.02 or abs((new.bal_k - new.amt_k) - last.bal_k) > 2) then
    perform public.seed10k_ledger_alert(new.user_id, new.mode, 'ledger_gap',
      format('돈 기록이 이어지지 않음 (%s): 기록상 잔고 $%s · ₩%s 인데 다음 줄은 $%s · ₩%s 에서 시작 (기록 없이 잔고가 바뀜)',
        case new.mode when 'live' then '실제 시세' else '시뮬' end, round(last.bal, 2), round(last.bal_k), round(new.bal - new.amt, 2), round(new.bal_k - new.amt_k)),
      jsonb_build_object('id', new.id, 'last', last.bal, 'last_k', last.bal_k, 'from', new.bal - new.amt, 'from_k', new.bal_k - new.amt_k, 'why', new.why));
  elsif found and new.why = 'start' and (abs(new.bal - last.bal) > 0.02 or abs(new.bal_k - last.bal_k) > 2) then
    perform public.seed10k_ledger_alert(new.user_id, new.mode, 'ledger_gap',
      format('새 기기의 시작 잔고가 기록과 다름 (%s): 기록 $%s · ₩%s, 새 기기 $%s · ₩%s',
        case new.mode when 'live' then '실제 시세' else '시뮬' end, round(last.bal, 2), round(last.bal_k), round(new.bal, 2), round(new.bal_k)),
      jsonb_build_object('id', new.id, 'last', last.bal, 'bal', new.bal));
  end if;
  return null;
exception when others then return null;   -- 확인이 실패해도 기록은 막지 않는다
end $$;
drop trigger if exists seed10k_ledger_chain on public.seed10k_ledger;
create trigger seed10k_ledger_chain after insert on public.seed10k_ledger for each row execute function public.seed10k_ledger_chain();

create or replace function public.seed10k_ledger_save() returns trigger
language plpgsql security definer set search_path = public as $$
declare last record; u numeric; k numeric;
begin
  u := nullif(new.data->>'usd', '')::numeric; k := coalesce(nullif(new.data->>'krw', '')::numeric, 0);
  if u is null then return null; end if;
  select bal, bal_k into last from public.seed10k_ledger where user_id = new.user_id and mode = new.mode order by id desc limit 1;
  if not found then return null; end if;   -- 아직 기록을 시작하지 않은 계정
  if abs(u - last.bal) <= 0.02 and abs(k - last.bal_k) <= 2 then return null; end if;
  -- 관리자가 SQL 편집기에서 고친 것만 기록을 대신 잇는다. 사이트(로그인한 사용자, auth.uid() 있음)가 syncBase를 admin…으로 적어 보낸 것은
  -- 관리자 수정 위장이므로 잇지 않고 알린다 (예전에는 이것도 이어 줘서 저장 기록의 돈을 고쳐도 알림이 안 떴다)
  if coalesce(new.data->>'syncBase', '') like 'admin%' and auth.uid() is null then
    insert into public.seed10k_ledger (user_id, mode, amt, bal, amt_k, bal_k, why) values (new.user_id, new.mode, u - last.bal, u, k - last.bal_k, k, 'admin');
    return null;
  end if;
  perform public.seed10k_ledger_alert(new.user_id, new.mode, 'ledger_save',
    format('저장된 잔고가 돈 기록과 다름 (%s): 기록 $%s · ₩%s, 저장 $%s · ₩%s (저장 기록을 직접 고쳤을 수 있음)%s',
      case new.mode when 'live' then '실제 시세' else '시뮬' end, round(last.bal, 2), round(last.bal_k), round(u, 2), round(k),
      case when coalesce(new.data->>'syncBase', '') like 'admin%' then ' — 사이트에서 관리자 수정으로 위장함' else '' end),
    jsonb_build_object('ledger', last.bal, 'ledger_k', last.bal_k, 'save', u, 'save_k', k));
  return null;
exception when others then return null;   -- 확인이 실패해도 저장은 절대 막지 않는다
end $$;
drop trigger if exists seed10k_ledger_save on public.seed10k_saves;
create trigger seed10k_ledger_save after insert or update of data on public.seed10k_saves for each row execute function public.seed10k_ledger_save();

-- 테스트 계정에 이미 생긴 돈 기록 알림은 확인한 것으로 둔다
update public.seed10k_alerts set seen = true where kind like 'ledger%' and not seen and uid in (select user_id from public.seed10k_testers);
-- 2026-11-14: 저장 직전에 들어온 상금 때문에 잘못 뜬 '저장 잔고 불일치'·'돈 기록 끊김' 알림(사이트 수정 전)을 확인한 것으로 둔다
update public.seed10k_alerts set seen = true where kind like 'ledger%' and not seen and at < timestamptz '2026-11-14 12:00:00+00';

-- 위 버그(여러 줄을 한 번에 올리면 '기록 끊김' 오탐)로 생긴 알림을 확인함으로 바꾼다: 알림이 가리키는 줄을 바로 앞 줄(id가 작은 마지막 줄)과 다시 맞춰 보고 이어지면 오탐
update public.seed10k_alerts a set seen = true
from (
  select a2.id aid, l.why, l.bal - l.amt frm, l.bal_k - l.amt_k frmk, p.bal pb, p.bal_k pbk
  from public.seed10k_alerts a2
  join public.seed10k_ledger l on l.id = (a2.detail->>'id')::bigint
  left join lateral (select bal, bal_k from public.seed10k_ledger q where q.user_id = l.user_id and q.mode = l.mode and q.id < l.id order by q.id desc limit 1) p on true
  where a2.kind = 'ledger_gap' and not a2.seen and (a2.detail->>'id') ~ '^[0-9]+$'
) x
where a.id = x.aid and x.why is distinct from 'start' and x.pb is not null and abs(x.frm - x.pb) <= 0.02 and abs(x.frmk - x.pbk) <= 2;
