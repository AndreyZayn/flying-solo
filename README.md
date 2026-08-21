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

## Local verification state and verified batches

When Anna marks a contract verified, the server regenerates and revalidates the resolved contract, then **immediately writes one verified Markdown contract file** into the active batch's dated directory before the queue records the verified status. A `verified` flag in the queue is never the only evidence — every verified record has a validated file on disk.

Each batch owns one local, Git-ignored directory:

```text
data/runtime/verified-batches/
└── YYYY-MM-DD--<batch-id>/
    ├── batch.json                      # atomic manifest: counts, status, per-contract health
    └── contracts/
        └── 001--<record-id>--<brand-slug>.md
```

- The directory date is the local date of the first successful verification; the location is stored with the active queue so it stays stable across restarts and reverification.
- Every contract file keeps the `schema_version: 1`, `status: verified` envelope (normalized input, reviewed template Markdown, reviewed title template, resolved contract Markdown, content hash, revision, prior hash).
- After writing, the file is read back, parsed, and validated (identifiers, sections, unresolved placeholders, content hash, file hash) before `batch.json` and the queue are updated.
- Reverification atomically replaces the same stable file; the revision increments only when content changed, and an identical retry recovers without a duplicate revision.
- Starting a new batch never deletes an earlier verified-batch directory.

The **Verified batch** panel in the Contracts sidebar shows the batch directory path (with a copy control), `valid of expected` file progress, per-record artifact health, and a completion time only when every expected file exists and passes validation. Startup and every dashboard refresh reconcile the manifest with disk through the read-only `/api/verified-batch` endpoint: a missing or altered file flips the batch to **Needs attention**, drops it from the valid count, and exposes **Recreate verified file** on the affected verified record, which reruns the same server-side validation and atomic persistence path. The completion banner means both queue completion *and* verified-file health.

A later source-data edit changes the record to `changes_pending` until it is verified again. Contract Builder still has no downstream automation, installable skill, native package, or connection to SignatureConfirm, Square, Airtable, or a workbook. Use **Copy Markdown** when a reviewed contract needs to be pasted manually into another tool.

`data/runtime/` is ignored by Git because it contains local operational data, including the verified-batch directories. Remove it only when its local queue, saved-template, and verified-batch data are no longer needed.

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
- Clicking **Mark verified** validates the resolved contract, writes and validates the verified contract file in `data/runtime/verified-batches/`, and only then records verified state (with the artifact path, revision, and hashes) in `data/runtime/review-queue.json`.
- `data/runtime/review-queue.json` is an operational index, not a contract source: downstream tooling reads the verified Markdown contract files, never reconstructs a contract from queue state.
- `data/runtime/` is intentionally excluded from Git because it contains local operational brand data.
- A batch is complete only when every record in its review queue is verified **and** every expected verified contract file exists and passes validation.
- Preview mode shows sourced fields as read-only alongside the resolved contract. **Edit contract** unlocks fields and reveals the placeholder controls and visual editor.

## Placeholder syntax

- `{{BRAND_NAME}}` inserts one generated value.
- `{{#IF GRANT_ENABLED}}…{{/IF}}` keeps the enclosed content only when that condition is active.
- Use the sidebar Insert buttons to place tokens at the current editor cursor. Conditional body insertions always add both brackets as a complete block. In a title, they add editable optional title text between the two brackets.
- Placeholder groups use operator language (`Fashion week`, `People and brand`, `Membership details`, `Payment schedule`, `Show only when`). Each inserted placeholder shows whether it is in body text, a heading, a list item, bold, italic, or the title.
- Adding a new placeholder requires both a registry entry and a value in `src/contract-engine.mjs`; the runtime consistency check prevents one from being added without the other.
