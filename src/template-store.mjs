import fs from "node:fs/promises";
import path from "node:path";

import { resolveMarkdownTemplate } from "../public/markdown-template.mjs";

const TEMPLATE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

async function writeJsonAtomic(filename, value) {
  await writeAtomic(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function validateDefinitions(definitions) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    throw new Error("Contract template registry must be a non-empty array.");
  }
  const ids = new Set();
  for (const definition of definitions) {
    if (!definition?.id || ids.has(definition.id) || !definition.label || !definition.templateFile || !definition.placeholderRegistryFile || !definition.titleTemplate) {
      throw new Error("Every contract template requires a unique id, label, template file, placeholder registry, and title template.");
    }
    if (!TEMPLATE_ID_PATTERN.test(definition.id)) throw new Error("Template ids must use lowercase kebab-case.");
    ids.add(definition.id);
  }
  return definitions;
}

function emptyState() {
  return { schemaVersion: 1, builtIns: {}, customTemplates: [] };
}

function validateState(state) {
  if (!state || state.schemaVersion !== 1 || typeof state.builtIns !== "object" || !Array.isArray(state.customTemplates)) {
    throw new Error("Template library state is invalid.");
  }
  const ids = new Set();
  for (const template of state.customTemplates) {
    if (!template || !TEMPLATE_ID_PATTERN.test(template.id ?? "") || ids.has(template.id)
      || !String(template.label ?? "").trim() || !TEMPLATE_ID_PATTERN.test(template.sourceTemplateId ?? "")
      || !String(template.templateFile ?? "").trim() || !String(template.titleTemplate ?? "").trim()
      || !Number.isSafeInteger(template.version) || template.version < 1) {
      throw new Error("Custom template library state is invalid.");
    }
    ids.add(template.id);
  }
  return state;
}

function publicTemplate(template) {
  return {
    id: template.id,
    label: template.label,
    family: template.family,
    version: template.version,
    builtIn: template.builtIn,
  };
}

function normalizedContent(content, template) {
  if (typeof content === "string") {
    return { markdown: content, titleTemplate: template.titleTemplate };
  }
  return {
    markdown: String(content?.markdown ?? ""),
    titleTemplate: String(content?.titleTemplate ?? ""),
  };
}

function historyDirectory(template) {
  const parent = path.dirname(template.templateFile);
  return `/${parent}/history/${template.id}`.replace(/^\//, "");
}

function historyTimestamp(filename) {
  const matched = filename.replace(/\.md$/, "").match(/^(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2}(?:\.\d+)?Z)$/);
  if (!matched) return filename;
  return `${matched[1]}:${matched[2]}:${matched[3]}`;
}

function templateIdFromLabel(label, existingIds) {
  const base = String(label ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!TEMPLATE_ID_PATTERN.test(base)) throw new Error("Use a template name with at least one letter or number.");
  let candidate = base;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export function createTemplateStore({ rootDir, registryPath, statePath = path.join(rootDir, "data/runtime/template-library.json"), now = () => new Date().toISOString() }) {
  let mutation = Promise.resolve();

  function locked(operation) {
    const next = mutation.then(operation, operation);
    mutation = next.catch(() => {});
    return next;
  }

  async function definitions() {
    return validateDefinitions(JSON.parse(await fs.readFile(registryPath, "utf8")));
  }

  async function state() {
    try {
      return validateState(JSON.parse(await fs.readFile(statePath, "utf8")));
    } catch (error) {
      if (error?.code === "ENOENT") return emptyState();
      throw error;
    }
  }

  async function legacyHistory(template) {
    const directory = safePath(rootDir, historyDirectory(template));
    try {
      const entries = (await fs.readdir(directory)).filter((entry) => entry.endsWith(".md")).sort();
      return Promise.all(entries.map(async (entry, index) => ({
        version: index + 1,
        savedAt: historyTimestamp(entry),
        markdown: await fs.readFile(path.join(directory, entry), "utf8"),
        titleTemplate: template.titleTemplate,
      })));
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async function initialVersion(template, saved) {
    if (Number.isSafeInteger(saved.version) && saved.version > 0) return saved.version;
    return (await legacyHistory(template)).length + 1;
  }

  async function definition(templateId) {
    const [registered, library] = await Promise.all([definitions(), state()]);
    const standard = registered.find((candidate) => candidate.id === templateId);
    if (standard) {
      const saved = library.builtIns[templateId] ?? {};
      return {
        ...standard,
        titleTemplate: saved.titleTemplate ?? standard.titleTemplate,
        version: await initialVersion(standard, saved),
        builtIn: true,
      };
    }
    const custom = library.customTemplates.find((candidate) => candidate.id === templateId);
    if (!custom) throw new Error(`Unknown contract template: ${templateId}.`);
    const source = registered.find((candidate) => candidate.id === custom.sourceTemplateId);
    if (!source) throw new Error(`Custom template ${templateId} has an unsupported contract type.`);
    return {
      ...source,
      ...custom,
      family: source.family,
      requiredHeading: source.requiredHeading,
      requiredPlaceholders: source.requiredPlaceholders,
      placeholderRegistryFile: source.placeholderRegistryFile,
      builtIn: false,
    };
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

  async function validateTitleTemplate(template, titleTemplate) {
    const normalized = String(titleTemplate ?? "").trim();
    if (!normalized) throw new Error("Contract title cannot be empty.");
    if (/\r|\n/.test(normalized)) throw new Error("Contract title must stay on one line.");
    const placeholders = JSON.parse(await fs.readFile(
      safePath(rootDir, template.placeholderRegistryFile),
      "utf8",
    ));
    const context = Object.fromEntries(placeholders.map((placeholder) => [
      placeholder.key,
      placeholder.type === "condition" ? true : "value",
    ]));
    resolveMarkdownTemplate(normalized, context);
  }

  async function get(templateId) {
    const template = await definition(templateId);
    return {
      ...publicTemplate(template),
      markdown: await fs.readFile(safePath(rootDir, template.templateFile), "utf8"),
      titleTemplate: template.titleTemplate,
    };
  }

  async function list() {
    const [registered, library] = await Promise.all([definitions(), state()]);
    const builtIns = await Promise.all(registered.map(async (template) => {
      const saved = library.builtIns[template.id] ?? {};
      return publicTemplate({
        ...template,
        version: await initialVersion(template, saved),
        builtIn: true,
      });
    }));
    const custom = library.customTemplates.map((template) => {
      const source = registered.find((candidate) => candidate.id === template.sourceTemplateId);
      return publicTemplate({ ...template, family: source.family, builtIn: false });
    });
    return [...builtIns, ...custom];
  }

  async function placeholders(templateId) {
    const template = await definition(templateId);
    return JSON.parse(await fs.readFile(safePath(rootDir, template.placeholderRegistryFile), "utf8"));
  }

  async function history(templateId) {
    const template = await definition(templateId);
    const directory = safePath(rootDir, historyDirectory(template));
    try {
      const entries = await fs.readdir(directory);
      const snapshots = await Promise.all(entries.filter((entry) => entry.endsWith(".json")).map(async (entry) => {
        const snapshot = JSON.parse(await fs.readFile(path.join(directory, entry), "utf8"));
        if (!Number.isSafeInteger(snapshot.version) || snapshot.version < 1 || !snapshot.savedAt || typeof snapshot.markdown !== "string" || typeof snapshot.titleTemplate !== "string") {
          throw new Error("Template history snapshot is invalid.");
        }
        return snapshot;
      }));
      return [...await legacyHistory(template), ...snapshots].sort((left, right) => right.version - left.version);
    } catch (error) {
      if (error?.code === "ENOENT") return legacyHistory(template);
      throw error;
    }
  }

  async function save(templateId, content) {
    return locked(async () => {
      const template = await definition(templateId);
      const next = normalizedContent(content, template);
      await validateMarkdown(template, next.markdown);
      await validateTitleTemplate(template, next.titleTemplate);
      const filename = safePath(rootDir, template.templateFile);
      const previous = {
        version: template.version,
        savedAt: now(),
        markdown: await fs.readFile(filename, "utf8"),
        titleTemplate: template.titleTemplate,
      };
      const historyFile = safePath(rootDir, path.join(
        historyDirectory(template),
        `v${String(previous.version).padStart(3, "0")}-${previous.savedAt.replaceAll(":", "-")}.json`,
      ));
      const library = await state();
      await writeJsonAtomic(historyFile, previous);
      await writeAtomic(filename, next.markdown);
      if (template.builtIn) {
        library.builtIns[template.id] = {
          version: template.version + 1,
          titleTemplate: next.titleTemplate,
          updatedAt: previous.savedAt,
        };
      } else {
        const custom = library.customTemplates.find((candidate) => candidate.id === template.id);
        custom.version = template.version + 1;
        custom.titleTemplate = next.titleTemplate;
        custom.updatedAt = previous.savedAt;
      }
      await writeJsonAtomic(statePath, library);
      return get(templateId);
    });
  }

  async function create({ sourceTemplateId, label }) {
    return locked(async () => {
      const source = await definition(sourceTemplateId);
      if (!source.builtIn) throw new Error("Start a new template from a supported contract type.");
      const normalizedLabel = String(label ?? "").trim();
      if (!normalizedLabel) throw new Error("Name the new template before creating it.");
      const [library, existing] = await Promise.all([state(), list()]);
      const id = templateIdFromLabel(normalizedLabel, new Set(existing.map((template) => template.id)));
      const createdAt = now();
      const templateFile = `data/runtime/templates/${id}.md`;
      library.customTemplates.push({
        id,
        label: normalizedLabel,
        sourceTemplateId: source.id,
        templateFile,
        titleTemplate: source.titleTemplate,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      });
      await writeAtomic(safePath(rootDir, templateFile), await fs.readFile(safePath(rootDir, source.templateFile), "utf8"));
      await writeJsonAtomic(statePath, library);
      return get(id);
    });
  }

  async function restore(templateId, version) {
    const snapshot = (await history(templateId)).find((candidate) => candidate.version === Number(version));
    if (!snapshot) throw new Error(`Template version ${version} is not available.`);
    return save(templateId, snapshot);
  }

  return { list, get, save, create, history, restore, placeholders, definition };
}
