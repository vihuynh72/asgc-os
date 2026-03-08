import { AdminHero } from "@/components/admin/admin-hero";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminViewer } from "@/lib/admin/server";

import { AdminOfficeHoursPanel } from "../admin-office-hours-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

export default async function AdminOfficeHoursSessionsPage() {
  await requireAdminViewer({ redirectTo: "/admin/office-hours/sessions", capability: "office_hours" });

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
    <div className="admin-page space-y-6">
      <AdminHero
        eyebrow="Office Hours"
        title="Sessions workspace"
        description="Review live and historical sessions, inspect kiosk photos, and handle overrides in the focused operational workspace."
      />

      <AdminSectionNav
        activeId="sessions"
        items={[
          { id: "overview", label: "Overview", href: "/admin/office-hours" },
          { id: "sessions", label: "Sessions", href: "/admin/office-hours/sessions" },
          { id: "requirements", label: "Requirements", href: "/admin/office-hours/requirements" },
          { id: "config", label: "Config", href: "/admin/office-hours/config" },
          { id: "export", label: "Export", href: "/admin/office-hours/export" },
        ]}
      />

      <AdminOfficeHoursPanel initialUsers={users as UserRow[]} />
    </div>
  );
}
