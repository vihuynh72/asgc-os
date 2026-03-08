import { OfficeHoursSessionsPage } from "./office-hours-sessions-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursPage() {
  return <OfficeHoursSessionsPage redirectTo="/admin/office-hours" />;
}
