import { AdminHero } from "@/components/admin/admin-hero";
import { loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";

import { PeopleAssignmentsPanel } from "./_components/people-assignments-panel";

export async function PeopleAssignmentsPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/people/assignments", capability: "people" });
  const data = await loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp });

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="People"
        title="Assignment roster"
        description="Keep one clean roster for the current term, with global advisors separated so role ownership is easy to scan."
      />
      <PeopleAssignmentsPanel
        users={data.initialUsers}
        terms={data.initialTerms}
        initialSelectedTermId={data.initialSelectedTermId}
        initialGlobalAssignments={data.initialGlobalAdvisorAssignments}
        initialTermAssignments={data.initialTermAssignments}
      />
    </div>
  );
}
