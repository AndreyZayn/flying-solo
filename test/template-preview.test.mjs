import assert from "node:assert/strict";
import test from "node:test";

import { templatePreviewInput } from "../public/template-preview.mjs";

test("builds deterministic Fashion Week sample data that exercises conditional sections", () => {
  const input = templatePreviewInput({
    family: "fashion-week",
    registry: {
      events: [{ code: "NYFW" }],
      categories: [{ id: "Accessory", fullPrice: 4900, accessoryClause: true }],
      grant: { defaultAmount: 2000 },
    },
  });

  assert.deepEqual(input, {
    eventCode: "NYFW",
    eventMonth: "February 2027",
    brand: "Test Brand Co.",
    representative: "Test Representative",
    category: "Accessory",
    grantEnabled: true,
    grantAmount: 2000,
    payments: [
      { dueDate: "2026-12-01", amount: 1450 },
      { dueDate: "2027-01-01", amount: 725 },
      { dueDate: "2027-02-01", amount: 725 },
    ],
  });
});

test("builds deterministic Membership sample data from the approved package", () => {
  const input = templatePreviewInput({
    family: "membership",
    registry: {
      packages: [{ id: "clothing-store-pr", monthlyPrice: 2000 }],
      durationBenefits: { 6: "Fashion Week participation at 50% off" },
    },
  });

  assert.deepEqual(input, {
    brand: "Test Brand Co.",
    representative: "Test Representative",
    packageId: "clothing-store-pr",
    durationMonths: 6,
    startDate: "2027-02-01",
    monthlyPrice: 2000,
  });
});
