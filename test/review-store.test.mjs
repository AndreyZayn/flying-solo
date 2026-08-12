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

test("seeds the runtime queue and verified-contract handoff directory on first run", async () => {
  const { store, queuePath, archivePath, verifiedContractsDirectory } = await setupStore();
  const queue = await store.getQueue();
  assert.equal(queue.records[0].input.brand, "Example Brand");
  assert.deepEqual(queue.progress, { total: 1, verified: 0, pending: 1, complete: false });
  assert.equal(JSON.parse(await fs.readFile(queuePath, "utf8")).batch.id, "batch-1");
  assert.equal(await fs.access(verifiedContractsDirectory).then(() => true, () => false), true);
  assert.equal(await fs.access(archivePath).then(() => true, () => false), false);
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

test("verifies once, writes an exact Markdown handoff file, and completes the batch", async () => {
  const { store, archivePath, verifiedContractsDirectory } = await setupStore();
  const resolvedMarkdown = "## EVENT AGREEMENT\n\nExample Brand";
  const result = await store.verify("brand-1", {
    templateId: "fashion-week",
    title: "FLYING SOLO - NYFW - Feb 2027 - Example Brand",
    input: { brand: "Example Brand", representative: "Example Person" },
    templateMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}",
    resolvedMarkdown,
  });
  assert.equal(result.record.status, "verified");
  assert.equal(result.progress.complete, true);
  const contractPath = path.join(verifiedContractsDirectory, "batch-1--brand-1.md");
  assert.equal(await fs.access(contractPath).then(() => true, () => false), true);
  const handoff = await fs.readFile(contractPath, "utf8");
  assert.match(handoff, /^---\nschema_version: 1\nstatus: verified\ncontract_id: "batch-1:brand-1"/);
  assert.match(handoff, /template_id: "fashion-week"/);
  assert.match(handoff, /content_sha256: "[a-f0-9]{64}"/);
  assert.match(handoff, /## Definitions/);
  assert.match(handoff, /## Normalized input/);
  assert.match(handoff, /## Reviewed template Markdown/);
  assert.match(handoff, /## Verified contract Markdown/);
  assert.match(handoff, new RegExp(resolvedMarkdown));
  assert.equal(await fs.access(archivePath).then(() => true, () => false), false);
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
