const MONTHS = {
  january: "Jan", february: "Feb", march: "Mar", april: "Apr",
  may: "May", june: "Jun", july: "Jul", august: "Aug",
  september: "Sep", october: "Oct", november: "Nov", december: "Dec",
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function integerCents(value) {
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8;
  return Number.isSafeInteger(rounded) && Math.abs(scaled - rounded) <= tolerance
    ? rounded
    : null;
}

function requiredText(value, label) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${label} is required.`);
  return normalized;
}

function normalizeCategory(value, registry) {
  const requested = requiredText(value, "Brand category").toLowerCase();
  const match = registry.categories.find((category) =>
    category.id.toLowerCase() === requested || category.aliases.includes(requested)
  );
  if (!match) throw new Error(`Unsupported brand category: ${value}.`);
  return match;
}

function titleSeason(eventMonth) {
  const normalized = requiredText(eventMonth, "Event month");
  const match = normalized.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (!match) throw new Error("Event month must look like February 2027.");
  const shortMonth = MONTHS[match[1].toLowerCase()];
  if (!shortMonth) throw new Error(`Unsupported event month: ${match[1]}.`);
  return `${shortMonth} ${match[2]}`;
}

function displayDate(value) {
  const iso = requiredText(value, "Payment due date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("Payment dates must use YYYY-MM-DD.");
  }
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== iso) {
    throw new Error(`Invalid payment date: ${iso}.`);
  }
  return new Intl.DateTimeFormat("en-US", {
    month: "long", day: "numeric", year: "numeric", timeZone: "UTC",
  }).format(date);
}

export function calculateCommercial(input, registry) {
  const category = normalizeCategory(input.category, registry);
  const fullPrice = category.fullPrice;
  const grantEnabled = Boolean(input.grantEnabled);
  const grantAmount = grantEnabled ? Number(input.grantAmount) : 0;
  if (grantEnabled && (!Number.isFinite(grantAmount) || grantAmount <= 0 || grantAmount >= fullPrice)) {
    throw new Error(`Grant amount must be greater than $0 and lower than ${money(fullPrice)}.`);
  }
  const grantAmountCents = integerCents(grantAmount);
  if (grantEnabled && grantAmountCents === null) {
    throw new Error("Grant amount must use no more than two decimal places.");
  }
  const fullPriceCents = integerCents(fullPrice);
  return {
    category: category.id,
    fullPrice,
    grantAmount: grantAmountCents / 100,
    remainingBalance: (fullPriceCents - grantAmountCents) / 100,
  };
}

function validatePayments(payments, remainingBalance) {
  if (!Array.isArray(payments) || payments.length < 1 || payments.length > 3) {
    throw new Error("Provide between one and three payments.");
  }
  const normalized = payments.map((payment, index) => {
    const amount = Number(payment.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`Payment ${index + 1} amount must be greater than $0.`);
    }
    const amountCents = integerCents(amount);
    if (amountCents === null) {
      throw new Error(`Payment ${index + 1} amount must use no more than two decimal places.`);
    }
    return {
      number: index + 1,
      dueDate: requiredText(payment.dueDate, `Payment ${index + 1} due date`),
      displayDueDate: displayDate(payment.dueDate),
      amount: amountCents / 100,
      amountCents,
    };
  });
  if (normalized.some((payment, index) => index > 0 && normalized[index - 1].dueDate >= payment.dueDate)) {
    throw new Error("Payment dates must be strictly increasing.");
  }
  const totalCents = normalized.reduce((sum, payment) => sum + payment.amountCents, 0);
  const remainingBalanceCents = integerCents(remainingBalance);
  if (totalCents !== remainingBalanceCents) {
    throw new Error(`Payment total ${money(totalCents / 100)} must equal the remaining balance of ${money(remainingBalance)}.`);
  }
  return normalized;
}

export function buildContract(input, registry) {
  const eventCode = requiredText(input.eventCode, "Event").toUpperCase();
  if (!registry.events.some((event) => event.code === eventCode)) {
    throw new Error(`Unsupported event: ${eventCode}.`);
  }
  const eventMonth = requiredText(input.eventMonth, "Event month");
  const brand = requiredText(input.brand, "Brand");
  const representative = requiredText(input.representative, "Representative");
  const categoryConfig = normalizeCategory(input.category, registry);
  const commercial = calculateCommercial(input, registry);
  const payments = validatePayments(input.payments, commercial.remainingBalance);
  const grantSuffix = input.grantEnabled ? " - (grant)" : "";
  const title = `FLYING SOLO - ${eventCode} - ${titleSeason(eventMonth)} - ${brand}${grantSuffix}`;

  const paymentValue = (index, property) => payments[index]?.[property] ?? "";
  const clothingFullPrice = registry.categories.find((category) => category.id === "Clothing").fullPrice;
  const placeholders = {
    EVENT_CODE: eventCode,
    EVENT_MONTH: eventMonth,
    TITLE_EVENT_MONTH: titleSeason(eventMonth),
    REPRESENTATIVE_NAME: representative,
    BRAND_NAME: brand,
    FULL_PRICE: money(commercial.fullPrice),
    GRANT_AMOUNT: money(commercial.grantAmount),
    REMAINING_BALANCE: money(commercial.remainingBalance),
    CLOTHING_FULL_PRICE: money(clothingFullPrice),
    PAYMENT_1_DUE_DATE: paymentValue(0, "displayDueDate"),
    PAYMENT_1_AMOUNT: payments[0] ? money(payments[0].amount) : "",
    PAYMENT_2_DUE_DATE: paymentValue(1, "displayDueDate"),
    PAYMENT_2_AMOUNT: payments[1] ? money(payments[1].amount) : "",
    PAYMENT_3_DUE_DATE: paymentValue(2, "displayDueDate"),
    PAYMENT_3_AMOUNT: payments[2] ? money(payments[2].amount) : "",
    GRANT_ENABLED: Boolean(input.grantEnabled),
    ACCESSORY_ENABLED: categoryConfig.accessoryClause,
    PAYMENT_2_ENABLED: payments.length >= 2,
    PAYMENT_3_ENABLED: payments.length >= 3,
  };

  return {
    title,
    placeholders,
    commercial,
  };
}
