export function selectFashionWeekCategory(value, categories) {
  const requested = String(value ?? "").trim().toLowerCase();
  return categories.find((category) => category.id.toLowerCase() === requested || category.aliases.includes(requested))?.id ?? "";
}
