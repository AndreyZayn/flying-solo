const SAMPLE_BRAND = "Test Brand Co.";
const SAMPLE_REPRESENTATIVE = "Test Representative";

function requiredSampleValue(value, label) {
  if (value == null) throw new Error(`Cannot build a sample preview without a ${label}.`);
  return value;
}

export function templatePreviewInput({ family, registry }) {
  if (family === "membership") {
    const packageConfig = registry.packages.find((item) => item.id === "clothing-store-pr") ?? registry.packages[0];
    const availableDurations = Object.keys(registry.durationBenefits).map(Number);
    const durationMonths = availableDurations.includes(6) ? 6 : availableDurations[0];
    return {
      brand: SAMPLE_BRAND,
      representative: SAMPLE_REPRESENTATIVE,
      packageId: requiredSampleValue(packageConfig?.id, "membership package"),
      durationMonths: requiredSampleValue(durationMonths, "membership duration"),
      startDate: "2027-02-01",
      monthlyPrice: requiredSampleValue(packageConfig?.monthlyPrice, "membership price"),
    };
  }

  if (family === "fashion-week") {
    const event = registry.events.find((item) => item.code === "NYFW") ?? registry.events[0];
    const category = registry.categories.find((item) => item.accessoryClause) ?? registry.categories[0];
    const fullPrice = Number(requiredSampleValue(category?.fullPrice, "Fashion Week price"));
    const preferredGrant = Number(registry.grant?.defaultAmount);
    const grantEnabled = Number.isFinite(preferredGrant) && preferredGrant > 0 && preferredGrant < fullPrice;
    const grantAmount = grantEnabled ? preferredGrant : 0;
    const remainingBalance = fullPrice - grantAmount;
    const paymentOne = Math.round(remainingBalance * 50) / 100;
    const paymentTwo = Math.round((remainingBalance - paymentOne) * 50) / 100;
    const paymentThree = remainingBalance - paymentOne - paymentTwo;

    return {
      eventCode: requiredSampleValue(event?.code, "Fashion Week event"),
      eventMonth: "February 2027",
      brand: SAMPLE_BRAND,
      representative: SAMPLE_REPRESENTATIVE,
      category: requiredSampleValue(category?.id, "Fashion Week category"),
      grantEnabled,
      grantAmount,
      payments: [
        { dueDate: "2026-12-01", amount: paymentOne },
        { dueDate: "2027-01-01", amount: paymentTwo },
        { dueDate: "2027-02-01", amount: paymentThree },
      ],
    };
  }

  throw new Error(`No sample preview is available for ${family}.`);
}
