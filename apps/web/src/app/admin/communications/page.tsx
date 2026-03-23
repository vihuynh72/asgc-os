import { redirect } from "next/navigation";

import { AdminCommunicationsLab } from "@/components/admin/admin-communications-lab";
import { AdminHero } from "@/components/admin/admin-hero";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";
import { getAdminCommunicationTemplateGroups, getAdminCommunicationTemplates, getAdminCommunicationsAccess } from "@/lib/admin/communications.mjs";
import { getDefaultAdminCommunicationSelection } from "@/lib/admin/communications-service.mjs";
import { requireAdminViewer } from "@/lib/admin/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AdminCommunicationsPage({ searchParams }: { searchParams: SearchParams }) {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/communications", capability: "hub" });
  const access = getAdminCommunicationsAccess({ tier: viewer.tier, isEvp: viewer.isEvp });

  if (!access.canAccess) {
    redirect(`/unauthorized?reason=admin&redirectTo=${encodeURIComponent("/admin/communications")}`);
  }

  const params = await searchParams;
  const preferredGroupId = typeof params.group === "string" ? params.group : null;
  const groups = getAdminCommunicationTemplateGroups(access);
  const templates = getAdminCommunicationTemplates(access);
  const initialSelection = getDefaultAdminCommunicationSelection({ access, preferredGroupId });

  return (
    <div className="admin-page admin-page-plain space-y-6">
      <AdminHero
        eyebrow="Communications"
        title="Email lab"
        description="Preview the real app emails, inspect HTML and plain text, and send safe test copies to your own admin account."
      />

      {!access.canSend ? <AdminInlineNotice tone="warning">Preview only mode</AdminInlineNotice> : null}

      <AdminSurface
        title="Template previews"
        description="This lab uses the same production email builders as the live auth, people, and Office Hours flows."
      >
        <AdminCommunicationsLab
          groups={groups}
          templates={templates}
          initialSelection={initialSelection}
          canSend={access.canSend}
        />
      </AdminSurface>
    </div>
  );
}
