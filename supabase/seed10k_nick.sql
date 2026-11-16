-- 랭킹 닉네임 중복 막기. 비교는 앞뒤 공백을 빼고 대소문자를 무시한다 ('Abcd' = ' abcd').
-- 다른 계정이 랭킹이나 계정 정보(가입 때 정한 닉네임)에서 이미 쓰는 이름이면 새로 쓰지 못한다.
-- 이미 겹쳐 있던 사람들은 그대로 둔다: 자기 랭킹 줄에 이미 그 이름이 있으면(이름을 바꾸지 않은 갱신) 통과.
create or replace function public.seed10k_nick_norm(n text) returns text language sql immutable as $$ select lower(btrim(coalesce(n, ''))) $$;

-- 사이트가 저장 전에 묻는다: 이 이름을 다른 계정이 쓰고 있나 (로그인 전 가입 화면에서도 씀)
create or replace function public.seed10k_nick_taken(name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seed10k_ranks r where public.seed10k_nick_norm(r.nickname) = public.seed10k_nick_norm(name)
                   and r.user_id is distinct from auth.uid())
      or exists (select 1 from auth.users u where public.seed10k_nick_norm(u.raw_user_meta_data->>'nickname') = public.seed10k_nick_norm(name)
                   and u.id is distinct from auth.uid());
$$;
revoke all on function public.seed10k_nick_taken(text) from public;
grant execute on function public.seed10k_nick_taken(text) to anon, authenticated;

-- 랭킹 줄을 넣거나 이름을 바꿀 때 서버가 막는다 (사이트를 고쳐도 못 피함)
create or replace function public.seed10k_ranks_nick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and public.seed10k_nick_norm(new.nickname) = public.seed10k_nick_norm(old.nickname) then return new; end if;
  if exists (select 1 from public.seed10k_ranks r where r.user_id = new.user_id and public.seed10k_nick_norm(r.nickname) = public.seed10k_nick_norm(new.nickname)) then return new; end if;   -- 이미 쓰던 이름
  if exists (select 1 from public.seed10k_ranks r where r.user_id <> new.user_id and public.seed10k_nick_norm(r.nickname) = public.seed10k_nick_norm(new.nickname)) then
    raise exception 'nickname_taken' using errcode = 'P0001', hint = '다른 사람이 쓰는 닉네임입니다';
  end if;
  return new;
end $$;
drop trigger if exists seed10k_ranks_nick on public.seed10k_ranks;
create trigger seed10k_ranks_nick before insert or update of nickname on public.seed10k_ranks for each row execute function public.seed10k_ranks_nick();
