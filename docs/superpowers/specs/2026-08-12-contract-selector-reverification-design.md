# Contract Selector and Reverification Design

**Date:** 2026-08-12
**Status:** Approved by Andrey

## Problem

The current sidebar renders every imported brand as a card. Large batches push the selected contract's sourced fields below the fold. Verification can also fail when a deterministic Markdown handoff already exists while the queue record is pending, because the store uses exclusive file creation. This can happen after reimporting the same batch or after an interrupted write leaves the file and queue out of sync.

## Decision

Use one compact native contract selector and one canonical Markdown handoff per batch record.

- Replace the full card list with a labeled dropdown.
- Prefix option labels with `✓` for verified, `●` for pending, and `!` for attention.
- Show a colored status indicator and contract context beneath the selected option.
- Keep the existing progress count and completion message.
- After successful verification, automatically select the next pending or attention record.
- A verified contract stays read-only until **Edit contract** is selected.
- Saving the first change to a verified contract moves it to `changes_pending`; its existing handoff remains available until the revision is verified.
- Re-verification atomically replaces the same deterministic Markdown path. It never creates a second active handoff for the record.
- Each handoff records a revision number and the prior content hash. Repeating an interrupted verification with identical content recovers queue state without incrementing the revision.

## Data and failure semantics

Queue records support `pending`, `changes_pending`, and `verified`. Progress counts only `verified` as complete. The store serializes writes with its existing mutation lock.

Verification computes the resolved-content SHA-256 before writing. If the canonical handoff already exists:

1. the same hash means recovery; retain its revision and restore the queue record to verified;
2. a different hash means a new revision; increment the revision and atomically replace the canonical file.

The handoff frontmatter includes `revision` and nullable `supersedes_sha256`. Atomic replacement uses a temporary file in the same directory followed by rename, so no delete-before-write gap exists.

## UI behavior

The selector occupies one control-height block regardless of batch size. Changing it saves the current draft first, selects the requested record, returns to Preview, and regenerates the contract. Verified options remain selectable and display a green indicator.

Selecting **Edit contract** on a verified record unlocks its sourced fields and editor. Merely opening Edit does not change status. The first autosaved field or template change returns `changes_pending`; the dropdown updates immediately. The primary action then reads **Update verification**. Pending records continue to use **Mark verified**.

## Verification

- Store tests cover first verification, identical-content recovery, changed-content revision, one-file invariance, and verified-to-changes-pending draft transitions.
- UI/server tests cover the selector markup, status labeling, verified editing, and the verification endpoint.
- Browser QA uploads the sample workbook, verifies a record, confirms automatic advance, returns to the verified record, edits it, re-verifies it, and confirms there is still one handoff file for that record.

## Non-goals

- No duplicate active Markdown files or separate revision files.
- No automatic correction of invalid workbook terms.
- No change to contract-family validation or template wording.
