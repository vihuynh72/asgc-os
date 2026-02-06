import test from "node:test";
import assert from "node:assert/strict";

import {
  completionPercent,
  inferRoleLabel,
  reportStatusLabel,
  roleGroupLabel,
  sortWeeklyReportRows,
} from "../src/lib/office-hours-weekly-report.mjs";

test("inferRoleLabel does not classify VPs as President", () => {
  assert.equal(inferRoleLabel({ email: "asgc.vpfinance@gcccd.edu", roleKey: "executive" }), "Vice President of Finance");
  assert.equal(inferRoleLabel({ email: "asgc.president@gcccd.edu", roleKey: "president" }), "President");
});

test("sortWeeklyReportRows orders president before executives (even if executive contains 'President')", () => {
  const rows = [
    {
      user_id: "1",
      week_start: "2026-01-26",
      role_key: "executive",
      email: "asgc.vpfinance@gcccd.edu",
      role: "Vice President of Finance",
      name: "Khaley Kaesser",
      required_hours: 8,
      total_hours: 0,
      missing_hours: 8,
    },
    {
      user_id: "2",
      week_start: "2026-01-26",
      role_key: "president",
      email: "asgc.president@gcccd.edu",
      role: "President",
      name: "Vi Huynh",
      required_hours: 10,
      total_hours: 4.12,
      missing_hours: 5.88,
    },
  ];

  const sorted = sortWeeklyReportRows(rows);
  assert.equal(sorted[0].role_key, "president");
  assert.equal(sorted[0].name, "Vi Huynh");
});

test("sortWeeklyReportRows orders board members by number when present", () => {
  const rows = [
    { user_id: "1", week_start: "2026-01-26", role_key: "board_member", email: "asgc.boardmember4@gcccd.edu", role: "Board Member 4" },
    { user_id: "2", week_start: "2026-01-26", role_key: "board_member", email: "asgc.boardmember1@gcccd.edu", role: "Board Member 1" },
    { user_id: "3", week_start: "2026-01-26", role_key: "board_member", email: "asgc.boardmember12@gcccd.edu", role: "Board Member 12" },
  ];

  const sorted = sortWeeklyReportRows(rows);
  assert.deepEqual(
    sorted.map((r) => r.role),
    ["Board Member 1", "Board Member 4", "Board Member 12"],
  );
});

test("roleGroupLabel and reportStatusLabel return human-friendly labels", () => {
  assert.equal(roleGroupLabel("executive"), "Executives");
  assert.equal(roleGroupLabel("unknown"), "Members");
  assert.equal(reportStatusLabel("complete"), "Complete");
  assert.equal(reportStatusLabel("missing"), "Missing");
  assert.equal(reportStatusLabel("not_required"), "Not required");
});

test("completionPercent handles required and not-required rows", () => {
  assert.equal(completionPercent({ required_hours: 10, total_hours: 2.5 }), 0.25);
  assert.equal(completionPercent({ required_hours: 0, total_hours: 0 }), 1);
  assert.equal(completionPercent({ required_hours: 10, total_hours: 14 }), 1);
});
