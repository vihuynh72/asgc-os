import { inferRoleLabel } from "./office-hours-weekly-report.mjs";
import { officeHoursRoleRank } from "./office-hours-roles.mjs";

function roleRank(roleKey) {
  return officeHoursRoleRank(roleKey);
}

function entryStatusRank(entryStatus) {
  switch (entryStatus) {
    case "active":
      return 0;
    case "awaiting_sign_in":
      return 1;
    default:
      return 9;
  }
}

function fallbackPendingName(grant) {
  const notes = typeof grant.notes === "string" ? grant.notes.trim() : "";
  if (notes) return notes;
  const email = typeof grant.email === "string" ? grant.email.trim() : "";
  return email || "Awaiting sign-in";
}

function compareMembers(a, b) {
  const roleDelta = roleRank(a.role_key) - roleRank(b.role_key);
  if (roleDelta !== 0) return roleDelta;

  const statusDelta = entryStatusRank(a.entry_status) - entryStatusRank(b.entry_status);
  if (statusDelta !== 0) return statusDelta;

  const labelA = String(a.display_name ?? "").toLowerCase();
  const labelB = String(b.display_name ?? "").toLowerCase();
  if (labelA !== labelB) return labelA.localeCompare(labelB);

  const emailA = String(a.email ?? "").toLowerCase();
  const emailB = String(b.email ?? "").toLowerCase();
  if (emailA !== emailB) return emailA.localeCompare(emailB);

  return String(a.member_key ?? "").localeCompare(String(b.member_key ?? ""));
}

export function buildKioskAdminMembers({ activeMembers, pendingGrants }) {
  const activeRows = Array.isArray(activeMembers) ? [...activeMembers] : [];
  const pendingRows = (Array.isArray(pendingGrants) ? pendingGrants : []).map((grant) => ({
    member_key: `grant:${grant.id}`,
    source_type: "bootstrap_role_grant",
    source_id: grant.id,
    entry_status: "awaiting_sign_in",
    user_id: null,
    bootstrap_role_grant_id: grant.id,
    email: grant.email ?? null,
    display_name: fallbackPendingName(grant),
    role_key: grant.role_key,
    role_label: inferRoleLabel({ email: grant.email ?? "", roleKey: grant.role_key ?? null }),
    display_title: grant.display_title ?? null,
    phone_configured: Boolean(grant.phone_last4),
    phone_last4: grant.phone_last4 ?? null,
    phone_updated_at: grant.phone_updated_at ?? null,
  }));

  return [...activeRows, ...pendingRows].sort(compareMembers);
}
