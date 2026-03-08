import { AdminHero } from "@/components/admin/admin-hero";
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
  await requireAdminViewer({ redirectTo, capability: "office_hours" });

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

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="Office Hours"
        title="Sessions"
        description="Use one operational workspace for live sessions, review, and overrides. Requirements, configuration, and export stay on their own routes."
      />

      <OfficeHoursSectionNav activeId="sessions" />

      <AdminOfficeHoursPanel initialUsers={users as UserRow[]} />
    </div>
  );
}
