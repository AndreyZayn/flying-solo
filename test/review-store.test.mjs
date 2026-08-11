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
    draftMarkdown: null,
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
  await fs.writeFile(examplePath, JSON.stringify(seededQueue));
  const store = createReviewStore({
    examplePath,
    queuePath,
    archivePath,
    now: () => "2026-08-10T12:00:00.000Z",
  });
  await store.initialize();
  return { store, queuePath, archivePath };
}

test("seeds the runtime queue and empty archive on first run", async () => {
  const { store, queuePath, archivePath } = await setupStore();
  const queue = await store.getQueue();
  const archive = await store.getArchive();
  assert.equal(queue.records[0].input.brand, "Example Brand");
  assert.deepEqual(queue.progress, { total: 1, verified: 0, pending: 1, complete: false });
  assert.deepEqual(archive, { schemaVersion: 1, contracts: [] });
  assert.equal(JSON.parse(await fs.readFile(queuePath, "utf8")).batch.id, "batch-1");
  assert.deepEqual(JSON.parse(await fs.readFile(archivePath, "utf8")).contracts, []);
});

test("persists record-specific field and editor drafts", async () => {
  const { store } = await setupStore();
  await store.saveDraft("brand-1", {
    input: { brand: "Edited Brand", representative: "Edited Person" },
    draftMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}",
  });
  const record = (await store.getQueue()).records[0];
  assert.equal(record.input.brand, "Edited Brand");
  assert.match(record.draftMarkdown, /\{\{BRAND_NAME\}\}/);
  assert.equal(record.updatedAt, "2026-08-10T12:00:00.000Z");
});

test("verifies once, archives the exact contract, and completes the batch", async () => {
  const { store } = await setupStore();
  const result = await store.verify("brand-1", {
    templateId: "fashion-week",
    title: "FLYING SOLO - NYFW - Feb 2027 - Example Brand",
    input: { brand: "Example Brand", representative: "Example Person" },
    templateMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}",
    resolvedMarkdown: "## EVENT AGREEMENT\n\nExample Brand",
  });
  assert.equal(result.record.status, "verified");
  assert.equal(result.progress.complete, true);
  const archived = (await store.getArchive()).contracts[0];
  assert.equal(archived.recordId, "brand-1");
  assert.equal(archived.resolvedMarkdown, "## EVENT AGREEMENT\n\nExample Brand");
  assert.equal(archived.verifiedAt, "2026-08-10T12:00:00.000Z");
  await assert.rejects(
    store.verify("brand-1", {
      templateId: "fashion-week",
      title: "Duplicate",
      input: {},
      templateMarkdown: "duplicate",
      resolvedMarkdown: "duplicate",
    }),
    /already verified/i,
  );
});
