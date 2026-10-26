const mod = await import("./index.ts");
const rows = JSON.parse(await Deno.readTextFile(new URL("./rows.json", import.meta.url)));
for (let round = 1; round <= 3; round++) {
  const t0 = Date.now();
  const { ok, failed } = await mod.fetchAll(rows);
  const now = Date.now();
  const lag = (m: string) => { const xs = ok.filter((q: any) => q.m === m).map((q: any) => (now - Date.parse(q.t)) / 60000).sort((a: number, b: number) => a - b); return xs.length ? `${xs.length}개, 시세 시각 지연 중앙값 ${xs[xs.length >> 1].toFixed(1)}분` : "0개"; };
  const smp = ["KR:005930", "US:AAPL", "US:BRK.B", "FX"].map((id) => { const q: any = ok.find((x: any) => x.id === id) || ok.find((x: any) => x.id.startsWith(id)); return q ? `${q.id}=${q.p}@${q.t.slice(11, 16)}Z d=${q.d} n5m=${q.i.t.length}` : `${id}=없음`; }).join(" | ");
  const kinds: Record<string, number> = {}; for (const f of failed) { const k = f.split(": ").slice(1).join(": "); kinds[k] = (kinds[k] || 0) + 1; }
  console.log(`::notice title=야후 시험 ${round}회차::성공 ${ok.length}/${rows.length}, ${Date.now() - t0}ms, KR ${lag("KR")}, US ${lag("US")}, FX ${lag("FX")}, 실패 ${JSON.stringify(kinds)} ${failed.slice(0, 5).join("; ")} || ${smp}`);
  if (round < 3) await new Promise((r) => setTimeout(r, 60000));
}
Deno.exit(0);
