import { AdminHero } from "@/components/admin/admin-hero";
import { startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { requireAdminViewer } from "@/lib/admin/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { OfficeHoursSectionNav } from "./_components/office-hours-section-nav";
import { OfficeHoursSchedulePanel } from "./office-hours-schedule-panel";

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

type OfficeLocationRow = {
  id: string;
  name: string;
  timezone: string | null;
};

export async function OfficeHoursSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminViewer({ redirectTo: "/admin/office-hours/schedule", capability: "office_hours" });

  const params = (await searchParams) ?? {};
  const weekStartParam = typeof params.weekStart === "string" ? params.weekStart : null;
  const userId = typeof params.userId === "string" ? params.userId : "";
  const compose = typeof params.compose === "string" ? params.compose === "1" || params.compose === "true" : false;
  const initialWeekStart = startOfWeekMondayDateOnly(weekStartParam ?? todayDateString()) ?? todayDateString();

  const admin = getSupabaseAdminClient();
  const [{ data: usersRaw }, { data: locationsRaw }] = await Promise.all([
    admin.rpc("admin_list_allowlisted_users", { _limit: 500 }),
    admin.from("office_locations").select("id,name,timezone").eq("active", true).order("name", { ascending: true }),
  ]);

  const users =
    ((usersRaw ?? []) as UserRow[]).map((row) => ({
      id: row.id,
      email: row.email ?? null,
      display_name: row.display_name ?? null,
      status: row.status,
      created_at: row.created_at,
    })) ?? [];

  const locations =
    ((locationsRaw ?? []) as OfficeLocationRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      timezone: row.timezone ?? null,
    })) ?? [];

  return (
    <div className="admin-page admin-page-plain space-y-6">
      <AdminHero
        eyebrow="Office Hours"
        title="Schedule"
        description="Manage future Office Hours shifts in one focused weekly workspace. Edits and cancellations stay audited and preserve history."
      />

      <OfficeHoursSectionNav activeId="schedule" />
      <OfficeHoursSchedulePanel
        initialUsers={users}
        initialLocations={locations}
        initialWeekStart={initialWeekStart}
        initialSelectedUserId={userId}
        initialComposeOpen={compose}
      />
    </div>
  );
}
