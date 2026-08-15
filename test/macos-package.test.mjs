import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");

test("builds a self-contained macOS launcher package", async (context) => {
  const outputDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "flying-solo-package-"));
  context.after(() => fs.rm(outputDirectory, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [
    "scripts/build-macos-package.mjs",
    "--output", outputDirectory,
    "--node-runtime", process.execPath,
  ], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const appDirectory = path.join(outputDirectory, "Flying Solo Contract Review.app");
  await assert.doesNotReject(fs.access(path.join(outputDirectory, "Flying Solo Contract Review-macos-arm64.zip")));
  await assert.doesNotReject(fs.access(path.join(appDirectory, "Contents", "MacOS", "Flying Solo Contract Review")));
  await assert.doesNotReject(fs.access(path.join(appDirectory, "Contents", "Resources", "start-server.sh")));
  await assert.doesNotReject(fs.access(path.join(appDirectory, "Contents", "Resources", "node", "bin", "node")));
  await assert.doesNotReject(fs.access(path.join(appDirectory, "Contents", "Resources", "contract-builder", "server.mjs")));
  await assert.rejects(fs.access(path.join(appDirectory, "Contents", "Resources", "contract-builder", "data", "runtime")));
  assert.match(
    await fs.readFile(path.join(appDirectory, "Contents", "Resources", "start-server.sh"), "utf8"),
    /wait "\$PID"/,
  );
});
