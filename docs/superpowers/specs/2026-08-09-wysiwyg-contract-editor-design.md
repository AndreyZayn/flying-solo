# WYSIWYG Contract Editor Design

## Goal

Keep the contract editor as the primary working surface while replacing raw Markdown editing with a compact Notion-like WYSIWYG experience. Preserve the existing form, Preview, validation, pricing, schedule calculations, contract text, and Copy Markdown behavior.

## Editing model

- TOAST UI Editor runs locally in WYSIWYG-only mode (`initialEditType: "wysiwyg"`, `hideModeSwitch: true`).
- The editor is initialized once from the protected Markdown template and remains editable across Editor/Preview switches.
- `getMarkdown()` remains the canonical editable document value. Preview resolves placeholders from that Markdown. Copy Markdown writes the resolved Markdown as `text/plain` and the matching sanitized rich contract as `text/html`, allowing SignatureConfirm to preserve formatting while plain-text destinations still receive Markdown.
- Form changes update only the validated placeholder context and contract title. They do not replace manual editor changes.

## Placeholders

- Existing `{{PLACEHOLDER}}` and `{{#IF FLAG}}…{{/IF}}` syntax remains the storage format so the resolver and source-of-truth template stay compatible.
- TOAST UI widget rules render these tokens as compact, non-contract chips in the editor. Simple placeholders use readable labels such as `Brand name`; conditional markers use `If grant enabled` and `End condition`.
- Chips are editor-only. Preview and either clipboard representation contain resolved values and never contain the visual chip markup.

## Editor appearance

- Preserve the current white application theme and panel layout.
- Use a compact toolbar limited to bold, italic, headings, lists, link, undo, and redo.
- Use 14px body text, restrained heading sizes, tighter editor padding, and a shorter minimum editor height.
- RECITALS appears regular-weight in both editor and Preview. Numbered section headings remain bold.

## Preview spacing

- Preview retains the existing SignatureConfirm-like 16px typography and 1.6 line height.
- Section headings followed immediately by their paragraph have no extra vertical gap: the heading owns the space above, and the paragraph begins directly below it.
- Standalone structural headings retain their intentional separation. RECITALS keeps its existing leading separation from the introduction, and content after RECITALS remains a normal paragraph block.

## Local assets and privacy

- Install `@toast-ui/editor` from npm and serve its bundled CSS and browser JavaScript from local `node_modules` paths.
- Remove EasyMDE assets and dependency.
- Disable TOAST UI usage statistics. No runtime CDN or external request is introduced.

## Verification

- Server tests assert local TOAST UI assets, WYSIWYG initialization, no EasyMDE assets, placeholder widget configuration, `getMarkdown()` usage, dual-format clipboard output, and spacing selectors.
- Existing contract engine, schedule, resolver, API, and copy-label tests remain green.
- Browser verification confirms the editor is WYSIWYG-only, typography is compact, placeholder chips appear, formatting changes survive Preview, Copy Markdown still resolves values, and section heading spacing matches the intended preview.
