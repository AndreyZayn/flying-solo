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

export function createReviewStore({
  examplePath,
  queuePath,
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

  function validateArtifactReference(completed) {
    if (!String(completed.verifiedAt ?? "").trim()) {
      throw new Error("Verification requires the verification time of the persisted contract file.");
    }
    const artifact = completed.artifact;
    for (const property of ["relativePath", "artifactStatus", "contentSha256", "fileSha256", "validatedAt"]) {
      if (!String(artifact?.[property] ?? "").trim()) {
        throw new Error("Verification requires the persisted artifact reference from the verified batch store.");
      }
    }
    if (artifact.artifactStatus !== "valid" || !Number.isInteger(artifact.revision) || artifact.revision < 1) {
      throw new Error("Verification requires a valid artifact reference with its revision.");
    }
    const verifiedBatch = completed.verifiedBatch;
    if (!String(verifiedBatch?.relativeDirectory ?? "").trim() || !String(verifiedBatch?.createdAt ?? "").trim()) {
      throw new Error("Verification requires the verified batch directory location.");
    }
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
      validateArtifactReference(completed);
      record.input = clone(completed.input);
      record.status = "verified";
      record.verifiedAt = completed.verifiedAt;
      record.artifact = clone(completed.artifact);
      record.updatedAt = now();
      queue.batch.verifiedBatch = clone(completed.verifiedBatch);
      await writeJsonAtomic(queuePath, queue);
      return { record: clone(record), progress: progress(queue) };
    });
  }

  async function recordArtifact(recordId, { artifact, verifiedBatch, verifiedAt }) {
    return locked(async () => {
      const queue = validateQueue(await readJson(queuePath));
      const record = queue.records.find((candidate) => candidate.id === recordId);
      if (!record) throw new Error(`Unknown review record: ${recordId}.`);
      if (record.status !== "verified") {
        throw new Error("Recreating a verified file requires a verified record.");
      }
      validateArtifactReference({ artifact, verifiedBatch, verifiedAt: verifiedAt ?? record.verifiedAt });
      record.artifact = clone(artifact);
      if (verifiedAt) record.verifiedAt = verifiedAt;
      record.updatedAt = now();
      queue.batch.verifiedBatch = clone(verifiedBatch);
      await writeJsonAtomic(queuePath, queue);
      return clone(record);
    });
  }

  return { initialize, getQueue, replaceQueue, saveInput, verify, recordArtifact };
}
