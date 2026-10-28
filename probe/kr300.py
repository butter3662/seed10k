import json, time, urllib.request, traceback, collections
U = "https://ictjkqbbcaigdvlysdaw.supabase.co/rest/v1/"; K = "sb_publishable_C7jZEKJn_nF2Y3Ngq5f80Q_RA5Wrfux"
def get(u):
    r = urllib.request.urlopen(urllib.request.Request(U + u, headers={"apikey": K}), timeout=30); return json.loads(r.read())
kst = lambda s: time.strftime('%H:%M', time.gmtime(s + 9 * 3600))
today = time.strftime('%Y-%m-%d', time.gmtime(time.time() + 9 * 3600))
out = []
try:
    runs = []
    for k in range(8):
        runs.append(get("seed10k_quotes?select=updated_at&id=eq._run")[0]['updated_at'][11:19]); time.sleep(10)
    out.append(f"1분 작업 표시(_run) 10초 간격 8번: {runs}")
    rows = get("seed10k_quotes?select=id,p,d,i&m=eq.KR")
    tday = [r for r in rows if r['d'] == today]
    lastbar = collections.Counter(); lh = 0; todaybars = 0
    for r in rows:
        i = r['i'] or {}; t = i.get('t') or []
        if t and time.strftime('%Y-%m-%d', time.gmtime(t[-1] + 9 * 3600)) == today:
            todaybars += 1; lastbar[kst(t[-1])] += 1
            if i.get('l') and i.get('h') and len(i['l']) == len(t): lh += 1
    out.append(f"한국 {len(rows)}행: 오늘 현재가 {len(tday)}, 오늘 5분 봉 있음 {todaybars}, 그중 l/h 있음 {lh}, 마지막 봉 시각 분포 {dict(sorted(lastbar.items()))}")
    for id in ('KR:036930', 'KR:0009K0', 'KR:0158S0', 'KR:005930'):
        r = next((x for x in rows if x['id'] == id), None)
        if not r: out.append(f"{id}: 없음"); continue
        i = r['i'] or {}; t = i.get('t') or []
        out.append(f"{id}: p {r['p']} d {r['d']} 봉 {len(t)}개 마지막 {kst(t[-1]) if t else '-'} l {bool(i.get('l'))} h {bool(i.get('h'))}")
    dl = get(f"seed10k_daily?select=id,c,l,h&d=eq.{today}&id=like.KR*")
    out.append(f"일별 표 오늘 한국 {len(dl)}행, l/h 채워짐 {sum(1 for r in dl if r['l'] is not None and r['h'] is not None)}")
except Exception:
    out.append(traceback.format_exc()[-1500:])
open('probe/kr300.txt', 'w').write('\n'.join(out))
