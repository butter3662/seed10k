import asyncio, json, time
from playwright.async_api import async_playwright
out = []
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844})
        await ctx.add_init_script("sessionStorage.setItem('seed10k.guest','1'); localStorage.setItem('seed10k.settings.v1', JSON.stringify({mode:'live', theme:'dark'}));")
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append('console ' + m.type + ' ' + m.text[:200]) if m.type in ('error', 'warning') else None)
        reqs = []
        async def onresp(r):
            if 'seed10k_quotes' in r.url:
                try: body = await r.text()
                except Exception: body = ''
                reqs.append([round(time.time() - T0, 1), r.status, r.url.split('?')[1][:160], body[:160]])
        pg.on('response', lambda r: asyncio.ensure_future(onresp(r)))
        T0 = time.time()
        await pg.goto('https://butter3662.github.io/seed10k/'); await pg.wait_for_timeout(6000)
        out.append('버전 ' + str(await pg.evaluate("VERSION")) + ' 모드 ' + str(await pg.evaluate("S.mode")) + ' US상태 ' + str(await pg.evaluate("mstate('US').label")) + ' sessionNear ' + str(await pg.evaluate("sessionNear('US')")) + ' sb ' + str(await pg.evaluate("!!ACC.sb")) + ' LIVE.ok ' + str(await pg.evaluate("LIVE.ok")) + ' QT.rows ' + str(await pg.evaluate("QT.rows && QT.rows.length")))
        await pg.evaluate("openSheet('US:NVDA')"); await pg.wait_for_timeout(500)
        for k in range(20):
            v = await pg.evaluate("({p:price('US:NVDA'), txt:(document.querySelector('#sheet').innerText.match(/\\$[0-9,.]+/)||[''])[0], row:(QT.rows.find(r=>r.id==='US:NVDA')||{}), hot:hotBusy, sheet:UI.sheet, scrub:UI.scrub, loading:LIVE.loading})")
            out.append(f"{round(time.time()-T0,1)}s 화면 {v['txt']} price {v['p']} 행 p {v['row'].get('p')} t {v['row'].get('t')} hotBusy {v['hot']} sheet {v['sheet']} scrub {v['scrub']} loading {v['loading']}")
            await pg.wait_for_timeout(3500)
        out.append('요청들:'); out += [json.dumps(r, ensure_ascii=False) for r in reqs]
        out.append('오류: ' + json.dumps(errs[:20], ensure_ascii=False))
        await b.close()
asyncio.run(main())
open('probe/live.txt', 'w').write('\n'.join(out))
