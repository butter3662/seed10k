-- SEED 10K 계정 저장·랭킹 표
-- Supabase 대시보드 → SQL Editor → New query 에 전부 붙여 넣고 Run 한 번이면 된다.
-- 여러 번 실행해도 문제없도록 작성했다.

-- 1) 게임 저장 기록: 계정마다 모드(live/sim)별로 한 줄. 본인 기록만 읽고 쓸 수 있다.
create table if not exists public.seed10k_saves (
  user_id    uuid not null references auth.users(id) on delete cascade,
  mode       text not null check (mode in ('live', 'sim')),
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode)
);
alter table public.seed10k_saves enable row level security;

drop policy if exists "seed10k_saves_select_own" on public.seed10k_saves;
drop policy if exists "seed10k_saves_insert_own" on public.seed10k_saves;
drop policy if exists "seed10k_saves_update_own" on public.seed10k_saves;
drop policy if exists "seed10k_saves_delete_own" on public.seed10k_saves;
create policy "seed10k_saves_select_own" on public.seed10k_saves for select using (auth.uid() = user_id);
create policy "seed10k_saves_insert_own" on public.seed10k_saves for insert with check (auth.uid() = user_id);
create policy "seed10k_saves_update_own" on public.seed10k_saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "seed10k_saves_delete_own" on public.seed10k_saves for delete using (auth.uid() = user_id);

-- 2) 랭킹: 누구나 읽을 수 있고, 본인 줄만 쓸 수 있다. 이메일은 저장하지 않는다.
create table if not exists public.seed10k_ranks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  mode       text not null check (mode in ('live', 'sim')),
  nickname   text not null check (char_length(nickname) between 2 and 12),
  net_worth  numeric not null,
  return_pct numeric not null check (return_pct between -100 and 100000),
  days       integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode)
);
alter table public.seed10k_ranks enable row level security;

drop policy if exists "seed10k_ranks_select_all" on public.seed10k_ranks;
drop policy if exists "seed10k_ranks_insert_own" on public.seed10k_ranks;
drop policy if exists "seed10k_ranks_update_own" on public.seed10k_ranks;
drop policy if exists "seed10k_ranks_delete_own" on public.seed10k_ranks;
create policy "seed10k_ranks_select_all" on public.seed10k_ranks for select using (true);
create policy "seed10k_ranks_insert_own" on public.seed10k_ranks for insert with check (auth.uid() = user_id);
create policy "seed10k_ranks_update_own" on public.seed10k_ranks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "seed10k_ranks_delete_own" on public.seed10k_ranks for delete using (auth.uid() = user_id);

create index if not exists seed10k_ranks_mode_return on public.seed10k_ranks (mode, return_pct desc);
