import { AdminDomainCard } from "@/components/admin/admin-domain-card";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminHero } from "@/components/admin/admin-hero";
import { AdminIssueList } from "@/components/admin/admin-issue-list";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import type { AdminHomeCard, AdminIssueItem } from "@/components/admin/admin-types";
import { getDefaultAdminPath } from "@/lib/admin/navigation.mjs";
import { buildAdminHomeViewModel } from "@/lib/admin/home.mjs";
import { loadAdminHubSnapshot, requireAdminViewer } from "@/lib/admin/server";

import { AdminPanel } from "./admin-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin", capability: "hub" });
  const snapshot = await loadAdminHubSnapshot({ tier: viewer.tier, isEvp: viewer.isEvp });
  const defaultPath = getDefaultAdminPath({ tier: viewer.tier, isEvp: viewer.isEvp });
  const home = buildAdminHomeViewModel({ tier: viewer.tier, isEvp: viewer.isEvp, snapshot }) as {
    title: string;
    description: string;
    cards: AdminHomeCard[];
    issues: AdminIssueItem[];
  };

  return (
    <div className="admin-page space-y-8">
      <AdminPanel tier={viewer.tier} isEvp={viewer.isEvp} />

      <AdminHero
        title={home.title}
        description={home.description}
      />

      {viewer.isReadOnly ? (
        <AdminInlineNotice tone="warning">Read-only mode</AdminInlineNotice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        {home.cards.map((card) => (
          <AdminDomainCard key={card.id} {...card} />
        ))}
      </div>

      {home.issues.length > 0 ? (
        <AdminIssueList
          title="Needs attention"
          description="Urgent first"
          items={home.issues}
        />
      ) : (
        <AdminEmptyState
          title="All clear"
          description={`Open ${defaultPath.replace("/admin/", "") || "admin"} when you are ready.`}
        />
      )}
    </div>
  );
}
