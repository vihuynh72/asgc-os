import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { FinanceDashboard } from "./finance-dashboard";

export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const supabase = await getSupabaseServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return <PageShell title="Finance" description="Please sign in to view finance tools." />;
  }

  const [{ data: isFinanceAdmin }, { data: isBoardMember }] = await Promise.all([
    supabase.rpc("is_finance_admin", { _uid: user.id }),
    supabase.rpc("is_board_member", { _uid: user.id }),
  ]);

  return (
    <PageShell title="Finance" description="Budget, requests, grants, and exports.">
      <FinanceDashboard isFinanceAdmin={!!isFinanceAdmin} isBoardMember={!!isBoardMember} />
    </PageShell>
  );
}
