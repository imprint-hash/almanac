#!/usr/bin/env node
/**
 * Lock tonight's calls, before the bell.
 *
 * The record on the site is a walk-forward replay of nights that had already
 * happened. That is an honest way to test whether the odds are true, but every
 * one of those calls was made after the fact. This is the other thing: the desk
 * states its odds for tonight, in public, before the market opens and while the
 * answer is genuinely unknown.
 *
 * The file it writes is committed, so each night's call carries a git timestamp
 * that cannot be moved afterwards. `bin/settle.mjs` fills in what happened.
 *
 *   node bin/lock.mjs [rtoken|perp]
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { board } from "../src/desk.js";
import { lookup, MIN_NIGHTS } from "../src/measure.js";
import { currentDarkHours, inNewYork } from "../src/session.js";

const marketId = (process.argv[2] || "rtoken").toLowerCase();
const at = (p) => new URL(p, import.meta.url);
const index = JSON.parse(readFileSync(at(`../data/index-${marketId}.json`), "utf8"));
const normals = JSON.parse(readFileSync(at(`../data/normal-${marketId}.json`), "utf8"));

const w = currentDarkHours();
const now = Date.now();

if (now >= w.bell) {
  console.log(`The bell for ${w.reopens} has already rung. Nothing locked — a call made after the`);
  console.log(`open is not a call, and writing one here would make every other row untrustworthy.`);
  process.exit(0);
}

const { rows, asked, answered } = await board(Object.keys(normals), normals, index, { marketId });

const calls = [];
for (const r of rows) {
  const read = lookup(index, { symbol: r.symbol, move: r.move, normalDay: r.normalDay });
  // Only rows the desk would actually speak about are locked. A night it would
  // decline to read is not a prediction, and padding the record with them would
  // flatter the score.
  if (!read.stat || read.stat.n < MIN_NIGHTS) continue;
  calls.push({
    symbol: r.symbol,
    display: r.display,
    moveAtLock: r.move,
    normalDay: r.normalDay,
    ratio: r.ratio,
    band: read.band,
    said: read.stat.undonePct,
    baseline: index.all.undonePct,
    nightsBehindIt: read.stat.n,
  });
}

const stamp = { ...inNewYork(now) };
const record = {
  market: marketId,
  session: w.date,
  reopens: w.reopens,
  lockedAt: new Date(now).toISOString(),
  lockedAtNewYork: `${stamp.date} ${String(stamp.hour).padStart(2, "0")}:${String(stamp.minute).padStart(2, "0")} ET`,
  minutesBeforeBell: Math.round((w.bell - now) / 60000),
  namesAsked: asked,
  namesAnswered: answered,
  calls,
  settled: null,
};

const dir = dirname(fileURLToPath(at("../data/live/x")));
mkdirSync(dir, { recursive: true });
writeFileSync(at(`../data/live/${marketId}-${w.reopens}.json`), JSON.stringify(record, null, 1));

console.log(`locked ${calls.length} calls for ${w.reopens}, ${record.minutesBeforeBell} minutes before the bell`);
for (const c of calls.slice(0, 8)) {
  console.log(`  ${(c.display || c.symbol).padEnd(10)} ${(100 * c.moveAtLock).toFixed(2).padStart(7)}%  ${c.ratio.toFixed(2)}x  ${c.band.padEnd(10)} says ${(100 * c.said).toFixed(1)}% undone`);
}
if (calls.length > 8) console.log(`  … and ${calls.length - 8} more`);
