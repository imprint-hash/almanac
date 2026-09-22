/**
 * The question box.
 *
 * The desk works out the figures; Qwen only puts them into a sentence. If the
 * model is unreachable, slow, or comes back with a number nobody gave it, the
 * desk's own wording is served instead and the response says which one you got.
 * A research tool that quietly invents a percentage is worse than one that
 * sounds wooden.
 */

import { readFileSync } from "node:fs";
import { reading } from "../src/desk.js";
import { facts, compose, prompt, symbolIn, numbersAreOurs } from "../src/answer.js";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const index = read("../data/index.json");
const normals = read("../data/normal.json");
const { card } = read("../data/scorecard.json");

const KEY = process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY || "";
const MODEL = process.env.QWEN_MODEL || "qwen-max";
const ENDPOINT =
  process.env.QWEN_ENDPOINT ||
  "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions";

async function viaQwen(messages) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, max_tokens: 260 }),
    signal: AbortSignal.timeout(14_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 120)}`);
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("empty reply");
  return text;
}

export default async function handler(req, res) {
  const question = String(req.body?.question || "").slice(0, 300).trim();
  const known = Object.keys(normals);
  const asked = symbolIn(question, known);
  const fallback = String(req.body?.symbol || "NVDAUSDT").toUpperCase();
  const symbol = asked || (known.includes(fallback) ? fallback : known[0]);

  try {
    const r = await reading(symbol, normals, index);
    const f = facts({ ...r, baseline: index.all.undonePct, record: { byBand: card.byBand, quoted: card.quoted, skill: card.skill } });
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

    res.status(200).json({ symbol, question, answer, wrote, note, facts: f });
  } catch (err) {
    res.status(200).json({ symbol, error: `Could not read ${symbol}: ${err.message}` });
  }
}
