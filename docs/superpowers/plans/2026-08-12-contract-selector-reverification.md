# Contract Selector and Reverification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the expanding brand-card queue with a status-aware dropdown and make verified contracts safely editable and re-verifiable through one canonical Markdown handoff.

**Architecture:** Keep selection logic in the browser and persistence rules in `review-store.mjs`. Extend queue status with `changes_pending`, and make verification an idempotent atomic upsert keyed by the existing deterministic batch-and-record filename.

**Tech Stack:** Node.js 24, native `node:test`, browser ES modules, local HTTP server, HTML/CSS, in-app Browser.

---

### Task 1: Reverification persistence

**Files:**
- Modify: `test/review-store.test.mjs`
- Modify: `src/review-store.mjs`

- [ ] Add a failing test that verifies a contract, saves a changed draft, and expects `changes_pending` while retaining the prior verification timestamp.
- [ ] Run `node --test test/review-store.test.mjs` and confirm failure because verified drafts are rejected.
- [ ] Permit a verified record draft to transition to `changes_pending`, and render that status as incomplete in queue progress.
- [ ] Add a failing test that re-verifies changed content and expects one canonical file, `revision: 2`, and the first hash in `supersedes_sha256`.
- [ ] Add a failing test that simulates a pending queue with an existing identical handoff and expects recovery without a second revision.
- [ ] Run the store tests and confirm failure because the handoff uses exclusive-create mode.
- [ ] Add same-directory atomic writing and minimal handoff frontmatter parsing for revision/hash recovery, then make verification overwrite only the canonical path.
- [ ] Run `node --test test/review-store.test.mjs` and confirm all store tests pass.

### Task 2: Compact selector interface

**Files:**
- Modify: `test/server.test.mjs`
- Modify: `public/index.html`
- Modify: `public/app.js`
- Modify: `public/styles.css`

- [ ] Add failing static contract tests for a `reviewQueueSelect` dropdown, selected-record status presentation, and removal of the card-list container.
- [ ] Run `node --test test/server.test.mjs` and confirm the selector assertions fail.
- [ ] Replace the queue card container with a labeled select and selected-record detail/status block.
- [ ] Render every record as one option using `✓`, `●`, or `!`; synchronize the selected value after selection and refresh.
- [ ] Wire selector changes through `selectRecord`, preserving draft save and Preview regeneration.
- [ ] Update verified editing so Edit unlocks controls, the first saved change adopts the returned `changes_pending` status, and the main action reads **Update verification**.
- [ ] Keep post-verification selection of the next incomplete record and synchronize the dropdown after the jump.
- [ ] Replace obsolete card styles with compact selector and colored selected-status styles.
- [ ] Run `node --test test/server.test.mjs` and confirm the UI contract tests pass.

### Task 3: End-to-end verification and documentation

**Files:**
- Modify: `Work/AnnaFlyingSolo/decisions/local-contract-review-app-2026-08-12.md` in the Knowledge Base
- Modify: `Work/AnnaFlyingSolo/development-log/2026-08.md` in the Knowledge Base
- Modify: `Memory/Logs/2026-08.md` in the Knowledge Base

- [ ] Run `npm test` and require zero failures.
- [ ] Start the local app and use the in-app Browser to upload `8.9.26_FW.xlsx`.
- [ ] Verify that only the selector occupies sidebar queue space, statuses are readable, and selecting options updates the preview.
- [ ] Verify a valid contract and confirm automatic advance to the next incomplete option.
- [ ] Re-select the verified option, edit it, confirm `changes_pending`, and update verification.
- [ ] Confirm the record still owns exactly one Markdown path and that its final resolved section has no placeholders.
- [ ] Update the durable decision and development log with the selector and canonical revision behavior; append one operational session-log line.
- [ ] Run the scoped vault validator and commit only the canonical Knowledge Base files.
- [ ] Run `git diff --check`, inspect both repository statuses, and commit the app implementation locally.
