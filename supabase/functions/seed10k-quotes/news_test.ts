const mod = await import("./index.ts");
for (const s of ["AAPL", "NVDA", "BRK-B", "SPCX"]) {
  try { const n = await mod.yahooNews(s); console.log(`::notice title=Yahoo 뉴스 ${s}::${n.length}건 ${JSON.stringify(n.slice(0, 2)).slice(0, 400)}`); }
  catch (e) { console.log(`::notice title=Yahoo 뉴스 ${s}::실패 ${(e as Error).message}`); }
}
console.log(`::notice title=네이버 (키 없음)::${JSON.stringify(await mod.naverNews("삼성전자"))}`);
Deno.exit(0);
