/**
 * Office hours weekly report helpers shared across API + UI.
 *
 * Keep this module as plain JS so Node's built-in test runner can import it directly.
 */

/**
 * @typedef {"president"|"executive"|"director"|"board_member"|"volunteer"|string|null} RoleKey
 */

/**
 * @typedef {{
 *   user_id: string;
 *   week_start: string;
 *   role_key: RoleKey;
 *   email?: string;
 *   role?: string;
 *   name?: string;
 *   required_hours?: number | string;
 *   total_hours?: number | string;
 *   missing_hours?: number | string;
 *   needs_review_sessions?: number | string;
 * }} WeeklyReportRow
 */

/**
 * Prevent CSV formula injection in spreadsheet programs.
 * @param {string} raw
 */
export function mitigateCsvFormulaInjection(raw) {
  return /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
}

/**
 * @param {unknown} value
 */
export function csvEscape(value) {
  const raw = value === null || value === undefined ? "" : String(value);
  const s = mitigateCsvFormulaInjection(raw);
  if (/[\n\r,\"]/g.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * @param {RoleKey} roleKey
 */
export function roleKeyRank(roleKey) {
  switch (roleKey) {
    case "president":
      return 0;
    case "executive":
      return 1;
    case "director":
      return 2;
    case "board_member":
      return 3;
    case "volunteer":
      return 4;
    default:
      return 9;
  }
}

/**
 * @param {string} email
 * @returns {string}
 */
export function emailLocalPart(email) {
  return (email.split("@")[0] ?? "").toLowerCase();
}

/**
 * Infers a human-friendly title for display (role column).
 *
 * Important: never rank/sort using this string (e.g. "Vice President" contains "President").
 * @param {{ email: string, roleKey: RoleKey }} params
 */
export function inferRoleLabel({ email, roleKey }) {
  const local = emailLocalPart(email);

  if (roleKey === "president") return "President";

  if (roleKey === "executive") {
    if (local.includes("vpfinance")) return "Vice President of Finance";
    if (local.startsWith("vp") || local.includes("vicepresident") || local.includes("vice-president")) return "Vice President";
    return "Executive";
  }

  if (roleKey === "director") return "Director";

  if (roleKey === "board_member") {
    const m = local.match(/boardmember(\d{1,2})/);
    if (m?.[1]) return `Board Member ${m[1]}`;
    return "Board Member";
  }

  if (roleKey === "volunteer") return "Volunteer";

  return roleKey ? roleKey.replace(/_/g, " ") : "Member";
}

/**
 * @param {WeeklyReportRow} row
 * @returns {number|null}
 */
export function boardNumberFromRow(row) {
  const role = row.role ?? "";
  const m1 = role.match(/board member\s*(\d+)/i);
  if (m1?.[1]) return Number(m1[1]);

  const email = row.email ?? "";
  const local = emailLocalPart(email);
  const m2 = local.match(/boardmember(\d{1,2})/);
  if (m2?.[1]) return Number(m2[1]);

  return null;
}

/**
 * @param {{ required_hours?: number | string, total_hours?: number | string, missing_hours?: number | string }} row
 */
export function reportStatus(row) {
  const requiredRaw = row.required_hours;
  const requiredNum = typeof requiredRaw === "number" ? requiredRaw : typeof requiredRaw === "string" ? Number(requiredRaw) : NaN;
  const required = Number.isFinite(requiredNum) ? Math.max(0, requiredNum) : 0;

  const missingRaw = row.missing_hours;
  const missingNum = typeof missingRaw === "number" ? missingRaw : typeof missingRaw === "string" ? Number(missingRaw) : NaN;
  const missing = Number.isFinite(missingNum) ? Math.max(0, missingNum) : 0;

  const totalRaw = row.total_hours;
  const totalNum = typeof totalRaw === "number" ? totalRaw : typeof totalRaw === "string" ? Number(totalRaw) : NaN;
  const total = Number.isFinite(totalNum) ? Math.max(0, totalNum) : 0;

  if (required <= 0) return "not_required";
  if (missing <= 0) return "complete";
  if (total <= 0 && missing >= required) return "missing";
  return "behind";
}

/**
 * Deterministic ordering for weekly report rows:
 * - role_key hierarchy: president → executive → director → board_member → volunteer → others
 * - board members by board # when available
 * - then larger missing first (to surface problems)
 * - then name/email A-Z
 *
 * @template {WeeklyReportRow} T
 * @param {T[]} rows
 * @returns {T[]}
 */
export function sortWeeklyReportRows(rows) {
  return [...rows].sort((a, b) => {
    const ar = roleKeyRank(a.role_key ?? null);
    const br = roleKeyRank(b.role_key ?? null);
    if (ar !== br) return ar - br;

    if ((a.role_key ?? null) === "board_member" || (b.role_key ?? null) === "board_member") {
      const ab = boardNumberFromRow(a);
      const bb = boardNumberFromRow(b);
      if (ab !== null && bb !== null && ab !== bb) return ab - bb;
      if (ab !== null && bb === null) return -1;
      if (ab === null && bb !== null) return 1;
    }

    const amRaw = a.missing_hours;
    const amNum = typeof amRaw === "number" ? amRaw : typeof amRaw === "string" ? Number(amRaw) : NaN;
    const am = Number.isFinite(amNum) ? amNum : 0;
    const bmRaw = b.missing_hours;
    const bmNum = typeof bmRaw === "number" ? bmRaw : typeof bmRaw === "string" ? Number(bmRaw) : NaN;
    const bm = Number.isFinite(bmNum) ? bmNum : 0;
    if (am !== bm) return bm - am;

    const an = (a.name || a.email || "").toLowerCase();
    const bn = (b.name || b.email || "").toLowerCase();
    return an.localeCompare(bn);
  });
}
