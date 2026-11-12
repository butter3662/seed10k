# SEED 10K 시세 수집기 + 멀티플레이 심판 — 라즈베리파이

Supabase Edge Function과 **같은 코드**(`supabase/functions/seed10k-quotes/index.ts`의 `run()`)를 파이에서 7초마다 돌린다.

```
평소:      파이 ──7초마다──> 네이버·야후 ──> Supabase DB   (+ _beatPi 시각 기록)
           Supabase Cron ──7초마다──> "_beatPi가 30초 안인가?" → 예 → 아무것도 안 함 (함수 호출 0회)
파이 장애: Supabase Cron ──> _beatPi가 30초 넘게 멈춤 → seed10k-quotes 함수 호출 (예전처럼)
복구:      파이가 다시 _beatPi를 남기면 Supabase는 다시 쉰다
```

두 곳이 동시에 돌아도 `run()` 안의 `_fast`(4초)·`_run`(55초) 표시가 같은 작업이 겹치지 않게 막는다.

## 설치 (파이에서, 한 번만)

아래는 사용자 이름이 `butter3662`인 기준이다.

### 1. 내려받기
```bash
git clone --depth 1 https://github.com/butter3662/seed10k.git /home/butter3662/seed10k
cp /home/butter3662/seed10k/pi/env.example /home/butter3662/seed10k/pi/.env
chmod 600 /home/butter3662/seed10k/pi/.env
```

### 2. 비밀 키 넣기 (한 줄씩)
Supabase 대시보드 → Project Settings → **API Keys** → Secret keys에서 새 비밀 키(이름 예: `pi`)를 만들고 복사한다. `sb_secret_`으로 시작한다.

```bash
read -p "Supabase 비밀 키 붙여넣고 Enter: " K && sed -i "s|^SUPABASE_SERVICE_ROLE_KEY=.*|SUPABASE_SERVICE_ROLE_KEY=$K|" /home/butter3662/seed10k/pi/.env
```

Edge Function 비밀값에 네이버 뉴스·DART 키를 넣어 두었다면 같은 값을 넣는다 (없으면 건너뛴다).
```bash
read -p "NAVER_CLIENT_ID: " V && sed -i "s|^NAVER_CLIENT_ID=.*|NAVER_CLIENT_ID=$V|" /home/butter3662/seed10k/pi/.env
read -p "NAVER_CLIENT_SECRET: " V && sed -i "s|^NAVER_CLIENT_SECRET=.*|NAVER_CLIENT_SECRET=$V|" /home/butter3662/seed10k/pi/.env
read -p "DART_API_KEY: " V && sed -i "s|^DART_API_KEY=.*|DART_API_KEY=$V|" /home/butter3662/seed10k/pi/.env
```

### 3. 실행
```bash
cd /home/butter3662/seed10k/pi
docker compose pull
docker compose up -d
docker compose logs --tail 20
```
`[seed10k-pi] 시작: 7초마다 시세 수집`이 보이면 된다. 파이를 다시 켜도 자동으로 다시 돈다.

### 4. Supabase를 예비로 바꾸기 (Supabase SQL Editor에서)
`supabase/seed10k_pi_backup.sql` 내용을 붙여 넣고 실행한다.

## 확인
- Supabase → Table Editor → `seed10k_quotes`에서 `_beatPi` 줄의 `updated_at`이 7초마다 바뀐다.
- Supabase → Edge Functions → `seed10k-quotes` → 호출 수가 0 근처로 떨어진다.
- 예비 시험: 파이에서 `docker compose stop` → 30초쯤 뒤부터 Edge Function 호출이 다시 생긴다 → `docker compose start`로 되돌린다.

## 자주 쓰는 명령 (`/home/butter3662/seed10k/pi`에서)
| 하고 싶은 것 | 명령 |
|---|---|
| 로그 보기 | `docker compose logs -f --tail 50` (나가기 `Ctrl+C`) |
| 멈추기 / 다시 켜기 | `docker compose stop` / `docker compose start` |
| 코드 업데이트 | `cd /home/butter3662/seed10k && git pull && cd pi && docker compose restart` |

## 되돌리기
Supabase에서 `seed10k_setup.sql`의 5) 일정을 다시 실행하고, 파이에서 `docker compose down`.

## 멀티플레이 심판 (방 코드로 같이 하기)

`docker compose`가 시세 수집기 옆에 `seed10k-referee`를 하나 더 띄운다. 같은 `pi/.env`(Supabase 주소·비밀 키)를 쓴다.

```
사이트 ──요청──> seed10k_room_reqs ──실시간 알림──> 파이 심판 (pi/referee.ts + pi/mp_core.js)
파이 심판 ──결과──> seed10k_rooms(모두에게 보이는 상태) · seed10k_room_priv(숨긴 값) · seed10k_payouts(받을 돈)
```
파이는 Supabase로 나가는 연결만 쓰고, 공유기 포트를 열 필요가 없다. 와이파이가 잠깐 끊겨도 다시 연결되면 남은 요청을 이어서 처리한다.

### 처음 한 번
1. Supabase SQL Editor에서 `supabase/seed10k_multi.sql`을 실행한다.
2. 파이에서:
```bash
cd /home/butter3662/seed10k && git pull && cd pi && docker compose up -d
docker compose logs --tail 20 seed10k-referee
```
`[seed10k-ref] 시작: 진행 중인 방 0개`와 `실시간 연결: SUBSCRIBED`가 보이면 된다.

### 확인
- Supabase → Table Editor → `seed10k_rooms`의 `__ref` 줄 `state.at`이 10초마다 바뀐다. 사이트의 "같이 하기" 카드에 "게임 서버 켜짐"이 보인다.
- 심판이 꺼지면 사이트는 "게임 서버 꺼짐"을 보여 주고 새 방을 만들지 않는다. 진행 중인 방은 그대로 남아 있다가 심판이 다시 켜지면 이어진다.

| 하고 싶은 것 | 명령 (`/home/butter3662/seed10k/pi`에서) |
|---|---|
| 심판 로그 | `docker compose logs -f --tail 50 seed10k-referee` |
| 심판만 다시 켜기 | `docker compose restart seed10k-referee` |

## 부정행위 감시 (관리 탭)

`supabase/seed10k_admin.sql`을 SQL 편집기에서 한 번 실행하면 판 결과 기록(`seed10k_mp_results`), 알림(`seed10k_alerts`), 멀티플레이 제한(`seed10k_mp_bans`) 표가 생긴다. 관리자 지정은 그 파일에 넣지 않고 SQL 편집기에서 따로 한 줄로 한다.

- 심판은 판이 끝날 때마다 결과를 적고, 홀짝 대결에서 같은 상대에게 5연승(이후 10, 15…)하면 알림을 적는다.
- 제한된 계정은 방을 만들거나 들어오거나 "한 판 더"를 열 수 없다.

### 휴대폰 알림 (선택, ntfy)

사이트를 안 열어도 휴대폰으로 받고 싶으면 [ntfy](https://docs.ntfy.sh/) 앱을 깔고, 남이 못 맞힐 긴 주제 이름(예: `seed10k-` 뒤에 무작위 글자 20자)을 구독한 뒤 `.env`에 한 줄 넣는다. 주제 이름을 아는 사람은 누구나 구독할 수 있으니 비밀번호처럼 다룬다.

```bash
echo 'NTFY_TOPIC=seed10k-여기에무작위글자' >> .env
docker compose up -d --force-recreate seed10k-referee
```
