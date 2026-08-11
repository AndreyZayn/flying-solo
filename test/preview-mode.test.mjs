import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("preview starts with all editable fields and placeholders hidden", () => {
  assert.match(html, /<section id="editControls" class="edit-controls" hidden>/);
  const editControlsStart = html.indexOf('id="editControls"');
  const editControlsEnd = html.indexOf("</section>", html.indexOf('id="placeholderLibrary"'));
  assert.ok(html.indexOf('id="contractForm"') > editControlsStart);
  assert.ok(html.indexOf('id="placeholderLibrary"') > editControlsStart);
  assert.ok(html.indexOf('id="contractForm"') < editControlsEnd);
  assert.ok(html.indexOf('id="placeholderLibrary"') < editControlsEnd);
});

test("switching views reveals edit controls only in edit mode", () => {
  assert.match(app, /const editControls = document\.querySelector\("#editControls"\)/);
  assert.match(app, /editControls\.hidden = !editorVisible/);
  assert.match(app, /editorPanel\.hidden = !editorVisible/);
  assert.match(app, /previewPanel\.hidden = editorVisible/);
});
