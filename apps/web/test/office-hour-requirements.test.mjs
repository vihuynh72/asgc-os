import test from "node:test";
import assert from "node:assert/strict";

import { buildOfficeHourRequirementPayload } from "../src/lib/office-hour-requirements.mjs";

test("buildOfficeHourRequirementPayload applies governance defaults for missing rows", () => {
  const result = buildOfficeHourRequirementPayload({
    termId: "term-2026-spring",
    requirements: [
      {
        term_id: "term-2026-spring",
        role_key: "executive",
        weekly_total_hours: 12,
        weekly_in_office_hours: 0,
        effective_start: null,
        effective_end: null,
      },
      {
        term_id: "different-term",
        role_key: "board_member",
        weekly_total_hours: 20,
        weekly_in_office_hours: 0,
        effective_start: null,
        effective_end: null,
      },
    ],
  });

  assert.deepEqual(result, [
    { roleKey: "advisor", weeklyTotalHours: 0, weeklyInOfficeHours: 0 },
    { roleKey: "president", weeklyTotalHours: 10, weeklyInOfficeHours: 0 },
    { roleKey: "executive", weeklyTotalHours: 12, weeklyInOfficeHours: 0 },
    { roleKey: "board_member", weeklyTotalHours: 4, weeklyInOfficeHours: 0 },
    { roleKey: "volunteer", weeklyTotalHours: 0, weeklyInOfficeHours: 0 },
  ]);
});
