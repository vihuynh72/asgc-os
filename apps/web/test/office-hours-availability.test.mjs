import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeOfficeHoursAllowedWeekdays,
  normalizeOfficeHoursExtraAllowedDates,
} from "../src/lib/office-hours-availability.mjs";

test("normalizeOfficeHoursAllowedWeekdays sorts and dedupes", () => {
  const next = normalizeOfficeHoursAllowedWeekdays([5, 1, 3, 3, 2]);
  assert.deepEqual(next, [1, 2, 3, 5]);
});

test("normalizeOfficeHoursAllowedWeekdays rejects empty", () => {
  assert.throws(() => normalizeOfficeHoursAllowedWeekdays([]), /invalid_weekdays/);
});

test("normalizeOfficeHoursAllowedWeekdays rejects out of range", () => {
  assert.throws(() => normalizeOfficeHoursAllowedWeekdays([0, 1]), /invalid_weekdays/);
  assert.throws(() => normalizeOfficeHoursAllowedWeekdays([8]), /invalid_weekdays/);
});

test("normalizeOfficeHoursExtraAllowedDates sorts and dedupes", () => {
  const next = normalizeOfficeHoursExtraAllowedDates(["2026-02-07", "2026-02-01", "2026-02-07"]);
  assert.deepEqual(next, ["2026-02-01", "2026-02-07"]);
});

test("normalizeOfficeHoursExtraAllowedDates rejects invalid date strings", () => {
  assert.throws(() => normalizeOfficeHoursExtraAllowedDates(["02/01/2026"]), /invalid_dates/);
  assert.throws(() => normalizeOfficeHoursExtraAllowedDates(["2026-13-01"]), /invalid_dates/);
  assert.throws(() => normalizeOfficeHoursExtraAllowedDates(["2026-02-30"]), /invalid_dates/);
});

