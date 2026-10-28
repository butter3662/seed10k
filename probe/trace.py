import json, time, urllib.request, traceback
U = "https://ictjkqbbcaigdvlysdaw.supabase.co/rest/v1/"; K = "sb_publishable_C7jZEKJn_nF2Y3Ngq5f80Q_RA5Wrfux"
def get(u, h=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=h or {}), timeout=10); return json.loads(r.read())
    except Exception as e: return str(e)
out = []
T0 = time.time()
try:
    b5 = get(U + "seed10k_quotes?select=id,updated_at&id=gt._b5KR_&id=lt._b5KR_9", {"apikey": K})
    out.append(f"_b5KR 줄: {b5 if isinstance(b5, str) else [(r['id'], r['updated_at'][11:19]) for r in b5]}")
    for k in range(45):
        s = get(U + "seed10k_quotes?select=id,p,t,d,updated_at&id=in.(_beat,_fast,_run,_nvKR,KR:005930)", {"apikey": K})
        m = {r['id']: r for r in s} if isinstance(s, list) else {}
        g = lambda i, f='updated_at': (m.get(i, {}).get(f) or '')[11:19]
        sam = m.get('KR:005930', {})
        n = get("https://polling.finance.naver.com/api/realtime/domestic/stock/005930", {"User-Agent": "Mozilla/5.0"})
        nv = (n['datas'][0]['closePrice'], n['datas'][0]['localTradedAt'][11:19]) if isinstance(n, dict) else n
        out.append(f"{time.strftime('%H:%M:%S', time.gmtime(time.time() + 9 * 3600))} beat {g('_beat')} fast {g('_fast')} run {g('_run')} nvKR {g('_nvKR')} | 서버 삼성 {sam.get('p')} t {(sam.get('t') or '')[11:19]} d {sam.get('d')} | 네이버 {nv}" if m else str(s))
        time.sleep(max(0, T0 + 2 * (k + 1) - time.time()))
except Exception:
    out.append(traceback.format_exc())
open('probe/trace.txt', 'w').write('\n'.join(out))
