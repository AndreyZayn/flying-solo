import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createTemplateStore } from "../src/template-store.mjs";

async function fixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "flying-solo-template-"));
  await fs.mkdir(path.join(rootDir, "config"), { recursive: true });
  await fs.mkdir(path.join(rootDir, "templates"), { recursive: true });
  await fs.writeFile(path.join(rootDir, "config/placeholders.json"), JSON.stringify([
    { key: "BRAND_NAME", type: "value" },
    { key: "GRANT_ENABLED", type: "condition" },
  ]));
  await fs.writeFile(path.join(rootDir, "config/templates.json"), JSON.stringify([{
    id: "fashion-week",
    label: "Fashion Week Agreement",
    family: "fashion-week",
    templateFile: "templates/fashion-week.md",
    placeholderRegistryFile: "config/placeholders.json",
    titleTemplate: "FLYING SOLO — {{BRAND_NAME}}",
    requiredPlaceholders: ["BRAND_NAME"],
  }]));
  await fs.writeFile(path.join(rootDir, "templates/fashion-week.md"), "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n");
  const store = createTemplateStore({
    rootDir,
    registryPath: path.join(rootDir, "config/templates.json"),
    statePath: path.join(rootDir, "runtime", "template-library.json"),
    now: () => "2026-08-10T12:00:00.000Z",
  });
  return { rootDir, store };
}

test("lists and reads registered templates", async () => {
  const { store } = await fixture();
  assert.deepEqual(await store.list(), [{
    id: "fashion-week",
    label: "Fashion Week Agreement",
    family: "fashion-week",
    version: 1,
    builtIn: true,
  }]);
  assert.deepEqual(await store.get("fashion-week"), {
    id: "fashion-week",
    label: "Fashion Week Agreement",
    family: "fashion-week",
    version: 1,
    builtIn: true,
    markdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n",
    titleTemplate: "FLYING SOLO — {{BRAND_NAME}}",
  });
});

test("saves an approved template and retains a timestamped history copy", async () => {
  const { rootDir, store } = await fixture();
  const updated = "## EVENT AGREEMENT\n\n**Brand:** {{BRAND_NAME}}\n\n{{#IF GRANT_ENABLED}}Grant{{/IF}}\n";
  const result = await store.save("fashion-week", {
    markdown: updated,
    titleTemplate: "Fashion Week — {{BRAND_NAME}}{{#IF GRANT_ENABLED}} (grant){{/IF}}",
  });
  assert.equal(result.markdown, updated);
  assert.equal(result.version, 2);
  assert.equal(result.titleTemplate, "Fashion Week — {{BRAND_NAME}}{{#IF GRANT_ENABLED}} (grant){{/IF}}");
  assert.equal(await fs.readFile(path.join(rootDir, "templates/fashion-week.md"), "utf8"), updated);
  assert.deepEqual(await store.history("fashion-week"), [{
    version: 1,
    savedAt: "2026-08-10T12:00:00.000Z",
    markdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n",
    titleTemplate: "FLYING SOLO — {{BRAND_NAME}}",
  }]);
});

test("creates a named reusable template from a supported contract type", async () => {
  const { store } = await fixture();
  const created = await store.create({
    sourceTemplateId: "fashion-week",
    label: "Paris Fashion Week 2027",
  });

  assert.deepEqual(created, {
    id: "paris-fashion-week-2027",
    label: "Paris Fashion Week 2027",
    family: "fashion-week",
    version: 1,
    builtIn: false,
    markdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n",
    titleTemplate: "FLYING SOLO — {{BRAND_NAME}}",
  });
  assert.deepEqual(await store.list(), [
    { id: "fashion-week", label: "Fashion Week Agreement", family: "fashion-week", version: 1, builtIn: true },
    { id: "paris-fashion-week-2027", label: "Paris Fashion Week 2027", family: "fashion-week", version: 1, builtIn: false },
  ]);
});

test("creates a new template by duplicating the selected saved template", async () => {
  const { store } = await fixture();
  const source = await store.create({
    sourceTemplateId: "fashion-week",
    label: "Paris Fashion Week 2027",
  });
  await store.save(source.id, {
    markdown: "## EVENT AGREEMENT\n\nCustom wording for {{BRAND_NAME}}\n",
    titleTemplate: "Paris — {{BRAND_NAME}}",
  });

  const copy = await store.create({
    sourceTemplateId: source.id,
    label: "Paris Fashion Week 2028",
  });

  assert.deepEqual(copy, {
    id: "paris-fashion-week-2028",
    label: "Paris Fashion Week 2028",
    family: "fashion-week",
    version: 1,
    builtIn: false,
    markdown: "## EVENT AGREEMENT\n\nCustom wording for {{BRAND_NAME}}\n",
    titleTemplate: "Paris — {{BRAND_NAME}}",
  });
});

test("deletes a custom template while preserving approved contract types", async () => {
  const { rootDir, store } = await fixture();
  const created = await store.create({
    sourceTemplateId: "fashion-week",
    label: "Paris Fashion Week 2027",
  });
  await store.save(created.id, {
    markdown: "## EVENT AGREEMENT\n\nUpdated {{BRAND_NAME}}\n",
    titleTemplate: "Paris — {{BRAND_NAME}}",
  });

  await assert.rejects(store.remove("fashion-week"), /Built-in templates cannot be deleted/);
  assert.deepEqual(await store.remove(created.id), {
    id: created.id,
    label: created.label,
    deleted: true,
  });
  assert.deepEqual(await store.list(), [{
    id: "fashion-week",
    label: "Fashion Week Agreement",
    family: "fashion-week",
    version: 1,
    builtIn: true,
  }]);
  await assert.rejects(store.get(created.id), /Unknown contract template/);
  await assert.rejects(fs.access(path.join(rootDir, "data/runtime/templates/paris-fashion-week-2027.md")));
  await assert.rejects(fs.access(path.join(rootDir, "data/runtime/templates/history/paris-fashion-week-2027")));
});

test("refuses a delete when custom template storage is not in its runtime directory", async () => {
  const { rootDir, store } = await fixture();
  const created = await store.create({
    sourceTemplateId: "fashion-week",
    label: "Paris Fashion Week 2027",
  });
  const statePath = path.join(rootDir, "runtime", "template-library.json");
  const library = JSON.parse(await fs.readFile(statePath, "utf8"));
  library.customTemplates[0].templateFile = "config/templates.json";
  await fs.writeFile(statePath, JSON.stringify(library));

  await assert.rejects(store.remove(created.id), /Custom template storage path is invalid/);
  assert.match(await fs.readFile(path.join(rootDir, "config/templates.json"), "utf8"), /fashion-week/);
});

test("keeps earlier Markdown snapshots visible as numbered versions", async () => {
  const { rootDir, store } = await fixture();
  await fs.mkdir(path.join(rootDir, "templates/history/fashion-week"), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, "templates/history/fashion-week/2026-08-09T12-00-00.000Z.md"),
    "## EVENT AGREEMENT\n\nPrevious {{BRAND_NAME}}\n",
  );

  assert.equal((await store.get("fashion-week")).version, 2);
  assert.deepEqual(await store.history("fashion-week"), [{
    version: 1,
    savedAt: "2026-08-09T12:00:00.000Z",
    markdown: "## EVENT AGREEMENT\n\nPrevious {{BRAND_NAME}}\n",
    titleTemplate: "FLYING SOLO — {{BRAND_NAME}}",
  }]);
});

test("rejects unknown placeholders and missing required placeholders", async () => {
  const { store } = await fixture();
  await assert.rejects(
    store.save("fashion-week", { markdown: "## EVENT AGREEMENT\n\n{{UNKNOWN}}\n", titleTemplate: "{{BRAND_NAME}}" }),
    /Unknown template key: UNKNOWN/,
  );
  await assert.rejects(
    store.save("fashion-week", { markdown: "## EVENT AGREEMENT\n\nNo brand token\n", titleTemplate: "{{BRAND_NAME}}" }),
    /required placeholder: BRAND_NAME/,
  );
  await assert.rejects(
    store.save("fashion-week", { markdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n", titleTemplate: "{{UNKNOWN}}" }),
    /Unknown template key: UNKNOWN/,
  );
});
