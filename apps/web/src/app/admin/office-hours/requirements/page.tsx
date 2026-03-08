import { OfficeHoursRequirementsPage } from "../office-hours-requirements-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursRequirementsPage() {
  return <OfficeHoursRequirementsPage />;
}
