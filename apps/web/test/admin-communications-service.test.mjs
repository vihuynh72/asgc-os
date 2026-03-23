import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdminCommunicationSendInput,
  getDefaultAdminCommunicationSelection,
} from "../src/lib/admin/communications-service.mjs";
import { getAdminCommunicationsAccess } from "../src/lib/admin/communications.mjs";

test("getDefaultAdminCommunicationSelection prefers the requested group when it is allowed", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });

  assert.deepEqual(getDefaultAdminCommunicationSelection({ access, preferredGroupId: "office_hours" }), {
    groupId: "office_hours",
    templateId: "office_hours_weekly_reminder",
    mode: "sample",
    scenarioId: "default",
  });
});

test("buildAdminCommunicationSendInput always targets the signed-in admin email", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });
  const result = buildAdminCommunicationSendInput({
    access,
    actorUserId: "admin-user-1",
    recipientEmail: "admin@gcccd.edu",
    templateId: "auth_signin_code",
    mode: "sample",
    scenarioId: "default",
    origin: "https://asgc.app",
  });

  assert.equal(result.toEmail, "admin@gcccd.edu");
  assert.equal(result.notification.type, "admin.communication_test");
  assert.equal(result.notification.channel, "email");
  assert.equal(result.notification.metadata.template_id, "auth_signin_code");
  assert.equal(result.notification.metadata.mode, "sample");
  assert.equal(result.notification.metadata.scenario_id, "default");
  assert.match(result.email.subject, /sign-in code/i);
});

test("buildAdminCommunicationSendInput records the selected real-data source", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });
  const result = buildAdminCommunicationSendInput({
    access,
    actorUserId: "admin-user-1",
    recipientEmail: "admin@gcccd.edu",
    templateId: "office_hours_weekly_reminder",
    mode: "real",
    source: {
      id: "weekly:user-1:2026-03-23",
      templateId: "office_hours_weekly_reminder",
      sourceType: "office_hours_weekly",
      label: "Alex • 2026-03-23",
      description: "Week of 2026-03-23",
      data: {
        week_start: "2026-03-23",
        week_end: "2026-03-27",
        required_total_minutes: 480,
        total_minutes: 300,
        deficit_minutes: 180,
      },
    },
    origin: "https://asgc.app",
  });

  assert.equal(result.notification.metadata.mode, "real");
  assert.equal(result.notification.metadata.source_id, "weekly:user-1:2026-03-23");
  assert.equal(result.preview.mode, "real");
  assert.equal(result.preview.source?.id, "weekly:user-1:2026-03-23");
});

test("buildAdminCommunicationSendInput blocks send attempts for preview-only access", () => {
  const access = getAdminCommunicationsAccess({ tier: "read-only", isEvp: false });

  assert.throws(
    () =>
      buildAdminCommunicationSendInput({
        access,
        actorUserId: "admin-user-1",
        recipientEmail: "admin@gcccd.edu",
        templateId: "office_hours_weekly_reminder",
        mode: "sample",
        scenarioId: "default",
        origin: "https://asgc.app",
      }),
    /forbidden/,
  );
});
