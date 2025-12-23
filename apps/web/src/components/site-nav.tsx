import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

const appLinks = [
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

  const links = user ? appLinks.filter((l) => l.href !== "/admin" || isAdmin) : publicLinks;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="font-semibold">
          ASGC OS
        </Link>
        <nav aria-label="Primary" className="flex min-w-0 flex-1 gap-4 overflow-x-auto whitespace-nowrap text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-foreground/80 hover:text-foreground"
            >
              {l.label}
            </Link>
          ))}
        </nav>

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
