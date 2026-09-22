#!/usr/bin/env node
/** Local stand-in for Vercel: static files from public/, handlers from api/. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const PORT = Number(process.env.PORT || 3000);
const ROOT = new URL("../public/", import.meta.url);
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

const handlers = new Map();
async function handler(name) {
  if (!handlers.has(name)) handlers.set(name, (await import(`../api/${name}.mjs`)).default);
  return handlers.get(name);
}

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  try {
    if (url.pathname.startsWith("/api/")) {
      const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, "");
      const fn = await handler(name);
      req.query = Object.fromEntries(url.searchParams);
      if (req.method === "POST") {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        try { req.body = JSON.parse(Buffer.concat(chunks).toString() || "{}"); } catch { req.body = {}; }
      }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
      return void (await fn(req, res));
    }
    const rel = url.pathname === "/" ? "index.html" : normalize(url.pathname).replace(/^(\.\.[/\\])+/, "").replace(/^\//, "");
    const body = await readFile(new URL(rel, ROOT));
    res.setHeader("content-type", TYPES[extname(rel)] || "application/octet-stream");
    res.end(body);
  } catch (err) {
    res.statusCode = err.code === "ENOENT" ? 404 : 500;
    res.end(err.code === "ENOENT" ? "not found" : String(err.stack || err));
  }
}).listen(PORT, () => console.log(`almanac on http://localhost:${PORT}`));
