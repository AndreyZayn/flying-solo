import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { resolveRuntimeDirectory } from "../src/runtime-directory.mjs";

test("uses the app-local runtime directory by default", () => {
  assert.equal(
    resolveRuntimeDirectory("/Applications/Flying Solo Contract Review.app/Contents/Resources/contract-builder", {}),
    "/Applications/Flying Solo Contract Review.app/Contents/Resources/contract-builder/data/runtime",
  );
});

test("uses an absolute external runtime directory when the launcher supplies one", () => {
  assert.equal(
    resolveRuntimeDirectory("/Applications/Flying Solo Contract Review.app/Contents/Resources/contract-builder", {
      FLYING_SOLO_RUNTIME_DIR: "/Users/anna/Library/Application Support/Flying Solo Contract Review",
    }),
    "/Users/anna/Library/Application Support/Flying Solo Contract Review",
  );
});

test("normalizes a relative runtime directory against the current working directory", () => {
  assert.equal(
    resolveRuntimeDirectory("/app", { FLYING_SOLO_RUNTIME_DIR: "Anna Data" }, "/Users/anna"),
    path.join("/Users/anna", "Anna Data"),
  );
});
