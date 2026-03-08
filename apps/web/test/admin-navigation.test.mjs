import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAdminHref,
  getAdminSectionNav,
  getDefaultAdminPath,
  getVisibleAdminDomains,
  normalizeAdminRoute,
} from "../src/lib/admin/navigation.mjs";

test("normalizeAdminRoute maps legacy access tab to the People invites route", () => {
  const result = normalizeAdminRoute({ pathname: "/admin", tab: "access", tier: "full", isEvp: false });

  assert.deepEqual(result, {
    pathname: "/admin/people/invites",
    hash: "",
    requestedTab: "access",
    requestedSection: null,
  });
});

test("normalizeAdminRoute maps legacy roles tab to the People assignments route", () => {
  const result = normalizeAdminRoute({ pathname: "/admin", tab: "roles", tier: "full", isEvp: false });

  assert.deepEqual(result, {
    pathname: "/admin/people/assignments",
    hash: "",
    requestedTab: "roles",
    requestedSection: null,
  });
});

test("normalizeAdminRoute falls back to the visible default when the requested route is not allowed", () => {
  const result = normalizeAdminRoute({ pathname: "/admin/people", tier: "partial", isEvp: false });

  assert.deepEqual(result, {
    pathname: "/admin/meetings",
    hash: "",
    requestedTab: null,
    requestedSection: null,
  });
});

test("normalizeAdminRoute converts meeting sections into stable anchors", () => {
  const result = normalizeAdminRoute({
    pathname: "/admin",
    tab: "meetings",
    section: "existing",
    tier: "read-only",
    isEvp: false,
  });

  assert.deepEqual(result, {
    pathname: "/admin/meetings",
    hash: "#admin-meetings-existing",
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

test("getDefaultAdminPath prefers People, then Office Hours, then Meetings", () => {
  assert.equal(getDefaultAdminPath({ tier: "full", isEvp: false }), "/admin/people");
  assert.equal(getDefaultAdminPath({ tier: "partial", isEvp: true }), "/admin/office-hours");
  assert.equal(getDefaultAdminPath({ tier: "read-only", isEvp: false }), "/admin/meetings");
});

test("getAdminSectionNav returns route-based People links", () => {
  assert.deepEqual(getAdminSectionNav("people"), [
    { id: "overview", label: "Overview", href: "/admin/people" },
    { id: "invites", label: "Invites", href: "/admin/people/invites" },
    { id: "assignments", label: "Assignments", href: "/admin/people/assignments" },
    { id: "terms", label: "Terms", href: "/admin/people/terms" },
    { id: "access_audit", label: "Access Audit", href: "/admin/people/access-audit" },
  ]);
});

test("getAdminSectionNav returns office-hours specialist links", () => {
  assert.deepEqual(getAdminSectionNav("office_hours"), [
    { id: "overview", label: "Overview", href: "/admin/office-hours" },
    { id: "sessions", label: "Sessions", href: "/admin/office-hours/sessions" },
    { id: "requirements", label: "Requirements", href: "/admin/office-hours/requirements" },
    { id: "config", label: "Config", href: "/admin/office-hours/config" },
    { id: "export", label: "Export", href: "/admin/office-hours/export" },
  ]);
});

test("buildAdminHref returns canonical People, Office Hours, and Meetings destinations", () => {
  assert.equal(buildAdminHref("people", "terms"), "/admin/people/terms");
  assert.equal(buildAdminHref("office_hours", "config"), "/admin/office-hours/config");
  assert.equal(buildAdminHref("meetings", "existing"), "/admin/meetings#admin-meetings-existing");
});
