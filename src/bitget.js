/**
 * The only place Almanac talks to Bitget.
 *
 * Everything here is a public market endpoint: no key, no account, no order
 * ever leaves this process. Almanac reads prices and says what history did.
 *
 * `isRwa: "YES"` on a contract is Bitget's own flag for a tokenised real-world
 * asset — the 335 stock, index and commodity perpetuals this is about. It is
 * read from the exchange rather than kept as a list here, so a name listed
 * tomorrow is covered without a code change.
 */

const BASE = process.env.BITGET_API || "https://api.bitget.com";
const PRODUCT = "USDT-FUTURES";

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

/** Every tokenised-asset perpetual Bitget lists, keyed by symbol. */
export async function rwaContracts() {
  const all = await get(`/api/v2/mix/market/contracts?productType=${PRODUCT}`);
  const out = {};
  for (const c of all) if (c.isRwa === "YES") out[c.symbol] = c;
  return out;
}

/** 24h turnover per symbol, used only to order a list for a human to read. */
export async function turnover() {
  const rows = await get(`/api/v2/mix/market/tickers?productType=${PRODUCT}`);
  return Object.fromEntries(rows.map((t) => [t.symbol, Number(t.usdtVolume || 0)]));
}

export async function lastPrice(symbol) {
  const [t] = await get(`/api/v2/mix/market/ticker?symbol=${symbol}&productType=${PRODUCT}`);
  return { price: Number(t.lastPr), at: Number(t.ts) };
}

/**
 * 15-minute candles, newest last: { t, close, volume, high, low }.
 * `endTime` walks backwards a page at a time; Bitget returns the 200 candles
 * ending there, so page boundaries are arithmetic and need no cursor.
 */
export async function candles(symbol, { endTime = Date.now(), pages = 1, granularity = "15m" } = {}) {
  const rows = new Map();
  let end = endTime;
  for (let p = 0; p < pages; p++) {
    const page = await get(
      `/api/v2/mix/market/history-candles?symbol=${symbol}&productType=${PRODUCT}` +
        `&granularity=${granularity}&limit=200&endTime=${end}`,
    );
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

/**
 * The live candles cover only the recent past, so a fresh read takes the
 * current session plus enough completed ones to know what a normal day looks
 * like for this name. Fifteen sessions of cover for ten sessions of history.
 */
export async function recent(symbol) {
  return candles(symbol, { pages: 12 });
}
