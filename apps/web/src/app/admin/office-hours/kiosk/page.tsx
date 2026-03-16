import { OfficeHoursKioskPage } from "../office-hours-kiosk-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursKioskPage() {
  return <OfficeHoursKioskPage />;
}
