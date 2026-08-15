import test from "node:test";
import assert from "node:assert/strict";

import { selectFashionWeekCategory } from "../public/family-fields.mjs";

test("selects the canonical UI category for imported workbook aliases", () => {
  const categories = [
    { id: "Clothing", aliases: ["clothing"] },
    { id: "Accessory", aliases: ["accessory", "acc"] },
  ];
  assert.equal(selectFashionWeekCategory("Acc", categories), "Accessory");
  assert.equal(selectFashionWeekCategory("Clothing", categories), "Clothing");
});
