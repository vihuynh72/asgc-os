import { AdminHero } from "@/components/admin/admin-hero";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { requireAdminViewer } from "@/lib/admin/server";

import { OfficeHoursCsvPanel } from "./office-hours-csv-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OfficeHoursCsvPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminViewer({ redirectTo: "/admin/office-hours/export/csv", capability: "office_hours" });

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
        title="Raw CSV view"
        description="Keep the raw export output separate from weekly summary review so the reporting workspace stays easier to read."
      />

      <AdminSectionNav
        activeId="export"
        items={[
          { id: "overview", label: "Overview", href: "/admin/office-hours" },
          { id: "sessions", label: "Sessions", href: "/admin/office-hours/sessions" },
          { id: "requirements", label: "Requirements", href: "/admin/office-hours/requirements" },
          { id: "config", label: "Config", href: "/admin/office-hours/config" },
          { id: "export", label: "Export", href: weekStart ? `/admin/office-hours/export?weekStart=${encodeURIComponent(weekStart)}` : "/admin/office-hours/export" },
        ]}
      />

      <OfficeHoursCsvPanel initialWeekStart={weekStart} />
    </div>
  );
}
