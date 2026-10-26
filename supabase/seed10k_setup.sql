-- SEED 10K: 게임 기록 저장, 랭킹, 실시간 시세 (여러 번 실행해도 된다)

-- 1) 게임 기록 저장 (계정마다 모드별 한 줄, 본인만 읽고 씀)
create table if not exists public.seed10k_saves (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('live', 'sim')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode)
);
alter table public.seed10k_saves enable row level security;
drop policy if exists "seed10k_saves_select_own" on public.seed10k_saves;
drop policy if exists "seed10k_saves_insert_own" on public.seed10k_saves;
drop policy if exists "seed10k_saves_update_own" on public.seed10k_saves;
drop policy if exists "seed10k_saves_delete_own" on public.seed10k_saves;
create policy "seed10k_saves_select_own" on public.seed10k_saves for select using (auth.uid() = user_id);
create policy "seed10k_saves_insert_own" on public.seed10k_saves for insert with check (auth.uid() = user_id);
create policy "seed10k_saves_update_own" on public.seed10k_saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "seed10k_saves_delete_own" on public.seed10k_saves for delete using (auth.uid() = user_id);

-- 2) 랭킹 (누구나 읽고, 본인 줄만 씀)
create table if not exists public.seed10k_ranks (
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null check (mode in ('live', 'sim')),
  nickname text not null check (char_length(nickname) between 2 and 12),
  net_worth numeric not null,
  return_pct numeric not null check (return_pct between -100 and 100000),
  days integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, mode)
);
alter table public.seed10k_ranks enable row level security;
drop policy if exists "seed10k_ranks_select_all" on public.seed10k_ranks;
drop policy if exists "seed10k_ranks_insert_own" on public.seed10k_ranks;
drop policy if exists "seed10k_ranks_update_own" on public.seed10k_ranks;
drop policy if exists "seed10k_ranks_delete_own" on public.seed10k_ranks;
create policy "seed10k_ranks_select_all" on public.seed10k_ranks for select using (true);
create policy "seed10k_ranks_insert_own" on public.seed10k_ranks for insert with check (auth.uid() = user_id);
create policy "seed10k_ranks_update_own" on public.seed10k_ranks for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "seed10k_ranks_delete_own" on public.seed10k_ranks for delete using (auth.uid() = user_id);
create index if not exists seed10k_ranks_mode_return on public.seed10k_ranks (mode, return_pct desc);

-- 3) 실시간 시세 표 (누구나 읽고, 쓰기는 seed10k-quotes 함수만)
create table if not exists public.seed10k_quotes (
  id text primary key,
  ysym text not null,
  m text not null check (m in ('KR', 'US', 'FX', 'SYS')),
  p numeric,
  t timestamptz,
  d date,
  i jsonb,
  updated_at timestamptz
);
alter table public.seed10k_quotes enable row level security;
drop policy if exists "seed10k_quotes_select_all" on public.seed10k_quotes;
create policy "seed10k_quotes_select_all" on public.seed10k_quotes for select using (true);

insert into public.seed10k_quotes (id, ysym, m)
select 'KR:' || s, s || '.KS', 'KR' from unnest(string_to_array('005930,000660,402340,373220,005380,207940,105560,028260,068270,032830,000270,055550,012450,034020,329180,086790,009150,012330,066570,035420,000810,034730,096770,010120,316140,011200,005490,138040,033780,042700,015760,051910,009540,298040,010130,042660,267260,018260,000150,006400,017670,024110,010950,003550,010140,003670,035720,086280,272210,028050,005830,030200,278470,000720,079550,047810,267250,323410,003230,005940,064350,011070,307950,090430,443060,047050,071050,0126Z0,078930,180640,259960,003490,352820,021240,161390,064400,016360,009830,353200,007660,000100,000880,047040,326030,032640,006260,039490,006800,062040,241560,175330,377300,128940,029780', ',')) s
union all
select 'KR:' || s, s || '.KQ', 'KR' from unnest(string_to_array('196170,086520,247540,277810,058470,240810', ',')) s
union all
select 'US:' || s, s, 'US' from unnest(string_to_array('NVDA,AAPL,MSFT,GOOG,AMZN,SPCX,META,AVGO,TSLA,BRK-B,LLY,MU,WMT,JPM,AMD,V,XOM,JNJ,MA,ABBV,PLTR,INTC,CVX,COST,CSCO,KO,ORCL,UNH,PG,MRK,BAC,HD,CAT,PANW,PM,AMAT,GE,DELL,LRCX,MS,NFLX,CRWD,TXN,RTX,GS,TMO,WFC,IBM,AMGN,ANET,GEV,AXP,MRVL,CRM,C,DIS,GILD,KLAC,ADI,QCOM,VZ,PEP,APH,BLK,COP,ABT,SNDK,MCD,DE,UNP,NEE,PFE,WELL,NOW,DHR,TJX,ISRG,TMUS,SCHW,SCCO,BA,BX,T,LMT,IBKR,UBER,MPC,SPGI,VRTX,PGR,FTNT,WDC,BMY,MO,COF,PLD,BKNG,VLO,ADP,CVS', ',')) s
union all
select 'FX', 'KRW=X', 'FX'
on conflict (id) do update set ysym = excluded.ysym, m = excluded.m;

-- 4) 거래일별 마지막 가격 (누구나 읽고, 쓰기는 함수만)
create table if not exists public.seed10k_daily (
  id text not null,
  d date not null,
  c numeric not null,
  primary key (id, d)
);
alter table public.seed10k_daily enable row level security;
drop policy if exists "seed10k_daily_select_all" on public.seed10k_daily;
create policy "seed10k_daily_select_all" on public.seed10k_daily for select using (true);

-- 5) 1분마다 seed10k-quotes 함수 부르기
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'seed10k-quotes',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://ictjkqbbcaigdvlysdaw.supabase.co/functions/v1/seed10k-quotes',
       headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_C7jZEKJn_nF2Y3Ngq5f80Q_RA5Wrfux'),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);
