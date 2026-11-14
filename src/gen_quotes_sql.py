"""seed10k_quotes 표와 1분 예약 작업을 만드는 SQL을 생성한다.

종목 목록은 게임(index.html)의 DATA에서 읽는다. 결과: supabase/seed10k_quotes.sql
사용법: python3 src/gen_quotes_sql.py index.html supabase/seed10k_quotes.sql
"""
import json
import re
import sys

PROJECT_URL = "https://ictjkqbbcaigdvlysdaw.supabase.co"
PUBLISHABLE_KEY = "sb_publishable_C7jZEKJn_nF2Y3Ngq5f80Q_RA5Wrfux"   # 게임 화면에도 들어 있는 공개 키

html = open(sys.argv[1], encoding="utf-8").read()
data = json.loads(re.search(r"const DATA = (\{.*?\});\n", html, re.S).group(1))
rows = []
for s in data["kr"]:
    rows.append((s["id"], s["t"] + (".KQ" if s["x"] == "KOSDAQ" else ".KS"), "KR"))
for s in data["us"]:
    rows.append((s["id"], s["t"], "US"))
rows.append(("FX", "KRW=X", "FX"))

q = lambda v: "'" + v.replace("'", "''") + "'"
values = ",\n  ".join(f"({q(i)}, {q(y)}, {q(m)})" for i, y, m in rows)

sql = f"""-- SEED 10K 실시간 시세 표와 1분 예약 작업
-- Supabase 대시보드 → SQL Editor → New query 에 전부 붙여 넣고 Run.
-- 여러 번 실행해도 된다. (종목 {len(rows) - 1}개 + 환율 1개)

-- 1) 시세 표: 누구나 읽을 수 있고, 쓰기는 seed10k-quotes 함수(비밀 키)만 한다.
create table if not exists public.seed10k_quotes (
  id         text primary key,                 -- 게임 종목 id (KR:005930, US:AAPL), 환율은 FX, 실행 기록은 _run
  ysym       text not null,                    -- 야후 심볼
  m          text not null check (m in ('KR', 'US', 'FX', 'SYS')),
  p          numeric,                          -- 최신 가격
  t          timestamptz,                      -- 그 가격의 시각
  d          date,                             -- 그 가격의 현지 거래일
  i          jsonb,                            -- 그날 5분 봉 {{"t": [유닉스 초], "c": [가격]}}
  updated_at timestamptz
);
alter table public.seed10k_quotes enable row level security;
drop policy if exists "seed10k_quotes_select_all" on public.seed10k_quotes;
create policy "seed10k_quotes_select_all" on public.seed10k_quotes for select using (true);

insert into public.seed10k_quotes (id, ysym, m) values
  {values}
on conflict (id) do update set ysym = excluded.ysym, m = excluded.m;

-- 2) 거래일별 마지막 가격 (장이 끝나면 그날 종가). 누구나 읽고, 쓰기는 함수만.
create table if not exists public.seed10k_daily (
  id text not null,                            -- 게임 종목 id, 환율은 FX
  d  date not null,                            -- 현지 거래일
  c  numeric not null,                         -- 그날 마지막 가격
  primary key (id, d)
);
alter table public.seed10k_daily enable row level security;
drop policy if exists "seed10k_daily_select_all" on public.seed10k_daily;
create policy "seed10k_daily_select_all" on public.seed10k_daily for select using (true);

-- 3) 1분마다 seed10k-quotes 함수를 부른다.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.schedule(
  'seed10k-quotes',
  '* * * * *',
  $$ select net.http_post(
       url := '{PROJECT_URL}/functions/v1/seed10k-quotes',
       headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', '{PUBLISHABLE_KEY}'),
       body := '{{}}'::jsonb,
       timeout_milliseconds := 60000
     ) $$
);
"""
open(sys.argv[2], "w", encoding="utf-8").write(sql)
print(f"wrote {sys.argv[2]}: {len(rows)} rows")
