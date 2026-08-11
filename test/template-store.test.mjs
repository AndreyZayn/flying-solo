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
    requiredPlaceholders: ["BRAND_NAME"],
  }]));
  await fs.writeFile(path.join(rootDir, "templates/fashion-week.md"), "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n");
  const store = createTemplateStore({
    rootDir,
    registryPath: path.join(rootDir, "config/templates.json"),
    now: () => "2026-08-10T12:00:00.000Z",
  });
  return { rootDir, store };
}

test("lists and reads registered templates", async () => {
  const { store } = await fixture();
  assert.deepEqual(await store.list(), [{ id: "fashion-week", label: "Fashion Week Agreement", family: "fashion-week" }]);
  assert.equal((await store.get("fashion-week")).markdown, "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n");
});

test("saves an approved template and retains a timestamped history copy", async () => {
  const { rootDir, store } = await fixture();
  const updated = "## EVENT AGREEMENT\n\n**Brand:** {{BRAND_NAME}}\n\n{{#IF GRANT_ENABLED}}Grant{{/IF}}\n";
  const result = await store.save("fashion-week", updated);
  assert.equal(result.markdown, updated);
  assert.equal(await fs.readFile(path.join(rootDir, "templates/fashion-week.md"), "utf8"), updated);
  const history = await fs.readdir(path.join(rootDir, "templates/history/fashion-week"));
  assert.equal(history.length, 1);
  assert.equal(await fs.readFile(path.join(rootDir, "templates/history/fashion-week", history[0]), "utf8"), "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n");
});

test("rejects unknown placeholders and missing required placeholders", async () => {
  const { store } = await fixture();
  await assert.rejects(
    store.save("fashion-week", "## EVENT AGREEMENT\n\n{{UNKNOWN}}\n"),
    /Unknown template key: UNKNOWN/,
  );
  await assert.rejects(
    store.save("fashion-week", "## EVENT AGREEMENT\n\nNo brand token\n"),
    /required placeholder: BRAND_NAME/,
  );
});
