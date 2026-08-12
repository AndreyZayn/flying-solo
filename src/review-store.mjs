import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

function clone(value) {
  return structuredClone(value);
}

function progress(queue) {
  const total = queue.records.length;
  const verified = queue.records.filter((record) => record.status === "verified").length;
  return { total, verified, pending: total - verified, complete: total > 0 && verified === total };
}

function validateQueue(queue) {
  if (queue?.schemaVersion !== 1 || !queue.batch?.id || !queue.batch?.templateId) {
    throw new Error("Review queue requires schemaVersion 1 and batch metadata.");
  }
  if (!Array.isArray(queue.records) || queue.records.length === 0) {
    throw new Error("Review queue requires at least one brand record.");
  }
  const ids = new Set();
  for (const record of queue.records) {
    if (!record?.id || ids.has(record.id) || !record.input || typeof record.input !== "object") {
      throw new Error("Every review record requires a unique id and input object.");
    }
    if (!["pending", "verified"].includes(record.status)) {
      throw new Error(`Unsupported review status: ${record.status}.`);
    }
    ids.add(record.id);
  }
  return queue;
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, "utf8"));
}

async function writeJsonAtomic(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filename);
}

function pathPart(value) {
  return String(value).trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function handoffMarkdown(contract) {
  return `---
schema_version: 1
status: verified
contract_id: ${JSON.stringify(contract.id)}
batch_id: ${JSON.stringify(contract.batchId)}
record_id: ${JSON.stringify(contract.recordId)}
template_id: ${JSON.stringify(contract.templateId)}
title: ${JSON.stringify(contract.title)}
verified_at: ${JSON.stringify(contract.verifiedAt)}
verified_by: ${JSON.stringify(contract.verifiedBy)}
content_sha256: ${JSON.stringify(contract.contentHash)}
---

# Verified contract

## Definitions

- **status: verified** — Anna reviewed and explicitly approved this contract for the current run.
- **normalized input** — structured Flying Solo values used to prepare this contract.
- **reviewed template Markdown** — the exact template Anna reviewed, including its placeholder syntax.
- **verified contract Markdown** — the resolved contract source a SignatureConfirm agent may use to create a draft.

## Normalized input

\`\`\`json
${JSON.stringify(contract.input, null, 2)}
\`\`\`

## Reviewed template Markdown

\`\`\`markdown
${contract.templateMarkdown}
\`\`\`

## Verified contract Markdown

${contract.resolvedMarkdown}
`;
}

export function createReviewStore({
  examplePath,
  queuePath,
  verifiedContractsDirectory,
  now = () => new Date().toISOString(),
}) {
  let mutation = Promise.resolve();
  let initialization;

  function locked(operation) {
    const next = mutation.then(operation, operation);
    mutation = next.catch(() => {});
    return next;
  }

  function initialize() {
    initialization ??= locked(async () => {
      await fs.mkdir(path.dirname(queuePath), { recursive: true });
      try {
        await fs.access(queuePath);
      } catch {
        const example = validateQueue(await readJson(examplePath));
        await writeJsonAtomic(queuePath, example);
      }
      await fs.mkdir(verifiedContractsDirectory, { recursive: true });
      validateQueue(await readJson(queuePath));
    });
    return initialization;
  }

  async function getQueue() {
    const queue = validateQueue(await readJson(queuePath));
    return { ...clone(queue), progress: progress(queue) };
  }

  async function saveDraft(recordId, { input, draftMarkdown }) {
    return locked(async () => {
      const queue = validateQueue(await readJson(queuePath));
      const record = queue.records.find((candidate) => candidate.id === recordId);
      if (!record) throw new Error(`Unknown review record: ${recordId}.`);
      if (record.status === "verified") throw new Error(`${recordId} is already verified.`);
      if (!input || typeof input !== "object" || typeof draftMarkdown !== "string") {
        throw new Error("Draft requires input and Markdown.");
      }
      record.input = clone(input);
      record.draftMarkdown = draftMarkdown;
      record.updatedAt = now();
      await writeJsonAtomic(queuePath, queue);
      return clone(record);
    });
  }

  async function verify(recordId, completed) {
    return locked(async () => {
      const queue = validateQueue(await readJson(queuePath));
      const record = queue.records.find((candidate) => candidate.id === recordId);
      if (!record) throw new Error(`Unknown review record: ${recordId}.`);
      if (record.status === "verified") throw new Error(`${recordId} is already verified.`);
      for (const property of ["templateId", "title", "templateMarkdown", "resolvedMarkdown"]) {
        if (!String(completed[property] ?? "").trim()) throw new Error(`Verification requires ${property}.`);
      }
      if (!completed.input || typeof completed.input !== "object") {
        throw new Error("Verification requires normalized input.");
      }
      if (completed.resolvedMarkdown.includes("{{") || completed.resolvedMarkdown.includes("}}")) {
        throw new Error("Verified contract cannot contain unresolved placeholders.");
      }
      const verifiedAt = now();
      const verifiedContract = {
        id: `${queue.batch.id}:${record.id}`,
        batchId: queue.batch.id,
        recordId: record.id,
        templateId: completed.templateId,
        title: completed.title,
        input: clone(completed.input),
        templateMarkdown: completed.templateMarkdown,
        resolvedMarkdown: completed.resolvedMarkdown,
        contentHash: createHash("sha256").update(completed.resolvedMarkdown, "utf8").digest("hex"),
        verifiedAt,
        verifiedBy: "Anna",
      };
      const filename = `${pathPart(queue.batch.id)}--${pathPart(record.id)}.md`;
      const verifiedContractPath = path.join(verifiedContractsDirectory, filename);
      try {
        await fs.writeFile(verifiedContractPath, handoffMarkdown(verifiedContract), { encoding: "utf8", flag: "wx" });
      } catch (error) {
        if (error?.code === "EEXIST") {
          throw new Error(`${recordId} already has a verified Markdown handoff file.`);
        }
        throw error;
      }
      record.input = clone(completed.input);
      record.draftMarkdown = completed.templateMarkdown;
      record.status = "verified";
      record.verifiedAt = verifiedAt;
      record.updatedAt = verifiedAt;
      await writeJsonAtomic(queuePath, queue);
      return { record: clone(record), progress: progress(queue) };
    });
  }

  return { initialize, getQueue, saveDraft, verify };
}
