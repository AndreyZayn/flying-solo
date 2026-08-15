# Template Library Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace automatic template versions with a clear, copy-based template library.

**Architecture:** The template store persists only the current title and body for each named template. The Templates workspace renders a selectable card library and an inline named-copy form, while the existing document editor remains the selected-template editor. Batch selection continues to consume the same template list.

**Tech Stack:** Node.js, native `node:test`, browser JavaScript, HTML, CSS.

---

### Task 1: Remove automatic snapshot persistence

**Files:** `src/template-store.mjs`, `test/template-store.test.mjs`

- [x] Write a failing test proving `save` overwrites the current wording without creating a history directory.
- [x] Run `node --test test/template-store.test.mjs` and confirm the old snapshot behavior fails the test.
- [x] Remove version/history persistence and compatibility-normalize existing state.
- [x] Re-run the store test and commit the green change.

### Task 2: Remove history routes and controls

**Files:** `server.mjs`, `public/app.js`, `public/index.html`, `test/server.test.mjs`, `test/template-workspace-ui.test.mjs`

- [x] Write failing tests that reject history/restore controls and API routes.
- [x] Remove `history`, `restore`, and delete-version code paths; change saving feedback to `Template saved`.
- [x] Run focused server/UI tests and commit the green change.

### Task 3: Build the template library

**Files:** `public/index.html`, `public/app.js`, `public/styles.css`, `test/template-workspace-ui.test.mjs`

- [x] Write failing tests for `templateCards`, `New template`, and `templateSourceSelect`.
- [x] Replace the selector manager with selectable cards and a named copy form; do not display standard/custom/version labels.
- [x] Retain the existing title/body editor, preview, placeholders, batch selector, and active-batch delete protection.
- [x] Run focused UI tests and commit the green change.

### Task 4: Prune obsolete artifacts and verify

**Files:** `templates/history/fashion-week/*`, `README.md`, `test/template-store.test.mjs`

- [x] Confirm the exact history paths, then remove obsolete snapshot artifacts.
- [x] Document that a named copy is the revision mechanism.
- [x] Run `npm test` and browser-check library creation, in-place saving, batch selection, and protected deletion.
- [x] Commit the completed implementation.
