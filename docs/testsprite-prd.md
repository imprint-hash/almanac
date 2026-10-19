# Almanac — product description (for TestSprite)

Live app: https://almanac-pearl.vercel.app
Repo: https://github.com/imprint-hash/almanac

## What it is
Almanac is a research tool for Bitget's tokenised US stocks (rTokens such as rNVDA, rTSLA).
When a stock token moves overnight while the New York market is shut, Almanac shows how often a move of that
size, for that particular stock, was still there at 10:30 New York time the next morning ("stood") or
was undone ("undone"). It never predicts a direction and never gives trading advice.

## Who uses it
Traders and researchers who see a token move at night and want to know if the move is worth taking seriously.

## Main features and what must be true

1. **Odds board (home page, "Tonight" tab)**
   - Shows tonight's moves for every stock token, ordered by how unusual the move is for that stock.
   - Every percentage shown must be between 0% and 100%. "Stands" + "Undone" for a token must add up to 100%.
   - The counts next to the odds (e.g. "163 of 207 stood") must match the percentage (163/207 = 79%).
   - If Bitget does not answer for some names, the page says how many answered instead of pretending the board is complete.

2. **Token reading (click any token on the board, or search "rNVDA")**
   - Shows the move since the last New York close, how big it is compared with a normal day for that stock,
     the odds it stands, a price chart since the close, and the company's calendar.
   - Moves under half a percent must be described as noise ("inside the spread"), not as a signal.

3. **Ask box ("Ask Almanac")**
   - The user types a question like "is rNVDA's move real?".
   - Almanac answers in plain English. If the AI (Qwen) is used, every number in its answer must match the desk's
     own numbers; if the AI invents a number, the AI answer is thrown away and Almanac's own wording is shown
     with a note saying so. The answer label says which one wrote it.

4. **Market switch (rTokens / Perps buttons in the header)**
   - Switches between tokenised shares and perpetual futures. The board, readings and odds must change to that market.

5. **New York clock (header)**
   - Shows whether New York is open or shut and how long until it opens or closes.

6. **Report card tab**
   - Shows how Almanac's past calls did, by size of move. Huge moves (over 1.3x a normal day) were undone 2 of 68 times;
     tiny moves (under 0.3x) were undone 54% of the time.

7. **Live record**
   - Every weekday before the New York bell, Almanac locks its odds for that night in a committed file, and settles them
     after the open. A locked call must never change after the bell.

8. **Replay (time travel)**
   - Adding `?at=<time>` (or using "Replay a moment" in the tab bar) shows Almanac exactly as it stood at that past moment, using real prices from then.
     Example: https://almanac-pearl.vercel.app/?at=2026-10-14T07:00:00Z (3:00 AM New York, Wed 14 Oct).
   - A yellow banner must say it is a replay and offer "Back to live". The clock must be frozen at that time.
   - A future time must be refused with a red message ("A replay can only look back, not forward.") and the page
     must show tonight instead.
   - Times older than 120 days must be refused the same way.
   - Company news is left out of a replay (with a note), because today's headlines were not known then.
   - Useful moments to test: 3:00 AM New York on a weekday (market shut, moves happening), 9:45 AM (just after
     the bell), a Saturday, and a US market holiday.

9. **For agents (MCP server)**
   - https://almanac-pearl.vercel.app/api/mcp offers tools tonight_moves, move_odds and report_card to AI agents.

10. **Light and dark mode** (moon/sun button) must keep every number readable.

## What must never happen
- A percentage below 0% or above 100%.
- An AI answer containing a number the desk did not give it.
- A replay showing a future time.
- A locked live call changing after the bell.
- The page crashing when Bitget is slow or a token is unknown — it must explain itself instead.
