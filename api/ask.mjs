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
 * qwen3.8-max reasons before it answers, so a reply costs about thirteen
 * seconds and sometimes rather more. One retry, because a single slow call is
 * usually just a slow call; beyond that the desk answers for itself rather
 * than leaving someone watching a spinner at three in the morning.
 */
async function viaQwen(messages, { tries = 2 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: 260 }),
        signal: AbortSignal.timeout(24_000),
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
  throw last;
}

export default async function handler(req, res) {
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
        const text = await viaQwen(prompt(question, f));
        if (numbersAreOurs(text, f)) {
          answer = text;
          wrote = MODEL;
        } else {
          note = "The model returned a figure the desk did not give it, so its answer was discarded.";
        }
      } catch (err) {
        note = `The model did not answer (${err.message}); this is the desk's own wording.`;
      }
    }

    res.status(200).json({ symbol, market: m.id, question, answer, wrote, note, facts: f });
  } catch (err) {
    res.status(200).json({ symbol, market: m.id, error: `Could not read ${symbol}: ${err.message}` });
  }
}
