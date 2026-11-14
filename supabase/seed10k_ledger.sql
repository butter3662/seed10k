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
declare last record;
begin
  select bal, bal_k into last from public.seed10k_ledger where user_id = new.user_id and mode = new.mode and id <> new.id order by id desc limit 1;
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
  if coalesce(new.data->>'syncBase', '') like 'admin%' then   -- 관리자가 SQL로 고친 것: 기록을 대신 잇는다
    insert into public.seed10k_ledger (user_id, mode, amt, bal, amt_k, bal_k, why) values (new.user_id, new.mode, u - last.bal, u, k - last.bal_k, k, 'admin');
    return null;
  end if;
  perform public.seed10k_ledger_alert(new.user_id, new.mode, 'ledger_save',
    format('저장된 잔고가 돈 기록과 다름 (%s): 기록 $%s · ₩%s, 저장 $%s · ₩%s (저장 기록을 직접 고쳤을 수 있음)',
      case new.mode when 'live' then '실제 시세' else '시뮬' end, round(last.bal, 2), round(last.bal_k), round(u, 2), round(k)),
    jsonb_build_object('ledger', last.bal, 'ledger_k', last.bal_k, 'save', u, 'save_k', k));
  return null;
exception when others then return null;   -- 확인이 실패해도 저장은 절대 막지 않는다
end $$;
drop trigger if exists seed10k_ledger_save on public.seed10k_saves;
create trigger seed10k_ledger_save after insert or update of data on public.seed10k_saves for each row execute function public.seed10k_ledger_save();

-- 테스트 계정에 이미 생긴 돈 기록 알림은 확인한 것으로 둔다
update public.seed10k_alerts set seen = true where kind like 'ledger%' and not seen and uid in (select user_id from public.seed10k_testers);
