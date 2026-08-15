#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appName = "Flying Solo Contract Review";

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr || result.stdout || "unknown error"}`);
  }
}

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function copy(source, destination) {
  await fs.cp(source, destination, { recursive: true, dereference: true });
}

function infoPlist(name) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleDisplayName</key><string>${name}</string>
  <key>CFBundleExecutable</key><string>${name}</string>
  <key>CFBundleIdentifier</key><string>com.flyingsolo.contract-review</string>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0.0</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`;
}

function startScript() {
  return `#!/bin/bash
set -u

RESOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
NODE="$RESOURCE_DIR/node/bin/node"
SERVER="$RESOURCE_DIR/contract-builder/server.mjs"
DATA_DIR="$HOME/Library/Application Support/Flying Solo Contract Review"
PID_FILE="$DATA_DIR/server.pid"
LOG_FILE="$DATA_DIR/server.log"
URL="http://127.0.0.1:4173"

show_error() {
  /usr/bin/osascript -e 'on run argv' -e 'display dialog (item 1 of argv) buttons {"OK"} default button "OK" with icon stop' -e 'end run' -- "$1" >/dev/null 2>&1 || true
}

mkdir -p "$DATA_DIR" || exit 1

if [ -r "$PID_FILE" ]; then
  PID="$(cat "$PID_FILE")"
  if [[ "$PID" =~ ^[0-9]+$ ]] && /bin/kill -0 "$PID" 2>/dev/null; then
    COMMAND="$(/bin/ps -p "$PID" -o command= 2>/dev/null || true)"
    if [[ "$COMMAND" == *"$SERVER"* ]]; then
      /usr/bin/open "$URL"
      exit 0
    fi
  fi
  /bin/rm -f "$PID_FILE"
fi

if /usr/bin/curl --fail --silent "$URL/api/templates" >/dev/null 2>&1; then
  /usr/bin/open "$URL"
  exit 0
fi

if /usr/sbin/lsof -nP -iTCP:4173 -sTCP:LISTEN >/dev/null 2>&1; then
  show_error "Another application is already using port 4173. Please quit that application, then open Flying Solo Contract Review again."
  exit 1
fi

if [ ! -x "$NODE" ] || [ ! -f "$SERVER" ]; then
  show_error "Flying Solo Contract Review is incomplete. Please reinstall the application package."
  exit 1
fi

env FLYING_SOLO_RUNTIME_DIR="$DATA_DIR" "$NODE" "$SERVER" >> "$LOG_FILE" 2>&1 &
PID="$!"
echo "$PID" > "$PID_FILE"

for _ in {1..30}; do
  if /usr/bin/curl --fail --silent "$URL/api/templates" >/dev/null 2>&1; then
    /usr/bin/open "$URL"
    wait "$PID" || true
    if [ -r "$PID_FILE" ] && [ "$(cat "$PID_FILE")" = "$PID" ]; then
      /bin/rm -f "$PID_FILE"
    fi
    exit 0
  fi
  /bin/sleep 0.2
done

/bin/rm -f "$PID_FILE"
show_error "Flying Solo Contract Review could not start. Its support log is at $LOG_FILE"
exit 1
`;
}

function stopScript() {
  return `#!/bin/bash
set -u

DATA_DIR="$HOME/Library/Application Support/Flying Solo Contract Review"
PID_FILE="$DATA_DIR/server.pid"
SERVER="Flying Solo Contract Review.app/Contents/Resources/contract-builder/server.mjs"

if [ ! -r "$PID_FILE" ]; then
  /usr/bin/osascript -e 'display dialog "Flying Solo Contract Review is not running." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || true
  exit 0
fi

PID="$(cat "$PID_FILE")"
COMMAND="$(/bin/ps -p "$PID" -o command= 2>/dev/null || true)"
if [[ "$PID" =~ ^[0-9]+$ ]] && [[ "$COMMAND" == *"$SERVER"* ]]; then
  /bin/kill "$PID" 2>/dev/null || true
fi
/bin/rm -f "$PID_FILE"
/usr/bin/osascript -e 'display dialog "Flying Solo Contract Review has stopped." buttons {"OK"} default button "OK"' >/dev/null 2>&1 || true
`;
}

async function createApp(outputDirectory, name, resourceScript, scriptContents) {
  const appDirectory = path.join(outputDirectory, `${name}.app`);
  const contents = path.join(appDirectory, "Contents");
  const resources = path.join(appDirectory, "Contents", "Resources");
  const executable = path.join(contents, "MacOS", name);
  await fs.mkdir(path.dirname(executable), { recursive: true });
  await fs.mkdir(resources, { recursive: true });
  await fs.writeFile(path.join(contents, "Info.plist"), infoPlist(name));
  await fs.writeFile(executable, `#!/bin/bash\nRESOURCE_DIR="$(cd "$(dirname "$0")/../Resources" && pwd)"\nexec "$RESOURCE_DIR/${resourceScript}"\n`);
  await fs.chmod(executable, 0o755);
  await fs.writeFile(path.join(resources, resourceScript), scriptContents, { mode: 0o755 });
  await fs.chmod(path.join(resources, resourceScript), 0o755);
  return appDirectory;
}

async function createStartApp(outputDirectory, nodeRuntime) {
  const appDirectory = await createApp(outputDirectory, appName, "start-server.sh", startScript());
  const resources = path.join(appDirectory, "Contents", "Resources");
  const sourceFiles = ["config", "public", "src", "templates", "server.mjs", "package.json", "package-lock.json", "node_modules"];
  for (const source of sourceFiles) {
    await copy(path.join(projectRoot, source), path.join(resources, "contract-builder", source));
  }
  await copy(path.join(projectRoot, "data", "review-queue.example.json"), path.join(resources, "contract-builder", "data", "review-queue.example.json"));
  const resolvedRuntime = await fs.realpath(nodeRuntime);
  await copy(path.resolve(path.dirname(resolvedRuntime), ".."), path.join(resources, "node"));
  return appDirectory;
}

async function writeReadme(outputDirectory) {
  const readme = `# Flying Solo Contract Review\n\n## Start\n\nDouble-click **Flying Solo Contract Review.app**. It opens the review workspace in your browser. Keep the browser open while you work.\n\n## Stop\n\nDouble-click **Stop Flying Solo Contract Review.app** after you are finished for the day.\n\n## Your local work\n\nYour templates, review queue, verified contracts, and support log are stored only on this Mac in:\n\n\`~/Library/Application Support/Flying Solo Contract Review/\`\n\nDo not move that folder when replacing the app with an update.\n\n## First opening\n\nmacOS may ask for confirmation because this is a local business app. Control-click the app, choose **Open**, then choose **Open** again. You only need to do this once.\n`;
  await fs.writeFile(path.join(outputDirectory, "README.md"), readme);
}

async function createArchive(outputDirectory) {
  const archive = path.join(outputDirectory, `${appName}-macos-${process.arch}.zip`);
  const stagingRoot = await fs.mkdtemp(path.join(os.tmpdir(), "flying-solo-release-"));
  const stagingPackage = path.join(stagingRoot, appName);
  await fs.mkdir(stagingPackage);
  try {
    for (const entry of [`${appName}.app`, `Stop ${appName}.app`, "README.md"]) {
      await copy(path.join(outputDirectory, entry), path.join(stagingPackage, entry));
    }
    await fs.rm(archive, { force: true });
    run("ditto", ["-c", "-k", "--sequesterRsrc", "--keepParent", stagingPackage, archive]);
  } finally {
    await fs.rm(stagingRoot, { recursive: true, force: true });
  }
  return archive;
}

async function main() {
  const outputDirectory = path.resolve(option("--output", path.join(projectRoot, "release")));
  const nodeRuntime = path.resolve(option("--node-runtime", process.execPath));
  if (process.platform !== "darwin") throw new Error("The macOS package can only be built on macOS.");
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.rm(path.join(outputDirectory, `${appName}.app`), { recursive: true, force: true });
  await fs.rm(path.join(outputDirectory, `Stop ${appName}.app`), { recursive: true, force: true });
  await createStartApp(outputDirectory, nodeRuntime);
  await createApp(outputDirectory, `Stop ${appName}`, "stop-server.sh", stopScript());
  await writeReadme(outputDirectory);
  await createArchive(outputDirectory);
  process.stdout.write(`Created macOS package at ${outputDirectory}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
