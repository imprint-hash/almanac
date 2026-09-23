/** Temporary: discover what bitget-mcp-server offers, from a host that can reach it. */
import { connect, tools, call } from "../src/mcp.js";

export default async function handler(req, res) {
  const out = { endpoint: process.env.BITGET_MCP_URL || "https://agent.bitget.com/mcp" };
  const t0 = Date.now();
  try {
    out.server = await connect();
    const list = await tools();
    out.count = list.length;
    out.tools = list.map((t) => ({
      name: t.name,
      description: (t.description || "").slice(0, 150),
      args: Object.keys(t.inputSchema?.properties || {}),
      required: t.inputSchema?.required || [],
    }));
    const q = req.query || {};
    if (q.guide !== undefined) {
      const args = {};
      for (const k of ["category", "subcategory", "keyword"]) if (q[k]) args[k] = q[k];
      out.guide = await call("guide", args);
    }
    if (q.entry) {
      out.query = await call("do_query", { entry_id: q.entry, params: q.params ? JSON.parse(q.params) : {} }, { timeout: 25000 });
    }
  } catch (e) {
    out.threw = `${e.name}: ${e.message}`;
  }
  out.ms = Date.now() - t0;
  res.status(200).json(out);
}
