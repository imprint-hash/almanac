// The "how it is tested" page: draws the web of what TestSprite checks over a
// screenshot of the app, from testing-runs.json, and shows the latest real
// result read from GitHub by /api/tested.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const NS = "http://www.w3.org/2000/svg";
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(name, attrs) {
  const e = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

// Lines grow from the hub one after another, like a crawler spreading out.
function grow(line, delay) {
  const L = line.getTotalLength();
  line.style.strokeDasharray = L;
  line.style.strokeDashoffset = calm ? 0 : L;
  if (!calm) setTimeout(() => { line.style.transition = "stroke-dashoffset .6s ease-out"; line.style.strokeDashoffset = 0; }, delay);
}

function drawWeb(d) {
  const svg = $("web");
  const [hx, hy] = d.hub;
  const lines = el("g", {}), nodes = el("g", {});
  svg.append(lines, nodes);
  d.checked.forEach((c, i) => {
    const l = el("line", { class: "wl", x1: hx, y1: hy, x2: c.at[0], y2: c.at[1] });
    lines.append(l); grow(l, 200 + i * 140);
    const n = el("rect", { class: "wn", x: c.at[0] - 8, y: c.at[1] - 8, width: 16, height: 16, rx: 3 });
    n.append(el("title", {}));
    n.firstChild.textContent = c.what;
    nodes.append(n);
  });
  d.catches.forEach((c, i) => {
    const l = el("line", { class: "cl", x1: hx, y1: hy, x2: c.at[0], y2: c.at[1] });
    lines.append(l); grow(l, 200 + d.checked.length * 140 + i * 260);
    const n = el("circle", { class: "cn", cx: c.at[0], cy: c.at[1], r: 16, tabindex: 0, role: "button", "aria-label": `Run ${c.run}: ${c.caught}` });
    // Red while the line arrives, green once it has: caught, then fixed.
    n.style.fill = "#ff4d5a";
    setTimeout(() => {
      n.style.transition = "fill .4s"; n.style.fill = "";
      l.style.transition = "stroke .4s, stroke-dashoffset .6s ease-out"; l.style.stroke = "#16a35c";
    }, calm ? 0 : 200 + d.checked.length * 140 + i * 260 + 900);
    const open = () => { $("detail").innerHTML = `<span class="run">RUN ${c.run}</span><br><b>Caught:</b> ${esc(c.caught)}<br><strong>Fixed:</strong> ${esc(c.fixed)}`; };
    n.addEventListener("click", open);
    n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    nodes.append(n);
  });
  nodes.append(el("circle", { class: "hub", cx: hx, cy: hy, r: 22 }));
}

function lists(d) {
  $("runs").innerHTML = d.runs.map((r) => {
    const pct = Math.round((100 * r.passed) / d.suite);
    const where = r.pr ? `<a href="https://github.com/imprint-hash/almanac/pull/${r.pr}">${esc(r.against)}</a>` : esc(r.against);
    return `<tr><td>${r.run}<br><small>${esc(r.date)}</small></td><td>${where}</td><td>${r.passed} / ${d.suite}</td><td><div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div></td></tr>`;
  }).join("");
  $("catches").innerHTML = d.catches.map((c) =>
    `<div class="catch"><span class="run">RUN ${c.run}</span><br><b style="color:var(--bad)">✕</b> ${esc(c.caught)}<br><b style="color:var(--good)">✓</b> ${esc(c.fixed)}</div>`).join("");
}

async function latest() {
  let r = null;
  try { r = await fetch("/api/tested").then((x) => x.json()); } catch { r = null; }
  const pill = $("latest");
  const l = r?.latest;
  if (!l) { pill.textContent = r?.error || "GitHub did not answer just now."; return; }
  const when = new Date(l.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  pill.className = `pill${l.state === "success" ? "" : " bad"}`;
  pill.textContent = `Latest TestSprite run: ${l.result}`;
  $("now").insertAdjacentHTML("beforeend",
    `<span>on <a href="https://github.com/imprint-hash/almanac/pull/${l.pr}">PR #${l.pr}</a> · ${esc(when)}</span><a href="${esc(l.report)}">Full report ↗</a>`);
}

fetch("/testing-runs.json").then((x) => x.json()).then((d) => { drawWeb(d); lists(d); }).catch(() => { $("detail").textContent = "The test record did not load. Refresh to try again."; });
latest();
