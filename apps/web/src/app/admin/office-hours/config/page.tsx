import { OfficeHoursConfigPage } from "../office-hours-config-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursConfigPage() {
  return <OfficeHoursConfigPage />;
}
