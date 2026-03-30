// api/prices.js
// Vercel serverless — Twelve Data free tier (800 calls/day)
// Fetches quote + last 5 daily candles to derive real OHLC structure

const TWELVE_KEY = process.env.TWELVE_DATA_API_KEY;

const SYMBOLS = {
  OIL:  "USOIL",     // WTI crude oil — free tier
  GOLD: "XAU/USD",   // Gold spot — working ✅
  NQ:   "QQQ",       // Nasdaq 100 ETF proxy — working ✅
};

// Derive market structure from last 5 daily candles
function deriveOHLCStructure(candles) {
  if (!candles || candles.length < 3) return { structure: "Unknown", detail: "Not enough candle data" };

  // candles[0] = most recent, candles[4] = oldest
  const [c0, c1, c2] = candles.map(c => ({
    o: parseFloat(c.open),
    h: parseFloat(c.high),
    l: parseFloat(c.low),
    c: parseFloat(c.close),
  }));

  const body0  = c0.c - c0.o;
  const body1  = c1.c - c1.o;
  const range0 = c0.h - c0.l;

  // Higher highs / higher lows = bullish structure
  const hh = c0.h > c1.h && c1.h > c2.h;
  const hl  = c0.l > c1.l && c1.l > c2.l;
  // Lower highs / lower lows = bearish structure
  const lh  = c0.h < c1.h && c1.h < c2.h;
  const ll  = c0.l < c1.l && c1.l < c2.l;

  // Bullish engulfing
  const bullEngulf = body1 < 0 && body0 > 0 && c0.c > c1.o && c0.o < c1.c;
  // Bearish engulfing
  const bearEngulf = body1 > 0 && body0 < 0 && c0.c < c1.o && c0.o > c1.c;

  // Strong bullish candle (body > 60% of range, closed green)
  const strongBull = body0 > 0 && range0 > 0 && (body0 / range0) > 0.6;
  // Strong bearish candle
  const strongBear = body0 < 0 && range0 > 0 && (Math.abs(body0) / range0) > 0.6;

  let structure = "Neutral";
  let detail    = "";

  if ((hh && hl) || bullEngulf || (strongBull && c0.c > c1.h)) {
    structure = "Bullish";
    if (hh && hl)    detail = "Higher highs & higher lows — uptrend structure intact";
    else if (bullEngulf) detail = "Bullish engulfing candle — momentum shift to buyers";
    else              detail = "Strong bullish displacement candle above prior high";
  } else if ((lh && ll) || bearEngulf || (strongBear && c0.c < c1.l)) {
    structure = "Bearish";
    if (lh && ll)    detail = "Lower highs & lower lows — downtrend structure intact";
    else if (bearEngulf) detail = "Bearish engulfing candle — momentum shift to sellers";
    else              detail = "Strong bearish displacement candle below prior low";
  } else {
    structure = "Neutral";
    detail    = "No clear swing structure — price in consolidation range";
  }

  return {
    structure,
    detail,
    rangeHigh: Math.max(...candles.slice(0, 5).map(c => parseFloat(c.high))),
    rangeLow:  Math.min(...candles.slice(0, 5).map(c => parseFloat(c.low))),
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!TWELVE_KEY) {
    return res.status(500).json({ error: "TWELVE_DATA_API_KEY not set" });
  }

  try {
    const symbolList = Object.values(SYMBOLS).join(",");

    // Fetch quote + time_series (last 5 daily candles) in parallel
    const [quoteRes, candleRes] = await Promise.all([
      fetch(`https://api.twelvedata.com/quote?symbol=${symbolList}&apikey=${TWELVE_KEY}`),
      fetch(`https://api.twelvedata.com/time_series?symbol=${symbolList}&interval=1day&outputsize=5&apikey=${TWELVE_KEY}`),
    ]);

    if (!quoteRes.ok)  throw new Error(`Quote error ${quoteRes.status}`);
    if (!candleRes.ok) throw new Error(`Candle error ${candleRes.status}`);

    const quoteData  = await quoteRes.json();
    const candleData = await candleRes.json();

    const out = {};

    for (const [asset, sym] of Object.entries(SYMBOLS)) {
      const q = quoteData[sym];
      if (!q || q.status === "error") {
        out[asset] = { live: false, error: q?.message || "no quote data" };
        continue;
      }

      const price  = parseFloat(q.close);
      const prev   = parseFloat(q.previous_close);
      const change = ((price - prev) / prev) * 100;

      // OHLC structure from candles
      const candleSeries = candleData[sym]?.values || [];
      const { structure, detail, rangeHigh, rangeLow } = deriveOHLCStructure(candleSeries);

      out[asset] = {
        price:          +price.toFixed(2),
        change:         +change.toFixed(2),
        trend:          change >= 0 ? "bullish" : "bearish",
        live:           true,
        fetchedAt:      Date.now(),
        ohlcStructure:  structure,   // "Bullish" | "Bearish" | "Neutral" | "Unknown"
        structureDetail: detail,
        rangeHigh,
        rangeLow,
      };
    }

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=30");
    return res.status(200).json(out);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
