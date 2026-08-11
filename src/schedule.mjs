const DAY_MS = 86_400_000;

function isoDate(value, label) {
  const normalized = String(value ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${label} must use YYYY-MM-DD.`);
  }
  const date = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== normalized) {
    throw new Error(`${label} is invalid.`);
  }
  return date;
}

function toIso(date) {
  return date.toISOString().slice(0, 10);
}

export function splitPaymentAmounts(balance, installments = 3) {
  const count = Number(installments);
  const total = Math.round(Number(balance) * 100) / 100;
  if (!Number.isFinite(total) || total <= 0) throw new Error("Remaining balance must be greater than $0.");
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("Installments must be between one and three.");
  if (count === 1) return [total];

  const average = total / count;
  if (Number.isInteger(average)) return Array(count).fill(average);

  for (const roundingUnit of [500, 100, 50, 10, 1]) {
    const laterPayment = Math.floor(average / roundingUnit) * roundingUnit;
    const firstPayment = Math.round((total - laterPayment * (count - 1)) * 100) / 100;
    if (laterPayment > 0 && firstPayment >= laterPayment && firstPayment <= laterPayment * 1.5) {
      return [firstPayment, ...Array(count - 1).fill(laterPayment)];
    }
  }

  const laterPayment = Math.floor(average * 100) / 100;
  const firstPayment = Math.round((total - laterPayment * (count - 1)) * 100) / 100;
  return [firstPayment, ...Array(count - 1).fill(laterPayment)];
}

export function calculateDueDates({ sendDate, eventMonth, installments = 3 }) {
  const count = Number(installments);
  if (!Number.isInteger(count) || count < 1 || count > 3) throw new Error("Installments must be between one and three.");
  if (!/^\d{4}-\d{2}$/.test(String(eventMonth ?? ""))) {
    throw new Error("Event month must use YYYY-MM.");
  }
  const sent = isoDate(sendDate, "Send date");
  const firstDue = new Date(sent.valueOf() + 7 * DAY_MS);
  const eventStart = isoDate(`${eventMonth}-01`, "Event month");
  if (eventStart <= firstDue) {
    throw new Error("Event month must be after the first payment due date.");
  }
  const availableDays = Math.round((eventStart - firstDue) / DAY_MS);
  return Array.from({ length: count }, (_, index) => {
    const offset = Math.round((availableDays * index) / count);
    return toIso(new Date(firstDue.valueOf() + offset * DAY_MS));
  });
}
