import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { AdminOfficeHoursPanel } from "./admin-office-hours-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

export default async function AdminOfficeHoursPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/office-hours");
  }

  const { data: tierData, error: tierErr } = await supabase.rpc("get_admin_tier", { _uid: user.id });
  const tier = tierData?.tier as "full" | "partial" | "read-only" | null;
  const isEvp = tierData?.is_evp as boolean ?? false;
  const canAccess = (tier === "full" || isEvp) && tier !== "read-only";

  if (tierErr || !tier || !canAccess) {
    redirect("/unauthorized?reason=admin&redirectTo=/admin/office-hours");
  }

  const admin = getSupabaseAdminClient();
  const { data: usersRaw } = await admin.rpc("admin_list_allowlisted_users", { _limit: 500 });
  const users =
    ((usersRaw ?? []) as unknown[]).map((row: unknown) => {
      const r = row as unknown as UserRow;
      return {
        id: r.id,
        email: r.email ?? null,
        display_name: r.display_name ?? null,
        status: r.status,
        created_at: r.created_at,
      };
    }) ?? [];

  return (
    <PageShell
      title="Office Hours (Admin)"
      description="Day/week/month calendar view with filters."
      containerClassName="max-w-7xl"
      backHref="/admin"
      backLabel="Back to Admin"
    >
      <AdminOfficeHoursPanel initialUsers={users as UserRow[]} />
    </PageShell>
  );
}
