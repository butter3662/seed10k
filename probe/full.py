import asyncio, json, time, urllib.request, traceback, datetime
U = "https://ictjkqbbcaigdvlysdaw.supabase.co/rest/v1/"; K = "sb_publishable_C7jZEKJn_nF2Y3Ngq5f80Q_RA5Wrfux"
def get(u, h=None):
    try:
        r = urllib.request.urlopen(urllib.request.Request(u, headers=h or {}), timeout=15); return json.loads(r.read())
    except Exception as e: return str(e)
kst = lambda: time.strftime('%H:%M:%S', time.gmtime(time.time() + 9 * 3600))
today = time.strftime('%Y-%m-%d', time.gmtime(time.time() + 9 * 3600))
out = []
async def trace():
    beats = []
    for k in range(30):
        s = await asyncio.to_thread(get, U + "seed10k_quotes?select=id,p,t,updated_at&id=in.(_beat,_run,KR:005930)", {"apikey": K})
        n = await asyncio.to_thread(get, "https://polling.finance.naver.com/api/realtime/domestic/stock/005930", {"User-Agent": "Mozilla/5.0"})
        if isinstance(s, list):
            m = {r['id']: r for r in s}
            beats.append(m['_beat']['updated_at'][11:19])
            out.append(f"[추적] {kst()} beat {m['_beat']['updated_at'][11:19]} run {m['_run']['updated_at'][11:19]} 서버 삼성 {m['KR:005930']['p']} t {m['KR:005930']['t'][11:19]} | 네이버 {(n['datas'][0]['closePrice'], n['datas'][0]['localTradedAt'][11:19]) if isinstance(n, dict) else n}")
        await asyncio.sleep(2)
    ub = sorted(set(beats)); gaps = [ (datetime.datetime.strptime(b, '%H:%M:%S') - datetime.datetime.strptime(a, '%H:%M:%S')).seconds for a, b in zip(ub, ub[1:]) ]
    out.append(f"[추적 요약] beat 시각 {len(ub)}개, 간격 {gaps}")
def data():
    sn = get(U + "seed10k_quotes?select=id,d,updated_at,x:i->x&id=eq._snapKR", {"apikey": K})
    x = sn[0]['x'] if isinstance(sn, list) and sn else None
    out.append(f"[묶음] _snapKR 날짜 {sn[0]['d'] if isinstance(sn, list) and sn else sn} 종목 {len(x['ids']) if x else None}")
    kr = get(U + "seed10k_quotes?select=id,d&m=eq.KR", {"apikey": K})
    out.append(f"[오늘 시세] KR {len(kr)}행 중 d={today} {sum(1 for r in kr if r['d'] == today)}")
    b5 = get(U + "seed10k_quotes?select=id,updated_at,b:i->b&id=gt._b5KR_&id=lt._b5KR_9&order=id", {"apikey": K})
    if isinstance(b5, list) and b5:
        k = b5[0]['b']['ids'].index('KR:005930')
        rows = [(time.strftime('%H:%M', time.gmtime(r['b']['t'] + 9 * 3600)), r['b']['p'][k], sum(1 for v in r['b']['p'] if v is not None)) for r in b5]
        out.append(f"[5분 구간 줄] {len(b5)}개, (구간 시작, 삼성 값, 값 있는 종목 수) {rows}")
    else: out.append(f"[5분 구간 줄] {b5}")
async def site():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844})
        await ctx.add_init_script("sessionStorage.setItem('seed10k.guest','1'); localStorage.setItem('seed10k.settings.v1', JSON.stringify({mode:'live', theme:'dark'}));")
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('https://butter3662.github.io/seed10k/'); await pg.wait_for_timeout(6000)
        out.append(f"[사이트] 버전 {await pg.evaluate('VERSION')} 한국 상태 {await pg.evaluate('mstate(\"KR\").label')}")
        await pg.evaluate("openSheet('KR:005930')"); await pg.wait_for_timeout(3000)
        seen = []
        for k in range(10):
            seen.append((kst(), await pg.evaluate("(document.querySelector('#sheet').innerText.match(/[0-9,]+원/)||[''])[0]")))
            await pg.wait_for_timeout(7000)
        out.append(f"[사이트 화면 가격 7초마다] {seen}")
        ser = await pg.evaluate("""(()=>{ const s = getSeries('KR:005930','1D'); const f = x => { const p = zoneParts('Asia/Seoul', new Date(x)); return String(p.h).padStart(2,'0')+':'+String(p.mi).padStart(2,'0'); };
          return {n:s.t.length, kind:s.kind, last:s.t.slice(-10).map((x,i)=>f(x)+' '+s.c.slice(-10)[i]), nb:(CH['KR:005930']||{}).nb, qiLast:(()=>{const q=(CH['KR:005930']||{}).qi; return q? f(q.t[q.t.length-1]*1000):null})()}; })()""")
        out.append(f"[사이트 1D 차트] 점 {ser['n']}개 종류 {ser['kind']} 야후 마지막 봉 {ser['qiLast']} 마지막 10점 {ser['last']} / 5분 구간 {ser['nb']}")
        out.append(f"[사이트 오류] {errs[:5]}")
        await b.close()
async def main():
    await asyncio.gather(trace(), site())
try:
    data(); asyncio.run(main())
except Exception:
    out.append(traceback.format_exc()[-2000:])
open('probe/full.txt', 'w').write('\n'.join(out))
