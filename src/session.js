/**
 * US market session arithmetic, in New York wall-clock time.
 *
 * Every number in Almanac is anchored to two moments: the close of the US
 * session (16:00 ET) and the bell that ends the dark hours (09:30 ET). Both
 * shift with daylight saving, so they are computed through the IANA zone
 * rather than a fixed offset. Getting this wrong by an hour twice a year would
 * quietly poison every base rate in the product.
 */

const NY = "America/New_York";

const parts = new Intl.DateTimeFormat("en-US", {
  timeZone: NY,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

const DAYS = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** A UTC instant, read as New York wall-clock time. */
export function inNewYork(ms) {
  const f = {};
  for (const p of parts.formatToParts(ms)) if (p.type !== "literal") f[p.type] = p.value;
  return {
    year: +f.year,
    month: +f.month,
    day: +f.day,
    hour: +f.hour,
    minute: +f.minute,
    weekday: DAYS[f.weekday],
    date: `${f.year}-${f.month}-${f.day}`,
  };
}

/** The UTC instant at which New York's clock reads this wall-clock time. */
export function atNewYork(date, hour, minute = 0) {
  const [y, m, d] = date.split("-").map(Number);
  // Start from the naive UTC reading, then correct by the offset actually in
  // force at that instant. Two passes settle the spring-forward boundary.
  let ms = Date.UTC(y, m - 1, d, hour, minute);
  for (let i = 0; i < 2; i++) {
    const seen = inNewYork(ms);
    const drift =
      Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute) -
      Date.UTC(y, m - 1, d, hour, minute);
    if (drift === 0) break;
    ms -= drift;
  }
  return ms;
}

/* The days the US market is shut. Almanac never trades, so an approximate
   holiday list only affects which nights are labelled "long weekend"; a night
   is never silently dropped because of it. Hard-coded because a calendar this
   short does not justify a dependency, and it is checked against the data:
   a listed holiday with a full session behind it shows up as a missing bell. */
const HOLIDAYS_2026 = [
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
];

export function isSessionDay(date) {
  const wd = inNewYork(atNewYork(date, 12)).weekday;
  return wd >= 1 && wd <= 5 && !HOLIDAYS_2026.includes(date);
}

function shiftDate(date, days) {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** The next day the US market opens, after `date`. */
export function nextSessionDay(date) {
  let d = shiftDate(date, 1);
  for (let i = 0; i < 10 && !isSessionDay(d); i++) d = shiftDate(d, 1);
  return d;
}

/**
 * The dark hours that follow a session: from that day's 16:00 close to the
 * next session's 09:30 bell, with the reference points Almanac measures at.
 *
 * `pre` is deliberately 09:15, not 09:29: a fifteen-minute candle closing at
 * 09:30 already contains the first trades of the real session, and using it
 * would smuggle the answer into the question.
 */
export function darkHours(date) {
  const next = nextSessionDay(date);
  const nights = Math.round((atNewYork(next, 12) - atNewYork(date, 12)) / 86400000);
  return {
    date,
    reopens: next,
    isWeekend: nights > 1,
    nights,
    close: atNewYork(date, 16, 0),
    pre: atNewYork(next, 9, 15),
    bell: atNewYork(next, 9, 30),
    plus30: atNewYork(next, 10, 0),
    plus60: atNewYork(next, 10, 30),
    nextClose: atNewYork(next, 16, 0),
  };
}

/** Is the US market open right now — i.e. is the price being set by a real venue? */
export function marketOpen(ms = Date.now()) {
  const t = inNewYork(ms);
  if (!isSessionDay(t.date)) return false;
  const mins = t.hour * 60 + t.minute;
  return mins >= 9 * 60 + 30 && mins < 16 * 60;
}

/**
 * The dark hours we are in, or the ones we most recently came out of.
 *
 * The rule is the close, not the bell: a night begins when a session ends at
 * 16:00, so until today's close has happened the night in question is still
 * the previous session's. Anchoring on the bell instead looks right at 3am and
 * silently points at a close in the future once the market opens, which yields
 * a null move and an empty chart on a page that is meant to be reading.
 */
export function currentDarkHours(ms = Date.now()) {
  const t = inNewYork(ms);
  let date = t.date;
  const closedToday = isSessionDay(date) && t.hour * 60 + t.minute >= 16 * 60;
  if (!closedToday) {
    for (let i = 1; i <= 10; i++) {
      const back = shiftDate(t.date, -i);
      if (isSessionDay(back)) { date = back; break; }
    }
  }
  const w = darkHours(date);
  return {
    ...w,
    elapsedHours: (ms - w.close) / 3600000,
    sinceBell: ms >= w.bell,
    // True once the bell has rung on this night: the reading is now a record
    // of how it resolved, not a live question.
    settled: ms >= w.plus60,
  };
}
