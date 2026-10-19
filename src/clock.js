/**
 * Replay: read the desk as it stood at a past moment.
 *
 * `?at=` takes an ISO time or epoch milliseconds. Bitget's candle history is
 * real, so a replay shows what the page would have said then, built from the
 * prices that existed then. It only reaches backwards: a time in the future is
 * refused, because a page that let you set tomorrow's clock could be made to
 * show a move that has not happened. It never touches the live record — the
 * calls locked before each bell stay exactly as committed.
 */

/**
 * How far back a replay may reach. Bitget's 15-minute history goes back further,
 * but the stored record starts in July; 120 days covers every night it was
 * built from, including the July 3 and Labor Day holidays.
 */
export const REPLAY_DAYS = 120;

export function replayAt(query, now = Date.now()) {
  const raw = query?.at ?? query?.replay;
  if (raw == null || raw === "") return { at: null };
  const s = String(raw).trim();
  const ms = /^\d{10,13}$/.test(s) ? Number(s.length === 10 ? s + "000" : s) : Date.parse(s);
  if (!Number.isFinite(ms)) return { at: null, error: `Could not read the replay time "${s.slice(0, 40)}".` };
  if (ms > now) return { at: null, error: "That time is in the future. A replay can only look back, not forward." };
  if (now - ms > REPLAY_DAYS * 86400000) return { at: null, error: `That time is more than ${REPLAY_DAYS} days ago. A replay can reach back ${REPLAY_DAYS} days at most.` };
  // Round to the minute so near-identical requests share a cache entry.
  return { at: Math.floor(ms / 60000) * 60000 };
}
