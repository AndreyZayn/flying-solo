import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildFamilyContract, familyConfig } from "./src/contract-families.mjs";
import { createReviewStore } from "./src/review-store.mjs";
import { createTemplateStore } from "./src/template-store.mjs";
import { importFashionWeekWorkbook } from "./src/workbook-importer.mjs";
import { normalizeEditorMarkdown, resolveMarkdownTemplate } from "./public/markdown-template.mjs";

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const placeholderRegistryPromise = fs.readFile(
  path.join(rootDir, "config/fashion-week-placeholders.json"),
  "utf8",
).then(JSON.parse).then(validatePlaceholderRegistry);
const defaultTemplateStore = createTemplateStore({
  rootDir,
  registryPath: path.join(rootDir, "config/contract-templates.json"),
});
const defaultReviewStore = createReviewStore({
  examplePath: path.join(rootDir, "data/review-queue.example.json"),
  queuePath: path.join(rootDir, "data/runtime/review-queue.json"),
  verifiedContractsDirectory: path.join(rootDir, "data/runtime/verified-contracts"),
});
const staticFiles = new Map([
  ["/", [path.join(rootDir, "public/index.html"), "text/html; charset=utf-8"]],
  ["/index.html", [path.join(rootDir, "public/index.html"), "text/html; charset=utf-8"]],
  ["/styles.css", [path.join(rootDir, "public/styles.css"), "text/css; charset=utf-8"]],
  ["/app.js", [path.join(rootDir, "public/app.js"), "text/javascript; charset=utf-8"]],
  ["/markdown-template.mjs", [path.join(rootDir, "public/markdown-template.mjs"), "text/javascript; charset=utf-8"]],
  ["/editor-sizing.mjs", [path.join(rootDir, "public/editor-sizing.mjs"), "text/javascript; charset=utf-8"]],
  ["/placeholder-library.mjs", [path.join(rootDir, "public/placeholder-library.mjs"), "text/javascript; charset=utf-8"]],
  ["/family-fields.mjs", [path.join(rootDir, "public/family-fields.mjs"), "text/javascript; charset=utf-8"]],
  ["/review-selector.mjs", [path.join(rootDir, "public/review-selector.mjs"), "text/javascript; charset=utf-8"]],
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

async function readBody(request, maximumSize = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maximumSize) throw new Error("Request is too large.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function readJson(request) {
  return JSON.parse((await readBody(request)).toString("utf8") || "{}");
}

function resolveTitleTemplate(titleTemplate, placeholders) {
  const resolved = resolveMarkdownTemplate(String(titleTemplate ?? "").trim(), placeholders).trim();
  if (!resolved) throw new Error("Contract title cannot be empty.");
  if (/\r|\n/.test(resolved)) throw new Error("Contract title must stay on one line.");
  return resolved;
}

async function generatedContract(input, templateId = "fashion-week", templateStore = defaultTemplateStore, requestedTitleTemplate) {
  const template = templateStore.get ? await templateStore.get(templateId) : { family: templateId };
  const [result, placeholderRegistry] = await Promise.all([
    buildFamilyContract(template.family ?? templateId, input),
    templateStore.placeholders ? templateStore.placeholders(templateId) : placeholderRegistryPromise,
  ]);
  const definedKeys = new Set(placeholderRegistry.map((placeholder) => placeholder.key));
  const generatedKeys = Object.keys(result.placeholders);
  const mismatch = [
    ...generatedKeys.filter((key) => !definedKeys.has(key)),
    ...[...definedKeys].filter((key) => !(key in result.placeholders)),
  ];
  if (mismatch.length) throw new Error(`Placeholder registry mismatch: ${mismatch.join(", ")}.`);
  const titleTemplate = requestedTitleTemplate ?? template.titleTemplate;
  return {
    ...result,
    title: titleTemplate ? resolveTitleTemplate(titleTemplate, result.placeholders) : result.title,
    titleTemplate: titleTemplate ?? result.title,
  };
}

async function handleRequest(request, response, { reviewStore, templateStore }) {
  const url = new URL(request.url, "http://localhost");
  if (request.method === "GET" && url.pathname === "/api/config") {
    try {
      const template = await templateStore.get(url.searchParams.get("templateId") ?? "fashion-week");
      return sendJson(response, 200, await familyConfig(template.family ?? template.id));
    } catch (error) {
      return sendJson(response, 404, { error: error.message });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/placeholders") {
    try {
      return sendJson(response, 200, await templateStore.placeholders(url.searchParams.get("templateId") ?? "fashion-week"));
    } catch (error) {
      return sendJson(response, 404, { error: error.message });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/template") {
    const template = (await templateStore.get("fashion-week")).markdown;
    response.writeHead(200, { "content-type": "text/markdown; charset=utf-8" });
    return response.end(template);
  }
  if (request.method === "GET" && url.pathname === "/api/templates") {
    return sendJson(response, 200, await templateStore.list());
  }
  if (request.method === "POST" && url.pathname === "/api/templates") {
    try {
      return sendJson(response, 201, await templateStore.create(await readJson(request)));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  const templateMatch = url.pathname.match(/^\/api\/templates\/([^/]+)$/);
  if (templateMatch && request.method === "GET") {
    try {
      return sendJson(response, 200, await templateStore.get(decodeURIComponent(templateMatch[1])));
    } catch (error) {
      return sendJson(response, 404, { error: error.message });
    }
  }
  if (templateMatch && request.method === "PUT") {
    try {
      return sendJson(response, 200, await templateStore.save(decodeURIComponent(templateMatch[1]), await readJson(request)));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (templateMatch && request.method === "DELETE") {
    try {
      const templateId = decodeURIComponent(templateMatch[1]);
      const queue = await reviewStore.getQueue();
      if (queue.batch?.templateId === templateId) {
        return sendJson(response, 409, { error: "This template is used by the active batch and cannot be deleted." });
      }
      return sendJson(response, 200, await templateStore.remove(templateId));
    } catch (error) {
      return sendJson(response, /Unknown contract template/.test(error.message) ? 404 : 400, { error: error.message });
    }
  }
  if (request.method === "GET" && url.pathname === "/api/review-queue") {
    return sendJson(response, 200, await reviewStore.getQueue());
  }
  if (request.method === "POST" && url.pathname === "/api/import-workbook") {
    try {
      const templateId = url.searchParams.get("templateId") ?? "fashion-week";
      const template = await templateStore.get(templateId);
      if (template.family !== "fashion-week") throw new Error("Workbook import is currently configured for Fashion Week files only.");
      const fileName = request.headers["x-file-name"] || "upload.xlsx";
      if (!/\.xlsx$/i.test(fileName)) throw new Error("Upload an .xlsx workbook.");
      const queue = await importFashionWeekWorkbook(await readBody(request, 10_000_000), { fileName });
      queue.batch.templateId = templateId;
      return sendJson(response, 200, await reviewStore.replaceQueue(queue));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/demo/membership") {
    const templateId = url.searchParams.get("templateId") ?? "membership";
    const template = await templateStore.get(templateId);
    if (template.family !== "membership") return sendJson(response, 400, { error: "Membership demo requires a Membership template." });
    const importedAt = new Date().toISOString();
    const queue = {
      schemaVersion: 1,
      batch: { id: `membership-demo-${importedAt.replace(/[^0-9]/g, "").slice(0, 14)}`, label: "Membership template demo", templateId, importedAt, source: { type: "local-demo", note: "Mock data only" } },
      records: [{ id: "mock-membership-brand", status: "pending", sourceRow: null, importIssues: [], draftMarkdown: null, verifiedAt: null, input: { brand: "Mock Membership Brand", representative: "Mock Representative", recipientEmail: "mock@example.com", packageId: "clothing-store-pr", durationMonths: 6, startDate: "2026-09-01" } }],
    };
    return sendJson(response, 200, await reviewStore.replaceQueue(queue));
  }
  const draftMatch = url.pathname.match(/^\/api\/review-queue\/([^/]+)\/draft$/);
  if (draftMatch && request.method === "PUT") {
    try {
      return sendJson(response, 200, await reviewStore.saveDraft(
        decodeURIComponent(draftMatch[1]),
        await readJson(request),
      ));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  const verifyMatch = url.pathname.match(/^\/api\/review-queue\/([^/]+)\/verify$/);
  if (verifyMatch && request.method === "POST") {
    try {
      const { input, templateMarkdown, templateId = "fashion-week", titleTemplate } = await readJson(request);
      const result = await generatedContract(input, templateId, templateStore, titleTemplate);
      const normalizedTemplate = normalizeEditorMarkdown(templateMarkdown);
      const resolvedMarkdown = resolveMarkdownTemplate(normalizedTemplate, result.placeholders);
      return sendJson(response, 200, await reviewStore.verify(decodeURIComponent(verifyMatch[1]), {
        input,
        templateId,
        title: result.title,
        titleTemplate: result.titleTemplate,
        templateMarkdown: normalizedTemplate,
        resolvedMarkdown,
      }));
    } catch (error) {
      return sendJson(response, 400, { error: error.message });
    }
  }
  if (request.method === "POST" && url.pathname === "/api/generate") {
    try {
      const body = await readJson(request);
      const templateId = body.templateId ?? "fashion-week";
      return sendJson(response, 200, await generatedContract(body.input ?? body, templateId, templateStore, body.titleTemplate));
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

export function createAppServer({ reviewStore = defaultReviewStore, templateStore = defaultTemplateStore } = {}) {
  const ready = reviewStore.initialize();
  return http.createServer((request, response) => {
    ready.then(() => handleRequest(request, response, { reviewStore, templateStore }))
      .catch((error) => sendJson(response, 500, { error: error.message }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 4173);
  createAppServer().listen(port, "127.0.0.1", () => {
    console.log(`Fashion Week Contract Builder: http://localhost:${port}`);
  });
}
