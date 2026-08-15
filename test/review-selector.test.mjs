import test from "node:test";
import assert from "node:assert/strict";

async function loadSelectorModule() {
  try {
    return await import("../public/review-selector.mjs");
  } catch {
    return {};
  }
}

test("presents verified, pending, attention, and changed contracts in dropdown labels", async () => {
  const { reviewRecordPresentation } = await loadSelectorModule();
  assert.equal(typeof reviewRecordPresentation, "function");

  assert.deepEqual(
    reviewRecordPresentation({ id: "one", status: "verified", input: { brand: "Alpha" } }, "fashion-week"),
    { state: "verified", symbol: "✓", label: "Verified", optionLabel: "✓ Alpha — Verified", context: "" },
  );
  assert.equal(
    reviewRecordPresentation({ id: "two", status: "pending", importIssues: [], input: { brand: "Beta" } }, "fashion-week").optionLabel,
    "● Beta — Pending",
  );
  assert.equal(
    reviewRecordPresentation({ id: "three", status: "pending", importIssues: ["Invalid date"], input: { brand: "Gamma" } }, "fashion-week").optionLabel,
    "! Gamma — Attention",
  );
  assert.equal(
    reviewRecordPresentation({ id: "four", status: "changes_pending", input: { brand: "Delta" } }, "fashion-week").optionLabel,
    "● Delta — Changes pending",
  );
});

test("finds the next incomplete contract after the verified record and wraps once", async () => {
  const { nextIncompleteRecord } = await loadSelectorModule();
  assert.equal(typeof nextIncompleteRecord, "function");
  const records = [
    { id: "one", status: "pending" },
    { id: "two", status: "verified" },
    { id: "three", status: "changes_pending" },
    { id: "four", status: "verified" },
  ];

  assert.equal(nextIncompleteRecord(records, "two").id, "three");
  assert.equal(nextIncompleteRecord(records, "four").id, "one");
  assert.equal(nextIncompleteRecord(records.map((record) => ({ ...record, status: "verified" }))), undefined);
});
