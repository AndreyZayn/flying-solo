import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createVerifiedBatchStore } from "../src/verified-batch-store.mjs";

const HEX64 = /^[a-f0-9]{64}$/;
const LOCAL_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

const batch = {
  id: "fashion-week-abc123def456-2026-08-21",
  label: "8.9.26_FW",
  templateId: "fashion-week",
  source: { type: "xlsx", fileName: "8.9.26_FW.xlsx", sha256: "f".repeat(64) },
};

function sampleContract(overrides = {}) {
  return {
    templateId: "fashion-week",
    title: "FLYING SOLO - NYFW - February 2027 - Example Brand",
    titleTemplate: "FLYING SOLO - {{BRAND_NAME}}",
    input: { brand: "Example Brand", representative: "Example Person", recipientEmail: "person@example.com" },
    templateMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n",
    resolvedMarkdown: "## EVENT AGREEMENT\n\nExample Brand\n",
    ...overrides,
  };
}

function canonicalContentSha(contract) {
  return createHash("sha256").update(JSON.stringify({
    title: contract.title,
    titleTemplate: contract.titleTemplate,
    templateMarkdown: contract.templateMarkdown,
    resolvedMarkdown: contract.resolvedMarkdown,
  }), "utf8").digest("hex");
}

async function setupStore({ now = () => new Date(2026, 7, 21, 10, 0, 0) } = {}) {
  const baseDirectory = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "flying-solo-batches-")), "verified-batches");
  const store = createVerifiedBatchStore({
    baseDirectory,
    relativeBase: "data/runtime/verified-batches",
    now,
  });
  return { store, baseDirectory };
}

async function readManifest(baseDirectory, directoryName) {
  return JSON.parse(await fs.readFile(path.join(baseDirectory, directoryName, "batch.json"), "utf8"));
}

const DIRECTORY_NAME = "2026-08-21--fashion-week-abc123def456-2026-08-21";

test("first verification creates the dated directory, manifest, and one validated contract file", async () => {
  const { store, baseDirectory } = await setupStore();
  const contract = sampleContract();
  const result = await store.persistVerifiedContract({
    batch,
    record: { id: "row-2-example-brand", sequence: 1 },
    contract,
    expectedCount: 2,
  });

  assert.equal(result.verifiedBatch.relativeDirectory, `data/runtime/verified-batches/${DIRECTORY_NAME}`);
  assert.match(result.verifiedBatch.createdAt, LOCAL_ISO);
  assert.equal(result.artifact.relativePath, "contracts/001--row-2-example-brand--example-brand.md");
  assert.equal(result.artifact.artifactStatus, "valid");
  assert.equal(result.artifact.revision, 1);
  assert.equal(result.artifact.contentSha256, canonicalContentSha(contract));
  assert.match(result.artifact.fileSha256, HEX64);
  assert.match(result.artifact.validatedAt, LOCAL_ISO);
  assert.match(result.verifiedAt, LOCAL_ISO);

  const manifest = await readManifest(baseDirectory, DIRECTORY_NAME);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.status, "in_progress");
  assert.equal(manifest.batchId, batch.id);
  assert.equal(manifest.label, batch.label);
  assert.equal(manifest.templateId, batch.templateId);
  assert.deepEqual(manifest.source, batch.source);
  assert.equal(manifest.directoryDate, "2026-08-21");
  assert.match(manifest.createdAt, LOCAL_ISO);
  assert.equal(manifest.completedAt, null);
  assert.equal(manifest.expectedCount, 2);
  assert.equal(manifest.validCount, 1);
  assert.equal(manifest.contracts.length, 1);
  const entry = manifest.contracts[0];
  assert.equal(entry.recordId, "row-2-example-brand");
  assert.equal(entry.sequence, 1);
  assert.equal(entry.title, contract.title);
  assert.equal(entry.relativePath, "contracts/001--row-2-example-brand--example-brand.md");
  assert.equal(entry.artifactStatus, "valid");
  assert.equal(entry.revision, 1);
  assert.equal(entry.contentSha256, canonicalContentSha(contract));
  assert.match(entry.fileSha256, HEX64);

  const file = await fs.readFile(
    path.join(baseDirectory, DIRECTORY_NAME, "contracts/001--row-2-example-brand--example-brand.md"),
    "utf8",
  );
  assert.match(file, /^---\nschema_version: 1\nstatus: verified\n/);
  assert.match(file, /^contract_id: "fashion-week-abc123def456-2026-08-21:row-2-example-brand"$/m);
  assert.match(file, /^batch_id: "fashion-week-abc123def456-2026-08-21"$/m);
  assert.match(file, /^record_id: "row-2-example-brand"$/m);
  assert.match(file, /^template_id: "fashion-week"$/m);
  assert.match(file, /^verified_by: "Anna"$/m);
  assert.match(file, new RegExp(`^content_sha256: "${canonicalContentSha(contract)}"$`, "m"));
  assert.match(file, /^revision: 1$/m);
  assert.match(file, /^supersedes_sha256: null$/m);
  assert.match(file, /## Normalized input/);
  assert.match(file, /## Reviewed template Markdown/);
  assert.match(file, /## Reviewed contract title template/);
  assert.ok(file.endsWith(`## Verified contract Markdown\n\n${contract.resolvedMarkdown}\n`));
  assert.match(file, /"recipientEmail": "person@example\.com"/);
});

test("the second verification reuses the stored directory and completes the batch", async () => {
  const { store, baseDirectory } = await setupStore();
  const first = await store.persistVerifiedContract({
    batch,
    record: { id: "row-2-example-brand", sequence: 1 },
    contract: sampleContract(),
    expectedCount: 2,
  });
  const second = await store.persistVerifiedContract({
    batch: { ...batch, verifiedBatch: first.verifiedBatch },
    record: { id: "row-3-second-brand", sequence: 2 },
    contract: sampleContract({
      title: "FLYING SOLO - NYFW - February 2027 - Second Brand",
      resolvedMarkdown: "## EVENT AGREEMENT\n\nSecond Brand\n",
      input: { brand: "Second Brand" },
    }),
    expectedCount: 2,
  });

  assert.equal(second.verifiedBatch.relativeDirectory, first.verifiedBatch.relativeDirectory);
  assert.equal(second.artifact.relativePath, "contracts/002--row-3-second-brand--second-brand.md");
  const manifest = await readManifest(baseDirectory, DIRECTORY_NAME);
  assert.equal(manifest.validCount, 2);
  assert.equal(manifest.status, "complete");
  assert.match(manifest.completedAt, LOCAL_ISO);
  assert.equal(manifest.contracts.length, 2);
  assert.equal(second.model.status, "complete");
});

test("an identical retry recovers without a duplicate revision and keeps the original verified time", async () => {
  let tick = 0;
  const { store, baseDirectory } = await setupStore({
    now: () => new Date(2026, 7, 21, 10, tick++, 0),
  });
  const record = { id: "row-2-example-brand", sequence: 1 };
  const first = await store.persistVerifiedContract({ batch, record, contract: sampleContract(), expectedCount: 1 });
  const retry = await store.persistVerifiedContract({
    batch: { ...batch, verifiedBatch: first.verifiedBatch },
    record,
    contract: sampleContract(),
    expectedCount: 1,
  });

  assert.equal(retry.artifact.revision, 1);
  assert.equal(retry.verifiedAt, first.verifiedAt);
  assert.equal(retry.artifact.relativePath, first.artifact.relativePath);
  assert.equal(retry.artifact.fileSha256, first.artifact.fileSha256);
  const manifest = await readManifest(baseDirectory, DIRECTORY_NAME);
  assert.equal(manifest.contracts.length, 1);
  assert.equal(manifest.contracts[0].revision, 1);
});

test("changed content increments the revision and records the prior hash", async () => {
  const { store, baseDirectory } = await setupStore();
  const record = { id: "row-2-example-brand", sequence: 1 };
  const original = sampleContract();
  const first = await store.persistVerifiedContract({ batch, record, contract: original, expectedCount: 1 });
  const revised = sampleContract({
    title: "FLYING SOLO - NYFW - February 2027 - Example Brand Revised",
    resolvedMarkdown: "## EVENT AGREEMENT\n\nExample Brand Revised\n",
  });
  const second = await store.persistVerifiedContract({
    batch: { ...batch, verifiedBatch: first.verifiedBatch },
    record,
    contract: revised,
    expectedCount: 1,
  });

  assert.equal(second.artifact.revision, 2);
  assert.equal(second.artifact.relativePath, first.artifact.relativePath);
  assert.equal(second.artifact.contentSha256, canonicalContentSha(revised));
  const file = await fs.readFile(path.join(baseDirectory, DIRECTORY_NAME, first.artifact.relativePath), "utf8");
  assert.match(file, /^revision: 2$/m);
  assert.match(file, new RegExp(`^supersedes_sha256: "${canonicalContentSha(original)}"$`, "m"));
  assert.ok(file.endsWith(`## Verified contract Markdown\n\n${revised.resolvedMarkdown}\n`));
});

test("a contract with unresolved placeholders is rejected and never becomes an artifact", async () => {
  const { store, baseDirectory } = await setupStore();
  await assert.rejects(
    store.persistVerifiedContract({
      batch,
      record: { id: "row-2-example-brand", sequence: 1 },
      contract: sampleContract({ resolvedMarkdown: "## EVENT AGREEMENT\n\n{{BRAND_NAME}}\n" }),
      expectedCount: 1,
    }),
    /unresolved placeholder/i,
  );
  assert.equal(
    await fs.access(path.join(baseDirectory, DIRECTORY_NAME, "contracts")).then(() => true, () => false),
    false,
  );
});

test("reconcile reports not started before any verification", async () => {
  const { store } = await setupStore();
  const model = await store.reconcile({ batch, expectedCount: 3 });
  assert.equal(model.status, "not_started");
  assert.equal(model.expectedCount, 3);
  assert.equal(model.validCount, 0);
  assert.deepEqual(model.contracts, []);
  assert.equal(model.relativeDirectory, null);
});

test("reconcile marks a deleted file missing, blocks completion, and persists the reconciliation", async () => {
  const { store, baseDirectory } = await setupStore();
  const first = await store.persistVerifiedContract({
    batch,
    record: { id: "row-2-example-brand", sequence: 1 },
    contract: sampleContract(),
    expectedCount: 2,
  });
  const second = await store.persistVerifiedContract({
    batch: { ...batch, verifiedBatch: first.verifiedBatch },
    record: { id: "row-3-second-brand", sequence: 2 },
    contract: sampleContract({ resolvedMarkdown: "## EVENT AGREEMENT\n\nSecond Brand\n", input: { brand: "Second Brand" } }),
    expectedCount: 2,
  });
  assert.equal(second.model.status, "complete");

  await fs.rm(path.join(baseDirectory, DIRECTORY_NAME, second.artifact.relativePath));
  const model = await store.reconcile({
    batch: { ...batch, verifiedBatch: first.verifiedBatch },
    expectedCount: 2,
  });

  assert.equal(model.status, "needs_attention");
  assert.equal(model.validCount, 1);
  assert.equal(model.completedAt, null);
  assert.equal(model.contracts.find((entry) => entry.recordId === "row-3-second-brand").artifactStatus, "missing");
  const manifest = await readManifest(baseDirectory, DIRECTORY_NAME);
  assert.equal(manifest.validCount, 1);
  assert.equal(manifest.status, "in_progress");
  assert.equal(manifest.completedAt, null);
  assert.equal(manifest.contracts.find((entry) => entry.recordId === "row-3-second-brand").artifactStatus, "missing");
});

test("reconcile marks an altered file invalid", async () => {
  const { store, baseDirectory } = await setupStore();
  const first = await store.persistVerifiedContract({
    batch,
    record: { id: "row-2-example-brand", sequence: 1 },
    contract: sampleContract(),
    expectedCount: 1,
  });
  const filePath = path.join(baseDirectory, DIRECTORY_NAME, first.artifact.relativePath);
  await fs.appendFile(filePath, "\nManually appended line.\n");

  const model = await store.reconcile({
    batch: { ...batch, verifiedBatch: first.verifiedBatch },
    expectedCount: 1,
  });

  assert.equal(model.status, "needs_attention");
  assert.equal(model.validCount, 0);
  assert.equal(model.contracts[0].artifactStatus, "invalid");
});

test("repairing a tampered file rewrites the stable path and restores completion", async () => {
  const { store, baseDirectory } = await setupStore();
  const record = { id: "row-2-example-brand", sequence: 1 };
  const contract = sampleContract();
  const first = await store.persistVerifiedContract({ batch, record, contract, expectedCount: 1 });
  const filePath = path.join(baseDirectory, DIRECTORY_NAME, first.artifact.relativePath);
  await fs.writeFile(filePath, "corrupted", "utf8");
  const broken = await store.reconcile({ batch: { ...batch, verifiedBatch: first.verifiedBatch }, expectedCount: 1 });
  assert.equal(broken.status, "needs_attention");

  const repaired = await store.persistVerifiedContract({
    batch: { ...batch, verifiedBatch: first.verifiedBatch },
    record,
    contract,
    expectedCount: 1,
  });

  assert.equal(repaired.artifact.relativePath, first.artifact.relativePath);
  assert.equal(repaired.artifact.revision, 1);
  assert.equal(repaired.model.status, "complete");
  const file = await fs.readFile(filePath, "utf8");
  assert.ok(file.endsWith(`## Verified contract Markdown\n\n${contract.resolvedMarkdown}\n`));
});

test("starting another batch preserves earlier verified-batch directories", async () => {
  const { store, baseDirectory } = await setupStore();
  const first = await store.persistVerifiedContract({
    batch,
    record: { id: "row-2-example-brand", sequence: 1 },
    contract: sampleContract(),
    expectedCount: 1,
  });
  const laterBatch = { id: "membership-demo-20260821120000", label: "Membership template demo", templateId: "membership", source: { type: "local-demo" } };
  const second = await store.persistVerifiedContract({
    batch: laterBatch,
    record: { id: "mock-membership-brand", sequence: 1 },
    contract: sampleContract({ templateId: "membership", input: { brand: "Mock Membership Brand" } }),
    expectedCount: 1,
  });

  assert.notEqual(second.verifiedBatch.relativeDirectory, first.verifiedBatch.relativeDirectory);
  const originalFile = path.join(baseDirectory, DIRECTORY_NAME, first.artifact.relativePath);
  assert.equal(await fs.access(originalFile).then(() => true, () => false), true);
  const originalManifest = await readManifest(baseDirectory, DIRECTORY_NAME);
  assert.equal(originalManifest.batchId, batch.id);
});

test("reconcile resumes the newest matching directory when the queue reference is lost", async () => {
  const { store } = await setupStore();
  const first = await store.persistVerifiedContract({
    batch,
    record: { id: "row-2-example-brand", sequence: 1 },
    contract: sampleContract(),
    expectedCount: 2,
  });

  const model = await store.reconcile({ batch, expectedCount: 2 });

  assert.equal(model.status, "in_progress");
  assert.equal(model.relativeDirectory, first.verifiedBatch.relativeDirectory);
  assert.equal(model.validCount, 1);
});

test("the manifest and dashboard model never contain contract bodies or recipient emails", async () => {
  const { store, baseDirectory } = await setupStore();
  const contract = sampleContract();
  const result = await store.persistVerifiedContract({
    batch,
    record: { id: "row-2-example-brand", sequence: 1 },
    contract,
    expectedCount: 1,
  });

  const manifestText = await fs.readFile(path.join(baseDirectory, DIRECTORY_NAME, "batch.json"), "utf8");
  assert.doesNotMatch(manifestText, /person@example\.com/);
  assert.doesNotMatch(manifestText, /EVENT AGREEMENT/);
  assert.doesNotMatch(manifestText, /recipientEmail/);
  const modelText = JSON.stringify(result.model);
  assert.doesNotMatch(modelText, /person@example\.com/);
  assert.doesNotMatch(modelText, /EVENT AGREEMENT/);
});
