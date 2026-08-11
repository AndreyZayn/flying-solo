const PLACEHOLDER_KEY_PATTERN = /^[A-Z0-9_]+$/;

export function placeholderInsertionText(placeholder) {
  const key = String(placeholder?.key ?? "");
  if (!PLACEHOLDER_KEY_PATTERN.test(key)) throw new Error("Invalid placeholder key.");
  if (placeholder.type === "value") return `{{${key}}}`;
  if (placeholder.type === "condition") return `{{#IF ${key}}}\n\n{{/IF}}`;
  throw new Error(`Unsupported placeholder type: ${placeholder?.type}.`);
}

export function matchesPlaceholder(placeholder, query) {
  const normalizedQuery = String(query ?? "").trim().toLowerCase();
  if (!normalizedQuery) return true;
  return [placeholder.key, placeholder.label, placeholder.description]
    .some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
}

export function displayPlaceholderValue(placeholder, values = {}) {
  const value = values?.[placeholder.key];
  if (placeholder.type === "condition") return value ? "Active" : "Inactive";
  return value == null || value === "" ? "Not set" : String(value);
}
