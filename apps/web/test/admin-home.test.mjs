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
  assert.deepEqual(result.cards.map((card) => card.metrics), [undefined, undefined, undefined]);
  assert.deepEqual(result.cards.map((card) => card.href), ["/admin/people", "/admin/office-hours", "/admin/meetings"]);
  assert.equal(result.cards[0].status, "4 invited members still need their first sign-in.");
  assert.equal(result.cards[1].status, "Office Hours setup still needs attention before weekly operations feel reliable.");
  assert.equal(result.cards[2].status, "2 scheduled meetings still need public notice.");
  assert.deepEqual(result.issues, [
    {
      id: "people-pending-invites",
      domainId: "people",
      href: "/admin/people",
      label: "People",
      message: "4 invited members still need their first sign-in.",
      tone: "warning",
    },
    {
      id: "people-pending-grants",
      domainId: "people",
      href: "/admin/people/assignments",
      label: "People",
      message: "2 pre-login role grants are still waiting to be applied.",
      tone: "warning",
    },
    {
      id: "people-blocklist",
      domainId: "people",
      href: "/admin/people/access-audit",
      label: "People",
      message: "1 blocked invite pattern should be reviewed against current access decisions.",
      tone: "warning",
    },
    {
      id: "office-hours-setup",
      domainId: "office_hours",
      href: "/admin/office-hours/config",
      label: "Office Hours",
      message: "Office setup still needs review before specialist workflows are dependable.",
      tone: "warning",
    },
    {
      id: "meetings-notices",
      domainId: "meetings",
      href: "/admin/meetings#admin-meetings-upcoming",
      label: "Meetings",
      message: "2 scheduled meetings still need public notice.",
      tone: "warning",
    },
    {
      id: "meetings-agendas",
      domainId: "meetings",
      href: "/admin/meetings#admin-meetings-existing",
      label: "Meetings",
      message: "1 scheduled meeting is still missing an agenda.",
      tone: "warning",
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
  assert.equal(result.cards[0].status, "Sessions, requirements, and configuration are ready to work in.");
  assert.equal(result.cards[1].status, "Upcoming meetings and publishing checks look on track.");
});
