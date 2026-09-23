/**
 * The reading, assembled.
 *
 * A page load must not depend on twelve requests per name, so the two halves
 * are split by how often they change. How much a name covers in an ordinary
 * session moves once a day, and is refreshed on a schedule into
 * `data/normal-<market>.json`. Where tonight stands changes by the minute, and
 * is read live. If the stored half is missing or stale, the reading says so
 * rather than quietly computing a ratio against a number from last week.
 *
 * Everything here takes a market — rtoken or perp — and never assumes one.
 */

import { candles, DEFAULT_MARKET } from "./bitget.js";
import { nightSoFar, normalDay } from "./night.js";
import { currentDarkHours, marketOpen } from "./session.js";
import { lookup, bandOf } from "./measure.js";

/** A stored normal day older than this is not trusted. */
export const STALE_DAYS = 5;

/**
 * Two pages of 15m candles reach back 100 hours, which covers the longest dark
 * stretch — a Friday close to a Tuesday bell over a holiday weekend.
 */
const NIGHT_PAGES = 2;

/**
 * The full reading for one name. `normals` is the stored map; without an entry
 * the normal day is computed from candles fetched here, which costs more
 * requests but keeps a one-off lookup honest.
 */
export async function reading(symbol, normals, index, { marketId = DEFAULT_MARKET } = {}) {
  const w = currentDarkHours();
  const stored = normals?.[symbol];
  const rows = await candles(symbol, { pages: stored ? NIGHT_PAGES : 12, marketId });

  let normal = stored?.normalDay ?? null;
  let source = "stored";
  if (stored) {
    const ageDays = (Date.now() - new Date(stored.asOf).getTime()) / 86400000;
    if (ageDays > STALE_DAYS) {
      normal = null;
      source = "stale";
    }
  } else {
    normal = normalDay(rows, w.reopens);
    source = "computed";
  }

  const night = nightSoFar(rows);
  const ratio = night.move != null && normal ? Math.abs(night.move) / normal : null;
  const read = lookup(index, { symbol, move: night.move, normalDay: normal });

  return {
    symbol,
    display: stored?.display ?? symbol,
    market: marketId,
    at: Date.now(),
    marketOpen: marketOpen(),
    night: { ...night, normalDay: normal, ratio },
    // The exact moments, so the page can count down without re-deriving the
    // New York calendar in the browser.
    clock: { closeAt: w.close, bellAt: w.bell, nextCloseAt: w.nextClose, now: Date.now() },
    normalDaySource: source,
    sessionsBehindNormalDay: stored?.sessions ?? null,
    reading: read,
    path: rows.filter((c) => c.t >= w.close - 30 * 60_000).map((c) => [c.t, c.close]),
  };
}

/**
 * The rail: where every name stands tonight, ordered by ratio rather than by
 * how far the price moved. That ordering is the whole argument, so it belongs
 * in the data and not in the page.
 */
export async function board(symbols, normals, index, { concurrency = 6, marketId = DEFAULT_MARKET } = {}) {
  const out = [];
  const queue = [...symbols];

  const worker = async () => {
    while (queue.length) {
      const symbol = queue.shift();
      const stored = normals?.[symbol];
      if (!stored) continue; // never guess a normal day on the rail
      try {
        const rows = await candles(symbol, { pages: NIGHT_PAGES, marketId });
        const night = nightSoFar(rows);
        if (night.move == null) continue;
        const ratio = Math.abs(night.move) / stored.normalDay;
        out.push({
          symbol,
          display: stored.display ?? symbol,
          move: night.move,
          normalDay: stored.normalDay,
          ratio,
          band: bandOf(ratio)?.id ?? null,
        });
      } catch {
        // One dead name must not empty the rail: it is left out, and the
        // response says how many of the names asked actually answered.
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, worker));
  out.sort((a, b) => b.ratio - a.ratio);
  return { asked: symbols.length, answered: out.length, rows: out };
}
