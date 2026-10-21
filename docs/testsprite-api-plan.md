# Almanac API: backend test plan for TestSprite

Almanac is also an API. AI agents call it over MCP, and the page itself is built from these endpoints. The browser suite can only check what a person sees, so this plan checks the API directly.

**Base URL:** the pull request's Vercel preview, or https://almanac-pearl.vercel.app
**Auth:** none. Every endpoint is public and read-only, except `/api/ask` (POST, no auth).
**Markets:** `market=rwa` (rTokens, the default) or `market=perp` (stock perpetuals).
**Replay:** `at=` takes an ISO time or a Unix time. It must be in the past and no more than 120 days ago.

Every endpoint answers HTTP 200 with JSON, even on bad input. Errors are reported in an `error` or `replayError` field, never as a crash, an HTML page, or a silent substitute.

---

## 1. `GET /api/board`: tonight's odds board

| # | Request | Must hold |
|---|---|---|
| B1 | `/api/board` | `market` = "rtoken"; `asked` > 0; `0 ≤ answered ≤ asked`; `rows` is an array; `replay` = false |
| B2 | same | each row has `symbol`, `display`, `move`, `normalDay`, `ratio`, `band`; `ratio` ≈ \|move\| ÷ normalDay (within 1%) |
| B3 | same | rows are sorted by `ratio`, highest first |
| B4 | same | `band` is one of the keys in `bands`, and matches the ratio's size |
| B5 | `/api/board?market=perp` | `market` = "perp"; the row symbols are perpetuals, not the rToken list |
| B6 | `/api/board?at=<3 days ago, ISO>` | `replay` = true; `at` equals the asked minute |
| B7 | `/api/board?at=2030-01-01T12:00:00Z` | `replay` = false; `replayError` says the time is in the future |
| B8 | `/api/board?at=<200 days ago>` | `replay` = false; `replayError` says more than 120 days ago |
| B9 | `/api/board?at=not-a-date` | `replay` = false; `replayError` says the time could not be read |
| B10 | If `answered` = 0 | the response is not cached (`cache-control: no-store`) |

## 2. `GET /api/reading`: one token in full

| # | Request | Must hold |
|---|---|---|
| R1 | `/api/reading?symbol=RNVDAUSDT` | `symbol` = "RNVDAUSDT"; `display` = "rNVDA"; has `night`, `reading`, `clock` |
| R2 | same | if `reading.stat.n` > 0: `stoodPct + undonePct` = 1 (within 0.001), each between 0 and 1 |
| R3 | same | `night.ratio` ≈ \|night.move\| ÷ night.normalDay |
| R4 | `/api/reading?symbol=rnvda` | lower case and no USDT are accepted: `symbol` = "RNVDAUSDT" |
| R5 | `/api/reading?symbol=ZZZZ` | **a token Almanac does not carry returns an `error`; it must not answer about a different token** |
| R6 | `/api/reading?symbol=RNVDAUSDT&at=<2 days ago>` | `replay` = true; `clock.now` equals the asked minute |
| R7 | `/api/reading?symbol=RNVDAUSDT&at=2030-01-01T12:00:00Z` | `replay` = false; `replayError` set |
| R8 | if `marketOpen` = false | `clock.bellAt` is in the future relative to `clock.now` |

## 3. `POST /api/ask`: the plain-English answer

Body: `{ "question": "...", "symbol": "...", "market": "rwa", "fast": true }`. Use `fast: true` so tests do not wait on the model.

| # | Body | Must hold |
|---|---|---|
| A1 | `{"question":"will this move hold?","symbol":"RNVDAUSDT","fast":true}` | `symbol` = "RNVDAUSDT"; `answer` is non-empty; `facts` present |
| A2 | `{"question":"what about rTSLA?","symbol":"RNVDAUSDT","fast":true}` | `symbol` = "RTSLAUSDT": a ticker named in the question wins |
| A3 | `{"question":"will it hold on the open?","symbol":"RNVDAUSDT","fast":true}` | `symbol` = "RNVDAUSDT": everyday words ("on", "open") are never read as tickers |
| A4 | A1 again | every percentage in `answer` appears in, or is computed from, `facts` |
| A5 | `{"question":"x","symbol":"RNVDAUSDT","asOf":<reading's clock.now>,"fast":true}` | `facts.move` equals that reading's `night.move` exactly |
| A6 | `{"question":"x","symbol":"RNVDAUSDT","at":"2030-01-01T12:00:00Z","fast":true}` | answers live; no crash |
| A7 | `{}` | JSON answer or `error`; never HTTP 500 or HTML |

## 4. `/api/mcp`: the tool AI agents use (JSON-RPC 2.0)

| # | Request | Must hold |
|---|---|---|
| M1 | `GET /api/mcp` | lists the tools `tonight_moves`, `move_odds`, `report_card` |
| M2 | `POST {"jsonrpc":"2.0","id":1,"method":"tools/list"}` | 3 tools, each with an `inputSchema` |
| M3 | `tools/call move_odds {"symbol":"rNVDA","move_pct":-3.4}` | `isError` = false; the text holds `undone_pct` between 0 and 100, `nights_like_it` > 0, and a `verdict` |
| M4 | `tools/call move_odds {"symbol":"ZZZZ","move_pct":2}` | `isError` = true; the message says Almanac does not carry it, and lists what it does carry |
| M5 | `tools/call tonight_moves {"limit":5}` | at most 5 moves |
| M6 | `tools/call report_card {}` | for each size band: what it said and what happened, both between 0 and 100 |
| M7 | `{"jsonrpc":"2.0","id":2,"method":"nope"}` | error code -32601, "Method not found" |
| M8 | a notification (no `id`) | HTTP 202, empty body |
| M9 | `OPTIONS /api/mcp` | HTTP 204 |

## 5. `GET /api/live`, `/api/tested`, `/api/mood`, `/api/company`

| # | Request | Must hold |
|---|---|---|
| L1 | `/api/live` | `nights` is an array; each settled night has `undone` ≤ `judged` |
| T1 | `/api/tested` | `latest` has `pr`, `state`, `result`; or `latest` = null with an `error` |
| D1 | `/api/mood` | `mood` present, or `mood` = null with an `error` |
| C1 | `/api/company?symbol=RNVDAUSDT` | `symbol` = "RNVDAUSDT"; `company` object or an `error` |

---

**Known before running:** while writing this plan we found that R5 fails today. `/api/reading?symbol=ZZZZ` quietly answers about rQQQ instead of saying the token is not carried. The MCP tool (M4) already refuses correctly. B10 passes only once PR #5 is merged; the live site still caches an empty sweep. The plan is written to the right behaviour, so the suite should catch both.
