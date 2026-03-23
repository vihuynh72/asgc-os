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

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

function normalizeView(value: string | undefined): "day" | "week" | "month" | undefined {
  return value === "day" || value === "week" || value === "month" ? value : undefined;
}

export async function OfficeHoursSessionsPage({
  redirectTo = "/admin/office-hours",
  searchParams,
}: {
  redirectTo?: string;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const viewer = await requireAdminViewer({ redirectTo, capability: "office_hours" });
  const params = (await searchParams) ?? {};
  const initialSelectedUserId = firstString(params.userId) ?? "";
  const initialAnchorDate = firstString(params.date) ?? undefined;
  const initialView = normalizeView(firstString(params.view));

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
        description="Live session operations, overrides, selfie review, and reminder tooling in one focused workspace."
      />

      <OfficeHoursSectionNav activeId="sessions" />

      <AdminOfficeHoursPanel
        initialUsers={users as UserRow[]}
        initialSelectedUserId={initialSelectedUserId}
        initialAnchorDate={initialAnchorDate}
        initialView={initialView}
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
