/**
 * One name, read in full: tonight's move, what it is worth for that name, the
 * band it lands in, what history did there, and the price path since the close.
 */

import { reading } from "../src/desk.js";
import { pick, markets } from "./_data.mjs";
import { replayAt } from "../src/clock.js";

const TTL = 60_000;
const cache = new Map();

export default async function handler(req, res) {
  const m = pick(req.query);
  const raw = String(req.query?.symbol || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const known = Object.keys(m.normals);
  const symbol = known.includes(raw) ? raw : known.includes(raw + "USDT") ? raw + "USDT" : !raw ? known[0] : null;
  // A name Almanac doesn't carry is said plainly, never answered with another
  // token's odds: an agent asking about "ZZZZ" must not get rQQQ back.
  if (!symbol) {
    return res.status(200).json({
      symbol: raw, market: m.id,
      error: `Almanac does not carry ${raw.slice(0, 20)} on ${m.label}.`,
      carried: known.map((s) => m.normals[s]?.display ?? s),
    });
  }
  const { at, error: replayError } = replayAt(req.query);
  const key = `${m.id}:${symbol}:${at ?? "now"}`;

  try {
    let hit = cache.get(key);
    if (!hit || (at == null && Date.now() - hit.at > TTL)) {
      hit = { at: Date.now(), result: await reading(symbol, m.normals, m.index, { marketId: m.id, at }) };
      cache.set(key, hit);
    }
    res.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=120");
    res.status(200).json({
      ...hit.result,
      replayError,
      label: m.label, markets,
      bands: m.index.bands, baseline: m.index.all.undonePct, meta: m.index.meta, cuts: m.index.cuts,
      // The desk's own record travels with every reading: a number is not worth
      // much without how often that number has turned out to be true.
      record: m.index.record,
    });
  } catch (err) {
    res.status(200).json({ symbol, market: m.id, error: `Could not read ${symbol}: ${err.message}`, meta: m.index.meta });
  }
}
