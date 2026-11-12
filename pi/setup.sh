#!/bin/sh
# SEED 10K 라즈베리파이 한 번만 실행: 1분마다 자동 업데이트(cron) 켜기 + 지금 심판·수집기 다시 켜기
# 사용: cd ~/seed10k && git pull && sh pi/setup.sh   (여러 번 실행해도 cron 줄은 하나만 남는다)
DIR=$(cd "$(dirname "$0")/.." && pwd)
LINE="* * * * * /usr/bin/python3 $DIR/pi/update.py >> $HOME/seed10k-update.log 2>&1"
if ! command -v crontab >/dev/null 2>&1; then
  echo "crontab이 없어 cron을 설치합니다 (sudo 비밀번호를 물을 수 있습니다)"
  sudo apt-get install -y cron || { echo "cron 설치 실패: 'sudo apt-get install -y cron'을 직접 실행한 뒤 다시 해 주세요"; exit 1; }
fi
sudo systemctl enable --now cron >/dev/null 2>&1 || true   # cron 서비스가 꺼져 있으면 켠다
( crontab -l 2>/dev/null | grep -v 'pi/update.py' ; echo "$LINE" ) | crontab - || { echo "crontab 등록 실패"; exit 1; }
cd "$DIR/pi" && docker compose up -d && docker compose restart seed10k-referee
echo
if crontab -l 2>/dev/null | grep -q 'pi/update.py'; then
  echo "완료. 자동 업데이트 설정:"; crontab -l | grep 'pi/update.py'
  echo "cron 서비스: $(systemctl is-active cron 2>/dev/null || echo 알 수 없음)"
else
  echo "자동 업데이트 등록이 확인되지 않습니다. 'crontab -l' 결과를 보내 주세요"
fi
