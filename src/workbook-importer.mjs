import { createHash } from "node:crypto";
import ExcelJS from "exceljs";

import { buildFamilyContract, familyConfig } from "./contract-families.mjs";

const REQUIRED = ["FW", "SEASON", "BRAND", "NAME", "EMAIL", "CATEGORY", "LIST_PRICE", "PMNT_1", "PMNT_1_DUE"];

function header(value) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, "_");
}

function text(value) {
  return String(value ?? "").trim();
}

function number(value) {
  if (typeof value === "number") return value;
  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : NaN;
}

function excelDate(value) {
  if (value instanceof Date) return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000));
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.valueOf())) return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
  return null;
}

function iso(value, label) {
  const date = excelDate(value);
  if (!date) throw new Error(`${label} is not a valid date.`);
  return date.toISOString().slice(0, 10);
}

function season(value) {
  const short = String(value ?? "").trim().match(/^([A-Za-z]{3})-(\d{2})$/);
  if (short) {
    const parsed = new Date(`${short[1]} 1, 20${short[2]} 00:00:00 UTC`);
    if (!Number.isNaN(parsed.valueOf())) {
      return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(parsed);
    }
  }
  const date = excelDate(value);
  if (!date) throw new Error("Season is not a valid month and year.");
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function rowId(rowNumber, brand) {
  const slug = text(brand).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand";
  return `row-${rowNumber}-${slug}`;
}

export async function importFashionWeekWorkbook(buffer, { fileName = "upload.xlsx", now = () => new Date().toISOString() } = {}) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Workbook has no worksheets.");
  const headerValues = sheet.getRow(1).values.slice(1).map(header);
  const columns = new Map(headerValues.map((value, index) => [value, index + 1]).filter(([value]) => value));
  const missing = REQUIRED.filter((name) => !columns.has(name));
  if (missing.length) throw new Error(`Workbook is missing required columns: ${missing.join(", ")}.`);
  const records = [];
  const categoryConfig = await familyConfig("fashion-week");
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const get = (name) => row.getCell(columns.get(name) ?? 0).value;
    if (!["FW", "BRAND", "NAME", "EMAIL"].some((name) => text(get(name)))) continue;
    const issues = [];
    let input;
    try {
      const category = text(get("CATEGORY"));
      const matched = categoryConfig.categories.find((item) => item.id.toLowerCase() === category.toLowerCase() || item.aliases.includes(category.toLowerCase()));
      const listPrice = number(get("LIST_PRICE"));
      const discount = text(get("DISCOUNT"));
      const grantEnabled = Boolean(discount);
      const payments = [];
      for (let index = 1; index <= 3; index += 1) {
        const amountValue = get(`PMNT_${index}`);
        const dateValue = get(`PMNT_${index}_DUE`);
        if (amountValue == null && dateValue == null) continue;
        payments.push({ dueDate: iso(dateValue, `Payment ${index} due date`), amount: number(amountValue) });
      }
      input = {
        eventCode: text(get("FW")).toUpperCase(), eventMonth: season(get("SEASON")), brand: text(get("BRAND")), representative: text(get("NAME")), recipientEmail: text(get("EMAIL")), category,
        grantEnabled, grantAmount: grantEnabled && matched ? matched.fullPrice - listPrice : 0, listPrice, payments,
      };
      await buildFamilyContract("fashion-week", input);
    } catch (error) {
      issues.push(error.message);
      input ??= { eventCode: text(get("FW")).toUpperCase(), brand: text(get("BRAND")), representative: text(get("NAME")), recipientEmail: text(get("EMAIL")), category: text(get("CATEGORY")), payments: [] };
    }
    records.push({ id: rowId(rowNumber, input.brand), status: "pending", input, sourceRow: rowNumber, importIssues: issues, draftMarkdown: null, verifiedAt: null });
  }
  if (!records.length) throw new Error("Workbook contains no contract rows.");
  const importedAt = now();
  const digest = createHash("sha256").update(buffer).digest("hex");
  return { schemaVersion: 1, batch: { id: `fashion-week-${digest.slice(0, 12)}-${importedAt.slice(0, 10)}`, label: fileName.replace(/\.xlsx$/i, ""), templateId: "fashion-week", importedAt, source: { type: "xlsx", fileName, sha256: digest } }, records };
}
