import { AdminDomainCard } from "@/components/admin/admin-domain-card";
import { AdminHero } from "@/components/admin/admin-hero";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminStatStrip } from "@/components/admin/admin-stat-strip";
import { loadAdminHubSnapshot, loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeoplePage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/people", capability: "people" });
  const [snapshot, data] = await Promise.all([
    loadAdminHubSnapshot({ tier: viewer.tier, isEvp: viewer.isEvp }),
    loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp }),
  ]);

  return (
    <div className="admin-page space-y-6">
      <AdminHero
        eyebrow="People"
        title="People operations without the pileup"
        description="Access, assignments, terms, and audits are split into separate workspaces so member operations stay easier to scan and harder to misuse."
      />

      <AdminSectionNav
        activeId="overview"
        items={[
          { id: "overview", label: "Overview", href: "/admin/people" },
          { id: "invites", label: "Invites", href: "/admin/people/invites" },
          { id: "assignments", label: "Assignments", href: "/admin/people/assignments" },
          { id: "terms", label: "Terms", href: "/admin/people/terms" },
          { id: "access_audit", label: "Access Audit", href: "/admin/people/access-audit" },
        ]}
      />

      <AdminStatStrip
        stats={[
          {
            id: "people-invites",
            label: "Active invites",
            value: String(snapshot.people.activeInvites),
            detail: `${snapshot.people.pendingInvites} still waiting for first sign-in`,
            tone: snapshot.people.pendingInvites > 0 ? "warning" : "positive",
          },
          {
            id: "people-roles",
            label: "Active roles",
            value: String(snapshot.people.activeRoles),
            detail: "Global advisor roles plus the current term assignments.",
          },
          {
            id: "people-terms",
            label: "Terms",
            value: String(data.initialTerms.length),
            detail: `Current term: ${snapshot.currentTermName}`,
          },
          {
            id: "people-bans",
            label: "Blocked entries",
            value: String(snapshot.people.blockedEntries),
            detail: `${snapshot.people.pendingGrants} pending pre-login role grants`,
            tone: snapshot.people.blockedEntries > 0 ? "warning" : "default",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminDomainCard
          href="/admin/people/invites"
          title="Invites"
          description="Allowlist, blocklist, bulk import, and pre-login role grants in one focused workspace."
          badge={snapshot.people.pendingInvites > 0 ? `${snapshot.people.pendingInvites} pending` : "stable"}
          metrics={[
            { label: "Exact email invites", value: String(snapshot.people.exactInviteCount) },
            { label: "Pending grants", value: String(snapshot.people.pendingGrants), tone: snapshot.people.pendingGrants > 0 ? "warning" : "default" },
          ]}
          issue={
            snapshot.people.pendingInvites > 0
              ? `${snapshot.people.pendingInvites} invited members still need a first sign-in.`
              : "No invite backlog."
          }
          primaryLabel="Manage invites"
        />
        <AdminDomainCard
          href="/admin/people/assignments"
          title="Assignments"
          description="Current signed-in role ownership, revocations, and role filtering for the active term."
          badge={snapshot.currentTermName}
          metrics={[
            { label: "Global + term roles", value: String(snapshot.people.activeRoles) },
            { label: "Terms", value: String(data.initialTerms.length) },
          ]}
          issue="Keep assignments here; term rollover and audit checks live separately."
          primaryLabel="Open assignments"
        />
        <AdminDomainCard
          href="/admin/people/terms"
          title="Terms"
          description="Create terms, set the current term, and run rollover without mixing that flow into daily role management."
          badge={data.initialTerms.find((term) => term.is_current)?.name ?? "none"}
          metrics={[
            { label: "Available terms", value: String(data.initialTerms.length) },
            { label: "Current", value: snapshot.currentTermName },
          ]}
          issue="Term changes affect role scoping and office-hours requirements."
          primaryLabel="Manage terms"
        />
        <AdminDomainCard
          href="/admin/people/access-audit"
          title="Access Audit"
          description="Review current admin access and investigate mismatches without wading through invite or assignment tools."
          badge={snapshot.people.blockedEntries > 0 ? "review" : "ready"}
          metrics={[
            { label: "Blocked entries", value: String(snapshot.people.blockedEntries), tone: snapshot.people.blockedEntries > 0 ? "warning" : "default" },
            { label: "Pending grants", value: String(snapshot.people.pendingGrants), tone: snapshot.people.pendingGrants > 0 ? "warning" : "default" },
          ]}
          issue="Use this when you need to verify who should actually have admin access."
          primaryLabel="Run audit"
        />
      </div>
    </div>
  );
}
