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

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
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
      title="Office Hours Export"
      description="View weekly totals/deficits in the browser, with CSV download."
      containerClassName="max-w-7xl"
    >
      <OfficeHoursExportPanel initialWeekStart={weekStart} />
    </PageShell>
  );
}
