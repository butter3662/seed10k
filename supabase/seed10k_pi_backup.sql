-- SEED 10K: 라즈베리파이를 주 수집기로, Supabase를 예비로 (여러 번 실행해도 된다)
--
-- 7초마다 _beatPi(파이가 마지막으로 수집에 성공한 시각)만 확인하고,
-- 30초 넘게 소식이 없을 때만 seed10k-quotes 함수를 부른다.
-- 파이가 살아 있으면 Edge Function 호출은 0회, 이 확인은 데이터베이스 안에서 끝난다.
select cron.schedule(
  'seed10k-quotes',
  '7 seconds',
  $$ select net.http_post(
       url := 'https://ictjkqbbcaigdvlysdaw.supabase.co/functions/v1/seed10k-quotes',
       headers := jsonb_build_object('Content-Type', 'application/json', 'apikey', 'sb_publishable_C7jZEKJn_nF2Y3Ngq5f80Q_RA5Wrfux'),
       body := '{}'::jsonb,
       timeout_milliseconds := 60000
     )
     where coalesce((select updated_at from public.seed10k_quotes where id = '_beatPi'), 'epoch') < now() - interval '30 seconds' $$
);

-- 되돌리기 (파이를 그만 쓸 때): seed10k_setup.sql의 5) 일정을 다시 실행하면 예전처럼 항상 함수를 부른다.
