import type { AdminDomainId, AdminSubsectionId } from "@/components/admin/admin-types";
import { loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";

import { AdminWorkspacePanel } from "./admin-workspace-panel";

export async function AdminWorkspaceRoute({
  redirectTo,
  capability = "hub",
  forcedTab,
  forcedSection,
  officeHoursFocus,
}: {
  redirectTo: string;
  capability?: "hub" | "people" | "audit" | "office_hours";
  forcedTab: AdminDomainId;
  forcedSection?: AdminSubsectionId;
  officeHoursFocus?: "overview" | "requirements" | "config";
}) {
  const viewer = await requireAdminViewer({ redirectTo, capability });
  const data = await loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp });

  return (
    <AdminWorkspacePanel
      {...data}
      tier={viewer.tier}
      isEvp={viewer.isEvp}
      forcedTab={forcedTab}
      forcedSection={forcedSection}
      officeHoursFocus={officeHoursFocus}
    />
  );
}
