import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";
import { redirect } from "next/navigation";
import { AuditLogPanel } from "./audit-log-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuditLogPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Only full admins can see audit logs
  const { data: tierData, error: tierErr } = await supabase.rpc("get_admin_tier", { _uid: user.id });
  const tier = tierData?.tier as "full" | "partial" | "read-only" | null;

  if (tierErr || tier !== "full") {
    redirect("/unauthorized?reason=admin&redirectTo=/admin/audit");
  }

  return (
    <PageShell title="Audit Log" description="View system activity and changes." backHref="/admin" backLabel="Back to Admin">
      <AuditLogPanel />
    </PageShell>
  );
}
