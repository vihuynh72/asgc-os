import { AdminHero } from "@/components/admin/admin-hero";
import { startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { requireAdminViewer } from "@/lib/admin/server";

import { OfficeHoursSectionNav } from "./_components/office-hours-section-nav";
import { OfficeHoursOverviewPanel } from "./office-hours-overview-panel";

export async function OfficeHoursOverviewPage() {
  await requireAdminViewer({ redirectTo: "/admin/office-hours", capability: "office_hours" });

  const initialWeekStart = startOfWeekMondayDateOnly(todayDateString()) ?? todayDateString();

  return (
    <div className="admin-page admin-page-plain space-y-6">
      <AdminHero
        eyebrow="Office Hours"
        title="Overview"
        description="Weekly team performance first, then live operations and schedule pressure in one calmer Office Hours dashboard."
      />

      <OfficeHoursSectionNav activeId="overview" />
      <OfficeHoursOverviewPanel initialWeekStart={initialWeekStart} />
    </div>
  );
}
