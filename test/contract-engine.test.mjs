import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { buildContract, calculateCommercial } from "../src/contract-engine.mjs";
import { resolveMarkdownTemplate } from "../public/markdown-template.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const registry = JSON.parse(
  await fs.readFile(path.join(here, "../config/fashion-week-registry.json"), "utf8"),
);
const markdownTemplate = await fs.readFile(
  path.join(here, "../templates/fashion-week.md"),
  "utf8",
);

const baseInput = {
  eventCode: "NYFW",
  eventMonth: "February 2027",
  brand: "Mumtoz Mariam",
  representative: "Mumtoz Mastura",
  category: "Clothing",
  grantEnabled: false,
  grantAmount: 0,
  payments: [
    { dueDate: "2026-08-16", amount: 2300 },
    { dueDate: "2026-10-15", amount: 2300 },
    { dueDate: "2026-12-15", amount: 2300 },
  ],
};

test("resolves fixed full price by normalized brand category", () => {
  assert.deepEqual(calculateCommercial({ category: "Clothing", grantEnabled: false }, registry), {
    category: "Clothing",
    fullPrice: 6900,
    grantAmount: 0,
    remainingBalance: 6900,
  });
  assert.equal(calculateCommercial({ category: "Acc", grantEnabled: false }, registry).fullPrice, 4900);
});

test("registry exposes every Fashion Week brand category as its own choice", () => {
  assert.deepEqual(
    registry.categories.map((category) => category.id),
    ["Clothing", "Accessory", "Jewelry", "Shoes", "Bags"],
  );
  assert.equal(calculateCommercial({ category: "Jewelry", grantEnabled: false }, registry).fullPrice, 4900);
  assert.equal(calculateCommercial({ category: "Shoes", grantEnabled: false }, registry).fullPrice, 4900);
  assert.equal(calculateCommercial({ category: "Bags", grantEnabled: false }, registry).fullPrice, 4900);
});

test("applies a grant to the fixed price", () => {
  assert.deepEqual(calculateCommercial({ category: "Clothing", grantEnabled: true, grantAmount: 2000 }, registry), {
    category: "Clothing",
    fullPrice: 6900,
    grantAmount: 2000,
    remainingBalance: 4900,
  });
});

test("builds the title, raw placeholder context, and commercial result", () => {
  const result = buildContract(baseInput, registry);
  assert.deepEqual(result, {
    title: "FLYING SOLO - NYFW - Feb 2027 - Mumtoz Mariam",
    placeholders: {
      EVENT_CODE: "NYFW",
      EVENT_MONTH: "February 2027",
      REPRESENTATIVE_NAME: "Mumtoz Mastura",
      BRAND_NAME: "Mumtoz Mariam",
      FULL_PRICE: "$6,900",
      GRANT_AMOUNT: "$0",
      REMAINING_BALANCE: "$6,900",
      CLOTHING_FULL_PRICE: "$6,900",
      PAYMENT_1_DUE_DATE: "August 16, 2026",
      PAYMENT_1_AMOUNT: "$2,300",
      PAYMENT_2_DUE_DATE: "October 15, 2026",
      PAYMENT_2_AMOUNT: "$2,300",
      PAYMENT_3_DUE_DATE: "December 15, 2026",
      PAYMENT_3_AMOUNT: "$2,300",
      GRANT_ENABLED: false,
      ACCESSORY_ENABLED: false,
      PAYMENT_2_ENABLED: true,
      PAYMENT_3_ENABLED: true,
    },
    commercial: {
      category: "Clothing",
      fullPrice: 6900,
      grantAmount: 0,
      remainingBalance: 6900,
    },
  });
});

test("returns the exact grant breakdown values and grant title suffix", () => {
  const input = {
    ...baseInput,
    grantEnabled: true,
    grantAmount: 2000,
    payments: [
      { dueDate: "2026-08-16", amount: 1700 },
      { dueDate: "2026-10-15", amount: 1600 },
      { dueDate: "2027-01-07", amount: 1600 },
    ],
  };
  const result = buildContract(input, registry);
  assert.equal(result.placeholders.FULL_PRICE, "$6,900");
  assert.equal(result.placeholders.GRANT_AMOUNT, "$2,000");
  assert.equal(result.placeholders.REMAINING_BALANCE, "$4,900");
  assert.equal(result.placeholders.GRANT_ENABLED, true);
  assert.match(result.title, / - \(grant\)$/);
});

test("enables the Accessory clause only for Accessory-family brands", () => {
  const accessory = buildContract({
    ...baseInput,
    category: "Acc",
    payments: [
      { dueDate: "2026-08-16", amount: 1700 },
      { dueDate: "2026-10-15", amount: 1600 },
      { dueDate: "2027-01-07", amount: 1600 },
    ],
  }, registry);
  const clothing = buildContract(baseInput, registry);
  assert.equal(accessory.placeholders.ACCESSORY_ENABLED, true);
  assert.equal(accessory.placeholders.CLOTHING_FULL_PRICE, "$6,900");
  assert.equal(clothing.placeholders.ACCESSORY_ENABLED, false);
});

test("leaves missing optional payment placeholder strings empty", () => {
  const result = buildContract({
    ...baseInput,
    payments: [{ dueDate: "2026-08-16", amount: 6900 }],
  }, registry);

  assert.equal(result.placeholders.PAYMENT_1_DUE_DATE, "August 16, 2026");
  assert.equal(result.placeholders.PAYMENT_1_AMOUNT, "$6,900");
  assert.equal(result.placeholders.PAYMENT_2_DUE_DATE, "");
  assert.equal(result.placeholders.PAYMENT_2_AMOUNT, "");
  assert.equal(result.placeholders.PAYMENT_3_DUE_DATE, "");
  assert.equal(result.placeholders.PAYMENT_3_AMOUNT, "");
  assert.equal(result.placeholders.PAYMENT_2_ENABLED, false);
  assert.equal(result.placeholders.PAYMENT_3_ENABLED, false);
});

test("returns unescaped raw text for the Markdown resolver", () => {
  const result = buildContract({
    ...baseInput,
    brand: "Needle * Thread <NYC>",
    representative: "A_B [Rep]",
  }, registry);

  assert.equal(result.placeholders.BRAND_NAME, "Needle * Thread <NYC>");
  assert.equal(result.placeholders.REPRESENTATIVE_NAME, "A_B [Rep]");
});

test("rejects payments that do not equal the remaining balance", () => {
  assert.throws(
    () => buildContract({ ...baseInput, payments: [{ dueDate: "2026-08-16", amount: 100 }] }, registry),
    /must equal the remaining balance of \$6,900/,
  );
});

test("rejects payment dates that are not strictly increasing", () => {
  assert.throws(
    () => buildContract({
      ...baseInput,
      payments: [
        { dueDate: "2026-08-16", amount: 2300 },
        { dueDate: "2026-10-15", amount: 2300 },
        { dueDate: "2026-10-15", amount: 2300 },
      ],
    }, registry),
    /strictly increasing/,
  );
});

test("preserves event and event-month validation", () => {
  assert.throws(
    () => buildContract({ ...baseInput, eventCode: "LFW" }, registry),
    /Unsupported event: LFW/,
  );
  assert.throws(
    () => buildContract({ ...baseInput, eventMonth: "2027-02" }, registry),
    /Event month must look like February 2027/,
  );
  assert.throws(
    () => buildContract({ ...baseInput, eventMonth: "Smarch 2027" }, registry),
    /Unsupported event month: Smarch/,
  );
});

test("preserves grant amount validation", () => {
  assert.throws(
    () => buildContract({ ...baseInput, grantEnabled: true, grantAmount: 0 }, registry),
    /Grant amount must be greater than \$0 and lower than \$6,900/,
  );
  assert.throws(
    () => buildContract({ ...baseInput, grantEnabled: true, grantAmount: 6900 }, registry),
    /Grant amount must be greater than \$0 and lower than \$6,900/,
  );
});

test("rejects grant amounts smaller than one cent", () => {
  assert.throws(
    () => calculateCommercial({
      category: "Clothing",
      grantEnabled: true,
      grantAmount: 2000.001,
    }, registry),
    /Grant amount must use no more than two decimal places/,
  );
});

test("rejects third-decimal payment amounts even when their floating total balances", () => {
  assert.throws(
    () => buildContract({
      ...baseInput,
      payments: [
        { dueDate: "2026-08-16", amount: 2300.001 },
        { dueDate: "2026-10-15", amount: 2299.999 },
        { dueDate: "2026-12-15", amount: 2300 },
      ],
    }, registry),
    /Payment 1 amount must use no more than two decimal places/,
  );
});

test("accepts valid cent amounts and keeps current currency display behavior", () => {
  const result = buildContract({
    ...baseInput,
    grantEnabled: true,
    grantAmount: 2000.01,
    payments: [
      { dueDate: "2026-08-16", amount: 1600 },
      { dueDate: "2026-10-15", amount: 1600 },
      { dueDate: "2026-12-15", amount: 1699.99 },
    ],
  }, registry);

  assert.equal(result.commercial.remainingBalance, 4899.99);
  assert.equal(result.placeholders.GRANT_AMOUNT, "$2,000.01");
  assert.equal(result.placeholders.REMAINING_BALANCE, "$4,899.99");
  assert.equal(result.placeholders.PAYMENT_3_AMOUNT, "$1,699.99");
});

test("preserves payment count, amount, and date validation", () => {
  assert.throws(
    () => buildContract({ ...baseInput, payments: [] }, registry),
    /Provide between one and three payments/,
  );
  assert.throws(
    () => buildContract({
      ...baseInput,
      payments: [{ dueDate: "2026-08-16", amount: 0 }],
    }, registry),
    /Payment 1 amount must be greater than \$0/,
  );
  assert.throws(
    () => buildContract({
      ...baseInput,
      payments: [{ dueDate: "August 16, 2026", amount: 6900 }],
    }, registry),
    /Payment dates must use YYYY-MM-DD/,
  );
  assert.throws(
    () => buildContract({
      ...baseInput,
      payments: [{ dueDate: "2026-02-30", amount: 6900 }],
    }, registry),
    /Invalid payment date: 2026-02-30/,
  );
});

test("resolves the actual Fashion Week template across commercial and payment variants", () => {
  const variants = [
    {
      input: {
        ...baseInput,
        grantEnabled: true,
        grantAmount: 2000,
        payments: [
          { dueDate: "2026-08-16", amount: 1700 },
          { dueDate: "2026-10-15", amount: 1600 },
          { dueDate: "2027-01-07", amount: 1600 },
        ],
      },
      present: [
        "Fashion Forward Fund Grant Applied: $2,000",
        "Remaining Balance to be Paid by Designer: $4,900",
        "Payment #1",
        "Payment #2",
        "Payment #3",
      ],
      absent: ["For Accessory/Jewelry brands only"],
    },
    {
      input: {
        ...baseInput,
        category: "Accessory",
        payments: [{ dueDate: "2026-08-16", amount: 4900 }],
      },
      present: ["For Accessory/Jewelry brands only", "Payment #1"],
      absent: [
        "Fashion Forward Fund Grant Applied",
        "Remaining Balance to be Paid by Designer",
        "Payment #2",
        "Payment #3",
      ],
    },
    {
      input: {
        ...baseInput,
        category: "Accessory",
        payments: [
          { dueDate: "2026-08-16", amount: 2450 },
          { dueDate: "2026-10-15", amount: 2450 },
        ],
      },
      present: ["For Accessory/Jewelry brands only", "Payment #1", "Payment #2"],
      absent: ["Fashion Forward Fund Grant Applied", "Payment #3"],
    },
  ];

  for (const { input, present, absent } of variants) {
    const { placeholders } = buildContract(input, registry);
    const resolved = resolveMarkdownTemplate(markdownTemplate, placeholders);

    assert.doesNotMatch(resolved, /\{\{/);
    assert.doesNotMatch(resolved, /\}\}/);
    for (const text of present) assert.match(resolved, new RegExp(text.replaceAll("$", "\\$")));
    for (const text of absent) assert.doesNotMatch(resolved, new RegExp(text.replaceAll("$", "\\$")));
  }
});
