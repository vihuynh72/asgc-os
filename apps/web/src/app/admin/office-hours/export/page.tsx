import { AdminHero } from "@/components/admin/admin-hero";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { requireAdminViewer } from "@/lib/admin/server";

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

      <AdminSectionNav
        activeId="export"
        items={[
          { id: "overview", label: "Overview", href: "/admin/office-hours" },
          { id: "sessions", label: "Sessions", href: "/admin/office-hours/sessions" },
          { id: "requirements", label: "Requirements", href: "/admin/office-hours/requirements" },
          { id: "config", label: "Config", href: "/admin/office-hours/config" },
          { id: "export", label: "Export", href: "/admin/office-hours/export" },
        ]}
      />

      <OfficeHoursExportPanel initialWeekStart={weekStart} />
    </div>
  );
}
