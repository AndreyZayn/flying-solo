# WYSIWYG Contract Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the raw Markdown surface with a compact WYSIWYG contract editor while preserving Markdown storage, placeholder resolution, Preview, and SignatureConfirm-compatible copying.

**Architecture:** TOAST UI Editor owns the editable WYSIWYG document and exposes its Markdown through `getMarkdown()`. Existing browser-side placeholder resolution remains the boundary before Preview and clipboard output; editor-only widget rules visually replace template tokens without changing the stored Markdown.

**Tech Stack:** Vanilla browser JavaScript, Node HTTP server, TOAST UI Editor, DOMPurify, Node test runner.

---

### Task 1: Lock the WYSIWYG integration contract

**Files:**
- Modify: `test/server.test.mjs`

- [ ] **Step 1: Write failing server assertions**

Replace EasyMDE assertions with checks for `/vendor/toastui-editor.min.css`, `/vendor/toastui-editor-all.min.js`, `id="wysiwygEditor"`, `new toastui.Editor`, `initialEditType: "wysiwyg"`, `hideModeSwitch: true`, `usageStatistics: false`, `widgetRules`, and `getMarkdown()`. Assert EasyMDE names and assets are absent.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/server.test.mjs`

Expected: FAIL because the current page and application still use EasyMDE.

### Task 2: Install and serve TOAST UI locally

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `server.mjs`
- Modify: `public/index.html`

- [ ] **Step 1: Replace the editor dependency**

Run: `npm uninstall easymde && npm install @toast-ui/editor`

Expected: `@toast-ui/editor` is pinned in the lockfile and EasyMDE is removed.

- [ ] **Step 2: Serve the local browser bundles**

Map `/vendor/toastui-editor.min.css` to `node_modules/@toast-ui/editor/dist/toastui-editor.min.css` and `/vendor/toastui-editor-all.min.js` to `node_modules/@toast-ui/editor/dist/toastui-editor-all.min.js`. Keep DOMPurify local.

- [ ] **Step 3: Update the editor host element and assets**

Replace the Markdown textarea with `<div id="wysiwygEditor" aria-label="Contract editor"></div>`. Load TOAST UI CSS and JavaScript, and remove EasyMDE tags.

- [ ] **Step 4: Run the focused test**

Run: `node --test test/server.test.mjs`

Expected: integration-asset assertions advance to the application initialization failures.

### Task 3: Replace raw Markdown behavior with WYSIWYG behavior

**Files:**
- Modify: `public/app.js`
- Test: `test/server.test.mjs`

- [ ] **Step 1: Initialize TOAST UI in WYSIWYG-only mode**

Construct `new toastui.Editor` with the fetched Markdown template, `initialEditType: "wysiwyg"`, `hideModeSwitch: true`, `usageStatistics: false`, no autofocus, a compact toolbar, and placeholder `widgetRules`.

- [ ] **Step 2: Preserve the existing Markdown boundary**

Change `resolvedMarkdown()` to resolve `contractEditor.getMarkdown()`. Render sanitized Preview HTML through a hidden TOAST UI viewer without exposing Markdown mode. Copy Markdown writes one `ClipboardItem` with sanitized `text/html` for SignatureConfirm and resolved Markdown as `text/plain`, falling back to `writeText` where rich clipboard APIs are unavailable.

- [ ] **Step 3: Keep editor state stable**

Do not call `setMarkdown()` during form regeneration or tab changes. On returning to Editor, call the editor layout refresh API only if needed. Preserve all validation, abort, title, and form behavior.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --test test/server.test.mjs test/markdown-template.test.mjs`

Expected: PASS.

### Task 4: Make the editor compact and fix preview spacing

**Files:**
- Modify: `public/styles.css`
- Modify: `test/server.test.mjs`

- [ ] **Step 1: Write failing style assertions**

Assert WYSIWYG body text is 14px, editor headings are restrained, editor height is reduced, placeholder widgets have chip styling, RECITALS is regular weight, and `.contract-document h3 + p` removes the heading-to-paragraph gap.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test test/server.test.mjs`

Expected: FAIL because TOAST UI compact styling and the adjacent paragraph spacing rule do not exist.

- [ ] **Step 3: Add scoped editor styling**

Style only `.editor-panel .toastui-editor-*` and `.toastui-editor-ww-container .ProseMirror`: 14px body text, compact heading scale, tighter padding, reduced minimum height, white background, and chip styling via `.contract-placeholder-widget`.

- [ ] **Step 4: Correct preview heading spacing**

Keep `.contract-document h3 { margin: 16px 0 0; }` and `.contract-document h3 + p { margin-top: 0; }`. Preserve the RECITALS leading padding and regular weight.

- [ ] **Step 5: Run the focused test and verify GREEN**

Run: `node --test test/server.test.mjs`

Expected: PASS.

### Task 5: Regression and browser verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the operating note**

Describe the Editor as WYSIWYG while documenting that the protected template and copied output remain Markdown with placeholder resolution at Preview/copy time.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Restart the local server**

Run: `npm start`

Expected: dashboard is available at `http://localhost:4173/` with no missing assets or console errors.

- [ ] **Step 4: Verify the browser workflow**

Confirm the Editor shows formatted content without Markdown syntax or a Markdown mode switch; placeholder chips are visible; body and heading fonts are compact; bold and heading toolbar actions render identically in Preview; “Relationship of the Parties.” touches its following paragraph without the prior extra gap; manual edits survive tab switches; and Copy Markdown pastes formatted rich text into SignatureConfirm while exposing resolved Markdown to plain-text destinations.
