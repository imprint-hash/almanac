#!/usr/bin/env node
/** Replay every measured night, walk-forward, and grade the odds Almanac quoted. */
import { readFileSync, writeFileSync } from "node:fs";
import { replay, scorecard } from "../src/grade.js";

const nights = JSON.parse(readFileSync(new URL("../data/nights.json", import.meta.url), "utf8"));
const calls = replay(nights);
const card = scorecard(calls);
writeFileSync(new URL("../data/scorecard.json", import.meta.url), JSON.stringify({ card, calls }, null, 1));

const pc = (x) => (x == null ? "   -" : `${(100 * x).toFixed(1)}%`);
console.log(`graded ${card.from} → ${card.to}`);
console.log(`${card.nights} nights judged · quoted odds on ${card.quoted} · declined ${card.declined}\n`);
console.log("band              n     it said    it happened     gap");
for (const [b, s] of Object.entries(card.byBand))
  console.log(`  ${b.padEnd(12)}${String(s.n).padStart(5)}    ${pc(s.said).padStart(7)}    ${pc(s.happened).padStart(9)}  ${(s.gap>=0?"+":"")}${(100*s.gap).toFixed(1)} pts`);
console.log(`\nBrier score            ${card.brier?.toFixed(4)}`);
console.log(`same, knowing nothing  ${card.brierBaseline?.toFixed(4)}`);
console.log(`skill over baseline    ${(100*card.skill).toFixed(1)}%   (above zero = the bands carry real information)`);
console.log(`worst calibration gap  ${(100*card.worstGap).toFixed(1)} pts`);
