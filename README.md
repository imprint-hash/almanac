# Almanac

**You woke up, it moved, and the market is shut. Almanac tells you how often moves like that turned out to be real.**

Built for the [Bitget AI Base Camp Hackathon S2](https://bitget-ai.gitbook.io/bitgetai_hackathons2) ·
Track 3, **AI Trading Desk** · sub-theme **Review & Self-Evolution**.

---

## What it does

You open it at 3am. It has already checked about forty tokenised stocks on Bitget — where each one is
trading now against where its real market closed last night — and ranked them by the only thing that
turned out to matter: **is this a big move for this particular name?**

Click one, or just ask it:

> **rSOXL is down 2.32%.** That is 0.42× a normal day for it.
> Moves that size, on names like this, were **undone by 10:30 in 40.1% of 337 nights** measured.
> A night picked at random is undone 33.9% of the time.
> So: slightly worse than ordinary, and no, I cannot tell you which way it goes next.

That is the whole product. One question — *will this move still be there when the market opens?* —
answered with a count of what actually happened, never with an opinion.

**And it shows its own report card.** Every night for three months it made that same call before
knowing the answer, then checked itself at the bell. When it says one in five, it has been one in
five, within two points on most bands. The chart is on the front page, not buried.

## What it refuses to do

- **It does not predict direction.** It has no edge there and says so, every time.
- **It does not trade.** No account, no keys, no orders. It cannot touch anyone's money.
- **It does not advise.** Never buy, never sell, never hold.
- **It goes quiet when it knows nothing.** Under half a percent: *"inside the noise, not worth a reading."*

---

## The problem

Bitget lists thousands of tokenised shares. Their home markets are open **32.5 hours of every 168**,
so for about four fifths of the week these things trade with nothing real setting the price.

You wake at 3am and your position is down 4%. There is no news you can find, and the market is shut.
Sell and half the time it bounces back by morning; sit still and half the time it was real. Nothing
on your screen can tell you which.

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

Every night is replayed in order. At each one the desk sees only the nights that had already
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

Two findings that survived and surprised us: **weekend gaps are calmer, not wilder**, on both
instruments; and names with **no home market at all** — OPENAI, ANTHROPIC, SHEIN — are undone just
11.6% of the time, because no bell ever arrives to settle them.

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
| `api/` | `board`, `reading`, `ask` |
| `data/nights-*.json` | Every measured night, both instruments |

## Limits

About ninety days, the busiest names only, one hour after the bell as the test of survival, and the
top rToken bands are thin. The full list is on [the method page](public/method.html#limits).

No account, no orders, no advice. Nothing here is a recommendation to buy or sell anything.

## Licence

[MIT](LICENSE)
