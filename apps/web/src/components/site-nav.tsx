import Link from "next/link";

import { SiteNavLinks } from "@/components/site-nav-links";
import { ButtonLink } from "@/components/ui/button-link";
import { UserMenu } from "@/components/user-menu";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/meetings", label: "Meetings" },
  { href: "/tasks", label: "Tasks" },
  { href: "/office-hours", label: "Office Hours" },
];

const resourceLinks = [
  { href: "/finance", label: "Finance" },
  { href: "/docs", label: "Documents" },
];
const communityLinks = [
  { href: "/clubs", label: "Clubs" },
  { href: "/icc", label: "ICC" },
];
const adminLink = { href: "/admin", label: "Admin" };
const createMeetingLink = { href: "/admin/meetings#admin-meetings-create", label: "Create meeting" };

const publicLinks = [{ href: "/office-hours/kiosk", label: "Office Hours Form" }];

export async function SiteNav() {
  let user: { id: string; email: string | null } | null = null;
  let isAdmin = false;
  let canCreateMeeting = false;

  try {
    const supabase = await getSupabaseServerComponentClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (authUser) {
      user = { id: authUser.id, email: authUser.email ?? null };
      const { data: tierData, error: tierErr } = await supabase.rpc("get_admin_tier", { _uid: authUser.id });
      const tier = (tierData?.tier as string | null) ?? null;
      isAdmin = !tierErr && !!tier;
      canCreateMeeting = isAdmin && tier !== "read-only";
    }
  } catch {
    user = null;
    isAdmin = false;
    canCreateMeeting = false;
  }

  const navLinks = user ? primaryLinks : publicLinks;
  const adminItems = isAdmin ? [adminLink, ...(canCreateMeeting ? [createMeetingLink] : [])] : [];
  const navSections = user
    ? [
        { label: "Resources", items: resourceLinks },
        { label: "Community", items: communityLinks },
        ...(adminItems.length ? [{ label: "Admin", items: adminItems }] : []),
      ]
    : [];

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="relative mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-4">
        <Link
          href="/dashboard"
          className="flex items-center gap-3 font-semibold tracking-tight hover:text-foreground/90"
          aria-label="Go to dashboard"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary ring-1 ring-primary/20">
            AS
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">ASGC OS</span>
            <span className="hidden text-[0.65rem] font-normal text-foreground/60 sm:block">
              Student government operations
            </span>
          </span>
        </Link>
        <SiteNavLinks
          primary={navLinks}
          sections={navSections}
          className="md:absolute md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2"
        />

        <div className="flex shrink-0 items-center gap-2">
          {user ? (
            <UserMenu userEmail={user.email} userId={user.id} />
          ) : (
            <ButtonLink href="/login" size="sm" variant="outline">
              Sign in
            </ButtonLink>
          )}
        </div>
      </div>
    </header>
  );
}
