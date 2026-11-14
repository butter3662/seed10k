import pathlib
root = pathlib.Path(__file__).resolve().parent
script = (root / 'fetch_prices.py').read_text()
body = '\n'.join(('          ' + l) if l.strip() else '' for l in script.splitlines())
extra = (root / 'fetch_extra.py').read_text()
body2 = '\n'.join(('          ' + l) if l.strip() else '' for l in extra.splitlines())
wf = f'''name: 시세 수집과 배포

# 저장소에 필요한 파일은 index.html, 이 파일, 아이콘 폴더(icons/)다.
# Settings → Pages → Source 를 "GitHub Actions" 로 바꾼 뒤 Actions 탭에서 한 번 실행하면 된다.

on:
  push:
    branches: [main]
  workflow_dispatch:
  schedule:
    # 시간은 모두 UTC 기준이다.
    - cron: '*/5 0-6 * * 1-5'    # 한국 정규장 (한국 시각 09:00~15:55)
    - cron: '*/5 13-21 * * 1-5'  # 미국 정규장 (한국 시각 22:00~06:55, 서머타임과 평시 모두)
    - cron: '17 7,22 * * 1-5'    # 장 마감 뒤 최종 종가와 장기 차트 갱신
    - cron: '7 12,13,15 * * 6'   # 로또 추첨 결과 (한국 시각 토 21:07·22:07·24:07)
    - cron: '7 0,6 * * 0'        # 로또 추첨 결과 다시 확인 (한국 시각 일 09:07·15:07)

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-24.04
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7

      - id: pages
        uses: actions/configure-pages@v6

      - uses: actions/setup-python@v7
        with:
          python-version: '3.12'

      - name: 라이브러리 설치
        run: pip install --quiet yfinance pandas

      - name: 직전 배포본 받기 (못 받은 종목 채우기, 장기 차트 재사용)
        run: |
          mkdir -p prev
          curl -fsSL "${{{{ steps.pages.outputs.base_url }}}}/data/prices.json" -o prev/prices.json || echo "직전 prices.json 없음"
          curl -fsSL "${{{{ steps.pages.outputs.base_url }}}}/data/hist.json" -o prev/hist.json || echo "직전 hist.json 없음"
          for f in rates lotto housing; do curl -fsSL "${{{{ steps.pages.outputs.base_url }}}}/data/$f.json" -o prev/$f.json || echo "직전 $f.json 없음"; done

      - name: 시세 수집 스크립트 만들기
        run: |
          cat > fetch_prices.py <<'PY'
{body}
          PY
          cat > fetch_extra.py <<'PY'
{body2}
          PY

      - name: 시세 수집
        run: |
          mkdir -p _site/data
          cp index.html _site/
          cp -r icons _site/ 2>/dev/null || true   # 홈 화면 아이콘 (apple-touch-icon 등)
          python fetch_prices.py --out _site/data --prev prev > collect.log 2>&1 || echo "시세 수집 실패 — 게임은 '시세 없음'으로 표시된다" >> collect.log
          cat collect.log
          echo "::notice title=시세 수집 결과::$(tail -n 1 collect.log)"
          python fetch_extra.py --out _site/data --prev prev || echo "추가 자료(금리·로또·아파트) 수집 실패"

      - uses: actions/upload-pages-artifact@v5
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-24.04
    environment:
      name: github-pages
      url: ${{{{ steps.deployment.outputs.page_url }}}}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v5
'''
(root.parent / 'prices.yml').write_text(wf)
print('ok', len(wf))
