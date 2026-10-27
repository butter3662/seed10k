import json, sys, time, io, traceback
import pandas as pd
out = {"kr": None, "us": None, "err": {}}
# ── 한국: KRX 상장 목록 (FinanceDataReader) ──
try:
    import FinanceDataReader as fdr
    k = fdr.StockListing("KRX")
    k = k[k["Market"].isin(["KOSPI", "KOSDAQ", "KOSDAQ GLOBAL"])]
    k["Market"] = k["Market"].replace({"KOSDAQ GLOBAL": "KOSDAQ"})
    k = k[k["Code"].str.endswith("0")]                       # 우선주(끝자리 5, 7, 9, K 등) 제외
    k = k[~k["Name"].str.contains("스팩")]
    k = k.sort_values("Marcap", ascending=False).head(360)
    try:
        desc = fdr.StockListing("KRX-DESC")[["Code", "Sector", "Industry"]]
        k = k.merge(desc, on="Code", how="left")
    except Exception as e:
        out["err"]["krdesc"] = str(e)[:200]
    out["kr"] = k[[c for c in ["Code", "Name", "Market", "Marcap", "Stocks", "Close", "Sector", "Industry"] if c in k.columns]].fillna("").to_dict("records")
except Exception as e:
    out["err"]["kr"] = traceback.format_exc()[-400:]
# ── 미국: companiesmarketcap 미국 기업 순위 CSV ──
try:
    import urllib.request
    req = urllib.request.Request("https://companiesmarketcap.com/usa/largest-companies-in-the-usa-by-market-cap/?download=csv", headers={"User-Agent": "Mozilla/5.0"})
    raw = urllib.request.urlopen(req, timeout=60).read().decode("utf-8")
    u = pd.read_csv(io.StringIO(raw))
    out["us"] = u.head(380).fillna("").to_dict("records")
except Exception as e:
    out["err"]["us"] = traceback.format_exc()[-400:]
json.dump(out, open("universe.json", "w"), ensure_ascii=False, default=str)
print({k: (len(v) if isinstance(v, list) else v) for k, v in out.items()})
