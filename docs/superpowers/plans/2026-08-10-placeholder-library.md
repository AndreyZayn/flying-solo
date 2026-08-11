# Fashion Week Placeholder Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a registry-backed visual placeholder library below the payment schedule with search, live values, and cursor insertion.

**Architecture:** A JSON registry defines display metadata. The server validates and exposes it; the existing frontend renders and inserts its tokens through TOAST UI Editor without changing template resolution.

**Tech Stack:** Node.js, vanilla JavaScript, TOAST UI Editor, CSS, Node test runner.

---

### Task 1: Placeholder registry and API

**Files:**
- Create: `config/fashion-week-placeholders.json`
- Modify: `server.mjs`
- Modify: `test/server.test.mjs`

- [ ] Write failing server tests for the registry endpoint and required value/condition entries.
- [ ] Run `node --test test/server.test.mjs` and confirm the endpoint assertion fails.
- [ ] Add and validate the JSON registry, then expose it at `/api/placeholders`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Visual placeholder panel

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `test/server.test.mjs`

- [ ] Write failing assertions for the panel, search input, live values, and insertion calls.
- [ ] Run the focused test and confirm the new assertions fail.
- [ ] Render grouped registry items below Payment schedule and update their values after generation.
- [ ] Insert `{{KEY}}` or a complete `{{#IF KEY}}...{{/IF}}` block at the current editor cursor using `contractEditor.insertText()`.
- [ ] Add compact sidebar styling and filtering without changing existing editor or preview styles.
- [ ] Re-run focused tests and confirm they pass.

### Task 3: Browser and regression verification

**Files:**
- Modify only if verification reveals a defect.

- [ ] Run `npm test` and confirm zero failures.
- [ ] Reload localhost and verify the full list, current values, search, value insertion, conditional insertion, Preview, and Copy Markdown.
- [ ] Leave the localhost server running with the editor restored to its default state.
