import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { createAppServer } from "../server.mjs";

function reviewStore() {
  let queue;
  return {
    initialize: async () => {},
    getQueue: async () => queue,
    replaceQueue: async (next) => { queue = next; return { ...next, progress: { total: next.records.length, verified: 0, pending: next.records.length, complete: false } }; },
    saveDraft: async () => { throw new Error("not used"); },
    verify: async () => { throw new Error("not used"); },
  };
}

async function start() {
  const server = createAppServer({ reviewStore: reviewStore() });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function sampleWorkbook() {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(["FW", "Season", "Brand", "Name", "Email", "", "Category", "LIST_PRICE", "Discount", "PMNT_1", "PMNT_1_DUE", "PMNT_2", "PMNT_2_DUE", "PMNT_3", "PMNT_3_DUE"]);
  sheet.addRow(["NYFW", "Feb-27", "Uploaded Brand", "Person", "person@example.com", "Person", "Clothing", 6900, "", 2300, new Date(Date.UTC(2026, 7, 16)), 2300, new Date(Date.UTC(2026, 9, 15)), 2300, new Date(Date.UTC(2026, 11, 15))]);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("imports a raw Fashion Week workbook into the active review queue", async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());
  const response = await fetch(`${base}/api/import-workbook?templateId=fashion-week`, { method: "POST", headers: { "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x-file-name": "upload.xlsx" }, body: await sampleWorkbook() });
  assert.equal(response.status, 200);
  const queue = await response.json();
  assert.equal(queue.records[0].input.brand, "Uploaded Brand");
  assert.equal(queue.batch.templateId, "fashion-week");
});

test("loads a Membership demo and serves family-scoped placeholders", async (t) => {
  const { server, base } = await start();
  t.after(() => server.close());
  const demo = await fetch(`${base}/api/demo/membership`, { method: "POST" });
  assert.equal(demo.status, 200);
  const queue = await demo.json();
  assert.equal(queue.batch.templateId, "membership");
  assert.equal(queue.records[0].input.packageId, "clothing-store-pr");
  const placeholders = await fetch(`${base}/api/placeholders?templateId=membership`).then((response) => response.json());
  assert.ok(placeholders.some((item) => item.key === "CANC_DATE"));
  const generated = await fetch(`${base}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ templateId: "membership", input: queue.records[0].input }) }).then((response) => response.json());
  assert.match(generated.title, /6 months - Mock Membership Brand/);
});
