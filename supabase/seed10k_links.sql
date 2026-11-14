-- SEED 10K 계정 연결 신호: 게임 서버(심판)가 멀티 방에 들어올 때 계정마다 쓴 기기 ID와 IP 해시를 적는다.
-- 같은 방에 기기·네트워크가 겹치는 두 계정이 있으면 부정행위 의심 알림을 보낸다. IP 원문은 저장하지 않는다.
-- seed10k_admin.sql 다음에 실행한다. 여러 번 실행해도 된다.
create table if not exists public.seed10k_links (
  user_id uuid not null references auth.users(id) on delete cascade,
  dev text not null default '',      -- 사이트가 브라우저에 만들어 둔 무작위 기기 ID
  iph text not null default '',      -- 접속 IP의 해시 (심판만 계산, 원문 없음)
  at timestamptz not null default now(),
  primary key (user_id, dev, iph)
);
create index if not exists seed10k_links_dev on public.seed10k_links (dev);
create index if not exists seed10k_links_iph on public.seed10k_links (iph);
alter table public.seed10k_links enable row level security;
drop policy if exists "seed10k_links_select_admin" on public.seed10k_links;
create policy "seed10k_links_select_admin" on public.seed10k_links for select using (public.seed10k_is_admin());
-- 쓰기는 심판(service_role)만 한다 (정책 없음 = 일반 사용자는 못 씀)
