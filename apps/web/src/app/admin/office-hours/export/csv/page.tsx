import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { OfficeHoursCsvPanel } from "./office-hours-csv-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OfficeHoursCsvPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/admin/office-hours/export/csv");
  }

  const { data: tierData, error: tierErr } = await supabase.rpc("get_admin_tier", { _uid: user.id });
  const tier = tierData?.tier as "full" | "partial" | "read-only" | null;
  const isEvp = tierData?.is_evp as boolean ?? false;
  const canAccess = (tier === "full" || isEvp) && tier !== "read-only";

  if (tierErr || !tier || !canAccess) {
    redirect("/unauthorized?reason=admin&redirectTo=/admin/office-hours/export/csv");
  }

  const resolvedSearchParams = await searchParams;
  const weekStart =
    typeof resolvedSearchParams?.weekStart === "string"
      ? resolvedSearchParams.weekStart
      : Array.isArray(resolvedSearchParams?.weekStart)
        ? resolvedSearchParams?.weekStart[0] ?? null
        : null;

  const backHref = weekStart
    ? `/admin/office-hours/export?weekStart=${encodeURIComponent(weekStart)}`
    : "/admin/office-hours/export";

  return (
    <PageShell
      title="Office Hours Export"
      description="Weekly report + CSV (table/raw) views."
      containerClassName="max-w-7xl"
      backHref={backHref}
      backLabel="Back to Weekly Report"
    >
      <OfficeHoursCsvPanel initialWeekStart={weekStart} />
    </PageShell>
  );
}
