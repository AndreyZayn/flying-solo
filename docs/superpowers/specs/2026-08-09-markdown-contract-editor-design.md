# Markdown Contract Editor Design

## Goal

Replace the read-only highlighted contract surface with a real Markdown editor. The editor owns the reusable contract template, form fields supply placeholder values, and Preview renders the resolved contract with the existing SignatureConfirm-matched styling.

## Approved interaction

- **Editor** contains editable Markdown and a normal formatting toolbar.
- Variable positions use explicit tokens such as `{{BRAND_NAME}}` and `{{FULL_PRICE}}`.
- Optional grant, accessory, and additional-payment content uses `{{#IF NAME}}...{{/IF}}` blocks.
- Form changes update the current placeholder-value map but never overwrite Markdown edits.
- **Preview** resolves conditions and placeholders, converts the result to sanitized HTML, and applies the existing contract CSS.
- **Copy Markdown** copies the resolved Markdown represented by Preview, not HTML and not unresolved placeholder tokens.
- Switching between Editor and Preview preserves the Markdown source.

## Architecture

EasyMDE provides the browser editor and Markdown renderer. Its bundled preview control is omitted so the application has only the existing Editor/Preview navigation. DOMPurify sanitizes rendered HTML before it enters the preview DOM.

The server exposes the protected Markdown template separately from validation results. `buildContract()` continues to validate events, categories, grants, prices, and payment schedules, but returns a title and placeholder-value map instead of pre-rendered HTML. A small browser-compatible module resolves the approved placeholder grammar and is unit tested directly in Node.

## Placeholder grammar

Simple value:

```markdown
**{{BRAND_NAME}}**
```

Conditional content:

```markdown
{{#IF GRANT_ENABLED}}
Fashion Forward Fund Grant Applied: {{GRANT_AMOUNT}}
{{/IF}}
```

Unknown or malformed placeholders stop Preview and show the existing error state. Values are Markdown-escaped before substitution so a brand name cannot accidentally introduce formatting or executable HTML.

## Protected contract content

`templates/fashion-week.md` becomes the legal-body source of truth. The conversion changes representation only: wording, order, headings, emphasis, and list structure remain unchanged. `EVENT AGREEMENT` remains h2 and recitals, numbered sections, and named subheadings remain h3.

## Visual behavior

The white contract Preview keeps the existing measured SignatureConfirm typography, width, padding, line height, margins, and list spacing. EasyMDE styling applies only to the Editor panel. Placeholder tokens receive an editor-only highlight and never appear highlighted in Preview.

## Verification

- Unit tests cover placeholder replacement, conditions, escaping, and unresolved-token errors.
- Contract-engine tests retain all pricing, grant, category, and payment validation coverage and assert the returned placeholder map.
- Server tests assert the Markdown template endpoint, locally served editor assets, Editor/Preview panels, `Preview` label, and `Copy Markdown` control.
- Browser verification edits text, changes a form value without losing the edit, previews resolved values, switches back with source intact, and confirms copied text is resolved Markdown.

