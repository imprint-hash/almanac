/**
 * The crypto market's mood tonight, from Bitget's `bitget-signal` server.
 *
 * Stock tokens trade overnight beside crypto, on the same exchange, often with
 * the same traders. When New York is shut, Bitcoin is the loudest thing in the
 * room, so the desk shows what it is doing. Context only: none of this feeds the
 * bands or the odds, and the page says so.
 *
 * `bitget-signal` is the public, keyless half of Bitget Agent Hub. Its tools
 * are called here directly over MCP, the same way an agent would call them.
 */

import { client } from "../src/mcp.js";

const SIGNAL_URL = process.env.BITGET_SIGNAL_URL || "https://datahub.noxiaohao.com/mcp";
const signal = client(SIGNAL_URL);

const TTL = 10 * 60_000;
let hit = null;

/** The server's own verdict words, said the way a person would. */
const WORDS = { BULLISH: "leaning up", BEARISH: "leaning down", NEUTRAL: "undecided" };

async function read() {
  const r = await signal.call(
    "technical_analysis",
    { action: "full_analysis", symbol: "BTC/USDT", timeframe: "4h" },
    { timeout: 25_000 },
  );
  const d = r?.data;
  if (r?.isError || !d?.verdict) throw new Error((r?.raw || "no reading").slice(0, 120));
  return {
    asset: "BTC",
    timeframe: "4h",
    price: d.ma?.price ?? d.support_resistance?.current_price ?? null,
    verdict: d.verdict,
    words: WORDS[d.verdict] || String(d.verdict).toLowerCase(),
    rsi: d.rsi?.rsi ?? null,
    rsiSignal: d.rsi?.signal ?? null,
    trend: d.ma?.trend ?? null,
    macdCross: d.macd?.cross ?? null,
    bull: d.bull_signals ?? null,
    bear: d.bear_signals ?? null,
  };
}

export default async function handler(req, res) {
  try {
    if (!hit || Date.now() - hit.at > TTL) hit = { at: Date.now(), mood: await read() };
    res.setHeader("cache-control", "public, max-age=300, stale-while-revalidate=900");
    res.status(200).json({
      at: hit.at,
      mood: hit.mood,
      source: "bitget-signal · technical-analysis",
      note: "Context only. Crypto's mood does not feed Almanac's odds.",
    });
  } catch (err) {
    res.status(200).json({ mood: null, source: "bitget-signal", error: `bitget-signal did not answer: ${err.message}` });
  }
}
