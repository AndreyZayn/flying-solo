import test from "node:test";
import assert from "node:assert/strict";

import { calculateDueDates, splitPaymentAmounts } from "../src/schedule.mjs";

test("front-loads the first payment and keeps later payments rounded", () => {
  assert.deepEqual(splitPaymentAmounts(4900, 3), [1900, 1500, 1500]);
  assert.equal(splitPaymentAmounts(4900, 3).reduce((sum, amount) => sum + amount, 0), 4900);
});

test("keeps evenly divisible and custom balances in whole rounded dollars", () => {
  assert.deepEqual(splitPaymentAmounts(6900, 3), [2300, 2300, 2300]);
  assert.deepEqual(splitPaymentAmounts(2900, 3), [1100, 900, 900]);
});

test("calculates send plus seven days then distributes later dates before the event month", () => {
  assert.deepEqual(calculateDueDates({
    sendDate: "2026-08-09",
    eventMonth: "2027-02",
    installments: 3,
  }), ["2026-08-16", "2026-10-11", "2026-12-07"]);
});

test("rejects an event month that does not leave room after the first due date", () => {
  assert.throws(
    () => calculateDueDates({ sendDate: "2027-01-28", eventMonth: "2027-02", installments: 3 }),
    /must be after the first payment due date/,
  );
});
