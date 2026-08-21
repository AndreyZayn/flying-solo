import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";

function slug(value) {
  return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function localIso(date) {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    + `${sign}${pad(Math.trunc(absolute / 60))}:${pad(absolute % 60)}`;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function contractContentSha256({ title, titleTemplate, templateMarkdown, resolvedMarkdown }) {
  return sha256(JSON.stringify({ title, titleTemplate, templateMarkdown, resolvedMarkdown }));
}

async function writeTextAtomic(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, value, "utf8");
  await fs.rename(temporary, filename);
}

async function writeJsonAtomic(filename, value) {
  await writeTextAtomic(filename, `${JSON.stringify(value, null, 2)}\n`);
}

function contractMarkdown(contract) {
  return `---
schema_version: 1
status: verified
contract_id: ${JSON.stringify(`${contract.batchId}:${contract.recordId}`)}
batch_id: ${JSON.stringify(contract.batchId)}
record_id: ${JSON.stringify(contract.recordId)}
template_id: ${JSON.stringify(contract.templateId)}
title: ${JSON.stringify(contract.title)}
title_template: ${JSON.stringify(contract.titleTemplate)}
verified_at: ${JSON.stringify(contract.verifiedAt)}
verified_by: ${JSON.stringify("Anna")}
content_sha256: ${JSON.stringify(contract.contentSha256)}
revision: ${contract.revision}
supersedes_sha256: ${JSON.stringify(contract.supersedesSha256 ?? null)}
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

function frontmatterField(raw, key) {
  const match = raw.match(new RegExp(`^${key}: (.+)$`, "m"));
  if (!match) throw new Error(`missing ${key}`);
  return JSON.parse(match[1]);
}

function fencedSection(raw, heading, language) {
  const match = raw.match(new RegExp(`\\n## ${heading}\\n\\n\`\`\`${language}\\n([\\s\\S]*?)\\n\`\`\`\\n`));
  if (!match) throw new Error(`missing section: ${heading}`);
  return match[1];
}

function resolvedSection(raw) {
  const marker = "\n## Verified contract Markdown\n\n";
  const index = raw.indexOf(marker);
  if (index === -1 || !raw.endsWith("\n")) throw new Error("missing section: Verified contract Markdown");
  return raw.slice(index + marker.length, -1);
}

export function parseContractFile(raw) {
  if (!raw.startsWith("---\n") || !/^schema_version: 1$/m.test(raw) || !/^status: verified$/m.test(raw)) {
    throw new Error("not a schema_version 1 verified contract envelope");
  }
  return {
    contractId: frontmatterField(raw, "contract_id"),
    batchId: frontmatterField(raw, "batch_id"),
    recordId: frontmatterField(raw, "record_id"),
    templateId: frontmatterField(raw, "template_id"),
    title: frontmatterField(raw, "title"),
    titleTemplate: frontmatterField(raw, "title_template"),
    verifiedAt: frontmatterField(raw, "verified_at"),
    verifiedBy: frontmatterField(raw, "verified_by"),
    contentSha256: frontmatterField(raw, "content_sha256"),
    revision: frontmatterField(raw, "revision"),
    supersedesSha256: frontmatterField(raw, "supersedes_sha256"),
    input: JSON.parse(fencedSection(raw, "Normalized input", "json")),
    templateMarkdown: fencedSection(raw, "Reviewed template Markdown", "markdown"),
    reviewedTitleTemplate: fencedSection(raw, "Reviewed contract title template", "text"),
    resolvedMarkdown: resolvedSection(raw),
  };
}

function validateContractFile(raw, expected) {
  const parsed = parseContractFile(raw);
  if (parsed.contractId !== `${expected.batchId}:${expected.recordId}`) throw new Error("contract id mismatch");
  if (parsed.batchId !== expected.batchId) throw new Error("batch id mismatch");
  if (parsed.recordId !== expected.recordId) throw new Error("record id mismatch");
  if (parsed.templateId !== expected.templateId) throw new Error("template id mismatch");
  if (parsed.title !== expected.title) throw new Error("title mismatch");
  if (parsed.revision !== expected.revision) throw new Error("revision mismatch");
  if (!String(parsed.verifiedBy ?? "").trim()) throw new Error("missing reviewer");
  if (parsed.resolvedMarkdown.includes("{{") || parsed.resolvedMarkdown.includes("}}")) {
    throw new Error("unresolved placeholder in verified contract Markdown");
  }
  const recomputed = contractContentSha256({
    title: parsed.title,
    titleTemplate: parsed.titleTemplate,
    templateMarkdown: parsed.templateMarkdown,
    resolvedMarkdown: parsed.resolvedMarkdown,
  });
  if (recomputed !== parsed.contentSha256 || recomputed !== expected.contentSha256) {
    throw new Error("content hash mismatch");
  }
  return parsed;
}

export function createVerifiedBatchStore({
  baseDirectory,
  relativeBase = "data/runtime/verified-batches",
  now = () => new Date(),
}) {
  let mutation = Promise.resolve();

  function locked(operation) {
    const next = mutation.then(operation, operation);
    mutation = next.catch(() => {});
    return next;
  }

  function manifestPath(directoryName) {
    return path.join(baseDirectory, directoryName, "batch.json");
  }

  async function loadManifest(directoryName) {
    let raw;
    try {
      raw = await fs.readFile(manifestPath(directoryName), "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") return { manifest: null, corrupt: false };
      return { manifest: null, corrupt: true };
    }
    try {
      const manifest = JSON.parse(raw);
      if (manifest?.schemaVersion !== 1 || !manifest.batchId || !Array.isArray(manifest.contracts)) {
        return { manifest: null, corrupt: true };
      }
      return { manifest, corrupt: false };
    } catch {
      return { manifest: null, corrupt: true };
    }
  }

  async function resolveDirectory(batch) {
    const stored = batch.verifiedBatch?.relativeDirectory;
    if (stored) return { name: path.posix.basename(stored) };
    const suffix = `--${slug(batch.id)}`;
    let names = [];
    try {
      names = await fs.readdir(baseDirectory);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    for (const name of names.filter((candidate) => candidate.endsWith(suffix)).sort().reverse()) {
      const { manifest } = await loadManifest(name);
      if (manifest?.batchId === batch.id) return { name };
    }
    return null;
  }

  function finalizeManifest(manifest, nowDate) {
    const validCount = manifest.contracts.filter((entry) => entry.artifactStatus === "valid").length;
    const complete = manifest.expectedCount > 0 && validCount === manifest.expectedCount;
    return {
      ...manifest,
      validCount,
      status: complete ? "complete" : "in_progress",
      completedAt: complete ? manifest.completedAt ?? localIso(nowDate) : null,
    };
  }

  function dashboardModel(manifest, relativeDirectory) {
    const needsAttention = manifest.contracts.some((entry) => entry.artifactStatus !== "valid");
    return {
      status: needsAttention ? "needs_attention" : manifest.status,
      batchId: manifest.batchId,
      label: manifest.label,
      templateId: manifest.templateId,
      relativeDirectory,
      directoryDate: manifest.directoryDate,
      createdAt: manifest.createdAt,
      completedAt: manifest.completedAt,
      expectedCount: manifest.expectedCount,
      validCount: manifest.validCount,
      contracts: manifest.contracts.map((entry) => ({
        recordId: entry.recordId,
        sequence: entry.sequence,
        title: entry.title,
        relativePath: entry.relativePath,
        artifactStatus: entry.artifactStatus,
        verifiedAt: entry.verifiedAt,
        revision: entry.revision,
        contentSha256: entry.contentSha256,
        fileSha256: entry.fileSha256,
        validatedAt: entry.validatedAt,
      })),
    };
  }

  function emptyModel(batch, expectedCount, { status = "not_started", manifestError = false } = {}) {
    return {
      status,
      batchId: batch.id,
      label: batch.label ?? "",
      templateId: batch.templateId ?? null,
      relativeDirectory: null,
      directoryDate: null,
      createdAt: null,
      completedAt: null,
      expectedCount,
      validCount: 0,
      contracts: [],
      ...(manifestError ? { manifestError: true } : {}),
    };
  }

  async function existingFileMetadata(absolutePath) {
    let raw;
    try {
      raw = await fs.readFile(absolutePath, "utf8");
    } catch {
      return null;
    }
    try {
      const parsed = parseContractFile(raw);
      return {
        revision: parsed.revision,
        contentSha256: parsed.contentSha256,
        priorContentSha256: parsed.supersedesSha256,
        verifiedAt: parsed.verifiedAt,
      };
    } catch {
      return null;
    }
  }

  async function persistVerifiedContract({ batch, record, contract, expectedCount }) {
    return locked(async () => {
      if (!batch?.id) throw new Error("Verified batch persistence requires batch metadata.");
      if (!record?.id || !Number.isInteger(record.sequence) || record.sequence < 1) {
        throw new Error("Verified batch persistence requires a record id and sequence.");
      }
      for (const property of ["templateId", "title", "titleTemplate", "templateMarkdown", "resolvedMarkdown"]) {
        if (!String(contract?.[property] ?? "").trim()) {
          throw new Error(`Verified batch persistence requires ${property}.`);
        }
      }
      if (!contract.input || typeof contract.input !== "object") {
        throw new Error("Verified batch persistence requires normalized input.");
      }
      if (contract.resolvedMarkdown.includes("{{") || contract.resolvedMarkdown.includes("}}")) {
        throw new Error("A verified contract file cannot contain unresolved placeholders.");
      }
      const nowDate = now();
      const directoryName = (await resolveDirectory(batch))?.name
        ?? `${localIso(nowDate).slice(0, 10)}--${slug(batch.id)}`;
      const { manifest: existingManifest } = await loadManifest(directoryName);
      if (existingManifest && existingManifest.batchId !== batch.id) {
        throw new Error(`The verified batch directory belongs to batch ${existingManifest.batchId}, not ${batch.id}.`);
      }
      const manifest = existingManifest ?? {
        schemaVersion: 1,
        status: "in_progress",
        batchId: batch.id,
        label: batch.label ?? "",
        templateId: batch.templateId ?? contract.templateId,
        source: batch.source ?? {},
        directoryDate: directoryName.slice(0, 10),
        createdAt: localIso(nowDate),
        completedAt: null,
        expectedCount,
        validCount: 0,
        contracts: [],
      };
      const entry = manifest.contracts.find((candidate) => candidate.recordId === record.id);
      const relativePath = entry?.relativePath
        ?? `contracts/${String(record.sequence).padStart(3, "0")}--${slug(record.id)}--${slug(contract.input.brand)}.md`;
      const absolutePath = path.join(baseDirectory, directoryName, relativePath);
      const contentSha256 = contractContentSha256(contract);
      const prior = entry
        ? {
          revision: entry.revision,
          contentSha256: entry.contentSha256,
          priorContentSha256: entry.priorContentSha256 ?? null,
          verifiedAt: entry.verifiedAt,
        }
        : await existingFileMetadata(absolutePath);
      const identical = prior?.contentSha256 === contentSha256;
      const revision = prior ? (identical ? prior.revision : prior.revision + 1) : 1;
      const supersedesSha256 = prior ? (identical ? prior.priorContentSha256 ?? null : prior.contentSha256) : null;
      const verifiedAt = identical && prior.verifiedAt ? prior.verifiedAt : localIso(nowDate);
      await writeTextAtomic(absolutePath, contractMarkdown({
        batchId: batch.id,
        recordId: record.id,
        templateId: contract.templateId,
        title: contract.title,
        titleTemplate: contract.titleTemplate,
        input: contract.input,
        templateMarkdown: contract.templateMarkdown,
        resolvedMarkdown: contract.resolvedMarkdown,
        contentSha256,
        revision,
        supersedesSha256,
        verifiedAt,
      }));
      const raw = await fs.readFile(absolutePath, "utf8");
      const fileSha256 = sha256(raw);
      const sequence = entry?.sequence ?? record.sequence;
      let nextEntry;
      try {
        validateContractFile(raw, {
          batchId: batch.id,
          recordId: record.id,
          templateId: contract.templateId,
          title: contract.title,
          revision,
          contentSha256,
        });
        nextEntry = {
          recordId: record.id,
          sequence,
          title: contract.title,
          relativePath,
          artifactStatus: "valid",
          verifiedAt,
          revision,
          contentSha256,
          fileSha256,
          validatedAt: localIso(now()),
          priorContentSha256: supersedesSha256,
        };
      } catch (error) {
        const invalidEntry = {
          recordId: record.id,
          sequence,
          title: contract.title,
          relativePath,
          artifactStatus: "invalid",
          verifiedAt,
          revision,
          contentSha256,
          fileSha256,
          validatedAt: entry?.validatedAt ?? null,
          priorContentSha256: supersedesSha256,
        };
        await writeJsonAtomic(manifestPath(directoryName), finalizeManifest({
          ...manifest,
          expectedCount,
          contracts: upsert(manifest.contracts, invalidEntry),
        }, nowDate));
        throw new Error(`The verified contract file failed validation after writing: ${error.message}.`);
      }
      const updated = finalizeManifest({
        ...manifest,
        expectedCount,
        contracts: upsert(manifest.contracts, nextEntry),
      }, nowDate);
      await writeJsonAtomic(manifestPath(directoryName), updated);
      const relativeDirectory = `${relativeBase}/${directoryName}`;
      return {
        verifiedBatch: { relativeDirectory, createdAt: updated.createdAt },
        verifiedAt,
        artifact: {
          relativePath,
          artifactStatus: "valid",
          revision,
          contentSha256,
          fileSha256,
          validatedAt: nextEntry.validatedAt,
        },
        model: dashboardModel(updated, relativeDirectory),
      };
    });
  }

  function upsert(contracts, entry) {
    const existing = contracts.some((candidate) => candidate.recordId === entry.recordId);
    return existing
      ? contracts.map((candidate) => candidate.recordId === entry.recordId ? entry : candidate)
      : [...contracts, entry];
  }

  async function reconcile({ batch, expectedCount }) {
    return locked(async () => {
      if (!batch?.id) throw new Error("Verified batch reconciliation requires batch metadata.");
      const directory = await resolveDirectory(batch);
      if (!directory) return emptyModel(batch, expectedCount);
      const { manifest, corrupt } = await loadManifest(directory.name);
      if (!manifest) {
        if (corrupt) return emptyModel(batch, expectedCount, { status: "needs_attention", manifestError: true });
        return emptyModel(batch, expectedCount);
      }
      if (manifest.batchId !== batch.id) {
        return emptyModel(batch, expectedCount, { status: "needs_attention", manifestError: true });
      }
      let changed = manifest.expectedCount !== expectedCount;
      const contracts = [];
      for (const entry of manifest.contracts) {
        let status = "valid";
        try {
          const raw = await fs.readFile(path.join(baseDirectory, directory.name, entry.relativePath), "utf8");
          if (sha256(raw) !== entry.fileSha256) throw new Error("file hash mismatch");
          validateContractFile(raw, {
            batchId: manifest.batchId,
            recordId: entry.recordId,
            templateId: manifest.templateId,
            title: entry.title,
            revision: entry.revision,
            contentSha256: entry.contentSha256,
          });
        } catch (error) {
          status = error?.code === "ENOENT" ? "missing" : "invalid";
        }
        if (status !== entry.artifactStatus) changed = true;
        contracts.push(status === entry.artifactStatus
          ? entry
          : { ...entry, artifactStatus: status, validatedAt: status === "valid" ? localIso(now()) : entry.validatedAt });
      }
      const updated = finalizeManifest({ ...manifest, expectedCount, contracts }, now());
      if (updated.status !== manifest.status
        || updated.validCount !== manifest.validCount
        || updated.completedAt !== manifest.completedAt) {
        changed = true;
      }
      if (changed) await writeJsonAtomic(manifestPath(directory.name), updated);
      return dashboardModel(updated, `${relativeBase}/${directory.name}`);
    });
  }

  return { persistVerifiedContract, reconcile };
}
