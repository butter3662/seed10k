"""SEED 10K 추가 자료 수집 (GitHub Actions 안에서 실행, 표준 라이브러리만 쓴다).

만드는 파일 (--out 폴더)
  rates.json    한·미 국채 금리 (네이버 증권). 실행할 때마다 최신값, 날짜별 종가는 직전 배포본에 이어 붙인다
  lotto.json    로또6/45 회차별 당첨번호·등수별 1게임당 당첨금·당첨자 수 (동행복권). 새 회차가 나올 때만 받는다
  housing.json  지역별 아파트 ㎡당 평균 매매가격 (한국부동산원 R-ONE, 월간). 하루 한 번 새 달이 나왔는지 본다
인자: --out _site/data --prev prev
"""
import argparse, json, re, time, urllib.request, datetime as dt
from concurrent.futures import ThreadPoolExecutor

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'}
KST = dt.timezone(dt.timedelta(hours=9))


def get(url, timeout=25, tries=3):
    err = None
    for k in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:
            err = e
            time.sleep(1.5 * (k + 1))
    raise RuntimeError(f'{url}: {err}')


def load(path):
    try:
        with open(path, encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def dump(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, separators=(',', ':'))


# ── 국채 금리 ──
# 만기(년): 네이버 로이터 코드
RATES = {
    'KR': {1: 'KR1YT=RR', 3: 'KR3YT=RR', 5: 'KR5YT=RR', 10: 'KR10YT=RR', 20: 'KR20YT=RR', 30: 'KR30YT=RR'},
    'US': {0.25: 'US3MT=RR', 1: 'US1YT=RR', 2: 'US2YT=RR', 5: 'US5YT=RR', 10: 'US10YT=RR', 30: 'US30YT=RR'},
}


def rates(prev):
    out = {'at': int(time.time()), 'cur': {}, 'hist': (prev or {}).get('hist', {})}
    jobs = [(c, str(m), code) for c, d in RATES.items() for m, code in d.items()]

    def one(j):
        c, m, code = j
        try:
            r = json.loads(get(f'https://api.stock.naver.com/marketindex/bond/{code}'))
            return c, m, float(r['closePrice']), r.get('localTradedAt') or ''
        except Exception as e:
            print('금리 실패', code, e)
            return c, m, None, ''
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(one, jobs))
    old = (prev or {}).get('cur', {})
    for c, m, y, t in res:
        key = f'{c}{m}'
        if y is None:
            if key in old:
                out['cur'][key] = old[key]          # 못 받으면 직전 값을 그대로 둔다
            continue
        out['cur'][key] = [y, t]
        day = t[:10] if re.match(r'\d{4}-\d{2}-\d{2}', t) else dt.datetime.now(KST).strftime('%Y-%m-%d')
        h = out['hist'].setdefault(key, {})
        h[day] = y
        for d in sorted(h)[:-400]:                   # 최근 400일만
            del h[d]
    print('금리', len(out['cur']), '개')
    return out


# ── 로또6/45 ──
# 1249회 = 2026-11-07(토) 20:35 추첨. 그 뒤로 매주 토요일 1회씩
def lotto(prev):
    prev = prev if isinstance(prev, dict) and isinstance(prev.get('d'), list) else {'d': []}
    have = {d['r']: d for d in prev['d']}
    now = dt.datetime.now(KST)
    base = dt.datetime(2026, 11, 7, 20, 50, tzinfo=KST)
    expect = 1249 + (now - base).days // 7 if now >= base else 1248
    last = max(have) if have else 0
    if last >= expect:
        print('로또 새 회차 없음 (최신', last, '회)')
        return prev
    lo = max(last + 1, expect - 60)
    j = json.loads(get(f'https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do?srchStrLtEpsd={lo}&srchEndLtEpsd={expect + 1}'))
    n = 0
    for d in j['data']['list']:
        nums = [d[f'tm{k}WnNo'] for k in range(1, 7)]
        balls = nums + [d['bnsWnNo']]
        if not all(isinstance(x, int) and 1 <= x <= 45 for x in balls) or len(set(balls)) != 7:
            print('로또 번호 이상, 건너뜀', d.get('ltEpsd'))
            continue
        y = str(d['ltRflYmd'])
        have[d['ltEpsd']] = {'r': d['ltEpsd'], 'date': f'{y[:4]}-{y[4:6]}-{y[6:8]}', 'n': nums, 'b': d['bnsWnNo'],
                             'amt': [d[f'rnk{k}WnAmt'] for k in range(1, 6)], 'cnt': [d[f'rnk{k}WnNope'] for k in range(1, 6)],
                             'sales': d.get('rlvtEpsdSumNtslAmt')}
        n += 1
    keep = sorted(have)[-110:]
    print('로또', n, '회차 추가, 최신', keep[-1] if keep else None)
    return {'at': int(time.time()), 'd': [have[r] for r in keep]}


# ── 아파트 시세 (R-ONE (월) 평균단위매매가격_아파트, 천원/㎡) ──
HOUSE_TBL = 'A_2024_00061'
REGIONS = [
    ('530011', '종로구'), ('530012', '중구'), ('530013', '용산구'), ('530015', '성동구'), ('530016', '광진구'),
    ('530017', '동대문구'), ('530018', '중랑구'), ('530019', '성북구'), ('530020', '강북구'), ('530021', '도봉구'),
    ('530022', '노원구'), ('530024', '은평구'), ('530025', '서대문구'), ('530026', '마포구'), ('530029', '양천구'),
    ('530030', '강서구'), ('530031', '구로구'), ('530032', '금천구'), ('530033', '영등포구'), ('530034', '동작구'),
    ('530035', '관악구'), ('530037', '서초구'), ('530038', '강남구'), ('530039', '송파구'), ('530040', '강동구'),
    ('500009', '경기'), ('500010', '인천'), ('500011', '부산'), ('500012', '대구'), ('500013', '광주'),
    ('500014', '대전'), ('500015', '울산'), ('500016', '세종'), ('500017', '강원'), ('500018', '충북'),
    ('500019', '충남'), ('500020', '전북'), ('500021', '전남'), ('500022', '경북'), ('500023', '경남'),
    ('500024', '제주'), ('500008', '서울'), ('500001', '전국'),
]


def ym_add(ym, k):
    y, m = int(ym[:4]), int(ym[4:])
    m += k
    while m > 12: y, m = y + 1, m - 12
    while m < 1: y, m = y - 1, m + 12
    return f'{y:04d}{m:02d}'


def rone(cls, start, end):
    # 키 없는 시험 모드는 한 번에 5줄까지라 기간을 5달 이하로 잘라 부른다
    t = get(f'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do?STATBL_ID={HOUSE_TBL}&DTACYCLE_CD=MM'
            f'&CLS_ID={cls}&ITM_ID=100001&START_WRTTIME={start}&END_WRTTIME={end}')
    rows = re.findall(r'<WRTTIME_IDTFR_ID>(\d{6})</WRTTIME_IDTFR_ID>.*?<DTA_VAL>([\d.]+)</DTA_VAL>', t, re.S)
    return {ym: round(float(v), 1) for ym, v in rows}


def housing(prev):
    prev = prev if isinstance(prev, dict) and prev.get('r') else None
    now = time.time()
    if prev and now - prev.get('checked', 0) < 20 * 3600:
        return prev
    latest = prev['ym'] if prev else '202609'
    nxt = ym_add(latest, 1)
    try:
        probe = rone('500001', nxt, nxt)
    except Exception as e:
        print('R-ONE 확인 실패', e)
        return prev
    ym = nxt if probe else latest
    if prev and ym == latest:
        prev['checked'] = int(now)
        print('아파트 시세 새 달 없음 (최신', latest, ')')
        return prev
    start = ym_add(ym, -4)

    def one(r):
        cls, nm = r
        try:
            return cls, nm, rone(cls, start, ym)
        except Exception as e:
            print('R-ONE 실패', nm, e)
            return cls, nm, None
    with ThreadPoolExecutor(6) as ex:
        res = list(ex.map(one, REGIONS))
    old = (prev or {}).get('r', {})
    out = {'at': int(now), 'checked': int(now), 'ym': ym, 'unit': '천원/㎡', 'tbl': HOUSE_TBL, 'r': {}}
    for cls, nm, h in res:
        if not h and cls in old:
            out['r'][cls] = old[cls]
        elif h:
            out['r'][cls] = {'n': nm, 'h': h}
    print('아파트 시세', ym, len(out['r']), '지역')
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--prev', default='prev')
    a = ap.parse_args()
    for name, fn in (('rates', rates), ('lotto', lotto), ('housing', housing)):
        prev = load(f'{a.prev}/{name}.json')
        try:
            res = fn(prev)
        except Exception as e:
            print(name, '수집 실패:', e)
            res = prev
        if res:
            dump(f'{a.out}/{name}.json', res)


if __name__ == '__main__':
    main()
