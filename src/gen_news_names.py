"""Supabase 함수가 뉴스 검색에 쓰는 종목 이름표(names.ts)를 게임 DATA에서 만든다.
사용법: python3 src/gen_news_names.py index.html supabase/functions/seed10k-quotes/names.ts
"""
import json, os, re, sys
# 네이버 증권 해외주식 코드(로이터 코드). 나스닥 'AAPL.O', 뉴욕 'LLY', 아멕스·아카 'SPY.K' 같은 꼴.
# 네이버 자동완성(ac.stock.naver.com/ac?q=티커&target=stock)의 reutersCode로 만들었다. 없는 종목은 야후 시세만 쓴다.
NV_US = json.load(open(os.path.join(os.path.dirname(__file__), "naver_us.json"), encoding="utf-8"))
html = open(sys.argv[1], encoding="utf-8").read()
data = json.loads(re.search(r"const DATA = (\{.*?\});\n", html, re.S).group(1))
out = {}
for s in data["kr"]:
    out[s["id"]] = {"n": s["n"], "t": s["t"], "m": "KR", "y": s["t"] + (".KQ" if s.get("x") == "KOSDAQ" else ".KS"), "v": s["t"]}
for s in data["us"]:
    out[s["id"]] = {"n": s["n"], "t": s["t"], "m": "US", "y": s["t"]}
    if s["t"] in NV_US: out[s["id"]]["v"] = NV_US[s["t"]]
body = json.dumps(out, ensure_ascii=False, indent=0).replace("\n", "")
open(sys.argv[2], "w", encoding="utf-8").write(
    "// 종목 이름표: 게임 id → 한국어 이름(n), 티커(t), 시장(m), 야후 심볼(y), 네이버 증권 코드(v). src/gen_news_names.py로 만든다.\n"
    f"const NAMES: Record<string, {{ n: string; t: string; m: string; y: string; v?: string }}> = {body};\nexport default NAMES;\n")
print(len(out), "names")
