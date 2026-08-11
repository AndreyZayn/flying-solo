import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContract } from "./src/contract-engine.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const registryPromise = fs.readFile(path.join(rootDir, "config/fashion-week-registry.json"), "utf8").then(JSON.parse);
const placeholderRegistryPromise = fs.readFile(
  path.join(rootDir, "config/fashion-week-placeholders.json"),
  "utf8",
).then(JSON.parse).then(validatePlaceholderRegistry);
const templatePromise = fs.readFile(path.join(rootDir, "templates/fashion-week.md"), "utf8");
const staticFiles = new Map([
  ["/", [path.join(rootDir, "public/index.html"), "text/html; charset=utf-8"]],
  ["/index.html", [path.join(rootDir, "public/index.html"), "text/html; charset=utf-8"]],
  ["/styles.css", [path.join(rootDir, "public/styles.css"), "text/css; charset=utf-8"]],
  ["/app.js", [path.join(rootDir, "public/app.js"), "text/javascript; charset=utf-8"]],
  ["/markdown-template.mjs", [path.join(rootDir, "public/markdown-template.mjs"), "text/javascript; charset=utf-8"]],
  ["/editor-sizing.mjs", [path.join(rootDir, "public/editor-sizing.mjs"), "text/javascript; charset=utf-8"]],
  ["/placeholder-library.mjs", [path.join(rootDir, "public/placeholder-library.mjs"), "text/javascript; charset=utf-8"]],
  ["/schedule.mjs", [path.join(rootDir, "src/schedule.mjs"), "text/javascript; charset=utf-8"]],
  ["/vendor/toastui-editor.min.css", [path.join(rootDir, "node_modules/@toast-ui/editor/dist/toastui-editor.css"), "text/css; charset=utf-8"]],
  ["/vendor/toastui-editor-all.min.js", [path.join(rootDir, "public/vendor/toastui-editor-all.min.js"), "text/javascript; charset=utf-8"]],
  ["/vendor/marked.umd.js", [path.join(rootDir, "node_modules/marked/lib/marked.umd.js"), "text/javascript; charset=utf-8"]],
  ["/vendor/purify.min.js", [path.join(rootDir, "node_modules/dompurify/dist/purify.min.js"), "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, value) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function validatePlaceholderRegistry(placeholders) {
  if (!Array.isArray(placeholders) || placeholders.length === 0) {
    throw new Error("Placeholder registry must be a non-empty array.");
  }
  const keys = new Set();
  for (const placeholder of placeholders) {
    if (!placeholder || !/^[A-Z0-9_]+$/.test(placeholder.key ?? "")) {
      throw new Error("Every placeholder must have an uppercase key.");
    }
    if (keys.has(placeholder.key)) throw new Error(`Duplicate placeholder key: ${placeholder.key}.`);
    if (!["value", "condition"].includes(placeholder.type)) {
      throw new Error(`Unsupported placeholder type: ${placeholder.type}.`);
    }
    for (const property of ["label", "description", "group"]) {
      if (!String(placeholder[property] ?? "").trim()) {
        throw new Error(`Placeholder ${placeholder.key} requires ${property}.`);
      }
    }
    keys.add(placeholder.key);
  }
  return placeholders;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function handleRequest(request, response) {
  const url = new URL(request.url, "http://localhost");
  if (request.method === "GET" && url.pathname === "/api/config") {
    return sendJson(response, 200, await registryPromise);
  }
  if (request.method === "GET" && url.pathname === "/api/placeholders") {
    return sendJson(response, 200, await placeholderRegistryPromise);
  }
  if (request.method === "GET" && url.pathname === "/api/template") {
    const template = await templatePromise;
    response.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
    return response.end(template);
  }
  if (request.method === "POST" && url.pathname === "/api/generate") {
    try {
      const [registry, placeholderRegistry, input] = await Promise.all([
        registryPromise,
        placeholderRegistryPromise,
        readJson(request),
      ]);
      const result = buildContract(input, registry);
      const definedKeys = new Set(placeholderRegistry.map((placeholder) => placeholder.key));
      const generatedKeys = Object.keys(result.placeholders);
      const missing = generatedKeys.filter((key) => !definedKeys.has(key));
      const unused = [...definedKeys].filter((key) => !(key in result.placeholders));
      if (missing.length || unused.length) {
        throw new Error(`Placeholder registry mismatch: ${[...missing, ...unused].join(", ")}.`);
      }
      return sendJson(response, 200, result);
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (request.method === "GET" && staticFiles.has(url.pathname)) {
    const [filename, contentType] = staticFiles.get(url.pathname);
    const contents = await fs.readFile(filename);
    response.writeHead(200, { "content-type": contentType });
    return response.end(contents);
  }
  sendJson(response, 404, { error: "Not found." });
}

export function createAppServer() {
  return http.createServer((request, response) => {
    handleRequest(request, response).catch((error) => sendJson(response, 500, { error: error.message }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log(`Fashion Week Contract Builder: http://localhost:${port}`);
  });
}
