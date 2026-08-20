import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function loadStoreModule() {
  try {
    return await import("../src/review-store.mjs");
  } catch {
    return {};
  }
}

const seededQueue = {
  schemaVersion: 1,
  batch: { id: "batch-1", label: "Fashion Week Review", templateId: "fashion-week" },
  records: [{
    id: "brand-1",
    status: "pending",
    input: { brand: "Example Brand", representative: "Example Person" },
    verifiedAt: null,
  }],
};

async function setupStore() {
  const { createReviewStore } = await loadStoreModule();
  assert.equal(typeof createReviewStore, "function");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "flying-solo-review-"));
  const examplePath = path.join(directory, "example.json");
  const queuePath = path.join(directory, "runtime", "review-queue.json");
  const archivePath = path.join(directory, "runtime", "completed-contracts.json");
  const verifiedContractsDirectory = path.join(directory, "runtime", "verified-contracts");
  await fs.writeFile(examplePath, JSON.stringify(seededQueue));
  const store = createReviewStore({
    examplePath,
    queuePath,
    archivePath,
    verifiedContractsDirectory,
    now: () => "2026-08-10T12:00:00.000Z",
  });
  await store.initialize();
  return { store, queuePath, archivePath, verifiedContractsDirectory };
}

test("seeds only the local review queue on first run", async () => {
  const { store, queuePath, archivePath, verifiedContractsDirectory } = await setupStore();
  const queue = await store.getQueue();
  assert.equal(queue.records[0].input.brand, "Example Brand");
  assert.deepEqual(queue.progress, { total: 1, verified: 0, pending: 1, complete: false });
  assert.equal(JSON.parse(await fs.readFile(queuePath, "utf8")).batch.id, "batch-1");
  assert.equal(await fs.access(verifiedContractsDirectory).then(() => true, () => false), false);
  assert.equal(await fs.access(archivePath).then(() => true, () => false), false);
});

test("persists record-specific sourced input without a contract-body draft", async () => {
  const { store } = await setupStore();
  await store.saveInput("brand-1", {
    input: { brand: "Edited Brand", representative: "Edited Person" },
  });
  const record = (await store.getQueue()).records[0];
  assert.equal(record.input.brand, "Edited Brand");
  assert.equal(record.draftMarkdown, undefined);
  assert.equal(record.draftTitleTemplate, undefined);
  assert.equal(record.updatedAt, "2026-08-10T12:00:00.000Z");
});

test("atomically replaces the active review queue for a new uploaded batch", async () => {
  const { store } = await setupStore();
  const replacement = {
    schemaVersion: 1,
    batch: { id: "uploaded-batch", label: "Uploaded", templateId: "fashion-week" },
    records: [{ id: "row-2", status: "pending", input: { brand: "Uploaded Brand" }, importIssues: [] }],
  };
  const queue = await store.replaceQueue(replacement);
  assert.equal(queue.batch.id, "uploaded-batch");
  assert.equal(queue.records[0].input.brand, "Uploaded Brand");
  assert.deepEqual(queue.progress, { total: 1, verified: 0, pending: 1, complete: false });
});

test("verifies once without creating a downstream handoff file and completes the batch", async () => {
  const { store, archivePath, verifiedContractsDirectory } = await setupStore();
  const resolvedMarkdown = "## EVENT AGREEMENT\n\nExample Brand";
  const result = await store.verify("brand-1", {
    templateId: "fashion-week",
    title: "FLYING SOLO - NYFW - Feb 2027 - Example Brand",
    titleTemplate: "FLYING SOLO - {{BRAND_NAME}}",
    input: { brand: "Example Brand", representative: "Example Person" },
    templateMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}",
    resolvedMarkdown,
  });
  assert.equal(result.record.status, "verified");
  assert.equal(result.progress.complete, true);
  const contractPath = path.join(verifiedContractsDirectory, "batch-1--brand-1.md");
  assert.equal(await fs.access(contractPath).then(() => true, () => false), false);
  assert.equal(await fs.access(archivePath).then(() => true, () => false), false);
  await assert.rejects(
    store.verify("brand-1", {
      templateId: "fashion-week",
      title: "Duplicate",
      titleTemplate: "Duplicate",
      input: {},
      templateMarkdown: "duplicate",
      resolvedMarkdown: "duplicate",
    }),
    /already verified/i,
  );
});

test("editing verified sourced data marks the record for reverification", async () => {
  const { store } = await setupStore();
  await store.verify("brand-1", {
    templateId: "fashion-week",
    title: "FLYING SOLO - NYFW - Feb 2027 - Example Brand",
    titleTemplate: "FLYING SOLO - {{BRAND_NAME}}",
    input: { brand: "Example Brand", representative: "Example Person" },
    templateMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}",
    resolvedMarkdown: "## EVENT AGREEMENT\n\nExample Brand",
  });

  const draft = await store.saveInput("brand-1", {
    input: { brand: "Example Brand Revised", representative: "Example Person" },
  });

  assert.equal(draft.status, "changes_pending");
  assert.equal(draft.verifiedAt, "2026-08-10T12:00:00.000Z");
  assert.deepEqual((await store.getQueue()).progress, {
    total: 1,
    verified: 0,
    pending: 1,
    complete: false,
  });
});

test("reverification updates the local queue without creating a downstream handoff", async () => {
  const { store, verifiedContractsDirectory } = await setupStore();
  const first = await store.verify("brand-1", {
    templateId: "fashion-week",
    title: "FLYING SOLO - NYFW - Feb 2027 - Example Brand",
    titleTemplate: "FLYING SOLO - {{BRAND_NAME}}",
    input: { brand: "Example Brand", representative: "Example Person" },
    templateMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}",
    resolvedMarkdown: "## EVENT AGREEMENT\n\nExample Brand",
  });
  await store.saveInput("brand-1", {
    input: { brand: "Example Brand Revised", representative: "Example Person" },
  });
  const revised = await store.verify("brand-1", {
    templateId: "fashion-week",
    title: "FLYING SOLO - NYFW - Feb 2027 - Example Brand Revised",
    titleTemplate: "FLYING SOLO - {{BRAND_NAME}} revised",
    input: { brand: "Example Brand Revised", representative: "Example Person" },
    templateMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}} revised",
    resolvedMarkdown: "## EVENT AGREEMENT\n\nExample Brand Revised revised",
  });

  assert.equal(first.record.status, "verified");
  assert.equal(revised.record.status, "verified");
  assert.equal(await fs.access(verifiedContractsDirectory).then(() => true, () => false), false);
});
