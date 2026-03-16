import { redirect } from "next/navigation";
import { AdminHero } from "@/components/admin/admin-hero";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { requireAdminViewer, type OfficeConfigRow } from "@/lib/admin/server";

import { listKioskMembers } from "@/app/api/office-hours/kiosk/_kiosk";

import { OfficeHoursSectionNav } from "./_components/office-hours-section-nav";
import { OfficeHoursKioskPanel } from "./_components/office-hours-kiosk-panel";

export async function OfficeHoursKioskPage() {
  const viewer = await requireAdminViewer({ redirectTo: "/admin/office-hours/kiosk", capability: "office_hours" });
  if (viewer.tier !== "full") {
    redirect("/unauthorized?reason=admin&redirectTo=/admin/office-hours/kiosk");
  }

  const admin = getSupabaseAdminClient();
  const [members, config] = await Promise.all([
    listKioskMembers(admin),
    admin
      .from("office_config")
      .select(
        "primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local,weekly_hours_reminder_enabled,weekly_hours_reminder_weekday,weekly_hours_reminder_time_local,office_hours_allow_weekends,office_hours_allowed_weekdays,office_hours_extra_allowed_dates,kiosk_sms_enabled,kiosk_otp_ttl_minutes,kiosk_checkout_reminder_interval_minutes",
      )
      .eq("id", true)
      .maybeSingle(),
  ]);

  const smsEnvReady = Boolean(
    process.env.SMS_PROVIDER &&
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_MESSAGING_SERVICE_SID &&
      process.env.OFFICE_HOURS_KIOSK_OTP_SECRET,
  );

  return (
    <div className="admin-page space-y-8">
      <AdminHero
        eyebrow="Office Hours"
        title="Kiosk"
        description="Manage the public kiosk roster, approved phone numbers, and the SMS verification cadence without exposing full phone numbers."
      />
      <OfficeHoursSectionNav activeId="kiosk" />
      <OfficeHoursKioskPanel
        initialMembers={members}
        initialConfig={
          (config.data as OfficeConfigRow | null) ?? {
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
        smsEnvReady={smsEnvReady}
      />
    </div>
  );
}
