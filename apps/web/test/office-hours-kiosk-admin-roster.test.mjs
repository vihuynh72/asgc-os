import test from "node:test";
import assert from "node:assert/strict";

import { buildKioskAdminMembers } from "../src/lib/office-hours-kiosk-admin-roster.mjs";

test("buildKioskAdminMembers keeps active members and adds awaiting-sign-in grants", () => {
  const rows = buildKioskAdminMembers({
    activeMembers: [
      {
        member_key: "user:pres",
        source_type: "user",
        source_id: "pres",
        entry_status: "active",
        user_id: "pres",
        bootstrap_role_grant_id: null,
        email: "president@gcccd.edu",
        display_name: "President Person",
        role_key: "president",
        role_label: "President",
        display_title: null,
        phone_configured: true,
        phone_last4: "1234",
        phone_updated_at: "2026-03-16T09:00:00.000Z",
      },
    ],
    pendingGrants: [
      {
        id: "grant-exec",
        email: "execvp@gcccd.edu",
        role_key: "executive",
        display_title: "Executive Vice President",
        notes: "Awaiting EVP",
        phone_last4: "5678",
        phone_updated_at: "2026-03-16T09:05:00.000Z",
      },
      {
        id: "grant-board",
        email: "board1@gcccd.edu",
        role_key: "board_member",
        display_title: null,
        notes: null,
        phone_last4: null,
        phone_updated_at: null,
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => ({
      member_key: row.member_key,
      entry_status: row.entry_status,
      role_key: row.role_key,
      display_name: row.display_name,
      phone_last4: row.phone_last4,
    })),
    [
      {
        member_key: "user:pres",
        entry_status: "active",
        role_key: "president",
        display_name: "President Person",
        phone_last4: "1234",
      },
      {
        member_key: "grant:grant-exec",
        entry_status: "awaiting_sign_in",
        role_key: "executive",
        display_name: "Awaiting EVP",
        phone_last4: "5678",
      },
      {
        member_key: "grant:grant-board",
        entry_status: "awaiting_sign_in",
        role_key: "board_member",
        display_name: "board1@gcccd.edu",
        phone_last4: null,
      },
    ],
  );
});

test("buildKioskAdminMembers sorts advisor before term roles and keeps volunteer in the Office Hours roster", () => {
  const rows = buildKioskAdminMembers({
    activeMembers: [
      {
        member_key: "user:volunteer",
        source_type: "user",
        source_id: "volunteer",
        entry_status: "active",
        user_id: "volunteer",
        bootstrap_role_grant_id: null,
        email: "volunteer@gcccd.edu",
        display_name: "Volunteer Person",
        role_key: "volunteer",
        role_label: "Volunteer",
        display_title: null,
        phone_configured: false,
        phone_last4: null,
        phone_updated_at: null,
      },
      {
        member_key: "user:advisor",
        source_type: "user",
        source_id: "advisor",
        entry_status: "active",
        user_id: "advisor",
        bootstrap_role_grant_id: null,
        email: "advisor@gcccd.edu",
        display_name: "Advisor Person",
        role_key: "advisor",
        role_label: "Advisor",
        display_title: null,
        phone_configured: true,
        phone_last4: "1111",
        phone_updated_at: "2026-04-06T17:00:00.000Z",
      },
    ],
    pendingGrants: [
      {
        id: "grant-board",
        email: "board3@gcccd.edu",
        role_key: "board_member",
        display_title: null,
        notes: null,
        phone_last4: null,
        phone_updated_at: null,
      },
    ],
  });

  assert.deepEqual(
    rows.map((row) => ({
      member_key: row.member_key,
      role_key: row.role_key,
      display_name: row.display_name,
    })),
    [
      {
        member_key: "user:advisor",
        role_key: "advisor",
        display_name: "Advisor Person",
      },
      {
        member_key: "grant:grant-board",
        role_key: "board_member",
        display_name: "board3@gcccd.edu",
      },
      {
        member_key: "user:volunteer",
        role_key: "volunteer",
        display_name: "Volunteer Person",
      },
    ],
  );
});
