import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/office-hours", label: "Office Hours" },
  { href: "/tasks", label: "Tasks" },
  { href: "/meetings", label: "Meetings" },
  { href: "/clubs", label: "Clubs" },
  { href: "/icc", label: "ICC" },
  { href: "/docs", label: "Docs" },
  { href: "/finance", label: "Finance" },
  { href: "/admin", label: "Admin" },
];

export default async function Home() {
  let signedInUserId: string | null = null;
  let isAdmin = false;

  if (hasPublicSupabaseEnv()) {
    try {
      const supabase = await getSupabaseServerComponentClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        signedInUserId = user.id;
        const { data: isAdminData, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
        isAdmin = !adminErr && !!isAdminData;
      }
    } catch {
      signedInUserId = null;
      isAdmin = false;
    }
  }

  const visibleLinks = signedInUserId ? links.filter((l) => l.href !== "/admin" || isAdmin) : [];

  return (
    <PageShell
      title="ASGC OS"
      description="Internal work operating system for ASGC (invite-only)."
    >
      <div className="space-y-6">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-foreground/70">
            This repo follows the build packet phases. Office Hours is the top MVP priority and
            uses location + an office geofence.
          </p>
        </div>

        {signedInUserId ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {visibleLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="rounded-lg border p-4 transition-colors hover:bg-foreground/5"
              >
                <div className="font-medium">{l.label}</div>
                <div className="mt-1 text-sm text-foreground/70">Open</div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Link
                href="/office-hours/kiosk"
                className="rounded-lg border p-4 transition-colors hover:bg-foreground/5"
              >
                <div className="font-medium">Office Hours Form</div>
                <div className="mt-1 text-sm text-foreground/70">Quick check in/out (no sign-in)</div>
              </Link>
            </div>

            <p className="text-sm text-foreground/70">Sign in to access Dashboard, Office Hours, Tasks, and more.</p>
          </div>
        )}

        <div className="text-sm">
          {signedInUserId ? (
            <Link className="underline" href="/dashboard">
              Go to dashboard
            </Link>
          ) : (
            <Link className="underline" href="/login">
              Sign in
            </Link>
          )}
        </div>

        <div className="text-sm text-foreground/70">
          Health check: <Link className="underline" href="/api/healthz">/api/healthz</Link>
        </div>
      </div>
    </PageShell>
  );
}
