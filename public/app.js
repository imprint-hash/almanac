/**
 * The desk, in the browser.
 *
 * Every figure on screen comes from /api — nothing here invents a number, and
 * where the server could not answer, the page says so instead of drawing an
 * empty chart that looks like a reading.
 */

const $ = (id) => document.getElementById(id);
const pc = (v, d = 1) => (v == null ? "—" : `${(100 * v).toFixed(d)}%`);
const sg = (v, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(100 * v).toFixed(d)}%`);
const clean = (s) => s.replace(/USDT$/, "");
// rToken display names all start with a lower-case r, so the first letter would
// label every row identically. Take the ticker's own initial instead.
const initial = (s) => (/^r[A-Z0-9]/.test(s) ? s[1] : s[0]);

const BAND_TONE = { "under 0.3": "var(--crit)", "0.3-0.5": "var(--serious)", "0.5-0.8": "var(--warn)", "0.8-1.3": "var(--good)", "over 1.3": "var(--good)" };

/* Something to read while the sweep runs. Replaced by whatever actually moved
   most tonight as soon as the board answers. */
const FIRST = "RNVDAUSDT";

/* Only the newest question may write to the answer box. */
let askSeq = 0;

/* A reading is worth linking to: /?market=perp&symbol=NVDA opens on that name,
   in that market, instead of on whatever moved most tonight. */
const params = new URLSearchParams(location.search);
const asked = { market: params.get("market"), symbol: (params.get("symbol") || "").toUpperCase() };

let state = {
  market: asked.market === "perp" ? "perp" : "rtoken",
  symbol: null,
  board: null,
  reading: null,
  hideSmall: true,
  picked: Boolean(asked.symbol),
};

/** The instrument switch. Both markets were measured the same way, so the page
    offers the other one rather than asking anyone to take the first on trust. */
function renderMarkets(list, current) {
  const el = $("marketpick");
  if (!list || el.dataset.done === String(list.length)) return;
  el.dataset.done = String(list.length);
  el.innerHTML = list.map((m) => `<button type="button" data-market="${m.id}" aria-pressed="${m.id === current}" title="${m.what} — ${m.nights} nights measured">${m.label}</button>`).join("");
  el.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.market === state.market) return;
    state.market = b.dataset.market;
    state.picked = false;
    state.symbol = null;
    el.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.market === state.market)));
    $("rows").innerHTML = `<div class="empty">Asking Bitget…</div>`;
    loadBoard();
  }));
}

/* ---------- charts ---------- */

function spark(el, path, close) {
  if (!path?.length) { el.innerHTML = ""; return; }
  const W = 330, H = 74;
  const vals = path.map(([, c]) => c);
  const lo = Math.min(...vals, close), hi = Math.max(...vals, close);
  const x = (i) => (W * i) / (path.length - 1 || 1);
  const y = (v) => 6 + (H - 12) * (1 - (v - lo) / (hi - lo || 1));
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(" ");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none" role="img" aria-label="Price since the close">
    <defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--teal-up)" stop-opacity="0.26"></stop>
      <stop offset="100%" stop-color="var(--teal-up)" stop-opacity="0"></stop>
    </linearGradient></defs>
    <line x1="0" y1="${y(close).toFixed(1)}" x2="${W}" y2="${y(close).toFixed(1)}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="4 4"></line>
    <path d="${d} L${W} ${H} L0 ${H} Z" fill="url(#fade)"></path>
    <path d="${d}" fill="none" stroke="var(--teal-up)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></path>
    <circle cx="${W}" cy="${y(vals[vals.length - 1]).toFixed(1)}" r="4" fill="var(--teal-up)" stroke="#0a1513" stroke-width="2"></circle>
  </svg>`;
}

function bandChart(el, bands, baseline, here) {
  const W = 396, H = 196, L = 34, B = 46, T = 14, max = 0.55;
  const keys = Object.keys(bands);
  const step = (W - L - 14) / keys.length;
  const bx = (i) => L + 6 + i * step;
  const bw = Math.min(46, step - 22);
  const by = (v) => T + (H - T - B) * (1 - v / max);

  const grid = [0, 0.2, 0.4].map((v) => `
    <line x1="${L}" y1="${by(v).toFixed(1)}" x2="${W - 6}" y2="${by(v).toFixed(1)}" stroke="var(--line)"></line>
    <text x="${L - 8}" y="${(by(v) + 3.5).toFixed(1)}" text-anchor="end" fill="var(--faint)" font-size="9">${(100 * v).toFixed(0)}%</text>`).join("");

  const bars = keys.map((k, i) => {
    const s = bands[k], on = k === here;
    return `<g>
      <rect x="${bx(i)}" y="${by(s.undonePct).toFixed(1)}" width="${bw}" height="${(by(0) - by(s.undonePct)).toFixed(1)}" rx="4"
            fill="var(--teal)" opacity="${on ? 1 : 0.42}"${on ? ' stroke="var(--teal-up)" stroke-width="2"' : ""}>
        <title>${k}: ${pc(s.undonePct)} of ${s.n} nights were undone</title></rect>
      <text x="${bx(i) + bw / 2}" y="${(by(s.undonePct) - 7).toFixed(1)}" text-anchor="middle" fill="${on ? "var(--ink)" : "var(--ink-2)"}" font-size="12" font-weight="${on ? 600 : 400}">${pc(s.undonePct, 0)}</text>
      <text x="${bx(i) + bw / 2}" y="${H - 26}" text-anchor="middle" fill="${on ? "var(--ink)" : "var(--muted)"}" font-size="9">${k}</text>
      ${on ? `<text x="${bx(i) + bw / 2}" y="${H - 11}" text-anchor="middle" fill="var(--teal-up)" font-size="9" font-weight="600">▲ HERE</text>` : ""}
    </g>`;
  }).join("");

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Share of overnight moves undone by ten thirty, by band">
    ${grid}
    <line x1="${L}" y1="${by(baseline).toFixed(1)}" x2="${W - 6}" y2="${by(baseline).toFixed(1)}" stroke="var(--warn)" stroke-width="1.5" stroke-dasharray="4 4"></line>
    <text x="${W - 8}" y="${(by(baseline) - 6).toFixed(1)}" text-anchor="end" fill="var(--warn)" font-size="9">RANDOM NIGHT ${pc(baseline)}</text>
    ${bars}
  </svg>`;
}

function relChart(el, byBand) {
  const W = 396, H = 196, L = 38, B = 42, T = 14, R = 14, max = 0.56;
  const x = (v) => L + (W - L - R) * (v / max);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const grid = [0, 0.2, 0.4].map((v) => `
    <line x1="${x(v).toFixed(1)}" y1="${T}" x2="${x(v).toFixed(1)}" y2="${H - B}" stroke="var(--line)"></line>
    <line x1="${L}" y1="${y(v).toFixed(1)}" x2="${W - R}" y2="${y(v).toFixed(1)}" stroke="var(--line)"></line>
    <text x="${x(v).toFixed(1)}" y="${H - B + 14}" text-anchor="middle" fill="var(--faint)" font-size="9">${(100 * v).toFixed(0)}%</text>
    <text x="${L - 7}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" fill="var(--faint)" font-size="9">${(100 * v).toFixed(0)}%</text>`).join("");
  const dots = Object.entries(byBand).map(([k, s]) => `
    <circle cx="${x(s.said).toFixed(1)}" cy="${y(s.happened).toFixed(1)}" r="5" fill="var(--teal)" stroke="var(--surf)" stroke-width="2">
      <title>${k}: it said ${pc(s.said)}, ${pc(s.happened)} happened, over ${s.n} nights</title></circle>`).join("");

  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Odds it stated against what happened; points on the diagonal mean the odds were honest">
    ${grid}
    <line x1="${x(0).toFixed(1)}" y1="${y(0).toFixed(1)}" x2="${x(max).toFixed(1)}" y2="${y(max).toFixed(1)}" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="4 4"></line>
    <text x="${x(0.42).toFixed(1)}" y="${y(0.47).toFixed(1)}" text-anchor="end" fill="var(--muted)" font-size="9">PERFECTLY HONEST</text>
    ${dots}
    <text x="${L + 2}" y="${H - 6}" fill="var(--faint)" font-size="9">IT SAID →</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" fill="var(--faint)" font-size="9">↑ IT HAPPENED</text>
  </svg>`;
}

/* ---------- rendering ---------- */

function renderReading(d) {
  if (d.error) {
    $("verdict").textContent = d.error;
    return;
  }
  const n = d.night, r = d.reading;
  $("sym").textContent = d.display && d.display !== d.symbol ? d.display : clean(d.symbol);
  $("symnote").textContent = `${d.label || "Bitget"} · Bitget`;
  renderMarkets(d.markets, state.market);
  $("darkfor").textContent = d.marketOpen
    ? "US market open — this price is real"
    : `no home market for ${n.hoursSinceClose.toFixed(1)}h`;
  $("darkfor").className = d.marketOpen ? "chip" : "chip warn";

  const label = r.verdict?.label ?? "—";
  const ph = $("q");
  if (ph && !ph.dataset.touched) ph.placeholder = `is ${d.display || clean(d.symbol)} really moving?`;
  $("verdict").innerHTML = label.replace(/(almost never been undone|undone by 10:30|inside the noise)/, "<em>$1</em>");

  $("f-move").textContent = sg(n.move);
  $("f-move").className = "fig " + (n.move < 0 ? "down" : "up");
  $("f-normal").textContent = pc(n.normalDay, 2);
  $("f-ratio").textContent = n.ratio ? n.ratio.toFixed(2) + "×" : "—";

  const s = r.stat;
  $("kv").innerHTML = [
    ["Band tonight", r.band ? r.band + "×" : "—"],
    ["Nights measured there", s ? String(s.n) : "—"],
    ["Undone by 10:30", s ? pc(s.undonePct) : "—"],
    ["Any night at random", pc(d.baseline)],
    ["Normal day from", d.sessionsBehindNormalDay ? `${d.sessionsBehindNormalDay} sessions` : d.normalDaySource],
  ].map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");

  $("sparkmove").textContent = sg(n.move);
  $("sparkmove").style.color = n.move < 0 ? "var(--crit)" : "var(--good)";
  $("sparkclose").textContent = n.closePrice != null ? `CLOSE ${n.closePrice}` : "";
  $("sparknow").textContent = n.nowPrice != null ? `NOW ${n.nowPrice}` : "";
  spark($("spark"), d.path, n.closePrice ?? n.nowPrice);

  bandChart($("bandchart"), d.bands, d.baseline, r.band);
  $("nightstag").textContent = `${d.meta.nights.toLocaleString()} NIGHTS`;

  relChart($("relchart"), d.record.byBand);
  $("gradedtag").textContent = `${d.record.quoted.toLocaleString()} GRADED`;
  $("scorechips").innerHTML = [
    `<span class="chip">Brier ${d.record.brier.toFixed(4)}</span>`,
    `<span class="chip">Baseline ${d.record.baseline.toFixed(4)}</span>`,
    `<span class="chip" style="color: var(--good); border-color: rgba(12,163,12,.3)">Skill +${(100 * d.record.skill).toFixed(1)}%</span>`,
  ].join("");
}

function renderBoard(d) {
  const el = $("rows");
  if (d.error) { el.innerHTML = `<div class="empty">${d.error}</div>`; return; }
  const rows = d.rows.filter((r) => !state.hideSmall || Math.abs(r.move) >= 0.005);
  if (!rows.length) { el.innerHTML = `<div class="empty">Nothing has moved half a percent tonight. That is the honest answer.</div>`; return; }

  el.innerHTML = rows.map((r) => {
    const s = d.bands[r.band] || {};
    const tone = BAND_TONE[r.band] || "var(--muted)";
    const width = Math.max(4, ((s.undonePct || 0) / 0.55) * 100);
    return `<div class="row${r.symbol === state.symbol ? " on" : ""}" data-sym="${r.symbol}" role="button" tabindex="0">
      <div class="name"><span class="tickerbox">${initial(r.display || clean(r.symbol))}</span><span class="num">${r.display || clean(r.symbol)}</span></div>
      <div class="num r" style="color: ${r.move < 0 ? "var(--crit)" : "var(--good)"}">${sg(r.move)}</div>
      <div class="num r">${r.ratio.toFixed(2)}×</div>
      <div class="pl"><span class="chip" style="color: ${tone}">${r.band}×</span></div>
      <div class="num r nights muted">${s.n ?? "—"}</div>
      <div class="num r" style="color: ${tone}">${pc(s.undonePct)}</div>
      <div class="against"><span class="bar" style="width: ${width}%"></span><span>${(s.undonePct / d.baseline).toFixed(1)}× a random night</span></div>
    </div>`;
  }).join("");

  $("againsthead").textContent = `AGAINST ${pc(d.baseline)} AT RANDOM`;
  $("foot").innerHTML = [
    `MEASURED ${d.meta.from} → ${d.meta.to} · ${d.meta.symbols} NAMES`,
    `WEEKEND GAPS ARE CALMER · ${pc(d.cuts.weekend.undonePct)} vs ${pc(d.cuts.weeknight.undonePct)}`,
    `NO HOME MARKET · ${pc(d.cuts.noHomeMarket.undonePct)}`,
    `${d.answered} OF ${d.asked} NAMES ANSWERED`,
    `<span class="grow"></span><span class="muted">PUBLIC MARKET DATA · NO ACCOUNT · NO ORDERS · NOT ADVICE</span>`,
  ].map((t) => `<span>${t}</span>`).join("");
}

/**
 * The countdown.
 *
 * The moment matters more than the state: "shut" is a fact, "opens in 3h 41m"
 * is the thing that decides whether you act now or wait. It ticks in the
 * browser against timestamps the server sent, and the offset between the two
 * clocks is carried so a viewer whose laptop is a few minutes out still sees
 * the right number.
 */
let ticker = null;

function clock(d) {
  const el = $("clock");
  if (!d || d.error) {
    el.innerHTML = `<span class="dot" style="background: var(--crit)"></span><span class="mono">exchange unreachable</span>`;
    if (ticker) { clearInterval(ticker); ticker = null; }
    return;
  }

  const c = d.clock;
  const skew = c ? c.now - Date.now() : 0;
  const open = () => {
    const now = Date.now() + skew;
    return c ? now >= c.bellAt && now < c.nextCloseAt : d.marketOpen;
  };

  const spell = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return h ? `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`
             : `${m}m ${String(sec).padStart(2, "0")}s`;
  };

  const tick = () => {
    if (!c) return;
    const now = Date.now() + skew;
    const isOpen = open();
    const target = isOpen ? c.nextCloseAt : c.bellAt;
    // Past the moment we were given, stop counting and let the next refresh
    // bring fresh timestamps rather than counting into a stale one.
    const left = target - now;
    el.innerHTML = `<span class="dot" style="background: ${isOpen ? "var(--good)" : "var(--warn)"}"></span>
      <span class="mono">${isOpen ? "US MARKET OPEN" : "US MARKET SHUT"}</span>
      <span class="faint">·</span>
      <span class="mono count ${isOpen ? "" : "teal"}">${left > 0
        ? `${isOpen ? "CLOSES" : "OPENS"} IN ${spell(left)}`
        : "WAITING FOR THE NEXT BELL"}</span>`;
  };

  tick();
  if (ticker) clearInterval(ticker);
  ticker = setInterval(tick, 1000);
}

/**
 * The live record. Hidden until there is one, because an empty panel promising
 * live calls is worse than no panel at all.
 */
async function loadLive() {
  let d;
  try { d = await fetch(`/api/live?market=${state.market}`).then((x) => x.json()); } catch { return; }
  const panel = $("live");
  if (!d.nights?.length) { panel.hidden = true; return; }
  panel.hidden = false;

  const head = `<div class="thead mono"><div>BELL</div><div class="r">CALLS</div>
    <div class="pl">LOCKED</div><div class="r">IT SAID</div><div class="r">IT HAPPENED</div></div>`;

  const rows = d.nights.map((n) => {
    const s = n.settled;
    return `<div class="row">
      <div class="num">${n.reopens}</div>
      <div class="num r">${n.calls}</div>
      <div class="pl muted" style="font-size:12px">${n.lockedAtNewYork || "—"} · ${n.minutesBeforeBell}m before</div>
      <div class="num r">${s ? pc(s.itSaid) : "—"}</div>
      <div class="num r" style="color:${s ? "var(--ink)" : "var(--muted)"}">${s ? `${pc(s.itHappened)} (${s.undone}/${s.judged})` : "waiting for the bell"}</div>
    </div>`;
  }).join("");

  const t = d.totals;
  const total = t
    ? `<p class="note">Across ${t.nights} settled night${t.nights === 1 ? "" : "s"} and ${t.calls} calls: it said <strong style="color:var(--ink)">${pc(t.itSaid)}</strong> would be undone, <strong style="color:var(--ink)">${pc(t.itHappened)}</strong> were. ${d.note}</p>`
    : `<p class="note">${d.note}</p>`;

  $("livebody").innerHTML = head + rows + total;
}

/* ---------- wiring ---------- */

async function load(symbol, { thenAsk = false } = {}) {
  state.symbol = symbol;
  const r = await fetch(`/api/reading?symbol=${encodeURIComponent(symbol)}&market=${state.market}`).then((x) => x.json());
  state.reading = r;
  renderReading(r);
  clock(r);
  if (state.board) renderBoard(state.board);
  if (thenAsk) ask(`Is ${r.display || clean(r.symbol)} really moving tonight?`, { quiet: true });
}

async function loadBoard() {
  const b = await fetch(`/api/board?market=${state.market}`).then((x) => x.json());
  renderMarkets(b.markets, state.market);
  state.board = b;
  renderBoard(b);
  loadLive();
  // Land on whatever actually moved most for itself tonight, rather than a
  // name hard-coded months ago that may be sitting perfectly still.
  if (!state.picked && b.rows?.length) {
    state.picked = true;
    load(b.rows[0].symbol, { thenAsk: true });
  }
}

$("rows").addEventListener("click", (e) => {
  const row = e.target.closest(".row");
  if (row) { state.picked = true; load(row.dataset.sym); }
});
$("rows").addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const row = e.target.closest(".row");
  if (row) { e.preventDefault(); load(row.dataset.sym); }
});

$("hidesmall").addEventListener("change", (e) => {
  state.hideSmall = e.target.checked;
  if (state.board) renderBoard(state.board);
});

/**
 * Ask the desk. Whoever ends up writing the answer is named on it — the model
 * when it answered in time and kept to the figures, the desk itself when it did
 * not. That label is the point, not decoration.
 */
async function ask(question, { quiet = false } = {}) {
  const out = $("answer");
  out.hidden = false;
  out.innerHTML = `<span class="muted">Reading the market…</span>`;
  const mine = ++askSeq;

  // The desk answers first so there is something true on screen within a
  // second; the model is then asked the same question and swapped in if it
  // arrives, still checked, still labelled.
  const render = (r, pending) => {
    if (mine !== askSeq) return;
    const model = r.wrote && r.wrote !== "the desk";
    const badge = r.wrote
      ? `<span class="who ${model ? "model" : "fallback"}">${model ? "✦ written by " + r.wrote : "written by the desk"}</span>`
      : "";
    out.innerHTML = `${badge}${pending ? `<span class="who pending">asking qwen…</span>` : ""}` +
      `<span class="said">${r.answer || r.error || "No answer."}</span>` +
      (r.note && !pending ? `<span class="mono muted why">${r.note}</span>` : "");
  };

  const post = async (body) => {
    const raw = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((x) => x.text());
    try { return JSON.parse(raw); }
    catch { return null; }
  };

  const base = { question, symbol: state.symbol, market: state.market };
  const quick = await post({ ...base, fast: true });
  if (quick) render(quick, true);
  const full = await post(base);
  if (full) render(full, false);
  else if (!quick) render({ wrote: "the desk", answer: "The question box did not come back in time. Everything below is unaffected — it comes from a different request." }, false);
}

$("askform").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  $("q").dataset.touched = "1";
  if (q) ask(q);
});

/* The board sweeps forty names and takes several seconds. The reading takes one
   and carries the bands, the record and the baseline with it — so it paints the
   charts first and the rail fills in behind it. Waiting for the sweep before
   drawing anything made a working page look like a dead one. */
load(asked.symbol || FIRST);
loadBoard();
setInterval(() => { if (state.symbol) load(state.symbol); }, 60_000);
setInterval(loadBoard, 180_000);
