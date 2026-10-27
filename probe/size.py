import urllib.request, gzip, concurrent.futures
B = "https://butter3662.github.io/seed10k/"
def size(path):
    try:
        r = urllib.request.urlopen(urllib.request.Request(B + path, headers={"Accept-Encoding": "identity"}), timeout=20); b = r.read()
        return len(b), len(gzip.compress(b, 6))
    except Exception as e: return None
out = []
for p in ("", "data/prices.json", "data/hist.json"):
    out.append(f"{p or 'index.html'}: {size(p)}")
ids = open("probe/ids.txt").read().split()
with concurrent.futures.ThreadPoolExecutor(16) as ex:
    res = list(ex.map(lambda i: size("data/c/" + i.replace(":", "_") + ".json"), ids))
ok = [r for r in res if r]
out.append(f"data/c 종목 파일: {len(ok)}/{len(ids)}개, 합계 {sum(r[0] for r in ok)}B (gzip {sum(r[1] for r in ok)}B), 평균 {sum(r[0] for r in ok)//max(1,len(ok))}B, 최대 {max(r[0] for r in ok)}B")
open("probe/size.txt", "w").write("\n".join(out))
