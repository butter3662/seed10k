-- SEED 10K 관리자: 관리 탭(유저 검색·최근 기록), 멀티플레이 판 결과 기록, 악용 의심 알림
-- 여러 번 실행해도 된다. 관리자 지정은 이 파일에 넣지 않는다 (저장소가 공개라 이메일이 드러나지 않게).
-- 관리자를 정할 때는 SQL 편집기에서 따로 한 줄을 실행한다:
--   insert into public.seed10k_admins (user_id) select id from auth.users where email = '관리자 이메일' on conflict do nothing;

-- 1) 관리자 목록: 본인 줄만 읽을 수 있다 (사이트가 '내가 관리자인가'만 확인). 넣고 빼기는 SQL 편집기에서만
create table if not exists public.seed10k_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now()
);
alter table public.seed10k_admins enable row level security;
drop policy if exists "seed10k_admins_select_own" on public.seed10k_admins;
create policy "seed10k_admins_select_own" on public.seed10k_admins for select using (auth.uid() = user_id);

-- 지금 로그인한 사람이 관리자인가 (정책 안에서 쓴다. security definer라 관리자 표의 정책에 막히지 않는다)
create or replace function public.seed10k_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seed10k_admins where user_id = auth.uid());
$$;
revoke all on function public.seed10k_is_admin() from public;
grant execute on function public.seed10k_is_admin() to anon, authenticated;

-- 2) 관리자는 모든 계정의 기록을 읽을 수 있다 (쓰기는 그대로 본인만)
drop policy if exists "seed10k_saves_select_admin" on public.seed10k_saves;
create policy "seed10k_saves_select_admin" on public.seed10k_saves for select using (public.seed10k_is_admin());
drop policy if exists "seed10k_bmlog_select_admin" on public.seed10k_bmlog;
create policy "seed10k_bmlog_select_admin" on public.seed10k_bmlog for select using (public.seed10k_is_admin());
drop policy if exists "seed10k_payouts_select_admin" on public.seed10k_payouts;
create policy "seed10k_payouts_select_admin" on public.seed10k_payouts for select using (public.seed10k_is_admin());

-- 3) 멀티플레이 판 결과: 판이 끝날 때 심판이 한 줄씩 적는다. 관리자만 읽는다
create table if not exists public.seed10k_mp_results (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  code text, game text, mode text,
  stake numeric, il boolean,
  uids uuid[] not null,                   -- 자리 순서대로 참가자
  seats jsonb,                            -- [{uid, nick, left}]
  win int,                                -- 이긴 자리 번호 (없으면 null)
  winner uuid,                            -- 이긴 사람
  pair text,                              -- 2명 판이면 두 사람 id를 정렬해 이은 것 (같은 상대와의 연승 확인용)
  why text,                               -- 끝난 까닭 (3점 먼저, 상대가 나감 등)
  summary jsonb                           -- 점수·위치 등
);
create index if not exists seed10k_mp_results_pair on public.seed10k_mp_results (game, pair, id desc);
create index if not exists seed10k_mp_results_uids on public.seed10k_mp_results using gin (uids);
alter table public.seed10k_mp_results enable row level security;
drop policy if exists "seed10k_mp_results_select_admin" on public.seed10k_mp_results;
create policy "seed10k_mp_results_select_admin" on public.seed10k_mp_results for select using (public.seed10k_is_admin());

-- 4) 악용 의심 알림: 심판이 적고, 관리자가 읽고 '확인함' 표시만 한다
create table if not exists public.seed10k_alerts (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null,                     -- oe_streak 홀짝 같은 상대 연승 / bj_stand 블랙잭 계속 스탠드 / bm_nobuy 주사위 세계여행 땅 안 사기
  game text, code text, mode text,
  uid uuid,                               -- 의심 대상 (돈을 넘겨받는 쪽이 아니라 이상하게 행동한 쪽이면 그 사람)
  other uuid,                             -- 상대
  msg text not null,                      -- 사람이 읽을 설명
  detail jsonb,
  seen boolean not null default false
);
create index if not exists seed10k_alerts_at on public.seed10k_alerts (id desc);
alter table public.seed10k_alerts enable row level security;
drop policy if exists "seed10k_alerts_select_admin" on public.seed10k_alerts;
drop policy if exists "seed10k_alerts_update_admin" on public.seed10k_alerts;
create policy "seed10k_alerts_select_admin" on public.seed10k_alerts for select using (public.seed10k_is_admin());
create policy "seed10k_alerts_update_admin" on public.seed10k_alerts for update using (public.seed10k_is_admin()) with check (public.seed10k_is_admin());
revoke update on public.seed10k_alerts from anon, authenticated;
grant update (seen) on public.seed10k_alerts to authenticated;   -- '확인함' 표시만

-- 4-2) 멀티플레이 제한 (부정행위 적발): 관리자가 넣고 뺀다. 본인은 제한됐는지만 읽는다. 심판은 제한된 계정의 방 만들기·참가를 거절한다
create table if not exists public.seed10k_mp_bans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  reason text
);
alter table public.seed10k_mp_bans enable row level security;
drop policy if exists "seed10k_mp_bans_select" on public.seed10k_mp_bans;
drop policy if exists "seed10k_mp_bans_insert_admin" on public.seed10k_mp_bans;
drop policy if exists "seed10k_mp_bans_delete_admin" on public.seed10k_mp_bans;
create policy "seed10k_mp_bans_select" on public.seed10k_mp_bans for select using (auth.uid() = user_id or public.seed10k_is_admin());
create policy "seed10k_mp_bans_insert_admin" on public.seed10k_mp_bans for insert with check (public.seed10k_is_admin());
create policy "seed10k_mp_bans_delete_admin" on public.seed10k_mp_bans for delete using (public.seed10k_is_admin());

-- 5) 유저 검색 (관리자만): 이메일·닉네임 일부로 찾는다
create or replace function public.seed10k_admin_users(q text)
returns table (user_id uuid, email text, nickname text, joined timestamptz, last_save timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.seed10k_is_admin() then raise exception '관리자만 쓸 수 있습니다'; end if;
  return query
  select u.id, u.email::text,
         coalesce((select r.nickname from public.seed10k_ranks r where r.user_id = u.id order by r.updated_at desc limit 1), u.raw_user_meta_data->>'nickname'),
         u.created_at,
         (select max(s.updated_at) from public.seed10k_saves s where s.user_id = u.id)
  from auth.users u
  where coalesce(q, '') = ''
     or u.email ilike '%' || q || '%'
     or coalesce(u.raw_user_meta_data->>'nickname', '') ilike '%' || q || '%'
     or exists (select 1 from public.seed10k_ranks r where r.user_id = u.id and r.nickname ilike '%' || q || '%')
  order by 5 desc nulls last, 4 desc
  limit 40;
end $$;
revoke all on function public.seed10k_admin_users(text) from public;
grant execute on function public.seed10k_admin_users(text) to authenticated;

-- 6) 실시간: 알림이 생기면 관리자 화면에 바로 뜬다
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'seed10k_alerts') then
    alter publication supabase_realtime add table public.seed10k_alerts;
  end if;
end $$;
