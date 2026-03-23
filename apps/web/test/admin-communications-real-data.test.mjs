import test from "node:test";
import assert from "node:assert/strict";

import {
  buildOfficeHoursSessionRealSource,
  parseAdminCommunicationSourceId,
} from "../src/lib/admin/communications-real-data.mjs";

test("parseAdminCommunicationSourceId understands weekly, session, and notification ids", () => {
  assert.deepEqual(parseAdminCommunicationSourceId("weekly:user-1:2026-03-23"), {
    kind: "weekly",
    primaryId: "user-1",
    secondaryId: "2026-03-23",
  });
  assert.deepEqual(parseAdminCommunicationSourceId("session:session-1"), {
    kind: "session",
    primaryId: "session-1",
    secondaryId: null,
  });
  assert.deepEqual(parseAdminCommunicationSourceId("notification:note-1"), {
    kind: "notification",
    primaryId: "note-1",
    secondaryId: null,
  });
  assert.equal(parseAdminCommunicationSourceId("bad"), null);
});

test("buildOfficeHoursSessionRealSource derives live reminder metadata from a real open session", () => {
  const source = buildOfficeHoursSessionRealSource({
    templateId: "office_hours_session_checkout_reminder",
    session: {
      id: "session-1",
      user_id: "user-1",
      checkin_at: "2026-03-22T17:00:00.000Z",
      checkout_at: null,
    },
    memberLabel: "Alex",
    officeTz: "America/Los_Angeles",
    maxSessionHours: 8,
    nowIso: "2026-03-22T19:05:00.000Z",
  });

  assert.equal(source.id, "session:session-1");
  assert.equal(source.templateId, "office_hours_session_checkout_reminder");
  assert.equal(source.sourceType, "office_hours_session");
  assert.equal(source.label, "Alex");
  assert.match(source.description, /session-1/i);
  assert.equal(source.data.elapsed_minutes, 125);
  assert.equal(source.data.office_tz, "America/Los_Angeles");
  assert.match(source.data.checkin_at_local, /2026-03-22 10:00/);
  assert.match(source.data.auto_close_at_local, /2026-03-22 18:00/);
});

test("buildOfficeHoursSessionRealSource derives an auto-closed notice from a closed session", () => {
  const source = buildOfficeHoursSessionRealSource({
    templateId: "office_hours_session_auto_closed",
    session: {
      id: "session-2",
      user_id: "user-1",
      checkin_at: "2026-03-22T17:00:00.000Z",
      checkout_at: "2026-03-23T01:00:00.000Z",
    },
    memberLabel: "Alex",
    officeTz: "America/Los_Angeles",
    maxSessionHours: 8,
    nowIso: "2026-03-23T01:10:00.000Z",
  });

  assert.equal(source.id, "session:session-2");
  assert.equal(source.data.checkin_at_local, "2026-03-22 10:00");
  assert.equal(source.data.checkout_at_local, "2026-03-22 18:00");
  assert.equal(source.data.office_tz, "America/Los_Angeles");
});
