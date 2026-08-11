# Flying Solo Contract Review

A localhost-only queue for reviewing, editing, verifying, and storing Flying Solo contracts. It currently supports Fashion Week contracts and is structured to add other contract families through the template registry.

## Run

```bash
npm start
```

Open `http://localhost:4173`.

## Test

```bash
npm test
```

## Source of truth

- `config/contract-templates.json` registers every reusable contract template and its required placeholders.
- `templates/fashion-week.md` contains protected contract wording and placeholder positions.
- `config/fashion-week-registry.json` contains supported events, category prices, aliases, and the approved grant label/default.
- `config/fashion-week-placeholders.json` contains every placeholder shown in the sidebar, including its label, description, type, and visual group. Add or revise display metadata there; the server rejects duplicate, malformed, or out-of-sync keys.
- Saving a template creates a timestamped previous version under `templates/history/<template-id>/` before replacing the active template.
- The Editor is a visual WYSIWYG document backed by Markdown. Form fields resolve `{{PLACEHOLDER}}` values and `{{#IF FLAG}}…{{/IF}}` blocks only when Preview or Copy Markdown is used, so manual edits are preserved when form values change.
- Copy Markdown places resolved Markdown and matching rich text on the clipboard. SignatureConfirm receives the rich formatting; plain-text destinations receive Markdown. Neither representation contains unresolved placeholder tokens.

## Review data

- `data/review-queue.example.json` documents the normalized input boundary for a batch. XLS or agent parsing should produce this shape; parsing is intentionally outside this app for now.
- On first run, the app copies that example to `data/runtime/review-queue.json`. Draft field values and per-brand template edits are saved there automatically.
- Clicking **Mark verified** validates and stores the exact template Markdown, resolved Markdown, normalized input, title, time, and reviewer in `data/runtime/completed-contracts.json`.
- `data/runtime/` is intentionally excluded from Git because it contains operational brand data. Future local agents should read `completed-contracts.json` as the completed-contract handoff.
- A batch is complete only when every record in its review queue is verified.
- Preview mode shows sourced fields as read-only alongside the resolved contract. **Edit contract** unlocks fields and reveals the placeholder controls and visual editor.

## Placeholder syntax

- `{{BRAND_NAME}}` inserts one generated value.
- `{{#IF GRANT_ENABLED}}…{{/IF}}` keeps the enclosed content only when that condition is active.
- Use the sidebar Insert buttons to place tokens at the current editor cursor. Conditional Insert buttons always add both brackets as a complete block.
- Adding a new placeholder requires both a registry entry and a value in `src/contract-engine.mjs`; the runtime consistency check prevents one from being added without the other.
