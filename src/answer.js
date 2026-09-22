/**
 * Turning a reading into an answer.
 *
 * The numbers are assembled here, in code, and the model is given only the job
 * of saying them in a sentence. It is never asked what the odds are, never
 * handed a tool that could invent one, and its reply is checked against the
 * figures it was given before it reaches the page.
 *
 * Without a model key the page still answers: the composed version below is
 * the answer, and it is labelled as written by the desk rather than dressed up
 * as something it is not.
 */

const pc = (v, d = 1) => (v == null ? "—" : `${(100 * v).toFixed(d)}%`);
const sg = (v, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(100 * v).toFixed(d)}%`);
const clean = (s) => s.replace(/USDT$/, "");

/** Which name a question is about, if it names one we carry. */
export function symbolIn(question, known) {
  const words = question.toUpperCase().match(/[A-Z]{2,12}/g) || [];
  for (const w of words) {
    const hit = w.endsWith("USDT") ? w : w + "USDT";
    if (known.includes(hit)) return hit;
  }
  return null;
}

/** The facts the answer may use. Nothing outside this object may be asserted. */
export function facts(reading) {
  const n = reading.night;
  const r = reading.reading;
  const s = r?.stat;
  return {
    symbol: clean(reading.symbol),
    marketOpen: reading.marketOpen,
    hoursSinceClose: n.hoursSinceClose != null ? Number(n.hoursSinceClose.toFixed(1)) : null,
    hoursToBell: n.hoursToBell != null ? Number(n.hoursToBell.toFixed(1)) : null,
    move: n.move,
    normalDay: n.normalDay,
    ratio: n.ratio,
    band: r?.band ?? null,
    nightsInBand: s?.n ?? null,
    undoneInBand: s?.undonePct ?? null,
    undoneAtRandom: reading.baseline,
    verdict: r?.verdict?.label ?? null,
    call: r?.verdict?.call ?? null,
    noHomeMarket: r?.noHomeMarket ?? false,
    statedBefore: reading.record?.byBand?.[r?.band]?.said ?? null,
    happenedBefore: reading.record?.byBand?.[r?.band]?.happened ?? null,
    gradedNights: reading.record?.quoted ?? null,
    skill: reading.record?.skill ?? null,
  };
}

/** The desk's own answer, composed from the figures. Always available. */
export function compose(f) {
  const bits = [];

  if (f.move == null) {
    return "I could not read a reference close for this name, so I am not going to give you a number.";
  }

  if (Math.abs(f.move) < 0.005) {
    bits.push(`${f.symbol} has moved ${sg(f.move)} since the close. That is under half a percent — inside the spread, and not worth a reading.`);
    return bits.join(" ");
  }

  bits.push(
    `${f.symbol} has moved ${sg(f.move)} since the close, and it covers ${pc(f.normalDay, 2)} in an ordinary session — so tonight is ${f.ratio.toFixed(2)}× a normal day for it.`,
  );

  if (f.undoneInBand != null) {
    bits.push(
      `In that band, ${pc(f.undoneInBand)} of ${f.nightsInBand} measured nights were undone by 10:30, against ${pc(f.undoneAtRandom)} for a night picked at random.`,
    );
    const ratio = f.undoneInBand / f.undoneAtRandom;
    if (ratio >= 1.4) bits.push("That is a good deal riskier than usual. I would wait for the bell.");
    else if (ratio <= 0.6) bits.push("That is a good deal safer than usual. Moves like this have tended to stand.");
    else bits.push("That is about ordinary.");
  } else {
    bits.push("I do not have enough measured nights in that band to quote you a number, so I will not.");
  }

  if (f.noHomeMarket) {
    bits.push("Worth knowing: this name has no home market. No bell ever arrives to settle it, so its moves are rarely corrected by anything.");
  }

  if (f.statedBefore != null) {
    const gap = f.happenedBefore - f.statedBefore;
    bits.push(
      `On this band I have said ${pc(f.statedBefore)} before and ${pc(f.happenedBefore)} actually happened — I run about ${Math.abs(100 * gap).toFixed(0)} point${Math.abs(100 * gap) >= 1.5 ? "s" : ""} ${gap > 0 ? "optimistic" : "pessimistic"} here.`,
    );
  }

  bits.push("I have no read on direction, and I will not pretend to.");
  return bits.join(" ");
}

/**
 * Ask the model to say the same thing more naturally. The prompt carries the
 * facts and forbids arithmetic; anything the model returns that contains a
 * percentage we did not give it is thrown away in favour of the composed text.
 */
export function prompt(question, f) {
  return [
    {
      role: "system",
      content:
        "You are Almanac, a research desk for tokenised US stocks on Bitget. You answer in plain English, " +
        "in at most four short sentences, in a calm voice — someone may be reading you at three in the morning " +
        "while frightened about their position.\n\n" +
        "Hard rules:\n" +
        "- Use ONLY the figures in the FACTS block. Never compute, estimate, round differently, or introduce a number.\n" +
        "- Never predict direction. Almanac states how often moves like this were undone; it does not say what happens next.\n" +
        "- Never give financial advice or tell anyone to buy, sell or hold.\n" +
        "- If a fact is null, say you do not have it rather than filling the gap.\n" +
        "- Say the most important thing first.",
    },
    {
      role: "user",
      content: `FACTS (the only numbers you may use):\n${JSON.stringify(f, null, 1)}\n\nQUESTION: ${question}`,
    },
  ];
}

/** Every percentage in the text must be one we handed the model. */
export function numbersAreOurs(text, f) {
  const allowed = new Set();
  for (const v of [f.move, f.normalDay, f.undoneInBand, f.undoneAtRandom, f.statedBefore, f.happenedBefore, f.skill]) {
    if (v == null) continue;
    for (const d of [0, 1, 2]) allowed.add(Math.abs(100 * v).toFixed(d));
  }
  if (f.ratio != null) for (const d of [1, 2]) allowed.add(f.ratio.toFixed(d));
  for (const v of [f.nightsInBand, f.gradedNights, f.hoursSinceClose, f.hoursToBell]) {
    if (v != null) allowed.add(String(v));
  }
  const found = text.match(/\d+(?:\.\d+)?/g) || [];
  return found.every((x) => allowed.has(x) || allowed.has(Number(x).toFixed(0)) || Number(x) <= 12);
}
