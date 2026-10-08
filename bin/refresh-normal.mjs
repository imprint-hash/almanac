#!/usr/bin/env node
/**
 * Recompute what an ordinary session looks like for every name on the board,
 * for one market. Run daily; the desk reads the result instead of paging
 * candles per visitor.
 *
 *   node bin/refresh-normal.mjs rtoken
 *   node bin/refresh-normal.mjs perp
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
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
const file = new URL(`../data/normal-${marketId}.json`, import.meta.url);
const before = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const queue = [...picked];
const worker = async () => {
  while (queue.length) {
    const sym = queue.shift();
    const label = (names[sym].display || sym).padEnd(10);
    try {
      // Twelve pages per name is a lot of requests, and Bitget answers a burst
      // with 429. A name that is refused is tried again after a pause.
      let rows;
      for (let attempt = 0; ; attempt++) {
        try {
          rows = await candles(sym, { pages: 12, marketId });
          break;
        } catch (e) {
          if (!/429/.test(e.message) || attempt >= 3) throw e;
          await wait(4000 * (attempt + 1));
        }
      }
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
      // Keep the last good figure rather than dropping the name. The desk
      // already refuses a figure older than STALE_DAYS, so it cannot linger.
      if (before[sym]) out[sym] = before[sym];
      process.stdout.write(`  ${label} failed — ${e.message}${before[sym] ? " (kept the figure from " + before[sym].asOf.slice(0, 10) + ")" : ""}\n`);
    }
  }
};
await Promise.all(Array.from({ length: 2 }, worker));

writeFileSync(file, JSON.stringify(out, null, 1));
console.log(`\n${Object.keys(out).length} of ${picked.length} names have a normal day, as of ${reopens}`);
