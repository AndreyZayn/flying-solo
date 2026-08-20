# Flying Solo Contract Review

A local web workspace for preparing reusable templates, reviewing batches, and verifying contracts. It supports Fashion Week workbook batches and a local Membership mock through one contract-family registry.

## Run

```bash
npm start
```

Open `http://localhost:4173`.

## Upload a Fashion Week workbook

Choose **Fashion Week Participation Agreement**, select an `.xlsx` file, and click **Upload workbook**. The importer reads the first worksheet and expects these headers: `FW`, `Season`, `Brand`, `Name`, `Email`, `Category`, `LIST_PRICE`, `Discount`, plus `PMNT_1` / `PMNT_1_DUE` and optional second and third payment pairs.

Every non-empty row becomes one review record. Workbook values are preserved; the importer does not silently repair prices, categories, payment totals, or payment dates. Rows that do not pass contract validation remain in the queue as **Attention** and can be corrected in **Edit contract** before verification.

The supplied `8.9.26_FW.xlsx` sample imports 29 records. Nine source rows (19–27) require review because payment 2 and payment 3 use the same due date.

## Supported template families

`config/contract-templates.json` registers each family, its protected Markdown template, required heading, required placeholders, and placeholder registry. The shared UI and local review queue stay the same; each family has an independent engine and catalog.

- **Fashion Week** uses the uploaded workbook, category prices, grant difference, and up to three source payment pairs.
- **Membership** uses the approved package/duration catalog, derives the inclusive term end and cancellation deadline, and renders the protected Membership agreement. Selecting a Membership template in **Start a batch** loads local mock data, so the workflow can be tested without a real brand.

## Template library

The app opens in **Templates**, which shows every available contract template. Choose **New template**, name it, and select an existing template to start from. **Copy** does the same thing with that template already selected. To create a revision, make a copy and include the name you want, such as `Fashion Week v1`.

Each named template keeps its approved family’s placeholder registry, contract engine, commercial validation, and batch adapter. A generic unvalidated agreement family is not created accidentally.

Each template has two editable parts:

- a one-line **contract title template** with values and conditional title text;
- the rich-text **contract body**.

Saving updates the selected template in place. There is no automatic version number, history, restore action, or snapshot file.

Batch review exposes only sourced record data and a resolved preview. Reusable title and body changes happen in **Templates**, then the selected template is used for the batch.

## Local verification state

When Anna marks a contract verified, the app revalidates the current record and saves its verified status in the local review queue. A later source-data edit changes the status to `changes_pending` until it is verified again.

Contract Builder has no downstream automation, installable skill, native package, or connection to SignatureConfirm, Square, Airtable, or a workbook. Use **Copy Markdown** when a reviewed contract needs to be pasted manually into another tool.

`data/runtime/` is ignored by Git because it contains local operational data. Remove it only when its local queue and saved-template data are no longer needed.

## Test

```bash
npm test
```

## Use from GitHub

Clone the repository, install dependencies, then run the local server:

```bash
git clone https://github.com/AndreyZayn/flying-solo.git
cd flying-solo
npm install
npm start
```

Pull the shared branch before starting a new session. No app bundle or Codex skill needs to be installed.

## Source of truth

- `config/contract-templates.json` registers every built-in template family, its default title template, protected body Markdown, and required placeholders.
- `data/runtime/template-library.json` stores local custom-template metadata and title overrides; custom template bodies and current runtime state remain local and Git-ignored.
- `templates/fashion-week.md` contains protected contract wording and placeholder positions.
- `config/fashion-week-registry.json` contains supported events, category prices, aliases, and the approved grant label/default.
- `config/fashion-week-placeholders.json` contains every placeholder shown in the sidebar, including its label, description, type, and visual group. Add or revise display metadata there; the server rejects duplicate, malformed, or out-of-sync keys.
- Saving a template replaces its current title/body in place; named copies are the only revision mechanism.
- The Editor is a visual WYSIWYG document backed by Markdown. Form fields resolve `{{PLACEHOLDER}}` values and `{{#IF FLAG}}…{{/IF}}` blocks only when Preview or Copy Markdown is used, so manual edits are preserved when form values change.
- Copy Markdown places resolved Markdown and matching rich text on the clipboard. Plain-text destinations receive Markdown. Neither representation contains unresolved placeholder tokens.

## Review data

- `data/review-queue.example.json` documents the normalized input boundary. The Fashion Week `.xlsx` importer now creates this shape; future workbook families add their own parser without changing the queue contract.
- On first run, the app copies that example to `data/runtime/review-queue.json`. Draft field values and per-brand template edits are saved there automatically.
- Clicking **Mark verified** validates the resolved contract and records verified state in `data/runtime/review-queue.json`.
- `data/runtime/` is intentionally excluded from Git because it contains local operational brand data; it is not an exchange format for another app or agent.
- A batch is complete only when every record in its review queue is verified.
- Preview mode shows sourced fields as read-only alongside the resolved contract. **Edit contract** unlocks fields and reveals the placeholder controls and visual editor.

## Placeholder syntax

- `{{BRAND_NAME}}` inserts one generated value.
- `{{#IF GRANT_ENABLED}}…{{/IF}}` keeps the enclosed content only when that condition is active.
- Use the sidebar Insert buttons to place tokens at the current editor cursor. Conditional body insertions always add both brackets as a complete block. In a title, they add editable optional title text between the two brackets.
- Placeholder groups use operator language (`Fashion week`, `People and brand`, `Membership details`, `Payment schedule`, `Show only when`). Each inserted placeholder shows whether it is in body text, a heading, a list item, bold, italic, or the title.
- Adding a new placeholder requires both a registry entry and a value in `src/contract-engine.mjs`; the runtime consistency check prevents one from being added without the other.
