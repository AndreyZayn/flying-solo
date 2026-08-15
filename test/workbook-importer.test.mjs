import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { importFashionWeekWorkbook } from "../src/workbook-importer.mjs";

async function workbookBuffer(rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["FW", "Season", "Brand", "Name", "Email", "", "Category", "LIST_PRICE", "Discount", "PMNT_1", "PMNT_1_DUE", "PMNT_2", "PMNT_2_DUE", "PMNT_3", "PMNT_3_DUE"]);
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("imports every Fashion Week row with source evidence and normalized inputs", async () => {
  const buffer = await workbookBuffer([
    ["NYFW ", new Date(Date.UTC(2027, 1, 1)), "Brand One", "Person One", "one@example.com", "Person", "Clothing", 4900, "Grant", 1700, new Date(Date.UTC(2026, 7, 16)), 1600, new Date(Date.UTC(2026, 9, 15)), 1600, new Date(Date.UTC(2027, 0, 7))],
    ["PFW", "Feb-27", "Brand Two", "Person Two", "two@example.com", "Person", "Acc", 4900, "", 1700, new Date(Date.UTC(2026, 7, 16)), 1600, new Date(Date.UTC(2026, 9, 15)), 1600, new Date(Date.UTC(2026, 11, 15))],
  ]);

  const batch = await importFashionWeekWorkbook(buffer, { fileName: "sample.xlsx", now: () => "2026-08-12T10:00:00.000Z" });

  assert.equal(batch.schemaVersion, 1);
  assert.equal(batch.batch.templateId, "fashion-week");
  assert.equal(batch.batch.source.fileName, "sample.xlsx");
  assert.equal(batch.records.length, 2);
  assert.deepEqual(batch.records[0].input, {
    eventCode: "NYFW",
    eventMonth: "February 2027",
    brand: "Brand One",
    representative: "Person One",
    recipientEmail: "one@example.com",
    category: "Clothing",
    grantEnabled: true,
    grantAmount: 2000,
    listPrice: 4900,
    payments: [
      { dueDate: "2026-08-16", amount: 1700 },
      { dueDate: "2026-10-15", amount: 1600 },
      { dueDate: "2027-01-07", amount: 1600 },
    ],
  });
  assert.equal(batch.records[0].sourceRow, 2);
  assert.deepEqual(batch.records[0].importIssues, []);
  assert.equal(batch.records[1].input.category, "Acc");
  assert.equal(batch.records[1].input.eventMonth, "February 2027");
});

test("keeps invalid source rows reviewable and reports the exact issue", async () => {
  const buffer = await workbookBuffer([
    ["NYFW", "Feb-27", "Needs Review", "Person", "person@example.com", "Person", "Acc", 4900, "", 1700, new Date(Date.UTC(2026, 7, 16)), 1600, new Date(Date.UTC(2026, 9, 15)), 1600, new Date(Date.UTC(2026, 9, 15))],
  ]);
  const batch = await importFashionWeekWorkbook(buffer, { fileName: "sample.xlsx" });
  assert.equal(batch.records.length, 1);
  assert.match(batch.records[0].importIssues[0], /strictly increasing/);
  assert.equal(batch.records[0].status, "pending");
});

test("rejects workbooks that do not have the Fashion Week header contract", async () => {
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Sheet1").addRow(["Brand", "Email"]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  await assert.rejects(importFashionWeekWorkbook(buffer, { fileName: "wrong.xlsx" }), /missing required columns/i);
});

