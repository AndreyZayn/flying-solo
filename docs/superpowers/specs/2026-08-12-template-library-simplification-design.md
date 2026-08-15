# Template Library Simplification

## Decision

Templates are the only reusable-document concept. A template is a named title-and-body agreement that Anna can open, edit, preview, select for a batch, copy, or delete.

There is no automatic version number, version history, restore action, or per-save snapshot. Saving updates the selected template in place. To preserve or branch wording, Anna copies a template and gives the copy a meaningful name such as `Fashion Week v1` or `Paris Fashion Week 2027`.

## Interface

The Templates workspace becomes a template library rather than a compact selector. It presents every available template as a selectable card, a prominent **New template** action, and a short explanation of the copy-based workflow. Creating a template asks for a name and a source template; copying a card preselects that card as the source. The selected card opens in the existing title/body editor and preview.

The batch workspace continues to use the same library entries through its single template selector. The active batch still protects its assigned template from deletion.

## Storage

The template store no longer exposes or persists a `version` value. Saving writes the current template only. Existing snapshot/history files are no longer read, displayed, restored, or generated; the checked-in and runtime history artifacts are removed as part of this change.

## Acceptance criteria

- Every available template is visible in the Templates workspace without opening a dropdown.
- Anna can create a named template from a chosen existing template and can use `v1` in the name herself.
- Saving a template does not create a snapshot or version/history file.
- No UI, API route, store method, or help text exposes version history, restore, or delete-version behavior.
- A template can still be deleted unless it is assigned to the active batch.
- The existing title/body editor, placeholder tools, preview, and batch template selection continue to work.
