/**
 * Turning candles into the two numbers a reading needs: how far the token has
 * moved since the US close, and how much it normally covers in a full session.
 *
 * This is deliberately the same arithmetic that produced `data/nights.json`.
 * If the live path measured a move differently from the way the record was
 * measured, every probability Almanac quotes would be answering a question
 * nobody asked. Any change here belongs in the backfill too.
 */

import { inNewYork, atNewYork, isSessionDay, currentDarkHours, marketOpen } from "./session.js";

/** Sessions used to decide what a normal day looks like for a name. */
export const NORMAL_DAY_SESSIONS = 10;

/** A session needs this many 15m candles before its range is trusted. */
const MIN_CANDLES = 10;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

function slice(candles, from, to) {
  return candles.filter((c) => c.t >= from && c.t <= to);
}

/** The last close at or before a moment, if it is not stale. */
export function priceAt(candles, ms, staleMinutes = 45) {
  let best = null;
  for (const c of candles) {
    if (c.t <= ms) best = c;
    else break;
  }
  if (!best || ms - best.t > staleMinutes * 60_000) return null;
  return best.close;
}

/** The high-low range of each completed day session, as a fraction of its close. */
export function sessionRanges(candles) {
  const out = new Map();
  const days = [...new Set(candles.map((c) => inNewYork(c.t).date))].sort();
  for (const date of days) {
    if (!isSessionDay(date)) continue;
    const open = atNewYork(date, 9, 30);
    const close = atNewYork(date, 16, 0);
    const rows = slice(candles, open, close);
    const last = priceAt(candles, close);
    if (rows.length < MIN_CANDLES || !last) continue;
    const hi = Math.max(...rows.map((r) => r.high));
    const lo = Math.min(...rows.map((r) => r.low));
    out.set(date, (hi - lo) / last);
  }
  return out;
}

/**
 * How much this name normally covers in a day, from the sessions that had
 * already finished before `date`. Strictly before: a session cannot be used to
 * judge the night that runs out of it.
 */
export function normalDay(candles, date, ranges = sessionRanges(candles)) {
  const earlier = [...ranges.entries()].filter(([d]) => d < date).sort(([a], [b]) => (a < b ? -1 : 1));
  if (earlier.length < NORMAL_DAY_SESSIONS) return null;
  return median(earlier.slice(-NORMAL_DAY_SESSIONS).map(([, v]) => v));
}

/**
 * Where a night stands right now: the move since the close, and what it is
 * worth relative to a normal day for this name.
 *
 * Returns `null` for `move` when the reference close cannot be read rather
 * than guessing one — a missing close is a reason to say nothing, not a reason
 * to substitute the nearest price and quote a number built on it.
 */
export function nightSoFar(candles, at = Date.now()) {
  const w = currentDarkHours(at);
  const ranges = sessionRanges(candles);
  const closePrice = priceAt(candles, w.close, 90);
  const nowPrice = priceAt(candles, at, 60) ?? candles[candles.length - 1]?.close ?? null;
  const normal = normalDay(candles, w.reopens, ranges);

  const move = closePrice && nowPrice ? (nowPrice - closePrice) / closePrice : null;

  return {
    session: w.date,
    reopens: w.reopens,
    isWeekend: w.isWeekend,
    marketOpen: marketOpen(at),
    hoursSinceClose: Math.max(0, (at - w.close) / 3600000),
    hoursToBell: Math.max(0, (w.bell - at) / 3600000),
    closePrice,
    nowPrice,
    move,
    normalDay: normal,
    ratio: move != null && normal ? Math.abs(move) / normal : null,
    sessionsBehindIt: ranges.size,
  };
}
