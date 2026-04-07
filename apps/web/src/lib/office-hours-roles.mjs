import { inferExecutiveDisplayTitleFromEmail } from "./role-config.mjs";

export const OFFICE_HOURS_ROLE_KEYS = /** @type {const} */ ([
  "advisor",
  "president",
  "executive",
  "board_member",
  "volunteer",
]);

export function officeHoursRoleRank(roleKey) {
  switch (roleKey) {
    case "advisor":
      return 0;
    case "president":
      return 1;
    case "executive":
      return 2;
    case "board_member":
      return 3;
    case "volunteer":
      return 4;
    default:
      return 9;
  }
}

export function isEligibleOfficeHoursRole(roleKey) {
  return OFFICE_HOURS_ROLE_KEYS.includes(roleKey);
}

function emailLocalPart(email) {
  return (email.split("@")[0] ?? "").toLowerCase();
}

/**
 * @param {{ roleKey: string | null | undefined, email?: string, displayTitle?: string | null }} input
 */
export function officeHoursRoleLabel({ roleKey, email = "", displayTitle = null }) {
  if (roleKey === "advisor") return "Advisor";
  if (roleKey === "president") return "President";

  if (roleKey === "executive") {
    const trimmedTitle = typeof displayTitle === "string" ? displayTitle.trim() : "";
    if (trimmedTitle) return trimmedTitle;
    return inferExecutiveDisplayTitleFromEmail(email) ?? "Executive";
  }

  if (roleKey === "board_member") {
    const match = emailLocalPart(email).match(/boardmember(\d{1,2})/);
    if (match?.[1]) return `Board Member ${match[1]}`;
    return "Board Member";
  }

  if (roleKey === "volunteer") return "Volunteer";

  return roleKey ? roleKey.replace(/_/g, " ") : "Member";
}
