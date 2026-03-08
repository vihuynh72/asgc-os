import { AdminDomainCard } from "@/components/admin/admin-domain-card";
import { AdminHero } from "@/components/admin/admin-hero";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminStatStrip } from "@/components/admin/admin-stat-strip";
import { loadAdminHubSnapshot, loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/office-hours", capability: "office_hours" });
  const [snapshot, data] = await Promise.all([
    loadAdminHubSnapshot({ tier: viewer.tier, isEvp: viewer.isEvp }),
    loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp }),
  ]);

  return (
    <div className="admin-page space-y-6">
      <AdminHero
        eyebrow="Office Hours"
        title="Overview first, operations when you ask for them"
        description="This route stays focused on the current office-hours posture. Sessions, requirement editing, config work, and exports each have their own destination."
      />

      <AdminSectionNav
        activeId="overview"
        items={[
          { id: "overview", label: "Overview", href: "/admin/office-hours" },
          { id: "sessions", label: "Sessions", href: "/admin/office-hours/sessions" },
          { id: "requirements", label: "Requirements", href: "/admin/office-hours/requirements" },
          { id: "config", label: "Config", href: "/admin/office-hours/config" },
          { id: "export", label: "Export", href: "/admin/office-hours/export" },
        ]}
      />

      <AdminStatStrip
        stats={[
          {
            id: "office-config",
            label: "Workspace",
            value: snapshot.officeHours.officeReady ? "Ready" : "Needs review",
            detail: data.initialOfficeLocation ? `${data.initialOfficeLocation.name} loaded` : "Primary office location still needs review",
            tone: snapshot.officeHours.officeReady ? "positive" : "warning",
          },
          {
            id: "office-roles",
            label: "Configured roles",
            value: String(snapshot.officeHours.configuredRoles),
            detail: `Requirements for ${snapshot.currentTermName}`,
          },
          {
            id: "office-reminder",
            label: "Weekly reminder",
            value: snapshot.officeHours.reminderEnabled ? "On" : "Off",
            detail: "Pulled from the shared office configuration.",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminDomainCard
          href="/admin/office-hours/sessions"
          title="Sessions"
          description="Day, week, and month views for live and historical session review, photo inspection, and admin overrides."
          badge="reference flow"
          metrics={[
            { label: "View modes", value: "3" },
            { label: "Overrides", value: "Drawer-based" },
          ]}
          issue="Use this for real operational work; it is the quality bar for the rest of admin."
          primaryLabel="Open sessions"
        />
        <AdminDomainCard
          href="/admin/office-hours/requirements"
          title="Requirements"
          description="Weekly hour expectations separated from daily operations so requirement edits do not crowd the live workspace."
          badge={snapshot.currentTermName}
          metrics={[
            { label: "Configured roles", value: String(snapshot.officeHours.configuredRoles), tone: snapshot.officeHours.configuredRoles > 0 ? "positive" : "warning" },
          ]}
          issue="Keep edits here; the overview only shows status."
          primaryLabel="Edit requirements"
        />
        <AdminDomainCard
          href="/admin/office-hours/config"
          title="Config"
          description="Geofence, quiet hours, reminder timing, and office policy settings in one calmer editor."
          badge={snapshot.officeHours.officeReady ? "ready" : "review"}
          metrics={[
            { label: "Reminder", value: snapshot.officeHours.reminderEnabled ? "On" : "Off" },
            { label: "Location", value: data.initialOfficeLocation?.name ?? "Unset", tone: data.initialOfficeLocation ? "positive" : "warning" },
          ]}
          issue={snapshot.officeHours.officeReady ? "No obvious config blockers." : "Primary office setup still needs review."}
          primaryLabel="Open config"
        />
        <AdminDomainCard
          href="/admin/office-hours/export"
          title="Export"
          description="Weekly totals, deficit checks, and raw CSV views without leaving operational session work open."
          badge="reporting"
          metrics={[
            { label: "Raw CSV", value: "Available" },
            { label: "Weekly preview", value: "On demand" },
          ]}
          issue="Run exports here instead of from the command center."
          primaryLabel="Open export"
        />
      </div>
    </div>
  );
}
