import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOfficeHoursOverviewModel,
  getOfficeHourShiftActionState,
} from "../src/lib/office-hours-admin-workspace.mjs";

test("buildOfficeHoursOverviewModel summarizes weekly performance, live sessions, and schedule pulse", () => {
  const model = buildOfficeHoursOverviewModel({
    weekRows: [
      {
        user_id: "u1",
        week_start: "2026-03-23",
        role_key: "president",
        role: "President",
        name: "Alex",
        email: "alex@gcccd.edu",
        required_hours: 10,
        total_hours: 8,
        missing_hours: 2,
        needs_review_sessions: 1,
        member_status: "assigned",
      },
      {
        user_id: "u2",
        week_start: "2026-03-23",
        role_key: "executive",
        role: "Vice President",
        name: "Jamie",
        email: "jamie@gcccd.edu",
        required_hours: 8,
        total_hours: 8,
        missing_hours: 0,
        needs_review_sessions: 0,
        member_status: "assigned",
      },
      {
        user_id: "u3",
        week_start: "2026-03-23",
        role_key: "board_member",
        role: "Board Member 1",
        name: "",
        email: "boardmember1@gcccd.edu",
        required_hours: 4,
        total_hours: 0,
        missing_hours: 4,
        needs_review_sessions: 0,
        member_status: "vacant",
      },
    ],
    sessions: [
      { id: "s1", status: "open", checkout_at: null, duration_minutes: null, admin_closed_by: null, user_display_name: "Alex" },
      { id: "s2", status: "auto_closed", checkout_at: "2026-03-24T18:00:00.000Z", duration_minutes: 110, admin_closed_by: null, user_display_name: "Jamie" },
      { id: "s3", status: "closed", checkout_at: "2026-03-24T16:00:00.000Z", duration_minutes: 95, admin_closed_by: "admin-1", user_display_name: "Taylor" },
    ],
    shifts: [
      { id: "sh1", status: "scheduled", covered_by_user_id: null, open_coverage_request_count: 1, claimed_coverage_request_count: 0, starts_at: "2026-03-25T18:00:00.000Z" },
      { id: "sh2", status: "cancelled", covered_by_user_id: null, open_coverage_request_count: 0, claimed_coverage_request_count: 0, starts_at: "2026-03-26T18:00:00.000Z" },
      { id: "sh3", status: "scheduled", covered_by_user_id: "cover-1", open_coverage_request_count: 0, claimed_coverage_request_count: 1, starts_at: "2026-03-27T18:00:00.000Z" },
    ],
  });

  assert.equal(model.stats.completionRateLabel, "73%");
  assert.equal(model.stats.membersBehind, 1);
  assert.equal(model.stats.openSessions, 1);
  assert.equal(model.stats.trackedMinutes, 205);
  assert.equal(model.stats.attentionItems, 3);
  assert.equal(model.liveOperations.openSessions.length, 1);
  assert.equal(model.liveOperations.recentExceptions.length, 2);
  assert.equal(model.schedulePulse.scheduledCount, 2);
  assert.equal(model.schedulePulse.cancelledCount, 1);
  assert.equal(model.schedulePulse.coveredCount, 1);
  assert.equal(model.schedulePulse.openCoverageRequests, 1);
});

test("getOfficeHourShiftActionState only allows editing and cancelling future scheduled shifts", () => {
  assert.deepEqual(
    getOfficeHourShiftActionState(
      { status: "scheduled", starts_at: "2026-03-25T18:00:00.000Z" },
      "2026-03-24T12:00:00.000Z",
    ),
    { canEdit: true, canCancel: true },
  );

  assert.deepEqual(
    getOfficeHourShiftActionState(
      { status: "scheduled", starts_at: "2026-03-24T11:00:00.000Z" },
      "2026-03-24T12:00:00.000Z",
    ),
    { canEdit: false, canCancel: false },
  );

  assert.deepEqual(
    getOfficeHourShiftActionState(
      { status: "cancelled", starts_at: "2026-03-25T18:00:00.000Z" },
      "2026-03-24T12:00:00.000Z",
    ),
    { canEdit: false, canCancel: false },
  );
});
