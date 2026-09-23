/**
 * A very small MCP client, enough for one read-only server.
 *
 * Bitget's `bitget-mcp-server` carries what Almanac cannot see anywhere else:
 * the real US share behind the token, its earnings calendar, and its corporate
 * actions. The desk measures the token; this says what was happening to the
 * company while the token drifted.
 *
 * It takes no key. Nothing here can place an order.
 *
 * Streamable HTTP transport: one POST per request, and the reply comes back
 * either as JSON or as an SSE stream with the JSON inside it, depending on the
 * server's mood — so both are parsed.
 */

const ENDPOINT = process.env.BITGET_MCP_URL || "https://agent.bitget.com/mcp";
const PROTOCOL = "2024-11-05";

let session = null;
let nextId = 1;

function parse(body, contentType = "") {
  // An SSE frame is a run of `data:` lines; the last complete one is the reply.
  if (contentType.includes("event-stream") || body.startsWith("event:") || body.includes("\ndata:")) {
    const chunks = body
      .split(/\n\n/)
      .map((block) => block.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join(""))
      .filter(Boolean);
    for (let i = chunks.length - 1; i >= 0; i--) {
      try {
        return JSON.parse(chunks[i]);
      } catch {
        /* keep walking back */
      }
    }
    throw new Error("no JSON payload in the event stream");
  }
  return JSON.parse(body);
}

async function rpc(method, params, { timeout = 15_000 } = {}) {
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (session) headers["mcp-session-id"] = session;

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
    signal: AbortSignal.timeout(timeout),
  });

  const sid = res.headers.get("mcp-session-id");
  if (sid) session = sid;

  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status} ${text.slice(0, 160)}`);
  if (!text.trim()) return null; // notifications answer with nothing

  const body = parse(text, res.headers.get("content-type") || "");
  if (body?.error) throw new Error(`${body.error.code}: ${body.error.message}`);
  return body?.result ?? null;
}

let ready = null;

/** Handshake once per process, then reuse the session. */
export function connect() {
  if (!ready) {
    ready = (async () => {
      const info = await rpc("initialize", {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "almanac", version: "0.1.0" },
      });
      // The spec wants this notification before any tool call.
      await rpc("notifications/initialized", {}).catch(() => {});
      return info;
    })().catch((err) => {
      ready = null; // a failed handshake must not poison every later call
      throw err;
    });
  }
  return ready;
}

export async function tools() {
  await connect();
  const r = await rpc("tools/list", {});
  return r?.tools ?? [];
}

export async function call(name, args = {}, opts) {
  await connect();
  const r = await rpc("tools/call", { name, arguments: args }, opts);
  // Tool results arrive as content blocks; the useful one is usually JSON in text.
  const text = (r?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
  try {
    return { data: JSON.parse(text), raw: text, isError: Boolean(r?.isError) };
  } catch {
    return { data: null, raw: text, isError: Boolean(r?.isError) };
  }
}
