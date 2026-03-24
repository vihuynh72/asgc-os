import { AdminHero } from "@/components/admin/admin-hero";
import { requireAdminViewer } from "@/lib/admin/server";

import { OfficeHoursSectionNav } from "../_components/office-hours-section-nav";
import { OfficeHoursExportPanel } from "./office-hours-export-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursExportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminViewer({ redirectTo: "/admin/office-hours/export", capability: "office_hours" });

  const resolvedSearchParams = await searchParams;
  const weekStart =
    typeof resolvedSearchParams?.weekStart === "string"
      ? resolvedSearchParams.weekStart
      : Array.isArray(resolvedSearchParams?.weekStart)
        ? resolvedSearchParams?.weekStart[0] ?? null
        : null;

  return (
    <div className="admin-page space-y-6">
      <AdminHero
        eyebrow="Office Hours"
        title="Weekly report workspace"
        description="Review weekly totals, missing hours, and reporting output without carrying the live session controls on screen."
      />

      <OfficeHoursSectionNav activeId="export" />

      <OfficeHoursExportPanel initialWeekStart={weekStart} />
    </div>
  );
}
