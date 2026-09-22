#!/usr/bin/env node
/**
 * The desk question: is tonight's move on this name real?
 *   node bin/ask.mjs NVDA
 */
import { readFileSync } from "node:fs";
import { recent } from "../src/bitget.js";
import { nightSoFar } from "../src/night.js";
import { lookup } from "../src/measure.js";

const arg = (process.argv[2] || "NVDA").toUpperCase();
const symbol = arg.endsWith("USDT") ? arg : arg + "USDT";
const index = JSON.parse(readFileSync(new URL("../data/index.json", import.meta.url), "utf8"));

const candles = await recent(symbol);
const night = nightSoFar(candles);
const pc = (x, d = 1) => (x == null ? "—" : `${(100 * x).toFixed(d)}%`);

console.log(`\n${symbol.replace("USDT", "")}  ·  session of ${night.session}, reopens ${night.reopens}`);
if (night.marketOpen) console.log("the US market is open right now — this is a live price, not a dark-hours one\n");
else console.log(`${night.hoursSinceClose.toFixed(1)}h since the close, ${night.hoursToBell.toFixed(1)}h to the bell\n`);

if (night.move == null) {
  console.log("no reference close in range — saying nothing.");
  process.exit(0);
}
console.log(`  moved       ${pc(night.move, 2)}  (${night.closePrice} → ${night.nowPrice})`);
console.log(`  normal day  ${pc(night.normalDay, 2)}  median of its last 10 sessions`);
console.log(`  that is     ${night.ratio?.toFixed(2)}× a normal day for this name\n`);

const r = lookup(index, { symbol, move: night.move, normalDay: night.normalDay });
console.log(`  ${r.verdict.label}`);
if (r.stat?.n) {
  console.log(`  band ${r.band} — ${r.gloss}`);
  console.log(`  ${pc(r.stat.undonePct)} of ${r.stat.n} nights in this band were undone by 10:30`);
  console.log(`  against ${pc(index.all.undonePct)} for a night picked at random`);
}
if (r.noHomeMarket) console.log(`  note: this name has no home market — nothing arrives at the bell to settle it`);
console.log();
