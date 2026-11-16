-- 친구: 닉네임으로 신청 → 받은 사람이 수락하면 서로 친구. 같이 하기의 '접속 중'·대결 신청·관전은 친구끼리만.
-- 표는 직접 못 고치고(정책 없음) 아래 함수로만 바꾼다. 읽기는 자기가 낀 줄만.
create table if not exists public.seed10k_friends (
  id bigint generated always as identity primary key,
  a uuid not null references auth.users(id) on delete cascade,   -- 신청한 사람
  b uuid not null references auth.users(id) on delete cascade,   -- 신청 받은 사람
  status text not null default 'pending' check (status in ('pending', 'ok')),
  at timestamptz not null default now(),
  unique (a, b)
);
create index if not exists seed10k_friends_b on public.seed10k_friends (b);
alter table public.seed10k_friends enable row level security;
drop policy if exists "seed10k_friends_select" on public.seed10k_friends;
create policy "seed10k_friends_select" on public.seed10k_friends for select using (auth.uid() = a or auth.uid() = b or public.seed10k_is_admin());

-- 닉네임 → 계정 (랭킹 이름 먼저, 없으면 가입 때 정한 닉네임). 같은 이름이 여러 계정이면 null
create or replace function public.seed10k_nick_uid(name text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare ids uuid[];
begin
  select array_agg(distinct r.user_id) into ids from public.seed10k_ranks r where public.seed10k_nick_norm(r.nickname) = public.seed10k_nick_norm(name);
  if ids is null then
    select array_agg(u.id) into ids from auth.users u where public.seed10k_nick_norm(u.raw_user_meta_data->>'nickname') = public.seed10k_nick_norm(name);
  end if;
  if ids is null or array_length(ids, 1) <> 1 then return null; end if;
  return ids[1];
end $$;
revoke all on function public.seed10k_nick_uid(text) from public, anon, authenticated;

create or replace function public.seed10k_friend_request(nick text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t uuid; r record;
begin
  if me is null then return jsonb_build_object('ok', false, 'err', '로그인이 필요합니다'); end if;
  t := public.seed10k_nick_uid(nick);
  if t is null then return jsonb_build_object('ok', false, 'err', '그 닉네임을 쓰는 사람을 찾지 못했습니다'); end if;
  if t = me then return jsonb_build_object('ok', false, 'err', '자기 자신은 친구로 추가할 수 없습니다'); end if;
  select * into r from public.seed10k_friends where (a = me and b = t) or (a = t and b = me);
  if found then
    if r.status = 'ok' then return jsonb_build_object('ok', false, 'err', '이미 친구입니다'); end if;
    if r.a = t then update public.seed10k_friends set status = 'ok', at = now() where id = r.id; return jsonb_build_object('ok', true, 'res', 'accepted'); end if;
    return jsonb_build_object('ok', false, 'err', '이미 신청했습니다. 상대가 수락하면 친구가 됩니다');
  end if;
  if (select count(*) from public.seed10k_friends where a = me and status = 'pending') >= 50 then return jsonb_build_object('ok', false, 'err', '보낸 신청이 너무 많습니다'); end if;
  insert into public.seed10k_friends (a, b) values (me, t);
  return jsonb_build_object('ok', true, 'res', 'sent');
end $$;

create or replace function public.seed10k_friend_respond(fid bigint, accept boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if accept then update public.seed10k_friends set status = 'ok', at = now() where id = fid and b = me and status = 'pending';
  else delete from public.seed10k_friends where id = fid and (b = me or a = me) and status = 'pending'; end if;   -- 거절(받은 사람) · 취소(보낸 사람)
  return jsonb_build_object('ok', found);
end $$;

create or replace function public.seed10k_friend_remove(other uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  delete from public.seed10k_friends where (a = me and b = other) or (a = other and b = me);
  return jsonb_build_object('ok', found);
end $$;

-- 내 친구·신청 목록 (상대 닉네임 붙여서). dir: friend = 친구, in = 받은 신청, out = 보낸 신청
create or replace function public.seed10k_friends_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'uid', o.uid, 'at', f.at,
           'dir', case when f.status = 'ok' then 'friend' when f.b = auth.uid() then 'in' else 'out' end,
           'nick', coalesce((select r.nickname from public.seed10k_ranks r where r.user_id = o.uid order by r.updated_at desc limit 1),
                            (select u.raw_user_meta_data->>'nickname' from auth.users u where u.id = o.uid), '?')) order by f.at desc), '[]'::jsonb)
  from public.seed10k_friends f
  cross join lateral (select case when f.a = auth.uid() then f.b else f.a end as uid) o
  where f.a = auth.uid() or f.b = auth.uid();
$$;
revoke all on function public.seed10k_friend_request(text), public.seed10k_friend_respond(bigint, boolean), public.seed10k_friend_remove(uuid), public.seed10k_friends_list() from public, anon;
grant execute on function public.seed10k_friend_request(text), public.seed10k_friend_respond(bigint, boolean), public.seed10k_friend_remove(uuid), public.seed10k_friends_list() to authenticated;
