import { AdminHero } from "@/components/admin/admin-hero";
import { canEditOfficeHoursMemberFlow } from "@/lib/office-hours-authz.mjs";
import { ensureOfficeHoursConfigWithKioskFallback } from "@/lib/office-hours-kiosk-setup.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminViewer, type OfficeConfigRow } from "@/lib/admin/server";

import { listKioskAdminMembers } from "@/app/api/office-hours/kiosk/_kiosk";

import { OfficeHoursSectionNav } from "./_components/office-hours-section-nav";
import { OfficeHoursKioskPanel } from "./_components/office-hours-kiosk-panel";

export async function OfficeHoursKioskPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/office-hours/kiosk", capability: "office_hours" });

  const admin = getSupabaseAdminClient();
  const [members, config] = await Promise.all([
    listKioskAdminMembers(admin),
    ensureOfficeHoursConfigWithKioskFallback(admin),
  ]);
  const activeUserIds = members
    .map((member) => member.user_id)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const { data: passwordReadyRows } =
    activeUserIds.length > 0
      ? await admin.from("profile_private").select("id,password_ready_at").in("id", activeUserIds)
      : { data: [] as Array<{ id: string; password_ready_at: string | null }> };

  const passwordReadyIds = new Set(
    ((passwordReadyRows ?? []) as Array<{ id: string; password_ready_at: string | null }>)
      .filter((row) => !!row.password_ready_at)
      .map((row) => row.id),
  );

  return (
    <div className="admin-page admin-page-plain space-y-8">
      <AdminHero
        eyebrow="Office Hours"
        title="Member Flow"
        description="Monitor signed-in member check-in, selfie review, and onboarding readiness without the old public picker flow."
      />
      <OfficeHoursSectionNav activeId="kiosk" />
      <OfficeHoursKioskPanel
        canEdit={canEditOfficeHoursMemberFlow(viewer)}
        initialMembers={members.map((member) => ({
          ...member,
          password_ready: member.user_id ? passwordReadyIds.has(member.user_id) : false,
        }))}
        initialConfig={
          (config as OfficeConfigRow | null) ?? {
            primary_office_location_id: "",
            quiet_hours_enabled: false,
            quiet_hours_start_local: "18:00:00",
            quiet_hours_end_local: "07:00:00",
            weekly_hours_reminder_enabled: false,
            weekly_hours_reminder_weekday: 5,
            weekly_hours_reminder_time_local: "12:00:00",
            office_hours_allow_weekends: false,
            office_hours_allowed_weekdays: [1, 2, 3, 4, 5],
            office_hours_extra_allowed_dates: [],
            kiosk_sms_enabled: false,
            kiosk_otp_ttl_minutes: 5,
            kiosk_checkout_reminder_interval_minutes: 60,
          }
        }
      />
    </div>
  );
}
