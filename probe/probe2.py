import json, time, urllib.request, urllib.parse
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"}
def get(u):
    t = time.time()
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=20); b = r.read()
        return r.status, b.decode("utf-8", "replace"), time.time() - t, len(b)
    except urllib.error.HTTPError as e: return e.code, e.read().decode("utf-8", "replace")[:300], time.time() - t, 0
    except Exception as e: return -1, str(e), time.time() - t, 0
def note(t, m): print(f"::notice title={t}::{m[:3000]}")
kr = open("probe/kr_codes.txt").read().split(",")
for n in (100, 302):
    s, b, dt, sz = get("https://polling.finance.naver.com/api/realtime/domestic/stock/" + ",".join(kr[:n]))
    try:
        j = json.loads(b); ds = j.get("datas") or []; got = {d["itemCode"] for d in ds}
        note(f"KR domestic {n}", f"HTTP {s} {sz}B {dt:.2f}s pollingInterval {j.get('pollingInterval')} 받은 {len(ds)} 빠진 {[c for c in kr[:n] if c not in got][:20]} 키 {list(ds[0].keys())}")
    except Exception as e: note(f"KR domestic {n} 실패", f"HTTP {s} {e} {b[:300]}")
    s, b, dt, sz = get("https://polling.finance.naver.com/api/realtime?query=SERVICE_ITEM:" + ",".join(kr[:n]))
    try:
        j = json.loads(b); ds = j["result"]["areas"][0]["datas"]
        note(f"KR SERVICE_ITEM {n}", f"HTTP {s} {sz}B {dt:.2f}s pollingInterval {j['result'].get('pollingInterval')} 받은 {len(ds)}")
    except Exception as e: note(f"KR SERVICE_ITEM {n} 실패", f"HTTP {s} {e} {b[:200]}")
for q in ("BRK.B", "BRK", "버크셔"):
    s, b, dt, sz = get("https://ac.stock.naver.com/ac?q=" + urllib.parse.quote(q) + "&target=stock")
    note(f"자동완성 {q}", b[:1200])
s, b, dt, sz = get("https://polling.finance.naver.com/api/realtime/worldstock/stock/NVDA.O,LLY")
j = json.loads(b); note("US pollingInterval", f"{j.get('pollingInterval')} 키 {list(j.keys())} 종목키 {list(j['datas'][0].keys())}")
for code in ("BRKb", "BRKb.N", "BRK.B", "BRKB.N", "BRK_B.N"):
    s, b, dt, sz = get("https://polling.finance.naver.com/api/realtime/worldstock/stock/" + code)
    note(f"US {code}", f"HTTP {s} {b[:200]}")
