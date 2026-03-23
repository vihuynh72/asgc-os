import { redirect } from "next/navigation";

import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";

export default function OfficeHoursCheckInPage() {
  redirect(OFFICE_HOURS_MEMBER_KIOSK_PATH);
}
