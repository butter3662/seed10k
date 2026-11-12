-- SEED 10K 테스트 계정: 돈이 줄지 않고(사이트가 채워 줌) 랭킹에 오르지 않는다
-- seed10k_admin.sql을 먼저 실행해야 한다 (seed10k_is_admin). 여러 번 실행해도 된다.
-- 테스트 계정 지정은 이 파일에 넣지 않는다 (저장소가 공개라 이메일이 드러나지 않게). SQL 편집기에서 따로:
--   insert into public.seed10k_testers (user_id) select id from auth.users where email = '테스트 계정 이메일' on conflict do nothing;
--   delete from public.seed10k_ranks where user_id in (select user_id from public.seed10k_testers);
create table if not exists public.seed10k_testers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.seed10k_testers enable row level security;
drop policy if exists "seed10k_testers_select" on public.seed10k_testers;
create policy "seed10k_testers_select" on public.seed10k_testers for select using (auth.uid() = user_id or public.seed10k_is_admin());

-- 테스트 계정은 랭킹 표에 쓸 수 없다 (사이트를 고쳐도 서버가 막는다)
create or replace function public.seed10k_is_tester(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seed10k_testers where user_id = u);
$$;
revoke all on function public.seed10k_is_tester(uuid) from public;
grant execute on function public.seed10k_is_tester(uuid) to anon, authenticated;
drop policy if exists "seed10k_ranks_insert_own" on public.seed10k_ranks;
drop policy if exists "seed10k_ranks_update_own" on public.seed10k_ranks;
create policy "seed10k_ranks_insert_own" on public.seed10k_ranks for insert with check (auth.uid() = user_id and not public.seed10k_is_tester(user_id));
create policy "seed10k_ranks_update_own" on public.seed10k_ranks for update using (auth.uid() = user_id) with check (auth.uid() = user_id and not public.seed10k_is_tester(user_id));
