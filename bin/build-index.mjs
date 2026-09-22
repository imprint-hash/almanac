#!/usr/bin/env node
/** Turn the measured nights into the table the desk reads. */
import { readFileSync, writeFileSync } from "node:fs";
import { buildIndex } from "../src/measure.js";

const nights = JSON.parse(readFileSync(new URL("../data/nights.json", import.meta.url), "utf8"));
const index = buildIndex(nights);
writeFileSync(new URL("../data/index.json", import.meta.url), JSON.stringify(index, null, 1));

const pc = (x) => `${(100 * x).toFixed(1)}%`;
const m = index.meta;
console.log(`${m.nights} nights · ${m.symbols} names · ${m.from} to ${m.to}`);
console.log(`overall: ${pc(index.all.undonePct)} of overnight moves were undone by 10:30\n`);
console.log("by how big the move was for that name:");
for (const [b, s] of Object.entries(index.bands))
  console.log(`  ${b.padEnd(10)} n=${String(s.n).padStart(4)}   undone ${pc(s.undonePct).padStart(6)}`);
console.log("\ncuts worth knowing:");
for (const [k, s] of Object.entries(index.cuts))
  console.log(`  ${k.padEnd(14)} n=${String(s.n).padStart(4)}   undone ${pc(s.undonePct).padStart(6)}`);
