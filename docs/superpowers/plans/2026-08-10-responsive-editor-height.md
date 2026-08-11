# Responsive Editor Height Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-fit the visual editor to the full contract and allow persistent manual vertical resizing.

**Architecture:** A small browser-safe sizing module calculates the editor shell height from toolbar and content measurements. `app.js` owns DOM measurement, automatic refitting, and the transition from automatic to manual sizing; CSS exposes the native vertical resize affordance.

**Tech Stack:** Vanilla JavaScript modules, TOAST UI Editor, CSS native resize, Node test runner.

---

### Task 1: Define and test height calculation

**Files:**
- Create: `public/editor-sizing.mjs`
- Create: `test/editor-sizing.test.mjs`
- Modify: `server.mjs`

- [ ] **Step 1: Write the failing unit test**

```js
assert.equal(calculateEditorHeight({ toolbarHeight: 40, contentHeight: 1800 }), 1842);
assert.equal(isResizeHandlePointer({ clientX: 995, clientY: 795, rect: { right: 1000, bottom: 800 } }), true);
```

- [ ] **Step 2: Run RED**

Run: `node --test test/editor-sizing.test.mjs`

Expected: FAIL because the sizing module does not exist.

- [ ] **Step 3: Implement the pure helpers**

```js
export function calculateEditorHeight({ toolbarHeight, contentHeight }) {
  return Math.ceil(toolbarHeight + contentHeight + 2);
}

export function isResizeHandlePointer({ clientX, clientY, rect, handleSize = 20 }) {
  return clientX >= rect.right - handleSize && clientY >= rect.bottom - handleSize;
}
```

- [ ] **Step 4: Serve the browser module and run GREEN**

Run: `node --test test/editor-sizing.test.mjs test/server.test.mjs`

Expected: PASS.

### Task 2: Add automatic and manual sizing behavior

**Files:**
- Modify: `public/app.js`
- Modify: `public/styles.css`
- Modify: `test/server.test.mjs`

- [ ] **Step 1: Add failing integration assertions**

Assert `app.js` imports the sizing module, subscribes to editor changes and window resizing, calls `contractEditor.setHeight`, and marks manual resizing from the bottom-right handle. Assert CSS contains `resize: vertical` and `min-height: 360px` on `.toastui-editor-defaultUI`.

- [ ] **Step 2: Run RED**

Run: `node --test test/server.test.mjs`

Expected: FAIL because auto-fit and resize behavior are absent.

- [ ] **Step 3: Implement sizing lifecycle**

Measure `.toastui-editor-defaultUI-toolbar.offsetHeight` and `.ProseMirror.scrollHeight`, schedule the calculation in `requestAnimationFrame`, call `contractEditor.setHeight`, and refit on editor changes and window resizing until a pointer-down on the resize handle sets manual mode.

- [ ] **Step 4: Run GREEN and the complete suite**

Run: `npm test`

Expected: all tests pass.

### Task 3: Browser verification

**Files:**
- No production file changes expected.

- [ ] **Step 1: Reload localhost and inspect default height**

Confirm `.toastui-editor-main` has no vertical overflow and the editor shell height covers the complete ProseMirror scroll height.

- [ ] **Step 2: Drag the native resize handle**

Confirm the editor becomes shorter and preserves that height without auto-expanding.

- [ ] **Step 3: Verify unchanged workflow**

Confirm Editor/Preview switching and Copy Markdown remain available.
