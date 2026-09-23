/**
 * The question box.
 *
 * The desk works out the figures; Qwen only puts them into a sentence. If the
 * model is unreachable, slow, or comes back with a number nobody gave it, the
 * desk's own wording is served instead and the response says which one you got.
 * A research tool that quietly invents a percentage is worse than one that
 * sounds wooden.
 */

import { reading } from "../src/desk.js";
import { facts, compose, prompt, symbolIn, numbersAreOurs } from "../src/answer.js";
import { pick } from "./_data.mjs";

const KEY = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "";
const MODEL = process.env.QWEN_MODEL || "qwen3.8-max";
const ENDPOINT =
  process.env.QWEN_ENDPOINT ||
  "https://hackathon.bitgetops.com/v1/chat/completions";

/**
 * The whole request must finish inside the platform's limit, or the caller gets
 * a killed function and an HTML error page where JSON should be — which is
 * exactly the kind of failure this desk is supposed to be honest about, not
 * produce. So the budget is spent deliberately: whatever is left after reading
 * the market goes to the model, and when it runs out the desk answers.
 *
 * qwen3.8-max reasons before replying, which costs about thirteen seconds and
 * often more. One retry only if there is real time for it.
 */
const BUDGET_MS = 20_000;

async function viaQwen(messages, deadline) {
  let last;
  while (true) {
    const left = deadline - Date.now();
    if (left < 5_000) throw last || new Error("no time left in the budget");
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: 260 }),
        signal: AbortSignal.timeout(Math.min(left, 16_000)),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
      const body = await res.json();
      const text = body.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error("empty reply");
      return text;
    } catch (err) {
      last = err;
    }
  }
}

export default async function handler(req, res) {
  const deadline = Date.now() + BUDGET_MS;
  const question = String(req.body?.question || "").slice(0, 300).trim();
  const m = pick({ market: req.body?.market });
  const known = Object.keys(m.normals);
  const asked = symbolIn(question, known, m.normals);
  const fallback = String(req.body?.symbol || "").toUpperCase();
  const symbol = asked || (known.includes(fallback) ? fallback : known[0]);

  try {
    const r = await reading(symbol, m.normals, m.index, { marketId: m.id });
    const f = facts({ ...r, baseline: m.index.all.undonePct, record: m.index.record });
    const ours = compose(f);

    let answer = ours;
    let wrote = "the desk";
    let note = KEY ? null : "No model key configured, so this is the desk's own wording.";

    if (KEY) {
      try {
        const text = await viaQwen(prompt(question, f), deadline);
        if (numbersAreOurs(text, f)) {
          answer = text;
          wrote = MODEL;
        } else {
          note = "The model returned a figure the desk did not give it, so its answer was discarded.";
        }
      } catch (err) {
        note = /time|abort/i.test(err.message)
          ? "The model did not answer in time, so this is the desk's own wording."
          : `The model could not be reached (${err.message}); this is the desk's own wording.`;
      }
    }

    res.status(200).json({ symbol, market: m.id, question, answer, wrote, note, facts: f });
  } catch (err) {
    res.status(200).json({ symbol, market: m.id, error: `Could not read ${symbol}: ${err.message}` });
  }
}
