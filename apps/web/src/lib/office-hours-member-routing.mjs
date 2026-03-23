export const OFFICE_HOURS_MEMBER_KIOSK_PATH = "/office-hours/kiosk";

export function getOfficeHoursMemberRedirectTarget(pathname) {
  if (
    pathname === "/office-hours" ||
    pathname === "/office-hours/check-in" ||
    pathname === "/office-hours/check-out"
  ) {
    return OFFICE_HOURS_MEMBER_KIOSK_PATH;
  }

  return null;
}
