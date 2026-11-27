-- 환생하기 전 도박 결과 보관: 환생하면 저장 기록(altLog)이 지워지므로, 지우기 전에 도박 줄만 여기에 올린다 (관리 탭 승률 전체 집계용). 여러 번 실행해도 된다.
create table if not exists public.seed10k_wr_archive (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  mode text check (mode in ('live', 'sim')),
  lines jsonb not null default '[]'::jsonb check (char_length(lines::text) <= 200000)
);
create index if not exists seed10k_wr_archive_user on public.seed10k_wr_archive (user_id);
alter table public.seed10k_wr_archive enable row level security;
drop policy if exists "seed10k_wr_archive_insert_own" on public.seed10k_wr_archive;
drop policy if exists "seed10k_wr_archive_select_admin" on public.seed10k_wr_archive;
create policy "seed10k_wr_archive_insert_own" on public.seed10k_wr_archive for insert to authenticated with check (user_id = auth.uid());
create policy "seed10k_wr_archive_select_admin" on public.seed10k_wr_archive for select using (public.seed10k_is_admin());
revoke all on public.seed10k_wr_archive from anon, authenticated;
grant insert (mode, lines) on public.seed10k_wr_archive to authenticated;
grant select on public.seed10k_wr_archive to authenticated;
grant usage on sequence public.seed10k_wr_archive_id_seq to authenticated;
