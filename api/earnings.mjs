/**
 * Historical earnings dates for a batch of tickers.
 *
 * Built to answer one question the desk has never been able to answer: do
 * nights carrying an earnings report behave differently from ordinary nights?
 * The context strip already shows the next report; this is what it takes to
 * find out whether that fact is worth anything.
 *
 *   /api/earnings?tickers=NVDA,MU,CRM
 */

import { call } from "../src/mcp.js";

const LIMIT = 10;

export default async function handler(req, res) {
  const asked = String(req.query?.tickers || "")
    .toUpperCase()
    .split(",")
    .map((t) => t.replace(/[^A-Z0-9.]/g, ""))
    .filter(Boolean)
    .slice(0, LIMIT);

  const out = {};
  const errors = {};

  // Sequential on purpose: the data server is shared, and a burst of parallel
  // calls is a good way to be rate limited off it mid-pull.
  for (const ticker of asked) {
    try {
      const r = await call("do_query", { entry_id: "equity_calendar", params: { symbol: ticker } }, { timeout: 14_000 });
      const rows = r?.data?.data?.results || [];
      out[ticker] = rows
        .map((x) => ({
          // The actual disclosure date is what matters; the forecast date is
          // only a guess and would put a report on the wrong night.
          date: (x.perf_report_dsclsr_date || x.perf_brief_dsclsr_date || "").slice(0, 10) || null,
          forecast: (x.perf_briefing_fore_dsclsr_date || "").slice(0, 10) || null,
          period: x.report_type_name || null,
        }))
        .filter((x) => x.date || x.forecast);
    } catch (e) {
      errors[ticker] = e.message;
    }
  }

  res.status(200).json({ asked, got: Object.keys(out).length, earnings: out, errors });
}
