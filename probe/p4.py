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
ids = list(range(500001, 500400)) + list(range(510001, 510200))
with ThreadPoolExecutor(8) as ex: res = list(ex.map(cls, ids))
P('rone cls', '\n'.join(f"{x}\t{g[0]}\t{g[2]}\t{g[1]}" for x, g in res if g))
P('rone latest period', '\n'.join(re.findall(r'<WRTTIME_IDTFR_ID>(\d+)</WRTTIME_IDTFR_ID>', get('https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?STATBL_ID=A_2024_00061&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=202610&CLS_ID=500001&ITM_ID=100001')) or ['202610 없음']))
# 2) 스피또2000 공식 안내
for u in ['https://www.dhlottery.co.kr/st/st20Intro', 'https://www.dhlottery.co.kr/st/pblcnDsctn?stGmTypeCd=st2000']:
    P(u, text(get(u))[:6000])
# 3) 네이버 채권 코드
for c in ['KR1YT=RR', 'KR3YT=RR', 'KR5YT=RR', 'KR10YT=RR', 'KR20YT=RR', 'KR30YT=RR', 'US1YT=RR', 'US2YT=RR', 'US3MT=RR', 'US5YT=RR', 'US10YT=RR', 'US30YT=RR']:
    t = get(f'https://api.stock.naver.com/marketindex/bond/{c}')
    try: j = json.loads(t); P(c, f"{j.get('name')} {j.get('closePrice')} {j.get('localTradedAt')}")
    except Exception: P(c, t[:200])
open('probe/p4.txt', 'w').write('\n'.join(out))
