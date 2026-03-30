// api/prices.js
// All prices from Twelve Data free tier
// OIL  → USO  (US Oil Fund ETF — tracks WTI 1:1 direction)
// GOLD → XAU/USD (real gold spot price)
// NQ   → QQQ  (Nasdaq 100 ETF)

const TWELVE_KEY  = process.env.TWELVE_DATA_API_KEY;
const FINNHUB_KEY = "d73p731r01qjjol3r9q0d73p731r01qjjol3r9qg";

// GOLD + NQ from Twelve Data, OIL from Finnhub
const TD_SYMBOLS = {
  GOLD: "XAU/USD",
  NQ:   "QQQ",
};

// ── OHLC structure from daily candles ─────────────────────────────────
function deriveOHLCStructure(candles) {
  if (!candles || candles.length < 3)
    return { structure:"Unknown", detail:"Not enough candle data", rangeHigh:null, rangeLow:null };

  const [c0,c1,c2] = candles.map(c => ({
    o: parseFloat(c.open),
    h: parseFloat(c.high),
    l: parseFloat(c.low),
    c: parseFloat(c.close),
  }));

  const body0  = c0.c - c0.o;
  const body1  = c1.c - c1.o;
  const range0 = c0.h - c0.l;

  const hh = c0.h > c1.h && c1.h > c2.h;
  const hl = c0.l > c1.l && c1.l > c2.l;
  const lh = c0.h < c1.h && c1.h < c2.h;
  const ll = c0.l < c1.l && c1.l < c2.l;

  const bullEngulf = body1 < 0 && body0 > 0 && c0.c > c1.o && c0.o < c1.c;
  const bearEngulf = body1 > 0 && body0 < 0 && c0.c < c1.o && c0.o > c1.c;
  const strongBull = body0 > 0 && range0 > 0 && (body0 / range0) > 0.6;
  const strongBear = body0 < 0 && range0 > 0 && (Math.abs(body0) / range0) > 0.6;

  let structure = "Neutral", detail = "";

  if ((hh && hl) || bullEngulf || (strongBull && c0.c > c1.h)) {
    structure = "Bullish";
    detail    = hh && hl       ? "Higher highs & higher lows — uptrend structure intact"
              : bullEngulf     ? "Bullish engulfing candle — momentum shift to buyers"
              : "Strong bullish displacement candle above prior high";
  } else if ((lh && ll) || bearEngulf || (strongBear && c0.c < c1.l)) {
    structure = "Bearish";
    detail    = lh && ll       ? "Lower highs & lower lows — downtrend structure intact"
              : bearEngulf     ? "Bearish engulfing candle — momentum shift to sellers"
              : "Strong bearish displacement candle below prior low";
  } else {
    detail = "No clear swing structure — price in consolidation range";
  }

  return {
    structure, detail,
    rangeHigh: Math.max(...candles.slice(0,5).map(c => parseFloat(c.high))),
    rangeLow:  Math.min(...candles.slice(0,5).map(c => parseFloat(c.low))),
  };
}

// ── Main handler ──────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin",  "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!TWELVE_KEY)
    return res.status(500).json({ error: "TWELVE_DATA_API_KEY not set" });

  try {
    const symList = Object.values(TD_SYMBOLS).join(",");

    // All 3 in parallel — Finnhub for OIL, Twelve Data for GOLD+NQ
    const [quoteRes, candleRes, oilData] = await Promise.all([
      fetch(`https://api.twelvedata.com/quote?symbol=${symList}&apikey=${TWELVE_KEY}`),
      fetch(`https://api.twelvedata.com/time_series?symbol=${symList}&interval=1day&outputsize=6&apikey=${TWELVE_KEY}`),
      fetchOilFinnhub(),
    ]);

    if (!quoteRes.ok)  throw new Error(`Quote error ${quoteRes.status}`);
    if (!candleRes.ok) throw new Error(`Candle error ${candleRes.status}`);

    const quoteData  = await quoteRes.json();
    const candleData = await candleRes.json();

    const out = { OIL: oilData };

    for (const [asset, sym] of Object.entries(TD_SYMBOLS)) {
      const q = quoteData[sym];
      if (!q || q.status === "error") {
        out[asset] = { live:false, error: q?.message || "no data" };
        continue;
      }
      const price  = parseFloat(q.close);
      const prev   = parseFloat(q.previous_close);
      const change = ((price - prev) / prev) * 100;
      const candles = candleData[sym]?.values || [];
      const { structure, detail, rangeHigh, rangeLow } = deriveOHLCStructure(candles);
      out[asset] = {
        price:           +price.toFixed(2),
        change:          +change.toFixed(2),
        trend:           change >= 0 ? "bullish" : "bearish",
        live:            true,
        fetchedAt:       Date.now(),
        ohlcStructure:   structure,
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
