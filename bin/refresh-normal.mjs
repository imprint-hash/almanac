#!/usr/bin/env node
/**
 * Recompute what an ordinary session looks like for every name on the board,
 * for one market. Run daily; the desk reads the result instead of paging
 * candles per visitor.
 *
 *   node bin/refresh-normal.mjs rtoken
 *   node bin/refresh-normal.mjs perp
 */
import { writeFileSync } from "node:fs";
import { candles, universe, turnover, market } from "../src/bitget.js";
import { sessionRanges, normalDay, NORMAL_DAY_SESSIONS } from "../src/night.js";
import { currentDarkHours } from "../src/session.js";

const marketId = (process.argv[2] || "rtoken").toLowerCase();
const m = market(marketId);
const LIMIT = Number(process.env.ALMANAC_NAMES || 40);

const names = await universe(marketId);
const turn = await turnover(marketId);
const picked = Object.keys(names)
  .filter((s) => turn[s])
  .sort((a, b) => turn[b] - turn[a])
  .slice(0, LIMIT);

console.log(`${m.label}: ${Object.keys(names).length} listed, taking the ${picked.length} busiest`);

const reopens = currentDarkHours().reopens;
const out = {};
const queue = [...picked];
const worker = async () => {
  while (queue.length) {
    const sym = queue.shift();
    const label = (names[sym].display || sym).padEnd(10);
    try {
      const rows = await candles(sym, { pages: 12, marketId });
      const ranges = sessionRanges(rows);
      const n = normalDay(rows, reopens, ranges);
      if (n > 0) {
        out[sym] = {
          normalDay: n,
          sessions: ranges.size,
          turnover: turn[sym],
          display: names[sym].display || sym,
          asOf: new Date().toISOString(),
        };
        process.stdout.write(`  ${label} ${(100 * n).toFixed(2)}% over ${ranges.size} sessions\n`);
      } else {
        process.stdout.write(`  ${label} skipped — fewer than ${NORMAL_DAY_SESSIONS} sessions\n`);
      }
    } catch (e) {
      process.stdout.write(`  ${label} failed — ${e.message}\n`);
    }
  }
};
await Promise.all(Array.from({ length: 5 }, worker));

writeFileSync(new URL(`../data/normal-${marketId}.json`, import.meta.url), JSON.stringify(out, null, 1));
console.log(`\n${Object.keys(out).length} of ${picked.length} names have a normal day, as of ${reopens}`);
