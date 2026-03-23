import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdminCommunicationPreview,
  getAdminCommunicationTemplateGroups,
  getAdminCommunicationTemplates,
  getAdminCommunicationsAccess,
} from "../src/lib/admin/communications.mjs";

test("full admins can preview and send every communications template", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });
  const groups = getAdminCommunicationTemplateGroups(access);
  const templates = getAdminCommunicationTemplates(access);
  const authTemplate = templates.find((template) => template.id === "auth_signin_code");
  const officeHoursTemplate = templates.find((template) => template.id === "office_hours_session_checkout_reminder");

  assert.equal(access.canAccess, true);
  assert.equal(access.canSend, true);
  assert.deepEqual(groups.map((group) => group.id), ["auth", "office_hours", "people_system"]);
  assert.ok(templates.some((template) => template.id === "auth_signin_code"));
  assert.ok(templates.some((template) => template.id === "office_hours_session_checkout_reminder"));
  assert.ok(templates.some((template) => template.id === "people_role_update"));
  assert.deepEqual(authTemplate?.supportedModes, ["sample"]);
  assert.deepEqual(officeHoursTemplate?.supportedModes, ["sample", "real"]);
  assert.equal(officeHoursTemplate?.sourceType, "office_hours_session");
});

test("office-hours partial admins only see office-hours templates and can still send test emails to self", () => {
  const access = getAdminCommunicationsAccess({ tier: "partial", isEvp: true });
  const groups = getAdminCommunicationTemplateGroups(access);
  const templates = getAdminCommunicationTemplates(access);

  assert.equal(access.canAccess, true);
  assert.equal(access.canSend, true);
  assert.deepEqual(groups.map((group) => group.id), ["office_hours"]);
  assert.ok(templates.every((template) => template.groupId === "office_hours"));
});

test("read-only admins can preview office-hours templates but cannot send", () => {
  const access = getAdminCommunicationsAccess({ tier: "read-only", isEvp: false });
  const templates = getAdminCommunicationTemplates(access);

  assert.equal(access.canAccess, true);
  assert.equal(access.canSend, false);
  assert.ok(templates.length > 0);
  assert.ok(templates.every((template) => template.groupId === "office_hours"));
});

test("preview returns the real email output and html for auth sign-in code", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });
  const preview = buildAdminCommunicationPreview({
    access,
    templateId: "auth_signin_code",
    mode: "sample",
    scenarioId: "default",
    origin: "https://asgc.app",
  });

  assert.equal(preview.group.id, "auth");
  assert.equal(preview.template.id, "auth_signin_code");
  assert.equal(preview.mode, "sample");
  assert.equal(preview.scenario.id, "default");
  assert.equal(preview.email.subject, "ASGC OS sign-in code");
  assert.match(preview.email.text, /Your ASGC OS sign-in code is 246813/);
  assert.match(preview.email.html ?? "", />246813</);
});

test("preview returns office-hours html reminders with actionable copy", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });
  const preview = buildAdminCommunicationPreview({
    access,
    templateId: "office_hours_session_checkout_reminder",
    mode: "sample",
    scenarioId: "default",
    origin: "https://asgc.app",
  });

  assert.equal(preview.group.id, "office_hours");
  assert.equal(preview.mode, "sample");
  assert.match(preview.email.subject, /still open/i);
  assert.match(preview.email.text, /Open Office Hours: https:\/\/asgc\.app\/office-hours/);
  assert.match(preview.email.html ?? "", /Open Office Hours/);
});

test("preview rejects real mode for sample-only auth templates", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });

  assert.throws(
    () =>
      buildAdminCommunicationPreview({
        access,
        templateId: "auth_signin_code",
        mode: "real",
        origin: "https://asgc.app",
        source: {
          id: "source-1",
          templateId: "auth_signin_code",
          sourceType: "auth",
          label: "Source",
          description: "Source",
          data: {},
        },
      }),
    /real_mode_not_supported/,
  );
});

test("preview requires an explicit source in real-data mode", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });

  assert.throws(
    () =>
      buildAdminCommunicationPreview({
        access,
        templateId: "office_hours_session_checkout_reminder",
        mode: "real",
        origin: "https://asgc.app",
      }),
    /source_required/,
  );
});

test("preview can render a real weekly-hours reminder from live source data", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });
  const preview = buildAdminCommunicationPreview({
    access,
    templateId: "office_hours_weekly_reminder",
    mode: "real",
    origin: "https://asgc.app",
    source: {
      id: "weekly:user-1:2026-03-23",
      templateId: "office_hours_weekly_reminder",
      sourceType: "office_hours_weekly",
      label: "Alex • 2026-03-23",
      description: "Week of 2026-03-23",
      data: {
        week_start: "2026-03-23",
        week_end: "2026-03-27",
        required_total_minutes: 600,
        total_minutes: 355,
        deficit_minutes: 245,
      },
    },
  });

  assert.equal(preview.mode, "real");
  assert.equal(preview.source?.id, "weekly:user-1:2026-03-23");
  assert.equal(preview.source?.sourceType, "office_hours_weekly");
  assert.match(preview.email.text, /Required total: 10h 0m/);
  assert.match(preview.email.text, /Completed total: 5h 55m/);
  assert.match(preview.email.text, /Remaining total: 4h 5m/);
});

test("preview rejects templates outside the caller permission scope", () => {
  const access = getAdminCommunicationsAccess({ tier: "partial", isEvp: true });

  assert.throws(
    () =>
      buildAdminCommunicationPreview({
        access,
        templateId: "auth_signin_code",
        mode: "sample",
        scenarioId: "default",
        origin: "https://asgc.app",
      }),
    /forbidden/,
  );
});
