import test from "node:test";
import assert from "node:assert/strict";

async function loadLibrary() {
  try {
    return await import("../public/placeholder-library.mjs");
  } catch {
    return {};
  }
}

test("creates value and complete conditional insertion tokens", async () => {
  const { placeholderInsertionText } = await loadLibrary();
  assert.equal(typeof placeholderInsertionText, "function");
  assert.equal(
    placeholderInsertionText({ key: "BRAND_NAME", type: "value" }),
    "{{BRAND_NAME}}",
  );
  assert.equal(
    placeholderInsertionText({ key: "GRANT_ENABLED", type: "condition" }),
    "{{#IF GRANT_ENABLED}}\n\n{{/IF}}",
  );
  assert.equal(
    placeholderInsertionText({ key: "GRANT_ENABLED", type: "condition" }, { inline: true }),
    "{{#IF GRANT_ENABLED}}Optional title text{{/IF}}",
  );
});

test("filters placeholders by label, key, or description", async () => {
  const { matchesPlaceholder } = await loadLibrary();
  assert.equal(typeof matchesPlaceholder, "function");
  const placeholder = {
    key: "REMAINING_BALANCE",
    label: "Remaining balance",
    description: "Full price minus the grant.",
  };
  assert.equal(matchesPlaceholder(placeholder, "balance"), true);
  assert.equal(matchesPlaceholder(placeholder, "REMAINING_"), true);
  assert.equal(matchesPlaceholder(placeholder, "grant"), true);
  assert.equal(matchesPlaceholder(placeholder, "representative"), false);
});

test("formats live placeholder values and condition states", async () => {
  const { displayPlaceholderValue } = await loadLibrary();
  assert.equal(typeof displayPlaceholderValue, "function");
  assert.equal(
    displayPlaceholderValue({ key: "FULL_PRICE", type: "value" }, { FULL_PRICE: "$6,900" }),
    "$6,900",
  );
  assert.equal(
    displayPlaceholderValue({ key: "GRANT_ENABLED", type: "condition" }, { GRANT_ENABLED: true }),
    "Active",
  );
  assert.equal(
    displayPlaceholderValue({ key: "PAYMENT_3_ENABLED", type: "condition" }, { PAYMENT_3_ENABLED: false }),
    "Inactive",
  );
});
