import Link from "next/link";

import { AdminDomainCard } from "@/components/admin/admin-domain-card";
import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminHero } from "@/components/admin/admin-hero";
import { AdminIssueList } from "@/components/admin/admin-issue-list";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import type { AdminHomeCard, AdminIssueItem } from "@/components/admin/admin-types";
import { Button } from "@/components/ui/button";
import { getDefaultAdminPath, getVisibleAdminDomains } from "@/lib/admin/navigation.mjs";
import { buildAdminHomeViewModel } from "@/lib/admin/home.mjs";
import { loadAdminHubSnapshot, requireAdminViewer } from "@/lib/admin/server";

import { AdminPanel } from "./admin-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin", capability: "hub" });
  const snapshot = await loadAdminHubSnapshot({ tier: viewer.tier, isEvp: viewer.isEvp });
  const visibleDomains = getVisibleAdminDomains({ tier: viewer.tier, isEvp: viewer.isEvp });
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
        actions={
          <>
            <Link href={defaultPath}>
              <Button>Open main workspace</Button>
            </Link>
            {visibleDomains.includes("meetings") ? (
              <Link href="/admin/meetings#admin-meetings-create">
                <Button variant="outline">Create meeting</Button>
              </Link>
            ) : null}
          </>
        }
      />

      {viewer.isReadOnly ? (
        <AdminInlineNotice tone="warning">
          Read-only access is active. You can inspect the command center and specialist pages, but write actions remain disabled.
        </AdminInlineNotice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-3">
        {home.cards.map((card) => (
          <AdminDomainCard key={card.id} {...card} />
        ))}
      </div>

      {home.issues.length > 0 ? (
        <AdminIssueList
          title="Needs attention"
          description="Only the items worth acting on right now stay visible here."
          items={home.issues}
        />
      ) : (
        <AdminEmptyState
          title="Nothing urgent is pushing to the top"
          description="All visible admin domains look stable right now. Open the workspace you need without sorting through extra noise first."
        />
      )}
    </div>
  );
}
