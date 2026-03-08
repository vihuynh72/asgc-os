import { AdminHero } from "@/components/admin/admin-hero";
import { loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";

import { OfficeHoursRequirementsPanel } from "./_components/office-hours-requirements-panel";

export async function OfficeHoursRequirementsPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/office-hours/requirements", capability: "office_hours" });
  const data = await loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp });

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="Office Hours"
        title="Weekly requirements"
        description="Edit requirement hours in one calm editor, separate from live session review and export work."
      />
      <OfficeHoursRequirementsPanel
        terms={data.initialTerms}
        initialSelectedTermId={data.initialSelectedTermId}
        initialRequirements={data.initialOfficeHourRequirements}
      />
    </div>
  );
}
