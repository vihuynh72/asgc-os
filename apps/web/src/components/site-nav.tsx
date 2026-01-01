import Link from "next/link";

import { SiteNavLinks } from "@/components/site-nav-links";
import { Button } from "@/components/ui/button";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/meetings", label: "Meetings" },
  { href: "/tasks", label: "Tasks" },
  { href: "/office-hours", label: "Office Hours" },
  { href: "/finance", label: "Finance" },
  { href: "/docs", label: "Documents" },
];
const communityLinks = [
  { href: "/clubs", label: "Clubs" },
  { href: "/icc", label: "ICC" },
];
const adminLink = { href: "/admin", label: "Admin" };

const publicLinks = [{ href: "/office-hours/kiosk", label: "Office Hours Form" }];

export async function SiteNav() {
  let user: { id: string; email: string | null } | null = null;
  let isAdmin = false;

  try {
    const supabase = await getSupabaseServerComponentClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (authUser) {
      user = { id: authUser.id, email: authUser.email ?? null };
      const { data: isAdminData, error: adminErr } = await supabase.rpc("is_admin", { _uid: authUser.id });
      isAdmin = !adminErr && !!isAdminData;
    }
  } catch {
    user = null;
    isAdmin = false;
  }

  const navLinks = user ? primaryLinks : publicLinks;
  const navSections = user
    ? [
        { label: "Community", items: communityLinks },
        ...(isAdmin ? [{ label: "Admin", items: [adminLink] }] : []),
      ]
    : [];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 font-semibold tracking-tight hover:text-foreground/90"
          aria-label="Go to dashboard"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            AS
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">ASGC OS</span>
            <span className="hidden text-[0.65rem] font-normal text-foreground/60 sm:block">
              Student government operations
            </span>
          </span>
        </Link>
        <SiteNavLinks primary={navLinks} sections={navSections} />

        <div className="flex shrink-0 items-center gap-2">
          {isAdmin ? (
            <Link href="/admin?tab=meetings#admin-meetings-create">
              <Button size="sm" variant="outline">
                Create meeting
              </Button>
            </Link>
          ) : null}
          {user ? (
            <>
              <Link
                href="/account"
                className="hidden max-w-[14rem] truncate text-xs text-foreground/70 hover:text-foreground sm:inline"
                title="Account"
              >
                {user.email ?? user.id}
              </Link>
              <form action="/auth/signout" method="post">
                <Button size="sm" variant="ghost" type="submit">
                  Sign out
                </Button>
              </form>
            </>
          ) : (
            <Link href="/login" className="text-sm text-foreground/80 hover:text-foreground">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
