import { AdminHero } from "@/components/admin/admin-hero";
import { loadLegacyAdminWorkspaceData, requireAdminViewer } from "@/lib/admin/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { listKioskAdminMembers } from "@/app/api/office-hours/kiosk/_kiosk";

import { OfficeHoursSectionNav } from "./_components/office-hours-section-nav";
import { OfficeHoursTestingLab } from "./_components/office-hours-testing-lab";

export async function OfficeHoursLabPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/office-hours/lab", capability: "office_hours" });
  const data = await loadLegacyAdminWorkspaceData({ tier: viewer.tier, isEvp: viewer.isEvp });
  const admin = getSupabaseAdminClient();
  const kioskMembers = await listKioskAdminMembers(admin);

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="Office Hours"
        title="Testing Lab"
        description="Exercise the real Office Hours policy and platform logic before you trust a config change. Simulate broad edge cases, then run selective live verification with cleanup."
      />
      <OfficeHoursSectionNav activeId="lab" />
      <OfficeHoursTestingLab
        initialOfficeConfig={data.initialOfficeConfig}
        initialOfficeLocation={data.initialOfficeLocation}
        initialUsers={data.initialUsers}
        initialKioskMembers={kioskMembers
          .filter((member) => member.user_id)
          .map((member) => ({
            user_id: member.user_id!,
            display_name: member.display_name,
            role_label: member.role_label,
            phone_last4: member.phone_last4 ?? null,
          }))}
      />
    </div>
  );
}
