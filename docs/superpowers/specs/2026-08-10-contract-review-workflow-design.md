# Flying Solo Contract Review Workflow Design

## Goal

Turn the current one-contract builder into a local review queue where normalized brand records are reviewed against reusable contract templates, edited when necessary, verified one by one, and archived for future agents.

## Scope

In scope:

- A registry that can hold multiple contract templates; Fashion Week remains the only implemented contract family for now.
- Durable template saving with validation; named copies are the revision mechanism.
- A normalized batch/brand data boundary. Future XLS or agent parsing writes this shape; parsing itself is not implemented.
- A visible queue of every brand record and its Pending or Verified status.
- Preview-first review. Editor is opened only when Anna needs to change the selected contract.
- Per-brand draft persistence while switching records.
- Verification that stores the final title, normalized profile, exact edited template Markdown, exact resolved contract Markdown, template identity, and timestamp.
- An all-verified completion state.

Out of scope:

- Reading XLS files, Airtable, email, or other Flying Solo systems.
- SignatureConfirm sending or browser automation.
- Membership or other contract-family rules beyond registering future template slots.

## Data model

- `config/contract-templates.json`: approved template registry.
- `data/review-queue.example.json`: documented normalized input example.
- `data/runtime/review-queue.json`: active batch and per-brand review state.
- `data/runtime/verified-contracts/<batch-id>--<record-id>.md`: one marked verified Markdown handoff file per contract for downstream SignatureConfirm agents.

The runtime directory is local operational data and is not pushed to GitHub.

## Workflow

1. The app opens in Preview with the first pending brand selected.
2. The queue shows every record and verified progress.
3. Selecting a brand fills the variable fields and renders the chosen template.
4. Anna reviews Preview; Editor remains available for record-specific changes.
5. Draft text and field edits are saved when switching records.
6. Mark Verified performs server-side contract validation, creates a no-overwrite verified Markdown handoff file, updates the queue, and advances to the next pending record.
7. When no pending records remain, the app shows the batch as complete.

## Safety and validation

- Saved templates must use only registered placeholders, keep required placeholders, and contain balanced condition blocks.
- Verification always rebuilds commercial values server-side and rejects invalid payment totals or unresolved placeholders.
- JSON writes are atomic for the active review queue.
- Verified handoff files contain explicit status/definition sections and are created without overwrite; a repeated verification for the same record is rejected.
