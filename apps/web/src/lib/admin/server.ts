import { cache } from "react";
import { redirect } from "next/navigation";

import { getAdminCommunicationsAccess, getAdminCommunicationTemplates } from "@/lib/admin/communications.mjs";
import { ensureOfficeHoursConfigWithKioskFallback } from "@/lib/office-hours-kiosk-setup.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

export type AdminTier = "full" | "partial" | "read-only";

export type TermRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

export type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

export type AssignmentRow = {
  id: string;
  user_id: string;
  role_key: "advisor" | "president" | "executive" | "board_member" | "volunteer";
  term_id: string | null;
  starts_at: string;
  ends_at: string | null;
  is_primary: boolean;
};

export type OfficeConfigRow = {
  primary_office_location_id: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string;
  quiet_hours_end_local: string;
  weekly_hours_reminder_enabled: boolean;
  weekly_hours_reminder_weekday: number;
  weekly_hours_reminder_time_local: string;
  office_hours_allow_weekends: boolean;
  office_hours_allowed_weekdays: number[];
  office_hours_extra_allowed_dates: string[];
  kiosk_sms_enabled: boolean;
  kiosk_otp_ttl_minutes: number;
  kiosk_checkout_reminder_interval_minutes: number;
};

export type OfficeLocationRow = {
  id: string;
  name: string;
  lat: number | null;
  lon: number | null;
  radius_m: number | null;
  grace_radius_m: number | null;
  timezone: string;
  active: boolean;
};

export type OfficeHourRequirementRow = {
  id: string;
  role_key: "advisor" | "president" | "executive" | "board_member" | "volunteer";
  term_id: string | null;
  weekly_total_hours: number;
  weekly_in_office_hours: number;
  effective_start: string | null;
  effective_end: string | null;
};

export type InviteAllowlistRow = {
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

export type InviteBlocklistRow = {
  id: string;
  pattern: string;
  pattern_normalized: string;
  is_active: boolean;
  banned_by: string | null;
  banned_at: string;
  unbanned_at: string | null;
  notes: string | null;
};

export type BootstrapRoleGrantRow = {
  id: string;
  email: string;
  email_normalized: string;
  role_key: "advisor" | "president" | "executive" | "board_member" | "volunteer";
  term_id: string | null;
  is_active: boolean;
  consumed_at: string | null;
  created_at: string;
  notes: string | null;
};

type AdminViewer = {
  userId: string;
  tier: AdminTier;
  isEvp: boolean;
};

async function ensureOfficeConfigRow(admin: ReturnType<typeof getSupabaseAdminClient>) {
  return (await ensureOfficeHoursConfigWithKioskFallback(admin)) as OfficeConfigRow;
}

const resolveAdminViewer = cache(async (): Promise<AdminViewer | null> => {
  const supabase = await getSupabaseServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: tierData, error: tierErr } = await supabase.rpc("get_admin_tier", { _uid: user.id });
  const tier = (tierData?.tier as AdminTier | null) ?? null;
  const isEvp = (tierData?.is_evp as boolean | null) ?? false;

  if (tierErr || !tier) return null;

  return { userId: user.id, tier, isEvp };
});

function getCapabilityFlags(tier: AdminTier, isEvp: boolean) {
  return {
    canAccessPeople: tier === "full",
    canAccessAudit: tier === "full",
    canAccessOfficeHours: (tier === "full" || isEvp) && tier !== "read-only",
    isReadOnly: tier === "read-only",
  };
}

export async function requireAdminViewer({
  redirectTo,
  capability = "hub",
}: {
  redirectTo: string;
  capability?: "hub" | "people" | "audit" | "office_hours";
}) {
  const viewer = await resolveAdminViewer();

  if (!viewer) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  const flags = getCapabilityFlags(viewer.tier, viewer.isEvp);
  const allowed =
    capability === "hub" ||
    (capability === "people" && flags.canAccessPeople) ||
    (capability === "audit" && flags.canAccessAudit) ||
    (capability === "office_hours" && flags.canAccessOfficeHours);

  if (!allowed) {
    redirect(`/unauthorized?reason=admin&redirectTo=${encodeURIComponent(redirectTo)}`);
  }

  return { ...viewer, ...flags };
}

export async function loadLegacyAdminWorkspaceData({
  tier,
  isEvp,
}: {
  tier: AdminTier;
  isEvp: boolean;
}) {
  const canSeeAccessTab = tier === "full";
  const canSeeOfficeConfig = (tier === "full" || isEvp) && tier !== "read-only";
  const shouldLoadUsers = canSeeAccessTab || canSeeOfficeConfig;

  const admin = getSupabaseAdminClient();

  const usersPromise = shouldLoadUsers
    ? admin
        .from("profiles")
        .select("id,display_name,status,created_at,profile_private(email)")
        .order("created_at", { ascending: false })
    : Promise.resolve({ data: [] as Array<unknown> });

  const [{ data: terms }, { data: usersRaw }] = await Promise.all([
    admin.from("terms").select("id,name,start_date,end_date,is_current").order("created_at", { ascending: false }),
    usersPromise,
  ]);

  const safeTerms = (terms ?? []) as TermRow[];
  const safeUsers =
    usersRaw?.map((row) => {
      const maybePrivate = (row as { profile_private?: { email?: string | null } | null }).profile_private;
      return {
        id: (row as { id: string }).id,
        email: maybePrivate?.email ?? null,
        display_name: (row as { display_name: string | null }).display_name ?? null,
        status: (row as { status: string }).status,
        created_at: (row as { created_at: string }).created_at,
      };
    }) ?? [];

  const selectedTermId = safeTerms.find((term) => term.is_current)?.id ?? safeTerms[0]?.id ?? "";

  let globalAdvisorAssignments: AssignmentRow[] = [];
  let termAssignments: AssignmentRow[] = [];

  if (canSeeAccessTab) {
    const [globalAdvisorRes, termAssignmentsRes] = await Promise.all([
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

    globalAdvisorAssignments = (globalAdvisorRes.data ?? []) as AssignmentRow[];
    termAssignments = (termAssignmentsRes.data ?? []) as AssignmentRow[];
  }

  let initialInvitesAllowlist: InviteAllowlistRow[] = [];
  let initialInvitesBlocklist: InviteBlocklistRow[] = [];
  let initialBootstrapRoleGrants: BootstrapRoleGrantRow[] = [];

  if (canSeeAccessTab) {
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
  }

  let initialOfficeConfig: OfficeConfigRow | null = null;
  let initialOfficeLocation: OfficeLocationRow | null = null;
  let initialOfficeHourRequirements: OfficeHourRequirementRow[] = [];

  if (canSeeOfficeConfig) {
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
      initialOfficeConfig = null;
      initialOfficeLocation = null;
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
      initialOfficeHourRequirements = [];
    }
  }

  return {
    initialTerms: safeTerms,
    initialUsers: safeUsers as UserRow[],
    initialSelectedTermId: selectedTermId,
    initialGlobalAdvisorAssignments: globalAdvisorAssignments,
    initialTermAssignments: termAssignments,
    initialInvitesAllowlist,
    initialInvitesBlocklist,
    initialBootstrapRoleGrants,
    initialOfficeConfig,
    initialOfficeLocation,
    initialOfficeHourRequirements,
  };
}

export async function loadAdminHubSnapshot({
  tier,
  isEvp,
}: {
  tier: AdminTier;
  isEvp: boolean;
}) {
  const data = await loadLegacyAdminWorkspaceData({ tier, isEvp });
  const admin = getSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const activeInvites = data.initialInvitesAllowlist.filter((invite) => invite.is_active);
  const exactInviteCount = activeInvites.filter((invite) => !invite.email_normalized.startsWith("@")).length;
  const pendingInvites = activeInvites.filter(
    (invite) => !invite.email_normalized.startsWith("@") && !data.initialUsers.some((user) => user.email?.toLowerCase() === invite.email_normalized),
  ).length;
  const activeRoles = data.initialGlobalAdvisorAssignments.length + data.initialTermAssignments.length;
  const blockedEntries = data.initialInvitesBlocklist.filter((ban) => ban.is_active).length;
  const configuredOfficeRoles = data.initialOfficeHourRequirements.filter((row) => row.weekly_total_hours > 0).length;

  const [{ data: meetings }, { count: committeeCount }] = await Promise.all([
    admin
      .from("meetings")
      .select("id,status,starts_at,notice_posted_at,agenda_posted_at,minutes_posted_at")
      .order("starts_at", { ascending: true })
      .limit(200),
    admin.from("committees").select("id", { count: "exact", head: true }),
  ]);

  const safeMeetings = (meetings ?? []) as Array<{
    id: string;
    status: string;
    starts_at: string;
    notice_posted_at: string | null;
    agenda_posted_at: string | null;
    minutes_posted_at: string | null;
  }>;
  const scheduledMeetings = safeMeetings.filter((meeting) => meeting.status === "scheduled");
  const upcomingMeetings = scheduledMeetings.filter((meeting) => meeting.starts_at >= nowIso);
  const missingNoticeCount = scheduledMeetings.filter((meeting) => !meeting.notice_posted_at).length;
  const missingAgendaCount = scheduledMeetings.filter((meeting) => !meeting.agenda_posted_at).length;
  const communicationsAccess = getAdminCommunicationsAccess({ tier, isEvp });
  const communicationsTemplates = communicationsAccess.canAccess ? getAdminCommunicationTemplates(communicationsAccess) : [];
  const sinceIso = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { count: recentEmailFailures } = communicationsAccess.canAccess
    ? await admin
        .from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("channel", "email")
        .eq("status", "failed")
        .gte("created_at", sinceIso)
    : { count: 0 };

  return {
    currentTermName: data.initialTerms.find((term) => term.id === data.initialSelectedTermId)?.name ?? "No term selected",
    people: {
      activeInvites: activeInvites.length,
      pendingInvites,
      exactInviteCount,
      activeRoles,
      blockedEntries,
      pendingGrants: data.initialBootstrapRoleGrants.length,
    },
    officeHours: {
      configuredRoles: configuredOfficeRoles,
      officeReady: Boolean(data.initialOfficeConfig && data.initialOfficeLocation),
      reminderEnabled: Boolean(data.initialOfficeConfig?.weekly_hours_reminder_enabled),
    },
    communications: {
      templateCount: communicationsTemplates.length,
      recentFailures: recentEmailFailures ?? 0,
    },
    meetings: {
      upcomingMeetings: upcomingMeetings.length,
      missingNoticeCount,
      missingAgendaCount,
      committeeCount: committeeCount ?? 0,
    },
  };
}
