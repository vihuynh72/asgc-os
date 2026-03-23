import { AdminHero } from "@/components/admin/admin-hero";
import { getAdminCommunicationTemplateGroups, getAdminCommunicationTemplates, getAdminCommunicationsAccess } from "@/lib/admin/communications.mjs";
import { getDefaultAdminCommunicationSelection } from "@/lib/admin/communications-service.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminViewer } from "@/lib/admin/server";

import { AdminOfficeHoursPanel } from "./admin-office-hours-panel";
import { OfficeHoursSectionNav } from "./_components/office-hours-section-nav";

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

export async function OfficeHoursSessionsPage({ redirectTo = "/admin/office-hours" }: { redirectTo?: string }) {
  const viewer = await requireAdminViewer({ redirectTo, capability: "office_hours" });

  const admin = getSupabaseAdminClient();
  const { data: usersRaw } = await admin.rpc("admin_list_allowlisted_users", { _limit: 500 });
  const users =
    ((usersRaw ?? []) as unknown[]).map((row: unknown) => {
      const r = row as UserRow;
      return {
        id: r.id,
        email: r.email ?? null,
        display_name: r.display_name ?? null,
        status: r.status,
        created_at: r.created_at,
      };
    }) ?? [];
  const communicationsAccess = getAdminCommunicationsAccess({ tier: viewer.tier, isEvp: viewer.isEvp });
  const communicationsGroups = getAdminCommunicationTemplateGroups(communicationsAccess);
  const communicationsTemplates = getAdminCommunicationTemplates(communicationsAccess);
  const communicationsSelection = getDefaultAdminCommunicationSelection({
    access: communicationsAccess,
    preferredGroupId: "office_hours",
  });

  return (
    <div className="admin-page admin-page-plain space-y-6">
      <AdminHero
        eyebrow="Office Hours"
        title="Sessions"
        description="Live Office Hours operations, reminders, review, and overrides in one calmer workspace."
      />

      <OfficeHoursSectionNav activeId="sessions" />

      <AdminOfficeHoursPanel
        initialUsers={users as UserRow[]}
        communications={{
          canSend: communicationsAccess.canSend,
          groups: communicationsGroups,
          templates: communicationsTemplates,
          initialSelection: communicationsSelection,
        }}
      />
    </div>
  );
}
