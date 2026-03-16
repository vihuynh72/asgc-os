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
