// Daily price candles from Yahoo Finance, trimmed to what the page needs.
// GET /api/chart?symbol=NVDA&range=10y  ->  { symbol, name, currency, price, priceTime, rows: [[date, open, high, low, close], ...] }
const RANGES = new Set(["5d", "1mo", "3mo", "6mo", "1y", "2y", "5y", "10y", "max"]);
const json = (body, status = 200, cache = "no-cache") =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": cache } });
const r2 = v => Math.round(v * 100) / 100;

export default async req => {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") || "").trim().toUpperCase();
  const range = RANGES.has(url.searchParams.get("range")) ? url.searchParams.get("range") : "5y";
  if (!symbol) return json({ error: "Type a ticker, like NVDA." }, 400);
  if (!/^[A-Z0-9.\-^=]{1,15}$/.test(symbol)) return json({ error: `No stock found for "${symbol}". Check the ticker.` }, 404);

  let data;
  try {
    const qs = `range=${range}&interval=1d&events=split&includePrePost=false`;
    let res;
    for (const host of ["query1", "query2"]) {
      res = await fetch(`https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${qs}`, {
        headers: { "user-agent": "Mozilla/5.0 (compatible; TraderSandbox/1.0)", accept: "application/json" }
      });
      if (res.ok || res.status === 404) break;
    }
    data = await res.json();
  } catch {
    return json({ error: "The price service didn't answer. Try again in a moment." }, 502);
  }

  const result = data?.chart?.result?.[0];
  if (!result) return json({ error: `No stock found for "${symbol}". Check the ticker.` }, 404);
  const meta = result.meta || {}, q = result.indicators?.quote?.[0] || {}, ts = result.timestamp || [];
  const off = (meta.gmtoffset || 0) * 1000, rows = [];
  for (let i = 0; i < ts.length; i++) {
    const o = q.open?.[i], h = q.high?.[i], l = q.low?.[i], c = q.close?.[i];
    if ([o, h, l, c].some(v => v == null || !Number.isFinite(v))) continue;
    const date = new Date(ts[i] * 1000 + off).toISOString().slice(0, 10);
    const row = [date, r2(o), r2(h), r2(l), r2(c)];
    if (rows.length && rows[rows.length - 1][0] === date) rows[rows.length - 1] = row; else rows.push(row);
  }
  return json({
    symbol: meta.symbol || symbol,
    name: meta.longName || meta.shortName || meta.symbol || symbol,
    currency: meta.currency || "USD",
    price: meta.regularMarketPrice != null ? r2(meta.regularMarketPrice) : rows.length ? rows[rows.length - 1][4] : null,
    priceTime: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    rows
  });
};

export const config = { path: "/api/chart" };
