# Responsive Editor Height Design

## Goal

The WYSIWYG editor must show the full contract without an internal scroll area by default, while allowing the user to drag its bottom-right resize handle vertically to make it shorter or taller.

## Behavior

- After editor initialization, measure the complete ProseMirror document height and size the TOAST UI shell to fit its toolbar plus all document content.
- Refit automatically when the document changes or the browser width changes, because line wrapping changes the required height.
- Detect a pointer interaction on the native resize handle. Once the user manually resizes, preserve that chosen height for the remainder of the page session instead of overriding it with auto-fit.
- Keep a practical minimum height of 360px. Manual shrinking uses the editor's existing internal scrolling.
- Apply `resize: vertical` only to the WYSIWYG editor shell. Preview, contract rendering, copying, form calculations, and validation remain unchanged.

## Verification

- Unit-test the height calculation from toolbar and content measurements.
- Assert the dashboard loads the sizing module and includes the vertical-resize CSS.
- Browser-test that the initial editor client height covers its full scroll height, width changes trigger refitting, and dragging the resize handle changes the editor height.
