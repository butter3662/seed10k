#!/bin/sh
# SEED 10K 라즈베리파이 한 번만 실행: 1분마다 자동 업데이트(cron) 켜기 + 지금 심판·수집기 다시 켜기
# 사용: cd ~/seed10k && git pull && sh pi/setup.sh   (여러 번 실행해도 cron 줄은 하나만 남는다)
set -e
DIR=$(cd "$(dirname "$0")/.." && pwd)
LINE="* * * * * /usr/bin/python3 $DIR/pi/update.py >> $HOME/seed10k-update.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'pi/update.py' ; echo "$LINE" ) | crontab -
cd "$DIR/pi"
docker compose up -d
docker compose restart seed10k-referee
echo
echo "완료. 자동 업데이트 설정:"
crontab -l | grep 'pi/update.py'
