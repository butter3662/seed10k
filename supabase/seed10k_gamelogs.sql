-- 판 기록: 혼자 하기(사이트가 올림)·같이 하기(심판이 올림) 모든 판의 진행 기록. 여러 번 실행해도 된다.
-- 보관: 기본 10일(keep_until). 버그 신고가 걸린 판은 hold = true로 지우지 않고, 그 신고를 '확인함'(답변·삭제 포함)하면 그때부터 10일 뒤 지운다.
create table if not exists public.seed10k_gamelogs (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete cascade,      -- 혼자 하기: 올린 사람 (같이 하기는 null)
  uids uuid[] not null default '{}',                             -- 같이 하기: 참가한 사람들
  mode text check (mode in ('live', 'sim')),
  game text not null check (char_length(game) <= 10),
  code text check (char_length(coalesce(code, '')) <= 12),       -- 같이 하기 방 코드
  stake numeric, pay numeric,
  result text check (char_length(coalesce(result, '')) <= 300),
  log jsonb not null default '[]'::jsonb,
  app_ver text,
  hold boolean not null default false,
  keep_until timestamptz not null default now() + interval '10 days'
);
create index if not exists seed10k_gamelogs_user_at on public.seed10k_gamelogs (user_id, at desc);
create index if not exists seed10k_gamelogs_uids on public.seed10k_gamelogs using gin (uids);
create index if not exists seed10k_gamelogs_keep on public.seed10k_gamelogs (keep_until) where not hold;
alter table public.seed10k_gamelogs enable row level security;
drop policy if exists "seed10k_gamelogs_insert_own" on public.seed10k_gamelogs;
drop policy if exists "seed10k_gamelogs_select_admin" on public.seed10k_gamelogs;
create policy "seed10k_gamelogs_insert_own" on public.seed10k_gamelogs for insert to authenticated with check (user_id = auth.uid() and uids = '{}' and code is null and not hold);
create policy "seed10k_gamelogs_select_admin" on public.seed10k_gamelogs for select using (public.seed10k_is_admin());
revoke all on public.seed10k_gamelogs from anon, authenticated;
grant insert (user_id, mode, game, stake, pay, result, log, app_ver) on public.seed10k_gamelogs to authenticated;
grant select on public.seed10k_gamelogs to authenticated;
grant usage on sequence public.seed10k_gamelogs_id_seq to authenticated;

-- 버그 신고가 걸린 판: 같은 방(code) 또는 같은 사람이 신고 전후 3시간 안에 한 판, 그리고 그 신고를 아직 확인하지 않음
alter table public.seed10k_bugs add column if not exists code text check (char_length(coalesce(code, '')) <= 12);
grant insert (code) on public.seed10k_bugs to authenticated;
create or replace function public.seed10k_gl_bugged(l public.seed10k_gamelogs) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seed10k_bugs b where not b.seen
    and b.at between l.at - interval '3 hours' and l.at + interval '3 hours'
    and ((l.code is not null and b.code = l.code) or b.user_id = l.user_id or b.user_id = any(l.uids)));
$$;
create or replace function public.seed10k_gl_ins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.hold := public.seed10k_gl_bugged(new);
  if char_length(new.log::text) > 400000 then new.log := '["(기록이 너무 길어 잘림)"]'::jsonb; end if;
  return new;
end $$;
drop trigger if exists seed10k_gl_ins on public.seed10k_gamelogs;
create trigger seed10k_gl_ins before insert on public.seed10k_gamelogs for each row execute function public.seed10k_gl_ins();
-- 오래된 기록 지우기: 새 기록이 들어올 때마다 (기간이 지났고 붙잡힌 것이 아닌 것)
create or replace function public.seed10k_gl_clean() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.seed10k_gamelogs where not hold and keep_until < now();
  return null;
end $$;
drop trigger if exists seed10k_gl_clean on public.seed10k_gamelogs;
create trigger seed10k_gl_clean after insert on public.seed10k_gamelogs for each statement execute function public.seed10k_gl_clean();
-- 버그 신고가 들어오면: 그 전 3시간 안에 끝난 관련 판을 붙잡는다
create or replace function public.seed10k_bug_hold() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.seed10k_gamelogs l set hold = true where not l.hold and l.at > new.at - interval '3 hours'
      and ((new.code is not null and l.code = new.code) or l.user_id = new.user_id or new.user_id = any(l.uids));
  elsif new.seen and not old.seen then
    -- 확인함: 이제 다른 미확인 신고에 걸리지 않은 판은 놓아주고, 지금부터 10일 뒤 지운다
    update public.seed10k_gamelogs l set hold = false, keep_until = now() + interval '10 days'
      where l.hold and not public.seed10k_gl_bugged(l);
  end if;
  return null;
end $$;
drop trigger if exists seed10k_bug_hold on public.seed10k_bugs;
create trigger seed10k_bug_hold after insert or update of seen on public.seed10k_bugs for each row execute function public.seed10k_bug_hold();

-- '이 판에서 일어난 버그' 체크: 신고에 그때까지의 판 기록(glog)을 붙이고, 그 판이 끝나 올라오는 판 기록에는 bug_id를 단다
alter table public.seed10k_bugs add column if not exists this_game boolean not null default false;
alter table public.seed10k_bugs add column if not exists glog jsonb;
alter table public.seed10k_bugs drop constraint if exists seed10k_bugs_glog_len;
alter table public.seed10k_bugs add constraint seed10k_bugs_glog_len check (glog is null or char_length(glog::text) <= 400000);
grant insert (this_game, glog) on public.seed10k_bugs to authenticated;
alter table public.seed10k_gamelogs add column if not exists bug_id bigint;
grant insert (bug_id) on public.seed10k_gamelogs to authenticated;
create or replace function public.seed10k_gl_bugged(l public.seed10k_gamelogs) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seed10k_bugs b where not b.seen and (b.id = l.bug_id or (
    b.at between l.at - interval '3 hours' and l.at + interval '3 hours'
    and ((l.code is not null and b.code = l.code) or b.user_id = l.user_id or b.user_id = any(l.uids)))));
$$;
create or replace function public.seed10k_gl_ins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- 남의 신고 번호는 달 수 없다
  if new.bug_id is not null and not exists (select 1 from public.seed10k_bugs b where b.id = new.bug_id and b.user_id = new.user_id) then new.bug_id := null; end if;
  new.hold := public.seed10k_gl_bugged(new);
  if char_length(new.log::text) > 400000 then new.log := '["(기록이 너무 길어 잘림)"]'::jsonb; end if;
  return new;
end $$;
