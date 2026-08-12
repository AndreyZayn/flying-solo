import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("template workspace offers a preview and a deletion control", () => {
  assert.match(html, /id="previewTab"[^>]*>Preview<\/button>/);
  assert.match(html, /id="deleteTemplate"[^>]*>Delete template<\/button>/);
  assert.match(app, /previewTab\.hidden = false/);
  assert.match(app, /const editorVisible = view === "editor"/);
  assert.match(app, /workspaceMode === "templates" \? renderTemplatePreview\(\) : renderPreview\(\)/);
  assert.match(app, /if \(workspaceMode === "templates" && view === "preview"\) showResult\(\);/);
  assert.match(app, /deleteTemplateButton\.hidden = !template/);
  assert.match(app, /method: "DELETE"/);
});

test("shows template and version deletion controls for removable saved content", () => {
  assert.match(app, /deleteTemplateButton\.hidden = !template/);
  assert.match(app, /snapshot\.deletable/);
  assert.match(app, /Delete version/);
  assert.match(app, /async function deleteTemplateVersion/);
  assert.match(app, /\/history\/\$\{encodeURIComponent\(snapshot\.snapshotId\)\}/);
});

test("uses one saved contract template selector instead of separate contract-type controls", () => {
  assert.match(html, /id="templateSelect"[^>]+aria-label="Contract template"/);
  assert.match(html, /id="batchTemplateSelect"[^>]+aria-label="Contract template"/);
  assert.doesNotMatch(html, /id="templateSourceSelect"/);
  assert.doesNotMatch(html, /id="contractType"/);
  assert.doesNotMatch(html, />Contract type</);
  assert.match(app, /templateSelect\.innerHTML = templateCatalog\.map/);
  assert.match(app, /batchTemplateSelect\.innerHTML = templateCatalog\.map/);
  assert.match(app, /sourceTemplateId: activeTemplateId/);
  assert.doesNotMatch(app, /templateSourceSelect/);
  assert.doesNotMatch(app, /contractTypeSelect/);
  assert.match(app, /templateManager\.hidden = !templates/);
});
