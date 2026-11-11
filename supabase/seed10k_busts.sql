-- SEED 10K: 불법 도박 경찰 단속 횟수 (랭킹 이름 옆 빨간 Xn)
-- 단속될 때마다 게임이 한 줄씩 넣는다. 누구나 읽을 수 있고, 본인 것만 넣을 수 있고, 고치기·지우기는 아무도 못 한다(SQL 편집기 제외)
create table if not exists public.seed10k_busts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  game text                                -- bm(주사위 세계여행) / sl(뱀사다리) / oe(홀짝) / past(이 표가 생기기 전 단속)
);
create index if not exists seed10k_busts_user on public.seed10k_busts (user_id);
alter table public.seed10k_busts enable row level security;
drop policy if exists "seed10k_busts_select_all" on public.seed10k_busts;
drop policy if exists "seed10k_busts_insert_own" on public.seed10k_busts;
create policy "seed10k_busts_select_all" on public.seed10k_busts for select using (true);
create policy "seed10k_busts_insert_own" on public.seed10k_busts for insert with check (auth.uid() = user_id);

-- 이 표가 생기기 전의 단속: 각자 저장 기록의 단속 횟수(모드별 합)만큼 채운다. 빨간 줄만 있고 횟수 기록이 없으면 1회.
-- 이미 이 표에 줄이 있는 사람은 건너뛰므로 여러 번 실행해도 두 번 들어가지 않는다
with c as (
  select u.user_id,
         greatest(coalesce(sv.cnt, 0), case when b.user_id is not null then 1 else 0 end) as cnt,   -- 저장 기록의 횟수, 빨간 줄만 있으면 1
         b.at
  from (select user_id from public.seed10k_saves union select user_id from public.seed10k_busted) u
  left join (select user_id, sum(coalesce((data->'gam'->>'bust')::int, 0)) as cnt from public.seed10k_saves group by user_id) sv on sv.user_id = u.user_id
  left join public.seed10k_busted b on b.user_id = u.user_id
)
insert into public.seed10k_busts (user_id, at, game)
select c.user_id, coalesce(c.at, now()), 'past'
from c cross join lateral generate_series(1, c.cnt::int) g
where c.cnt > 0 and not exists (select 1 from public.seed10k_busts x where x.user_id = c.user_id);
