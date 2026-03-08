import Link from "next/link";

import { AdminDomainCard } from "@/components/admin/admin-domain-card";
import { AdminHero } from "@/components/admin/admin-hero";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminStatStrip } from "@/components/admin/admin-stat-strip";
import { AdminSurface } from "@/components/admin/admin-surface";
import type { AdminCardMetric, AdminStat } from "@/components/admin/admin-types";
import { Button } from "@/components/ui/button";
import { getDefaultAdminPath, getVisibleAdminDomains } from "@/lib/admin/navigation.mjs";
import { loadAdminHubSnapshot, requireAdminViewer } from "@/lib/admin/server";

import { AdminPanel } from "./admin-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin", capability: "hub" });
  const snapshot = await loadAdminHubSnapshot({ tier: viewer.tier, isEvp: viewer.isEvp });
  const visibleDomains = getVisibleAdminDomains({ tier: viewer.tier, isEvp: viewer.isEvp });
  const defaultPath = getDefaultAdminPath({ tier: viewer.tier, isEvp: viewer.isEvp });

  const cards: Array<{
    id: string;
    href: string;
    title: string;
    description: string;
    eyebrow?: string;
    badge?: string | null;
    issue?: string | null;
    metrics?: AdminCardMetric[];
    primaryLabel?: string;
  }> = [
    visibleDomains.includes("people")
      ? {
          id: "people",
          href: "/admin/people",
          title: "People",
          description: "Member access, role ownership, term rollover, and admin access checks live here.",
          eyebrow: snapshot.currentTermName,
          badge: snapshot.people.pendingInvites > 0 ? `${snapshot.people.pendingInvites} pending` : "stable",
          issue:
            snapshot.people.pendingInvites > 0
              ? `${snapshot.people.pendingInvites} invited members still have not signed in.`
              : snapshot.people.blockedEntries > 0
                ? `${snapshot.people.blockedEntries} blocked entries are active in the blocklist.`
                : "Invite health and role coverage look stable.",
          metrics: [
            { label: "Invites", value: String(snapshot.people.activeInvites) },
            { label: "Active roles", value: String(snapshot.people.activeRoles) },
            { label: "Pending grants", value: String(snapshot.people.pendingGrants) },
          ],
          primaryLabel: "Open People",
        }
      : null,
    visibleDomains.includes("meetings")
      ? {
          id: "meetings",
          href: "/admin/meetings",
          title: "Meetings",
          description: "Create agendas, track committee readiness, and keep meeting records from one calmer workspace.",
          eyebrow: "Publishing",
          badge: snapshot.meetings.missingNoticeCount > 0 ? `${snapshot.meetings.missingNoticeCount} notices` : "ready",
          issue:
            snapshot.meetings.missingNoticeCount > 0
              ? `${snapshot.meetings.missingNoticeCount} scheduled meetings still need public notice.`
              : "Upcoming meetings and committee coverage look healthy.",
          metrics: [
            { label: "Upcoming", value: String(snapshot.meetings.upcomingMeetings) },
            { label: "Missing agenda", value: String(snapshot.meetings.missingAgendaCount) },
            { label: "Committees", value: String(snapshot.meetings.committeeCount) },
          ],
          primaryLabel: "Open Meetings",
        }
      : null,
    visibleDomains.includes("office_hours")
      ? {
          id: "office_hours",
          href: "/admin/office-hours",
          title: "Office Hours",
          description: "Check weekly status, then jump into sessions, requirements, configuration, or exports without carrying every control at once.",
          eyebrow: "Operations",
          badge: snapshot.officeHours.officeReady ? "ready" : "setup",
          issue: snapshot.officeHours.officeReady
            ? "Office config is loaded and ready for specialist workflows."
            : "Office setup still needs attention before operations are fully reliable.",
          metrics: [
            { label: "Configured roles", value: String(snapshot.officeHours.configuredRoles) },
            { label: "Reminder", value: snapshot.officeHours.reminderEnabled ? "On" : "Off" },
            { label: "Workspace", value: snapshot.officeHours.officeReady ? "Ready" : "Needs review" },
          ],
          primaryLabel: "Open Office Hours",
        }
      : null,
  ].filter((card): card is NonNullable<typeof card> => Boolean(card));

  const quickStats: AdminStat[] = [
    {
      id: "current-term",
      label: "Current term",
      value: snapshot.currentTermName,
      detail: "Shared across People and Office Hours requirements.",
    },
    {
      id: "default-workspace",
      label: "Default workspace",
      value: defaultPath.replace("/admin/", "").replace("-", " ") || "overview",
      detail: "Where this admin tier lands first.",
    },
    {
      id: "issues",
      label: "Open issues",
      value: String(
        snapshot.people.pendingInvites +
          snapshot.people.pendingGrants +
          snapshot.meetings.missingNoticeCount +
          snapshot.meetings.missingAgendaCount,
      ),
      detail: "Visible operational follow-ups across the command center.",
      tone:
        snapshot.people.pendingInvites +
          snapshot.people.pendingGrants +
          snapshot.meetings.missingNoticeCount +
          snapshot.meetings.missingAgendaCount >
        0
          ? "warning"
          : "positive",
    },
  ];

  return (
    <div className="admin-page space-y-6">
      <AdminPanel tier={viewer.tier} isEvp={viewer.isEvp} />

      <AdminHero
        eyebrow="Command Center"
        title="A calmer way into admin work"
        description="This page is now a launcher, not a control dump. Start from status, open the domain that needs attention, and keep dense operations in focused specialist pages."
        actions={
          <>
            <Link href={defaultPath}>
              <Button>Open default workspace</Button>
            </Link>
            {visibleDomains.includes("meetings") ? (
              <Link href="/admin/meetings#admin-meetings-create">
                <Button variant="outline">Create meeting</Button>
              </Link>
            ) : null}
          </>
        }
      >
        <div className="flex flex-wrap gap-3 text-sm text-foreground/60">
          <span>Current term: {snapshot.currentTermName}</span>
          <span>Primary goal: less clutter, faster entry into real work.</span>
        </div>
      </AdminHero>

      {viewer.isReadOnly ? (
        <AdminInlineNotice tone="warning">
          Read-only access is active. You can inspect the command center and specialist pages, but write actions remain disabled.
        </AdminInlineNotice>
      ) : null}

      <AdminStatStrip stats={quickStats} />

      <div className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => (
          <AdminDomainCard key={card.id} {...card} />
        ))}
      </div>

      <AdminSurface
        title="Current issues"
        description="Only the operational items worth acting on right now stay visible here."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <AdminInlineNotice tone={snapshot.people.pendingInvites > 0 ? "warning" : "positive"}>
            People:{" "}
            {snapshot.people.pendingInvites > 0
              ? `${snapshot.people.pendingInvites} invited members still need a first sign-in.`
              : "No pending invite backlog."}
          </AdminInlineNotice>
          <AdminInlineNotice tone={snapshot.meetings.missingNoticeCount > 0 ? "warning" : "positive"}>
            Meetings:{" "}
            {snapshot.meetings.missingNoticeCount > 0
              ? `${snapshot.meetings.missingNoticeCount} scheduled meetings still need public notice.`
              : "No missing notices in the current meeting set."}
          </AdminInlineNotice>
          <AdminInlineNotice tone={snapshot.officeHours.officeReady ? "positive" : "warning"}>
            Office Hours:{" "}
            {snapshot.officeHours.officeReady
              ? "Configuration is loaded and specialist tools are ready."
              : "Office configuration still needs review before deeper work."}
          </AdminInlineNotice>
        </div>
      </AdminSurface>
    </div>
  );
}
