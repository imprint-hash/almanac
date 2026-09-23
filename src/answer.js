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
    // The name as the exchange writes it — rIUSB, not RIUSBUSDT. Handed the
    // raw symbol the model re-spells it, and a desk that cannot get the ticker
    // right has no business quoting probabilities.
    symbol: reading.display && reading.display !== reading.symbol ? reading.display : clean(reading.symbol),
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

/**
 * The desk's own answer, composed from the figures. Always available.
 *
 * This is not a fallback in any small sense: the model is slow and often times
 * out, so this is what most people read most of the time. It gets the same care
 * — plain words, the meaning before the number, and no term left standing that
 * a person who does not trade for a living would have to look up.
 */
export function compose(f) {
  if (f.move == null) {
    return "I could not find a closing price to measure against, so I am not going to give you a number.";
  }

  const dir = f.move < 0 ? "down" : "up";
  const size = Math.abs(100 * f.move).toFixed(2);

  if (Math.abs(f.move) < 0.005) {
    return `${f.symbol} is ${dir} ${size}% since the market closed. That is less than half a percent — small enough that it is just the normal jitter of trading, and not worth reading anything into.`;
  }

  const bits = [`${f.symbol} is ${dir} ${size}% since the market closed.`];

  // What it means for this name comes first. The same 3% is nothing on a jumpy
  // name and serious on a calm one, and that is the whole point of the desk.
  bits.push(`For this one that is ${plainRatio(f.ratio)}.`);

  if (f.undoneInBand != null) {
    const undone = Math.round(f.undoneInBand * f.nightsInBand);
    bits.push(
      `Looking back, moves about this big on names like this happened ${f.nightsInBand} times — and on ${undone} of them the price drifted back to roughly where it started within an hour of the US market reopening.`,
    );
    bits.push(
      `That is ${pc(f.undoneInBand)}, against ${pc(f.undoneAtRandom)} for an ordinary night, so this one is ${plainCompare(f.undoneInBand, f.undoneAtRandom)}.`,
    );
  } else {
    bits.push("I have not measured enough nights like this one to put a number on it, so I will not pretend I can.");
  }

  if (f.noHomeMarket) {
    bits.push(
      "One thing worth knowing: this name has no stock market behind it — it is a private company. No opening bell ever arrives to correct its price.",
    );
  }

  if (f.statedBefore != null) {
    const gap = f.happenedBefore - f.statedBefore;
    const off = Math.abs(100 * gap);
    bits.push(
      off < 2
        ? `On nights like this I have been about right before: I expected ${pc(f.statedBefore)} to drift back, and ${pc(f.happenedBefore)} did.`
        : `Be aware I lean ${gap > 0 ? "hopeful" : "gloomy"} on nights like this: I expected ${pc(f.statedBefore)} to drift back and ${pc(f.happenedBefore)} actually did, so I am out by about ${off.toFixed(0)} points here.`,
    );
  }

  bits.push("What I cannot tell you is which way it goes from here. Nothing I measure says that.");
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
/** The ratio, said the way someone would say it out loud. */
function plainRatio(r) {
  if (r >= 2) return `much bigger than usual — over ${Math.floor(r)} times what it normally covers in a whole day`;
  if (r >= 1.3) return "bigger than a whole ordinary day of movement for it";
  if (r >= 0.8) return "about as much as it normally covers in a whole day";
  if (r >= 0.5) return "about half of what it normally covers in a day";
  if (r >= 0.3) return "a third or so of a normal day for it — fairly small";
  return "small for this name — well under a third of what it normally covers in a day";
}

function plainCompare(mine, base) {
  const x = mine / base;
  if (x >= 1.4) return "noticeably more likely to come back than usual";
  if (x <= 0.6) return "much less likely to come back than usual";
  return "about as likely as usual";
}

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
    "how unusual that is for this name": f.ratio == null ? null : plainRatio(f.ratio),
    "the state of its home market": f.marketOpen
      ? "open, so this price is being set by a real exchange"
      : `shut, and has been for ${f.hoursSinceClose} hours`,
  };

  if (tooSmall) {
    d["whether this is worth reading at all"] =
      "no — it is under half a percent, which is inside the spread. Say that, and do not quote any other figure.";
  } else if (f.undoneInBand != null) {
    const undone = Math.round(f.undoneInBand * f.nightsInBand);
    d["what happened to moves like this before"] =
      `on ${undone} of ${f.nightsInBand} nights the price came back to roughly where it started within an hour of the US market reopening — that is ${(100 * f.undoneInBand).toFixed(1)}%`;
    d["how that compares with an ordinary night"] =
      `${(100 * f.undoneAtRandom).toFixed(1)}% of all nights come back like that, so this is ${plainCompare(f.undoneInBand, f.undoneAtRandom)}`;
  } else {
    d["what history says about a move this size"] =
      "not enough measured nights to quote a figure. Say so plainly.";
  }

  if (f.noHomeMarket) {
    d["a thing worth mentioning"] =
      "this name has no home market at all — it is a private company, so no bell ever arrives to settle its price";
  }

  if (!tooSmall && f.statedBefore != null) {
    d["how well the desk has judged this kind of night before"] =
      `it expected ${(100 * f.statedBefore).toFixed(1)}% of them to come back and ${(100 * f.happenedBefore).toFixed(1)}% did`;
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
        "Write for someone who does not trade for a living.\n\n" +
        "Your FIRST sentence must say how unusual tonight's move is for this particular name, using " +
        "the FACTS block's own words for it. That is the whole point of the desk: the same 3% is " +
        "nothing on a jumpy name and serious on a calm one. Only after that give what happened to " +
        "moves like it before.\n\n" +
        "Lead with what it MEANS, then the number " +
        "behind it. Never leave a piece of jargon unexplained: not 'undone', not 'ratio', not " +
        "'0.42x', not a bare clock time. If you mention how often something happened, say it as a " +
        "count of nights as well as a percentage. The FACTS block already spells these out in plain " +
        "words — use its wording rather than compressing it back into shorthand.\n\n" +
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
