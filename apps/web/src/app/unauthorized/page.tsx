import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { ButtonLink } from "@/components/ui/button-link";
import { hasPublicSupabaseEnv } from "@/lib/env";
import { safeRedirectPath } from "@/lib/redirects";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";
import { AdminRedirect } from "./admin-redirect";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UnauthorizedPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const redirectTo = safeRedirectPath(sp.redirectTo);
  const reason = typeof sp.reason === "string" ? sp.reason : null;

  let user: { email: string | null } | null = null;
  if (hasPublicSupabaseEnv()) {
    try {
      const supabase = await getSupabaseServerComponentClient();
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (authUser) user = { email: authUser.email ?? null };
    } catch {
      user = null;
    }
  }

  const description =
    reason === "admin"
      ? "This area is restricted to advisors and the current term president."
      : "You don’t have access to this page.";

  return (
    <PageShell title="Access denied" description={description}>
      <div className="space-y-4">
        <AdminRedirect enabled={reason === "admin"} />
        {user ? (
          <p className="text-sm text-foreground/70">
            Signed in as <span className="font-medium text-foreground">{user.email ?? "unknown"}</span>.
          </p>
        ) : (
          <p className="text-sm text-foreground/70">Not signed in.</p>
        )}

        {reason === "admin" ? (
          <p className="text-sm text-foreground/70">
            You will be redirected to Meetings shortly.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {reason === "admin" ? (
            <ButtonLink href="/meetings" size="sm">
              Go to meetings
            </ButtonLink>
          ) : null}
          <Link className="text-sm underline" href="/dashboard">
            Go to dashboard
          </Link>
          {redirectTo !== "/dashboard" ? (
            <span className="text-xs text-foreground/60">
              Requested: <span className="font-mono">{redirectTo}</span>
            </span>
          ) : null}
        </div>

        {user ? (
          <form action="/auth/signout" method="post">
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        ) : (
          <Link className="text-sm underline" href={`/login?redirectTo=${encodeURIComponent(redirectTo)}`}>
            Sign in
          </Link>
        )}
      </div>
    </PageShell>
  );
}
