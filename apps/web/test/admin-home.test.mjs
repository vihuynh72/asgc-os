import test from "node:test";
import assert from "node:assert/strict";

import { buildAdminHomeViewModel } from "../src/lib/admin/home.mjs";

test("buildAdminHomeViewModel shapes headline-only cards and separate issues", () => {
  const result = buildAdminHomeViewModel({
    tier: "full",
    isEvp: false,
    snapshot: {
      currentTermName: "Spring 2026",
      people: {
        activeInvites: 12,
        pendingInvites: 4,
        exactInviteCount: 10,
        activeRoles: 14,
        blockedEntries: 1,
        pendingGrants: 2,
      },
      officeHours: {
        configuredRoles: 4,
        officeReady: false,
        reminderEnabled: true,
      },
      meetings: {
        upcomingMeetings: 3,
        missingNoticeCount: 2,
        missingAgendaCount: 1,
        committeeCount: 5,
      },
    },
  });

  assert.equal(result.title, "Admin");
  assert.equal(result.cards.length, 3);
  assert.deepEqual(result.cards.map((card) => card.id), ["people", "office_hours", "meetings"]);
  assert.deepEqual(result.cards.map((card) => card.href), ["/admin/people", "/admin/office-hours", "/admin/meetings"]);
  assert.deepEqual(result.cards.map((card) => card.statusShort), ["Invites pending", "Setup required", "Notice due"]);
  assert.deepEqual(result.cards.map((card) => card.statusTone), ["warning", "warning", "critical"]);
  assert.deepEqual(result.cards.map((card) => card.statusIcon), ["clock", "clock", "triangle"]);
  assert.deepEqual(result.cards.map((card) => card.count), [4, 0, 2]);
  assert.deepEqual(result.issues, [
    {
      id: "meetings-notices",
      domainId: "meetings",
      href: "/admin/meetings#admin-meetings-upcoming",
      label: "Post notices",
      count: 2,
      statusTone: "critical",
      statusIcon: "triangle",
      priority: 0,
    },
    {
      id: "people-pending-invites",
      domainId: "people",
      href: "/admin/people",
      label: "Pending invites",
      count: 4,
      statusTone: "warning",
      statusIcon: "clock",
      priority: 1,
    },
    {
      id: "people-pending-grants",
      domainId: "people",
      href: "/admin/people/assignments",
      label: "Role grants",
      count: 2,
      statusTone: "warning",
      statusIcon: "clock",
      priority: 1,
    },
    {
      id: "people-blocklist",
      domainId: "people",
      href: "/admin/people/access-audit",
      label: "Blocked patterns",
      count: 1,
      statusTone: "warning",
      statusIcon: "clock",
      priority: 1,
    },
    {
      id: "office-hours-setup",
      domainId: "office_hours",
      href: "/admin/office-hours/config",
      label: "Setup review",
      count: 1,
      statusTone: "warning",
      statusIcon: "clock",
      priority: 1,
    },
    {
      id: "meetings-agendas",
      domainId: "meetings",
      href: "/admin/meetings#admin-meetings-existing",
      label: "Agenda missing",
      count: 1,
      statusTone: "warning",
      statusIcon: "clock",
      priority: 1,
    },
  ]);
});

test("buildAdminHomeViewModel hides calm domains from the issues list when nothing needs attention", () => {
  const result = buildAdminHomeViewModel({
    tier: "partial",
    isEvp: true,
    snapshot: {
      currentTermName: "Spring 2026",
      people: {
        activeInvites: 0,
        pendingInvites: 0,
        exactInviteCount: 0,
        activeRoles: 0,
        blockedEntries: 0,
        pendingGrants: 0,
      },
      officeHours: {
        configuredRoles: 3,
        officeReady: true,
        reminderEnabled: true,
      },
      meetings: {
        upcomingMeetings: 2,
        missingNoticeCount: 0,
        missingAgendaCount: 0,
        committeeCount: 4,
      },
    },
  });

  assert.deepEqual(result.cards.map((card) => card.id), ["office_hours", "meetings"]);
  assert.deepEqual(result.issues, []);
  assert.equal(result.cards[0].statusShort, "Ready");
  assert.equal(result.cards[1].statusShort, "On track");
  assert.equal(result.cards[0].statusTone, "good");
  assert.equal(result.cards[1].statusTone, "good");
  assert.equal(result.cards[0].statusIcon, "check");
  assert.equal(result.cards[1].statusIcon, "check");
});

test("buildAdminHomeViewModel sorts issues by priority first, then domain order", () => {
  const result = buildAdminHomeViewModel({
    tier: "full",
    isEvp: false,
    snapshot: {
      currentTermName: "Spring 2026",
      people: {
        activeInvites: 4,
        pendingInvites: 3,
        exactInviteCount: 4,
        activeRoles: 9,
        blockedEntries: 0,
        pendingGrants: 1,
      },
      officeHours: {
        configuredRoles: 1,
        officeReady: false,
        reminderEnabled: false,
      },
      meetings: {
        upcomingMeetings: 2,
        missingNoticeCount: 1,
        missingAgendaCount: 1,
        committeeCount: 3,
      },
    },
  });

  assert.deepEqual(result.issues.map((issue) => issue.id), [
    "meetings-notices",
    "people-pending-invites",
    "people-pending-grants",
    "office-hours-setup",
    "meetings-agendas",
  ]);
  assert.deepEqual(result.issues.map((issue) => issue.priority), [0, 1, 1, 1, 1]);
});
