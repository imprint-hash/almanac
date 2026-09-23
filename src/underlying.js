/**
 * The company behind the token.
 *
 * Almanac measures the token and nothing else, which leaves an obvious hole: it
 * can tell you a move was unusual for that name, but never why. Bitget's
 * `bitget-mcp-server` carries the real US share — its quote, its earnings
 * calendar, its dividends and splits — so a reading can at least say whether
 * something was happening to the company while the token drifted.
 *
 * This is context, not part of the measured rule. Nothing here feeds the bands
 * or the odds, and the page says so; an earnings date is an explanation a
 * reader can weigh, not a number the desk has tested.
 */

import { call } from "./mcp.js";

/** rNVDA → NVDA, NVDAUSDT → NVDA. */
export function tickerOf(symbol, display) {
  const name = display && display !== symbol ? display : symbol.replace(/USDT$/, "");
  return name.replace(/^r/, "").toUpperCase();
}

const day = (d) => (d ? String(d).slice(0, 10) : null);

/** Days from `from` to a dated event; negative means it has already happened. */
function daysUntil(date, from) {
  if (!date) return null;
  const a = Date.parse(`${day(date)}T00:00:00Z`);
  const b = Date.parse(`${day(from)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((a - b) / 86400000);
}

async function entry(id, params, timeout = 12_000) {
  const r = await call("do_query", { entry_id: id, params }, { timeout });
  const rows = r?.data?.data?.results;
  return Array.isArray(rows) ? rows : [];
}

/** The real share's last session, straight from the US market. */
export async function quote(ticker) {
  const [row] = await entry("equity_price_quote", { symbol: ticker });
  if (!row) return null;
  return {
    ticker,
    last: row.last_price ?? null,
    prevClose: row.prev_close ?? null,
    changePct: row.change_percent ?? null,
    volume: row.volume ?? null,
  };
}

/**
 * Anything dated on or near this night: an earnings disclosure, an ex-dividend
 * date, a split. Only events within a few days either side are worth showing —
 * the calendars run for years and almost all of it is irrelevant tonight.
 */
export async function events(ticker, around, { window = 3 } = {}) {
  const out = { earnings: null, exDividend: null, split: null };

  const [cal, div] = await Promise.allSettled([
    entry("equity_calendar", { symbol: ticker }),
    entry("equity_fundamental_dividends", { symbol: ticker }),
  ]);

  if (cal.status === "fulfilled") {
    let best = null;
    for (const r of cal.value) {
      const when = r.perf_report_dsclsr_date || r.perf_brief_dsclsr_date || r.perf_briefing_fore_dsclsr_date;
      const d = daysUntil(when, around);
      if (d == null || Math.abs(d) > window) continue;
      if (!best || Math.abs(d) < Math.abs(best.days)) {
        best = { date: day(when), days: d, period: r.report_type_name || null, expected: !r.perf_report_dsclsr_date };
      }
    }
    out.earnings = best;
  }

  if (div.status === "fulfilled") {
    for (const r of div.value) {
      const d = daysUntil(r.ex_dividend_date, around);
      if (d != null && Math.abs(d) <= window && !out.exDividend) {
        out.exDividend = { date: day(r.ex_dividend_date), days: d, amount: r.amount ?? null, special: r.is_special_dividend === "1" };
      }
      const s = daysUntil(r.split_valid_date, around);
      if (s != null && Math.abs(s) <= window && !out.split) {
        out.split = { date: day(r.split_valid_date), days: s, ratio: r.split_numerator && r.split_denominator ? `${r.split_numerator}:${r.split_denominator}` : null };
      }
    }
  }

  return out;
}

/**
 * Everything the company side can say about one night, or null where the
 * server had nothing. A failure here never breaks a reading: the desk's own
 * measurement stands on its own, and the page simply shows no context strip.
 */
export async function context(symbol, display, around) {
  const ticker = tickerOf(symbol, display);
  const [q, e] = await Promise.allSettled([quote(ticker), events(ticker, around)]);

  const quoteOk = q.status === "fulfilled" && q.value;
  const eventsOk = e.status === "fulfilled";

  if (!quoteOk && !eventsOk) return null;

  return {
    ticker,
    quote: quoteOk ? q.value : null,
    events: eventsOk ? e.value : null,
    // Said plainly so nobody mistakes this for part of the measurement.
    note: "From Bitget's MCP data server. Context only — none of this feeds the bands or the odds.",
  };
}
