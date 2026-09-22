/**
 * What history says about a dark-hours move.
 *
 * One night is one measurement: how far the token moved between the US close
 * and the next bell, and how much of that move was still there an hour after
 * the market reopened. Almanac fits no model. It counts nights and reports the
 * count.
 *
 * The unit is "kept": 1.0 means the move was still exactly there an hour after
 * the bell, 0 means it was entirely undone, above 1.0 means the real market
 * carried it further. A move is judged to have STOOD if half of it survived.
 *
 * The thing that predicts survival is not how big the move is. It is how big
 * the move is *for that name*: the move divided by how much that token normally
 * covers in a full session. Three percent is nothing on a token that ranges
 * eight percent a day, and it is news on one that ranges one. That ratio was
 * chosen on the first 60% of the record and then tested on the rest; the bands
 * below are the ones that survived that test.
 */

/** Below this, a move is inside the spread and not worth asking about. */
export const FLOOR = 0.005;

/** A move stands if half of it is still there an hour after the bell. */
export const STOOD = 0.5;

/**
 * Bands of move ÷ the name's normal daily range. The edges are round numbers
 * fixed on training data before the test half was looked at; they are not
 * tuned to make the result look better.
 */
export const BANDS = [
  { id: "under 0.3", lo: 0, hi: 0.3, gloss: "small, for this name" },
  { id: "0.3-0.5", lo: 0.3, hi: 0.5, gloss: "modest, for this name" },
  { id: "0.5-0.8", lo: 0.5, hi: 0.8, gloss: "ordinary, for this name" },
  { id: "0.8-1.3", lo: 0.8, hi: 1.3, gloss: "a full day's range, overnight" },
  { id: "over 1.3", lo: 1.3, hi: Infinity, gloss: "more than this name moves in a day" },
];

/** Below this many nights in a band, Almanac will not speak from it. */
export const MIN_NIGHTS = 25;

export function bandOf(ratio) {
  if (!(ratio > 0)) return null;
  return BANDS.find((b) => ratio > b.lo && ratio <= b.hi) || BANDS[BANDS.length - 1];
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const i = s.length >> 1;
  return s.length % 2 ? s[i] : (s[i - 1] + s[i]) / 2;
};

export function summarise(rows) {
  const n = rows.length;
  if (!n) return { n: 0 };
  const stood = rows.filter((r) => r.kept >= STOOD).length;
  return {
    n,
    stoodPct: stood / n,
    undonePct: 1 - stood / n,
    medianKept: median(rows.map((r) => r.kept)),
    medianMove: median(rows.map((r) => r.absmove)),
  };
}

/**
 * The reading. Almanac never claims a direction — it has no edge on direction
 * and says so. What it reports is the chance the move gets undone, against the
 * only benchmark that matters: what happens to a night picked at random.
 */
export function read(stat, marketStat) {
  if (!stat || stat.n < MIN_NIGHTS) {
    return { call: "no-record", label: "Too few nights measured here to say anything" };
  }
  const base = marketStat?.undonePct ?? null;
  const lift = base ? stat.undonePct / base : null;
  const u = stat.undonePct;

  // The wording is derived from the number rather than fixed per call, so a
  // band that undoes 35% is never described in the same breath as one at 48%.
  if (u <= 0.1) {
    return { call: "stands", label: "Moves like this have almost never been undone", lift };
  }
  if (u <= 0.2) {
    return { call: "usually-stands", label: "About one in six of these was undone", lift };
  }
  if (u <= 0.3) {
    return { call: "usually-stands", label: "About one in four of these was undone", lift };
  }
  if (u <= 0.42) {
    return { call: "shaky", label: "A third or more of these were undone by 10:30", lift };
  }
  return { call: "coin-flip", label: "Close to half of these were undone by 10:30", lift };
}

/** Index the measured nights so a live move can be looked up. */
export function buildIndex(nights) {
  const rows = nights.filter((r) => r.absmove >= FLOOR && r.ratio > 0 && Number.isFinite(r.kept));

  const index = { bands: {}, symbols: {}, cuts: {}, meta: {} };

  index.all = summarise(rows);
  for (const b of BANDS) index.bands[b.id] = summarise(rows.filter((r) => bandOf(r.ratio)?.id === b.id));

  // Kept separately because both turned out to matter, and both are surprising
  // enough that a reader will want the count rather than the claim.
  index.cuts.weekend = summarise(rows.filter((r) => r.weekend));
  index.cuts.weeknight = summarise(rows.filter((r) => !r.weekend));
  index.cuts.noHomeMarket = summarise(rows.filter((r) => r.nohome));
  index.cuts.hasHomeMarket = summarise(rows.filter((r) => !r.nohome));

  const bySym = new Map();
  for (const r of rows) {
    if (!bySym.has(r.sym)) bySym.set(r.sym, []);
    bySym.get(r.sym).push(r);
  }
  for (const [sym, rs] of bySym) {
    index.symbols[sym] = {
      all: summarise(rs),
      noHomeMarket: !!rs[0].nohome,
      normalDay: median(rs.map((r) => r.normalDay)),
    };
  }

  const dates = rows.map((r) => r.date).sort();
  index.meta = {
    nights: rows.length,
    symbols: bySym.size,
    from: dates[0],
    to: dates[dates.length - 1],
    builtAt: new Date().toISOString(),
  };
  return index;
}

/**
 * Look up a live move.
 *
 * The band is the answer; the name is context. Almanac deliberately does NOT
 * give a name-specific survival rate: it tried that first, graded it against
 * nights it had not seen, and the name-specific version scored worse than
 * saying nothing at all. That failure is in `docs/what-did-not-work.md` and it
 * is the reason this function is as plain as it is.
 */
export function lookup(index, { symbol, move, normalDay }) {
  // Every path out of here carries a `verdict`, so a caller never has to know
  // which kind of nothing it is looking at before it can print something.
  if (Math.abs(move) < FLOOR) {
    return {
      symbol,
      move,
      verdict: { call: "too-small", label: "Under half a percent — this is inside the noise" },
    };
  }
  if (!(normalDay > 0)) {
    return {
      symbol,
      move,
      verdict: { call: "no-record", label: "Not enough sessions behind this name to judge it" },
    };
  }

  const ratio = Math.abs(move) / normalDay;
  const band = bandOf(ratio);
  const stat = index.bands[band.id];
  const verdict = read(stat, index.all);

  return {
    symbol,
    move,
    normalDay,
    ratio,
    band: band.id,
    gloss: band.gloss,
    stat,
    marketBaseline: index.all,
    verdict,
    knownAbout: index.symbols[symbol]?.all?.n ?? 0,
    noHomeMarket: index.symbols[symbol]?.noHomeMarket ?? null,
  };
}
