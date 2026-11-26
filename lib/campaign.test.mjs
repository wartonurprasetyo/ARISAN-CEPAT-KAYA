import assert from "node:assert/strict";
import { test } from "node:test";
import { monthLabels } from "./campaign.ts";

test("monthLabels makes 10 consecutive months across a year boundary", () => {
  const labels = monthLabels("2026-11");
  assert.equal(labels.length, 10);
  assert.deepEqual(labels.slice(0, 3), ["November 2026", "Desember 2026", "Januari 2027"]);
  assert.equal(labels[9], "Agustus 2027");
});
