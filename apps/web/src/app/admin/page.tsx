import { PageShell } from "@/components/page-shell";
import { AdminPanel } from "./admin-panel";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type AssignmentRow = {
  id: string;
  user_id: string;
  role_key: "advisor" | "president" | "executive" | "director" | "board_member" | "volunteer";
  term_id: string | null;
  starts_at: string;
  ends_at: string | null;
  is_primary: boolean;
};

type OfficeConfigRow = {
  primary_office_location_id: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string;
  quiet_hours_end_local: string;
};

type OfficeLocationRow = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  radius_m: number | null;
  grace_radius_m: number | null;
  timezone: string;
  active: boolean;
};

type OfficeHourRequirementRow = {
  id: string;
  role_key: "advisor" | "president" | "executive" | "director" | "board_member" | "volunteer";
  term_id: string | null;
  weekly_total_hours: number;
  weekly_in_office_hours: number;
  effective_start: string | null;
  effective_end: string | null;
};

type InviteAllowlistRow = {
  id: string;
  email: string;
  email_normalized: string;
  sort_order: number;
  is_active: boolean;
  invited_by: string | null;
  invited_at: string;
  revoked_at: string | null;
  notes: string | null;
};

type InviteBlocklistRow = {
  id: string;
  pattern: string;
  pattern_normalized: string;
  is_active: boolean;
  banned_by: string | null;
  banned_at: string;
  unbanned_at: string | null;
  notes: string | null;
};

type BootstrapRoleGrantRow = {
  id: string;
  email: string;
  email_normalized: string;
  role_key: "advisor" | "president" | "executive" | "director" | "board_member" | "volunteer";
  term_id: string | null;
  is_active: boolean;
  consumed_at: string | null;
  created_at: string;
  notes: string | null;
};

async function ensureOfficeConfigRow(admin: ReturnType<typeof getSupabaseAdminClient>) {
  const { data: existing, error: existingErr } = await admin
    .from("office_config")
    .select("primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local")
    .eq("id", true)
    .maybeSingle();

  if (existingErr) throw existingErr;
  if (existing) return existing as OfficeConfigRow;

  const { data: office, error: officeErr } = await admin
    .from("office_locations")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (officeErr) throw officeErr;
  if (!office?.id) throw new Error("No office_locations row found");

  const { data: inserted, error: insertErr } = await admin
    .from("office_config")
    .insert({ id: true, primary_office_location_id: office.id })
    .select("primary_office_location_id,quiet_hours_enabled,quiet_hours_start_local,quiet_hours_end_local")
    .single();

  if (insertErr) throw insertErr;
  return inserted as OfficeConfigRow;
}

export default async function AdminPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    redirect("/unauthorized?reason=admin&redirectTo=/admin");
  }

  const admin = getSupabaseAdminClient();

  const [{ data: terms }, { data: usersRaw }] = await Promise.all([
    admin.from("terms").select("id,name,start_date,end_date,is_current").order("created_at", { ascending: false }),
    admin
      .from("profiles")
      .select("id,display_name,status,created_at,profile_private(email)")
      .order("created_at", { ascending: false }),
  ]);

  const safeTerms = terms ?? [];
  const safeUsers =
    usersRaw?.map((row) => {
      const maybePrivate = (row as unknown as { profile_private?: { email?: string | null } | null }).profile_private;
      return {
        id: (row as unknown as { id: string }).id,
        email: maybePrivate?.email ?? null,
        display_name: (row as unknown as { display_name: string | null }).display_name ?? null,
        status: (row as unknown as { status: string }).status,
        created_at: (row as unknown as { created_at: string }).created_at,
      };
    }) ?? [];
  const selectedTermId =
    safeTerms.find((t) => t.is_current)?.id ?? safeTerms[0]?.id ?? "";

  const [{ data: globalAdvisorAssignments }, { data: termAssignments }] = await Promise.all([
      admin
        .from("role_assignments")
        .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary")
        .eq("role_key", "advisor")
        .is("term_id", null)
        .is("ends_at", null)
        .order("starts_at", { ascending: false }),
      selectedTermId
        ? admin
            .from("role_assignments")
            .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary")
            .eq("term_id", selectedTermId)
            .is("ends_at", null)
            .order("starts_at", { ascending: false })
        : Promise.resolve({ data: [] as AssignmentRow[] }),
    ]);

  let initialInvitesAllowlist: InviteAllowlistRow[] = [];
  try {
    const { data: invites } = await admin
      .from("invites_allowlist")
      .select("id,email,email_normalized,sort_order,is_active,invited_by,invited_at,revoked_at,notes")
      .order("sort_order", { ascending: false })
      .order("invited_at", { ascending: false })
      .limit(200);
    initialInvitesAllowlist = (invites ?? []) as InviteAllowlistRow[];
  } catch {
    initialInvitesAllowlist = [];
  }

  let initialInvitesBlocklist: InviteBlocklistRow[] = [];
  try {
    const { data: bans } = await admin
      .from("invites_blocklist")
      .select("id,pattern,pattern_normalized,is_active,banned_by,banned_at,unbanned_at,notes")
      .order("is_active", { ascending: false })
      .order("banned_at", { ascending: false })
      .limit(200);
    initialInvitesBlocklist = (bans ?? []) as InviteBlocklistRow[];
  } catch {
    initialInvitesBlocklist = [];
  }

  let initialBootstrapRoleGrants: BootstrapRoleGrantRow[] = [];
  try {
    const { data: grants } = await admin
      .from("bootstrap_role_grants")
      .select("id,email,email_normalized,role_key,term_id,is_active,consumed_at,created_at,notes")
      .eq("is_active", true)
      .is("consumed_at", null)
      .order("created_at", { ascending: false })
      .limit(500);
    initialBootstrapRoleGrants = (grants ?? []) as BootstrapRoleGrantRow[];
  } catch {
    initialBootstrapRoleGrants = [];
  }

  // Phase 11: office config + quiet hours (best-effort; requires Phase 11 migration applied)
  let initialOfficeConfig: OfficeConfigRow | null = null;
  let initialOfficeLocation: OfficeLocationRow | null = null;

  // Phase 12: office hour requirements (best-effort)
  let initialOfficeHourRequirements: OfficeHourRequirementRow[] = [];

  try {
    initialOfficeConfig = await ensureOfficeConfigRow(admin);

    const { data: location, error: locationErr } = await admin
      .from("office_locations")
      .select("id,name,lat,lon,radius_m,grace_radius_m,timezone,active")
      .eq("id", initialOfficeConfig.primary_office_location_id)
      .single();

    if (!locationErr) {
      initialOfficeLocation = location as OfficeLocationRow;
    }
  } catch {
    // If Phase 11 isn't applied yet, keep nulls. The client can still load via /api/admin/office-config.
  }

  try {
    if (selectedTermId) {
      const { data: reqs, error: reqErr } = await admin
        .from("office_hour_requirements")
        .select(
          "id,role_key,term_id,weekly_total_hours,weekly_in_office_hours,effective_start,effective_end",
        )
        .eq("term_id", selectedTermId)
        .is("effective_start", null)
        .is("effective_end", null)
        .order("role_key", { ascending: true });

      if (!reqErr) {
        initialOfficeHourRequirements = (reqs ?? []) as OfficeHourRequirementRow[];
      }
    }
  } catch {
    // Keep empty; the client can load via /api/admin/office-hour-requirements.
  }

  return (
    <PageShell title="Admin" description="Manage terms and role assignments.">
      <AdminPanel
        initialTerms={safeTerms}
        initialUsers={safeUsers}
        initialSelectedTermId={selectedTermId}
        initialGlobalAdvisorAssignments={(globalAdvisorAssignments ?? []) as AssignmentRow[]}
        initialTermAssignments={(termAssignments ?? []) as AssignmentRow[]}
        initialInvitesAllowlist={initialInvitesAllowlist}
        initialInvitesBlocklist={initialInvitesBlocklist}
        initialBootstrapRoleGrants={initialBootstrapRoleGrants}
        initialOfficeConfig={initialOfficeConfig}
        initialOfficeLocation={initialOfficeLocation}
        initialOfficeHourRequirements={initialOfficeHourRequirements}
      />
    </PageShell>
  );
}
