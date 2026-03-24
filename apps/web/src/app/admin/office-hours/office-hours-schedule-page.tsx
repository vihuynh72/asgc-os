import { OfficeHoursSessionsPage } from "./office-hours-sessions-page";

export async function OfficeHoursSchedulePage({
  searchParams,
  redirectTo = "/admin/office-hours",
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  redirectTo?: string;
}) {
  return <OfficeHoursSessionsPage searchParams={searchParams} redirectTo={redirectTo} />;
}
