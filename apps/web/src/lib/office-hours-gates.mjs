const PROTECTED_PREFIXES = [
  "/dashboard",
  "/account",
  "/mfa",
  "/office-hours",
  "/tasks",
  "/meetings",
  "/docs",
  "/finance",
  "/admin",
  "/projects",
];

const STEP_UP_MFA_PREFIXES = ["/admin", "/office-hours/kiosk/review"];

const OFFICE_HOURS_SELF_SERVICE_PREFIXES = [
  "/office-hours",
  "/office-hours/check-in",
  "/office-hours/check-out",
  "/office-hours/setup-password",
];

function matchesPrefix(pathname, prefix) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function requiresProtectedAuth(pathname) {
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function requiresStepUpMfa(pathname) {
  return STEP_UP_MFA_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isOfficeHoursSelfServicePath(pathname) {
  if (matchesPrefix(pathname, "/office-hours/kiosk/review")) return false;
  return OFFICE_HOURS_SELF_SERVICE_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

export function isLegacyOfficeHoursKioskPath(pathname) {
  return pathname === "/office-hours/kiosk";
}

export function getOfficeHoursPasswordSetupRedirect(requestedPath) {
  return `/office-hours/setup-password?redirectTo=${encodeURIComponent(requestedPath)}`;
}
