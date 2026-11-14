-- SEED 10K 상점: 서버가 해야 하는 효과(전과 지우기, 닉네임 색)만 여기서 처리한다. 값은 게임 안의 달러로 낸다.
-- 돈은 사이트(브라우저)에 있으므로, 서버는 '방금 낸 돈 기록'(seed10k_ledger의 why = 'shop:<아이템>', amt ≤ −가격, 30분 안, 아직 안 쓴 것)이
-- 있을 때만 효과를 준다. 기록 한 줄은 한 번만 쓸 수 있다(seed10k_shop_uses). 테스트 계정은 돈 기록을 남기지 않으므로 확인 없이 준다.
-- seed10k_ledger.sql 다음에 실행한다. 여러 번 실행해도 된다.
create table if not exists public.seed10k_namecolors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  color text not null,
  at timestamptz not null default now()
);
alter table public.seed10k_namecolors enable row level security;
drop policy if exists "seed10k_namecolors_select_all" on public.seed10k_namecolors;
create policy "seed10k_namecolors_select_all" on public.seed10k_namecolors for select using (true);   -- 랭킹에 보여야 하므로 누구나 읽는다. 쓰기는 아래 함수만

create table if not exists public.seed10k_shop_uses (
  ledger_id bigint primary key,
  user_id uuid not null,
  item text not null,
  at timestamptz not null default now()
);
alter table public.seed10k_shop_uses enable row level security;
drop policy if exists "seed10k_shop_uses_select" on public.seed10k_shop_uses;
create policy "seed10k_shop_uses_select" on public.seed10k_shop_uses for select using (auth.uid() = user_id or public.seed10k_is_admin());

create or replace function public.seed10k_shop_redeem(item text, arg text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); price numeric; lid bigint; bid bigint; n int; tester boolean;
begin
  if uid is null then return jsonb_build_object('ok', false, 'err', '로그인이 필요합니다'); end if;
  price := case item when 'record' then 500 when 'color' then 300 else null end;
  if price is null then return jsonb_build_object('ok', false, 'err', '모르는 아이템입니다'); end if;
  if item = 'color' and (arg is null or arg !~ '^#[0-9A-Fa-f]{6}$') then return jsonb_build_object('ok', false, 'err', '색이 올바르지 않습니다'); end if;
  tester := exists (select 1 from public.seed10k_testers where user_id = uid);
  if not tester then
    select l.id into lid from public.seed10k_ledger l
      where l.user_id = uid and l.why = 'shop:' || item and l.amt <= -price + 0.01 and l.at > now() - interval '30 minutes'
        and not exists (select 1 from public.seed10k_shop_uses u where u.ledger_id = l.id)
      order by l.id desc limit 1;
    if lid is null then return jsonb_build_object('ok', false, 'err', '결제 기록을 찾지 못했습니다'); end if;
    insert into public.seed10k_shop_uses (ledger_id, user_id, item) values (lid, uid, item);
  end if;
  if item = 'record' then
    select id into bid from public.seed10k_busts where user_id = uid order by at desc, id desc limit 1;
    if bid is not null then delete from public.seed10k_busts where id = bid; end if;
    select count(*) into n from public.seed10k_busts where user_id = uid;
    if n = 0 then delete from public.seed10k_busted where user_id = uid; end if;   -- 전과가 하나도 없으면 랭킹의 빨간 줄도 없앤다
    return jsonb_build_object('ok', true, 'left', n);
  end if;
  insert into public.seed10k_namecolors (user_id, color, at) values (uid, upper(arg), now())
    on conflict (user_id) do update set color = excluded.color, at = excluded.at;
  return jsonb_build_object('ok', true, 'color', upper(arg));
end $$;
revoke all on function public.seed10k_shop_redeem(text, text) from public, anon;
grant execute on function public.seed10k_shop_redeem(text, text) to authenticated;
