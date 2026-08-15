export function reviewRecordPresentation(record, templateId = "fashion-week") {
  let state = "pending";
  let symbol = "●";
  let label = "Pending";
  if (record.status === "verified") {
    state = "verified";
    symbol = "✓";
    label = "Verified";
  } else if (record.status === "changes_pending") {
    state = "changes-pending";
    label = "Changes pending";
  } else if (record.importIssues?.length) {
    state = "attention";
    symbol = "!";
    label = "Attention";
  }
  const context = templateId === "membership"
    ? [record.input.durationMonths ? `${record.input.durationMonths} months` : "", record.input.packageId].filter(Boolean).join(" · ")
    : [record.input.eventCode, record.input.eventMonth, record.sourceRow ? `row ${record.sourceRow}` : ""].filter(Boolean).join(" · ");
  return {
    state,
    symbol,
    label,
    optionLabel: `${symbol} ${record.input.brand} — ${label}`,
    context,
  };
}

export function nextIncompleteRecord(records, currentId) {
  if (!records.length) return undefined;
  const currentIndex = Math.max(0, records.findIndex((record) => record.id === currentId));
  for (let offset = 1; offset <= records.length; offset += 1) {
    const candidate = records[(currentIndex + offset) % records.length];
    if (candidate.status !== "verified") return candidate;
  }
  return undefined;
}
