# Workbook and Template-Family Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real Excel batch upload and a reusable multi-contract-family workflow with Fashion Week and Membership templates, preview/edit/verify review, and immutable temporary Markdown handoffs.

**Architecture:** Keep the existing file-backed queue, template store, editor, and handoff store. Add a family dispatcher with separate Fashion Week and Membership engines, an Excel importer that emits normalized queue records plus row issues, and family-aware UI forms and template controls.

**Tech Stack:** Node.js, vanilla JavaScript, ExcelJS, TOAST UI Editor, Markdown, JSON, Node test runner.

---

### Task 1: Excel importer and queue replacement

**Files:**
- Create: `src/workbook-importer.mjs`
- Modify: `src/review-store.mjs`
- Create: `test/workbook-importer.test.mjs`
- Modify: `test/review-store.test.mjs`

- [ ] Write a failing in-memory ExcelJS test with the supplied Fashion Week headers and representative valid/invalid rows.
- [ ] Run the focused tests and confirm failure because import and queue replacement APIs do not exist.
- [ ] Implement strict header normalization, Excel date conversion, normalized Fashion Week records, source-row metadata, issue capture, and atomic `replaceQueue`.
- [ ] Re-run the focused tests and confirm they pass.

### Task 2: Membership family and generic template validation

**Files:**
- Create: `src/membership-engine.mjs`
- Create: `src/contract-families.mjs`
- Create: `config/membership-registry.json`
- Create: `config/membership-placeholders.json`
- Create: `templates/membership.md`
- Modify: `config/contract-templates.json`
- Modify: `src/template-store.mjs`
- Create: `test/membership-engine.test.mjs`
- Modify: `test/template-store.test.mjs`

- [ ] Write failing tests for package matching, duration benefit, inclusive term end, cancellation deadline, title, placeholders, and Membership template validation.
- [ ] Run the focused tests and confirm the missing family behavior.
- [ ] Implement the Membership engine, shared dispatcher, protected Markdown template, placeholder registry, and per-template required heading.
- [ ] Re-run the focused tests and confirm Fashion Week and Membership both pass.

### Task 3: Import and family-aware server APIs

**Files:**
- Modify: `server.mjs`
- Modify: `test/server.test.mjs`

- [ ] Write failing API tests for raw workbook upload, Membership demo loading, template-scoped placeholders/config, queue replacement, and family-aware generation/verification.
- [ ] Run the server tests and confirm the expected endpoint failures.
- [ ] Add bounded binary-body reading, `/api/import-workbook`, `/api/demo/membership`, scoped placeholder/config endpoints, and dispatcher-backed generation and verification.
- [ ] Re-run server and full unit tests.

### Task 4: Upload and multi-family review UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `test/server.test.mjs`
- Modify: `test/preview-mode.test.mjs`

- [ ] Add failing static/UI behavior assertions for contract-type selection, XLSX upload, import summary, Membership demo, family-specific fields, queue attention state, and active-template saving.
- [ ] Add the upload panel and template selector, reload the queue after imports, render family-specific forms, preserve preview-first/edit behavior, and show source row/import issues.
- [ ] Keep draft autosave, template save, verification advancement, and copy behavior working for both families.
- [ ] Run UI-related and full tests.

### Task 5: Sample import and browser verification

**Files:**
- Modify: `README.md`
- Runtime only: `data/runtime/**`

- [ ] Document workbook headers, supported families, local Membership demo, verified Markdown semantics, and known source-error review behavior.
- [ ] Run the full test suite with fresh evidence.
- [ ] Start the app and upload `/Users/andrey/Downloads/8.9.26_FW.xlsx` in the in-app Browser.
- [ ] Verify imported record count, representative valid/attention rows, preview/edit persistence, template save, Membership demo, verification, and handoff contents.

### Task 6: Knowledge Base and handoff

**Files:**
- Modify existing AnnaFlyingSolo product/decision notes selected through the project index.
- Update: `Work/AnnaFlyingSolo/development-log/INDEX.md` and `Work/AnnaFlyingSolo/development-log/2026-08.md` if the requested log is created with the project index updated.
- Update: `Memory/Logs/2026-08.md`
- Update: `date.md`

- [ ] Record the local implementation authorization, workflow, family-adapter decision, workbook schema, Markdown handoff contract, verification evidence, and remaining non-goals.
- [ ] Validate each modified canonical Knowledge Base file with `scripts/validate_vault.py --files`.
- [ ] Commit and push canonical Knowledge Base changes separately from operational log/date edits.
- [ ] Run final repo tests, inspect the Git diff/status, and report any pre-existing uncommitted changes distinctly.
