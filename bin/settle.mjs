#!/usr/bin/env node
/**
 * Settle the locked calls, after the market has answered.
 *
 * Reads back every night that was locked and not yet settled, fetches what the
 * price did in the hour after the bell, and writes the outcome beside the call.
 * Nothing is recomputed: the move and the odds are the ones that were written
 * down before the open, so the only thing this adds is what happened.
 *
 *   node bin/settle.mjs [rtoken|perp]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { candles } from "../src/bitget.js";
import { priceAt } from "../src/night.js";
import { darkHours } from "../src/session.js";
import { STOOD } from "../src/measure.js";

const marketId = (process.argv[2] || "rtoken").toLowerCase();
const at = (p) => new URL(p, import.meta.url);
const dir = at("../data/live/");
if (!existsSync(dir)) {
  console.log("no live records yet");
  process.exit(0);
}

const files = readdirSync(dir).filter((f) => f.startsWith(`${marketId}-`) && f.endsWith(".json"));
let touched = 0;

for (const file of files) {
  const path = new URL(file, dir);
  const record = JSON.parse(readFileSync(path, "utf8"));
  if (record.settled) continue;

  const w = darkHours(record.session);
  if (Date.now() < w.plus60 + 5 * 60_000) {
    console.log(`${file}: the hour after the bell is not finished yet — leaving it alone`);
    continue;
  }

  const outcomes = [];
  for (const call of record.calls) {
    try {
      const rows = await candles(call.symbol, { pages: 2, marketId });
      const pre = priceAt(rows, w.pre, 90);
      const after = priceAt(rows, w.plus60, 90);
      if (pre == null || after == null) {
        outcomes.push({ symbol: call.symbol, unsettleable: "no price at the reference moments" });
        continue;
      }
      // The move is the one written down at lock time, not re-read now.
      const kept = 1 + ((after - pre) / pre) / call.moveAtLock;
      outcomes.push({ symbol: call.symbol, pre, after, kept, undone: kept < STOOD });
    } catch (err) {
      outcomes.push({ symbol: call.symbol, unsettleable: err.message });
    }
  }

  const judged = outcomes.filter((o) => o.undone !== undefined);
  const undone = judged.filter((o) => o.undone).length;
  const said = record.calls
    .filter((c) => judged.some((o) => o.symbol === c.symbol))
    .reduce((a, c) => a + c.said, 0) / (judged.length || 1);

  record.settled = {
    settledAt: new Date().toISOString(),
    judged: judged.length,
    unsettleable: outcomes.length - judged.length,
    undone,
    itSaid: said,
    itHappened: judged.length ? undone / judged.length : null,
  };
  record.outcomes = outcomes;
  writeFileSync(path, JSON.stringify(record, null, 1));
  touched++;

  const s = record.settled;
  console.log(
    `${file}: ${s.judged} judged — it said ${(100 * s.itSaid).toFixed(1)}% would be undone, ` +
      `${(100 * s.itHappened).toFixed(1)}% were` + (s.unsettleable ? ` (${s.unsettleable} unsettleable)` : ""),
  );
}

if (!touched) console.log("nothing ready to settle");
