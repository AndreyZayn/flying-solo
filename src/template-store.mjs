import fs from "node:fs/promises";
import path from "node:path";

import { resolveMarkdownTemplate } from "../public/markdown-template.mjs";

function safePath(rootDir, relativePath) {
  const resolved = path.resolve(rootDir, relativePath);
  const root = `${path.resolve(rootDir)}${path.sep}`;
  if (!resolved.startsWith(root)) throw new Error("Template path must stay inside the application directory.");
  return resolved;
}

async function writeAtomic(filename, contents) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, contents, "utf8");
  await fs.rename(temporary, filename);
}

function validateDefinitions(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new Error("Contract template registry must be a non-empty array.");
  }
  const ids = new Set();
  for (const definition of definitions) {
    if (!definition?.id || ids.has(definition.id) || !definition.label || !definition.templateFile || !definition.placeholderRegistryFile) {
      throw new Error("Every contract template requires a unique id, label, template file, and placeholder registry.");
    }
    ids.add(definition.id);
  }
  return definitions;
}

export function createTemplateStore({ rootDir, registryPath, now = () => new Date().toISOString() }) {
  let mutation = Promise.resolve();

  function locked(operation) {
    const next = mutation.then(operation, operation);
    mutation = next.catch(() => {});
    return next;
  }

  async function definitions() {
    return validateDefinitions(JSON.parse(await fs.readFile(registryPath, "utf8")));
  }

  async function definition(templateId) {
    const match = (await definitions()).find((candidate) => candidate.id === templateId);
    if (!match) throw new Error(`Unknown contract template: ${templateId}.`);
    return match;
  }

  async function validateMarkdown(template, markdown) {
    if (!String(markdown ?? "").trim()) throw new Error("Template Markdown cannot be empty.");
    const requiredHeading = template.requiredHeading ?? "EVENT AGREEMENT";
    if (!new RegExp(`^## ${requiredHeading}\\s*$`, "m").test(markdown)) {
      throw new Error(`Template requires a ${requiredHeading} heading.`);
    }
    const placeholders = JSON.parse(await fs.readFile(
      safePath(rootDir, template.placeholderRegistryFile),
      "utf8",
    ));
    const context = Object.fromEntries(placeholders.map((placeholder) => [
      placeholder.key,
      placeholder.type === "condition" ? true : "value",
    ]));
    resolveMarkdownTemplate(markdown, context);
    for (const key of template.requiredPlaceholders ?? []) {
      if (!markdown.includes(`{{${key}}}`)) throw new Error(`Template is missing required placeholder: ${key}.`);
    }
  }

  async function list() {
    return (await definitions()).map(({ id, label, family }) => ({ id, label, family }));
  }

  async function get(templateId) {
    const template = await definition(templateId);
    return {
      id: template.id,
      label: template.label,
      family: template.family,
      markdown: await fs.readFile(safePath(rootDir, template.templateFile), "utf8"),
    };
  }

  async function placeholders(templateId) {
    const template = await definition(templateId);
    return JSON.parse(await fs.readFile(safePath(rootDir, template.placeholderRegistryFile), "utf8"));
  }

  async function save(templateId, markdown) {
    return locked(async () => {
      const template = await definition(templateId);
      const normalized = String(markdown ?? "");
      await validateMarkdown(template, normalized);
      const filename = safePath(rootDir, template.templateFile);
      const previous = await fs.readFile(filename, "utf8");
      const timestamp = now().replaceAll(":", "-");
      const historyFile = safePath(rootDir, `templates/history/${template.id}/${timestamp}.md`);
      await writeAtomic(historyFile, previous);
      await writeAtomic(filename, normalized);
      return get(templateId);
    });
  }

  return { list, get, save, placeholders };
}
