# Flying Solo Source Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark the eight Flying Solo-sourced inputs with a compact accessible gold asterisk.

**Architecture:** Static semantic marker spans live beside the existing labels in `public/index.html`; one CSS rule controls their appearance. No JavaScript or contract-generation code changes.

**Tech Stack:** HTML, CSS, Node test runner.

---

### Task 1: Source markers

**Files:**
- Modify: `test/server.test.mjs`
- Modify: `public/index.html`
- Modify: `public/styles.css`

- [ ] Add assertions requiring exactly eight source markers with the accessible Flying Solo tooltip and each requested label.
- [ ] Run `node --test test/server.test.mjs` and confirm those assertions fail because the markers do not exist.
- [ ] Wrap the relevant label text where needed and add `<span class="source-indicator" title="Sourced from Flying Solo data" aria-label="Sourced from Flying Solo data">*</span>` beside all eight labels.
- [ ] Style `.source-indicator` as a small gold superscript without changing field layout.
- [ ] Run `npm test` and confirm all tests pass.
- [ ] Reload localhost and visually verify placement at desktop and narrow widths.
