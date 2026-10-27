const mod = await import("./index.ts");
let tot = 0, zero: string[] = [];
const sample = ["AAPL", "NVDA", "MSFT", "TSLA", "BRK-B", "SPCX", "JPM", "KO", "WMT", "CVS", "ADP", "SCCO"];
for (const s of sample) {
  try { const n = await mod.yahooNews(s); tot += n.length; if (!n.length) zero.push(s); console.log(`::notice title=${s}::${n.length}건 ${n.slice(0, 2).map((x: { t: string }) => x.t).join(" / ").slice(0, 300)}`); }
  catch (e) { console.log(`::notice title=${s}::실패 ${(e as Error).message}`); }
}
console.log(`::notice title=요약::${sample.length}종목 평균 ${(tot / sample.length).toFixed(1)}건, 0건 ${zero.join(",")}`);
Deno.exit(0);
