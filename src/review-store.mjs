import fs from "node:fs/promises";
import path from "node:path";

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

export function createReviewStore({ examplePath, queuePath, archivePath, now = () => new Date().toISOString() }) {
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
      try {
        await fs.access(archivePath);
      } catch {
        await writeJsonAtomic(archivePath, { schemaVersion: 1, contracts: [] });
      }
      validateQueue(await readJson(queuePath));
    });
    return initialization;
  }

  async function getQueue() {
    const queue = validateQueue(await readJson(queuePath));
    return { ...clone(queue), progress: progress(queue) };
  }

  async function getArchive() {
    const archive = await readJson(archivePath);
    if (archive?.schemaVersion !== 1 || !Array.isArray(archive.contracts)) {
      throw new Error("Completed contract archive is invalid.");
    }
    return clone(archive);
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
      const archive = await getArchive();
      archive.contracts.push({
        id: `${queue.batch.id}:${record.id}`,
        batchId: queue.batch.id,
        recordId: record.id,
        templateId: completed.templateId,
        title: completed.title,
        input: clone(completed.input),
        templateMarkdown: completed.templateMarkdown,
        resolvedMarkdown: completed.resolvedMarkdown,
        verifiedAt,
        verifiedBy: "Anna",
      });
      record.input = clone(completed.input);
      record.draftMarkdown = completed.templateMarkdown;
      record.status = "verified";
      record.verifiedAt = verifiedAt;
      record.updatedAt = verifiedAt;
      await writeJsonAtomic(archivePath, archive);
      await writeJsonAtomic(queuePath, queue);
      return { record: clone(record), progress: progress(queue) };
    });
  }

  return { initialize, getQueue, getArchive, saveDraft, verify };
}
