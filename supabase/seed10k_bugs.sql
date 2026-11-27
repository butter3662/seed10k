-- 버그 신고: 게임 화면의 🐞 버튼으로 로그인한 사람이 적고, 관리자만 읽는다. 여러 번 실행해도 된다.
create table if not exists public.seed10k_bugs (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  game text check (char_length(coalesce(game, '')) <= 40),
  mode text check (mode in ('live', 'sim')),
  what text not null check (char_length(what) between 1 and 2000),     -- 언제 어떤 버그를 발견했나
  damage text check (char_length(coalesce(damage, '')) <= 2000),       -- 피해 상황
  app_ver text check (char_length(coalesce(app_ver, '')) <= 20),
  seen boolean not null default false,
  hidden boolean not null default false
);
create index if not exists seed10k_bugs_at on public.seed10k_bugs (at desc);
alter table public.seed10k_bugs enable row level security;
drop policy if exists "seed10k_bugs_insert_own" on public.seed10k_bugs;
drop policy if exists "seed10k_bugs_select_admin" on public.seed10k_bugs;
drop policy if exists "seed10k_bugs_update_admin" on public.seed10k_bugs;
create policy "seed10k_bugs_insert_own" on public.seed10k_bugs for insert to authenticated with check (user_id = auth.uid() and not seen and not hidden);
create policy "seed10k_bugs_select_admin" on public.seed10k_bugs for select using (public.seed10k_is_admin());
create policy "seed10k_bugs_update_admin" on public.seed10k_bugs for update using (public.seed10k_is_admin()) with check (public.seed10k_is_admin());
revoke all on public.seed10k_bugs from anon, authenticated;
grant insert (game, mode, what, damage, app_ver) on public.seed10k_bugs to authenticated;
grant select on public.seed10k_bugs to authenticated;          -- 읽기는 정책이 관리자만 허용
grant update (seen, hidden) on public.seed10k_bugs to authenticated;
grant usage on sequence public.seed10k_bugs_id_seq to authenticated;

-- 도배 막기: 한 사람이 하루(24시간)에 10건까지
create or replace function public.seed10k_bugs_limit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.seed10k_bugs where user_id = new.user_id and at > now() - interval '24 hours') >= 10 then
    raise exception '버그 신고는 하루에 10건까지 할 수 있습니다';
  end if;
  return new;
end $$;
drop trigger if exists seed10k_bugs_limit on public.seed10k_bugs;
create trigger seed10k_bugs_limit before insert on public.seed10k_bugs for each row execute function public.seed10k_bugs_limit();

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seed10k_bugs') then
    alter publication supabase_realtime add table public.seed10k_bugs;
  end if;
end $$;

-- 답변: 관리자가 적고, 신고한 사람은 자기 신고의 답변을 읽고 '읽음'만 표시할 수 있다 (읽음 표시는 함수로만)
alter table public.seed10k_bugs add column if not exists reply text check (char_length(coalesce(reply, '')) <= 2000);
alter table public.seed10k_bugs add column if not exists replied_at timestamptz;
alter table public.seed10k_bugs add column if not exists reply_seen boolean not null default false;
drop policy if exists "seed10k_bugs_select_own" on public.seed10k_bugs;
create policy "seed10k_bugs_select_own" on public.seed10k_bugs for select using (user_id = auth.uid());
grant update (seen, hidden, reply, replied_at, reply_seen) on public.seed10k_bugs to authenticated;   -- 정책상 관리자만
create or replace function public.seed10k_bug_reply_seen(p_ids bigint[]) returns void language sql security definer set search_path = public as $$
  update public.seed10k_bugs set reply_seen = true where id = any(p_ids) and user_id = auth.uid() and reply is not null;
$$;
revoke all on function public.seed10k_bug_reply_seen(bigint[]) from public;
grant execute on function public.seed10k_bug_reply_seen(bigint[]) to authenticated;
