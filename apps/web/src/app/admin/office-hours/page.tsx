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

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    redirect("/unauthorized?reason=admin&redirectTo=/admin/office-hours");
  }

  const admin = getSupabaseAdminClient();
  const { data: usersRaw } = await admin
    .from("profiles")
    .select("id,display_name,status,created_at,profile_private(email)")
    .order("created_at", { ascending: false })
    .limit(500);

  const users =
    usersRaw?.map((row) => {
      const maybePrivate = (row as unknown as { profile_private?: { email?: string | null } | null }).profile_private;
      return {
        id: (row as unknown as { id: string }).id,
        email: maybePrivate?.email ?? null,
        display_name: (row as unknown as { display_name: string | null }).display_name ?? null,
        status: (row as unknown as { status: string }).status,
        created_at: (row as unknown as { created_at: string }).created_at,
      };
    }) ?? [];

  return (
    <PageShell title="Office Hours (Admin)" description="Day/week/month calendar view with filters." containerClassName="max-w-7xl">
      <AdminOfficeHoursPanel initialUsers={users as UserRow[]} />
    </PageShell>
  );
}
