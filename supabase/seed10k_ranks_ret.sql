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
