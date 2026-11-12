-- SEED 10K 멀티플레이 (방 코드로 같이 하기)
-- 구조: 사이트는 Supabase하고만 통신한다. 요청(seed10k_room_reqs)을 넣으면 라즈베리파이 심판(pi/referee.ts)이
--       게임 규칙으로 처리해 방(seed10k_rooms)을 고치고, 끝나면 받을 돈(seed10k_payouts)을 적는다.
-- 여러 번 실행해도 된다.

-- 1) 방: 누구나 읽기(코드로 들어가고 실시간으로 보기). 쓰기는 심판(서버 비밀 키)만
create table if not exists public.seed10k_rooms (
  code text primary key,                  -- 6자리 방 코드 (심판 상태 줄은 '__ref')
  game text not null,                     -- oe 홀짝 / sl 뱀사다리 / bj 블랙잭 / bm 주사위 세계여행
  mode text not null,                     -- live 실제 시세 / sim 시뮬레이션 (같은 모드끼리만)
  host uuid,                              -- 방장
  stake numeric not null default 0,       -- 한 사람 판돈 (달러)
  il boolean not null default false,      -- 불법 모드 방
  status text not null default 'lobby',   -- lobby 대기 / play 진행 / over 끝 / closed 닫힘 / sys 심판 상태
  state jsonb not null default '{}',      -- 모두에게 보이는 게임 상태
  ver int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.seed10k_rooms enable row level security;
drop policy if exists "seed10k_rooms_select" on public.seed10k_rooms;
create policy "seed10k_rooms_select" on public.seed10k_rooms for select using (true);

-- 2) 숨겨야 하는 상태 (홀짝에서 쥔 구슬 수, 블랙잭 남은 카드 등): 정책 없음 = 심판만
create table if not exists public.seed10k_room_priv (
  code text primary key references public.seed10k_rooms(code) on delete cascade,
  priv jsonb not null default '{}'
);
alter table public.seed10k_room_priv enable row level security;

-- 3) 요청: 본인 것만 넣고 읽는다. 처리 결과(done, ok, err, res)는 심판이 적는다
create table if not exists public.seed10k_room_reqs (
  id bigint generated always as identity primary key,
  code text not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null,                     -- create / join / leave / start / act / again
  arg jsonb not null default '{}',
  at timestamptz not null default now(),
  done boolean not null default false,
  ok boolean, err text, res jsonb
);
create index if not exists seed10k_room_reqs_todo on public.seed10k_room_reqs (done, id);
alter table public.seed10k_room_reqs enable row level security;
drop policy if exists "seed10k_room_reqs_insert_own" on public.seed10k_room_reqs;
drop policy if exists "seed10k_room_reqs_select_own" on public.seed10k_room_reqs;
create policy "seed10k_room_reqs_insert_own" on public.seed10k_room_reqs for insert
  with check (auth.uid() = user_id and done = false and ok is null and err is null and res is null);
create policy "seed10k_room_reqs_select_own" on public.seed10k_room_reqs for select using (auth.uid() = user_id);

-- 4) 받을 돈: 심판이 적고, 본인은 읽기와 '받음' 표시(claimed_at)만 할 수 있다
create table if not exists public.seed10k_payouts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code text, game text, mode text,
  cost numeric not null default 0,        -- 그 판에 낸 돈 (판돈 + 블랙잭 더블·스플릿)
  amount numeric not null default 0,      -- 받을 돈
  il boolean not null default false,      -- 불법 방이면 받을 때 경찰 단속 확률이 있다
  note text,
  at timestamptz not null default now(),
  claimed_at timestamptz
);
create index if not exists seed10k_payouts_user on public.seed10k_payouts (user_id, claimed_at);
alter table public.seed10k_payouts enable row level security;
drop policy if exists "seed10k_payouts_select_own" on public.seed10k_payouts;
drop policy if exists "seed10k_payouts_claim_own" on public.seed10k_payouts;
create policy "seed10k_payouts_select_own" on public.seed10k_payouts for select using (auth.uid() = user_id);
create policy "seed10k_payouts_claim_own" on public.seed10k_payouts for update
  using (auth.uid() = user_id and claimed_at is null) with check (auth.uid() = user_id);
revoke update on public.seed10k_payouts from anon, authenticated;
grant update (claimed_at) on public.seed10k_payouts to authenticated;   -- 금액은 못 고치고 받음 표시만

-- 5) 실시간: 방과 받을 돈이 바뀌면 화면에 바로 알린다
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seed10k_rooms') then
    alter publication supabase_realtime add table public.seed10k_rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seed10k_payouts') then
    alter publication supabase_realtime add table public.seed10k_payouts;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seed10k_room_reqs') then
    alter publication supabase_realtime add table public.seed10k_room_reqs;
  end if;
end $$;
