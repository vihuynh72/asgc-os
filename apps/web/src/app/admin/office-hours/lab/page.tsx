import { OfficeHoursLabPage } from "../office-hours-lab-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursLabPage() {
  return <OfficeHoursLabPage />;
}
