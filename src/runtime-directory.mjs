import path from "node:path";

export function resolveRuntimeDirectory(rootDir, environment = process.env, currentDirectory = process.cwd()) {
  const configuredDirectory = String(environment.FLYING_SOLO_RUNTIME_DIR ?? "").trim();
  if (!configuredDirectory) return path.join(rootDir, "data/runtime");
  return path.resolve(currentDirectory, configuredDirectory);
}
