import { DEFAULT_WEEKLY_TOTAL_HOURS_BY_ROLE, TERM_ROLE_KEYS } from "./role-config.mjs";

/**
 * @typedef {{
 *   term_id: string | null;
 *   role_key: string | null;
 *   weekly_total_hours: number | null;
 *   weekly_in_office_hours?: number | null;
 *   effective_start: string | null;
 *   effective_end: string | null;
 * }} OfficeHourRequirementLike
 */

export const OFFICE_HOUR_ROLE_KEYS = TERM_ROLE_KEYS;

export function getDefaultWeeklyTotalHours(roleKey) {
  return DEFAULT_WEEKLY_TOTAL_HOURS_BY_ROLE[roleKey] ?? 0;
}

/**
 * Build the admin save payload from the current term rows, filling in any
 * missing governance defaults so the UI always writes a complete set.
 *
 * @param {{ termId: string; requirements: OfficeHourRequirementLike[] }} input
 */
export function buildOfficeHourRequirementPayload({ termId, requirements }) {
  return OFFICE_HOUR_ROLE_KEYS.map((roleKey) => {
    const row = requirements.find(
      (candidate) =>
        candidate.role_key === roleKey &&
        candidate.term_id === termId &&
        !candidate.effective_start &&
        !candidate.effective_end,
    );

    return {
      roleKey,
      weeklyTotalHours: row?.weekly_total_hours ?? getDefaultWeeklyTotalHours(roleKey),
      weeklyInOfficeHours: 0,
    };
  });
}
