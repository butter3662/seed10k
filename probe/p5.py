import urllib.request, json, re, html as H
from concurrent.futures import ThreadPoolExecutor
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'}
def get(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25); return r.read().decode('utf-8', 'replace')
    except Exception as e: return f"ERR {e}"
def text(h):
    h = re.sub(r'(?is)<(script|style)[^>]*>.*?</\1>', ' ', h); h = re.sub(r'(?s)<[^>]+>', ' ', h); return re.sub(r'\s+', ' ', H.unescape(h))
out = []
def P(t, s): out.append(f"===== {t}\n{s}\n")
# 1) R-ONE 지역 코드 찾기
def cls(x):
    t = get(f'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?STATBL_ID=A_2024_00061&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=202609&CLS_ID={x}&ITM_ID=100001')
    m = re.search(r'<CLS_NM>(.*?)</CLS_NM>.*?<DTA_VAL>(.*?)</DTA_VAL>.*?<CLS_FULLNM>(.*?)</CLS_FULLNM>', t, re.S)
    return (x, m.groups() if m else None)
ids = list(range(530001, 530120)) + list(range(520001, 520060))
with ThreadPoolExecutor(16) as ex: res = list(ex.map(cls, ids))
P('rone cls', '\n'.join(f"{x}\t{g[0]}\t{g[2]}\t{g[1]}" for x, g in res if g))
open('probe/p6.txt', 'w').write('\n'.join(out))
