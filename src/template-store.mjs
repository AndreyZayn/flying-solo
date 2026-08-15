import fs from "node:fs/promises";
import path from "node:path";

import { resolveMarkdownTemplate } from "../public/markdown-template.mjs";

const TEMPLATE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function safePath(rootDir, runtimeDir, filename) {
  const resolved = path.resolve(rootDir, filename);
  const allowedRoots = [rootDir, runtimeDir].map((directory) => `${path.resolve(directory)}${path.sep}`);
  if (!allowedRoots.some((root) => resolved.startsWith(root))) {
    throw new Error("Template path must stay inside the application or local data directory.");
  }
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
  return { schemaVersion: 2, builtIns: {}, customTemplates: [], deletedBuiltIns: [] };
}

function validateState(state) {
  if (!state || ![1, 2].includes(state.schemaVersion) || typeof state.builtIns !== "object" || !Array.isArray(state.customTemplates)
    || (state.deletedBuiltIns != null && !Array.isArray(state.deletedBuiltIns))) {
    throw new Error("Template library state is invalid.");
  }
  const deletedBuiltIns = state.deletedBuiltIns ?? [];
  if (new Set(deletedBuiltIns).size !== deletedBuiltIns.length
    || deletedBuiltIns.some((templateId) => !TEMPLATE_ID_PATTERN.test(templateId))) {
    throw new Error("Template library state is invalid.");
  }
  const ids = new Set();
  for (const template of state.customTemplates) {
    if (!template || !TEMPLATE_ID_PATTERN.test(template.id ?? "") || ids.has(template.id)
      || !String(template.label ?? "").trim() || !TEMPLATE_ID_PATTERN.test(template.sourceTemplateId ?? "")
      || !String(template.templateFile ?? "").trim() || !String(template.titleTemplate ?? "").trim()) {
      throw new Error("Custom template library state is invalid.");
    }
    ids.add(template.id);
  }
  return {
    ...state,
    schemaVersion: 2,
    customTemplates: state.customTemplates.map(({ version, ...template }) => template),
    deletedBuiltIns,
  };
}

function publicTemplate(template) {
  return {
    id: template.id,
    label: template.label,
    family: template.family,
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

export function createTemplateStore({
  rootDir,
  registryPath,
  runtimeDir = path.join(rootDir, "data/runtime"),
  statePath = path.join(runtimeDir, "template-library.json"),
  now = () => new Date().toISOString(),
}) {
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

  async function definition(templateId) {
    const [registered, library] = await Promise.all([definitions(), state()]);
    const standard = registered.find((candidate) => candidate.id === templateId);
    if (standard) {
      if (library.deletedBuiltIns.includes(templateId)) {
        throw new Error(`Unknown contract template: ${templateId}.`);
      }
      const saved = library.builtIns[templateId] ?? {};
      return {
        ...standard,
        titleTemplate: saved.titleTemplate ?? standard.titleTemplate,
        builtIn: true,
      };
    }
    const custom = library.customTemplates.find((candidate) => candidate.id === templateId);
    if (!custom) throw new Error(`Unknown contract template: ${templateId}.`);
    const source = registered.find((candidate) => candidate.id === custom.sourceTemplateId);
    if (!source) throw new Error(`Custom template ${templateId} has an unsupported source template.`);
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
      safePath(rootDir, runtimeDir, template.placeholderRegistryFile),
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
      safePath(rootDir, runtimeDir, template.placeholderRegistryFile),
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
      markdown: await fs.readFile(safePath(rootDir, runtimeDir, template.templateFile), "utf8"),
      titleTemplate: template.titleTemplate,
    };
  }

  async function list() {
    const [registered, library] = await Promise.all([definitions(), state()]);
    const builtIns = await Promise.all(registered
      .filter((template) => !library.deletedBuiltIns.includes(template.id))
      .map(async (template) => {
        return publicTemplate({
          ...template,
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
    return JSON.parse(await fs.readFile(safePath(rootDir, runtimeDir, template.placeholderRegistryFile), "utf8"));
  }

  async function save(templateId, content) {
    return locked(async () => {
      const template = await definition(templateId);
      const next = normalizedContent(content, template);
      await validateMarkdown(template, next.markdown);
      await validateTitleTemplate(template, next.titleTemplate);
      const filename = safePath(rootDir, runtimeDir, template.templateFile);
      const library = await state();
      await writeAtomic(filename, next.markdown);
      if (template.builtIn) {
        library.builtIns[template.id] = {
          titleTemplate: next.titleTemplate,
          updatedAt: now(),
        };
      } else {
        const custom = library.customTemplates.find((candidate) => candidate.id === template.id);
        custom.titleTemplate = next.titleTemplate;
        custom.updatedAt = now();
      }
      await writeJsonAtomic(statePath, library);
      return get(templateId);
    });
  }

  async function create({ sourceTemplateId, label }) {
    return locked(async () => {
      const source = await definition(sourceTemplateId);
      const normalizedLabel = String(label ?? "").trim();
      if (!normalizedLabel) throw new Error("Name the new template before creating it.");
      const [library, existing] = await Promise.all([state(), list()]);
      const id = templateIdFromLabel(normalizedLabel, new Set(existing.map((template) => template.id)));
      const createdAt = now();
      const templateFile = path.join(runtimeDir, "templates", `${id}.md`);
      library.customTemplates.push({
        id,
        label: normalizedLabel,
        sourceTemplateId: source.builtIn ? source.id : source.sourceTemplateId,
        templateFile,
        titleTemplate: source.titleTemplate,
        createdAt,
        updatedAt: createdAt,
      });
      await writeAtomic(
        safePath(rootDir, runtimeDir, templateFile),
        await fs.readFile(safePath(rootDir, runtimeDir, source.templateFile), "utf8"),
      );
      await writeJsonAtomic(statePath, library);
      return get(id);
    });
  }

  async function remove(templateId) {
    return locked(async () => {
      const [registered, library] = await Promise.all([definitions(), state()]);
      const standard = registered.find((candidate) => candidate.id === templateId);
      if (standard) {
        if (library.deletedBuiltIns.includes(standard.id)) throw new Error(`Unknown contract template: ${templateId}.`);
        const remaining = (await list()).filter((candidate) => candidate.id !== standard.id);
        if (!remaining.length) throw new Error("Keep at least one contract template in the library.");
        const nextBuiltIns = { ...library.builtIns };
        delete nextBuiltIns[standard.id];
        await writeJsonAtomic(statePath, {
          ...library,
          builtIns: nextBuiltIns,
          deletedBuiltIns: [...library.deletedBuiltIns, standard.id],
        });
        return { id: standard.id, label: standard.label, deleted: true };
      }
      const template = await definition(templateId);
      if (template.templateFile !== path.join(runtimeDir, "templates", `${template.id}.md`)) {
        throw new Error("Custom template storage path is invalid.");
      }
      const nextTemplates = library.customTemplates.filter((candidate) => candidate.id !== template.id);
      if (nextTemplates.length === library.customTemplates.length) {
        throw new Error(`Unknown contract template: ${templateId}.`);
      }
      await writeJsonAtomic(statePath, { ...library, customTemplates: nextTemplates });
      await Promise.all([
        fs.rm(safePath(rootDir, runtimeDir, template.templateFile), { force: true }),
      ]);
      return { id: template.id, label: template.label, deleted: true };
    });
  }

  return { list, get, save, create, remove, placeholders, definition };
}
