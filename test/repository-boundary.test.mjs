import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("keeps Contract Builder as a repository-run local web app", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(rootDir, "package.json"), "utf8"));

  assert.equal(packageJson.scripts.start, "node server.mjs");
  assert.equal(Object.hasOwn(packageJson.scripts, "package:mac"), false);
  assert.equal(await fs.access(path.join(rootDir, "scripts", "build-macos-package.mjs")).then(() => true, () => false), false);
  assert.equal(await fs.access(path.join(rootDir, "src", "runtime-directory.mjs")).then(() => true, () => false), false);
});
