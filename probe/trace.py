import json, time, urllib.request, traceback
U = "https://ictjkqbbcaigdvlysdaw.supabase.co/rest/v1/"; K = "sb_publishable_C7jZEKJn_nF2Y3Ngq5f80Q_RA5Wrfux"
def get(u, h=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=h or {}), timeout=10); return json.loads(r.read())
    except Exception as e: return str(e)
out = []
T0 = time.time()
try:
    for k in range(60):
        s = get(U + "seed10k_quotes?select=id,t,updated_at&id=in.(_beat,_fast,_run,_nvUS,US:NVDA)", {"apikey": K})
        m = {r['id']: (r['t'] or r['updated_at'])[11:19] for r in s} if isinstance(s, list) else s
        n = get("https://polling.finance.naver.com/api/realtime/worldstock/stock/NVDA.O", {"User-Agent": "Mozilla/5.0"})
        nv = (n['datas'][0]['closePrice'], n['datas'][0]['localTradedAt'][11:19]) if isinstance(n, dict) else n
        out.append(f"{time.strftime('%H:%M:%S', time.gmtime())} beat {m.get('_beat')} fast {m.get('_fast')} run {m.get('_run')} nvUS {m.get('_nvUS')} NVDA t {m.get('US:NVDA')} | 네이버 직접 {nv}")
        time.sleep(max(0, T0 + 2 * (k + 1) - time.time()))
except Exception:
    out.append(traceback.format_exc())
open('probe/trace.txt', 'w').write('\n'.join(out))
