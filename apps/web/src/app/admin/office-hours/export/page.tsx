import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { OfficeHoursExportPanel } from "./office-hours-export-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursExportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/office-hours/export");
  }

  const { data: tierData, error: tierErr } = await supabase.rpc("get_admin_tier", { _uid: user.id });
  const tier = tierData?.tier as "full" | "partial" | "read-only" | null;
  const isEvp = tierData?.is_evp as boolean ?? false;
  const canAccess = (tier === "full" || isEvp) && tier !== "read-only";

  if (tierErr || !tier || !canAccess) {
    redirect("/unauthorized?reason=admin&redirectTo=/admin/office-hours/export");
  }

  const resolvedSearchParams = await searchParams;
  const weekStart =
    typeof resolvedSearchParams?.weekStart === "string"
      ? resolvedSearchParams.weekStart
      : Array.isArray(resolvedSearchParams?.weekStart)
        ? resolvedSearchParams?.weekStart[0] ?? null
        : null;

  return (
    <PageShell
      title="Office Hours Weekly Report"
      description="HR-style weekly totals & deficits with CSV export."
      containerClassName="max-w-7xl"
      backHref="/admin/office-hours"
      backLabel="Back to Office Hours"
    >
      <OfficeHoursExportPanel initialWeekStart={weekStart} />
    </PageShell>
  );
}
