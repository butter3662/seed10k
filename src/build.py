import json, sys, pathlib
root = pathlib.Path(__file__).resolve().parent
data = json.load(open(sys.argv[1]))
tpl = (root / 'template.html').read_text()
app = (root / 'app.js').read_text().replace('/*__BM__*/', '\n'.join((root / f).read_text() for f in ('bm.js', 'gam.js', 'bj.js', 'bs.js', 'bs3d.js', 'bsau.js', 'mp.js', 'adm.js', 'lot.js', 'geo.js', 'inv.js')))
out = tpl.replace('/*__DATA__*/', json.dumps(data, ensure_ascii=False, separators=(',', ':'))).replace('/*__APP__*/', app)
dst = root.parent / 'index.html'
# 주사위 세계여행 규칙(BM ~ BME)을 라즈베리파이 심판도 똑같이 쓰도록 떼어 낸다 (화면 코드는 빼고)
bm = (root / 'bm.js').read_text(); a = bm.index('const BM = {'); z = bm.index('/* ───── 화면 ───── */')
eng = ('// 자동 생성: 사이트 src/bm.js의 규칙 부분 (build.py가 만든다. 직접 고치지 말 것)\n' + bm[a:z] +
       'export { BM, BM_SQ, BM_N, BM_IDX, BM_CARDS, BME, bmW, bmV, bmB, bmH, bmLv };\n')
pi = pathlib.Path('/home/claude/repos/seed10k/pi/bm_engine.js')
if pi.parent.exists(): pi.write_text(eng)
# 벅샷 룰렛 규칙(BS ~ BSE)도 같은 방식으로
bsrc = (root / 'bs.js').read_text(); a = bsrc.index('const BS = {'); z = bsrc.index('/* ───── 화면 ───── */')
(pi.parent / 'bs_engine.js').write_text('// 자동 생성: 사이트 src/bs.js의 규칙 부분 (build.py가 만든다. 직접 고치지 말 것)\n' + bsrc[a:z] + 'export { BS, BS_IT, BS_KEYS, BSE };\n') if pi.parent.exists() else None
dst.write_text(out)
print(dst, len(out.encode()) // 1024, 'KB')
