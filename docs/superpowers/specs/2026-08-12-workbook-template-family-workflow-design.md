# Workbook and Template-Family Workflow Design

## Goal

Extend the local Flying Solo review app so Anna can upload an Excel batch, review and edit every brand against a saved contract template, verify records one at a time, and create one temporary Markdown handoff per verified contract. Prove that the same workflow supports more than one contract family with a protected Membership template and a local mock Membership record.

## Product boundary

The app prepares reviewable drafts only. Anna remains the reviewer. It does not send contracts, write to SignatureConfirm, create Square invoices, or write back to a source system. Templates own legal wording; family engines own allowed placeholders, pricing rules, and derived values.

The prior Knowledge Base boundary said this workspace was planning-only. Andrey's 2026-08-12 instruction explicitly authorizes the local implementation and supersedes that boundary for this app.

## Chosen architecture

A shared queue, template store, editor, and verified-Markdown store serve contract-family adapters:

- `fashion-week` maps the supplied `8.9.26_FW.xlsx` headers to the existing Fashion Week engine.
- `membership` uses its own package catalog, derived cancellation deadline, placeholders, and protected Membership template.
- The importer accepts a raw `.xlsx` body and creates a new local batch. A family-specific parser converts each source row into normalized input without silently fixing invalid commercial data.
- Imported row problems remain visible in the queue and preview so Anna can correct them in Edit mode. Verification always rebuilds the contract on the server and remains blocked until the record is valid.
- Queue replacement is atomic. Verified handoffs are immutable Markdown files under `data/runtime/verified-contracts/` and include source metadata, reviewed template, resolved output, reviewer/time, and a SHA-256 hash.

## User flow

1. Anna selects a contract type and uploads an `.xlsx` file, or loads the local Membership demo.
2. The server parses every non-empty data row into one queue record and returns import counts and row-level issues.
3. The first pending record opens in Preview. The queue shows all records, progress, source row, and attention state.
4. Edit contract unlocks family-specific fields and the Markdown editor. Record edits autosave locally.
5. Save template validates and versions the active family template.
6. Mark verified performs fresh family validation, resolves all placeholders, writes one immutable Markdown handoff, and advances to the next pending record.
7. The batch is complete only when every record is verified.

## Family contracts

Fashion Week reads `FW`, `Season`, `Brand`, `Name`, `Email`, `Category`, `LIST_PRICE`, `Discount`, and up to three payment amount/date pairs. It preserves workbook prices and payment schedules as source evidence. Category catalog price determines the full price; a positive difference between full price and `LIST_PRICE` becomes the grant amount only when `Discount` is populated.

Membership uses package, duration, and start-date inputs. The approved catalog determines category display, services, monthly price, and duration benefit. The engine derives the inclusive term end and cancellation deadline. The Membership demo is local mock data and is never represented as a real brand agreement.

## Error handling and safety

- Reject non-XLSX uploads, missing headers, empty sheets, duplicate record IDs, oversized request bodies, and unknown template IDs.
- Preserve source row numbers and import issues. Do not silently correct dates, prices, categories, or payment schedules.
- Reject verification with unresolved placeholders, family validation errors, or an existing handoff file.
- Keep `data/runtime/` ignored by Git.
- Template validation is family-specific and requires the correct top-level agreement heading and required placeholders.

## Testing and browser acceptance

Automated tests cover Excel parsing, date/currency normalization, row issue reporting, atomic queue replacement, Membership derivations and placeholder resolution, family-specific template validation, APIs, and static UI controls.

Browser review must cover uploading the supplied workbook, seeing all imported brands, navigating representative Fashion Week records (including an attention case), editing and returning to Preview, saving a template, loading and editing the Membership demo, verifying at least one Fashion Week record and the Membership demo in isolated fresh batches, and inspecting the resulting Markdown handoff files.

