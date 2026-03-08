import { AdminHero } from "@/components/admin/admin-hero";
import { requireAdminViewer } from "@/lib/admin/server";

import { PeopleAccessAuditPanel } from "./_components/people-access-audit-panel";

export async function PeopleAccessAuditPage() {
  await requireAdminViewer({ redirectTo: "/admin/people/access-audit", capability: "people" });

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="People"
        title="Access audit"
        description="Review who currently has admin access, what belongs to the current term, and what should be cleaned up."
      />
      <PeopleAccessAuditPanel />
    </div>
  );
}
