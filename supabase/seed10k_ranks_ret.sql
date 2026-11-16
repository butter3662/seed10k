-- 수익률 -100% 아래도 랭킹에 그대로 올린다 (순자산이 마이너스면 -100%보다 더 잃은 것).
-- 처음 만든 표의 return_pct 검사(-100 ~ 100000)를 지우고 아래 끝을 -1000000으로 넓힌다. 여러 번 실행해도 된다.
do $$
declare c record;
begin
  for c in select conname from pg_constraint
           where conrelid = 'public.seed10k_ranks'::regclass and contype = 'c'
             and pg_get_constraintdef(oid) ilike '%return_pct%'
  loop
    execute format('alter table public.seed10k_ranks drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.seed10k_ranks add constraint seed10k_ranks_return_pct_check check (return_pct between -1000000 and 100000);

-- v1.7.7: 수익률 = (순자산 − 포인트) ÷ 10000 − 1. 랭킹 표의 net_worth가 이미 (순자산 − 포인트)라서
-- 서버가 net_worth로 수익률을 직접 계산해 넣는다 (예전 버전 사이트가 올린 값도, 오래 접속 안 한 계정의 값도 맞춰짐)
create or replace function public.seed10k_ranks_ret() returns trigger language plpgsql as $$
begin
  new.return_pct := greatest(-1000000, least(100000, round(new.net_worth / 100.0 - 100, 2)));
  return new;
end $$;
drop trigger if exists seed10k_ranks_ret on public.seed10k_ranks;
create trigger seed10k_ranks_ret before insert or update on public.seed10k_ranks
  for each row execute function public.seed10k_ranks_ret();
update public.seed10k_ranks set return_pct = greatest(-1000000, least(100000, round(net_worth / 100.0 - 100, 2)))
  where return_pct is distinct from greatest(-1000000, least(100000, round(net_worth / 100.0 - 100, 2)));
