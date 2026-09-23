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

/**
 * Which name a question is about, if it names one we carry.
 *
 * Someone types "NVDA", and depending on the market the symbol behind it is
 * NVDAUSDT or RNVDAUSDT, so the display names are checked too rather than
 * assuming one spelling and silently answering about the wrong thing.
 */
export function symbolIn(question, known, normals = {}) {
  const words = question.toUpperCase().match(/[A-Z]{2,12}/g) || [];
  const byDisplay = new Map();
  for (const [sym, v] of Object.entries(normals)) {
    if (v?.display) byDisplay.set(String(v.display).toUpperCase(), sym);
  }
  for (const w of words) {
    for (const candidate of [w, `${w}USDT`, `R${w}`, `R${w}USDT`]) {
      if (known.includes(candidate)) return candidate;
      if (byDisplay.has(candidate)) return byDisplay.get(candidate);
    }
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
/**
 * Figures as they should appear in a sentence.
 *
 * The model is handed these strings and not the raw fractions behind them. Sent
 * a bare 0.0161 it will write "MSTR is at -0.0161", which reads like a price;
 * sent "down 1.61%" it can only repeat it. Formatting is the desk's job, and
 * doing it here also means the check afterwards is comparing like with like.
 */
export function forModel(f) {
  const tooSmall = f.move != null && Math.abs(f.move) < 0.005;

  // The keys are written as the phrases a person would use, because whatever a
  // key is called will sooner or later appear in the answer verbatim.
  const d = {
    "the name": f.symbol,
    "how far it has moved since the close":
      f.move == null ? null : `${f.move < 0 ? "down" : "up"} ${Math.abs(100 * f.move).toFixed(2)}%`,
    "what this name covers in an ordinary session":
      f.normalDay == null ? null : `${(100 * f.normalDay).toFixed(2)}%`,
    "so tonight's move is worth": f.ratio == null ? null : `${f.ratio.toFixed(2)} times a normal day for it`,
    "the state of its home market": f.marketOpen
      ? "open, so this price is being set by a real exchange"
      : `shut, and has been for ${f.hoursSinceClose} hours`,
  };

  if (tooSmall) {
    d["whether this is worth reading at all"] =
      "no — it is under half a percent, which is inside the spread. Say that, and do not quote any other figure.";
  } else if (f.undoneInBand != null) {
    d["how often moves this size, for a name like this, were undone by 10:30"] = `${(100 * f.undoneInBand).toFixed(1)}%`;
    d["how many measured nights that is based on"] = f.nightsInBand;
    d["how often a night picked at random is undone"] = `${(100 * f.undoneAtRandom).toFixed(1)}%`;
  } else {
    d["what history says about a move this size"] =
      "not enough measured nights to quote a figure. Say so plainly.";
  }

  if (f.noHomeMarket) {
    d["a thing worth mentioning"] =
      "this name has no home market at all — it is a private company, so no bell ever arrives to settle its price";
  }

  if (!tooSmall && f.statedBefore != null) {
    d["what the desk has said before about moves like this"] = `${(100 * f.statedBefore).toFixed(1)}%`;
    d["what actually happened those times"] = `${(100 * f.happenedBefore).toFixed(1)}%`;
  }

  for (const k of Object.keys(d)) if (d[k] == null) delete d[k];
  return d;
}

export function prompt(question, f) {
  return [
    {
      role: "system",
      content:
        "You are Almanac, a research desk for tokenised US stocks on Bitget. Someone may be reading you at " +
        "three in the morning, frightened about a position. Be calm, plain and brief.\n\n" +
        "Answer in AT MOST four short sentences. No preamble, no bullet points, no headings.\n\n" +
        "Hard rules:\n" +
        "- Every figure you use must be copied VERBATIM from the FACTS block, exactly as written there. " +
        "Never convert, recompute, re-round or invent one, and never write a bare decimal as if it were a price.\n" +
        "- Never predict direction. Almanac reports how often moves like this were undone. It does not say what happens next.\n" +
        "- Never advise buying, selling or holding.\n" +
        "- If something is not in the FACTS block, say you do not have it.\n" +
        "- Lead with the answer to the question asked.\n" +
        "- Do not think at length. Answer directly.\n" +
        "- The FACTS block is written as plain phrases. Never quote a phrase from it as though it were a " +
        "technical term, and never write one in snake_case or with underscores. Write like a person talking.",
    },
    {
      role: "user",
      content: `FACTS (copy these figures verbatim; they are the only ones you may use):\n${JSON.stringify(forModel(f), null, 1)}\n\nQUESTION: ${question}`,
    },
  ];
}

/**
 * Every figure in the answer must be one we handed the model.
 *
 * The allowed set is built from the very strings the model was given, so the
 * check and the prompt can never drift apart. Clock times are removed first:
 * "10:30" is the hour the outcome is read at, it appears in the desk's own
 * wording, and an earlier version of this check read the 30 as an invented
 * statistic and threw away a perfectly good answer.
 */
export function numbersAreOurs(text, f) {
  const given = JSON.stringify(forModel(f));
  const allowed = new Set(given.match(/\d+(?:\.\d+)?/g) || []);

  // The times the method is defined at, and the ordinary furniture of a sentence.
  for (const t of ["9", "09", "15", "16", "10", "30", "24", "0", "1", "2", "3", "4", "5"]) allowed.add(t);

  const cleaned = text
    .replace(/\d{1,2}:\d{2}/g, " ")      // clock times
    .replace(/\b(19|20)\d{2}\b/g, " ");  // years

  const found = cleaned.match(/\d+(?:\.\d+)?/g) || [];
  return found.every(
    (x) => allowed.has(x) || allowed.has(String(Number(x))) || allowed.has(Number(x).toFixed(0)),
  );
}
