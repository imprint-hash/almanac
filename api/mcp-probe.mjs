/** Temporary: discover what bitget-mcp-server offers, from a host that can reach it. */
import { connect, tools } from "../src/mcp.js";

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
  } catch (e) {
    out.threw = `${e.name}: ${e.message}`;
  }
  out.ms = Date.now() - t0;
  res.status(200).json(out);
}
