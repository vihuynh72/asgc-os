import { normalizeDateOnlyString, todayDateString } from "@/lib/dateOnly";
import { requireAdminViewer } from "@/lib/admin/server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { AdminOfficeHoursPanel } from "./admin-office-hours-panel";
import { OfficeHoursSectionNav } from "./_components/office-hours-section-nav";

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

function firstString(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
}

function normalizeView(value: string | undefined): "day" | "week" | "month" | undefined {
  return value === "day" || value === "week" || value === "month" ? value : undefined;
}

export async function OfficeHoursSessionsPage({
  redirectTo = "/admin/office-hours",
  searchParams,
}: {
  redirectTo?: string;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminViewer({ redirectTo, capability: "office_hours" });
  const params = (await searchParams) ?? {};
  const initialSelectedUserId = firstString(params.userId) ?? "";
  const initialAnchorDate =
    normalizeDateOnlyString(firstString(params.date) ?? "") ??
    normalizeDateOnlyString(firstString(params.weekStart) ?? "") ??
    todayDateString();
  const initialView = normalizeView(firstString(params.view)) ?? "week";
  const initialComposeOpen =
    typeof firstString(params.compose) === "string"
      ? firstString(params.compose) === "1" || firstString(params.compose) === "true"
      : false;
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
    <div className="admin-page admin-page-plain space-y-4">
      <div className="space-y-1">
        <div className="admin-eyebrow">Office Hours</div>
        <h1 className="text-[2rem] font-semibold tracking-[-0.05em] text-foreground sm:text-[2.2rem]">Sessions</h1>
      </div>

      <OfficeHoursSectionNav activeId="sessions" />

      <AdminOfficeHoursPanel
        initialUsers={users as UserRow[]}
        initialLocations={locations}
        initialSelectedUserId={initialSelectedUserId}
        initialAnchorDate={initialAnchorDate}
        initialView={initialView}
        initialComposeOpen={initialComposeOpen}
      />
    </div>
  );
}
