import Link from "next/link";

import { AdminHero } from "@/components/admin/admin-hero";
import { loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";

import { OfficeHoursConfigPanel } from "./_components/office-hours-config-panel";

export async function OfficeHoursConfigPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/office-hours/config", capability: "office_hours" });
  const data = await loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp });

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="Office Hours"
        title="Configuration"
        description="Keep office location, reminder timing, and availability policy in one place without mixing them into live session work."
        actions={
          <Link
            href="/admin/office-hours/lab"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
          >
            Open testing lab
          </Link>
        }
      />
      <OfficeHoursConfigPanel
        initialOfficeConfig={data.initialOfficeConfig}
        initialOfficeLocation={data.initialOfficeLocation}
      />
    </div>
  );
}
