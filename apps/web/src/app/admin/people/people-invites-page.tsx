import { AdminHero } from "@/components/admin/admin-hero";
import { loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";

import { PeopleInvitesPanel } from "./_components/people-invites-panel";

export async function PeopleInvitesPage({ redirectTo = "/admin/people" }: { redirectTo?: string }) {
  const viewer = await requireAdminViewer({ redirectTo, capability: "people" });
  const data = await loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp });

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="People"
        title="Invite and access queue"
        description="Start with the people who need access right now. Bulk rules, blocklists, and pre-login role grants stay available without taking over the page."
      />

      <PeopleInvitesPanel
        terms={data.initialTerms}
        users={data.initialUsers}
        initialInvites={data.initialInvitesAllowlist}
        initialBlocklist={data.initialInvitesBlocklist}
        initialGrants={data.initialBootstrapRoleGrants}
      />
    </div>
  );
}
