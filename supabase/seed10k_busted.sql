-- SEED 10K: 불법 도박 경찰 단속 기록 (랭킹 이름의 빨간 줄)
-- 한 번 남기면 본인도 지울 수 없다 (넣기와 읽기만 허용, 고치기·지우기 정책 없음)
create table if not exists public.seed10k_busted (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.seed10k_busted enable row level security;
drop policy if exists "seed10k_busted_select_all" on public.seed10k_busted;
drop policy if exists "seed10k_busted_insert_own" on public.seed10k_busted;
create policy "seed10k_busted_select_all" on public.seed10k_busted for select using (true);
create policy "seed10k_busted_insert_own" on public.seed10k_busted for insert with check (auth.uid() = user_id);
