/**
 * Almanac as an MCP server, so any agent can ask it.
 *
 * Bitget Agent Hub gives an agent Bitget's market data and trading tools. What
 * it cannot give is a measured answer to "will this overnight move still be
 * there at the bell?". This endpoint does: point Claude, Cursor or any MCP
 * client at /api/mcp and the agent gets the same odds the page shows, with the
 * same record behind them.
 *
 * Streamable HTTP, stateless: every POST is one JSON-RPC message and is
 * answered in JSON. No session, no key, and no tool here can place an order.
 */

import { board, reading } from "../src/desk.js";
import { lookup } from "../src/measure.js";
import { facts, compose, symbolIn } from "../src/answer.js";
import { pick } from "./_data.mjs";

const PROTOCOL = "2025-03-26";
const pc = (v) => (v == null ? null : Math.round(1000 * v) / 10);

const MARKET = {
  type: "string",
  enum: ["rtoken", "perp"],
  description: "rtoken = Bitget's tokenised shares (default); perp = the stock perpetuals",
};

const TOOLS = [
  {
    name: "tonight_moves",
    description:
      "Every Bitget stock token moving while its US market is shut, ranked by how unusual the move is for that stock " +
      "(move ÷ its normal daily range), each with how often moves that size were undone by 10:30 New York time.",
    inputSchema: { type: "object", properties: { market: MARKET, limit: { type: "integer", minimum: 1, maximum: 40 } } },
  },
  {
    name: "move_odds",
    description:
      "How often an overnight move like this one on a Bitget stock token was undone by the bell, from measured nights. " +
      "Give a ticker (NVDA, rNVDA). Without move_pct it reads tonight's live move; with move_pct it answers for that move.",
    inputSchema: {
      type: "object",
      properties: {
        symbol: { type: "string", description: "Ticker, e.g. NVDA, rNVDA, TSLA" },
        move_pct: { type: "number", description: "Optional: a move in percent, e.g. -3.4" },
        market: MARKET,
      },
      required: ["symbol"],
    },
  },
  {
    name: "report_card",
    description:
      "Almanac's own record: for every band of move size, the chance it stated before the bell against what then happened, " +
      "across nights it called in advance.",
    inputSchema: { type: "object", properties: { market: MARKET } },
  },
];

function oddsRow(m, r) {
  const read = lookup(m.index, { symbol: r.symbol, move: r.move, normalDay: r.normalDay });
  return {
    token: r.display,
    move_pct: pc(r.move),
    times_normal_day: Math.round(100 * r.ratio) / 100,
    band: read.band ?? null,
    undone_pct: pc(read.stat?.undonePct),
    nights_like_it: read.stat?.n ?? null,
    verdict: read.verdict?.label ?? null,
  };
}

async function run(name, args = {}) {
  const m = pick({ market: args.market });
  const known = Object.keys(m.normals);

  if (name === "tonight_moves") {
    const { rows, asked, answered } = await board(known, m.normals, m.index, { marketId: m.id });
    const limit = Math.min(Math.max(Number(args.limit) || 15, 1), 40);
    return {
      market: m.label,
      tokens_asked: asked,
      tokens_answered: answered,
      undone_at_random_pct: pc(m.index.all.undonePct),
      moves: rows.slice(0, limit).map((r) => oddsRow(m, r)),
      note: "Odds are counts of measured nights, not a forecast of direction.",
    };
  }

  if (name === "move_odds") {
    const symbol = symbolIn(String(args.symbol || ""), known, m.normals);
    if (!symbol) return { error: `Almanac does not carry ${args.symbol} on ${m.label}.`, carried: known.map((s) => m.normals[s]?.display ?? s) };

    if (Number.isFinite(Number(args.move_pct)) && args.move_pct !== null && args.move_pct !== "") {
      const stored = m.normals[symbol];
      const row = oddsRow(m, {
        symbol,
        display: stored?.display ?? symbol,
        move: Number(args.move_pct) / 100,
        normalDay: stored?.normalDay,
        ratio: Math.abs(Number(args.move_pct) / 100) / stored?.normalDay,
      });
      return { ...row, undone_at_random_pct: pc(m.index.all.undonePct), source: "measured nights, no live price" };
    }

    const r = await reading(symbol, m.normals, m.index, { marketId: m.id });
    const f = facts({ ...r, baseline: m.index.all.undonePct, record: m.index.record });
    return {
      token: f.symbol,
      market_open: f.marketOpen,
      move_pct: pc(f.move),
      times_normal_day: f.ratio != null ? Math.round(100 * f.ratio) / 100 : null,
      band: f.band,
      undone_pct: pc(f.undoneInBand),
      nights_like_it: f.nightsInBand,
      undone_at_random_pct: pc(f.undoneAtRandom),
      verdict: f.verdict,
      answer: compose(f),
    };
  }

  if (name === "report_card") {
    const rec = m.index.record;
    return {
      market: m.label,
      nights_called_in_advance: rec.quoted,
      bands: Object.entries(rec.byBand).map(([band, b]) => ({
        band,
        nights: b.n,
        said_undone_pct: pc(b.said),
        really_undone_pct: pc(b.happened),
      })),
      from: rec.from,
      to: rec.to,
    };
  }

  throw Object.assign(new Error(`Unknown tool: ${name}`), { code: -32602 });
}

async function answer(msg) {
  const { id, method, params } = msg || {};
  const ok = (result) => ({ jsonrpc: "2.0", id, result });
  const fail = (code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

  if (method === "initialize") {
    return ok({
      protocolVersion: params?.protocolVersion || PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "almanac", version: "0.2.0" },
      instructions:
        "Almanac answers one question about Bitget stock tokens: will a move made while the US market is shut still " +
        "be there an hour after the bell? Answers are counts of measured nights. It never predicts direction.",
    });
  }
  if (method === "ping") return ok({});
  if (method === "tools/list") return ok({ tools: TOOLS });
  if (method === "tools/call") {
    try {
      const out = await run(params?.name, params?.arguments || {});
      return ok({ content: [{ type: "text", text: JSON.stringify(out) }], isError: Boolean(out?.error) });
    } catch (err) {
      if (err.code === -32602) return fail(-32602, err.message);
      return ok({ content: [{ type: "text", text: `Almanac could not answer: ${err.message}` }], isError: true });
    }
  }
  if (id === undefined) return null; // a notification needs no reply
  return fail(-32601, `Method not found: ${method}`);
}

export default async function handler(req, res) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type, accept, mcp-session-id, mcp-protocol-version");
  res.setHeader("access-control-allow-methods", "POST, GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(200).json({
      name: "almanac",
      transport: "streamable-http",
      how: "POST JSON-RPC here from any MCP client, e.g. `claude mcp add --transport http almanac <this url>`",
      tools: TOOLS.map((t) => t.name),
    });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "null") : req.body;
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(answer))).filter(Boolean);
    return out.length ? res.status(200).json(out) : res.status(202).end();
  }
  const out = await answer(body);
  return out ? res.status(200).json(out) : res.status(202).end();
}
