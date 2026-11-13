-- SEED 10K 랭킹 제외(밴): 관리자가 지정한 계정은 랭킹 표에 오를 수 없다
-- seed10k_admin.sql, seed10k_testers.sql 다음에 실행한다. 여러 번 실행해도 된다.
create table if not exists public.seed10k_rank_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  reason text
);
alter table public.seed10k_rank_bans enable row level security;
drop policy if exists "seed10k_rank_bans_select" on public.seed10k_rank_bans;
drop policy if exists "seed10k_rank_bans_insert_admin" on public.seed10k_rank_bans;
drop policy if exists "seed10k_rank_bans_delete_admin" on public.seed10k_rank_bans;
create policy "seed10k_rank_bans_select" on public.seed10k_rank_bans for select using (auth.uid() = user_id or public.seed10k_is_admin());
create policy "seed10k_rank_bans_insert_admin" on public.seed10k_rank_bans for insert with check (public.seed10k_is_admin());
create policy "seed10k_rank_bans_delete_admin" on public.seed10k_rank_bans for delete using (public.seed10k_is_admin());

create or replace function public.seed10k_is_rank_banned(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seed10k_rank_bans where user_id = u);
$$;
revoke all on function public.seed10k_is_rank_banned(uuid) from public;
grant execute on function public.seed10k_is_rank_banned(uuid) to anon, authenticated;

-- 랭킹 표 쓰기: 본인 줄만, 테스트 계정·랭킹 제외 계정은 안 됨 (사이트를 고쳐도 서버가 막는다)
drop policy if exists "seed10k_ranks_insert_own" on public.seed10k_ranks;
drop policy if exists "seed10k_ranks_update_own" on public.seed10k_ranks;
create policy "seed10k_ranks_insert_own" on public.seed10k_ranks for insert
  with check (auth.uid() = user_id and not public.seed10k_is_tester(user_id) and not public.seed10k_is_rank_banned(user_id));
create policy "seed10k_ranks_update_own" on public.seed10k_ranks for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and not public.seed10k_is_tester(user_id) and not public.seed10k_is_rank_banned(user_id));

-- 제외되면 올라가 있던 줄(두 모드 모두)을 바로 지운다
create or replace function public.seed10k_rank_ban_unrank() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.seed10k_ranks where user_id = new.user_id;
  return new;
end $$;
drop trigger if exists seed10k_rank_ban_unrank on public.seed10k_rank_bans;
create trigger seed10k_rank_ban_unrank after insert on public.seed10k_rank_bans for each row execute function public.seed10k_rank_ban_unrank();
