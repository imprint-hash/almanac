/**
 * The rail: where every name stands tonight, ordered by ratio.
 *
 * Bitget is asked once per name and the answer is held for a few minutes, so a
 * page that several people open at once costs the exchange one sweep, not one
 * per visitor. A sweep that partly fails still answers: the response says how
 * many names replied, and the page prints that rather than pretending the
 * board is complete.
 */

import { readFileSync } from "node:fs";
import { board } from "../src/desk.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const index = read("../data/index.json");
const normals = read("../data/normal.json");

const TTL = 3 * 60_000;
let cache = null;

export default async function handler(req, res) {
  try {
    if (!cache || Date.now() - cache.at > TTL) {
      const symbols = Object.keys(normals);
      const result = await board(symbols, normals, index);
      cache = { at: Date.now(), result };
    }
    res.setHeader("cache-control", "public, max-age=60, stale-while-revalidate=240");
    res.status(200).json({
      at: cache.at,
      asked: cache.result.asked,
      answered: cache.result.answered,
      rows: cache.result.rows,
      bands: index.bands,
      baseline: index.all.undonePct,
      meta: index.meta,
      cuts: index.cuts,
    });
  } catch (err) {
    // A dead exchange is a thing to say plainly, not a 500 with a stack trace.
    res.status(200).json({
      at: Date.now(),
      asked: 0,
      answered: 0,
      rows: [],
      error: `Bitget did not answer: ${err.message}`,
      bands: index.bands,
      baseline: index.all.undonePct,
      meta: index.meta,
      cuts: index.cuts,
    });
  }
}
