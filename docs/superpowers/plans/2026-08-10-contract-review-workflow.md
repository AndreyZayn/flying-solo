# Flying Solo Contract Review Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a preview-first, persistent, multi-brand contract review queue with reusable saved templates and verified-contract archiving.

**Architecture:** A file-backed store owns queue, template, draft, and archive persistence behind local JSON APIs. The existing contract engine remains the Fashion Week validator and renderer; the frontend becomes a queue-driven review workspace.

**Tech Stack:** Node.js, vanilla JavaScript, TOAST UI Editor, Markdown, JSON files, Node test runner.

---

### Task 1: File-backed queue and archive store

**Files:**
- Create: `src/review-store.mjs`
- Create: `data/review-queue.example.json`
- Modify: `.gitignore`
- Create: `test/review-store.test.mjs`

- [ ] Write failing tests for first-run seeding, queue reads, draft updates, verification, duplicate-verification rejection, and atomic archive persistence.
- [ ] Run the focused test and confirm failure because the store is absent.
- [ ] Implement the minimal file-backed store and normalized record validation.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Template registry and saving

**Files:**
- Create: `config/contract-templates.json`
- Create: `src/template-store.mjs`
- Create: `test/template-store.test.mjs`
- Modify: `server.mjs`

- [ ] Write failing tests for template listing, loading, validation, saving, and timestamped backups.
- [ ] Implement the registry-backed template store and local template APIs.
- [ ] Confirm invalid placeholders and missing required placeholders are rejected.

### Task 3: Queue, draft, and verification APIs

**Files:**
- Modify: `server.mjs`
- Modify: `test/server.test.mjs`

- [ ] Write failing API tests for queue retrieval, draft persistence, verification, archive output, and all-verified progress.
- [ ] Add APIs that use the stores and existing Fashion Week contract engine.
- [ ] Verify resolved output contains no placeholder syntax and duplicate verification is rejected.

### Task 4: Preview-first review UI

**Files:**
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `test/server.test.mjs`

- [ ] Write failing assertions for queue navigation, progress, Preview-first state, Edit contract, Mark Verified, completion state, and Save Template.
- [ ] Replace the single-record interaction with selected-record state while preserving the existing fields, placeholder library, Preview, Editor, and copy controls.
- [ ] Persist the current draft before switching and automatically select the next pending record after verification.
- [ ] Add compact responsive queue and status styling.

### Task 5: Documentation, browser verification, and publication

**Files:**
- Modify: `README.md`

- [ ] Document normalized input, runtime queue, completed archive, template save/history, and the deliberate XLS-parsing boundary.
- [ ] Run `npm test` and confirm zero failures.
- [ ] Verify queue navigation, preview-first loading, record editing, draft persistence, template saving, verification, automatic advancement, and completion in localhost.
- [ ] Commit the implementation, push the feature branch, and open a draft pull request against `main`.
