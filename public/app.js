import { calculateDueDates, splitPaymentAmounts } from "/schedule.mjs";
import { calculateEditorHeight, isResizeHandlePointer } from "/editor-sizing.mjs";
import { selectFashionWeekCategory } from "/family-fields.mjs";
import { normalizeEditorMarkdown, resolveMarkdownTemplate } from "/markdown-template.mjs";
import { nextIncompleteRecord, reviewRecordPresentation } from "/review-selector.mjs";
import {
  displayPlaceholderValue,
  matchesPlaceholder,
  placeholderInsertionText,
} from "/placeholder-library.mjs";

const form = document.querySelector("#contractForm");
const eventSelect = document.querySelector("#eventCode");
const categorySelect = document.querySelector("#category");
const grantEnabled = document.querySelector("#grantEnabled");
const grantControls = document.querySelector("#grantControls");
const grantPreset = document.querySelector("#grantPreset");
const customGrantField = document.querySelector("#customGrantField");
const customGrantAmount = document.querySelector("#customGrantAmount");
const grantSummary = document.querySelector("#grantSummary");
const eventMonth = document.querySelector("#eventMonth");
const sendDate = document.querySelector("#sendDate");
const representative = document.querySelector("#representative");
const representativeEmail = document.querySelector("#representativeEmail");
const documentElement = document.querySelector("#contractDocument");
const editorPanel = document.querySelector("#editorPanel");
const editorResizeHandle = document.querySelector("#editorResizeHandle");
const previewPanel = document.querySelector("#previewPanel");
const titleElement = document.querySelector("#contractTitle");
const errorElement = document.querySelector("#errorMessage");
const statusBadge = document.querySelector("#statusBadge");
const editorTab = document.querySelector("#editorTab");
const previewTab = document.querySelector("#previewTab");
const copyMarkdownButton = document.querySelector("#copyMarkdown");
const toast = document.querySelector("#toast");
const templateWorkspaceButton = document.querySelector("#templateWorkspace");
const batchWorkspaceButton = document.querySelector("#batchWorkspace");
const templateManager = document.querySelector("#templateManager");
const batchControls = document.querySelector("#batchControls");
const templateSelect = document.querySelector("#templateSelect");
const templateVersion = document.querySelector("#templateVersion");
const templateHistory = document.querySelector("#templateHistory");
const newTemplateName = document.querySelector("#newTemplateName");
const createTemplateButton = document.querySelector("#createTemplate");
const openTemplateBuilderButton = document.querySelector("#openTemplateBuilder");
const deleteTemplateButton = document.querySelector("#deleteTemplate");
const placeholderSearch = document.querySelector("#placeholderSearch");
const placeholderList = document.querySelector("#placeholderList");
const reviewQueueSelect = document.querySelector("#reviewQueueSelect");
const selectedRecordStatus = document.querySelector("#selectedRecordStatus");
const selectedRecordContext = document.querySelector("#selectedRecordContext");
const reviewProgress = document.querySelector("#reviewProgress");
const batchComplete = document.querySelector("#batchComplete");
const verifyContractButton = document.querySelector("#verifyContract");
const saveTemplateButton = document.querySelector("#saveTemplate");
const batchTemplateSelect = document.querySelector("#batchTemplateSelect");
const workbookFile = document.querySelector("#workbookFile");
const uploadWorkbookButton = document.querySelector("#uploadWorkbook");
const importSummary = document.querySelector("#importSummary");
const fashionWeekFields = document.querySelector("#fashionWeekFields");
const membershipFields = document.querySelector("#membershipFields");
const membershipPackage = document.querySelector("#membershipPackage");
const titleCaption = document.querySelector("#titleCaption");

let registry;
let placeholderRegistry = [];
let currentResult;
let contractEditor;
let titleEditor;
let view = "preview";
let workspaceMode = "templates";
let reviewQueue;
let selectedRecordId;
let activeTemplateId = "fashion-week";
let templateMarkdown = "";
let templateTitle = "";
let templateCatalog = [];
let activeEditor = "body";
let renderTimer;
let draftSaveTimer;
let editorHeightFrame;
let editorManuallySized = false;
let generateController;
let generateRevision = 0;
let loadingRecord = false;

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0,
  }).format(value);
}

function selectedCategory() {
  return registry.categories.find((category) => category.id === categorySelect.value);
}

function activeGrantAmount() {
  if (!grantEnabled.checked) return 0;
  return Number(grantPreset.value === "custom" ? customGrantAmount.value : grantPreset.value);
}

function displayEventMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value)) return value;
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function monthInputValue(value) {
  const match = String(value ?? "").match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) return String(value ?? "");
  const date = new Date(`${match[1]} 1, ${match[2]} 00:00:00 UTC`);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function todayIso() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function readInput() {
  if (activeFamily() === "membership") {
    const selectedPackage = registry.packages.find((item) => item.id === membershipPackage.value);
    return {
      brand: document.querySelector("#membershipBrand").value,
      representative: document.querySelector("#membershipRepresentative").value,
      recipientEmail: document.querySelector("#membershipEmail").value,
      packageId: membershipPackage.value,
      durationMonths: Number(document.querySelector("#membershipDuration").value),
      startDate: document.querySelector("#membershipStartDate").value,
      monthlyPrice: selectedPackage?.monthlyPrice,
    };
  }
  const dates = [...document.querySelectorAll(".payment-date")];
  const amounts = [...document.querySelectorAll(".payment-amount")];
  return {
    eventCode: eventSelect.value,
    eventMonth: displayEventMonth(eventMonth.value),
    brand: document.querySelector("#brand").value,
    representative: representative.value,
    recipientEmail: representativeEmail.value,
    category: categorySelect.value,
    grantEnabled: grantEnabled.checked,
    grantAmount: activeGrantAmount(),
    payments: dates.map((date, index) => ({ dueDate: date.value, amount: Number(amounts[index].value) }))
      .filter((payment) => payment.dueDate || payment.amount),
  };
}

function writeInput(input) {
  const membership = activeFamily() === "membership";
  fashionWeekFields.hidden = membership;
  membershipFields.hidden = !membership;
  if (membership) {
    document.querySelector("#membershipBrand").value = input.brand ?? "";
    document.querySelector("#membershipRepresentative").value = input.representative ?? "";
    document.querySelector("#membershipEmail").value = input.recipientEmail ?? "";
    membershipPackage.value = input.packageId ?? "";
    document.querySelector("#membershipDuration").value = String(input.durationMonths ?? 6);
    document.querySelector("#membershipStartDate").value = input.startDate ?? "";
    updatePriceSummary();
    return;
  }
  eventSelect.value = input.eventCode ?? "";
  eventMonth.value = monthInputValue(input.eventMonth);
  document.querySelector("#brand").value = input.brand ?? "";
  representative.value = input.representative ?? "";
  representativeEmail.value = input.recipientEmail ?? "";
  categorySelect.value = selectFashionWeekCategory(input.category, registry.categories);
  grantEnabled.checked = Boolean(input.grantEnabled);
  const grantAmount = Number(input.grantAmount || 0);
  if (grantAmount === Number(registry.grant.defaultAmount)) {
    grantPreset.value = String(registry.grant.defaultAmount);
  } else {
    grantPreset.value = "custom";
    customGrantAmount.value = String(grantAmount);
  }
  const payments = input.payments ?? [];
  document.querySelectorAll(".payment-date").forEach((field, index) => {
    field.value = payments[index]?.dueDate ?? "";
  });
  document.querySelectorAll(".payment-amount").forEach((field, index) => {
    field.value = payments[index]?.amount ?? "";
  });
  updatePriceSummary();
}

function selectedRecord() {
  return reviewQueue?.records.find((record) => record.id === selectedRecordId);
}

function activeTitleTemplate() {
  return normalizeEditorMarkdown(titleEditor?.getMarkdown() ?? templateTitle).trim();
}

function activeTemplate() {
  return templateCatalog.find((template) => template.id === activeTemplateId);
}

function activeFamily() {
  return activeTemplate()?.family ?? activeTemplateId;
}

function renderTemplateSelects() {
  templateSelect.innerHTML = templateCatalog.map((template) =>
    `<option value="${template.id}">${template.label}${template.builtIn ? "" : " · custom"}</option>`
  ).join("");
  templateSelect.value = templateCatalog.some((template) => template.id === activeTemplateId)
    ? activeTemplateId
    : templateCatalog[0]?.id ?? "";
  batchTemplateSelect.innerHTML = templateCatalog.map((template) =>
    `<option value="${template.id}">${template.label}${template.builtIn ? "" : " · custom"}</option>`
  ).join("");
  batchTemplateSelect.value = activeTemplateId;
}

function setWorkspace(mode) {
  workspaceMode = mode;
  const templates = mode === "templates";
  templateManager.hidden = !templates;
  batchControls.hidden = templates;
  templateWorkspaceButton.classList.toggle("active", templates);
  batchWorkspaceButton.classList.toggle("active", !templates);
  templateWorkspaceButton.setAttribute("aria-pressed", String(templates));
  batchWorkspaceButton.setAttribute("aria-pressed", String(!templates));
  titleCaption.textContent = templates ? "Contract title template" : "Contract title";
  editorTab.textContent = templates ? "Template editor" : "Edit contract";
  previewTab.textContent = templates ? "Preview template" : "Preview";
  previewTab.hidden = false;
  previewTab.disabled = !templates && !currentResult;
  copyMarkdownButton.hidden = templates;
  verifyContractButton.hidden = templates;
  if (templates) view = "editor";
  showResult();
}

function renderTemplateVersion(template) {
  templateVersion.textContent = template
    ? `${template.builtIn ? "Standard" : "Custom"} template · Version ${template.version}`
    : "No template selected.";
  deleteTemplateButton.hidden = !template || template.builtIn;
}

async function renderTemplateHistory() {
  templateHistory.replaceChildren();
  const response = await fetch(`/api/templates/${encodeURIComponent(activeTemplateId)}/history`);
  const history = await response.json();
  if (!response.ok) throw new Error(history.error || "Unable to load template history.");
  if (!history.length) {
    templateHistory.textContent = "This is the first version.";
    return;
  }
  for (const snapshot of history) {
    const row = document.createElement("div");
    row.className = "template-history-item";
    const label = document.createElement("span");
    label.textContent = `Version ${snapshot.version} · ${new Date(snapshot.savedAt).toLocaleString()}`;
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "template-history-restore";
    restore.textContent = "Restore";
    restore.addEventListener("click", () => restoreTemplate(snapshot.version).catch(showError));
    row.append(label, restore);
    templateHistory.append(row);
  }
}

async function loadTemplate(templateId, { loadRecord = false } = {}) {
  const [nextRegistry, nextPlaceholders, template] = await Promise.all([
    fetch(`/api/config?templateId=${encodeURIComponent(templateId)}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load contract configuration.");
      return body;
    }),
    fetch(`/api/placeholders?templateId=${encodeURIComponent(templateId)}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load placeholders.");
      return body;
    }),
    fetch(`/api/templates/${encodeURIComponent(templateId)}`).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load the saved template.");
      return body;
    }),
  ]);
  registry = nextRegistry;
  placeholderRegistry = nextPlaceholders;
  activeTemplateId = template.id;
  templateMarkdown = template.markdown;
  templateTitle = template.titleTemplate;
  loadingRecord = true;
  contractEditor.setMarkdown(templateMarkdown, false);
  titleEditor.setMarkdown(templateTitle, false);
  loadingRecord = false;
  configureFamilyControls();
  renderTemplateSelects();
  renderTemplateVersion(template);
  renderPlaceholderLibrary();
  await renderTemplateHistory();
  if (workspaceMode === "templates" && view === "preview") showResult();
  if (loadRecord && selectedRecord()) await selectRecord(selectedRecord().id, { savePrevious: false });
}

function syncFieldEditability() {
  const inputEditable = workspaceMode === "batch" && view === "editor";
  form.querySelectorAll("input, select").forEach((control) => { control.disabled = !inputEditable; });
}

function updateVerificationAction() {
  const status = selectedRecord()?.status;
  verifyContractButton.textContent = status === "changes_pending" ? "Update verification" : "Mark verified";
  verifyContractButton.disabled = !currentResult || status === "verified";
}

function markSelectedRecordChanged() {
  const record = selectedRecord();
  if (record?.status !== "verified") return;
  record.status = "changes_pending";
  renderReviewQueue();
  updateVerificationAction();
}

function updatePriceSummary() {
  if (!registry) return;
  if (activeFamily() === "membership") {
    const selected = registry.packages.find((item) => item.id === membershipPackage.value);
    document.querySelector("#membershipPrice").textContent = selected ? money(selected.monthlyPrice) : "—";
    document.querySelector("#membershipServices").textContent = selected?.services.join(" + ") ?? "—";
    return;
  }
  const fullPrice = selectedCategory().fullPrice;
  const discount = activeGrantAmount();
  document.querySelector("#fullPrice").textContent = money(fullPrice);
  document.querySelector("#grantValue").textContent = `− ${money(discount)}`;
  document.querySelector("#remainingBalance").textContent = money(fullPrice - discount);
  grantControls.hidden = !grantEnabled.checked;
  customGrantField.hidden = !grantEnabled.checked || grantPreset.value !== "custom";
  grantSummary.hidden = !grantEnabled.checked;
}

function recalculateAmounts() {
  if (activeFamily() !== "fashion-week") return;
  updatePriceSummary();
  const balance = selectedCategory().fullPrice - activeGrantAmount();
  const amounts = splitPaymentAmounts(balance, 3);
  document.querySelectorAll(".payment-amount").forEach((input, index) => {
    input.value = amounts[index].toFixed(2).replace(/\.00$/, "");
  });
}

function recalculateDates() {
  if (activeFamily() !== "fashion-week") return;
  const dates = calculateDueDates({ sendDate: sendDate.value, eventMonth: eventMonth.value, installments: 3 });
  document.querySelectorAll(".payment-date").forEach((input, index) => {
    input.value = dates[index];
  });
}

function showError(error) {
  errorElement.textContent = error.message;
  errorElement.hidden = false;
  statusBadge.textContent = "Needs attention";
  statusBadge.className = "status-badge invalid";
}

function fitEditorToDocument() {
  if (editorManuallySized || !contractEditor || editorPanel.hidden) return;
  cancelAnimationFrame(editorHeightFrame);
  editorHeightFrame = requestAnimationFrame(() => {
    if (editorManuallySized || editorPanel.hidden) return;
    const bodyEditorHost = document.querySelector("#wysiwygEditor");
    const toolbar = bodyEditorHost.querySelector(".toastui-editor-defaultUI-toolbar");
    const content = bodyEditorHost.querySelector(".toastui-editor-ww-container .ProseMirror");
    if (!toolbar || !content) return;
    const height = calculateEditorHeight({
      toolbarHeight: toolbar.offsetHeight,
      contentHeight: content.scrollHeight,
    });
    contractEditor.setHeight(`${Math.max(360, height)}px`);
  });
}

function beginEditorResize(event) {
  const editorShell = editorPanel.querySelector(".toastui-editor-defaultUI");
  if (!editorShell) return;
  event.preventDefault();
  editorManuallySized = true;
  editorShell.dataset.manualResize = "true";
  const startY = event.clientY;
  const startHeight = editorShell.getBoundingClientRect().height;

  function resizeEditor(moveEvent) {
    const height = Math.max(360, startHeight + moveEvent.clientY - startY);
    contractEditor.setHeight(`${Math.round(height)}px`);
  }

  function finishEditorResize() {
    document.removeEventListener("pointermove", resizeEditor);
    document.removeEventListener("pointerup", finishEditorResize);
    document.removeEventListener("pointercancel", finishEditorResize);
    try {
      editorResizeHandle.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
  }

  document.addEventListener("pointermove", resizeEditor);
  document.addEventListener("pointerup", finishEditorResize);
  document.addEventListener("pointercancel", finishEditorResize);
  try {
    editorResizeHandle.setPointerCapture(event.pointerId);
  } catch {
    // Document-level listeners keep resizing functional without capture.
  }
}

function enableEditorSizing() {
  const editorShell = editorPanel.querySelector(".toastui-editor-defaultUI");
  if (!editorShell) return;
  editorShell.addEventListener("pointerdown", (event) => {
    if (isResizeHandlePointer({
      clientX: event.clientX,
      clientY: event.clientY,
      rect: editorShell.getBoundingClientRect(),
    })) {
      editorManuallySized = true;
      editorShell.dataset.manualResize = "true";
    }
  });
  contractEditor.on("change", fitEditorToDocument);
  contractEditor.on("change", () => {
    refreshPlaceholderFormatting();
    if (loadingRecord || workspaceMode !== "batch" || view !== "editor") return;
    markSelectedRecordChanged();
    scheduleDraftSave();
  });
  window.addEventListener("resize", fitEditorToDocument);
  editorResizeHandle.addEventListener("pointerdown", beginEditorResize);
  fitEditorToDocument();
}

function resolvedMarkdown() {
  if (!currentResult) throw new Error("Complete the contract fields before previewing.");
  const templateMarkdown = normalizeEditorMarkdown(contractEditor.getMarkdown());
  return resolveMarkdownTemplate(templateMarkdown, currentResult.placeholders);
}

function renderedContractHtml(markdown) {
  return DOMPurify.sanitize(marked.parse(markdown, { gfm: true, breaks: false }));
}

function signatureConfirmHtml(html) {
  const container = document.createElement("div");
  container.innerHTML = html;
  container.querySelectorAll("p").forEach((element) => {
    element.style.margin = "16px 0";
  });
  container.querySelectorAll("h2").forEach((element) => {
    element.style.cssText = "margin:0 0 16px;font-size:16px;font-weight:400;line-height:1.6";
  });
  container.querySelectorAll("h3").forEach((element) => {
    element.style.cssText = "margin:16px 0 0;font-size:16px;font-weight:700;line-height:1.6";
  });
  container.querySelectorAll("h3 + p").forEach((element) => {
    element.style.marginTop = "0";
  });
  container.querySelectorAll("ul, ol").forEach((element) => {
    element.style.cssText = "margin:16px 0;padding-left:40px";
  });
  return DOMPurify.sanitize(
    `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#171716">${container.innerHTML}</div>`,
  );
}

function renderPreview() {
  documentElement.replaceChildren();
  const markdown = resolvedMarkdown();
  documentElement.innerHTML = renderedContractHtml(markdown);
  errorElement.hidden = true;
  statusBadge.textContent = "Valid";
  statusBadge.className = "status-badge valid";
  return markdown;
}

function renderTemplatePreview() {
  documentElement.replaceChildren();
  documentElement.innerHTML = renderedContractHtml(normalizeEditorMarkdown(contractEditor.getMarkdown()));
  titleElement.textContent = activeTitleTemplate();
  errorElement.hidden = true;
  statusBadge.textContent = "Template ready";
  statusBadge.className = "status-badge valid";
}

function showResult() {
  if (workspaceMode === "templates") titleElement.textContent = activeTitleTemplate();
  if (currentResult && workspaceMode === "batch") titleElement.textContent = currentResult.title;
  const editorVisible = view === "editor";
  placeholderLibrary.hidden = !editorVisible;
  editorPanel.hidden = !editorVisible;
  previewPanel.hidden = editorVisible;
  editorTab.classList.toggle("active", editorVisible);
  previewTab.classList.toggle("active", !editorVisible);
  editorTab.setAttribute("aria-pressed", String(editorVisible));
  previewTab.setAttribute("aria-pressed", String(!editorVisible));
  saveTemplateButton.hidden = !editorVisible;
  updateVerificationAction();
  syncFieldEditability();
  if (editorVisible) {
    fitEditorToDocument();
    refreshPlaceholderFormatting();
    return;
  }
  try {
    workspaceMode === "templates" ? renderTemplatePreview() : renderPreview();
  } catch (error) {
    showError(error);
  }
}

function renderReviewQueue() {
  if (!reviewQueue) return;
  reviewQueueSelect.replaceChildren();
  const total = reviewQueue.records.length;
  const verified = reviewQueue.records.filter((record) => record.status === "verified").length;
  const pending = total - verified;
  const complete = total > 0 && pending === 0;
  reviewQueue.progress = { total, verified, pending, complete };
  reviewProgress.textContent = `${verified} of ${total} verified · ${pending} remaining`;
  batchComplete.hidden = !complete;
  for (const record of reviewQueue.records) {
    const presentation = reviewRecordPresentation(record, activeFamily());
    const option = document.createElement("option");
    option.value = record.id;
    option.textContent = presentation.optionLabel;
    reviewQueueSelect.append(option);
  }
  reviewQueueSelect.value = selectedRecordId ?? reviewQueue.records[0]?.id ?? "";
  const presentation = selectedRecord()
    ? reviewRecordPresentation(selectedRecord(), activeFamily())
    : undefined;
  selectedRecordStatus.textContent = presentation ? `${presentation.symbol} ${presentation.label}` : "";
  selectedRecordStatus.className = `review-selector-status ${presentation?.state ?? ""}`;
  selectedRecordContext.textContent = presentation?.context ?? "";
}

async function refreshReviewQueue() {
  const response = await fetch("/api/review-queue");
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load review queue.");
  reviewQueue = body;
  renderReviewQueue();
}

async function saveCurrentDraft({ quiet = true } = {}) {
  const record = selectedRecord();
  if (!record || !contractEditor) return;
  const response = await fetch(`/api/review-queue/${encodeURIComponent(record.id)}/draft`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: readInput(),
      draftMarkdown: normalizeEditorMarkdown(contractEditor.getMarkdown()),
      draftTitleTemplate: activeTitleTemplate(),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to save draft.");
  Object.assign(record, body);
  renderReviewQueue();
  updateVerificationAction();
  if (!quiet) showToast("Draft saved");
}

function scheduleDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => saveCurrentDraft().catch(showError), 700);
}

async function selectRecord(recordId, { savePrevious = true } = {}) {
  if (recordId === selectedRecordId && selectedRecordId) return;
  clearTimeout(draftSaveTimer);
  if (savePrevious) await saveCurrentDraft();
  selectedRecordId = recordId;
  const record = selectedRecord();
  if (!record) throw new Error(`Unknown review record: ${recordId}.`);
  activeTemplateId = reviewQueue.batch.templateId;
  writeInput(record.input);
  loadingRecord = true;
  contractEditor.setMarkdown(record.draftMarkdown || templateMarkdown, false);
  titleEditor.setMarkdown(record.draftTitleTemplate || templateTitle, false);
  loadingRecord = false;
  editorManuallySized = false;
  view = "preview";
  syncFieldEditability();
  renderReviewQueue();
  await generate();
}

async function saveTemplate() {
  const markdown = normalizeEditorMarkdown(contractEditor.getMarkdown());
  const response = await fetch(`/api/templates/${encodeURIComponent(activeTemplateId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ markdown, titleTemplate: activeTitleTemplate() }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to save template.");
  templateMarkdown = body.markdown;
  templateTitle = body.titleTemplate;
  templateCatalog = await fetch("/api/templates").then((response) => response.json());
  renderTemplateSelects();
  renderTemplateVersion(body);
  await renderTemplateHistory();
  showToast(`Template saved as version ${body.version}`);
}

async function createTemplate() {
  const response = await fetch("/api/templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      sourceTemplateId: activeTemplateId,
      label: newTemplateName.value,
    }),
  });
  const template = await response.json();
  if (!response.ok) throw new Error(template.error || "Unable to create the template.");
  templateCatalog = await fetch("/api/templates").then((catalogResponse) => catalogResponse.json());
  activeTemplateId = template.id;
  newTemplateName.value = "";
  await loadTemplate(activeTemplateId);
  setWorkspace("templates");
  showToast("New template created");
}

async function restoreTemplate(version) {
  const response = await fetch(`/api/templates/${encodeURIComponent(activeTemplateId)}/restore`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ version }),
  });
  const template = await response.json();
  if (!response.ok) throw new Error(template.error || "Unable to restore the template version.");
  templateCatalog = await fetch("/api/templates").then((catalogResponse) => catalogResponse.json());
  await loadTemplate(template.id);
  showToast(`Restored version ${version} as version ${template.version}`);
}

async function deleteActiveTemplate() {
  const template = activeTemplate();
  if (!template || template.builtIn) throw new Error("Built-in templates cannot be deleted.");
  const confirmed = window.confirm(
    `Delete “${template.label}”? Its saved versions will be permanently removed.`,
  );
  if (!confirmed) return;
  const response = await fetch(`/api/templates/${encodeURIComponent(template.id)}`, { method: "DELETE" });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Unable to delete the template.");
  templateCatalog = await fetch("/api/templates").then((catalogResponse) => catalogResponse.json());
  const replacement = templateCatalog.find((candidate) => candidate.family === template.family && candidate.builtIn);
  if (!replacement) throw new Error("No standard template is available for this agreement.");
  activeTemplateId = replacement.id;
  await loadTemplate(replacement.id);
  setWorkspace("templates");
  showToast(`${result.label} deleted`);
}

async function verifyCurrentContract() {
  const record = selectedRecord();
  if (!record || record.status === "verified") return;
  await saveCurrentDraft();
  await generate();
  if (!currentResult) throw new Error("Resolve contract errors before verification.");
  const response = await fetch(`/api/review-queue/${encodeURIComponent(record.id)}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: readInput(),
      templateId: activeTemplateId,
      templateMarkdown: normalizeEditorMarkdown(contractEditor.getMarkdown()),
      titleTemplate: activeTitleTemplate(),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to verify contract.");
  await refreshReviewQueue();
  showToast("Contract verified and stored");
  const next = nextIncompleteRecord(reviewQueue.records, record.id);
  if (next) {
    selectedRecordId = undefined;
    await selectRecord(next.id, { savePrevious: false });
  } else {
    syncFieldEditability();
    renderReviewQueue();
  }
}

async function generate() {
  const revision = ++generateRevision;
  generateController?.abort();
  const controller = new AbortController();
  generateController = controller;
  statusBadge.textContent = "Checking";
  statusBadge.className = "status-badge checking";
  try {
    updatePriceSummary();
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ templateId: activeTemplateId, input: readInput(), titleTemplate: activeTitleTemplate() }),
      signal: controller.signal,
    });
    const body = await response.json();
    if (revision !== generateRevision) return;
    if (!response.ok) throw new Error(body.error);
    currentResult = body;
    previewTab.disabled = false;
    copyMarkdownButton.disabled = false;
    updateVerificationAction();
    errorElement.hidden = true;
    statusBadge.textContent = "Valid";
    statusBadge.className = "status-badge valid";
    renderPlaceholderLibrary();
    showResult();
  } catch (error) {
    if (error.name === "AbortError" || revision !== generateRevision) return;
    currentResult = null;
    previewTab.disabled = true;
    copyMarkdownButton.disabled = true;
    verifyContractButton.disabled = true;
    renderPlaceholderLibrary();
    showError(error);
  } finally {
    if (generateController === controller) generateController = undefined;
  }
}

function scheduleGenerate() {
  if (workspaceMode !== "batch") return;
  markSelectedRecordChanged();
  clearTimeout(renderTimer);
  generateController?.abort();
  generateRevision += 1;
  currentResult = null;
  renderPlaceholderLibrary();
  previewTab.disabled = true;
  copyMarkdownButton.disabled = true;
  titleElement.textContent = "Generating…";
  statusBadge.textContent = "Checking";
  statusBadge.className = "status-badge checking";
  errorElement.hidden = true;
  if (view === "preview") documentElement.replaceChildren();
  renderTimer = setTimeout(generate, 120);
  scheduleDraftSave();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("visible");
  setTimeout(() => toast.classList.remove("visible"), 1600);
}

async function copyText(value, message) {
  if (!value) return;
  await navigator.clipboard.writeText(value);
  showToast(message);
}

async function copyContract() {
  const markdown = resolvedMarkdown();
  const html = signatureConfirmHtml(renderedContractHtml(markdown));
  if (globalThis.ClipboardItem && navigator.clipboard.write) {
    const item = new ClipboardItem({
      "text/plain": new Blob([markdown], { type: "text/plain" }),
      "text/html": new Blob([html], { type: "text/html" }),
    });
    await navigator.clipboard.write([item]);
  } else {
    await navigator.clipboard.writeText(markdown);
  }
  showToast("Markdown copied");
}

function placeholderLabel(token) {
  if (token === "{{/IF}}") return "End condition";
  const conditional = token.match(/^\{\{#IF\s+([A-Z0-9_]+)\}\}$/);
  if (conditional) {
    return `If ${conditional[1].toLowerCase().replaceAll("_", " ")}`;
  }
  return token.slice(2, -2).toLowerCase().replaceAll("_", " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function placeholderWidget(token) {
  const element = document.createElement("span");
  element.className = "contract-placeholder-widget";
  element.contentEditable = "false";
  element.dataset.templateToken = token;
  const label = document.createElement("span");
  label.className = "contract-placeholder-label";
  label.textContent = placeholderLabel(token);
  const format = document.createElement("span");
  format.className = "contract-placeholder-format";
  element.append(label, format);
  return element;
}

function placeholderFormatting(element) {
  const formats = [];
  if (element.closest("h1, h2, h3, h4, h5, h6")) formats.push("Heading");
  if (element.closest("li")) formats.push("List item");
  if (element.closest("strong, b")) formats.push("Bold");
  if (element.closest("em, i")) formats.push("Italic");
  return formats.length ? formats.join(" · ") : "Body text";
}

function refreshPlaceholderFormatting() {
  requestAnimationFrame(() => {
    document.querySelectorAll(".contract-placeholder-widget").forEach((widget) => {
      const format = widget.querySelector(".contract-placeholder-format");
      const context = widget.closest("#titleWysiwygEditor") ? "Title" : placeholderFormatting(widget);
      widget.dataset.format = context;
      widget.setAttribute("aria-label", `${widget.querySelector(".contract-placeholder-label")?.textContent ?? "Placeholder"} · ${context}`);
      if (format) format.textContent = context;
    });
  });
}

function insertPlaceholder(placeholder) {
  const target = activeEditor === "title" ? titleEditor : contractEditor;
  target.focus();
  target.insertText(placeholderInsertionText(placeholder, { inline: activeEditor === "title" }));
  fitEditorToDocument();
  refreshPlaceholderFormatting();
  showToast(`${placeholder.label} inserted${activeEditor === "title" ? " in title" : ""}`);
}

function renderPlaceholderLibrary() {
  placeholderList.replaceChildren();
  const visible = placeholderRegistry.filter((placeholder) =>
    matchesPlaceholder(placeholder, placeholderSearch.value)
  );
  const groups = new Map();
  for (const placeholder of visible) {
    if (!groups.has(placeholder.group)) groups.set(placeholder.group, []);
    groups.get(placeholder.group).push(placeholder);
  }

  for (const [groupName, placeholders] of groups) {
    const group = document.createElement("section");
    group.className = "placeholder-group";
    const heading = document.createElement("h4");
    heading.textContent = groupName;
    group.append(heading);

    for (const placeholder of placeholders) {
      const item = document.createElement("article");
      item.className = "placeholder-item";
      const header = document.createElement("div");
      header.className = "placeholder-item-header";
      const label = document.createElement("strong");
      label.textContent = placeholder.label;
      const kind = document.createElement("span");
      kind.className = "placeholder-kind";
      kind.textContent = placeholder.type === "condition" ? "Show only when" : "Filled from batch";
      const insert = document.createElement("button");
      insert.type = "button";
      insert.className = "placeholder-insert";
      insert.textContent = "Insert";
      insert.setAttribute("aria-label", `Insert ${placeholder.label}`);
      insert.addEventListener("click", () => insertPlaceholder(placeholder));
      header.append(label, kind, insert);

      const token = document.createElement("code");
      token.className = "placeholder-token";
      token.textContent = placeholder.type === "condition"
        ? `{{#IF ${placeholder.key}}} … {{/IF}}`
        : `{{${placeholder.key}}}`;
      const value = document.createElement("span");
      value.className = "placeholder-current-value";
      value.textContent = workspaceMode === "templates"
        ? (placeholder.type === "condition" ? "Available when its condition applies" : "Filled from the selected batch record")
        : displayPlaceholderValue(placeholder, currentResult?.placeholders);
      if (placeholder.type === "condition") {
        value.classList.add(currentResult?.placeholders?.[placeholder.key] ? "active" : "inactive");
      }
      const description = document.createElement("p");
      description.textContent = placeholder.description;
      item.append(header, token, value, description);
      group.append(item);
    }
    placeholderList.append(group);
  }

  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "placeholder-empty";
    empty.textContent = "No matching placeholders.";
    placeholderList.append(empty);
  }
}

async function initialize() {
  const queueResponse = await fetch("/api/review-queue");
  if (!queueResponse.ok) throw new Error("Unable to load the contract review queue.");
  reviewQueue = await queueResponse.json();
  const templatesResponse = await fetch("/api/templates");
  if (!templatesResponse.ok) throw new Error("Unable to load the saved templates.");
  templateCatalog = await templatesResponse.json();
  activeTemplateId = templateCatalog.some((template) => template.id === reviewQueue.batch.templateId)
    ? reviewQueue.batch.templateId
    : templateCatalog[0]?.id;
  contractEditor = new toastui.Editor({
    el: document.querySelector("#wysiwygEditor"),
    initialValue: "",
    initialEditType: "wysiwyg",
    hideModeSwitch: true,
    usageStatistics: false,
    autofocus: false,
    height: "360px",
    minHeight: "360px",
    toolbarItems: [
      ["heading", "bold", "italic"],
      ["ul", "ol", "indent", "outdent"],
      ["link"],
    ],
    widgetRules: [{
      rule: /\{\{(?:#IF\s+[A-Z0-9_]+|\/IF|[A-Z0-9_]+)\}\}/,
      toDOM: placeholderWidget,
    }],
  });
  titleEditor = new toastui.Editor({
    el: document.querySelector("#titleWysiwygEditor"),
    initialValue: "",
    initialEditType: "wysiwyg",
    hideModeSwitch: true,
    usageStatistics: false,
    autofocus: false,
    height: "116px",
    minHeight: "116px",
    toolbarItems: [["bold", "italic"]],
    widgetRules: [{
      rule: /\{\{(?:#IF\s+[A-Z0-9_]+|\/IF|[A-Z0-9_]+)\}\}/,
      toDOM: placeholderWidget,
    }],
  });
  enableEditorSizing();
  sendDate.value = todayIso();
  form.addEventListener("input", scheduleGenerate);
  form.addEventListener("change", scheduleGenerate);
  [categorySelect, grantEnabled, grantPreset, customGrantAmount].forEach((control) => {
    control.addEventListener("input", () => { recalculateAmounts(); scheduleGenerate(); });
    control.addEventListener("change", () => { recalculateAmounts(); scheduleGenerate(); });
  });
  [sendDate, eventMonth].forEach((control) => {
    control.addEventListener("input", () => { recalculateDates(); scheduleGenerate(); });
    control.addEventListener("change", () => { recalculateDates(); scheduleGenerate(); });
  });
  editorTab.addEventListener("click", () => { view = "editor"; showResult(); });
  previewTab.addEventListener("click", () => { view = "preview"; showResult(); });
  document.querySelector("#copyTitle").addEventListener("click", () => copyText(
    workspaceMode === "templates" ? activeTitleTemplate() : currentResult?.title,
    workspaceMode === "templates" ? "Title template copied" : "Title copied",
  ));
  copyMarkdownButton.addEventListener("click", async () => {
    try {
      await copyContract();
    } catch (error) {
      showError(error);
    }
  });
  saveTemplateButton.addEventListener("click", () => saveTemplate().catch(showError));
  verifyContractButton.addEventListener("click", () => verifyCurrentContract().catch(showError));
  reviewQueueSelect.addEventListener("change", () => selectRecord(reviewQueueSelect.value).catch(showError));
  placeholderSearch.addEventListener("input", renderPlaceholderLibrary);
  uploadWorkbookButton.addEventListener("click", () => uploadWorkbook().catch(showError));
  templateWorkspaceButton.addEventListener("click", () => loadTemplate(activeTemplateId)
    .then(() => setWorkspace("templates")).catch(showError));
  batchWorkspaceButton.addEventListener("click", async () => {
    try {
      view = "preview";
      await loadTemplate(reviewQueue.batch.templateId);
      setWorkspace("batch");
      const firstRecord = reviewQueue.records.find((record) => record.status !== "verified") ?? reviewQueue.records[0];
      await selectRecord(firstRecord.id, { savePrevious: false });
    } catch (error) {
      showError(error);
    }
  });
  templateSelect.addEventListener("change", () => loadTemplate(templateSelect.value).catch(showError));
  openTemplateBuilderButton.addEventListener("click", () => loadTemplate(templateSelect.value)
    .then(() => setWorkspace("templates")).catch(showError));
  createTemplateButton.addEventListener("click", () => createTemplate().catch(showError));
  deleteTemplateButton.addEventListener("click", () => deleteActiveTemplate().catch(showError));
  document.querySelector("#wysiwygEditor").addEventListener("focusin", () => { activeEditor = "body"; });
  document.querySelector("#titleWysiwygEditor").addEventListener("focusin", () => { activeEditor = "title"; });
  titleEditor.on("change", () => {
    refreshPlaceholderFormatting();
    if (loadingRecord || workspaceMode !== "batch" || view !== "editor") return;
    markSelectedRecordChanged();
    scheduleDraftSave();
  });
  renderReviewQueue();
  await loadTemplate(activeTemplateId);
  setWorkspace("templates");
}

initialize().catch(showError);

function configureFamilyControls() {
  if (activeFamily() === "fashion-week") {
    eventSelect.innerHTML = registry.events.map((event) => `<option value="${event.code}">${event.code} · ${event.label}</option>`).join("");
    categorySelect.innerHTML = registry.categories.map((category) => `<option value="${category.id}">${category.label}</option>`).join("");
    customGrantAmount.value = String(registry.grant.defaultAmount);
  } else {
    membershipPackage.innerHTML = registry.packages.map((item) => `<option value="${item.id}">${item.label}</option>`).join("");
  }
}

async function activateQueue(queue) {
  reviewQueue = queue;
  activeTemplateId = queue.batch.templateId;
  selectedRecordId = undefined;
  await loadTemplate(activeTemplateId);
  renderReviewQueue();
  view = "preview";
  setWorkspace("batch");
  await selectRecord(queue.records[0].id, { savePrevious: false });
}

async function uploadWorkbook() {
  const selectedTemplate = templateCatalog.find((template) => template.id === batchTemplateSelect.value);
  if (!selectedTemplate) throw new Error("Choose a saved template first.");
  if (selectedTemplate.family === "membership") {
    await loadMembershipDemo(selectedTemplate.id);
    return;
  }
  const file = workbookFile.files[0];
  if (!file) throw new Error("Choose an .xlsx workbook first.");
  uploadWorkbookButton.disabled = true;
  importSummary.textContent = `Importing ${file.name}…`;
  try {
    const response = await fetch(`/api/import-workbook?templateId=${encodeURIComponent(batchTemplateSelect.value)}`, { method: "POST", headers: { "content-type": file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "x-file-name": file.name }, body: file });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Unable to import workbook.");
    const attention = body.records.filter((record) => record.importIssues?.length).length;
    importSummary.textContent = `${body.records.length} contracts imported${attention ? ` · ${attention} need attention` : ""}.`;
    await activateQueue(body);
  } finally {
    uploadWorkbookButton.disabled = false;
  }
}

async function loadMembershipDemo(templateId) {
  const response = await fetch(`/api/demo/membership?templateId=${encodeURIComponent(templateId)}`, { method: "POST" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to load Membership demo.");
  importSummary.textContent = "Membership mock contract loaded with the selected saved template.";
  await activateQueue(body);
}
