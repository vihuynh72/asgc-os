export const dynamic = "force-dynamic";
export const revalidate = 0;

import { OfficeHoursSessionsPage } from "../office-hours-sessions-page";

export default async function AdminOfficeHoursSessionsRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <OfficeHoursSessionsPage redirectTo="/admin/office-hours/sessions" searchParams={searchParams} />;
}
