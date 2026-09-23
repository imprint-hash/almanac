/**
 * The rail: where every name stands tonight, ordered by ratio.
 *
 * Bitget is asked once per name and the answer is held for a few minutes, so a
 * page that several people open at once costs the exchange one sweep, not one
 * per visitor. A sweep that partly fails still answers: the response says how
 * many names replied, and the page prints that rather than pretending the
 * board is complete.
 */

import { board } from "../src/desk.js";
import { pick, markets } from "./_data.mjs";

const TTL = 3 * 60_000;
const cache = new Map();

export default async function handler(req, res) {
  const m = pick(req.query);
  try {
    let hit = cache.get(m.id);
    if (!hit || Date.now() - hit.at > TTL) {
      const result = await board(Object.keys(m.normals), m.normals, m.index, { marketId: m.id });
      hit = { at: Date.now(), result };
      cache.set(m.id, hit);
    }
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=240");
    res.status(200).json({
      market: m.id, label: m.label, markets,
      at: hit.at, asked: hit.result.asked, answered: hit.result.answered, rows: hit.result.rows,
      bands: m.index.bands, baseline: m.index.all.undonePct, meta: m.index.meta, cuts: m.index.cuts,
    });
  } catch (err) {
    // A dead exchange is a thing to say plainly, not a 500 with a stack trace.
    res.status(200).json({
      market: m.id, label: m.label, markets,
      at: Date.now(), asked: 0, answered: 0, rows: [],
      error: `Bitget did not answer: ${err.message}`,
      bands: m.index.bands, baseline: m.index.all.undonePct, meta: m.index.meta, cuts: m.index.cuts,
    });
  }
}
