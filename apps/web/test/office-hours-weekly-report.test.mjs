import test from "node:test";
import assert from "node:assert/strict";

import {
  completionPercent,
  deriveRosterStatus,
  hoursFlagLabel,
  hoursStatusLabel,
  inferRoleLabel,
  reportStatusLabel,
  roleGroupLabel,
  roleKeyRank,
  sortWeeklyReportRows,
} from "../src/lib/office-hours-weekly-report.mjs";

test("inferRoleLabel does not classify VPs as President", () => {
  assert.equal(inferRoleLabel({ email: "asgc.vpfinance@gcccd.edu", roleKey: "executive" }), "Vice President of Finance");
  assert.equal(inferRoleLabel({ email: "asgc.execvp@gcccd.edu", roleKey: "executive" }), "Executive Vice President");
  assert.equal(inferRoleLabel({ email: "asgc.president@gcccd.edu", roleKey: "president" }), "President");
});

test("inferRoleLabel maps the board affairs executive title from legacy ASGC email patterns", () => {
  assert.equal(
    inferRoleLabel({ email: "asgc.dirboardaffairs@gcccd.edu", roleKey: "executive" }),
    "Director of Board Affairs",
  );
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
  assert.equal(roleKeyRank("advisor"), 0);
  assert.equal(roleGroupLabel("advisor"), "Advisors");
  assert.equal(roleGroupLabel("executive"), "Executives");
  assert.equal(roleGroupLabel("director"), "Board Members");
  assert.equal(roleGroupLabel("unknown"), "Members");
  assert.equal(reportStatusLabel("complete"), "Complete");
  assert.equal(reportStatusLabel("missing"), "Missing");
  assert.equal(reportStatusLabel("not_required"), "Not required");
});

test("sortWeeklyReportRows keeps advisors ahead of all term-scoped Office Hours roles", () => {
  const rows = [
    {
      user_id: "1",
      week_start: "2026-04-06",
      role_key: "volunteer",
      email: "volunteer@gcccd.edu",
      role: "Volunteer",
      name: "Volunteer Person",
      required_hours: 0,
      total_hours: 0,
      missing_hours: 0,
    },
    {
      user_id: "2",
      week_start: "2026-04-06",
      role_key: "advisor",
      email: "advisor@gcccd.edu",
      role: "Advisor",
      name: "Advisor Person",
      required_hours: 0,
      total_hours: 0,
      missing_hours: 0,
    },
    {
      user_id: "3",
      week_start: "2026-04-06",
      role_key: "president",
      email: "president@gcccd.edu",
      role: "President",
      name: "President Person",
      required_hours: 10,
      total_hours: 3,
      missing_hours: 7,
    },
  ];

  const sorted = sortWeeklyReportRows(rows);
  assert.deepEqual(
    sorted.map((row) => row.role_key),
    ["advisor", "president", "volunteer"],
  );
});

test("inferRoleLabel returns advisor for the global advisor bucket", () => {
  assert.equal(inferRoleLabel({ email: "advisor@gcccd.edu", roleKey: "advisor" }), "Advisor");
});

test("completionPercent handles required and not-required rows", () => {
  assert.equal(completionPercent({ required_hours: 10, total_hours: 2.5 }), 0.25);
  assert.equal(completionPercent({ required_hours: 0, total_hours: 0 }), 1);
  assert.equal(completionPercent({ required_hours: 10, total_hours: 14 }), 1);
});

test("deriveRosterStatus maps vacant and no-show rows", () => {
  assert.equal(deriveRosterStatus({ name: "", required_hours: 6, total_hours: 0 }), "vacant");
  assert.equal(deriveRosterStatus({ name: "Ciana Garcia", required_hours: 6, total_hours: 0 }), "no_show");
  assert.equal(deriveRosterStatus({ name: "Ciana Garcia", required_hours: 6, total_hours: 1 }), "assigned");
});

test("hoursStatusLabel and hoursFlagLabel distinguish vacant/no-show from generic missing", () => {
  assert.equal(hoursStatusLabel({ statusKey: "missing", memberStatus: "vacant" }), "Vacant slot");
  assert.equal(hoursFlagLabel({ statusKey: "missing", memberStatus: "vacant" }), "⚪ Vacant slot");

  assert.equal(hoursStatusLabel({ statusKey: "missing", memberStatus: "no_show" }), "No show");
  assert.equal(hoursFlagLabel({ statusKey: "missing", memberStatus: "no_show" }), "🛑 No show");

  assert.equal(hoursStatusLabel({ statusKey: "missing", memberStatus: "assigned" }), "Missing");
  assert.equal(hoursFlagLabel({ statusKey: "missing", memberStatus: "assigned" }), "❌ Missing");
});
