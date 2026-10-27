import json, time, urllib.request, urllib.parse, sys
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", "Accept": "application/json"}
def get(u, enc="utf-8"):
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20)
        b = r.read(); return r.status, b.decode(enc, "replace"), time.time() - t, len(b)
    except urllib.error.HTTPError as e: return e.code, e.read().decode("utf-8", "replace")[:300], time.time() - t, 0
    except Exception as e: return -1, str(e), time.time() - t, 0
out = {}
def note(t, m): print(f"::notice title={t}::{m[:3500]}")
kr = open("probe/kr_codes.txt").read().split(","); us = open("probe/us_codes.txt").read().split(",")
# 1) 한국 묶음 요청
for n in (100, 302):
    s, b, dt, sz = get("https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:" + ",".join(kr[:n]), "utf-8")
    try:
        j = json.loads(b); ds = j["result"]["areas"][0]["datas"]; got = {d["cd"] for d in ds}
        note(f"KR 묶음 {n}", f"HTTP {s} {sz}B {dt:.2f}s 받은 {len(ds)} 빠진 {[c for c in kr[:n] if c not in got][:20]} 예 {json.dumps(ds[0], ensure_ascii=False)[:400]}")
    except Exception as e: note(f"KR 묶음 {n} 실패", f"HTTP {s} {e} {b[:300]}")
# 2) 미국 코드 찾기 (네이버 자동완성)
amap, miss = {}, []
for t in us:
    q = t.replace("-", ".")
    s, b, dt, sz = get("https://ac.stock.naver.com/ac?q=" + urllib.parse.quote(q) + "&target=stock")
    try:
        items = json.loads(b).get("items", [])
        cand = [x for x in items if x.get("nationCode") == "USA" and (x.get("code") or "").upper() in (q.upper(), t.upper())]
        if cand: amap[t] = cand[0].get("reutersCode")
        else: miss.append(t); 
        if t == us[0]: note("자동완성 예", b[:800])
    except Exception as e: miss.append(t)
out["us_map"] = amap; out["us_miss"] = miss
note("미국 코드", f"찾음 {len(amap)} 못 찾음 {miss} 예 {list(amap.items())[:12]}")
# 3) 미국 실시간 묶음
codes = [amap[t] for t in us if t in amap]
for base in ("https://polling.finance.naver.com/api/realtime/worldstock/stock/", ):
    for n in (20, 100, len(codes)):
        s, b, dt, sz = get(base + ",".join(codes[:n]))
        try:
            j = json.loads(b); ds = j.get("datas") or []
            note(f"US 묶음 {n}", f"HTTP {s} {sz}B {dt:.2f}s 받은 {len(ds)} 예 {json.dumps(ds[0], ensure_ascii=False)[:1500] if ds else b[:500]}")
        except Exception as e: note(f"US 묶음 {n} 실패", f"HTTP {s} {e} {b[:300]}")
# 4) 야후 spark 묶음
for n in (20, 100):
    s, b, dt, sz = get("https://query1.finance.yahoo.com/v8/finance/spark?symbols=" + ",".join(us[:n]) + "&range=1d&interval=5m")
    try:
        j = json.loads(b); 
        keys = list(j.keys())[:5]
        note(f"야후 spark {n}", f"HTTP {s} {sz}B {dt:.2f}s 키 {len(j)} {keys} 예 {json.dumps(j.get(us[0]), ensure_ascii=False)[:600]}")
    except Exception as e: note(f"야후 spark {n} 실패", f"HTTP {s} {e} {b[:300]}")
json.dump(out, open("probe/result.json", "w"), ensure_ascii=False, indent=0)
