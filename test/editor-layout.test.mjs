import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");
const styles = await fs.readFile(new URL("../public/styles.css", import.meta.url), "utf8");

test("keeps the compact title editor contained and sizes the body editor from its own content", () => {
  assert.match(app, /const bodyEditorHost = document\.querySelector\("#wysiwygEditor"\);/);
  assert.match(app, /bodyEditorHost\.querySelector\("\.toastui-editor-defaultUI-toolbar"\)/);
  assert.match(app, /bodyEditorHost\.querySelector\("\.toastui-editor-ww-container \.ProseMirror"\)/);
  assert.match(app, /titleEditor = new toastui\.Editor\([\s\S]*?height: "116px",[\s\S]*?minHeight: "116px"/);
  assert.match(styles, /\.editor-panel \.title-editor-panel \.toastui-editor-defaultUI\s*\{[^}]*min-height:\s*116px[^}]*resize:\s*none/s);
});
