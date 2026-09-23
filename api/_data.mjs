/**
 * The measured record, loaded once per process.
 *
 * Both markets are kept side by side deliberately. The same rule was measured
 * on the tokenised shares and on the perpetuals written against them, and a
 * reader who wants to check that it holds on both should not have to take our
 * word for it — the other market is one query parameter away.
 */

import { readFileSync } from "node:fs";
import { MARKETS, DEFAULT_MARKET } from "../src/bitget.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));

const loaded = {};
for (const id of Object.keys(MARKETS)) {
  loaded[id] = {
    id,
    label: MARKETS[id].label,
    what: MARKETS[id].what,
    index: read(`../data/index-${id}.json`),
    normals: read(`../data/normal-${id}.json`),
  };
}

/** Never trust a query string to name a file. */
export function pick(query) {
  const asked = String(query?.market || "").toLowerCase();
  return loaded[asked] ? loaded[asked] : loaded[DEFAULT_MARKET];
}

export const markets = Object.values(loaded).map((m) => ({
  id: m.id,
  label: m.label,
  what: m.what,
  nights: m.index.meta.nights,
  names: m.index.meta.symbols,
  skill: m.index.record.skill,
}));

export { loaded };
