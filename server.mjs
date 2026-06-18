import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, "dist");
const port = Number(process.env.PORT || 4179);
const maxBodyBytes = 24 * 1024 * 1024;

const loadEnvFile = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [rawKey, ...rawValue] = trimmed.split("=");
    const key = rawKey.trim();
    const value = rawValue.join("=").trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
};

loadEnvFile(path.join(__dirname, ".env.local"));
loadEnvFile(path.join(__dirname, ".env"));

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.API_KEY || "";
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
};

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBodyBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const addResponseText = (response) => {
  const text = response?.text || response?.candidates?.[0]?.content?.parts?.map((part) => part.text).filter(Boolean).join("\n") || "";
  return { ...response, text };
};

const serveStatic = (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const safePath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(distDir, safePath);

  if (!filePath.startsWith(distDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }
  if (!fs.existsSync(filePath)) {
    filePath = path.join(distDir, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(filePath).pipe(res);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && url.pathname === "/api/gemini/health") {
    sendJson(res, 200, { ok: true, hasKey: Boolean(apiKey) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gemini/generate-content") {
    if (!ai) {
      sendJson(res, 501, { error: "GEMINI_API_KEY is not configured on the server." });
      return;
    }
    try {
      const payload = JSON.parse(await readBody(req));
      const response = await ai.models.generateContent(payload);
      sendJson(res, 200, addResponseText(response));
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Gemini generateContent failed." });
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/gemini/generate-images") {
    if (!ai) {
      sendJson(res, 501, { error: "GEMINI_API_KEY is not configured on the server." });
      return;
    }
    try {
      const payload = JSON.parse(await readBody(req));
      const response = await ai.models.generateImages(payload);
      sendJson(res, 200, response);
    } catch (error) {
      sendJson(res, 500, { error: error instanceof Error ? error.message : "Gemini generateImages failed." });
    }
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Plaque Store AI listening on http://127.0.0.1:${port}; Gemini key configured: ${Boolean(apiKey)}`);
});
