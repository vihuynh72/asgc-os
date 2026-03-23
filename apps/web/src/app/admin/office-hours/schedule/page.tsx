export const dynamic = "force-dynamic";
export const revalidate = 0;

import { OfficeHoursSchedulePage } from "../office-hours-schedule-page";

export default async function AdminOfficeHoursScheduleRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <OfficeHoursSchedulePage searchParams={searchParams} />;
}
