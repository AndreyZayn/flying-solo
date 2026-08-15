import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

const html = await fs.readFile(new URL("../public/index.html", import.meta.url), "utf8");
const app = await fs.readFile(new URL("../public/app.js", import.meta.url), "utf8");

test("template workspace offers a preview and card-level deletion", () => {
  assert.match(html, /id="previewTab"[^>]*>Preview<\/button>/);
  assert.doesNotMatch(html, /id="deleteTemplate"/);
  assert.match(app, /previewTab\.hidden = false/);
  assert.match(app, /const editorVisible = workspaceMode === "templates" && view === "editor"/);
  assert.match(app, /if \(workspaceMode === "templates"\) \{\s*renderTemplatePreview\(\);\s*return;\s*\}/s);
  assert.match(app, /try \{ renderPreview\(\); \} catch \(error\) \{ showError\(error\); \}/);
  assert.match(app, /if \(workspaceMode === "templates" && view === "preview"\) showResult\(\);/);
  assert.match(app, /remove\.className = "template-card-delete"/);
  assert.match(app, /method: "DELETE"/);
  assert.match(app, /templatePreviewInput\(\{ family: activeFamily\(\), registry \}\)/);
  assert.match(app, /resolveMarkdownTemplate\(normalizedTemplate, result\.placeholders\)/);
  assert.match(app, /statusBadge\.textContent = "Sample preview"/);
});

test("hides the redundant title output only while editing a template", () => {
  assert.match(html, /id="contractOutputBar"/);
  assert.match(app, /const templateEditor = workspaceMode === "templates" && editorVisible/);
  assert.match(app, /contractOutputBar\.hidden = templateEditor/);
});

test("renders template-title placeholders as visible, labeled chips", () => {
  assert.match(app, /function renderTemplateTitle\(\)/);
  assert.match(app, /titleElement\.replaceChildren\(fragment\)/);
  assert.match(app, /element\.classList\.add\("title-template-token"\)/);
  assert.match(app, /element\.dataset\.format = "Title"/);
  assert.match(app, /widget\.classList\.contains\("title-template-token"\) \|\| widget\.closest\("#titleWysiwygEditor"\)/);
  assert.doesNotMatch(app, /titleElement\.textContent = activeTitleTemplate\(\)/);
});

test("shows a template library without version history", () => {
  assert.match(app, /remove\.className = "template-card-delete"/);
  assert.match(html, /id="templateCards"/);
  assert.match(html, /id="showTemplateCreate"[^>]*>New template/);
  assert.match(html, /id="templateSourceSelect"/);
  assert.match(app, /template-card-delete/);
  assert.doesNotMatch(html, /templateHistory|Version history|Delete version|Restore/);
  assert.doesNotMatch(app, /renderTemplateHistory|deleteTemplateVersion|restoreTemplate/);
});

test("uses one library and one batch template selector instead of contract types", () => {
  assert.doesNotMatch(html, /id="templateSelect"/);
  assert.match(html, /id="batchTemplateSelect"[^>]+aria-label="Contract template"/);
  assert.match(html, /id="templateSourceSelect"/);
  assert.doesNotMatch(html, /id="contractType"/);
  assert.doesNotMatch(html, />Contract type</);
  assert.match(app, /templateCards\.replaceChildren/);
  assert.match(app, /batchTemplateSelect\.innerHTML = templateCatalog\.map/);
  assert.match(app, /sourceTemplateId: templateSourceSelect\.value/);
  assert.doesNotMatch(app, /contractTypeSelect/);
  assert.match(app, /templateManager\.hidden = !templates/);
});

test("keeps batch review to sourced data and a resolved preview", () => {
  assert.match(html, /id="documentTabs"/);
  assert.match(html, /id="editorTab"[^>]*>Template editor<\/button>/);
  assert.doesNotMatch(html, />Edit contract</);
  assert.match(app, /documentTabs\.hidden = !templates/);
  assert.match(app, /const inputEditable = workspaceMode === "batch"/);
  assert.match(app, /function activeTemplateMarkdown\(\) \{[\s\S]*workspaceMode === "templates"/);
  assert.doesNotMatch(app, /record\.draftMarkdown \|\| templateMarkdown/);
  assert.doesNotMatch(app, /record\.draftTitleTemplate \|\| templateTitle/);
  assert.doesNotMatch(app, /Unable to save draft\./);
  assert.match(app, /\/api\/review-queue\/\$\{encodeURIComponent\(record\.id\)\}\/input/);
});
