# Almanac

**A stock token moved while New York was shut. Will the move still be there at 10:30? Almanac counts
how often moves like it were undone, on Bitget's own data.**

- **Live:** https://almanac-pearl.vercel.app
- **For agents:** `claude mcp add --transport http almanac https://almanac-pearl.vercel.app/api/mcp`
- Built for the [Bitget AI Base Camp Hackathon S2](https://bitget-ai.gitbook.io/bitgetai_hackathons2) ·
  Track 3, **AI Trading Desk** · sub-themes **Review & Self-Evolution** and **Personalized Research Workbench**

---

## The problem

Bitget lists thousands of tokenised US shares that trade around the clock. Their home markets are
open **32.5 hours of every 168**, so for about four fifths of the week these tokens move with nothing
real setting the price.

You wake at 3 a.m. and a token you hold is down 4%. The market is shut and there is no news you can
find. Sell, and half the time it bounces back by the open. Sit still, and half the time it was real.
Nothing on a normal trading screen tells you which, and an AI chatbot will happily guess.

## The solution

Almanac reads every Bitget stock token while New York is shut and answers one question for each,
like an odds board: **Stands 93% · Undone 7%**. Every number is a count of measured nights, never
an opinion.

> **rLLY −5.04%.** That is 2.04× what rLLY covers on a normal day.
> Moves like this were **undone by 10:30 in 7 of 94 nights** measured.
> A night picked at random is undone 34% of the time.
> Almanac never says which way it goes next.

**What 926 calls made before the bell taught us:**

| | |
|---|---|
| **Big moves almost always stand** | Of moves over 1.3× a stock's normal day, **2 of 68** were undone by the bell |
| **Small moves are a coin flip** | Of moves under 0.3× a normal day, **54%** were undone |
| **A simple rule beat the AI** | On 120 past nights, half real and half fake-outs, the size rule called **69%** right. Qwen, given the same facts, called **53%**. A coin gets 50% |

That last row is why, on this site, **code sets every number and the model only explains it.**

### What you see

1. **Tonight's odds board.** Every stock token moving while New York is shut, ranked by how unusual
   the move is *for that stock*, each with its odds and a plain label: *usually stands*, *shaky*,
   *coin flip*.
2. **One token in full.** The odds, the price path since the close, the company's calendar from
   Bitget's market data (earnings, dividends, splits), and the crypto market's mood from
   **bitget-signal**.
3. **Ask in plain words.** "Is rNVDA's move real?" Almanac answers in a second; Qwen on Bitget's
   endpoint then rewrites it, and every number it uses is checked against the desk's.
4. **The report card.** What Almanac said before each bell against what happened, on the front page.
5. **Light and dark**, and it works on a phone.

## Built on Bitget Agent Hub

| Piece | What Almanac uses it for |
|---|---|
| **Bitget public market API** | Every price, candle and night measured: 1,237 rToken nights and 1,659 perpetual nights |
| **Bitget MCP server** (`agent.bitget.com/mcp`) | The real US share behind a token, its earnings calendar, dividends and splits |
| **bitget-signal** (Agent Hub's keyless signal server) | Bitcoin's 4-hour read (trend, RSI) as the crypto mood tokens trade beside overnight. Called over MCP, the same way an agent calls it |
| **Qwen on Bitget's hackathon endpoint** | Turns the desk's figures into a sentence. Never sets a number |
| **Almanac's own MCP server** (`/api/mcp`) | Gives any agent the measured odds: `tonight_moves`, `move_odds`, `report_card` |
| **Almanac skill** ([`skill/almanac/SKILL.md`](skill/almanac/SKILL.md)) | Teaches Claude Code or OpenClaw when to call Almanac next to Bitget's own Agent Hub skills |

Agent Hub gives an agent Bitget's prices and trading tools. What it could not give is a measured
answer to *"will this night move hold?"* Almanac adds that answer as one more tool.

```bash
claude mcp add --transport http almanac https://almanac-pearl.vercel.app/api/mcp
# then ask your agent: "rNVDA is down 3.4% overnight, will it hold?"
```

## What it refuses to do

- **It does not predict direction.** It has no edge there and says so, every time.
- **It does not trade.** No account, no keys, no orders. It cannot touch anyone's money.
- **It does not advise.** Never buy, never sell, never hold.
- **It goes quiet when it knows nothing.** Under half a percent: *"inside the noise."*

---

## The finding

It is not the size of the move that decides. It is **the size of the move for that name** — the move
divided by what the token covers in an ordinary session.

Three percent is nothing on a token that ranges eight percent a day. On one that ranges one percent,
three percent is news.

| Move ÷ that name's normal day | rTokens — undone by 10:30 | Perpetuals — undone by 10:30 |
|---|---|---|
| under 0.3 | **50.7%** | 48.3% |
| 0.3 – 0.5 | 40.1% | 35.0% |
| 0.5 – 0.8 | 27.7% | 23.7% |
| 0.8 – 1.3 | 21.3% | 10.9% |
| over 1.3 | **7.4%** | 1.8% |
| *any night at random* | *33.9%* | *24.9%* |

The ratio was chosen on the first 60% of the record and the band edges fixed there before the rest
was looked at.

## Measured twice, on two different instruments

An **rToken** is the tokenised share itself, spot. A **perpetual** is a contract written against the
stock's price. Different venue, different books, different participants, different base rate.

The same measurement runs on both, from the same code, and the ladder runs the same way down both.
The desk has a switch for it — a reader who wants to check the rule holds on the other instrument is
one click away, not asked to take our word.

## It grades its own odds

**Two records, and they are not the same thing.** The big one is a *replay*: ninety days of real
nights re-run in order, the desk seeing only what had already happened at each step. It tests whether
the odds are true, but every call in it was made after the fact. The second is *live*: each weekday
before the bell a GitHub Action refreshes each name's normal day, locks tonight's calls into
`data/live/`, and settles them after the open. Those files carry a git timestamp, so nothing can be written in afterwards. It is a small
record and it will stay small — four nights is four nights — but it is the honest kind.

Every night in the replay is taken in order. At each one the desk sees only the nights that had already
happened, states the chance the move gets undone, and the morning settles it. It is graded on
whether its **odds are true**, not on how often it was "right".

|  | rTokens | Perpetuals |
|---|---|---|
| Graded nights | 926 | 1,359 |
| Brier score | 0.2101 | 0.1647 |
| Same, knowing nothing | 0.2289 | 0.1926 |
| **Skill over baseline** | **+8.2%** | **+14.5%** |

Skill above zero means the bands carry information the base rate does not. **Had it come out at or
below zero, the site would say so and the bands would be gone.**

Where it is worst, stated on the site rather than buried: on rTokens the top two bands are
**conservative by about 8.5 points** — it said 27.0% and 11.5% where 18.2% and 2.9% happened. Those
are the thinnest samples in the record (148 and 68 graded nights); the same bands on the perpetual
side, with 245 and 242, land within 3.1 points.

## What did not work

Both failures are on [`/method.html`](public/method.html), because a method is only worth reading
next to the things it beat.

1. **Per-name history lost to doing nothing.** Quoting each name's own survival rate looked excellent
   measured backwards. Graded walk-forward it scored **74.0% where always saying "it stands" scored
   81.5%** — 7.6 points worse than knowing nothing. Its "unwinds" call was right 31% of the time.
2. **Five other predictors, four were noise.** Overnight volume, realised volatility, how early the
   move arrived, dead candles, turnover. None beat the benchmark out of sample.
3. **Earnings nights — tested, and we cannot tell.** Every night was tagged with whether a real
   dated earnings disclosure landed in it. Raw it looks like a finding (8.7% undone against 27.1%
   on perpetuals) but earnings nights carry bigger moves, and compared *within* each band it
   collapses: **p = 0.59 on rTokens**, 0.056 on perpetuals with 23 nights and two undone. The two
   instruments disagree, so it stays out of the odds and on the page as context only.

Two findings that survived and surprised us: **weekend gaps are calmer, not wilder**, on both
instruments; and names with **no home market at all** — OPENAI, ANTHROPIC, SHEIN — are undone just
11.6% of the time, because no bell ever arrives to settle them.

## The company behind the token, and the crypto mood beside it

Almanac measures the token. That leaves an obvious hole: it can say a move was
unusual for that name, but never why. **Bitget's `bitget-mcp-server`** — free,
no key, read-only — closes it:

- the **real US share**, quoted from its own session
- the **earnings calendar**, so a reading can say a report lands in six days, or
  landed during those dark hours
- **dividends and splits**, the corporate actions that explain gaps a
  price-only view would call noise

It is shown as a strip beside the reading and labelled
**"context only — not part of the measurement."** None of it feeds the bands or
the odds. An earnings date is an explanation a reader can weigh; it is not a
number this desk has tested, and folding it quietly into the odds would undo
the point of the method page. It runs as its own request, so a slow data server
delays nothing and a dead one simply means no strip.

## What Qwen does, and does not do

`qwen3.8-max` writes the answer in the question box. That is all it does.

It is handed a block of figures the desk computed, **already formatted**, so there is nothing to
round or convert. It is told it may not do arithmetic, may not predict direction, and may not advise.
Then **every number it returns is checked against the ones it was given**. If a figure appears that
nobody handed it, the answer is discarded, the desk's own wording is served instead, and the page
says so. The same happens when the model times out.

The model writes. It does not decide.

## Run it

```bash
cp .env.example .env     # add your Qwen key; Bitget needs none
npm run dev              # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | The desk, locally |
| `npm run normal -- rtoken` | Recompute each name's ordinary session range (run daily) |
| `npm run index` | Rebuild both tables and re-grade them walk-forward |

Node 20+. **No dependencies.**

| Path | What it is |
|---|---|
| `src/bitget.js` | The only thing that talks to Bitget. Public market endpoints; no key, no account, no orders |
| `src/session.js` | The US session in New York time, daylight saving included |
| `src/night.js` | Candles → the move since the close, and what a normal day is for this name |
| `src/measure.js` | The bands, and the reading |
| `src/grade.js` | The walk-forward replay and the calibration scorecard |
| `src/answer.js` | The facts the model may use, and the check on what it returns |
| `src/mcp.js` | A small MCP client, used for Bitget's data server and bitget-signal |
| `src/underlying.js` | The real share, its earnings calendar, its corporate actions |
| `api/` | `board`, `reading`, `ask`, `company`, `mood`, `live`, and `mcp` (Almanac's own MCP server) |
| `skill/almanac/SKILL.md` | The agent skill |
| `data/nights-*.json` | Every measured night, both instruments |

## Limits

About ninety days, the busiest names only, one hour after the bell as the test of survival, and the
top rToken bands are thin. The full list is on [the method page](public/method.html#limits).

No account, no orders, no advice. Nothing here is a recommendation to buy or sell anything.

## Licence

[MIT](LICENSE)
