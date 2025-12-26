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

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
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
      title="Office Hours CSV"
      description="View CSV output in the browser."
      containerClassName="max-w-7xl"
      backHref={backHref}
      backLabel="Back to Table View"
    >
      <OfficeHoursCsvPanel initialWeekStart={weekStart} />
    </PageShell>
  );
}
