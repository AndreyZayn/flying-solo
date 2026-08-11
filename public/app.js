import { calculateDueDates, splitPaymentAmounts } from "/schedule.mjs";
import { calculateEditorHeight, isResizeHandlePointer } from "/editor-sizing.mjs";
import { normalizeEditorMarkdown, resolveMarkdownTemplate } from "/markdown-template.mjs";
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
const placeholderSearch = document.querySelector("#placeholderSearch");
const placeholderList = document.querySelector("#placeholderList");
const editControls = document.querySelector("#editControls");
const reviewQueueElement = document.querySelector("#reviewQueue");
const reviewProgress = document.querySelector("#reviewProgress");
const batchComplete = document.querySelector("#batchComplete");
const verifyContractButton = document.querySelector("#verifyContract");
const saveTemplateButton = document.querySelector("#saveTemplate");

let registry;
let placeholderRegistry = [];
let currentResult;
let contractEditor;
let view = "preview";
let reviewQueue;
let selectedRecordId;
let activeTemplateId = "fashion-week";
let templateMarkdown = "";
let renderTimer;
let draftSaveTimer;
let editorHeightFrame;
let editorManuallySized = false;
let generateController;
let generateRevision = 0;

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
  eventSelect.value = input.eventCode ?? "";
  eventMonth.value = monthInputValue(input.eventMonth);
  document.querySelector("#brand").value = input.brand ?? "";
  representative.value = input.representative ?? "";
  representativeEmail.value = input.recipientEmail ?? "";
  categorySelect.value = input.category ?? "";
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

function setReviewLocked(locked) {
  form.querySelectorAll("input, select").forEach((control) => { control.disabled = locked; });
  verifyContractButton.disabled = locked || !currentResult;
}

function updatePriceSummary() {
  if (!registry) return;
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
  updatePriceSummary();
  const balance = selectedCategory().fullPrice - activeGrantAmount();
  const amounts = splitPaymentAmounts(balance, 3);
  document.querySelectorAll(".payment-amount").forEach((input, index) => {
    input.value = amounts[index].toFixed(2).replace(/\.00$/, "");
  });
}

function recalculateDates() {
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
    const toolbar = editorPanel.querySelector(".toastui-editor-defaultUI-toolbar");
    const content = editorPanel.querySelector(".toastui-editor-ww-container .ProseMirror");
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
  contractEditor.on("change", scheduleDraftSave);
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

function showResult() {
  if (currentResult) titleElement.textContent = currentResult.title;
  const editorVisible = view === "editor";
  editControls.hidden = !editorVisible;
  editorPanel.hidden = !editorVisible;
  previewPanel.hidden = editorVisible;
  editorTab.classList.toggle("active", editorVisible);
  previewTab.classList.toggle("active", !editorVisible);
  editorTab.setAttribute("aria-pressed", String(editorVisible));
  previewTab.setAttribute("aria-pressed", String(!editorVisible));
  saveTemplateButton.hidden = !editorVisible;
  verifyContractButton.disabled = !currentResult || selectedRecord()?.status === "verified";
  if (editorVisible) {
    fitEditorToDocument();
    return;
  }
  try {
    renderPreview();
  } catch (error) {
    showError(error);
  }
}

function renderReviewQueue() {
  if (!reviewQueue) return;
  reviewQueueElement.replaceChildren();
  const { total, verified, pending, complete } = reviewQueue.progress;
  reviewProgress.textContent = `${verified} of ${total} verified · ${pending} remaining`;
  batchComplete.hidden = !complete;
  for (const record of reviewQueue.records) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `review-record ${record.status}`;
    button.classList.toggle("selected", record.id === selectedRecordId);
    button.innerHTML = `<span class="review-record-top"><strong></strong><span class="review-state"></span></span><small></small>`;
    button.querySelector("strong").textContent = record.input.brand;
    button.querySelector(".review-state").textContent = record.status === "verified" ? "Verified" : "Pending";
    button.querySelector("small").textContent = `${record.input.eventCode} · ${record.input.eventMonth}`;
    button.addEventListener("click", () => selectRecord(record.id));
    reviewQueueElement.append(button);
  }
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
  if (!record || record.status === "verified" || !contractEditor) return;
  const response = await fetch(`/api/review-queue/${encodeURIComponent(record.id)}/draft`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: readInput(),
      draftMarkdown: normalizeEditorMarkdown(contractEditor.getMarkdown()),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to save draft.");
  Object.assign(record, body);
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
  contractEditor.setMarkdown(record.draftMarkdown || templateMarkdown, false);
  editorManuallySized = false;
  view = "preview";
  setReviewLocked(record.status === "verified");
  renderReviewQueue();
  await generate();
}

async function saveTemplate() {
  const markdown = normalizeEditorMarkdown(contractEditor.getMarkdown());
  const response = await fetch(`/api/templates/${encodeURIComponent(activeTemplateId)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ markdown }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to save template.");
  templateMarkdown = body.markdown;
  showToast("Template saved for future contracts");
}

async function verifyCurrentContract() {
  const record = selectedRecord();
  if (!record || record.status === "verified") return;
  await generate();
  if (!currentResult) throw new Error("Resolve contract errors before verification.");
  const response = await fetch(`/api/review-queue/${encodeURIComponent(record.id)}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: readInput(),
      templateId: activeTemplateId,
      templateMarkdown: normalizeEditorMarkdown(contractEditor.getMarkdown()),
    }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Unable to verify contract.");
  await refreshReviewQueue();
  showToast("Contract verified and stored");
  const next = reviewQueue.records.find((candidate) => candidate.status === "pending");
  if (next) {
    selectedRecordId = undefined;
    await selectRecord(next.id, { savePrevious: false });
  } else {
    setReviewLocked(true);
    renderReviewQueue();
  }
}

async function generate() {
  const revision = ++generateRevision;
  generateController?.abort();
  const controller = new AbortController();
  generateController = controller;
  updatePriceSummary();
  statusBadge.textContent = "Checking";
  statusBadge.className = "status-badge checking";
  try {
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(readInput()),
      signal: controller.signal,
    });
    const body = await response.json();
    if (revision !== generateRevision) return;
    if (!response.ok) throw new Error(body.error);
    currentResult = body;
    previewTab.disabled = false;
    copyMarkdownButton.disabled = false;
    verifyContractButton.disabled = selectedRecord()?.status === "verified";
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
  element.textContent = placeholderLabel(token);
  return element;
}

function insertPlaceholder(placeholder) {
  contractEditor.focus();
  contractEditor.insertText(placeholderInsertionText(placeholder));
  fitEditorToDocument();
  showToast(`${placeholder.label} inserted`);
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
      const insert = document.createElement("button");
      insert.type = "button";
      insert.className = "placeholder-insert";
      insert.textContent = "Insert";
      insert.setAttribute("aria-label", `Insert ${placeholder.label}`);
      insert.addEventListener("click", () => insertPlaceholder(placeholder));
      header.append(label, insert);

      const token = document.createElement("code");
      token.className = "placeholder-token";
      token.textContent = placeholder.type === "condition"
        ? `{{#IF ${placeholder.key}}} … {{/IF}}`
        : `{{${placeholder.key}}}`;
      const value = document.createElement("span");
      value.className = "placeholder-current-value";
      value.textContent = displayPlaceholderValue(placeholder, currentResult?.placeholders);
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
  const loadedQueue = await queueResponse.json();
  const queueTemplateId = loadedQueue.batch.templateId;
  const [loadedRegistry, loadedPlaceholders, template] = await Promise.all([
    fetch("/api/config").then((response) => {
      if (!response.ok) throw new Error("Unable to load contract configuration.");
      return response.json();
    }),
    fetch("/api/placeholders").then((response) => {
      if (!response.ok) throw new Error("Unable to load placeholders.");
      return response.json();
    }),
    fetch(`/api/templates/${encodeURIComponent(queueTemplateId)}`).then((response) => {
      if (!response.ok) throw new Error("Unable to load the contract template.");
      return response.json();
    }),
  ]);
  registry = loadedRegistry;
  placeholderRegistry = loadedPlaceholders;
  reviewQueue = loadedQueue;
  activeTemplateId = reviewQueue.batch.templateId;
  templateMarkdown = template.markdown;
  contractEditor = new toastui.Editor({
    el: document.querySelector("#wysiwygEditor"),
    initialValue: templateMarkdown.trim(),
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
  enableEditorSizing();
  eventSelect.innerHTML = registry.events.map((event) => `<option value="${event.code}">${event.code} · ${event.label}</option>`).join("");
  categorySelect.innerHTML = registry.categories.map((category) => `<option value="${category.id}">${category.label}</option>`).join("");
  customGrantAmount.value = String(registry.grant.defaultAmount);
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
  document.querySelector("#copyTitle").addEventListener("click", () => copyText(currentResult?.title, "Title copied"));
  document.querySelector("#copyRepresentative").addEventListener("click", () => copyText(representative.value, "Representative name copied"));
  document.querySelector("#copyRepresentativeEmail").addEventListener("click", () => copyText(representativeEmail.value, "Representative email copied"));
  copyMarkdownButton.addEventListener("click", async () => {
    try {
      await copyContract();
    } catch (error) {
      showError(error);
    }
  });
  saveTemplateButton.addEventListener("click", () => saveTemplate().catch(showError));
  verifyContractButton.addEventListener("click", () => verifyCurrentContract().catch(showError));
  placeholderSearch.addEventListener("input", renderPlaceholderLibrary);
  renderPlaceholderLibrary();
  renderReviewQueue();
  const firstRecord = reviewQueue.records.find((record) => record.status === "pending") ?? reviewQueue.records[0];
  await selectRecord(firstRecord.id, { savePrevious: false });
}

initialize().catch(showError);
