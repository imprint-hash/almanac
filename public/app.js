// Almanac: tonight's odds board. Every number on it comes from the API, which
// counts measured nights; the page only lays them out.

const $ = (id) => document.getElementById(id);
const pc = (v, d = 0) => (v == null ? "—" : `${(100 * v).toFixed(d)}%`);
const sg = (v, d = 2) => (v == null ? "—" : `${v >= 0 ? "+" : "−"}${(100 * Math.abs(v)).toFixed(d)}%`);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const bare = (display) => String(display || "").replace(/^r/, "").replace(/USDT$/, "");

const asked = Object.fromEntries(new URLSearchParams(location.search));
const state = {
  market: asked.market === "perp" ? "perp" : "rtoken",
  symbol: null,
  picked: false,
  board: null,
  reading: null,
  hideSmall: true,
  showAll: false,
};
const FIRST = { rtoken: "RNVDAUSDT", perp: "NVDAUSDT" };
const SHOWN = 9;

/* ---------- theme ---------- */
const store = {
  get(k) { try { return localStorage.getItem(`almanac:${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`almanac:${k}`, v); } catch {} },
};
$("theme").addEventListener("click", () => {
  const root = document.documentElement;
  const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  root.dataset.theme = dark ? "light" : "dark";
  store.set("theme", root.dataset.theme);
});

/* ---------- how a band reads ---------- */
// The same cut-offs the API uses to word a verdict, so a card never says
// "likely stands" about a band the reading calls shaky.
function callFor(undone) {
  if (undone == null) return { text: "Not enough nights", cls: "dim" };
  if (undone <= 0.2) return { text: "Likely stands", cls: "good" };
  if (undone <= 0.42) return { text: "Shaky", cls: "acc" };
  return { text: "Coin flip", cls: "warn" };
}

/** A stable colour per ticker, so a token keeps its face between visits. */
function face(display) {
  const t = bare(display);
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `<span class="tk" style="background:hsl(${h} 52% 36%)" aria-hidden="true">${esc(t.slice(0, 5))}</span>`;
}

/* ---------- market switch ---------- */
function renderMarkets(list) {
  const el = $("marketpick");
  if (!list?.length || el.childElementCount) return;
  el.innerHTML = list.map((m) =>
    `<button type="button" data-market="${m.id}" class="${m.id === state.market ? "on" : ""}" aria-pressed="${m.id === state.market}">${m.id === "perp" ? "Perps" : "rTokens"}</button>`).join("");
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.dataset.market === state.market) return;
    state.market = b.dataset.market;
    state.picked = false;
    el.querySelectorAll("button").forEach((x) => {
      const on = x.dataset.market === state.market;
      x.classList.toggle("on", on);
      x.setAttribute("aria-pressed", String(on));
    });
    history.replaceState(null, "", state.market === "perp" ? "?market=perp" : "/");
    load(FIRST[state.market]);
    loadBoard();
    loadLive();
  });
}

/* ---------- the lead numbers ---------- */
function renderLead(record, meta) {
  if (!record?.byBand) return;
  const big = record.byBand["over 1.3"];
  const small = record.byBand["under 0.3"];
  if (big) {
    const undone = Math.round(big.happened * big.n);
    $("s-big").textContent = `${undone} of ${big.n}`;
    $("s-big-t").textContent = "huge moves (over 1.3× a normal day) were undone by the bell";
  }
  if (small) {
    $("s-small").textContent = pc(small.happened);
    $("s-small-t").textContent = "of tiny moves (under 0.3× a normal day) were undone";
  }
  $("eyebrow").textContent = `What ${record.quoted.toLocaleString()} calls made before the bell taught us`;
  $("leadsub").textContent =
    `Every night from ${record.from} to ${record.to}, Almanac gave its odds for each Bitget stock token before New York opened, ` +
    `then checked itself at the bell. The size of the move, for that particular stock, told us more than anything else.`;
  void meta;
}

/* ---------- the featured card ---------- */
function chart(el, path, close) {
  if (!path?.length || close == null) {
    el.innerHTML = `<div class="empty">No price path since the close yet.</div>`;
    return;
  }
  const W = 520, H = 250, PADR = 54, PADB = 22;
  const ts = path.map((p) => p[0]), ps = path.map((p) => p[1]).concat(close);
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  let lo = Math.min(...ps), hi = Math.max(...ps);
  const pad = (hi - lo || close * 0.002) * 0.18;
  lo -= pad; hi += pad;
  const x = (t) => ((t - t0) / (t1 - t0 || 1)) * (W - PADR);
  const y = (p) => (1 - (p - lo) / (hi - lo)) * (H - PADB);
  const d = path.map((p, i) => `${i ? "L" : "M"}${x(p[0]).toFixed(1)} ${y(p[1]).toFixed(1)}`).join(" ");
  const last = path[path.length - 1];
  const move = last[1] / close - 1;
  const area = `${d} L${x(last[0]).toFixed(1)} ${H - PADB} L0 ${H - PADB} Z`;
  const hhmm = (t) => new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" });
  const ticks = [0, 0.33, 0.66, 1].map((f) => t0 + f * (t1 - t0));
  const grid = [0.2, 0.45, 0.7, 0.95].map((f) => `<line x1="0" x2="${W - PADR}" y1="${(f * (H - PADB)).toFixed(1)}" y2="${(f * (H - PADB)).toFixed(1)}" stroke="var(--line)" stroke-width="1"/>`).join("");
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Price since the close, ${sg(move)}">
    <defs><linearGradient id="fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".18"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
    ${grid}
    <line x1="0" x2="${W - PADR}" y1="${y(close).toFixed(1)}" y2="${y(close).toFixed(1)}" stroke="var(--line-2)" stroke-width="1.5" stroke-dasharray="5 5"/>
    <path d="${area}" fill="url(#fill)"/>
    <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="9" fill="var(--accent)" opacity=".2"/>
    <circle cx="${x(last[0]).toFixed(1)}" cy="${y(last[1]).toFixed(1)}" r="4.5" fill="var(--accent)"/>
    <g font-family="Figtree, sans-serif" font-size="12" fill="var(--muted)">
      <text x="${W - PADR + 8}" y="${(y(close) + 4).toFixed(1)}">close</text>
      <text x="${W - PADR + 8}" y="${(y(last[1]) + 4).toFixed(1)}" fill="var(--ink-2)" font-weight="700">${sg(move, 1)}</text>
      ${ticks.map((t, i) => `<text x="${x(t).toFixed(1)}" y="${H - 4}" text-anchor="${i === 0 ? "start" : i === 3 ? "end" : "middle"}">${hhmm(t)}</text>`).join("")}
    </g></svg>`;
}

function renderReading(d) {
  renderMarkets(d.markets);
  renderLead(d.record, d.meta);
  renderRecord(d.record);
  clock(d);
  if (d.error) {
    $("f-title").textContent = d.error;
    return;
  }

  const n = d.night || {}, r = d.reading || {}, s = r.stat;
  const name = d.display || d.symbol;
  const up = (n.move ?? 0) > 0;
  $("f-tk").outerHTML = face(name).replace('class="tk"', 'class="tk" id="f-tk"');
  $("f-meta").textContent = `Bitget ${state.market === "perp" ? "stock perpetual" : "stock token"} · ${n.isWeekend ? "weekend" : "overnight"} move · since the ${n.session || ""} close`;
  $("f-title").innerHTML = n.move == null
    ? `${esc(name)}: no move measured yet`
    : `${esc(name)} <span class="${up ? "up" : "dn"}">${sg(n.move)}</span> ${d.marketOpen ? "while New York slept." : "overnight."} ${d.marketOpen ? "Did it hold?" : "Still there at 10:30?"}`;

  if (s?.n) {
    const undoneN = Math.round(s.undonePct * s.n);
    $("o-stand").textContent = pc(1 - s.undonePct);
    $("o-undo").textContent = pc(s.undonePct);
    $("o-stand-c").textContent = `${s.n - undoneN} of ${s.n} stood`;
    $("o-undo-c").textContent = `${undoneN} of ${s.n} undone`;
    $("f-verdict").textContent =
      `${n.ratio != null ? `This move is ${n.ratio.toFixed(2)}× what ${name} covers on a normal day. ` : ""}` +
      `${r.verdict?.label || ""}. A night picked at random is undone ${pc(d.baseline)} of the time. Almanac never says which way it goes next.`;
  } else {
    $("o-stand").textContent = $("o-undo").textContent = "—";
    $("o-stand-c").textContent = $("o-undo-c").textContent = "no odds";
    $("f-verdict").textContent = `${r.verdict?.label || "Not enough measured nights to give odds"}.`;
  }

  $("c-name").textContent = name;
  chart($("chart"), d.path, n.closePrice);
  $("c-right").textContent = d.marketOpen ? "New York is open: this was last night's move" : "Odds called before the bell, checked at 10:30";
  document.title = n.move == null ? "Almanac" : `${name} ${sg(n.move, 1)} · Almanac`;
}

/* ---------- context cards ---------- */
async function loadCompany(symbol) {
  const el = $("w-company").querySelector(".wt");
  el.textContent = "Checking the company calendar…";
  let d;
  try { d = await fetch(`/api/company?symbol=${encodeURIComponent(symbol)}&market=${state.market}`).then((x) => x.json()); }
  catch { d = null; }
  if (symbol !== state.symbol) return;
  const c = d?.company;
  if (!c) { el.textContent = "Bitget's data server did not answer for this one."; return; }
  const bits = [];
  if (c.quote?.last != null) bits.push(`${c.ticker} last traded at $${c.quote.last}${c.quote.changePct != null ? ` (${c.quote.changePct > 0 ? "+" : ""}${Number(c.quote.changePct).toFixed(2)}% that day)` : ""}.`);
  const e = c.events || {};
  const when = (days) => (days === 0 ? "today" : days > 0 ? `in ${days} day${days === 1 ? "" : "s"}` : `${-days} day${days === -1 ? "" : "s"} ago`);
  if (e.earnings) bits.push(`Results ${e.earnings.expected ? "due" : "reported"} ${when(e.earnings.days)}.`);
  if (e.exDividend) bits.push(`Ex-dividend ${when(e.exDividend.days)}.`);
  if (e.split) bits.push(`Share split ${when(e.split.days)}.`);
  el.textContent = bits.length ? bits.join(" ") : `No earnings, dividend or split near tonight for ${c.ticker}.`;
}

async function loadMood() {
  const el = $("w-mood").querySelector(".wt");
  let d;
  try { d = await fetch("/api/mood").then((x) => x.json()); } catch { d = null; }
  const m = d?.mood;
  if (!m) { el.textContent = "bitget-signal did not answer just now."; return; }
  el.textContent = `Bitcoin is ${m.words} on the 4-hour chart` +
    `${m.rsiSignal && m.rsiSignal !== "neutral" ? `, and ${m.rsiSignal} (RSI ${Math.round(m.rsi)})` : ""}. ` +
    `Context only: crypto's mood does not change the odds above.`;
}

/* ---------- report card ---------- */
const BAND_NAMES = { "under 0.3": "Tiny", "0.3-0.5": "Small", "0.5-0.8": "Medium", "0.8-1.3": "Large", "over 1.3": "Huge" };
function renderRecord(rec) {
  if (!rec?.byBand || $("rc").childElementCount) return;
  $("rc").innerHTML = `<span class="h">Move size</span><span class="h">We said undone</span><span class="h">Really undone</span>` +
    Object.entries(rec.byBand).map(([b, v]) =>
      `<span>${BAND_NAMES[b] || b}</span><span class="n">${pc(v.said)}</span><span class="n">${pc(v.happened)}</span>`).join("");
  const close = Object.values(rec.byBand).filter((v) => Math.abs(v.gap) <= 0.02).length;
  $("rcfoot").textContent = `${rec.quoted.toLocaleString()} calls, ${rec.from} to ${rec.to}, each made before the bell using only earlier nights. Within 2 points on ${close} of 5 sizes, within ${Math.ceil(100 * rec.worstGap)} on all.`;
}

/* ---------- the board ---------- */
function renderBoard(b) {
  const grid = $("grid");
  if (b.error || !b.rows?.length) {
    grid.innerHTML = `<div class="card empty">${esc(b.error || "No stock token has moved enough to read yet.")}</div>`;
    return;
  }
  const rows = b.rows.filter((r) => !state.hideSmall || Math.abs(r.move) >= 0.005);
  const shown = state.showAll ? rows : rows.slice(0, SHOWN);
  grid.innerHTML = shown.map((r) => {
    const band = b.bands?.[r.band];
    const call = callFor(band?.n >= 25 ? band.undonePct : null);
    const stands = band ? 1 - band.undonePct : null;
    return `<button type="button" class="m${r.symbol === state.symbol ? " on" : ""}" data-sym="${r.symbol}">
      <div class="mh">${face(r.display)}
        <div class="nm"><b>${esc(r.display)} <span class="${r.move > 0 ? "good" : "bad"}">${sg(r.move)}</span></b><small>${r.ratio.toFixed(2)}× a normal day</small></div>
        <div class="gauge" style="color:var(--${call.cls === "acc" ? "accent" : call.cls === "dim" ? "muted" : call.cls})">${pc(stands)}<small>stands</small></div>
      </div>
      <div class="call chip ${call.cls}">${call.text}</div>
      <div class="mf"><span>${band?.n ?? "—"} nights like it</span><span>${pc(band?.undonePct)} undone</span></div>
    </button>`;
  }).join("") || `<div class="card empty">Every move tonight is under 0.5%. Untick the box to see them.</div>`;
  $("more").hidden = state.showAll || rows.length <= SHOWN;
  $("more").textContent = `Show all ${rows.length} tokens`;
  $("sorted").textContent = `${b.answered} of ${b.asked} tokens answered. Sorted by how unusual the move is for that stock, not by its size.`;

  const hot = [...b.rows].sort((a, c) => Math.abs(c.move) - Math.abs(a.move)).slice(0, 5);
  $("hot").innerHTML = hot.map((r, i) =>
    `<li><span class="n">${i + 1}</span><button type="button" data-sym="${r.symbol}">${esc(r.display)}</button><span class="chip ${r.move > 0 ? "good" : "bad"}">${sg(r.move)}</span></li>`).join("");

  $("tokens").innerHTML = b.rows.map((r) => `<option value="${esc(r.display)}"></option>`).join("");
}

function pickFrom(e) {
  const el = e.target.closest("[data-sym]");
  if (!el) return;
  state.picked = true;
  load(el.dataset.sym);
  $("tonight").scrollIntoView({ behavior: "smooth", block: "start" });
}
$("grid").addEventListener("click", pickFrom);
$("hot").addEventListener("click", pickFrom);
$("more").addEventListener("click", () => { state.showAll = true; renderBoard(state.board); });
$("hidesmall").addEventListener("change", (e) => { state.hideSmall = e.target.checked; if (state.board) renderBoard(state.board); });

$("searchform").addEventListener("submit", (e) => {
  e.preventDefault();
  const want = $("search").value.trim().toUpperCase().replace(/^R(?=[A-Z])/, "");
  const row = state.board?.rows?.find((r) => bare(r.display).toUpperCase() === want);
  if (row) { state.picked = true; load(row.symbol); $("search").value = ""; }
  else { $("q").value = $("search").value; ask($("search").value); }
});

/* ---------- clock ---------- */
let ticker = null;
function clock(d) {
  const el = $("clock");
  const c = d?.clock;
  if (!c) return;
  const skew = c.now - Date.now();
  const spell = (ms) => {
    const m = Math.max(0, Math.floor(ms / 60000));
    return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
  };
  const tick = () => {
    const now = Date.now() + skew;
    const open = now >= c.bellAt && now < c.nextCloseAt;
    const left = (open ? c.nextCloseAt : c.bellAt) - now;
    el.textContent = left > 0
      ? `New York ${open ? "open" : "shut"} · ${open ? "closes" : "opens"} in ${spell(left)}`
      : "Waiting for the next bell";
    el.style.color = open ? "var(--good)" : "var(--warn)";
  };
  tick();
  clearInterval(ticker);
  ticker = setInterval(tick, 20_000);
}

/* ---------- live record ---------- */
async function loadLive() {
  let d;
  try { d = await fetch(`/api/live?market=${state.market}`).then((x) => x.json()); } catch { return; }
  const panel = $("live");
  if (!d.totals) { panel.hidden = true; return; }
  panel.hidden = false;
  const t = d.totals;
  const latest = d.nights[0];
  $("livebody").innerHTML = `<p class="small">${esc(d.note)}</p><div class="lr">
    <div><b>${t.nights}</b><span>nights settled</span></div>
    <div><b>${t.calls}</b><span>calls locked before the bell</span></div>
    <div><b>${pc(t.itSaid)}</b><span>it said would be undone</span></div>
    <div><b>${pc(t.itHappened)}</b><span>were undone</span></div>
    <div><b>${esc(latest?.reopens || "—")}</b><span>latest bell${latest?.settled ? "" : ", waiting to settle"}</span></div></div>`;
}

/* ---------- ask ---------- */
let askSeq = 0;
async function ask(question) {
  const box = $("answer");
  box.hidden = false;
  $("a-src").textContent = "Reading the market…";
  $("a-text").textContent = "";
  const mine = ++askSeq;
  const post = async (body) => {
    try {
      const raw = await fetch("/api/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((x) => x.text());
      return JSON.parse(raw);
    } catch { return null; }
  };
  const show = (r, pending) => {
    if (mine !== askSeq || !r) return;
    const model = r.wrote && r.wrote !== "the desk";
    $("a-src").textContent = pending ? "Almanac's own answer · asking Qwen on Bitget's endpoint…"
      : model ? `Qwen (${r.wrote}) on Bitget's endpoint · every number checked against the desk` : `Almanac's own answer${r.note ? ` · ${r.note}` : ""}`;
    $("a-text").textContent = r.answer || r.error || "No answer.";
  };
  // The desk answers in about a second; the model is asked the same question
  // and swapped in only if it arrives and its numbers match.
  const base = { question, symbol: state.symbol, market: state.market };
  show(await post({ ...base, fast: true }), true);
  const full = await post(base);
  if (full) show(full, false);
  else if (mine === askSeq) $("a-src").textContent = "Almanac's own answer · Qwen did not come back in time";
}
$("askform").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("q").value.trim();
  if (q) ask(q);
});

/* ---------- agents ---------- */
$("mcpcmd").textContent = `claude mcp add --transport http almanac ${location.origin}/api/mcp`;
$("copymcp").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("mcpcmd").textContent); $("copymcp").textContent = "Copied"; }
  catch { $("copymcp").textContent = "Select and copy the line above"; }
  setTimeout(() => { $("copymcp").textContent = "Copy command"; }, 2000);
});

/* ---------- load ---------- */
async function load(symbol) {
  state.symbol = symbol;
  let r;
  try { r = await fetch(`/api/reading?symbol=${encodeURIComponent(symbol)}&market=${state.market}`).then((x) => x.json()); }
  catch { $("f-title").textContent = "The reading did not come back. Refresh to try again."; return; }
  if (symbol !== state.symbol) return;
  state.reading = r;
  state.symbol = r.symbol || symbol;
  renderReading(r);
  loadCompany(state.symbol);
  if (state.board) renderBoard(state.board);
}

async function loadBoard() {
  let b;
  try { b = await fetch(`/api/board?market=${state.market}`).then((x) => x.json()); }
  catch { $("grid").innerHTML = `<div class="card empty">Bitget did not answer. Refresh to try again.</div>`; return; }
  renderMarkets(b.markets);
  state.board = b;
  renderBoard(b);
  // Open on the most unusual move of the night, unless the reader chose one.
  if (!state.picked && !asked.symbol && b.rows?.length) {
    state.picked = true;
    if (b.rows[0].symbol !== state.symbol) load(b.rows[0].symbol);
  }
}

$("foot").innerHTML = `<span>Almanac counts nights; it does not predict direction, and it is not advice.</span>
  <a href="/method.html">How it works</a><a href="/api/mcp">MCP server</a><a href="https://github.com/imprint-hash/almanac">Source</a>
  <span>Data: Bitget public market data · Bitget MCP · bitget-signal · Qwen on Bitget's endpoint</span>`;

load(asked.symbol || FIRST[state.market]);
loadBoard();
loadMood();
loadLive();
setInterval(() => { if (state.symbol) load(state.symbol); }, 60_000);
setInterval(loadBoard, 180_000);
