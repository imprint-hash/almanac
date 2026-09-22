/**
 * Almanac grading itself.
 *
 * Every night in the record is replayed in order. At each one the desk sees
 * only the nights that had already happened, states the chance the move gets
 * undone, and then the morning settles it.
 *
 * It is graded on whether its odds are true, not on how often it was "right".
 * A desk that says "one in twenty" should be wrong about one time in twenty; if
 * it is wrong one time in four, the number is a lie however confident it
 * sounded. Two measures are reported:
 *
 *   calibration - for each band, the chance it stated against the share that
 *                 actually happened, with the gap between them
 *   Brier score - the mean squared error of those probabilities, against the
 *                 only benchmark that counts: quoting the overall base rate and
 *                 knowing nothing else. Lower is better. If Almanac cannot beat
 *                 the benchmark, the bands are noise and it should say so.
 */

import { buildIndex, bandOf, lookup, FLOOR, STOOD, BANDS, MIN_NIGHTS } from "./measure.js";

/** Nights watched before the desk is allowed to quote a number. */
export const WARMUP = 400;

/** How often the table is rebuilt as history accrues. */
const REBUILD_EVERY = 25;

export function replay(nights, { warmup = WARMUP } = {}) {
  const ordered = [...nights]
    .filter((r) => r.absmove >= FLOOR && r.ratio > 0 && Number.isFinite(r.kept))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.sym < b.sym ? -1 : 1));

  const calls = [];
  const seen = [];
  let index = null;
  let builtAt = 0;

  for (const night of ordered) {
    if (seen.length >= warmup && (!index || seen.length - builtAt >= REBUILD_EVERY)) {
      index = buildIndex(seen);
      builtAt = seen.length;
    }

    if (index) {
      const r = lookup(index, {
        symbol: night.sym,
        move: night.overnight,
        normalDay: night.normalDay,
      });
      const stated = r.stat?.n >= MIN_NIGHTS ? r.stat.undonePct : null;
      calls.push({
        date: night.date,
        sym: night.sym,
        band: r.band,
        ratio: night.ratio,
        // what it said, before the morning: the chance this gets undone
        stated,
        baseline: index.all.undonePct,
        nightsBehindIt: r.stat?.n ?? 0,
        call: r.verdict.call,
        // what happened
        undone: night.kept < STOOD,
        kept: night.kept,
      });
    }
    seen.push(night);
  }
  return calls;
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const brier = (rows, pick) => mean(rows.map((r) => (pick(r) - (r.undone ? 1 : 0)) ** 2));

export function scorecard(calls) {
  const quoted = calls.filter((c) => c.stated != null);
  const byBand = {};
  for (const b of BANDS) {
    const rows = quoted.filter((c) => c.band === b.id);
    if (!rows.length) continue;
    const said = mean(rows.map((r) => r.stated));
    const happened = mean(rows.map((r) => (r.undone ? 1 : 0)));
    byBand[b.id] = { n: rows.length, said, happened, gap: happened - said };
  }

  const mine = quoted.length ? brier(quoted, (r) => r.stated) : null;
  const base = quoted.length ? brier(quoted, (r) => r.baseline) : null;

  return {
    nights: calls.length,
    quoted: quoted.length,
    declined: calls.length - quoted.length,
    byBand,
    brier: mine,
    brierBaseline: base,
    // above zero means the bands carried information the base rate did not
    skill: mine != null && base ? 1 - mine / base : null,
    worstGap: Object.values(byBand).reduce((w, b) => Math.max(w, Math.abs(b.gap)), 0),
    from: calls[0]?.date ?? null,
    to: calls[calls.length - 1]?.date ?? null,
  };
}
