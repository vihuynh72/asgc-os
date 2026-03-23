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

  assert.equal(access.canAccess, true);
  assert.equal(access.canSend, true);
  assert.deepEqual(groups.map((group) => group.id), ["auth", "office_hours", "people_system"]);
  assert.ok(templates.some((template) => template.id === "auth_signin_code"));
  assert.ok(templates.some((template) => template.id === "office_hours_session_checkout_reminder"));
  assert.ok(templates.some((template) => template.id === "people_role_update"));
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
    scenarioId: "default",
    origin: "https://asgc.app",
  });

  assert.equal(preview.group.id, "auth");
  assert.equal(preview.template.id, "auth_signin_code");
  assert.equal(preview.scenario.id, "default");
  assert.equal(preview.email.subject, "ASGC OS sign-in code");
  assert.match(preview.email.text, /Code: 246813/);
  assert.match(preview.email.html ?? "", /246813|2<\/td>/);
});

test("preview returns office-hours html reminders with actionable copy", () => {
  const access = getAdminCommunicationsAccess({ tier: "full", isEvp: false });
  const preview = buildAdminCommunicationPreview({
    access,
    templateId: "office_hours_session_checkout_reminder",
    scenarioId: "default",
    origin: "https://asgc.app",
  });

  assert.equal(preview.group.id, "office_hours");
  assert.match(preview.email.subject, /still open/i);
  assert.match(preview.email.text, /Open Office Hours: https:\/\/asgc\.app\/office-hours/);
  assert.match(preview.email.html ?? "", /Open Office Hours/);
});

test("preview rejects templates outside the caller permission scope", () => {
  const access = getAdminCommunicationsAccess({ tier: "partial", isEvp: true });

  assert.throws(
    () =>
      buildAdminCommunicationPreview({
        access,
        templateId: "auth_signin_code",
        scenarioId: "default",
        origin: "https://asgc.app",
      }),
    /forbidden/,
  );
});
