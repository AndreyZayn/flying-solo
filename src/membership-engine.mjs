function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function isoDate(value) {
  const text = requiredText(value, "Membership start date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error("Membership start date must use YYYY-MM-DD.");
  const date = new Date(`${text}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== text) throw new Error("Membership start date is invalid.");
  if (date.getUTCDate() !== 1) throw new Error("Membership start date must be the first day of a month.");
  return date;
}

function displayDate(date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

export function buildMembershipContract(input, registry) {
  const brand = requiredText(input.brand, "Brand");
  const representative = requiredText(input.representative, "Representative");
  const packageConfig = registry.packages.find((item) => item.id === input.packageId);
  if (!packageConfig) throw new Error(`Unsupported membership package: ${input.packageId}.`);
  const durationMonths = Number(input.durationMonths);
  if (!Object.hasOwn(registry.durationBenefits, String(durationMonths))) throw new Error(`Unsupported membership duration: ${input.durationMonths}.`);
  if (input.monthlyPrice != null && Number(input.monthlyPrice) !== packageConfig.monthlyPrice) {
    throw new Error(`Monthly price must match the approved ${money(packageConfig.monthlyPrice)} package price.`);
  }
  const start = isoDate(input.startDate);
  const termEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + durationMonths, 0));
  const cancellation = new Date(Date.UTC(termEnd.getUTCFullYear(), termEnd.getUTCMonth(), 0));
  const benefit = registry.durationBenefits[String(durationMonths)];
  const categoryDisplay = packageConfig.size ? `${packageConfig.category} (${packageConfig.size})` : packageConfig.category;
  const placeholders = {
    DESIGNER_NAME: representative,
    BRAND: brand,
    MEMBERSHIP_LOCATION: registry.location,
    CATEGORY_DISPLAY: categoryDisplay,
    START_DATE: displayDate(start),
    DURATION: `${durationMonths} months`,
    PRICE: money(packageConfig.monthlyPrice),
    CANC_DATE: displayDate(cancellation),
    BENEFIT_LABEL: benefit,
    NY_STORE_ENABLED: packageConfig.services.includes("NY Store"),
    PR_ENABLED: packageConfig.services.includes("PR"),
    BENEFIT_ENABLED: Boolean(benefit),
  };
  return {
    title: `FLYING SOLO - ${registry.location} - ${durationMonths} months - ${brand}`,
    placeholders,
    commercial: { packageId: packageConfig.id, monthlyPrice: packageConfig.monthlyPrice, termEnd: termEnd.toISOString().slice(0, 10), cancellationDeadline: cancellation.toISOString().slice(0, 10) },
  };
}
