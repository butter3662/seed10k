-- SEED 10K: 주사위 세계여행(부루마블) 끝난 판 기록
-- 판이 끝날 때마다 게임이 한 줄씩 넣는다. 본인 기록만 넣고 읽을 수 있고, 고치기·지우기는 아무도 못 한다(SQL 편집기 제외)
create table if not exists public.seed10k_bmlog (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),   -- 판이 끝난 시각
  mode text,                               -- live(실제 시세) / sim(시뮬레이션)
  n int,                                   -- 인원(나 포함)
  stake numeric, pay numeric,              -- 판돈, 돌려받은 돈 (달러)
  rank int, forfeit boolean, il boolean,   -- 내 순위, 기권 여부, 불법 모드 여부
  rounds int,                              -- 끝날 때 바퀴 수
  standings jsonb,                         -- 최종 순위: [{nm, out, outAt, cash, assets}]
  log jsonb                                -- 판 전체 기록 (한국 시각, 바퀴, 주사위, 선택, 거래, 파산)
);
create index if not exists seed10k_bmlog_user_at on public.seed10k_bmlog (user_id, at desc);
alter table public.seed10k_bmlog enable row level security;
drop policy if exists "seed10k_bmlog_insert_own" on public.seed10k_bmlog;
drop policy if exists "seed10k_bmlog_select_own" on public.seed10k_bmlog;
create policy "seed10k_bmlog_insert_own" on public.seed10k_bmlog for insert with check (auth.uid() = user_id);
create policy "seed10k_bmlog_select_own" on public.seed10k_bmlog for select using (auth.uid() = user_id);
