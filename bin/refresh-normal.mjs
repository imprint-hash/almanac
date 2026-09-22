#!/usr/bin/env node
/**
 * Recompute what an ordinary session looks like for every name on the board.
 * Run daily; the desk reads the result instead of paging candles per visitor.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { candles, rwaContracts, turnover } from "../src/bitget.js";
import { sessionRanges, normalDay, NORMAL_DAY_SESSIONS } from "../src/night.js";
import { currentDarkHours } from "../src/session.js";

const LIMIT = Number(process.env.ALMANAC_NAMES || 40);
const contracts = await rwaContracts();
const turn = await turnover();
const names = Object.keys(contracts)
  .filter((s) => turn[s])
  .sort((a, b) => turn[b] - turn[a])
  .slice(0, LIMIT);

const reopens = currentDarkHours().reopens;
const out = {};
let queue = [...names];
const worker = async () => {
  while (queue.length) {
    const sym = queue.shift();
    try {
      const rows = await candles(sym, { pages: 12 });
      const ranges = sessionRanges(rows);
      const n = normalDay(rows, reopens, ranges);
      if (n > 0) {
        out[sym] = { normalDay: n, sessions: ranges.size, turnover: turn[sym], asOf: new Date().toISOString() };
        process.stdout.write(`  ${sym.replace("USDT", "").padEnd(10)} ${(100 * n).toFixed(2)}% over ${ranges.size} sessions\n`);
      } else {
        process.stdout.write(`  ${sym.replace("USDT", "").padEnd(10)} skipped — fewer than ${NORMAL_DAY_SESSIONS} sessions\n`);
      }
    } catch (e) {
      process.stdout.write(`  ${sym.replace("USDT", "").padEnd(10)} failed — ${e.message}\n`);
    }
  }
};
await Promise.all(Array.from({ length: 5 }, worker));

writeFileSync(new URL("../data/normal.json", import.meta.url), JSON.stringify(out, null, 1));
console.log(`\n${Object.keys(out).length} of ${names.length} names have a normal day, as of ${reopens}`);
