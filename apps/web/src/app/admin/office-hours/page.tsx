import { OfficeHoursSessionsPage } from "./office-hours-sessions-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <OfficeHoursSessionsPage searchParams={searchParams} redirectTo="/admin/office-hours" />;
}
