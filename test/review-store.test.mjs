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

function artifactFixture(overrides = {}) {
  return {
    relativePath: "contracts/001--brand-1--example-brand.md",
    artifactStatus: "valid",
    revision: 1,
    contentSha256: "a".repeat(64),
    fileSha256: "b".repeat(64),
    validatedAt: "2026-08-10T12:00:00-04:00",
    ...overrides,
  };
}

const verifiedBatchFixture = {
  relativeDirectory: "data/runtime/verified-batches/2026-08-10--batch-1",
  createdAt: "2026-08-10T12:00:00-04:00",
};

function completedContract(overrides = {}) {
  return {
    templateId: "fashion-week",
    title: "FLYING SOLO - NYFW - Feb 2027 - Example Brand",
    titleTemplate: "FLYING SOLO - {{BRAND_NAME}}",
    input: { brand: "Example Brand", representative: "Example Person" },
    templateMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}",
    resolvedMarkdown: "## EVENT AGREEMENT\n\nExample Brand",
    verifiedAt: "2026-08-10T12:00:00-04:00",
    artifact: artifactFixture(),
    verifiedBatch: verifiedBatchFixture,
    ...overrides,
  };
}

async function setupStore() {
  const { createReviewStore } = await loadStoreModule();
  assert.equal(typeof createReviewStore, "function");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "flying-solo-review-"));
  const examplePath = path.join(directory, "example.json");
  const queuePath = path.join(directory, "runtime", "review-queue.json");
  await fs.writeFile(examplePath, JSON.stringify(seededQueue));
  const store = createReviewStore({
    examplePath,
    queuePath,
    now: () => "2026-08-10T12:00:00.000Z",
  });
  await store.initialize();
  return { store, queuePath, runtimeDirectory: path.join(directory, "runtime") };
}

test("seeds only the local review queue on first run", async () => {
  const { store, queuePath, runtimeDirectory } = await setupStore();
  const queue = await store.getQueue();
  assert.equal(queue.records[0].input.brand, "Example Brand");
  assert.deepEqual(queue.progress, { total: 1, verified: 0, pending: 1, complete: false });
  assert.equal(JSON.parse(await fs.readFile(queuePath, "utf8")).batch.id, "batch-1");
  assert.deepEqual(await fs.readdir(runtimeDirectory), ["review-queue.json"]);
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

test("verify persists the artifact reference and verified batch location with the record", async () => {
  const { store } = await setupStore();
  const result = await store.verify("brand-1", completedContract());

  assert.equal(result.record.status, "verified");
  assert.equal(result.record.verifiedAt, "2026-08-10T12:00:00-04:00");
  assert.deepEqual(result.record.artifact, artifactFixture());
  assert.equal(result.progress.complete, true);
  const queue = await store.getQueue();
  assert.deepEqual(queue.batch.verifiedBatch, verifiedBatchFixture);
  assert.deepEqual(queue.records[0].artifact, artifactFixture());
  await assert.rejects(
    store.verify("brand-1", completedContract()),
    /already verified/i,
  );
});

test("verify rejects queue-only verification without a persisted artifact reference", async () => {
  const { store } = await setupStore();
  await assert.rejects(
    store.verify("brand-1", completedContract({ artifact: undefined })),
    /artifact/i,
  );
  await assert.rejects(
    store.verify("brand-1", completedContract({ verifiedBatch: undefined })),
    /verified batch/i,
  );
  await assert.rejects(
    store.verify("brand-1", completedContract({ verifiedAt: undefined })),
    /verification time/i,
  );
  const record = (await store.getQueue()).records[0];
  assert.equal(record.status, "pending");
});

test("editing verified sourced data marks the record for reverification", async () => {
  const { store } = await setupStore();
  await store.verify("brand-1", completedContract());

  const draft = await store.saveInput("brand-1", {
    input: { brand: "Example Brand Revised", representative: "Example Person" },
  });

  assert.equal(draft.status, "changes_pending");
  assert.equal(draft.verifiedAt, "2026-08-10T12:00:00-04:00");
  assert.deepEqual(draft.artifact, artifactFixture());
  assert.deepEqual((await store.getQueue()).progress, {
    total: 1,
    verified: 0,
    pending: 1,
    complete: false,
  });
});

test("reverification replaces the artifact reference on the same record", async () => {
  const { store } = await setupStore();
  await store.verify("brand-1", completedContract());
  await store.saveInput("brand-1", {
    input: { brand: "Example Brand Revised", representative: "Example Person" },
  });
  const revised = await store.verify("brand-1", completedContract({
    title: "FLYING SOLO - NYFW - Feb 2027 - Example Brand Revised",
    input: { brand: "Example Brand Revised", representative: "Example Person" },
    resolvedMarkdown: "## EVENT AGREEMENT\n\nExample Brand Revised",
    verifiedAt: "2026-08-10T12:05:00-04:00",
    artifact: artifactFixture({ revision: 2, contentSha256: "c".repeat(64), fileSha256: "d".repeat(64) }),
  }));

  assert.equal(revised.record.status, "verified");
  assert.equal(revised.record.artifact.revision, 2);
  assert.equal(revised.record.verifiedAt, "2026-08-10T12:05:00-04:00");
  assert.deepEqual((await store.getQueue()).batch.verifiedBatch, verifiedBatchFixture);
});

test("recordArtifact refreshes a verified record after repair and rejects unverified records", async () => {
  const { store } = await setupStore();
  await assert.rejects(
    store.recordArtifact("brand-1", { artifact: artifactFixture(), verifiedBatch: verifiedBatchFixture, verifiedAt: "2026-08-10T12:00:00-04:00" }),
    /verified record/i,
  );

  await store.verify("brand-1", completedContract());
  const repaired = artifactFixture({ fileSha256: "e".repeat(64), validatedAt: "2026-08-10T12:10:00-04:00" });
  const record = await store.recordArtifact("brand-1", {
    artifact: repaired,
    verifiedBatch: verifiedBatchFixture,
    verifiedAt: "2026-08-10T12:00:00-04:00",
  });

  assert.equal(record.status, "verified");
  assert.deepEqual(record.artifact, repaired);
  assert.deepEqual((await store.getQueue()).records[0].artifact, repaired);
});
