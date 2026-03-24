import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOfficeHoursOverviewModel,
  buildOfficeHoursSessionsWorkspaceModel,
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

test("buildOfficeHoursSessionsWorkspaceModel merges shifts and sessions into week lanes", () => {
  const model = buildOfficeHoursSessionsWorkspaceModel({
    weekStart: "2026-03-23",
    todayDate: "2026-03-24",
    nowIso: "2026-03-24T19:15:00.000Z",
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
        role_key: "vp",
        role: "Vice President",
        name: "Jamie",
        email: "jamie@gcccd.edu",
        required_hours: 8,
        total_hours: 8,
        missing_hours: 0,
        needs_review_sessions: 0,
        member_status: "assigned",
      },
    ],
    shifts: [
      {
        id: "sh-open",
        user_id: "u1",
        user_display_name: "Alex",
        user_email: "alex@gcccd.edu",
        office_location_id: "loc-1",
        office_location_name: "ASGC Office",
        office_location_timezone: "America/Los_Angeles",
        starts_at: "2026-03-24T18:00:00.000Z",
        ends_at: "2026-03-24T20:00:00.000Z",
        status: "scheduled",
        covered_by_user_id: null,
        covered_by_display_name: "",
        covered_by_email: "",
        open_coverage_request_count: 0,
        claimed_coverage_request_count: 0,
      },
      {
        id: "sh-missed",
        user_id: "u2",
        user_display_name: "Jamie",
        user_email: "jamie@gcccd.edu",
        office_location_id: "loc-1",
        office_location_name: "ASGC Office",
        office_location_timezone: "America/Los_Angeles",
        starts_at: "2026-03-24T17:00:00.000Z",
        ends_at: "2026-03-24T18:00:00.000Z",
        status: "scheduled",
        covered_by_user_id: null,
        covered_by_display_name: "",
        covered_by_email: "",
        open_coverage_request_count: 1,
        claimed_coverage_request_count: 0,
      },
      {
        id: "sh-future",
        user_id: "u2",
        user_display_name: "Jamie",
        user_email: "jamie@gcccd.edu",
        office_location_id: "loc-1",
        office_location_name: "ASGC Office",
        office_location_timezone: "America/Los_Angeles",
        starts_at: "2026-03-25T18:00:00.000Z",
        ends_at: "2026-03-25T19:00:00.000Z",
        status: "scheduled",
        covered_by_user_id: "u3",
        covered_by_display_name: "Taylor",
        covered_by_email: "taylor@gcccd.edu",
        open_coverage_request_count: 0,
        claimed_coverage_request_count: 1,
      },
    ],
    sessions: [
      {
        id: "sess-open",
        user_id: "u1",
        office_location_id: "loc-1",
        office_location_name: "ASGC Office",
        office_location_timezone: "America/Los_Angeles",
        user_display_name: "Alex",
        user_email: "alex@gcccd.edu",
        checkin_at: "2026-03-24T18:10:00.000Z",
        checkout_at: null,
        status: "open",
        duration_minutes: null,
      },
      {
        id: "sess-closed",
        user_id: "u2",
        office_location_id: "loc-1",
        office_location_name: "ASGC Office",
        office_location_timezone: "America/Los_Angeles",
        user_display_name: "Jamie",
        user_email: "jamie@gcccd.edu",
        checkin_at: "2026-03-23T18:00:00.000Z",
        checkout_at: "2026-03-23T19:00:00.000Z",
        status: "closed",
        duration_minutes: 60,
      },
      {
        id: "sess-unscheduled",
        user_id: "u3",
        office_location_id: "loc-1",
        office_location_name: "ASGC Office",
        office_location_timezone: "America/Los_Angeles",
        user_display_name: "Taylor",
        user_email: "taylor@gcccd.edu",
        checkin_at: "2026-03-24T16:30:00.000Z",
        checkout_at: "2026-03-24T17:20:00.000Z",
        status: "closed",
        duration_minutes: 50,
      },
    ],
  });

  assert.equal(model.today.date, "2026-03-24");
  assert.equal(model.today.openSessions.length, 1);
  assert.equal(model.today.upcomingShifts.length, 0);
  assert.equal(model.today.blockers.length, 2);
  assert.deepEqual(
    model.today.blockers.map((blocker) => blocker.kind),
    ["coverage_request", "review_flag"],
  );

  const todayColumn = model.days.find((day) => day.date === "2026-03-24");
  assert.equal(todayColumn?.isToday, true);
  assert.equal(todayColumn?.lanes.length, 3);

  const missingLane = todayColumn?.lanes.find((lane) => lane.userId === "u2");
  const openLane = todayColumn?.lanes.find((lane) => lane.userId === "u1");
  const unscheduledLane = todayColumn?.lanes.find((lane) => lane.userId === "u3");

  assert.equal(missingLane?.sessionState, "no_session_yet");
  assert.equal(missingLane?.coverageState, "coverage_requested");
  assert.equal(openLane?.sessionState, "checked_in_now");
  assert.equal(openLane?.hasShift, true);
  assert.equal(unscheduledLane?.sessionState, "completed_today");
  assert.equal(unscheduledLane?.isUnscheduledSession, true);
  assert.equal(unscheduledLane?.hasShift, false);

  const futureColumn = model.days.find((day) => day.date === "2026-03-25");
  assert.equal(futureColumn?.lanes[0]?.coverageState, "covered");

  assert.equal(model.performanceRows[0]?.user_id, "u1");
});
