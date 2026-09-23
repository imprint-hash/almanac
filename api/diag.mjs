/** Temporary: what does the model endpoint do when a Vercel function calls it? */
export default async function handler(req, res) {
  const out = {};
  const url = process.env.QWEN_ENDPOINT || "https://hackathon.bitgetops.com/v1/chat/completions";
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${process.env.QWEN_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.QWEN_MODEL || "qwen3.8-max", messages: [{ role: "user", content: "say ready" }], max_tokens: 8 }),
      signal: AbortSignal.timeout(25_000),
    });
    out.status = r.status;
    out.headers = Object.fromEntries([...r.headers].slice(0, 12));
    out.body = (await r.text()).slice(0, 300);
  } catch (e) {
    out.threw = `${e.name}: ${e.message}`;
    out.cause = String(e.cause?.message || e.cause || "").slice(0, 200);
  }
  out.ms = Date.now() - t0;
  out.hasKey = Boolean(process.env.QWEN_API_KEY);
  out.region = process.env.VERCEL_REGION || null;
  res.status(200).json(out);
}
