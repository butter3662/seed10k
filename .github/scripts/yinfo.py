# 후보 종목의 10/23 종가(야후)와 영어 이름, 업종
import json, sys, time
import yfinance as yf
from concurrent.futures import ThreadPoolExecutor
u = json.load(open("universe.json"))
syms = []
for r in (u["kr"] or []): syms.append((("KR:" + r["Code"]), r["Code"] + (".KS" if r["Market"] == "KOSPI" else ".KQ")))
for r in (u["us"] or []): syms.append(("US:" + str(r["Symbol"]).replace(".", "-"), str(r["Symbol"]).replace(".", "-")))
ys = [y for _, y in syms]
df = yf.download(ys, start="2026-10-20", end="2026-10-28", interval="1d", group_by="ticker", auto_adjust=False, progress=False, threads=True)
res = {}
for gid, y in syms:
    try:
        c = df[y]["Close"].dropna()
        res[gid] = {"y": y, "closes": {d.strftime("%Y-%m-%d"): float(v) for d, v in c.items()}}
    except Exception:
        res[gid] = {"y": y, "closes": {}}
def info(item):
    gid, y = item
    for k in range(3):
        try:
            i = yf.Ticker(y).info
            return gid, {kk: i.get(kk) for kk in ("shortName", "longName", "sector", "industry", "sharesOutstanding", "quoteType", "exchange", "currency")}
        except Exception as e:
            time.sleep(2)
    return gid, {}
with ThreadPoolExecutor(8) as ex:
    for gid, i in ex.map(info, syms):
        res[gid]["info"] = i
json.dump(res, open("yinfo.json", "w"), ensure_ascii=False)
print(len(res), sum(1 for v in res.values() if "2026-10-23" in v["closes"]), "have 10/23")
