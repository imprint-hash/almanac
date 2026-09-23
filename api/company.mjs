/**
 * The company behind one token: the real share's last session, and anything
 * dated near tonight — earnings, an ex-dividend date, a split.
 *
 * Kept as its own endpoint so a slow or unreachable MCP server can never delay
 * the reading itself.
 */
import { context } from "../src/underlying.js";
import { currentDarkHours } from "../src/session.js";
import { pick } from "./_data.mjs";

const TTL = 10 * 60_000;
const cache = new Map();

export default async function handler(req, res) {
  const m = pick(req.query);
  const raw = String(req.query?.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const known = Object.keys(m.normals);
  const symbol = known.includes(raw) ? raw : known.includes(raw + "USDT") ? raw + "USDT" : known[0];
  const display = m.normals[symbol]?.display ?? symbol;
  const w = currentDarkHours();
  const key = `${symbol}:${w.reopens}`;

  try {
    let hit = cache.get(key);
    if (!hit || Date.now() - hit.at > TTL) {
      hit = { at: Date.now(), value: await context(symbol, display, w.reopens) };
      cache.set(key, hit);
    }
    res.setHeader("cache-control", "public, max-age=300, stale-while-revalidate=1800");
    res.status(200).json({ symbol, display, session: w.reopens, company: hit.value });
  } catch (err) {
    res.status(200).json({ symbol, display, company: null, error: `The data server did not answer: ${err.message}` });
  }
}
