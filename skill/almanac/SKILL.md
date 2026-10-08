---
name: almanac
description: >
  Odds that an overnight or weekend move on a Bitget stock token (rNVDA, rTSLA, rSPY…) or stock
  perpetual is still there an hour after the US market opens, counted from measured Bitget nights.
  Use when the user asks whether a move made while the US market is shut is real, will hold, will
  be undone, is a fake-out, or what tonight's biggest stock-token moves are. Triggers: overnight
  move, weekend move, rToken, stock token, tokenized stock, will it hold, is this move real,
  fake-out, gap at the open, before the bell, after hours.
---

# Almanac skill

Almanac answers one question: **a Bitget stock token moved while New York was shut. How often
were moves like that undone by 10:30 New York time?** It counts measured nights. It never
predicts direction and never gives advice.

## Connect

Almanac is a public MCP server. No account, no key, read-only.

```bash
claude mcp add --transport http almanac https://almanac-pearl.vercel.app/api/mcp
```

Pairs with Bitget Agent Hub: use `bitget-signal` for the crypto market's mood and news, and
`bgc` (read-only or paper-trading) for prices and positions. Almanac adds the measured odds.

## Tools

| Tool | Use it for |
|---|---|
| `tonight_moves` | "What's moving tonight?" Every token ranked by how unusual its move is for that stock, each with its odds |
| `move_odds` | "Is rNVDA's −3% real?" Give `symbol`; add `move_pct` to ask about a move that is not tonight's |
| `report_card` | "Can I trust these odds?" What Almanac said before each bell against what happened |

## How to answer

1. Call `move_odds` (or `tonight_moves` for a list).
2. Lead with the plain answer: *"Moves this size for rNVDA were undone 7 times in 94."*
3. Compare with `undone_at_random_pct` so the number means something.
4. Say the size of the move against that stock's normal day (`times_normal_day`). That ratio is
   what predicts survival, not the raw percent.
5. Never say which way the price goes next, never say buy or sell, and never invent a number the
   tool did not return.

## Example

> **User:** rNVDA is down 3.4% overnight, will it hold?
>
> **Agent:** That's 1.9× what Nvidia's token moves on a normal day. Moves that big were undone by
> 10:30 in 7 of 94 measured nights (7%), against 34% for a night picked at random. So history
> says it very likely still stands at the open. That's a count, not a forecast of direction.
