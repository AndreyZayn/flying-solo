# Markdown Contract Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake highlighted contract surface with a real placeholder-aware Markdown editor whose Preview and copied Markdown use current validated form values.

**Architecture:** EasyMDE owns the editable Markdown source. The server separately returns the protected Markdown template and a validated placeholder context; a browser-compatible resolver applies conditions and values before EasyMDE renders sanitized Preview HTML.

**Tech Stack:** Vanilla ES modules, Node HTTP server, EasyMDE, DOMPurify, Node test runner.

---

### Task 1: Placeholder resolver and Markdown template

**Files:**
- Create: `public/markdown-template.mjs`
- Create: `templates/fashion-week.md`
- Create: `test/markdown-template.test.mjs`

- [ ] **Step 1: Write failing resolver tests**

Cover value substitution, false/true `{{#IF NAME}}...{{/IF}}` blocks, Markdown escaping, and errors for unknown or malformed tokens.

- [ ] **Step 2: Run the resolver test and verify RED**

Run: `node --test test/markdown-template.test.mjs`

Expected: FAIL because `public/markdown-template.mjs` does not exist.

- [ ] **Step 3: Implement the minimal resolver**

Export `escapeMarkdownValue(value)` and `resolveMarkdownTemplate(template, context)`. Support uppercase keys, non-nested IF blocks, deterministic errors, and no raw HTML insertion.

- [ ] **Step 4: Convert the protected HTML template to Markdown**

Preserve every legal sentence and its ordering. Use `##` for EVENT AGREEMENT, `###` for approved subheadings, Markdown emphasis, lists, approved simple placeholders, and IF blocks for grant, accessory, and optional payment rows.

- [ ] **Step 5: Run the resolver tests and verify GREEN**

Run: `node --test test/markdown-template.test.mjs`

Expected: all resolver tests pass.

### Task 2: Validation output and template endpoint

**Files:**
- Modify: `src/contract-engine.mjs`
- Modify: `server.mjs`
- Modify: `test/contract-engine.test.mjs`
- Modify: `test/server.test.mjs`

- [ ] **Step 1: Update engine and server tests first**

Assert that `buildContract()` returns `{ title, placeholders, commercial }`, with formatted placeholder values and boolean condition flags. Assert `GET /api/template` returns the protected Markdown source.

- [ ] **Step 2: Run targeted tests and verify RED**

Run: `node --test test/contract-engine.test.mjs test/server.test.mjs`

Expected: FAIL because the API still returns pre-rendered HTML and has no template endpoint.

- [ ] **Step 3: Refactor `buildContract()` without changing validation**

Remove HTML highlighting/rendering. Retain event, category, pricing, grant, payment, date, and title validation. Return formatted placeholder values for event, brand, representative, commercial amounts, clothing full price, three payment slots, and condition flags.

- [ ] **Step 4: Serve the Markdown source**

Read `templates/fashion-week.md` and return it as `text/markdown; charset=utf-8` from `GET /api/template`.

- [ ] **Step 5: Run targeted tests and verify GREEN**

Run: `node --test test/contract-engine.test.mjs test/server.test.mjs`

Expected: all targeted tests pass.

### Task 3: Local editor dependencies and UI structure

**Files:**
- Modify: `package.json`
- Create: `package-lock.json`
- Modify: `server.mjs`
- Modify: `public/index.html`
- Modify: `public/styles.css`
- Modify: `test/server.test.mjs`

- [ ] **Step 1: Add failing HTML/static-asset assertions**

Assert the page contains a Markdown textarea, separate editor and preview panels, the exact `Preview` and `Copy Markdown` labels, EasyMDE and DOMPurify assets, and no `Clean preview` or `Copy HTML body` text.

- [ ] **Step 2: Run the server test and verify RED**

Run: `node --test --test-name-pattern="serves the dashboard" test/server.test.mjs`

Expected: FAIL on the missing editor controls and vendor assets.

- [ ] **Step 3: Install pinned dependencies**

Run: `npm install easymde dompurify`

Serve EasyMDE CSS/JS and DOMPurify JS from their local `node_modules` distribution paths; do not use a runtime CDN.

- [ ] **Step 4: Build the two-panel document area**

Keep the existing toolbar position. Rename Clean Preview to Preview and Copy HTML body to Copy Markdown. Add the editor textarea inside an editor panel and keep the styled article inside a separate hidden preview panel.

- [ ] **Step 5: Scope styles correctly**

Preserve `.contract-document` visual values unchanged. Add only editor-shell, EasyMDE, placeholder-highlight, selected-panel, and responsive rules.

- [ ] **Step 6: Run the server test and verify GREEN**

Run: `node --test --test-name-pattern="serves the dashboard" test/server.test.mjs`

Expected: the dashboard/static-asset test passes.

### Task 4: Editor, Preview, and Copy Markdown behavior

**Files:**
- Modify: `public/app.js`
- Modify: `test/server.test.mjs`

- [ ] **Step 1: Add source-level behavior assertions**

Assert the browser module initializes EasyMDE, reads `/api/template`, resolves the current editor value with validated placeholders, sanitizes Preview HTML, and copies resolved Markdown.

- [ ] **Step 2: Run the server test and verify RED**

Run: `node --test test/server.test.mjs`

Expected: FAIL because the old view swaps generated HTML.

- [ ] **Step 3: Initialize EasyMDE once**

Load the template and configuration during initialization. Configure a formatting toolbar without EasyMDE preview/fullscreen controls, register placeholder-token highlighting, and retain editor state across tab switches.

- [ ] **Step 4: Separate validation from source editing**

Form events continue calling `/api/generate`, but successful responses update only title, commercial UI, status, and placeholder context. They never replace the EasyMDE value.

- [ ] **Step 5: Render Preview safely**

Resolve the editor Markdown with the current placeholder context, convert it using EasyMDE, sanitize with DOMPurify, and place the result in `.contract-document`. Surface placeholder errors through the existing status/error components.

- [ ] **Step 6: Copy resolved Markdown**

Use the same resolver as Preview and copy its resolved Markdown string. Show `Markdown copied` only after a successful clipboard write.

- [ ] **Step 7: Run the server tests and verify GREEN**

Run: `node --test test/server.test.mjs`

Expected: all server/UI contract tests pass.

### Task 5: End-to-end verification and documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the source-of-truth documentation**

Document `templates/fashion-week.md`, the placeholder grammar, the Editor/Preview workflow, and resolved Markdown copying.

- [ ] **Step 2: Run the complete automated suite**

Run: `node --check public/app.js && node --test`

Expected: zero failures.

- [ ] **Step 3: Verify the live browser workflow**

Edit legal-body Markdown, change a brand/form value, confirm the edit remains, click Preview, confirm placeholders resolve and existing contract styling remains, return to Editor, and confirm the Markdown source is unchanged.

- [ ] **Step 4: Verify clipboard output**

Click Copy Markdown and confirm clipboard text contains the manual edit and current resolved brand/payment values, contains Markdown headings, and contains no unresolved `{{...}}` tokens or HTML tags.

