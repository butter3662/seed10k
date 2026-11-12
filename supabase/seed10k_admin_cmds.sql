-- SEED 10K 관리 탭의 '서버 업데이트' 버튼
-- 관리자가 요청 한 줄을 넣으면, 라즈베리파이의 pi/update.py(cron 1분마다)가 git pull + 심판 재시작을 하고 결과를 적는다.
-- seed10k_admin.sql을 먼저 실행해야 한다 (seed10k_is_admin). 여러 번 실행해도 된다.
create table if not exists public.seed10k_admin_cmds (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  by uuid default auth.uid(),
  kind text not null default 'update',
  done boolean not null default false,
  ok boolean,
  result text,
  done_at timestamptz
);
alter table public.seed10k_admin_cmds enable row level security;
drop policy if exists "seed10k_admin_cmds_select" on public.seed10k_admin_cmds;
drop policy if exists "seed10k_admin_cmds_insert" on public.seed10k_admin_cmds;
create policy "seed10k_admin_cmds_select" on public.seed10k_admin_cmds for select using (public.seed10k_is_admin());
create policy "seed10k_admin_cmds_insert" on public.seed10k_admin_cmds for insert
  with check (public.seed10k_is_admin() and kind = 'update' and done = false and ok is null and result is null and done_at is null);
