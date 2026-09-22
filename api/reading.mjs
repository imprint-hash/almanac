/**
 * One name, read in full: tonight's move, what it is worth for that name, the
 * band it lands in, what history did there, and the price path since the close.
 */

import { readFileSync } from "node:fs";
import { reading } from "../src/desk.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const index = read("../data/index.json");
const normals = read("../data/normal.json");
const { card } = read("../data/scorecard.json");

const TTL = 60_000;
const cache = new Map();

export default async function handler(req, res) {
  const raw = String(req.query?.symbol || "NVDA").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const symbol = raw.endsWith("USDT") ? raw : raw + "USDT";

  try {
    const hit = cache.get(symbol);
    let result = hit && Date.now() - hit.at < TTL ? hit.result : null;
    if (!result) {
      result = await reading(symbol, normals, index);
      cache.set(symbol, { at: Date.now(), result });
    }

    res.setHeader("cache-control", "public, max-age=30, stale-while-revalidate=120");
    res.status(200).json({
      ...result,
      bands: index.bands,
      baseline: index.all.undonePct,
      meta: index.meta,
      // The desk's own record travels with every reading: a number is not
      // worth much without how often that number has been true.
      record: { byBand: card.byBand, brier: card.brier, baseline: card.brierBaseline, skill: card.skill, quoted: card.quoted },
    });
  } catch (err) {
    res.status(200).json({ symbol, error: `Could not read ${symbol}: ${err.message}`, meta: index.meta });
  }
}
