import { AdminHero } from "@/components/admin/admin-hero";
import { loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";

import { PeopleTermsPanel } from "./_components/people-terms-panel";

export async function PeopleTermsPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/people/terms", capability: "people" });
  const data = await loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp });

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="People"
        title="Terms and rollover"
        description="Make the active term obvious, then keep rollover work separate from the daily role queue."
      />
      <PeopleTermsPanel initialTerms={data.initialTerms} />
    </div>
  );
}
