# Flying Solo Contract Review

A localhost-only workspace for preparing reusable templates, reviewing batches, verifying contracts, and storing handoffs. It supports Fashion Week workbook batches and a local Membership mock through one contract-family registry.

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

`config/contract-templates.json` registers each family, its protected Markdown template, required heading, required placeholders, and placeholder registry. The shared UI and verified-Markdown handoff stay the same; each family has an independent engine and catalog.

- **Fashion Week** uses the uploaded workbook, category prices, grant difference, and up to three source payment pairs.
- **Membership** uses the approved package/duration catalog, derives the inclusive term end and cancellation deadline, and renders the protected Membership agreement. Selecting a Membership template in **Start a batch** loads local mock data, so the workflow can be tested without a real brand.

## Template library

The app opens in **Templates**, which shows every available contract template. Choose **New template**, name it, and select an existing template to start from. **Copy** does the same thing with that template already selected. To create a revision, make a copy and include the name you want, such as `Fashion Week v1`.

Each named template keeps its approved family’s placeholder registry, contract engine, commercial validation, and batch adapter. A generic unvalidated agreement family is not created accidentally.

Each template has two editable parts:

- a one-line **contract title template** with values and conditional title text;
- the rich-text **contract body**.

Saving updates the selected template in place. There is no automatic version number, history, restore action, or snapshot file.

The same title/body editors are available from batch review. Per-record title and body edits remain drafts until verification; the verified handoff preserves both the resolved title and the reviewed title template.

## Temporary verified-contract handoff

Each run uses local temporary files only. When Anna marks a contract verified, the app creates one Markdown file at `data/runtime/verified-contracts/<batch-id>--<record-id>.md`.

Every handoff file is marked `status: verified` in YAML frontmatter and contains the normalized Flying Solo input, reviewed title template, reviewed body Markdown, resolved title, exact resolved contract Markdown, reviewer/time, and SHA-256 hash. A SignatureConfirm agent may use only the **Verified contract Markdown** section from these files to create a draft; it must not alter the file or use a pending review record.

`data/runtime/` is ignored by Git and may be removed after the run is complete and the needed SignatureConfirm drafts have been created.

## Test

```bash
npm test
```

## Source of truth

- `config/contract-templates.json` registers every built-in template family, its default title template, protected body Markdown, and required placeholders.
- `data/runtime/template-library.json` stores local custom-template metadata and title overrides; custom template bodies and current runtime state remain local and Git-ignored.
- `templates/fashion-week.md` contains protected contract wording and placeholder positions.
- `config/fashion-week-registry.json` contains supported events, category prices, aliases, and the approved grant label/default.
- `config/fashion-week-placeholders.json` contains every placeholder shown in the sidebar, including its label, description, type, and visual group. Add or revise display metadata there; the server rejects duplicate, malformed, or out-of-sync keys.
- Saving a template replaces its current title/body in place; named copies are the only revision mechanism.
- The Editor is a visual WYSIWYG document backed by Markdown. Form fields resolve `{{PLACEHOLDER}}` values and `{{#IF FLAG}}…{{/IF}}` blocks only when Preview or Copy Markdown is used, so manual edits are preserved when form values change.
- Copy Markdown places resolved Markdown and matching rich text on the clipboard. SignatureConfirm receives the rich formatting; plain-text destinations receive Markdown. Neither representation contains unresolved placeholder tokens.

## Review data

- `data/review-queue.example.json` documents the normalized input boundary. The Fashion Week `.xlsx` importer now creates this shape; future workbook families add their own parser without changing the queue contract.
- On first run, the app copies that example to `data/runtime/review-queue.json`. Draft field values and per-brand template edits are saved there automatically.
- Clicking **Mark verified** validates and writes one marked verified-contract Markdown handoff file under `data/runtime/verified-contracts/`.
- `data/runtime/` is intentionally excluded from Git because it contains temporary operational brand data. Future SignatureConfirm agents should use only files marked `status: verified`; they must not use pending local drafts as a contract source.
- A batch is complete only when every record in its review queue is verified.
- Preview mode shows sourced fields as read-only alongside the resolved contract. **Edit contract** unlocks fields and reveals the placeholder controls and visual editor.

## Placeholder syntax

- `{{BRAND_NAME}}` inserts one generated value.
- `{{#IF GRANT_ENABLED}}…{{/IF}}` keeps the enclosed content only when that condition is active.
- Use the sidebar Insert buttons to place tokens at the current editor cursor. Conditional body insertions always add both brackets as a complete block. In a title, they add editable optional title text between the two brackets.
- Placeholder groups use operator language (`Fashion week`, `People and brand`, `Membership details`, `Payment schedule`, `Show only when`). Each inserted placeholder shows whether it is in body text, a heading, a list item, bold, italic, or the title.
- Adding a new placeholder requires both a registry entry and a value in `src/contract-engine.mjs`; the runtime consistency check prevents one from being added without the other.
