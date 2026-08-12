import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("preview shows sourced fields without copy actions and hides placeholders", () => {
  assert.match(html, /<form id="contractForm">/);
  assert.match(html, /<section id="placeholderLibrary" class="placeholder-library"[^>]+hidden>/);
  assert.doesNotMatch(html, /id="editControls"/);
  assert.doesNotMatch(html, /id="copyRepresentative"|id="copyRepresentativeEmail"/);
});

test("preview locks sourced fields while edit mode unlocks pending records", () => {
  assert.match(app, /const inputEditable = view === "editor" && selectedRecord\(\)\?\.status !== "verified"/);
  assert.match(app, /form\.querySelectorAll\("input, select"\)\.forEach\(\(control\) => \{ control\.disabled = !inputEditable; \}\)/);
  assert.match(app, /placeholderLibrary\.hidden = !editorVisible/);
  assert.match(app, /editorPanel\.hidden = !editorVisible/);
  assert.match(app, /previewPanel\.hidden = editorVisible/);
});
