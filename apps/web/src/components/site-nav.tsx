import Link from "next/link";

import { SiteNavLinks } from "@/components/site-nav-links";
import { Button } from "@/components/ui/button";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/meetings", label: "Meetings" },
  { href: "/tasks", label: "Tasks" },
  { href: "/office-hours", label: "Office Hours" },
];

const secondarySections = [
  {
    label: "Community",
    items: [
      { href: "/clubs", label: "Clubs" },
      { href: "/icc", label: "ICC" },
    ],
  },
  {
    label: "Resources",
    items: [
      { href: "/docs", label: "Docs" },
      { href: "/finance", label: "Finance" },
    ],
  },
  {
    label: "Admin",
    items: [{ href: "/admin", label: "Admin" }],
  },
];

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

  const sections = user
    ? secondarySections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => item.href !== "/admin" || isAdmin),
        }))
        .filter((section) => section.items.length > 0)
    : null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/dashboard" className="font-semibold">
          ASGC OS
        </Link>
        <SiteNavLinks primary={user ? primaryLinks : publicLinks} sections={sections ?? undefined} />

        <div className="flex shrink-0 items-center gap-2">
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
