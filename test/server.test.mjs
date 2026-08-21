import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createAppServer } from "../server.mjs";
import { createReviewStore } from "../src/review-store.mjs";
import { createVerifiedBatchStore } from "../src/verified-batch-store.mjs";

function createReadOnlyReviewStore() {
  return {
    initialize: async () => {},
    getQueue: async () => ({
      schemaVersion: 1,
      batch: { id: "batch", templateId: "fashion-week" },
      records: [{ id: "brand-1", status: "pending", input: {} }],
      progress: { total: 1, verified: 0, pending: 1, complete: false },
    }),
    saveInput: async () => { throw new Error("Read-only test review store"); },
    verify: async () => { throw new Error("Read-only test review store"); },
  };
}

function persistedFixture() {
  return {
    verifiedAt: "2026-08-21T10:00:00-04:00",
    artifact: {
      relativePath: "contracts/001--brand-1--example-brand.md",
      artifactStatus: "valid",
      revision: 1,
      contentSha256: "a".repeat(64),
      fileSha256: "b".repeat(64),
      validatedAt: "2026-08-21T10:00:00-04:00",
    },
    verifiedBatch: {
      relativeDirectory: "data/runtime/verified-batches/2026-08-21--batch",
      createdAt: "2026-08-21T10:00:00-04:00",
    },
    model: { status: "in_progress", validCount: 1, expectedCount: 1, contracts: [] },
  };
}

function unusedVerifiedBatchStore() {
  return {
    persistVerifiedContract: async () => { throw new Error("Verified batch store must not be used"); },
    reconcile: async () => { throw new Error("Verified batch store must not be used"); },
  };
}

async function startServer() {
  const server = createAppServer({ reviewStore: createReadOnlyReviewStore() });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

test("deletes an unused custom template but protects a template used by the active batch", async (context) => {
  let activeTemplateId = "fashion-week";
  const deleted = [];
  const reviewStore = {
    initialize: async () => {},
    getQueue: async () => ({ batch: { templateId: activeTemplateId }, records: [] }),
  };
  const templateStore = {
    remove: async (id) => {
      deleted.push(id);
      return { id, label: "Paris Fashion Week 2027", deleted: true };
    },
  };
  const server = createAppServer({ reviewStore, templateStore });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => server.close());
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  const deletedResponse = await fetch(`${baseUrl}/api/templates/paris-fashion-week-2027`, { method: "DELETE" });
  assert.equal(deletedResponse.status, 200);
  assert.deepEqual(await deletedResponse.json(), {
    id: "paris-fashion-week-2027",
    label: "Paris Fashion Week 2027",
    deleted: true,
  });

  activeTemplateId = "paris-fashion-week-2027";
  const activeResponse = await fetch(`${baseUrl}/api/templates/paris-fashion-week-2027`, { method: "DELETE" });
  assert.equal(activeResponse.status, 409);
  assert.match((await activeResponse.json()).error, /active batch/);
  assert.deepEqual(deleted, ["paris-fashion-week-2027"]);
});

test("does not expose template history routes", async (context) => {
  const { server, baseUrl } = await startServer();
  context.after(() => server.close());
  const response = await fetch(`${baseUrl}/api/templates/fashion-week/history`);

  assert.equal(response.status, 404);
});

test("serves the dashboard and registry", async (context) => {
  const { server, baseUrl } = await startServer();
  context.after(() => server.close());

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  const pageHtml = await page.text();
  assert.match(pageHtml, /Flying Solo Contract Review/);
  assert.match(pageHtml, /id="eventMonth"[^>]+type="month"/);
  assert.match(pageHtml, /id="grantPreset"/);
  assert.match(pageHtml, /Brand representative name/);
  assert.match(pageHtml, /id="representative"[^>]+value="Mumtoz Mastura Kuzieva Fozilovna"/);
  assert.match(pageHtml, /id="representativeEmail"[^>]+type="email"[^>]+value="mumtozmastura@gmail\.com"/);
  assert.doesNotMatch(pageHtml, /id="copyRepresentative"/);
  assert.doesNotMatch(pageHtml, /id="copyRepresentativeEmail"/);
  assert.match(pageHtml, /href="\/vendor\/toastui-editor\.min\.css"/);
  assert.match(pageHtml, /src="\/vendor\/toastui-editor-all\.min\.js"/);
  assert.match(pageHtml, /src="\/vendor\/marked\.umd\.js"/);
  assert.match(pageHtml, /src="\/vendor\/purify\.min\.js"/);
  assert.match(pageHtml, /id="wysiwygEditor"[^>]+aria-label="Contract editor"/);
  assert.match(pageHtml, /id="editorResizeHandle"[^>]+role="separator"[^>]+aria-label="Resize contract editor"/);
  assert.match(pageHtml, /id="editorPanel"[^>]+hidden/);
  assert.match(pageHtml, /id="previewPanel">/);
  assert.match(pageHtml, /id="previewTab"[^>]+class="tab active"[^>]*>Preview<\/button>/);
  assert.match(pageHtml, /id="editorTab"[^>]*>Template editor<\/button>/);
  assert.match(pageHtml, /id="copyMarkdown"[^>]+disabled[^>]*>Copy Markdown<\/button>/);
  assert.match(pageHtml, /id="reviewQueueSelect"[^>]+aria-label="Select a contract"/);
  assert.match(pageHtml, /id="selectedRecordStatus"[^>]+class="review-selector-status"/);
  assert.match(pageHtml, /id="selectedRecordContext"/);
  assert.doesNotMatch(pageHtml, /id="reviewQueue"/);
  assert.match(pageHtml, /id="reviewProgress"/);
  assert.match(pageHtml, /id="verifiedBatchPanel"[^>]+class="verified-batch-panel"/);
  assert.match(pageHtml, /id="verifiedBatchTitle"[^>]*>Verified batch<\/h3>/);
  assert.match(pageHtml, /id="verifiedBatchLabel"/);
  assert.match(pageHtml, /id="verifiedBatchPath"[^>]+class="verified-batch-path"/);
  assert.match(pageHtml, /id="copyBatchPath"[^>]*>Copy path<\/button>/);
  assert.match(pageHtml, /id="verifiedBatchProgress"/);
  assert.match(pageHtml, /id="verifiedBatchStatus"/);
  assert.match(pageHtml, /id="verifiedBatchCompleted"/);
  assert.match(pageHtml, /id="selectedArtifactName"/);
  assert.match(pageHtml, /id="selectedArtifactState"/);
  assert.match(pageHtml, /id="recreateArtifact"[^>]*>Recreate verified file<\/button>/);
  assert.match(pageHtml, /id="verifyContract"[^>]*>Mark verified<\/button>/);
  assert.match(pageHtml, /id="saveTemplate"[^>]*>Save changes<\/button>/);
  assert.match(pageHtml, /id="templateWorkspace"/);
  assert.match(pageHtml, /id="templateCards"/);
  assert.match(pageHtml, /id="showTemplateCreate"[^>]*>New template<\/button>/);
  assert.match(pageHtml, /id="templateSourceSelect"/);
  assert.doesNotMatch(pageHtml, /templateHistory|Version history|Delete version|Restore/);
  assert.doesNotMatch(pageHtml, /id="deleteTemplate"/);
  assert.match(pageHtml, /id="titleWysiwygEditor"[^>]+aria-label="Contract title editor"/);
  assert.doesNotMatch(pageHtml, /id="membershipDemo"/);
  assert.match(pageHtml, /aria-label="Payment 1 due date"/);
  assert.match(pageHtml, /aria-label="Payment 1 amount"/);
  assert.match(pageHtml, /aria-label="Payment 2 due date"/);
  assert.match(pageHtml, /aria-label="Payment 2 amount"/);
  assert.match(pageHtml, /aria-label="Payment 3 due date"/);
  assert.match(pageHtml, /aria-label="Payment 3 amount"/);
  const sourceIndicators = pageHtml.match(/class="source-indicator"/g) ?? [];
  assert.equal(sourceIndicators.length, 8);
  for (const field of [
    "eventCode",
    "eventMonth",
    "brand",
    "category",
    "representative",
    "representativeEmail",
    "grantEnabled",
    "paymentSchedule",
  ]) {
    assert.match(
      pageHtml,
      new RegExp(`data-source-field="${field}"[^>]+data-tooltip="Sourced from Flying Solo data"[^>]+aria-label="Sourced from Flying Solo data"[^>]+tabindex="0"`),
    );
  }
  assert.match(pageHtml, /id="placeholderLibrary"[^>]+class="placeholder-library"/);
  assert.match(pageHtml, /id="placeholderSearch"[^>]+placeholder="Find a placeholder"/);
  assert.match(pageHtml, /id="placeholderList"/);
  assert.ok(pageHtml.indexOf('id="placeholderLibrary"') > pageHtml.indexOf('class="payments-section"'));
  assert.doesNotMatch(pageHtml, /role="tablist"/);
  assert.ok(pageHtml.indexOf('id="copyMarkdown"') > pageHtml.indexOf('class="document-toolbar"'));
  assert.ok(pageHtml.indexOf('id="copyMarkdown"') < pageHtml.indexOf('id="editorPanel"'));
  assert.doesNotMatch(pageHtml, /class="actions"/);
  assert.doesNotMatch(pageHtml, /VARIABLE FIELDS|Highlighted values are not copied|Localhost only|Clean preview|Copy HTML body/);

  const config = await fetch(`${baseUrl}/api/config`).then((response) => response.json());
  assert.equal(config.categories[0].fullPrice, 6900);

  const placeholderRegistry = await fetch(`${baseUrl}/api/placeholders`).then((response) => response.json());
  assert.equal(placeholderRegistry.length, 19);
  assert.deepEqual(
    placeholderRegistry.find((placeholder) => placeholder.key === "BRAND_NAME"),
    {
      key: "BRAND_NAME",
      label: "Brand name",
      description: "The participating brand named in the agreement.",
      type: "value",
      group: "People and brand",
    },
  );
  assert.equal(
    placeholderRegistry.find((placeholder) => placeholder.key === "GRANT_ENABLED").type,
    "condition",
  );

  const template = await fetch(`${baseUrl}/api/template`);
  assert.equal(template.status, 200);
  assert.match(template.headers.get("content-type"), /^text\/markdown/);
  assert.match(await template.text(), /^## EVENT AGREEMENT/m);

  const templates = await fetch(`${baseUrl}/api/templates`).then((response) => response.json());
  assert.equal(templates[0].id, "fashion-week");
  const registeredTemplate = await fetch(`${baseUrl}/api/templates/fashion-week`).then((response) => response.json());
  assert.match(registeredTemplate.markdown, /^## EVENT AGREEMENT/m);
  const queue = await fetch(`${baseUrl}/api/review-queue`).then((response) => response.json());
  assert.equal(queue.batch.templateId, "fashion-week");
  assert.equal(queue.progress.total, queue.records.length);

  const editorBundle = await fetch(`${baseUrl}/vendor/toastui-editor-all.min.js`);
  assert.equal(editorBundle.status, 200);
  const editorBundleSource = await editorBundle.text();
  assert.match(editorBundleSource, /toastui/);
  assert.doesNotMatch(editorBundleSource, /root\[undefined\]/);

  const markdownBundle = await fetch(`${baseUrl}/vendor/marked.umd.js`);
  assert.equal(markdownBundle.status, 200);
  assert.match(await markdownBundle.text(), /marked/);

  const appSource = await fetch(`${baseUrl}/app.js`).then((response) => response.text());
  assert.match(appSource, /new toastui\.Editor\(/);
  assert.match(appSource, /titleEditor/);
  assert.match(appSource, /templateWorkspaceButton\.addEventListener/);
  assert.doesNotMatch(appSource, /\/history|restoreTemplate|deleteTemplateVersion/);
  assert.match(appSource, /from "\/editor-sizing\.mjs"/);
  assert.match(appSource, /from "\/placeholder-library\.mjs"/);
  assert.match(appSource, /from "\/review-selector\.mjs"/);
  assert.match(appSource, /fetch\(`\/api\/placeholders\?templateId=/);
  assert.match(appSource, /\/api\/import-workbook\?templateId=/);
  assert.match(appSource, /\/api\/demo\/membership/);
  assert.match(appSource, /fetch\("\/api\/review-queue"\)/);
  assert.match(appSource, /fetch\("\/api\/verified-batch"\)/);
  assert.match(appSource, /refreshVerifiedBatch\(\)/);
  assert.match(appSource, /renderVerifiedBatch\(\)/);
  assert.match(appSource, /recreate-artifact/);
  assert.match(appSource, /Batch path copied/);
  assert.match(appSource, /Verified file recreated/);
  assert.match(appSource, /reviewQueueSelect\.addEventListener\("change"/);
  assert.match(appSource, /nextIncompleteRecord\(reviewQueue\.records, record\.id\)/);
  assert.match(appSource, /\/api\/review-queue\/\$\{encodeURIComponent\(record\.id\)\}\/verify/);
  assert.match(appSource, /async function verifyCurrentContract\(\)[\s\S]*?await saveCurrentInput\(\);[\s\S]*?await generate\(\);/);
  assert.match(appSource, /\/api\/templates\/\$\{encodeURIComponent\(activeTemplateId\)\}/);
  assert.match(appSource, /method: "DELETE"/);
  assert.match(appSource, /renderTemplatePreview\(\)/);
  assert.match(appSource, /target\.insertText\(placeholderInsertionText\(placeholder, \{ inline: activeEditor === "title" \}\)\)/);
  assert.match(appSource, /displayPlaceholderValue\(placeholder, currentResult\?\.placeholders/);
  assert.match(appSource, /matchesPlaceholder\(placeholder, placeholderSearch\.value\)/);
  assert.match(appSource, /contractEditor\.setHeight\(/);
  assert.match(appSource, /querySelector\("\.toastui-editor-ww-container \.ProseMirror"\)/);
  assert.match(appSource, /contractEditor\.on\("change", fitEditorToDocument\)/);
  assert.match(appSource, /window\.addEventListener\("resize", fitEditorToDocument\)/);
  assert.match(appSource, /isResizeHandlePointer\(/);
  assert.match(appSource, /editorResizeHandle\.addEventListener\("pointerdown", beginEditorResize\)/);
  assert.match(appSource, /setPointerCapture\(/);
  assert.match(appSource, /document\.addEventListener\("pointermove", resizeEditor\)/);
  assert.match(appSource, /document\.removeEventListener\("pointermove", resizeEditor\)/);
  assert.match(appSource, /try \{\s*editorResizeHandle\.setPointerCapture/s);
  assert.match(appSource, /initialEditType:\s*"wysiwyg"/);
  assert.match(appSource, /hideModeSwitch:\s*true/);
  assert.match(appSource, /usageStatistics:\s*false/);
  assert.match(appSource, /widgetRules/);
  assert.match(appSource, /getMarkdown\(\)/);
  assert.match(appSource, /marked\.parse\(/);
  assert.doesNotMatch(appSource, /Editor\.factory\(/);
  assert.match(appSource, /resolveMarkdownTemplate\(/);
  assert.match(appSource, /DOMPurify\.sanitize\(/);
  assert.match(appSource, /function renderPreview\(\)\s*\{\s*documentElement\.replaceChildren\(\);\s*const markdown/s);
  assert.match(appSource, /Markdown copied/);
  assert.match(appSource, /new ClipboardItem\(/);
  assert.match(appSource, /"text\/plain"/);
  assert.match(appSource, /"text\/html"/);
  assert.match(appSource, /navigator\.clipboard\.write\(/);
  assert.match(appSource, /new AbortController\(\)/);
  assert.match(appSource, /generateRevision/);
  assert.match(appSource, /copyMarkdownButton\.disabled = true/);
  assert.match(appSource, /previewTab\.disabled = true/);
  assert.match(appSource, /initialize\(\)\.catch\(showError\)/);
  assert.doesNotMatch(pageHtml, /EasyMDE|easymde/);
  assert.doesNotMatch(appSource, /EasyMDE|codemirror/);

  const styles = await fetch(`${baseUrl}/styles.css`).then((response) => response.text());
  assert.match(styles, /\.contract-document\s*\{[^}]*max-width:\s*1240px[^}]*padding:\s*64px[^}]*background:\s*var\(--paper\)[^}]*color:\s*var\(--ink\)[^}]*font-family:\s*system-ui[^}]*font-size:\s*16px[^}]*line-height:\s*1\.6/s);
  assert.match(styles, /\.contract-document p\s*\{[^}]*margin:\s*16px 0/s);
  assert.match(styles, /\.contract-document h2\s*\{[^}]*font-size:\s*16px[^}]*font-weight:\s*400/s);
  assert.match(styles, /\.contract-document h3\s*\{[^}]*margin:\s*16px 0 0[^}]*font-size:\s*16px[^}]*font-weight:\s*700/s);
  assert.match(styles, /\.contract-document h3 \+ p\s*\{[^}]*margin-top:\s*0/s);
  assert.match(styles, /\.contract-document ul\s*\{[^}]*margin:\s*16px 0[^}]*padding-left:\s*40px/s);
  assert.match(styles, /\.toastui-editor-ww-container \.ProseMirror\s*\{[^}]*font-size:\s*14px[^}]*line-height:\s*1\.5/s);
  assert.match(styles, /\.contract-placeholder-widget\s*\{[^}]*background:\s*var\(--accent-soft\)/s);
  assert.match(styles, /\.editor-panel \.toastui-editor-defaultUI\s*\{[^}]*resize:\s*vertical[^}]*min-height:\s*360px/s);
  assert.match(styles, /\.editor-resize-handle\s*\{[^}]*cursor:\s*ns-resize/s);
  assert.match(styles, /\.placeholder-library\s*\{[^}]*margin-top:/s);
  assert.match(styles, /\.placeholder-item\s*\{[^}]*border:/s);
  assert.match(styles, /\.placeholder-token\s*\{[^}]*font-family:/s);
  assert.match(styles, /\.review-selector-status\.verified\s*\{[^}]*color:\s*#2f6336/s);
  assert.match(styles, /\.verified-batch-panel\s*\{[^}]*border/s);
  assert.match(styles, /\.verified-batch-path\s*\{[^}]*font-family/s);
  assert.match(styles, /\.verified-batch-status\.needs-attention\s*\{/s);
  assert.match(styles, /\.verified-batch-status\.complete\s*\{/s);
  assert.match(styles, /\.batch-complete\.attention\s*\{/s);
  assert.match(styles, /\.source-indicator\s*\{[^}]*color:\s*var\(--accent\)[^}]*font-size:/s);
  assert.match(styles, /\.source-indicator::after\s*\{[^}]*content:\s*attr\(data-tooltip\)[^}]*opacity:\s*0/s);
  assert.match(styles, /\.source-indicator:hover::after,[\s\S]*\.source-indicator:focus-visible::after\s*\{[^}]*opacity:\s*1/s);
});

test("generates title and Markdown placeholders through the local API", async (context) => {
  const { server, baseUrl } = await startServer();
  context.after(() => server.close());

  const response = await fetch(`${baseUrl}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      titleTemplate: "Agreement for {{BRAND_NAME}}{{#IF GRANT_ENABLED}} · grant{{/IF}}",
      eventCode: "PFW",
      eventMonth: "February 2027",
      brand: "Example Brand",
      representative: "Example Person",
      category: "Clothing",
      grantEnabled: true,
      grantAmount: 2000,
      payments: [
        { dueDate: "2026-08-16", amount: 1700 },
        { dueDate: "2026-10-15", amount: 1600 },
        { dueDate: "2027-01-07", amount: 1600 }
      ]
    }),
  });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.title, "Agreement for Example Brand · grant");
  assert.equal(result.placeholders.FULL_PRICE, "$6,900");
  assert.equal(result.placeholders.GRANT_AMOUNT, "$2,000");
  assert.equal(result.placeholders.REMAINING_BALANCE, "$4,900");
  assert.equal(result.placeholders.GRANT_ENABLED, true);
  assert.equal(result.placeholders.BRAND_NAME, "Example Brand");
});

test("verification persists the contract file first, then records the queue state with its artifact", async (context) => {
  const callOrder = [];
  let verified;
  let savedDraft;
  let persistedArguments;
  const reviewStore = {
    initialize: async () => {},
    getQueue: async () => ({
      schemaVersion: 1,
      batch: { id: "batch", label: "Test batch", templateId: "fashion-week" },
      records: [{ id: "brand-0", status: "verified", input: {} }, { id: "brand-1", status: "pending", input: {} }],
      progress: { total: 2, verified: 1, pending: 1, complete: false },
    }),
    saveInput: async (id, input) => { savedDraft = { id, ...input }; return { id, status: "pending", ...input }; },
    verify: async (id, contract) => {
      callOrder.push("verify");
      verified = { id, ...contract };
      return { record: { id, status: "verified" }, progress: { total: 2, verified: 2, pending: 0, complete: true } };
    },
  };
  const templateStore = {
    list: async () => [{ id: "fashion-week", label: "Fashion Week", family: "fashion-week" }],
    get: async () => ({ id: "fashion-week", family: "fashion-week", markdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n", titleTemplate: "Agreement — {{BRAND_NAME}}" }),
    save: async (_id, markdown) => ({ id: "fashion-week", markdown }),
  };
  const verifiedBatchStore = {
    persistVerifiedContract: async (persistInput) => {
      callOrder.push("persist");
      persistedArguments = persistInput;
      return persistedFixture();
    },
    reconcile: async () => { throw new Error("not used"); },
  };
  const server = createAppServer({ reviewStore, templateStore, verifiedBatchStore });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const input = {
    eventCode: "PFW",
    eventMonth: "February 2027",
    brand: "Example Brand",
    representative: "Example Person",
    category: "Clothing",
    grantEnabled: true,
    grantAmount: 2000,
    payments: [
      { dueDate: "2026-08-16", amount: 1700 },
      { dueDate: "2026-10-15", amount: 1600 },
      { dueDate: "2027-01-07", amount: 1600 },
    ],
  };

  const draftResponse = await fetch(`${baseUrl}/api/review-queue/brand-1/input`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input }),
  });
  assert.equal(draftResponse.status, 200);
  assert.equal(savedDraft.id, "brand-1");

  const verifyResponse = await fetch(`${baseUrl}/api/review-queue/brand-1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input,
      templateId: "untrusted-template-id",
      templateMarkdown: "# Untrusted body",
      titleTemplate: "Untrusted title",
    }),
  });
  assert.equal(verifyResponse.status, 200);
  assert.deepEqual(callOrder, ["persist", "verify"]);
  assert.equal(persistedArguments.batch.id, "batch");
  assert.deepEqual(persistedArguments.record, { id: "brand-1", sequence: 2 });
  assert.equal(persistedArguments.expectedCount, 2);
  assert.equal(persistedArguments.contract.templateMarkdown, "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n");
  assert.equal(persistedArguments.contract.resolvedMarkdown, "## EVENT AGREEMENT\n\nExample Brand\n");
  assert.equal(persistedArguments.contract.input.brand, "Example Brand");
  assert.equal(verified.id, "brand-1");
  assert.equal(verified.templateMarkdown, "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n");
  assert.equal(verified.title, "Agreement — Example Brand");
  assert.equal(verified.titleTemplate, "Agreement — {{BRAND_NAME}}");
  assert.equal(verified.resolvedMarkdown, "## EVENT AGREEMENT\n\nExample Brand\n");
  assert.equal(verified.verifiedAt, "2026-08-21T10:00:00-04:00");
  assert.deepEqual(verified.artifact, persistedFixture().artifact);
  assert.deepEqual(verified.verifiedBatch, persistedFixture().verifiedBatch);
});

test("an already verified record is refused before any contract file is written", async (context) => {
  const reviewStore = {
    initialize: async () => {},
    getQueue: async () => ({
      schemaVersion: 1,
      batch: { id: "batch", templateId: "fashion-week" },
      records: [{ id: "brand-1", status: "verified", input: {} }],
      progress: { total: 1, verified: 1, pending: 0, complete: true },
    }),
  };
  const server = createAppServer({ reviewStore, verifiedBatchStore: unusedVerifiedBatchStore() });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/review-queue/brand-1/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: {} }),
  });

  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /already verified/i);
});

test("serves the sanitized verified-batch model through a read-only endpoint", async (context) => {
  let reconciled;
  const verifiedBatchStore = {
    persistVerifiedContract: async () => { throw new Error("not used"); },
    reconcile: async (reconcileInput) => {
      reconciled = reconcileInput;
      return { status: "in_progress", batchId: "batch", validCount: 1, expectedCount: 1, contracts: [] };
    },
  };
  const server = createAppServer({ reviewStore: createReadOnlyReviewStore(), verifiedBatchStore });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const response = await fetch(`${baseUrl}/api/verified-batch`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "in_progress", batchId: "batch", validCount: 1, expectedCount: 1, contracts: [] });
  assert.equal(reconciled.batch.id, "batch");
  assert.equal(reconciled.expectedCount, 1);
});

test("recreating a verified file requires a verified record and reruns the persistence path", async (context) => {
  let persistedArguments;
  let repaired;
  let recordStatus = "pending";
  const reviewStore = {
    initialize: async () => {},
    getQueue: async () => ({
      schemaVersion: 1,
      batch: { id: "batch", templateId: "fashion-week", verifiedBatch: persistedFixture().verifiedBatch },
      records: [{ id: "brand-1", status: recordStatus, input: { brand: "Example Brand" } }],
      progress: { total: 1, verified: 1, pending: 0, complete: true },
    }),
    recordArtifact: async (id, reference) => {
      repaired = { id, ...reference };
      return { id, status: "verified", artifact: reference.artifact };
    },
  };
  const templateStore = {
    get: async () => ({ id: "fashion-week", family: "fashion-week", markdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n", titleTemplate: "Agreement — {{BRAND_NAME}}" }),
  };
  const verifiedBatchStore = {
    persistVerifiedContract: async (persistInput) => {
      persistedArguments = persistInput;
      return persistedFixture();
    },
    reconcile: async () => { throw new Error("not used"); },
  };
  const server = createAppServer({ reviewStore, templateStore, verifiedBatchStore });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const refused = await fetch(`${baseUrl}/api/review-queue/brand-1/recreate-artifact`, { method: "POST" });
  assert.equal(refused.status, 409);
  assert.equal(persistedArguments, undefined);

  recordStatus = "verified";
  const generateInput = {
    eventCode: "PFW", eventMonth: "February 2027", brand: "Example Brand", representative: "Example Person",
    category: "Clothing", grantEnabled: false, grantAmount: 0,
    payments: [{ dueDate: "2026-08-16", amount: 2300 }, { dueDate: "2026-10-15", amount: 2300 }, { dueDate: "2027-01-07", amount: 2300 }],
  };
  reviewStore.getQueue = async () => ({
    schemaVersion: 1,
    batch: { id: "batch", templateId: "fashion-week", verifiedBatch: persistedFixture().verifiedBatch },
    records: [{ id: "brand-1", status: "verified", input: generateInput }],
    progress: { total: 1, verified: 1, pending: 0, complete: true },
  });
  const response = await fetch(`${baseUrl}/api/review-queue/brand-1/recreate-artifact`, { method: "POST" });

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.record.status, "verified");
  assert.equal(body.model.status, "in_progress");
  assert.deepEqual(persistedArguments.record, { id: "brand-1", sequence: 1 });
  assert.equal(persistedArguments.contract.input.brand, "Example Brand");
  assert.deepEqual(repaired.artifact, persistedFixture().artifact);
  assert.equal(repaired.verifiedAt, "2026-08-21T10:00:00-04:00");
});

test("a real batch progresses, survives tampering, and completes truthfully end to end", async (context) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "flying-solo-e2e-"));
  const input = (brand) => ({
    eventCode: "PFW",
    eventMonth: "February 2027",
    brand,
    representative: "Example Person",
    recipientEmail: "person@example.com",
    category: "Clothing",
    grantEnabled: true,
    grantAmount: 2000,
    payments: [
      { dueDate: "2026-08-16", amount: 1700 },
      { dueDate: "2026-10-15", amount: 1600 },
      { dueDate: "2027-01-07", amount: 1600 },
    ],
  });
  const examplePath = path.join(directory, "example.json");
  await fs.writeFile(examplePath, JSON.stringify({
    schemaVersion: 1,
    batch: { id: "fashion-week-e2e", label: "E2E batch", templateId: "fashion-week" },
    records: [
      { id: "brand-one", status: "pending", input: input("Brand One"), verifiedAt: null },
      { id: "brand-two", status: "pending", input: input("Brand Two"), verifiedAt: null },
    ],
  }));
  const batchesDirectory = path.join(directory, "runtime", "verified-batches");
  const reviewStore = createReviewStore({ examplePath, queuePath: path.join(directory, "runtime", "review-queue.json") });
  const verifiedBatchStore = createVerifiedBatchStore({ baseDirectory: batchesDirectory });
  const server = createAppServer({ reviewStore, verifiedBatchStore });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  context.after(() => server.close());
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const model = async () => (await fetch(`${baseUrl}/api/verified-batch`)).json();
  const verify = async (id, brand) => fetch(`${baseUrl}/api/review-queue/${id}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: input(brand) }),
  });

  assert.equal((await model()).status, "not_started");

  const first = await verify("brand-one", "Brand One");
  assert.equal(first.status, 200);
  const firstBody = await first.json();
  assert.equal(firstBody.record.status, "verified");
  assert.equal(firstBody.record.artifact.artifactStatus, "valid");
  const afterFirst = await model();
  assert.equal(afterFirst.status, "in_progress");
  assert.equal(afterFirst.validCount, 1);
  assert.equal(afterFirst.expectedCount, 2);
  const batchDirectory = path.join(batchesDirectory, (await fs.readdir(batchesDirectory))[0]);
  const firstFile = path.join(batchDirectory, firstBody.record.artifact.relativePath);
  assert.match(await fs.readFile(firstFile, "utf8"), /^---\nschema_version: 1\nstatus: verified\n/);

  const second = await verify("brand-two", "Brand Two");
  assert.equal(second.status, 200);
  const secondBody = await second.json();
  const complete = await model();
  assert.equal(complete.status, "complete");
  assert.equal(complete.validCount, 2);
  assert.ok(complete.completedAt);

  const secondFile = path.join(batchDirectory, secondBody.record.artifact.relativePath);
  await fs.writeFile(secondFile, "tampered", "utf8");
  const tampered = await model();
  assert.equal(tampered.status, "needs_attention");
  assert.equal(tampered.validCount, 1);
  assert.equal(tampered.completedAt, null);
  assert.equal(tampered.contracts.find((entry) => entry.recordId === "brand-two").artifactStatus, "invalid");

  const repair = await fetch(`${baseUrl}/api/review-queue/brand-two/recreate-artifact`, { method: "POST" });
  assert.equal(repair.status, 200);
  const repairedModel = await model();
  assert.equal(repairedModel.status, "complete");
  assert.equal(repairedModel.validCount, 2);
  assert.match(await fs.readFile(secondFile, "utf8"), /^---\nschema_version: 1\nstatus: verified\n/);

  const duplicate = await verify("brand-one", "Brand One");
  assert.equal(duplicate.status, 409);
});
