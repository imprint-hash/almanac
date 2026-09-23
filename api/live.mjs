/**
 * The live record: calls locked before a bell, and how they settled.
 *
 * Separate from the replayed record on purpose. The replay is how the odds were
 * tested; this is the desk saying them out loud in advance, with a git
 * timestamp on each file. It is a much smaller sample and the response says so,
 * because four nights is four nights however good they look.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { pick } from "./_data.mjs";

const dir = new URL("../data/live/", import.meta.url);

export default function handler(req, res) {
  const m = pick(req.query);

  if (!existsSync(dir)) {
    return res.status(200).json({ market: m.id, nights: [], note: "No live nights recorded yet." });
  }

  const nights = readdirSync(dir)
    .filter((f) => f.startsWith(`${m.id}-`) && f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")))
    .sort((a, b) => (a.reopens < b.reopens ? 1 : -1));

  const settled = nights.filter((n) => n.settled?.judged);
  const judged = settled.reduce((a, n) => a + n.settled.judged, 0);
  const undone = settled.reduce((a, n) => a + n.settled.undone, 0);
  const said = settled.reduce((a, n) => a + n.settled.itSaid * n.settled.judged, 0);

  res.setHeader("cache-control", "public, max-age=120, stale-while-revalidate=600");
  res.status(200).json({
    market: m.id,
    label: m.label,
    nights: nights.map((n) => ({
      session: n.session,
      reopens: n.reopens,
      lockedAt: n.lockedAt,
      lockedAtNewYork: n.lockedAtNewYork,
      minutesBeforeBell: n.minutesBeforeBell,
      calls: n.calls.length,
      settled: n.settled,
    })),
    totals: settled.length
      ? {
          nights: settled.length,
          calls: judged,
          itSaid: said / judged,
          itHappened: undone / judged,
        }
      : null,
    // Said plainly rather than left for a reader to work out.
    note:
      "Calls locked before the bell and settled after it. This is a live record, not the " +
      "replayed one — it is small, and it will stay small. The replayed record is on /method.html.",
  });
}
