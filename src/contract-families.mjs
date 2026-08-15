import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildContract as buildFashionWeekContract } from "./contract-engine.mjs";
import { buildMembershipContract } from "./membership-engine.mjs";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const configs = {
  "fashion-week": fs.readFile(path.join(rootDir, "config/fashion-week-registry.json"), "utf8").then(JSON.parse),
  membership: fs.readFile(path.join(rootDir, "config/membership-registry.json"), "utf8").then(JSON.parse),
};

export async function familyConfig(templateId) {
  if (!configs[templateId]) throw new Error(`Unknown contract template: ${templateId}.`);
  return configs[templateId];
}

export async function buildFamilyContract(templateId, input) {
  const config = await familyConfig(templateId);
  if (templateId === "fashion-week") return buildFashionWeekContract(input, config);
  if (templateId === "membership") return buildMembershipContract(input, config);
  throw new Error(`Unknown contract template: ${templateId}.`);
}
