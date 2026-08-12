import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("template workspace offers a preview and only exposes deletion for a custom template", () => {
  assert.match(html, /id="previewTab"[^>]*>Preview<\/button>/);
  assert.match(html, /id="deleteTemplate"[^>]*>Delete template<\/button>/);
  assert.match(app, /previewTab\.hidden = false/);
  assert.match(app, /const editorVisible = view === "editor"/);
  assert.match(app, /workspaceMode === "templates" \? renderTemplatePreview\(\) : renderPreview\(\)/);
  assert.match(app, /if \(workspaceMode === "templates" && view === "preview"\) showResult\(\);/);
  assert.match(app, /deleteTemplateButton\.hidden = !template \|\| template\.builtIn/);
  assert.match(app, /method: "DELETE"/);
});
