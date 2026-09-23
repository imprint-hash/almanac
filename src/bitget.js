/**
 * The only place Almanac talks to Bitget.
 *
 * Everything here is a public market endpoint: no key, no account, no order
 * ever leaves this process.
 *
 * Two markets carry the same stocks and they are not the same instrument:
 *
 *   rtoken — the tokenised share itself, spot, base coin `rNVDA`. This is what
 *            the hackathon brief means by rToken, and what Almanac reads first.
 *   perp   — the perpetual future on the stock, flagged `isRwa` by Bitget.
 *            A bet on the price rather than a holding.
 *
 * The same measurement runs on both, from the same code, which is the point:
 * a rule that only works on one of them is a rule about that venue, not about
 * the dark hours.
 */

const BASE = process.env.BITGET_API || "https://api.bitget.com";
const PRODUCT = "USDT-FUTURES";

export const MARKETS = {
  rtoken: {
    id: "rtoken",
    label: "rTokens",
    what: "the tokenised share itself, spot",
    symbols: "/api/v2/spot/public/symbols",
    tickers: "/api/v2/spot/market/tickers",
    candles: (symbol, endTime) =>
      `/api/v2/spot/market/history-candles?symbol=${symbol}&granularity=15min&limit=200&endTime=${endTime}`,
    // Bitget marks a tokenised share by its base coin, rNVDA and friends.
    isOurs: (c) => c.baseCoin?.startsWith("r") && c.quoteCoin === "USDT" && c.status === "online",
    pretty: (c) => c.baseCoin,
  },
  perp: {
    id: "perp",
    label: "Perpetuals",
    what: "the perpetual future on the stock",
    symbols: `/api/v2/mix/market/contracts?productType=${PRODUCT}`,
    tickers: `/api/v2/mix/market/tickers?productType=${PRODUCT}`,
    candles: (symbol, endTime) =>
      `/api/v2/mix/market/history-candles?symbol=${symbol}&productType=${PRODUCT}` +
      `&granularity=15m&limit=200&endTime=${endTime}`,
    isOurs: (c) => c.isRwa === "YES",
    pretty: (c) => c.baseCoin,
  },
};

export const DEFAULT_MARKET = "rtoken";
export const market = (id) => MARKETS[id] || MARKETS[DEFAULT_MARKET];

/** One page of candles is 200 rows; at 15m that is 50 hours. */
export const PAGE_MS = 200 * 15 * 60 * 1000;

class BitgetError extends Error {
  constructor(code, msg, path) {
    super(`bitget ${code}: ${msg} (${path})`);
    this.code = code;
  }
}

/**
 * api.bitget.com sits behind Cloudflare, and on some networks its name stops
 * resolving for minutes at a time while every other host is fine. Setting
 * BITGET_IP pins the connection to a known address and keeps the TLS name, so
 * a local run survives it. Unset — which is how this deploys — it is an
 * ordinary request.
 */
const PIN = process.env.BITGET_IP || null;

function request(path) {
  if (!PIN) {
    return fetch(BASE + path, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000),
    }).then((r) => r.json());
  }
  return import("node:https").then(
    (https) =>
      new Promise((resolve, reject) => {
        const url = new URL(BASE + path);
        const req = https.request(
          {
            host: PIN,
            servername: url.hostname, // keep SNI and certificate validation honest
            headers: { host: url.hostname, accept: "application/json" },
            path: url.pathname + url.search,
            port: 443,
            timeout: 20_000,
          },
          (res) => {
            let body = "";
            res.on("data", (d) => (body += d));
            res.on("end", () => {
              try {
                resolve(JSON.parse(body));
              } catch (e) {
                reject(e);
              }
            });
          },
        );
        req.on("timeout", () => req.destroy(new Error("timeout")));
        req.on("error", reject);
        req.end();
      }),
  );
}

async function get(path, { tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const body = await request(path);
      if (body.code === "00000") return body.data;
      // Rate limiting is the one failure worth waiting out; the rest are ours.
      if (body.code !== "429") throw new BitgetError(body.code, body.msg, path);
      last = new BitgetError(body.code, body.msg, path);
    } catch (err) {
      last = err;
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  throw last;
}

/** Every name in this market that carries a stock, keyed by trading symbol. */
export async function universe(marketId = DEFAULT_MARKET) {
  const m = market(marketId);
  const all = await get(m.symbols);
  const out = {};
  for (const c of all) if (m.isOurs(c)) out[c.symbol] = { ...c, display: m.pretty(c) };
  return out;
}

/** 24h turnover per symbol, used only to order a list for a human to read. */
export async function turnover(marketId = DEFAULT_MARKET) {
  const rows = await get(market(marketId).tickers);
  return Object.fromEntries(rows.map((t) => [t.symbol, Number(t.usdtVolume || 0)]));
}

/**
 * 15-minute candles, newest last: { t, open, high, low, close, volume }.
 * `endTime` walks backwards a page at a time; Bitget returns the 200 candles
 * ending there, so page boundaries are arithmetic and need no cursor. Both
 * markets return the same row shape, so one parser serves them.
 */
export async function candles(symbol, { endTime = Date.now(), pages = 1, marketId = DEFAULT_MARKET } = {}) {
  const m = market(marketId);
  const rows = new Map();
  let end = endTime;
  for (let p = 0; p < pages; p++) {
    const page = await get(m.candles(symbol, end));
    if (!page?.length) break;
    for (const r of page) {
      rows.set(Number(r[0]), {
        t: Number(r[0]),
        open: Number(r[1]),
        high: Number(r[2]),
        low: Number(r[3]),
        close: Number(r[4]),
        volume: Number(r[5]),
      });
    }
    end = Number(page[0][0]) - 1;
  }
  return [...rows.values()].sort((a, b) => a.t - b.t);
}
