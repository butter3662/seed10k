import urllib.request, json, re, ssl, sys
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36', 'Accept': '*/*'}
def get(url, n=1500, raw=False):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25)
        b = r.read()
        t = b.decode('utf-8', 'replace')
        return f"{r.status} {r.headers.get('content-type')} len={len(b)}\n" + (t if raw else t[:n])
    except Exception as e:
        return f"ERR {e}"
out = []
def P(title, s): out.append(f"===== {title}\n{s}\n")
P('lotto range', get('https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchStrLtEpsd=1248&srchEndLtEpsd=1260', 3000))
for u in ['https://www.dhlottery.co.kr/st2000/intro', 'https://www.dhlottery.co.kr/speetto/intro', 'https://www.dhlottery.co.kr/sp2000/intro']:
    P(u, get(u, 300))
main = get('https://www.dhlottery.co.kr/', 0, raw=True)
P('main links', '\n'.join(sorted(set(re.findall(r'href="([^"]*(?:spee|st[0-9]|sp[0-9])[^"]*)"', main, re.I)))[:60]))
for sid in ['A_2024_00060', 'A_2024_00061', 'A_2024_00062', 'A_2024_00063']:
    P('rone tbl ' + sid, get(f'https://www.reb.or.kr/r-one/openapi/SttsApiTbl.do?STATBL_ID={sid}', 1500))
    P('rone itm ' + sid, get(f'https://www.reb.or.kr/r-one/openapi/SttsApiTblItm.do?STATBL_ID={sid}', 2500))
    P('rone data ' + sid, get(f'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?STATBL_ID={sid}&DTACYCLE_CD=MM&WRTTIME_IDTFR_ID=202609', 2500))
for u in ['https://m.stock.naver.com/front-api/marketIndex/productDetail?category=bond&reutersCode=KR3YT%3DRR',
          'https://m.stock.naver.com/front-api/marketIndex/prices?category=bond&reutersCode=KR10YT%3DRR&page=1&pageSize=5',
          'https://api.stock.naver.com/marketindex/bond/KR10YT=RR',
          'https://finance.naver.com/marketindex/interestDailyQuote.naver?marketindexCd=IRR_GOVT03Y&page=1',
          'https://m.stock.naver.com/front-api/marketIndex/bondList?category=bond',
          'https://m.stock.naver.com/api/index/bond/KR10YT=RR/price?pageSize=5&page=1']:
    P(u, get(u, 1500))
open('probe/p3.txt', 'w').write('\n'.join(out))
