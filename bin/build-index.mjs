#!/usr/bin/env node
/**
 * Turn the measured nights into the tables the desk reads, one per market,
 * and grade each of them walk-forward.
 *
 *   node bin/build-index.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildIndex } from "../src/measure.js";
import { replay, scorecard } from "../src/grade.js";

const pc = (x, d = 1) => `${(100 * x).toFixed(d)}%`;
const at = (p) => new URL(p, import.meta.url);

for (const marketId of ["rtoken", "perp"]) {
  const nights = JSON.parse(readFileSync(at(`../data/nights-${marketId}.json`), "utf8"));
  const index = buildIndex(nights);
  const calls = replay(nights, { warmup: 300 });
  const card = scorecard(calls);

  index.market = marketId;
  index.record = {
    byBand: card.byBand,
    brier: card.brier,
    baseline: card.brierBaseline,
    skill: card.skill,
    quoted: card.quoted,
    worstGap: card.worstGap,
    from: card.from,
    to: card.to,
  };

  writeFileSync(at(`../data/index-${marketId}.json`), JSON.stringify(index, null, 1));
  writeFileSync(at(`../data/scorecard-${marketId}.json`), JSON.stringify({ card, calls }, null, 1));

  const m = index.meta;
  console.log(`\n${marketId.toUpperCase()}  ${m.nights} nights · ${m.symbols} names · ${m.from} → ${m.to}`);
  console.log(`  a night picked at random is undone ${pc(index.all.undonePct)} of the time`);
  for (const [b, s] of Object.entries(index.bands))
    console.log(`    ${b.padEnd(10)} n=${String(s.n).padStart(4)}  undone ${pc(s.undonePct).padStart(6)}`);
  console.log(`  graded ${card.quoted} nights · skill ${pc(card.skill)} · worst calibration gap ${pc(card.worstGap)}`);
}
