import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import { buildMembershipContract } from "../src/membership-engine.mjs";
import { resolveMarkdownTemplate } from "../public/markdown-template.mjs";

const registry = JSON.parse(await fs.readFile(new URL("../config/membership-registry.json", import.meta.url), "utf8"));
const template = await fs.readFile(new URL("../templates/membership.md", import.meta.url), "utf8");

const input = {
  brand: "Mock Brand",
  representative: "Mock Representative",
  recipientEmail: "mock@example.com",
  packageId: "clothing-store-pr",
  durationMonths: 6,
  startDate: "2026-09-01",
};

test("builds a catalog-backed Membership contract and derives its deadline", () => {
  const result = buildMembershipContract(input, registry);
  assert.equal(result.title, "FLYING SOLO - NY - 6 months - Mock Brand");
  assert.equal(result.placeholders.CATEGORY_DISPLAY, "Clothing");
  assert.equal(result.placeholders.PR_ENABLED, true);
  assert.equal(result.placeholders.NY_STORE_ENABLED, true);
  assert.equal(result.placeholders.BENEFIT_LABEL, "Fashion Week participation at 50% off");
  assert.equal(result.placeholders.START_DATE, "September 1, 2026");
  assert.equal(result.placeholders.CANC_DATE, "January 31, 2027");
  assert.equal(result.placeholders.PRICE, "$2,000");
  assert.match(resolveMarkdownTemplate(template, result.placeholders), /Mock Brand/);
});

test("uses the approved Beauty size display", () => {
  const result = buildMembershipContract({ ...input, packageId: "beauty-small-store", durationMonths: 4 }, registry);
  assert.equal(result.placeholders.CATEGORY_DISPLAY, "Beauty (small)");
  assert.equal(result.placeholders.PR_ENABLED, false);
  assert.equal(result.placeholders.BENEFIT_ENABLED, false);
});

test("rejects non-first-of-month dates and source prices that disagree with the catalog", () => {
  assert.throws(() => buildMembershipContract({ ...input, startDate: "2026-09-02" }, registry), /first day/);
  assert.throws(() => buildMembershipContract({ ...input, monthlyPrice: 1500 }, registry), /must match the approved/);
});

