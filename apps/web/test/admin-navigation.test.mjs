import test from "node:test";
import assert from "node:assert/strict";

import {
  getDefaultAdminLocation,
  getVisibleAdminDomains,
  normalizeAdminLocation,
} from "../src/lib/admin-navigation.mjs";

test("normalizeAdminLocation maps legacy access tab to People invites", () => {
  const result = normalizeAdminLocation({ tab: "access", tier: "full", isEvp: false });

  assert.deepEqual(result, {
    tab: "people",
    section: "invites",
    requestedTab: "access",
    requestedSection: null,
  });
});

test("normalizeAdminLocation maps legacy roles tab to People assignments", () => {
  const result = normalizeAdminLocation({ tab: "roles", tier: "full", isEvp: false });

  assert.deepEqual(result, {
    tab: "people",
    section: "assignments",
    requestedTab: "roles",
    requestedSection: null,
  });
});

test("normalizeAdminLocation falls back to visible default when requested tab is not allowed", () => {
  const result = normalizeAdminLocation({ tab: "people", tier: "partial", isEvp: false });

  assert.deepEqual(result, {
    tab: "meetings",
    section: "upcoming",
    requestedTab: "people",
    requestedSection: null,
  });
});

test("normalizeAdminLocation honors valid subsection overrides", () => {
  const result = normalizeAdminLocation({
    tab: "meetings",
    section: "existing",
    tier: "read-only",
    isEvp: false,
  });

  assert.deepEqual(result, {
    tab: "meetings",
    section: "existing",
    requestedTab: "meetings",
    requestedSection: "existing",
  });
});

test("getVisibleAdminDomains merges People for full admins and hides office hours unless eligible", () => {
  assert.deepEqual(getVisibleAdminDomains({ tier: "full", isEvp: false }), ["people", "office_hours", "meetings"]);
  assert.deepEqual(getVisibleAdminDomains({ tier: "partial", isEvp: true }), ["office_hours", "meetings"]);
  assert.deepEqual(getVisibleAdminDomains({ tier: "partial", isEvp: false }), ["meetings"]);
  assert.deepEqual(getVisibleAdminDomains({ tier: "read-only", isEvp: true }), ["meetings"]);
});

test("getDefaultAdminLocation prefers People, then Office Hours, then Meetings", () => {
  assert.deepEqual(getDefaultAdminLocation({ tier: "full", isEvp: false }), {
    tab: "people",
    section: "invites",
  });
  assert.deepEqual(getDefaultAdminLocation({ tier: "partial", isEvp: true }), {
    tab: "office_hours",
    section: "summary",
  });
  assert.deepEqual(getDefaultAdminLocation({ tier: "read-only", isEvp: false }), {
    tab: "meetings",
    section: "upcoming",
  });
});
