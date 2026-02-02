import Link from "next/link";
import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { ChangePasswordPanel } from "./change-password-panel";
import { SecurityPanel } from "./security-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type TermRow = {
  id: string;
  name: string;
  is_current: boolean;
};

type RoleAssignmentRow = {
  id: string;
  role_key: string;
  term_id: string | null;
  starts_at: string;
  ends_at: string | null;
  is_primary: boolean;
};

export default async function AccountPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/account");
  }

  const [{ data: isAdminData, error: adminErr }, { data: termsRaw }, { data: assignmentsRaw }] = await Promise.all([
    supabase.rpc("is_admin", { _uid: user.id }),
    supabase.from("terms").select("id,name,is_current"),
    supabase
      .from("role_assignments")
      .select("id,role_key,term_id,starts_at,ends_at,is_primary")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const terms = (termsRaw ?? []) as TermRow[];
  const termLabels = new Map(
    terms.map((t) => [t.id, `${t.name}${t.is_current ? " (current)" : ""}`]),
  );

  const assignments = (assignmentsRaw ?? []) as RoleAssignmentRow[];
  const activeAssignments = assignments.filter((a) => !a.ends_at);

  const isAdmin = !adminErr && !!isAdminData;

  return (
    <PageShell title="Account" description="Your sign-in status and current roles.">
      <div className="space-y-6">
        <section className="rounded-md border p-4">
          <div className="text-xs text-foreground/60">Signed in as</div>
          <div className="mt-1 truncate font-medium">{user.email ?? user.id}</div>
          <div className="mt-3 text-sm text-foreground/70">
            Admin access: <span className="font-medium text-foreground">{isAdmin ? "Yes" : "No"}</span>
          </div>
        </section>

        <section className="rounded-md border p-4">
          <h2 className="text-sm font-semibold">Roles</h2>
          {activeAssignments.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/70">No active roles assigned.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {activeAssignments.map((a) => {
                const scopeLabel = a.term_id ? (termLabels.get(a.term_id) ?? a.term_id) : "Global";
                return (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-foreground/10 px-3 py-2">
                    <span className="font-mono">{a.role_key}</span>
                    <span className="text-foreground/70">{scopeLabel}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-foreground/60">
            Admin access requires <span className="font-mono">advisor</span> (global) or{" "}
            <span className="font-mono">president</span> for the current term.
          </p>
        </section>

        <ChangePasswordPanel />

        <SecurityPanel />

        <div className="flex flex-wrap items-center gap-3">
          <Link className="text-sm underline" href="/dashboard">
            Go to dashboard
          </Link>
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </div>
      </div>
    </PageShell>
  );
}
