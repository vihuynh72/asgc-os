import { OfficeHoursOverviewPage } from "./office-hours-overview-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursPage() {
  return <OfficeHoursOverviewPage />;
}
