import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateEditorHeight,
  isResizeHandlePointer,
} from "../public/editor-sizing.mjs";

test("calculates a shell height that fits the toolbar and complete document", () => {
  assert.equal(calculateEditorHeight({ toolbarHeight: 40, contentHeight: 1800 }), 1842);
});

test("detects the native bottom-right resize handle", () => {
  const rect = { right: 1000, bottom: 800 };

  assert.equal(isResizeHandlePointer({ clientX: 995, clientY: 795, rect }), true);
  assert.equal(isResizeHandlePointer({ clientX: 900, clientY: 795, rect }), false);
  assert.equal(isResizeHandlePointer({ clientX: 995, clientY: 700, rect }), false);
});
