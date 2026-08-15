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
    if (!["pending", "changes_pending", "verified"].includes(record.status)) {
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

async function writeTextAtomic(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, value, "utf8");
  await fs.rename(temporary, filename);
}

function pathPart(value) {
  return String(value).trim().replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
}

function handoffMetadata(markdown) {
  const revision = Number(markdown.match(/^revision:\s+(\d+)$/m)?.[1] ?? 1);
  const contentHash = markdown.match(/^content_sha256:\s+"([a-f0-9]{64})"$/m)?.[1];
  const verifiedAtValue = markdown.match(/^verified_at:\s+(.+)$/m)?.[1];
  let verifiedAt;
  try {
    verifiedAt = JSON.parse(verifiedAtValue);
  } catch {
    verifiedAt = undefined;
  }
  if (!contentHash || !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error("Existing verified Markdown handoff has invalid revision metadata.");
  }
  return { contentHash, revision, verifiedAt };
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
title_template: ${JSON.stringify(contract.titleTemplate)}
verified_at: ${JSON.stringify(contract.verifiedAt)}
verified_by: ${JSON.stringify(contract.verifiedBy)}
content_sha256: ${JSON.stringify(contract.contentHash)}
revision: ${contract.revision}
supersedes_sha256: ${JSON.stringify(contract.supersedesHash ?? null)}
---

# Verified contract

## Definitions

- **status: verified** — Anna reviewed and explicitly approved this contract for the current run.
- **normalized input** — structured Flying Solo values used to prepare this contract.
- **reviewed contract title template** — the exact title logic Anna reviewed, including its placeholder syntax.
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

## Reviewed contract title template

\`\`\`text
${contract.titleTemplate}
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

  async function replaceQueue(replacement) {
    return locked(async () => {
      const queue = validateQueue(clone(replacement));
      await writeJsonAtomic(queuePath, queue);
      return { ...clone(queue), progress: progress(queue) };
    });
  }

  async function saveInput(recordId, { input }) {
    return locked(async () => {
      const queue = validateQueue(await readJson(queuePath));
      const record = queue.records.find((candidate) => candidate.id === recordId);
      if (!record) throw new Error(`Unknown review record: ${recordId}.`);
      if (!input || typeof input !== "object") {
        throw new Error("Review input requires sourced data.");
      }
      const changed = JSON.stringify(record.input) !== JSON.stringify(input);
      record.input = clone(input);
      if (record.status === "verified" && changed) record.status = "changes_pending";
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
      for (const property of ["templateId", "title", "titleTemplate", "templateMarkdown", "resolvedMarkdown"]) {
        if (!String(completed[property] ?? "").trim()) throw new Error(`Verification requires ${property}.`);
      }
      if (!completed.input || typeof completed.input !== "object") {
        throw new Error("Verification requires normalized input.");
      }
      if (completed.resolvedMarkdown.includes("{{") || completed.resolvedMarkdown.includes("}}")) {
        throw new Error("Verified contract cannot contain unresolved placeholders.");
      }
      const contentHash = createHash("sha256").update(JSON.stringify({
        title: completed.title,
        titleTemplate: completed.titleTemplate,
        templateMarkdown: completed.templateMarkdown,
        resolvedMarkdown: completed.resolvedMarkdown,
      }), "utf8").digest("hex");
      const filename = `${pathPart(queue.batch.id)}--${pathPart(record.id)}.md`;
      const verifiedContractPath = path.join(verifiedContractsDirectory, filename);
      let existing;
      try {
        existing = handoffMetadata(await fs.readFile(verifiedContractPath, "utf8"));
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
      const recovering = existing?.contentHash === contentHash;
      const verifiedAt = recovering && existing.verifiedAt ? existing.verifiedAt : now();
      const verifiedContract = {
        id: `${queue.batch.id}:${record.id}`,
        batchId: queue.batch.id,
        recordId: record.id,
        templateId: completed.templateId,
        title: completed.title,
        titleTemplate: completed.titleTemplate,
        input: clone(completed.input),
        templateMarkdown: completed.templateMarkdown,
        resolvedMarkdown: completed.resolvedMarkdown,
        contentHash,
        verifiedAt,
        verifiedBy: "Anna",
        revision: existing ? existing.revision + (recovering ? 0 : 1) : 1,
        supersedesHash: existing && !recovering ? existing.contentHash : null,
      };
      if (!recovering) await writeTextAtomic(verifiedContractPath, handoffMarkdown(verifiedContract));
      record.input = clone(completed.input);
      record.status = "verified";
      record.verifiedAt = verifiedAt;
      record.contentHash = contentHash;
      record.revision = verifiedContract.revision;
      record.updatedAt = verifiedAt;
      await writeJsonAtomic(queuePath, queue);
      return { record: clone(record), progress: progress(queue) };
    });
  }

  return { initialize, getQueue, replaceQueue, saveInput, verify };
}
