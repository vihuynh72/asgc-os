/**
 * Shared ASGC role configuration used by admin UI, reporting helpers, and tests.
 *
 * Keep this as plain JS so the Node test runner can import it directly.
 */

export const TERM_ROLE_KEYS = /** @type {const} */ (["president", "executive", "board_member", "volunteer"]);

export const ROLE_OPTIONS = Object.freeze([
  { key: "advisor", label: "Advisor (global)", scope: "global" },
  { key: "president", label: "President (term)", scope: "term" },
  { key: "executive", label: "Executive (term)", scope: "term" },
  { key: "board_member", label: "Board member (term)", scope: "term" },
  { key: "volunteer", label: "Volunteer (term)", scope: "term" },
]);

export const ROLE_LABEL_BY_KEY = Object.freeze({
  advisor: "Advisor",
  president: "President",
  executive: "Executive",
  board_member: "Board member",
  volunteer: "Volunteer",
});

export const DEFAULT_WEEKLY_TOTAL_HOURS_BY_ROLE = Object.freeze({
  advisor: 0,
  president: 10,
  executive: 10,
  board_member: 4,
  volunteer: 0,
});

export const EXECUTIVE_DISPLAY_TITLES = Object.freeze([
  "Executive Vice President",
  "Director of Board Affairs",
]);

export function emailLocalPart(email) {
  return (email.split("@")[0] ?? "").toLowerCase();
}

export function inferExecutiveDisplayTitleFromEmail(email) {
  const local = emailLocalPart(email);
  const compactLocal = local.replace(/^asgc[._-]?/, "").replace(/[^a-z0-9]/g, "");

  if (compactLocal.includes("dirboardaffairs") || compactLocal.includes("boardaffairs")) {
    return "Director of Board Affairs";
  }

  if (local.includes("vpfinance")) {
    return "Vice President of Finance";
  }

  if (
    compactLocal.includes("execvp") ||
    compactLocal.includes("evp") ||
    local.startsWith("vp") ||
    local.includes("vicepresident") ||
    local.includes("vice-president")
  ) {
    return "Executive Vice President";
  }

  return null;
}
