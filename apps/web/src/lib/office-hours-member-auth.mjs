import { isEligibleOfficeHoursRole } from "./office-hours-roles.mjs";

export { isEligibleOfficeHoursRole };

/**
 * @param {{
 *   passwordReadyStatus: "ready" | "missing" | "unknown",
 *   officeHoursRoleKey: string | null,
 *   hasOpenSession: boolean,
 *   roleLookupStatus?: "known" | "unknown",
 * }} input
 * @returns {{
 *   authStatus: "authenticated" | "needs_password" | "role_ineligible",
 *   canCheckIn: boolean,
 *   canCheckOut: boolean,
 *   roleEligible: boolean,
 * }}
 */
export function resolveOfficeHoursMemberAccess({
  passwordReadyStatus,
  officeHoursRoleKey,
  hasOpenSession,
  roleLookupStatus = "known",
}) {
  const roleEligible = isEligibleOfficeHoursRole(officeHoursRoleKey);

  if (passwordReadyStatus === "missing") {
    return {
      authStatus: "needs_password",
      canCheckIn: false,
      canCheckOut: false,
      roleEligible,
    };
  }

  if (hasOpenSession) {
    return {
      authStatus: "authenticated",
      canCheckIn: false,
      canCheckOut: true,
      roleEligible,
    };
  }

  if (roleEligible || roleLookupStatus === "unknown") {
    return {
      authStatus: "authenticated",
      canCheckIn: true,
      canCheckOut: false,
      roleEligible,
    };
  }

  return {
    authStatus: "role_ineligible",
    canCheckIn: false,
    canCheckOut: false,
    roleEligible: false,
  };
}
