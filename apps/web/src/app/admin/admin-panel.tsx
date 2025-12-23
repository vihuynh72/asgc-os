"use client";

import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { addDaysDateOnly, normalizeDateOnlyString, startOfWeekMondayDateOnly, todayDateString } from "@/lib/dateOnly";
import { allowlistKeysForNormalizedEmail } from "@/lib/invitesAllowlist";

type TermRow = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
};

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

type CommitteeRow = {
  id: string;
  name: string;
  committee_key: string;
};

type RoleKey = "advisor" | "president" | "executive" | "director" | "board_member" | "volunteer";

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

type OfficeConfigRow = {
  primary_office_location_id: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start_local: string;
  quiet_hours_end_local: string;
  weekly_hours_reminder_enabled: boolean;
  weekly_hours_reminder_weekday: number;
  weekly_hours_reminder_time_local: string;
};

type OfficeHourRequirementRow = {
  id: string;
  role_key: RoleKey;
  term_id: string | null;
  weekly_total_hours: number;
  weekly_in_office_hours: number;
  effective_start: string | null;
  effective_end: string | null;
};

type AssignmentRow = {
  id: string;
  user_id: string;
  role_key: RoleKey;
  term_id: string | null;
  starts_at: string;
  ends_at: string | null;
  is_primary: boolean;
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
  role_key: RoleKey;
  term_id: string | null;
  is_active: boolean;
  consumed_at: string | null;
  created_at: string;
  notes: string | null;
};

type AdminWeeklyHoursPreviewRow = {
  user_id: string;
  week_start: string;
  display_name: string;
  email: string;
  total_minutes: number | string;
  in_office_minutes: number | string;
  deficit_minutes: number | string;
  deficit_in_office_minutes: number | string;
};

type AdminMeetingRow = {
  id: string;
  committee_id: string | null;
  meeting_type: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type AdminMeetingDraft = {
  title: string;
  description: string;
  location: string;
  starts_at_local: string;
  ends_at_local: string;
  status: string;
};

const ROLE_OPTIONS: Array<{ key: RoleKey; label: string; scope: "global" | "term" }> = [
  { key: "advisor", label: "Advisor (global)", scope: "global" },
  { key: "president", label: "President (term)", scope: "term" },
  { key: "executive", label: "Executive (term)", scope: "term" },
  { key: "director", label: "Director (term)", scope: "term" },
  { key: "board_member", label: "Board member (term)", scope: "term" },
  { key: "volunteer", label: "Volunteer (term)", scope: "term" },
];

const MEETING_STATUS_OPTIONS = ["scheduled", "cancelled", "completed"] as const;

const ROLE_LABEL_BY_KEY: Record<RoleKey, string> = {
  advisor: "Advisor",
  president: "President",
  executive: "Executive",
  director: "Director",
  board_member: "Board member",
  volunteer: "Volunteer",
};

function formatUserLabel(u: UserRow) {
  const primary = u.display_name?.trim() || u.email?.trim() || u.id;
  const secondary = u.display_name?.trim() && u.email?.trim() ? ` (${u.email})` : "";
  return `${primary}${secondary}`;
}

function formatMeetingTypeLabel(type: string): string {
  switch (type) {
    case "board":
      return "Board";
    case "committee":
      return "Committee";
    case "icc":
      return "ICC";
    case "special":
      return "Special";
    default:
      return type;
  }
}

function datetimeLocalFromIso(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function toIsoFromDatetimeLocal(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${minutesPart}m`;
}

function parseMinutesValue(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatMinutesValue(value: number | string | null | undefined): string {
  const n = parseMinutesValue(value);
  return n === null ? "—" : formatMinutes(n);
}

type BulkInviteCandidate = { email: string; notes?: string };

function stripOuterQuotes(raw: string): string {
  const s = raw.trim();
  if (s.length >= 2 && ((s.startsWith("\"") && s.endsWith("\"")) || (s.startsWith("'") && s.endsWith("'")))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function parseBulkInvites(raw: string): BulkInviteCandidate[] {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

  const parts = raw
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .split(/[;\n]/g)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: BulkInviteCandidate[] = [];

  for (const part of parts) {
    const angleMatch = part.match(/<([^>]+)>/);
    const emailRaw = (angleMatch?.[1] ?? part.match(emailRegex)?.[0] ?? "").trim();
    if (!emailRaw) continue;

    const nameRaw = angleMatch ? part.slice(0, angleMatch.index ?? 0) : part.replace(emailRaw, "");
    const name = stripOuterQuotes(nameRaw);

    out.push({
      email: emailRaw,
      notes: name && !name.includes("@") ? name : undefined,
    });
  }

  const seen = new Set<string>();
  return out.filter((r) => {
    const key = r.email.trim().toLowerCase();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function AdminPanel({
  initialTerms,
  initialUsers,
  initialSelectedTermId,
  initialGlobalAdvisorAssignments,
  initialTermAssignments,
  initialInvitesAllowlist,
  initialInvitesBlocklist,
  initialBootstrapRoleGrants,
  initialOfficeLocation,
  initialOfficeConfig,
  initialOfficeHourRequirements,
}: {
  initialTerms: TermRow[];
  initialUsers: UserRow[];
  initialSelectedTermId: string;
  initialGlobalAdvisorAssignments: AssignmentRow[];
  initialTermAssignments: AssignmentRow[];
  initialInvitesAllowlist: InviteAllowlistRow[];
  initialInvitesBlocklist: InviteBlocklistRow[];
  initialBootstrapRoleGrants: BootstrapRoleGrantRow[];
  initialOfficeLocation: OfficeLocationRow | null;
  initialOfficeConfig: OfficeConfigRow | null;
  initialOfficeHourRequirements: OfficeHourRequirementRow[];
}) {
  const [terms, setTerms] = useState<TermRow[]>(initialTerms);
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [selectedTermId, setSelectedTermId] = useState<string>(initialSelectedTermId);
  const [adminTab, setAdminTab] = useState<"access" | "office_hours" | "roles" | "meetings">("access");

  const [globalAdvisorAssignments, setGlobalAdvisorAssignments] = useState<AssignmentRow[]>(
    initialGlobalAdvisorAssignments,
  );
  const [termAssignments, setTermAssignments] = useState<AssignmentRow[]>(initialTermAssignments);

  const [invitesAllowlist, setInvitesAllowlist] = useState<InviteAllowlistRow[]>(initialInvitesAllowlist);
  const [invitesBlocklist, setInvitesBlocklist] = useState<InviteBlocklistRow[]>(initialInvitesBlocklist);
  const [bootstrapRoleGrants, setBootstrapRoleGrants] = useState<BootstrapRoleGrantRow[]>(initialBootstrapRoleGrants);
  const [newInviteEmail, setNewInviteEmail] = useState<string>("");
  const [newInviteNotes, setNewInviteNotes] = useState<string>("");
  const [bulkInviteText, setBulkInviteText] = useState<string>("");
  const [inviteNotesDraftById, setInviteNotesDraftById] = useState<Record<string, string>>({});
  const [inviteSearch, setInviteSearch] = useState<string>("");
  const [showInactiveInvites, setShowInactiveInvites] = useState<boolean>(false);
  const [selectedInviteIds, setSelectedInviteIds] = useState<Record<string, boolean>>({});
  const [roleGrantInviteId, setRoleGrantInviteId] = useState<string | null>(null);
  const [roleGrantRoleKey, setRoleGrantRoleKey] = useState<RoleKey>("volunteer");
  const [roleGrantTermId, setRoleGrantTermId] = useState<string>(initialSelectedTermId);
  function onSelectAdminTab(nextTab: typeof adminTab) {
    if (nextTab !== "access") setRoleGrantInviteId(null);
    setAdminTab(nextTab);
    if (nextTab === "meetings") {
      void loadMeetings();
      if (committees.length === 0) {
        void loadCommittees();
      }
    }
  }

  const [newBanPattern, setNewBanPattern] = useState<string>("");
  const [newBanNotes, setNewBanNotes] = useState<string>("");

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRoleKey, setSelectedRoleKey] = useState<RoleKey>("volunteer");
  const [userSearch, setUserSearch] = useState<string>("");
  const [committees, setCommittees] = useState<CommitteeRow[]>([]);

  const [newTermName, setNewTermName] = useState<string>("");
  const [newTermStart, setNewTermStart] = useState<string>("");
  const [newTermEnd, setNewTermEnd] = useState<string>("");
  const [rolloverFromTermId, setRolloverFromTermId] = useState<string>(initialSelectedTermId);
  const [rolloverToTermId, setRolloverToTermId] = useState<string>("");
  const [rolloverEndPrior, setRolloverEndPrior] = useState<boolean>(true);
  const [rolloverSetCurrent, setRolloverSetCurrent] = useState<boolean>(true);

  const [bulkImportText, setBulkImportText] = useState<string>("");
  const [bulkImportRoleKey, setBulkImportRoleKey] = useState<RoleKey | "">("");
  const [bulkImportTermId, setBulkImportTermId] = useState<string>(initialSelectedTermId);

  const [officeLocation, setOfficeLocation] = useState<OfficeLocationRow | null>(initialOfficeLocation);
  const [officeConfig, setOfficeConfig] = useState<OfficeConfigRow | null>(initialOfficeConfig);
  const [officeLatText, setOfficeLatText] = useState<string>(
    typeof initialOfficeLocation?.lat === "number" ? String(initialOfficeLocation.lat) : "",
  );
  const [officeLonText, setOfficeLonText] = useState<string>(
    typeof initialOfficeLocation?.lon === "number" ? String(initialOfficeLocation.lon) : "",
  );

  const [officeHourRequirements, setOfficeHourRequirements] = useState<OfficeHourRequirementRow[]>(
    initialOfficeHourRequirements,
  );

  const [exportWeekStart, setExportWeekStart] = useState<string>(() => todayDateString());
  const [exportPreviewRows, setExportPreviewRows] = useState<AdminWeeklyHoursPreviewRow[] | null>(null);

  const [shiftUserId, setShiftUserId] = useState<string>("");
  const [shiftUserSearch, setShiftUserSearch] = useState<string>("");
  const [shiftStartsAtLocal, setShiftStartsAtLocal] = useState<string>("");
  const [shiftEndsAtLocal, setShiftEndsAtLocal] = useState<string>("");
  const [shiftOfficeLocationId, setShiftOfficeLocationId] = useState<string>("");
  const [shiftStatus, setShiftStatus] = useState<string>("");

  // Meeting form state (Phase 21)
  const [meetingType, setMeetingType] = useState<string>("board");
  const [meetingCommitteeId, setMeetingCommitteeId] = useState<string>("");
  const [meetingTitle, setMeetingTitle] = useState<string>("");
  const [meetingDescription, setMeetingDescription] = useState<string>("");
  const [meetingLocation, setMeetingLocation] = useState<string>("");
  const [meetingStartsAtLocal, setMeetingStartsAtLocal] = useState<string>("");
  const [meetingEndsAtLocal, setMeetingEndsAtLocal] = useState<string>("");
  const [meetingSearch, setMeetingSearch] = useState<string>("");
  const [adminMeetings, setAdminMeetings] = useState<AdminMeetingRow[]>([]);
  const [meetingDrafts, setMeetingDrafts] = useState<Record<string, AdminMeetingDraft>>({});

  const [status, setStatus] = useState<string>("");

  async function loadOfficeHourRequirements(termId: string) {
    if (!termId) return;
    setStatus("Loading office hour requirements...");
    try {
      const data = await fetchJson<{ termId: string; requirements: OfficeHourRequirementRow[] }>(
        `/api/admin/office-hour-requirements?termId=${encodeURIComponent(termId)}`,
      );
      setOfficeHourRequirements(data.requirements);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load office hour requirements");
    }
  }

  async function onSaveOfficeHourRequirements() {
    if (!selectedTermId) return;

    const roles: RoleKey[] = ["president", "executive", "director", "board_member", "volunteer"];
    const payload = roles.map((roleKey) => {
      const row = officeHourRequirements.find(
        (r) => r.role_key === roleKey && r.term_id === selectedTermId && !r.effective_start && !r.effective_end,
      );

      return {
        roleKey,
        weeklyTotalHours: row?.weekly_total_hours ?? 0,
        weeklyInOfficeHours: row?.weekly_in_office_hours ?? 0,
      };
    });

    setStatus("Saving office hour requirements...");
    try {
      const data = await fetchJson<{ termId: string; requirements: OfficeHourRequirementRow[] }>(
        "/api/admin/office-hour-requirements",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ termId: selectedTermId, requirements: payload }),
        },
      );
      setOfficeHourRequirements(data.requirements);
      setStatus("Office hour requirements saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to save office hour requirements");
    }
  }

  function updateRequirement(roleKey: RoleKey, patch: Partial<Pick<OfficeHourRequirementRow, "weekly_total_hours" | "weekly_in_office_hours">>) {
    if (!selectedTermId) return;
    setOfficeHourRequirements((prev) => {
      const next = [...prev];
      const idx = next.findIndex(
        (r) => r.role_key === roleKey && r.term_id === selectedTermId && !r.effective_start && !r.effective_end,
      );

      if (idx >= 0) {
        next[idx] = { ...next[idx], ...patch };
        return next;
      }

      next.push({
        id: "",
        role_key: roleKey,
        term_id: selectedTermId,
        weekly_total_hours: patch.weekly_total_hours ?? 0,
        weekly_in_office_hours: patch.weekly_in_office_hours ?? 0,
        effective_start: null,
        effective_end: null,
      });

      return next;
    });
  }

  async function loadOfficeConfig() {
    setStatus("Loading office config...");
    try {
      const data = await fetchJson<{ officeConfig: OfficeConfigRow; officeLocation: OfficeLocationRow }>(
        "/api/admin/office-config",
      );
      setOfficeConfig(data.officeConfig);
      setOfficeLocation(data.officeLocation);
      setOfficeLatText(typeof data.officeLocation.lat === "number" ? String(data.officeLocation.lat) : "");
      setOfficeLonText(typeof data.officeLocation.lon === "number" ? String(data.officeLocation.lon) : "");
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load office config");
    }
  }

  async function onSendTestEmail() {
    setStatus("Sending test email...");
    try {
      await fetchJson<{ ok: true }>("/api/admin/send-test-email", { method: "POST" });
      setStatus("Test email sent (or queued). Check notification_log and your inbox.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to send test email");
    }
  }

  const usersById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  const usersForRolePicker = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const hay = `${u.display_name ?? ""} ${u.email ?? ""} ${u.id}`.toLowerCase();
      return hay.includes(q);
    });
  }, [userSearch, users]);

  const activeBanKeys = useMemo(() => {
    const s = new Set<string>();
    for (const b of invitesBlocklist) {
      if (b.is_active) s.add(b.pattern_normalized);
    }
    return s;
  }, [invitesBlocklist]);

  const termNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of terms) {
      m.set(t.id, t.name);
    }
    return m;
  }, [terms]);

  const bootstrapGrantsByEmail = useMemo(() => {
    const m = new Map<string, BootstrapRoleGrantRow[]>();
    for (const g of bootstrapRoleGrants) {
      if (!g.is_active) continue;
      if (g.consumed_at) continue;
      const key = g.email_normalized;
      if (!key) continue;
      const arr = m.get(key);
      if (arr) arr.push(g);
      else m.set(key, [g]);
    }

    for (const arr of m.values()) {
      arr.sort((a, b) => {
        const ak = String(a.role_key ?? "");
        const bk = String(b.role_key ?? "");
        if (ak !== bk) return ak.localeCompare(bk);
        const at = a.term_id ?? "";
        const bt = b.term_id ?? "";
        return at.localeCompare(bt);
      });
    }

    return m;
  }, [bootstrapRoleGrants]);

  const filteredInvites = useMemo(() => {
    const q = inviteSearch.trim().toLowerCase();
    return invitesAllowlist.filter((inv) => {
      if (!showInactiveInvites && !inv.is_active) return false;
      if (!q) return true;
      const hay = `${inv.email} ${inv.notes ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [invitesAllowlist, inviteSearch, showInactiveInvites]);

  const selectedInvites = useMemo(
    () => invitesAllowlist.filter((inv) => Boolean(selectedInviteIds[inv.id])),
    [invitesAllowlist, selectedInviteIds],
  );

  const allFilteredInvitesSelected = useMemo(
    () => filteredInvites.length > 0 && filteredInvites.every((inv) => Boolean(selectedInviteIds[inv.id])),
    [filteredInvites, selectedInviteIds],
  );

  function isInviteBlocked(inv: InviteAllowlistRow): boolean {
    const normalized = inv.email_normalized;
    if (!normalized) return false;
    if (normalized.startsWith("@")) return activeBanKeys.has(normalized);
    const keys = allowlistKeysForNormalizedEmail(normalized);
    return keys.some((k) => activeBanKeys.has(k));
  }

  const selectedRole = useMemo(
    () => ROLE_OPTIONS.find((r) => r.key === selectedRoleKey) ?? ROLE_OPTIONS[0],
    [selectedRoleKey],
  );

  const exportWeekStartResolved = useMemo(
    () => startOfWeekMondayDateOnly(exportWeekStart) ?? startOfWeekMondayDateOnly(todayDateString()),
    [exportWeekStart],
  );

  function downloadWeeklyHoursCsv() {
    const weekStart = startOfWeekMondayDateOnly(exportWeekStart) ?? startOfWeekMondayDateOnly(todayDateString());
    const qs = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
    window.location.href = `/api/admin/office-hours/export-week${qs}`;
  }

  function openWeeklyHoursCsvInline() {
    const weekStart = startOfWeekMondayDateOnly(exportWeekStart) ?? startOfWeekMondayDateOnly(todayDateString());
    const qs = weekStart
      ? `?weekStart=${encodeURIComponent(weekStart)}&disposition=inline`
      : "?disposition=inline";
    window.open(`/api/admin/office-hours/export-week${qs}`, "_blank", "noopener,noreferrer");
  }

  function openWeeklyHoursPreviewPage() {
    const weekStart = startOfWeekMondayDateOnly(exportWeekStart) ?? startOfWeekMondayDateOnly(todayDateString());
    const qs = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}` : "";
    window.location.assign(`/admin/office-hours/export${qs}`);
  }

  async function previewWeeklyHours() {
    setStatus("Loading preview...");
    try {
      const weekStart = startOfWeekMondayDateOnly(exportWeekStart) ?? startOfWeekMondayDateOnly(todayDateString());
      const qs = weekStart ? `?weekStart=${encodeURIComponent(weekStart)}&format=json` : "?format=json";

      const data = await fetchJson<{ weekStart: string; rows: AdminWeeklyHoursPreviewRow[] }>(
        `/api/admin/office-hours/export-week${qs}`,
      );

      setExportPreviewRows(data.rows ?? []);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load preview");
    }
  }

  function clearWeeklyHoursPreview() {
    setExportPreviewRows(null);
  }

  async function onCreateShift() {
    setShiftStatus("Creating shift...");
    try {
      if (!shiftUserId) {
        setShiftStatus("Select a user.");
        return;
      }
      if (!shiftStartsAtLocal || !shiftEndsAtLocal) {
        setShiftStatus("Start and end times are required.");
        return;
      }

      const startsAtIso = new Date(shiftStartsAtLocal).toISOString();
      const endsAtIso = new Date(shiftEndsAtLocal).toISOString();

      await fetchJson<{ shift: unknown }>("/api/admin/office-hours/shifts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: shiftUserId,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          officeLocationId: shiftOfficeLocationId.trim() ? shiftOfficeLocationId.trim() : undefined,
        }),
      });

      setShiftStatus("Shift created.");
      setShiftStartsAtLocal("");
      setShiftEndsAtLocal("");
      setShiftOfficeLocationId("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to create shift";
      setShiftStatus(message === "weekend_not_allowed" ? "Shifts can only be scheduled Monday through Friday." : message);
    }
  }

  async function onCreateMeeting() {
    setStatus("Creating meeting...");
    try {
      if (!meetingTitle) {
        setStatus("Meeting title is required.");
        return;
      }
      if (meetingType === "committee" && !meetingCommitteeId) {
        setStatus("Select a committee for committee meetings.");
        return;
      }
      if (!meetingStartsAtLocal || !meetingEndsAtLocal) {
        setStatus("Start and end times are required.");
        return;
      }

      const startsAtIso = new Date(meetingStartsAtLocal).toISOString();
      const endsAtIso = new Date(meetingEndsAtLocal).toISOString();

      await fetchJson<{ meeting: unknown }>("/api/admin/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          meeting_type: meetingType,
          title: meetingTitle,
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          committee_id: meetingType === "committee" && meetingCommitteeId ? meetingCommitteeId : undefined,
          description: meetingDescription.trim() || undefined,
          location: meetingLocation.trim() || undefined,
        }),
      });

      setStatus("Meeting created.");
      setMeetingTitle("");
      setMeetingDescription("");
      setMeetingLocation("");
      setMeetingStartsAtLocal("");
      setMeetingEndsAtLocal("");
      setMeetingCommitteeId("");
      await loadMeetings();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to create meeting");
    }
  }

  async function loadCommittees() {
    try {
      const { committees: rows } = await fetchJson<{ committees: CommitteeRow[] }>("/api/admin/committees");
      setCommittees(rows ?? []);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load committees");
    }
  }

  async function loadMeetings() {
    setStatus("Loading meetings...");
    try {
      const { meetings } = await fetchJson<{ meetings: AdminMeetingRow[] }>("/api/admin/meetings");
      setAdminMeetings(meetings ?? []);
      setMeetingDrafts({});
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load meetings");
    }
  }

  function updateMeetingDraft(meetingId: string, patch: Partial<AdminMeetingDraft>) {
    const meeting = adminMeetings.find((m) => m.id === meetingId);
    if (!meeting) return;
    const base: AdminMeetingDraft = {
      title: meeting.title,
      description: meeting.description ?? "",
      location: meeting.location ?? "",
      starts_at_local: datetimeLocalFromIso(meeting.starts_at),
      ends_at_local: datetimeLocalFromIso(meeting.ends_at),
      status: meeting.status,
    };

    setMeetingDrafts((prev) => ({
      ...prev,
      [meetingId]: {
        ...(prev[meetingId] ?? base),
        ...patch,
      },
    }));
  }

  async function saveMeeting(meeting: AdminMeetingRow) {
    const draft = meetingDrafts[meeting.id] ?? {
      title: meeting.title,
      description: meeting.description ?? "",
      location: meeting.location ?? "",
      starts_at_local: datetimeLocalFromIso(meeting.starts_at),
      ends_at_local: datetimeLocalFromIso(meeting.ends_at),
      status: meeting.status,
    };

    const startsAtIso = toIsoFromDatetimeLocal(draft.starts_at_local);
    const endsAtIso = toIsoFromDatetimeLocal(draft.ends_at_local);
    if (!startsAtIso || !endsAtIso) {
      setStatus("Start and end times are required.");
      return;
    }

    setStatus("Saving meeting...");
    try {
      await fetchJson(`/api/admin/meetings/${encodeURIComponent(meeting.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(),
          description: draft.description.trim() || null,
          location: draft.location.trim() || null,
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          status: draft.status,
        }),
      });
      await loadMeetings();
      setStatus("Meeting saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to save meeting");
    }
  }

  async function cancelMeeting(meeting: AdminMeetingRow) {
    if (!window.confirm(`Cancel meeting "${meeting.title}"?`)) return;
    setStatus("Cancelling meeting...");
    try {
      await fetchJson(`/api/admin/meetings/${encodeURIComponent(meeting.id)}`, { method: "DELETE" });
      await loadMeetings();
      setStatus("Meeting cancelled.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to cancel meeting");
    }
  }

  async function loadTermsAndUsers() {
    setStatus("Loading terms and users...");
    const [{ terms: t }, { users: u }] = await Promise.all([
      fetchJson<{ terms: TermRow[] }>("/api/admin/terms"),
      fetchJson<{ users: UserRow[] }>("/api/admin/users"),
    ]);

    setTerms(t);
    setUsers(u);

    if (!selectedTermId) {
      const current = t.find((x) => x.is_current) ?? t[0];
      if (current?.id) setSelectedTermId(current.id);
    }

    setStatus("");
  }

  async function loadAssignments(termId: string) {
    if (!termId) return;
    setStatus("Loading role assignments...");

    const [globalAdvisor, termScoped] = await Promise.all([
      fetchJson<{ assignments: AssignmentRow[] }>(
        "/api/admin/role-assignments?scope=global&roleKey=advisor&activeOnly=1",
      ),
      fetchJson<{ assignments: AssignmentRow[] }>(
        `/api/admin/role-assignments?termId=${encodeURIComponent(termId)}&activeOnly=1`,
      ),
    ]);

    setGlobalAdvisorAssignments(globalAdvisor.assignments);
    setTermAssignments(termScoped.assignments);
    setStatus("");
  }

  async function loadInvitesAllowlist() {
    setStatus("Loading invites allowlist...");
    try {
      const data = await fetchJson<{ invites: InviteAllowlistRow[] }>("/api/admin/invites-allowlist");
      setInvitesAllowlist(data.invites ?? []);
      setInviteNotesDraftById({});
      setSelectedInviteIds({});
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load invites allowlist");
    }
  }

  async function loadInvitesBlocklist() {
    setStatus("Loading invite bans...");
    try {
      const data = await fetchJson<{ bans: InviteBlocklistRow[] }>("/api/admin/invites-blocklist");
      setInvitesBlocklist(data.bans ?? []);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load invite bans");
    }
  }

  async function loadBootstrapRoleGrants() {
    setStatus("Loading role grants...");
    try {
      const data = await fetchJson<{ grants: BootstrapRoleGrantRow[] }>("/api/admin/bootstrap-role-grants?limit=1000");
      setBootstrapRoleGrants(data.grants ?? []);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load role grants");
    }
  }

  function openRoleGrantModal(invite: InviteAllowlistRow) {
    if (!invite.email_normalized || invite.email_normalized.startsWith("@")) return;
    setRoleGrantInviteId(invite.id);
    setRoleGrantRoleKey("volunteer");
    setRoleGrantTermId(selectedTermId);
  }

  function closeRoleGrantModal() {
    setRoleGrantInviteId(null);
  }

  async function onGrantRoleForInvite(invite: InviteAllowlistRow) {
    const normalized = invite.email_normalized;
    if (!normalized || normalized.startsWith("@")) {
      setStatus("Role grants require an exact email (not a domain).");
      return;
    }

    const roleKey = roleGrantRoleKey;
    const scope = ROLE_OPTIONS.find((r) => r.key === roleKey)?.scope ?? "term";
    const termId = scope === "term" ? (roleGrantTermId || selectedTermId) : null;

    if (scope === "term" && !termId) {
      setStatus("Select a term to grant this role.");
      return;
    }

    setStatus("Granting role...");
    try {
      const data = await fetchJson<{ grant: BootstrapRoleGrantRow }>("/api/admin/bootstrap-role-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalized,
          roleKey,
          termId: scope === "term" ? termId : null,
        }),
      });

      setBootstrapRoleGrants((prev) => [data.grant, ...prev.filter((g) => g.id !== data.grant.id)]);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to grant role");
    }
  }

  async function onRevokeRoleGrant(grant: BootstrapRoleGrantRow) {
    const roleLabel = ROLE_LABEL_BY_KEY[grant.role_key] ?? grant.role_key;
    const ok = window.confirm(`Revoke ${roleLabel} role grant for "${grant.email}"?`);
    if (!ok) return;

    setStatus("Revoking role grant...");
    try {
      await fetchJson<{ grant: BootstrapRoleGrantRow }>("/api/admin/bootstrap-role-grants", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: grant.id, is_active: false }),
      });

      setBootstrapRoleGrants((prev) => prev.filter((g) => g.id !== grant.id));
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to revoke role grant");
    }
  }

  async function onAddInvite() {
    const email = newInviteEmail.trim();
    if (!email) return;

    setStatus("Adding invite...");
    try {
      const data = await fetchJson<{ invite: InviteAllowlistRow }>("/api/admin/invites-allowlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          notes: newInviteNotes.trim().length > 0 ? newInviteNotes.trim() : undefined,
        }),
      });

      setInvitesAllowlist((prev) => [data.invite, ...prev.filter((r) => r.id !== data.invite.id)]);
      setInviteNotesDraftById({});
      setNewInviteEmail("");
      setNewInviteNotes("");
      setStatus("Invite added.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to add invite");
    }
  }

  async function onDeleteInvite(invite: InviteAllowlistRow) {
    const ok = window.confirm(`Delete allowlist entry for "${invite.email}"?\n\nThis permanently removes it.`);
    if (!ok) return;

    setStatus("Deleting allowlist entry...");
    try {
      await fetchJson<{ ok: true }>("/api/admin/invites-allowlist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invite.id }),
      });

      setInvitesAllowlist((prev) => prev.filter((r) => r.id !== invite.id));
      setInviteNotesDraftById((prev) => {
        if (!(invite.id in prev)) return prev;
        const next = { ...prev };
        delete next[invite.id];
        return next;
      });
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to delete allowlist entry");
    }
  }

  async function onMoveInvite(invite: InviteAllowlistRow, direction: "up" | "down") {
    setStatus(direction === "up" ? "Moving up..." : "Moving down...");
    try {
      await fetchJson<{ ok: true }>("/api/admin/invites-allowlist/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invite.id, direction, activeOnly: !showInactiveInvites }),
      });
      await loadInvitesAllowlist();
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to reorder allowlist");
    }
  }

  async function onBanInvite(invite: InviteAllowlistRow) {
    const ok = window.confirm(
      `Ban "${invite.email}"?\n\nThis overrides any allowlist domain entry and blocks sign-in for this pattern.`,
    );
    if (!ok) return;

    setStatus("Creating ban...");
    try {
      const data = await fetchJson<{ ban: InviteBlocklistRow }>("/api/admin/invites-blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pattern: invite.email }),
      });

      setInvitesBlocklist((prev) => [data.ban, ...prev.filter((r) => r.id !== data.ban.id)]);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to ban pattern");
    }
  }

  async function onSetInviteActive(invite: InviteAllowlistRow, isActive: boolean) {
    if (!isActive) {
      const ok = window.confirm(
        `Revoke invite for "${invite.email}"?\n\nThis will block sign-in for this entry unless reactivated.`,
      );
      if (!ok) return;
    }

    setStatus(isActive ? "Re-activating invite..." : "Revoking invite...");
    try {
      const data = await fetchJson<{ invite: InviteAllowlistRow }>("/api/admin/invites-allowlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invite.id, is_active: isActive }),
      });

      setInvitesAllowlist((prev) => prev.map((r) => (r.id === invite.id ? data.invite : r)));
      setInviteNotesDraftById((prev) => {
        if (!(invite.id in prev)) return prev;
        const next = { ...prev };
        delete next[invite.id];
        return next;
      });
      if (!isActive && !showInactiveInvites) {
        setStatus("Revoked. Turn on “Show inactive” to view revoked entries.");
      } else {
        setStatus("");
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to update invite");
    }
  }

  async function onUpdateInviteNotes(invite: InviteAllowlistRow) {
    const draft = inviteNotesDraftById[invite.id] ?? invite.notes ?? "";
    const normalized = draft.trim().length > 0 ? draft.trim() : null;

    setStatus("Saving name...");
    try {
      const data = await fetchJson<{ invite: InviteAllowlistRow }>("/api/admin/invites-allowlist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: invite.id, is_active: invite.is_active, notes: normalized }),
      });

      setInvitesAllowlist((prev) => prev.map((r) => (r.id === invite.id ? data.invite : r)));
      setInviteNotesDraftById((prev) => {
        const next = { ...prev };
        delete next[invite.id];
        return next;
      });
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to save name");
    }
  }

  function setInviteSelected(inviteId: string, isSelected: boolean) {
    setSelectedInviteIds((prev) => {
      const next = { ...prev };
      if (isSelected) next[inviteId] = true;
      else delete next[inviteId];
      return next;
    });
  }

  function setAllFilteredInvitesSelected(isSelected: boolean) {
    setSelectedInviteIds((prev) => {
      const next = { ...prev };
      for (const inv of filteredInvites) {
        if (isSelected) next[inv.id] = true;
        else delete next[inv.id];
      }
      return next;
    });
  }

  async function onCopySelectedInviteEmails() {
    if (selectedInvites.length === 0) return;
    try {
      await navigator.clipboard.writeText(selectedInvites.map((inv) => inv.email).join("\n"));
      setStatus(`Copied ${selectedInvites.length} email${selectedInvites.length === 1 ? "" : "s"} to clipboard.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to copy to clipboard");
    }
  }

  async function onBulkSetInviteActive(isActive: boolean) {
    if (selectedInvites.length === 0) return;

    const verb = isActive ? "Reactivate" : "Revoke";
    const ok = window.confirm(`${verb} ${selectedInvites.length} allowlist entr${selectedInvites.length === 1 ? "y" : "ies"}?`);
    if (!ok) return;

    setStatus(`${verb} in progress...`);
    try {
      const updated: InviteAllowlistRow[] = [];
      for (let i = 0; i < selectedInvites.length; i += 1) {
        const inv = selectedInvites[i];
        setStatus(`${verb} ${i + 1}/${selectedInvites.length}...`);
        const data = await fetchJson<{ invite: InviteAllowlistRow }>("/api/admin/invites-allowlist", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: inv.id, is_active: isActive }),
        });
        updated.push(data.invite);
      }

      const byId = new Map(updated.map((x) => [x.id, x]));
      setInvitesAllowlist((prev) => prev.map((r) => byId.get(r.id) ?? r));
      setInviteNotesDraftById((prev) => {
        const next = { ...prev };
        for (const inv of selectedInvites) delete next[inv.id];
        return next;
      });
      setSelectedInviteIds({});

      if (!isActive && !showInactiveInvites) {
        setStatus(`Revoked ${updated.length}. Turn on “Show inactive” to view revoked entries.`);
      } else {
        setStatus(`${verb}d ${updated.length}.`);
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : `Failed to ${verb.toLowerCase()} invites`);
    }
  }

  async function onBulkBanInvites() {
    if (selectedInvites.length === 0) return;
    const ok = window.confirm(
      `Ban ${selectedInvites.length} pattern${selectedInvites.length === 1 ? "" : "s"}?\n\nThis overrides any allowlist entries and blocks sign-in for these patterns.`,
    );
    if (!ok) return;

    setStatus("Banning...");
    try {
      const created: InviteBlocklistRow[] = [];
      for (let i = 0; i < selectedInvites.length; i += 1) {
        const inv = selectedInvites[i];
        setStatus(`Banning ${i + 1}/${selectedInvites.length}...`);
        const data = await fetchJson<{ ban: InviteBlocklistRow }>("/api/admin/invites-blocklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pattern: inv.email }),
        });
        created.push(data.ban);
      }

      setInvitesBlocklist((prev) => {
        const seen = new Set(prev.map((b) => b.id));
        const next = [...prev];
        for (const b of created) {
          if (seen.has(b.id)) continue;
          seen.add(b.id);
          next.unshift(b);
        }
        return next;
      });
      setStatus(`Banned ${created.length}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to ban patterns");
    }
  }

  async function onBulkDeleteInvites() {
    if (selectedInvites.length === 0) return;
    const ok = window.confirm(
      `Delete ${selectedInvites.length} allowlist entr${selectedInvites.length === 1 ? "y" : "ies"}?\n\nThis permanently removes them.`,
    );
    if (!ok) return;

    setStatus("Deleting...");
    try {
      for (let i = 0; i < selectedInvites.length; i += 1) {
        const inv = selectedInvites[i];
        setStatus(`Deleting ${i + 1}/${selectedInvites.length}...`);
        await fetchJson<{ ok: true }>("/api/admin/invites-allowlist", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: inv.id }),
        });
      }

      const deletedIds = new Set(selectedInvites.map((x) => x.id));
      setInvitesAllowlist((prev) => prev.filter((r) => !deletedIds.has(r.id)));
      setInviteNotesDraftById((prev) => {
        const next = { ...prev };
        for (const inv of selectedInvites) delete next[inv.id];
        return next;
      });
      setSelectedInviteIds({});
      setStatus(`Deleted ${deletedIds.size}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to delete allowlist entries");
    }
  }

  async function onAddBan() {
    const pattern = newBanPattern.trim();
    if (!pattern) return;

    setStatus("Adding ban...");
    try {
      const data = await fetchJson<{ ban: InviteBlocklistRow }>("/api/admin/invites-blocklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pattern,
          notes: newBanNotes.trim().length > 0 ? newBanNotes.trim() : undefined,
        }),
      });

      setInvitesBlocklist((prev) => [data.ban, ...prev.filter((r) => r.id !== data.ban.id)]);
      setNewBanPattern("");
      setNewBanNotes("");
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to add ban");
    }
  }

  async function onSetBanActive(ban: InviteBlocklistRow, isActive: boolean) {
    if (!isActive) {
      const ok = window.confirm(
        `Disable ban for "${ban.pattern}"?\n\nThis will allow sign-in unless another rule blocks it.`,
      );
      if (!ok) return;
    }

    setStatus(isActive ? "Re-activating ban..." : "Disabling ban...");
    try {
      const data = await fetchJson<{ ban: InviteBlocklistRow }>("/api/admin/invites-blocklist", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ban.id, is_active: isActive }),
      });

      setInvitesBlocklist((prev) => prev.map((r) => (r.id === ban.id ? data.ban : r)));
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to update ban");
    }
  }

  async function onDeleteBan(ban: InviteBlocklistRow) {
    const ok = window.confirm(`Delete ban for "${ban.pattern}"?\n\nThis permanently removes the ban.`);
    if (!ok) return;

    setStatus("Deleting ban...");
    try {
      await fetchJson<{ ok: true }>("/api/admin/invites-blocklist", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ban.id }),
      });

      setInvitesBlocklist((prev) => prev.filter((r) => r.id !== ban.id));
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to delete ban");
    }
  }

  const bulkInvitesPreview = useMemo(() => parseBulkInvites(bulkInviteText), [bulkInviteText]);
  const bulkImportPreview = useMemo(() => parseBulkInvites(bulkImportText), [bulkImportText]);

  async function onBulkAddInvites() {
    const candidates = bulkInvitesPreview;
    if (candidates.length === 0) {
      setStatus("No emails found to add.");
      return;
    }

    setStatus(`Adding ${candidates.length} allowlist entries...`);
    let ok = 0;
    let fail = 0;

    for (let i = 0; i < candidates.length; i += 1) {
      const c = candidates[i];
      setStatus(`Adding ${i + 1}/${candidates.length}: ${c.email}`);
      try {
        const data = await fetchJson<{ invite: InviteAllowlistRow }>("/api/admin/invites-allowlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: c.email, notes: c.notes }),
        });

        ok += 1;
        setInvitesAllowlist((prev) => [data.invite, ...prev.filter((r) => r.id !== data.invite.id)]);
      } catch {
        fail += 1;
      }
    }

    setInviteNotesDraftById({});
    setBulkInviteText("");
    setStatus(`Bulk add complete: ${ok} added, ${fail} failed.`);
  }

  async function onBulkImportMembers() {
    const candidates = bulkImportPreview;
    if (candidates.length === 0) {
      setStatus("No emails found to import.");
      return;
    }

    if (bulkImportRoleKey && bulkImportRoleKey !== "advisor" && !bulkImportTermId) {
      setStatus("Select a term for term-scoped roles.");
      return;
    }

    setStatus(`Importing ${candidates.length} members...`);
    try {
      await fetchJson("/api/admin/bulk-import-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entries: candidates.map((candidate) => ({
            email: candidate.email,
            role_key: bulkImportRoleKey || undefined,
            term_id: bulkImportRoleKey && bulkImportRoleKey !== "advisor" ? bulkImportTermId : null,
            notes: candidate.notes ?? null,
          })),
        }),
      });

      setBulkImportText("");
      setStatus("Bulk import complete.");
      await loadTermsAndUsers();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Bulk import failed");
    }
  }

  async function onCreateTerm() {
    setStatus("Creating term...");
    try {
      await fetchJson<{ term: TermRow }>("/api/admin/terms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTermName,
          start_date: newTermStart || null,
          end_date: newTermEnd || null,
        }),
      });

      setNewTermName("");
      setNewTermStart("");
      setNewTermEnd("");

      await loadTermsAndUsers();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to create term");
    }
  }

  async function onSetCurrentTerm() {
    if (!selectedTermId) return;
    setStatus("Setting current term...");
    try {
      await fetchJson<{ term: TermRow }>("/api/admin/terms", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termId: selectedTermId, is_current: true }),
      });

      await loadTermsAndUsers();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to set current term");
    }
  }

  async function onRolloverTerm() {
    if (!rolloverFromTermId || !rolloverToTermId) {
      setStatus("Select both source and destination terms.");
      return;
    }

    setStatus("Rolling over term assignments...");
    try {
      await fetchJson("/api/admin/terms/rollover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_term_id: rolloverFromTermId,
          to_term_id: rolloverToTermId,
          end_prior: rolloverEndPrior,
          set_current: rolloverSetCurrent,
        }),
      });

      await loadTermsAndUsers();
      setStatus("Term rollover complete.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to rollover term");
    }
  }

  async function onAssignRole() {
    if (!selectedUserId) {
      setStatus("Pick a user first.");
      return;
    }

    if (selectedRole.scope === "term" && !selectedTermId) {
      setStatus("Pick a term first.");
      return;
    }

    setStatus("Assigning role...");

    try {
      await fetchJson<{ assignment: AssignmentRow }>("/api/admin/role-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUserId,
          roleKey: selectedRole.key,
          termId: selectedRole.scope === "term" ? selectedTermId : null,
        }),
      });

      await loadAssignments(selectedTermId);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to assign role");
    }
  }

  async function onEndAssignment(assignmentId: string) {
    setStatus("Ending role assignment...");
    try {
      await fetchJson<{ ok: true }>("/api/admin/role-assignments", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });

      await loadAssignments(selectedTermId);
      setStatus("");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to end role assignment");
    }
  }

  async function onSelectTerm(nextTermId: string) {
    setSelectedTermId(nextTermId);
    setBulkImportTermId(nextTermId || initialSelectedTermId);
    setRolloverFromTermId(nextTermId || initialSelectedTermId);
    if (!nextTermId) return;
    try {
      await Promise.all([loadAssignments(nextTermId), loadOfficeHourRequirements(nextTermId)]);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load role assignments");
    }
  }

  const currentTerm = terms.find((t: TermRow) => t.is_current) ?? null;
  const currentTermId = currentTerm?.id ?? "";

  const reqRows = useMemo(() => {
    const termId = selectedTermId;
    const byRole = new Map<RoleKey, OfficeHourRequirementRow>();
    for (const r of officeHourRequirements) {
      if (r.term_id === termId && !r.effective_start && !r.effective_end) {
        byRole.set(r.role_key, r);
      }
    }
    return byRole;
  }, [officeHourRequirements, selectedTermId]);

  /* eslint-disable react-hooks/preserve-manual-memoization */
  const committeeById = useMemo(() => {
    const map = new Map<string, CommitteeRow>();
    for (const committee of committees) {
      map.set(committee.id, committee);
    }
    return map;
  }, [committees]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const shiftUsers = useMemo(() => {
    const query = shiftUserSearch.trim().toLowerCase();
    if (!query) return users;
    return users.filter((u) => formatUserLabel(u).toLowerCase().includes(query));
  }, [shiftUserSearch, users]);

  const selectedShiftUser = useMemo(
    () => users.find((u) => u.id === shiftUserId) ?? null,
    [users, shiftUserId],
  );

  /* eslint-disable react-hooks/preserve-manual-memoization */
  const filteredMeetings = useMemo(() => {
    const query = meetingSearch.trim().toLowerCase();
    if (!query) return adminMeetings;
    return adminMeetings.filter((m) => {
      const haystack = [
        m.title,
        m.location ?? "",
        m.meeting_type,
        committeeById.get(m.committee_id ?? "")?.name ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [adminMeetings, committeeById, meetingSearch]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  return (
    <div className="space-y-6">
      {status ? (
        <div className="rounded-md border px-3 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={adminTab === "access" ? "default" : "outline"} onClick={() => onSelectAdminTab("access")}>
              Access
            </Button>
            <Button
              variant={adminTab === "office_hours" ? "default" : "outline"}
              onClick={() => onSelectAdminTab("office_hours")}
            >
              Office Hours
            </Button>
            <Button variant={adminTab === "roles" ? "default" : "outline"} onClick={() => onSelectAdminTab("roles")}>
              Roles
            </Button>
            <Button variant={adminTab === "meetings" ? "default" : "outline"} onClick={() => onSelectAdminTab("meetings")}>
              Meetings
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Selected term</div>
              <select
                className="h-9 rounded-md border bg-transparent px-2 text-sm"
                value={selectedTermId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => void onSelectTerm(e.target.value)}
              >
                {terms.map((t: TermRow) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <Button onClick={onSetCurrentTerm} disabled={!selectedTermId || selectedTermId === currentTermId}>
              Set current
            </Button>
          </div>
        </div>
      </div>

      {adminTab === "roles" ? (
        <>
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Terms</h2>
          <p className="text-sm text-foreground/70">
            Role assignments for term roles are term-scoped.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">New term name</div>
            <input
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={newTermName}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTermName(e.target.value)}
              placeholder="e.g., Spring 2026"
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Start date (optional)</div>
            <input
              type="date"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={newTermStart}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTermStart(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">End date (optional)</div>
            <input
              type="date"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={newTermEnd}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTermEnd(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <div className="flex items-end">
            <Button onClick={onCreateTerm} disabled={!newTermName.trim()}>
              Create term
            </Button>
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="text-sm font-medium">Term rollover</div>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">From term</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={rolloverFromTermId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setRolloverFromTermId(e.target.value)}
              >
                <option value="">Select term</option>
                {terms.map((t: TermRow) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">To term</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={rolloverToTermId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setRolloverToTermId(e.target.value)}
              >
                <option value="">Select term</option>
                {terms.map((t: TermRow) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rolloverEndPrior}
                  onChange={(e) => setRolloverEndPrior(e.target.checked)}
                />
                End prior term assignments
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={rolloverSetCurrent}
                  onChange={(e) => setRolloverSetCurrent(e.target.checked)}
                />
                Set destination as current term
              </label>
            </div>

            <div className="flex items-end">
              <Button onClick={onRolloverTerm} disabled={!rolloverFromTermId || !rolloverToTermId}>
                Run rollover
              </Button>
            </div>
          </div>
        </div>
      </section>
        </>
      ) : null}

      {adminTab === "access" ? (
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Invites / allowlist</h2>
          <p className="text-sm text-foreground/70">
            Add specific emails (e.g. <span className="font-mono">name@gcccd.edu</span>) or a domain entry (e.g.{" "}
            <span className="font-mono">@gcccd.edu</span> or <span className="font-mono">gcccd.edu</span>) to allow sign-in.
            Notes are used as the member name for Office Hours exports and the quick Office Hours form.
          </p>
          <p className="text-sm text-foreground/70">
            Pre-login role grants let you assign term roles (President, Executive, Director, etc.) to an invited email before they sign in; grants are consumed on first login.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Email or domain</div>
            <input
              className="h-9 w-72 rounded-md border bg-transparent px-2 text-sm"
              value={newInviteEmail}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewInviteEmail(e.target.value)}
              placeholder="name@gcccd.edu or @gcccd.edu (or gcccd.edu)"
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Member name (optional)</div>
            <input
              className="h-9 w-72 rounded-md border bg-transparent px-2 text-sm"
              value={newInviteNotes}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewInviteNotes(e.target.value)}
              placeholder="e.g., Jane Doe (ASGC VP Finance)"
            />
          </label>

          <Button onClick={() => void onAddInvite()} disabled={!newInviteEmail.trim()}>
            Add
          </Button>

          <Button variant="ghost" onClick={() => void loadInvitesAllowlist()}>
            Reload
          </Button>

          <Button variant="ghost" onClick={() => void loadBootstrapRoleGrants()}>
            Reload roles
          </Button>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Search</div>
            <input
              className="h-9 w-60 rounded-md border bg-transparent px-2 text-sm"
              value={inviteSearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setInviteSearch(e.target.value)}
              placeholder="Filter by email or name…"
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showInactiveInvites}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setShowInactiveInvites(e.target.checked)}
            />
            <span className="text-foreground/70">Show inactive</span>
          </label>
        </div>

        <div className="rounded-md border p-3">
          <div className="text-sm font-medium">Bulk add members</div>
          <div className="mt-1 text-xs text-foreground/70">
            Paste an Outlook-style list like:{" "}
            <span className="font-mono">&quot;ASGC President&quot; &lt;asgc.president@gcccd.edu&gt;; …</span>
          </div>
          <textarea
            className="mt-2 min-h-28 w-full rounded-md border bg-transparent px-2 py-2 text-sm"
            value={bulkInviteText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBulkInviteText(e.target.value)}
            placeholder="Paste here…"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button onClick={() => void onBulkAddInvites()} disabled={bulkInvitesPreview.length === 0}>
              Bulk add ({bulkInvitesPreview.length})
            </Button>
            <Button variant="ghost" onClick={() => setBulkInviteText("")} disabled={!bulkInviteText.trim()}>
              Clear
            </Button>
            {bulkInviteText.trim().length > 0 ? (
              <span className="text-xs text-foreground/60">
                Detected: {bulkInvitesPreview.length} unique email{bulkInvitesPreview.length === 1 ? "" : "s"}
              </span>
            ) : null}
          </div>
        </div>

        <div className="rounded-md border p-3">
          <div className="text-sm font-medium">Bulk import members (allowlist + optional role)</div>
          <div className="mt-1 text-xs text-foreground/70">
            Paste emails (same format as above). Optionally assign a single role to all imported entries.
          </div>
          <textarea
            className="mt-2 min-h-24 w-full rounded-md border bg-transparent px-2 py-2 text-sm"
            value={bulkImportText}
            onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setBulkImportText(e.target.value)}
            placeholder="Paste emails here..."
          />
          <div className="mt-2 grid gap-2 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Role (optional)</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={bulkImportRoleKey}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setBulkImportRoleKey(e.target.value as RoleKey | "")}
              >
                <option value="">No role</option>
                {ROLE_OPTIONS.map((role) => (
                  <option key={role.key} value={role.key}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Term (for term roles)</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={bulkImportTermId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setBulkImportTermId(e.target.value)}
              >
                {terms.map((t: TermRow) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.is_current ? " (current)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end gap-2">
              <Button onClick={() => void onBulkImportMembers()} disabled={bulkImportPreview.length === 0}>
                Import ({bulkImportPreview.length})
              </Button>
              <Button
                variant="ghost"
                onClick={() => setBulkImportText("")}
                disabled={!bulkImportText.trim()}
              >
                Clear
              </Button>
            </div>
          </div>
          <div className="mt-2 text-xs text-foreground/60">
            Detected: {bulkImportPreview.length} unique email{bulkImportPreview.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-foreground/5 px-3 py-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allFilteredInvitesSelected}
              disabled={filteredInvites.length === 0}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setAllFilteredInvitesSelected(e.target.checked)}
            />
            <span className="text-foreground/70">Select visible</span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-foreground/60">Selected: {selectedInvites.length}</span>
            <Button variant="outline" size="sm" onClick={() => void onCopySelectedInviteEmails()} disabled={selectedInvites.length === 0}>
              Copy emails
            </Button>
            <Button variant="outline" size="sm" onClick={() => void onBulkSetInviteActive(false)} disabled={selectedInvites.length === 0}>
              Revoke
            </Button>
            <Button variant="outline" size="sm" onClick={() => void onBulkSetInviteActive(true)} disabled={selectedInvites.length === 0}>
              Reactivate
            </Button>
            <Button variant="outline" size="sm" onClick={() => void onBulkBanInvites()} disabled={selectedInvites.length === 0}>
              Ban
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void onBulkDeleteInvites()}
              disabled={selectedInvites.length === 0}
              className="text-red-600 hover:bg-red-500/10"
            >
              Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedInviteIds({})} disabled={selectedInvites.length === 0}>
              Clear selection
            </Button>
          </div>
        </div>

        <div className="rounded-md border">
          {filteredInvites.length === 0 ? (
            <div className="px-3 py-2 text-sm text-foreground/70">No allowlist entries found.</div>
          ) : (
            <div className="divide-y">
              {filteredInvites.map((inv) => {
                const isDomain = inv.email_normalized.startsWith("@");
                const grants = !isDomain ? (bootstrapGrantsByEmail.get(inv.email_normalized) ?? []) : [];
                const grantLabels = grants.map((g) => {
                  const roleLabel = ROLE_LABEL_BY_KEY[g.role_key] ?? g.role_key;
                  const termLabel = g.term_id ? (termNameById.get(g.term_id) ?? g.term_id) : null;
                  return termLabel ? `${roleLabel} (${termLabel})` : roleLabel;
                });
                const rolesSummary = isDomain
                  ? "Roles: — (domain entry)"
                  : grantLabels.length > 0
                    ? `Roles: ${grantLabels.join(", ")}`
                    : "Roles: —";

                return (
                  <div
                    key={inv.id}
                    className="grid gap-2 px-3 py-3 md:grid-cols-[auto_minmax(0,1fr)_20rem_auto] md:items-start"
                  >
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        aria-label={`Select ${inv.email}`}
                        checked={Boolean(selectedInviteIds[inv.id])}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => setInviteSelected(inv.id, e.target.checked)}
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium" title={inv.email}>
                        {inv.email}{" "}
                        {!inv.is_active ? <span className="text-xs text-foreground/60">(inactive)</span> : null}
                        {isInviteBlocked(inv) ? (
                          <span className="ml-2 text-xs text-foreground/60">(blocked)</span>
                        ) : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-foreground/60" title={inv.notes ?? ""}>
                        {inv.notes ? `Name: ${inv.notes}` : "Name: —"} • Invited: {inv.invited_at.slice(0, 10)}
                        {inv.revoked_at ? ` • Revoked: ${inv.revoked_at.slice(0, 10)}` : ""}
                      </div>

                      <div className="mt-1 truncate text-xs text-foreground/60" title={grantLabels.join(", ")}>
                        {rolesSummary}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        className="h-8 w-full rounded-md border bg-transparent px-2 text-sm"
                        value={inviteNotesDraftById[inv.id] ?? inv.notes ?? ""}
                        onChange={(e: ChangeEvent<HTMLInputElement>) =>
                          setInviteNotesDraftById((prev) => ({ ...prev, [inv.id]: e.target.value }))
                        }
                        placeholder="Set member name…"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void onUpdateInviteNotes(inv)}
                        disabled={(inviteNotesDraftById[inv.id] ?? inv.notes ?? "").trim() === (inv.notes ?? "").trim()}
                      >
                        Save
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2 md:flex-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openRoleGrantModal(inv)}
                        disabled={isDomain}
                        title={isDomain ? "Role grants require an exact email (not a domain entry)" : "Manage pre-login roles"}
                      >
                        Roles
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void onMoveInvite(inv, "up")}
                        disabled={inviteSearch.trim().length > 0}
                        title={inviteSearch.trim().length > 0 ? "Clear search to reorder" : "Move up"}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void onMoveInvite(inv, "down")}
                        disabled={inviteSearch.trim().length > 0}
                        title={inviteSearch.trim().length > 0 ? "Clear search to reorder" : "Move down"}
                      >
                        ↓
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void onBanInvite(inv)}>
                        Ban
                      </Button>
                      {inv.is_active ? (
                        <Button variant="ghost" size="sm" onClick={() => void onSetInviteActive(inv, false)}>
                          Revoke
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => void onSetInviteActive(inv, true)}>
                          Reactivate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void onDeleteInvite(inv)}
                        className="text-red-600 hover:bg-red-500/10"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {roleGrantInviteId ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            onMouseDown={() => closeRoleGrantModal()}
          >
            <div
              className="w-full max-w-xl rounded-md border bg-background p-4 shadow-lg"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {(() => {
                const invite = invitesAllowlist.find((x) => x.id === roleGrantInviteId) ?? null;
                if (!invite) return null;

                const normalized = invite.email_normalized;
                const isDomain = normalized.startsWith("@");
                const grants = !isDomain ? (bootstrapGrantsByEmail.get(normalized) ?? []) : [];
                const scope = ROLE_OPTIONS.find((r) => r.key === roleGrantRoleKey)?.scope ?? "term";

                return (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-lg font-semibold">Pre-login roles</div>
                        <div className="truncate text-sm text-foreground/70">{invite.email}</div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => closeRoleGrantModal()}>
                        Close
                      </Button>
                    </div>

                    <div className="text-sm text-foreground/70">
                      These roles are applied automatically when the member signs in for the first time. If they already signed in,
                      assign roles in the <span className="font-medium">Roles</span> tab instead.
                    </div>

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Current roles</div>
                      {grants.length === 0 ? (
                        <div className="text-sm text-foreground/70">No pre-login roles.</div>
                      ) : (
                        <div className="space-y-2">
                          {grants.map((g) => {
                            const roleLabel = ROLE_LABEL_BY_KEY[g.role_key] ?? g.role_key;
                            const termLabel = g.term_id ? (termNameById.get(g.term_id) ?? g.term_id) : null;
                            return (
                              <div key={g.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                                <div className="min-w-0 text-sm">
                                  <span className="font-medium">{roleLabel}</span>
                                  {termLabel ? <span className="text-foreground/70">{` • ${termLabel}`}</span> : null}
                                </div>
                                <Button variant="ghost" size="sm" onClick={() => void onRevokeRoleGrant(g)}>
                                  Revoke
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {isDomain ? (
                      <div className="rounded-md border px-3 py-2 text-sm text-foreground/70">
                        Role grants require an exact email, not a domain entry.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-sm font-medium">Add role</div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-sm">
                            <div className="text-foreground/70">Role</div>
                            <select
                              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                              value={roleGrantRoleKey}
                              onChange={(e: ChangeEvent<HTMLSelectElement>) => setRoleGrantRoleKey(e.target.value as RoleKey)}
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r.key} value={r.key}>
                                  {r.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          {scope === "term" ? (
                            <label className="space-y-1 text-sm">
                              <div className="text-foreground/70">Term</div>
                              <select
                                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                                value={roleGrantTermId}
                                onChange={(e: ChangeEvent<HTMLSelectElement>) => setRoleGrantTermId(e.target.value)}
                              >
                                {terms.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                    {t.is_current ? " (current)" : ""}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : (
                            <div className="hidden sm:block" />
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <Button size="sm" onClick={() => void onGrantRoleForInvite(invite)}>
                            Add role
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => void loadBootstrapRoleGrants()}>
                            Refresh
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        ) : null}

        <div className="rounded-md border p-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Bans / blocklist</div>
            <div className="text-xs text-foreground/70">
              Block specific emails or domains. Blocklist overrides allowlist (useful when a domain is allowlisted but a single email should be denied).
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Email or domain</div>
              <input
                className="h-9 w-72 rounded-md border bg-transparent px-2 text-sm"
                value={newBanPattern}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewBanPattern(e.target.value)}
                placeholder="name@gcccd.edu or @gcccd.edu (or gcccd.edu)"
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Notes (optional)</div>
              <input
                className="h-9 w-72 rounded-md border bg-transparent px-2 text-sm"
                value={newBanNotes}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewBanNotes(e.target.value)}
                placeholder="Reason / context…"
              />
            </label>

            <Button onClick={() => void onAddBan()} disabled={!newBanPattern.trim()}>
              Ban
            </Button>

            <Button variant="ghost" onClick={() => void loadInvitesBlocklist()}>
              Reload bans
            </Button>
          </div>

          <div className="mt-3 rounded-md border">
            {invitesBlocklist.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground/70">No bans found.</div>
            ) : (
              <div className="divide-y">
                {invitesBlocklist.map((ban) => (
                  <div key={ban.id} className="grid gap-2 px-3 py-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium" title={ban.pattern}>
                        {ban.pattern}{" "}
                        {!ban.is_active ? <span className="text-xs text-foreground/60">(inactive)</span> : null}
                      </div>
                      <div className="mt-1 truncate text-xs text-foreground/60" title={ban.notes ?? ""}>
                        {ban.notes ? `Notes: ${ban.notes}` : ""}{ban.notes ? " • " : ""}Banned: {ban.banned_at.slice(0, 10)}
                        {ban.unbanned_at ? ` • Unbanned: ${ban.unbanned_at.slice(0, 10)}` : ""}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {ban.is_active ? (
                        <Button variant="ghost" size="sm" onClick={() => void onSetBanActive(ban, false)}>
                          Disable
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => void onSetBanActive(ban, true)}>
                          Reactivate
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void onDeleteBan(ban)}
                        className="text-red-600 hover:bg-red-500/10"
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
      ) : null}

      {adminTab === "office_hours" ? (
        <>
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Office Hours Export (CSV)</h2>
          <p className="text-sm text-foreground/70">
            Exports weekly totals/deficits for all active users.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportWeekStart((prev) => addDaysDateOnly(prev, -7) ?? todayDateString())}
            >
              Prev
            </Button>
            <Button variant="outline" size="sm" onClick={() => setExportWeekStart(todayDateString())}>
              This week
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExportWeekStart((prev) => addDaysDateOnly(prev, 7) ?? todayDateString())}
            >
              Next
            </Button>
          </div>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Week of (any date)</div>
            <input
              type="date"
              className="h-9 w-56 rounded-md border bg-transparent px-2 text-sm"
              value={exportWeekStart}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setExportWeekStart(normalizeDateOnlyString(e.target.value) ?? todayDateString())
              }
            />
          </label>

          {exportWeekStartResolved ? (
            <div className="text-xs text-foreground/60">
              Week starts <span className="font-mono">{exportWeekStartResolved}</span>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Button onClick={previewWeeklyHours}>Preview</Button>
          <Button variant="outline" onClick={openWeeklyHoursPreviewPage}>
            Open preview
          </Button>
          <Button variant="outline" onClick={openWeeklyHoursCsvInline}>
            Open CSV
          </Button>
          <Button variant="outline" onClick={() => window.location.assign("/admin/office-hours")}>
            Calendar view
          </Button>
          <Button variant="outline" onClick={downloadWeeklyHoursCsv}>
            Download CSV
          </Button>
          {exportPreviewRows ? (
            <Button variant="ghost" onClick={clearWeeklyHoursPreview}>
              Clear
            </Button>
          ) : null}
        </div>

        {exportPreviewRows ? (
          <div className="rounded-md border">
            <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="text-foreground/70">Preview rows: {exportPreviewRows.length}</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <thead className="border-t bg-foreground/5 text-left text-xs text-foreground/70">
	                  <tr>
	                    <th className="px-3 py-2">Name</th>
	                    <th className="px-3 py-2">Email</th>
	                    <th className="px-3 py-2 text-right">Total</th>
	                    <th className="px-3 py-2 text-right">In office</th>
	                    <th className="px-3 py-2 text-right">Deficit</th>
	                    <th className="px-3 py-2 text-right">Deficit in-office</th>
	                  </tr>
                </thead>
                <tbody className="divide-y">
                  {exportPreviewRows.map((r) => (
                    <tr key={`${r.user_id}:${r.week_start}`}>
                      <td className="px-3 py-2">{r.display_name || "—"}</td>
                      <td className="px-3 py-2">{r.email || "—"}</td>
	                      <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.total_minutes)}</td>
	                      <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.in_office_minutes)}</td>
	                      <td className="px-3 py-2 text-right font-mono">{formatMinutesValue(r.deficit_minutes)}</td>
	                      <td className="px-3 py-2 text-right font-mono">
                          {formatMinutesValue(r.deficit_in_office_minutes)}
                        </td>
	                    </tr>
	                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Office Hour Shifts</h2>
          <p className="text-sm text-foreground/70">
            Admin can schedule shifts; members can see their weekly shifts on the Office Hours page. Weekdays only (Mon-Fri).
          </p>
        </div>

        {shiftStatus ? (
          <div className="rounded-md border px-3 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
            {shiftStatus}
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm md:col-span-2">
            <div className="text-foreground/70">Search users</div>
            <input
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={shiftUserSearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setShiftUserSearch(e.target.value)}
              placeholder="Filter by name or email…"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <div className="text-foreground/70">User</div>
            <select
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={shiftUserId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setShiftUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {shiftUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {formatUserLabel(u)}
                </option>
              ))}
            </select>
            {selectedShiftUser ? (
              <div className="text-xs text-foreground/60">Selected: {formatUserLabel(selectedShiftUser)}</div>
            ) : null}
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Starts</div>
            <input
              type="datetime-local"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={shiftStartsAtLocal}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setShiftStartsAtLocal(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Ends</div>
            <input
              type="datetime-local"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={shiftEndsAtLocal}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setShiftEndsAtLocal(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <div className="text-foreground/70">Office location id (optional)</div>
            <input
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={shiftOfficeLocationId}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setShiftOfficeLocationId(e.target.value)}
              placeholder={officeConfig?.primary_office_location_id || ""}
            />
          </label>

          <div className="flex items-end">
            <Button onClick={onCreateShift} disabled={!shiftUserId}>
              Create shift
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Office Hour Requirements</h2>
          <p className="text-sm text-foreground/70">
            Configure weekly required hours for the selected term. In-office hours cannot exceed total hours.
          </p>
        </div>

        <div className="rounded-md border p-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {(["president", "executive", "director", "board_member", "volunteer"] as RoleKey[]).map((roleKey) => {
              const row = reqRows.get(roleKey);
              const total = row?.weekly_total_hours ?? 0;
              const inOffice = row?.weekly_in_office_hours ?? 0;

              return (
                <div key={roleKey} className="space-y-2">
                  <div className="text-sm font-medium">{roleKey}</div>

                  <label className="block text-sm">
                    <div className="text-foreground/70">Weekly total hours</div>
                    <input
                      className="mt-1 h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      type="number"
                      min={0}
                      step={1}
                      value={total}
                      onChange={(e) => {
                        const next = Math.max(0, Math.floor(Number(e.target.value || 0)));
                        updateRequirement(roleKey, { weekly_total_hours: next });
                        if (inOffice > next) {
                          updateRequirement(roleKey, { weekly_in_office_hours: next });
                        }
                      }}
                    />
                  </label>

                  <label className="block text-sm">
                    <div className="text-foreground/70">Weekly in-office hours</div>
                    <input
                      className="mt-1 h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                      type="number"
                      min={0}
                      step={1}
                      value={inOffice}
                      onChange={(e) => {
                        const next = Math.max(0, Math.floor(Number(e.target.value || 0)));
                        updateRequirement(roleKey, { weekly_in_office_hours: Math.min(next, total) });
                      }}
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button onClick={() => void loadOfficeHourRequirements(selectedTermId)} disabled={!selectedTermId}>
              Reload
            </Button>
            <Button onClick={() => void onSaveOfficeHourRequirements()} disabled={!selectedTermId}>
              Save requirements
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Office Hours Config</h2>
          <p className="text-sm text-foreground/70">
            Single office settings and quiet hours (times are evaluated in the configured timezone).
          </p>
        </div>

        {officeLocation && officeConfig ? (
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-foreground/70">Office name</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeLocation.name}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOfficeLocation({ ...officeLocation, name: e.target.value })
                }
              />
            </label>

            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-foreground/70">Timezone</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeLocation.timezone}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOfficeLocation({ ...officeLocation, timezone: e.target.value })
                }
                placeholder="America/Los_Angeles"
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Latitude</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeLatText}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setOfficeLatText(e.target.value)}
                inputMode="decimal"
                placeholder="32.81..."
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Longitude</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeLonText}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setOfficeLonText(e.target.value)}
                inputMode="decimal"
                placeholder="-117.00..."
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Radius (m)</div>
              <input
                type="number"
                min={0}
                step={1}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeLocation.radius_m ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  setOfficeLocation({ ...officeLocation, radius_m: v.trim() ? Number(v) : null });
                }}
                placeholder="20"
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Grace radius (m)</div>
              <input
                type="number"
                min={0}
                step={1}
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeLocation.grace_radius_m ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  setOfficeLocation({ ...officeLocation, grace_radius_m: v.trim() ? Number(v) : null });
                }}
                placeholder="40"
              />
            </label>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={officeLocation.active}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOfficeLocation({ ...officeLocation, active: e.target.checked })
                }
              />
              <span>Office active</span>
            </label>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={officeConfig.quiet_hours_enabled}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOfficeConfig({ ...officeConfig, quiet_hours_enabled: e.target.checked })
                }
              />
              <span>Quiet hours enabled</span>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Quiet hours start</div>
              <input
                type="time"
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeConfig.quiet_hours_start_local.slice(0, 5)}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOfficeConfig({ ...officeConfig, quiet_hours_start_local: e.target.value })
                }
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Quiet hours end</div>
              <input
                type="time"
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeConfig.quiet_hours_end_local.slice(0, 5)}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOfficeConfig({ ...officeConfig, quiet_hours_end_local: e.target.value })
                }
              />
            </label>

            <div className="md:col-span-4 border-t border-foreground/10 pt-3">
              <div className="text-sm font-medium">Weekly hours reminder</div>
              <div className="text-xs text-foreground/60">
                Sends a reminder to members with remaining hours. Uses current term dates.
                {currentTerm
                  ? ` Current term: ${currentTerm.name} (${currentTerm.start_date ?? "no start"} - ${currentTerm.end_date ?? "no end"}).`
                  : " No current term set."}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                checked={officeConfig.weekly_hours_reminder_enabled}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOfficeConfig({ ...officeConfig, weekly_hours_reminder_enabled: e.target.checked })
                }
              />
              <span>Enable weekly reminder</span>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Reminder day</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeConfig.weekly_hours_reminder_weekday}
                onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                  setOfficeConfig({ ...officeConfig, weekly_hours_reminder_weekday: Number(e.target.value) })
                }
              >
                <option value={1}>Monday</option>
                <option value={2}>Tuesday</option>
                <option value={3}>Wednesday</option>
                <option value={4}>Thursday</option>
                <option value={5}>Friday</option>
              </select>
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Reminder time (local)</div>
              <input
                type="time"
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeConfig.weekly_hours_reminder_time_local.slice(0, 5)}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setOfficeConfig({ ...officeConfig, weekly_hours_reminder_time_local: e.target.value })
                }
              />
            </label>

            <div className="flex items-end gap-3 md:col-span-4">
              <Button
                onClick={async () => {
                  const lat = parseOptionalNumber(officeLatText);
                  const lon = parseOptionalNumber(officeLonText);
                  if (officeLatText.trim() && lat === null) {
                    setStatus("Latitude must be a valid number.");
                    return;
                  }
                  if (officeLonText.trim() && lon === null) {
                    setStatus("Longitude must be a valid number.");
                    return;
                  }
                  const radius = officeLocation.radius_m;
                  if (radius !== null && (!Number.isFinite(radius) || radius <= 0)) {
                    setStatus("Radius must be greater than 0.");
                    return;
                  }
                  const graceRadius = officeLocation.grace_radius_m;
                  if (graceRadius !== null && (!Number.isFinite(graceRadius) || graceRadius < 0)) {
                    setStatus("Grace radius must be 0 or higher.");
                    return;
                  }

                  setStatus("Saving office config...");
                  try {
                    const payload = {
                      name: officeLocation.name,
                      timezone: officeLocation.timezone,
                      lat,
                      lon,
                      radius_m: officeLocation.radius_m,
                      grace_radius_m: officeLocation.grace_radius_m,
                      active: officeLocation.active,
                      quiet_hours_enabled: officeConfig.quiet_hours_enabled,
                      quiet_hours_start_local: officeConfig.quiet_hours_start_local.slice(0, 5),
                      quiet_hours_end_local: officeConfig.quiet_hours_end_local.slice(0, 5),
                      weekly_hours_reminder_enabled: officeConfig.weekly_hours_reminder_enabled,
                      weekly_hours_reminder_weekday: officeConfig.weekly_hours_reminder_weekday,
                      weekly_hours_reminder_time_local: officeConfig.weekly_hours_reminder_time_local.slice(0, 5),
                    };

                    const data = await fetchJson<{ officeConfig: OfficeConfigRow; officeLocation: OfficeLocationRow }>(
                      "/api/admin/office-config",
                      {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                      },
                    );

                    setOfficeConfig(data.officeConfig);
                    setOfficeLocation(data.officeLocation);
                    setOfficeLatText(typeof data.officeLocation.lat === "number" ? String(data.officeLocation.lat) : "");
                    setOfficeLonText(typeof data.officeLocation.lon === "number" ? String(data.officeLocation.lon) : "");
                    setStatus("Office config saved.");
                  } catch (e) {
                    setStatus(e instanceof Error ? e.message : "Failed to save office config");
                  }
                }}
              >
                Save office config
              </Button>

              <Button variant="ghost" onClick={() => void loadOfficeConfig()}>
                Reload
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-md border px-3 py-2 text-sm text-foreground/70">
            Loading office config...
          </div>
        )}
      </section>
        </>
      ) : null}

      {adminTab === "meetings" ? (
        <>
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-foreground/70">
            Sends a test email to your own account.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void onSendTestEmail()}>Send test email</Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Meetings</h2>
          <p className="text-sm text-foreground/70">Create a new meeting.</p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Meeting type</div>
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={meetingType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                const next = e.target.value;
                setMeetingType(next);
                if (next !== "committee") {
                  setMeetingCommitteeId("");
                } else if (!meetingCommitteeId && committees[0]?.id) {
                  setMeetingCommitteeId(committees[0].id);
                }
              }}
            >
              <option value="board">Board</option>
              <option value="committee">Committee</option>
              <option value="icc">ICC</option>
              <option value="special">Special</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Committee (optional)</div>
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={meetingCommitteeId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setMeetingCommitteeId(e.target.value)}
            >
              <option value="">Select committee…</option>
              {committees.map((committee) => (
                <option key={committee.id} value={committee.id}>
                  {committee.name}
                </option>
              ))}
            </select>
            <div className="text-xs text-foreground/60">Required for committee meetings.</div>
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <div className="text-foreground/70">Title</div>
            <input
              type="text"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={meetingTitle}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingTitle(e.target.value)}
              placeholder="Meeting title"
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <div className="text-foreground/70">Location</div>
            <input
              type="text"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={meetingLocation}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingLocation(e.target.value)}
              placeholder="e.g. Room 101"
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Starts at (local)</div>
            <input
              type="datetime-local"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={meetingStartsAtLocal}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingStartsAtLocal(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Ends at (local)</div>
            <input
              type="datetime-local"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={meetingEndsAtLocal}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingEndsAtLocal(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-4">
            <div className="text-foreground/70">Description (optional)</div>
            <input
              type="text"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={meetingDescription}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingDescription(e.target.value)}
              placeholder="Optional description"
            />
          </label>

          <div className="flex items-end md:col-span-4">
            <Button onClick={() => void onCreateMeeting()} disabled={!meetingTitle || !meetingStartsAtLocal || !meetingEndsAtLocal}>
              Create meeting
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-md border p-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Existing meetings</div>
              <div className="text-xs text-foreground/60">Edit details, update status, or cancel meetings.</div>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-sm">
                <div className="text-foreground/70">Search</div>
                <input
                  className="h-9 w-56 rounded-md border bg-transparent px-2 text-sm"
                  value={meetingSearch}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingSearch(e.target.value)}
                  placeholder="Filter by title or location…"
                />
              </label>
              <Button variant="ghost" onClick={() => void loadMeetings()}>
                Refresh
              </Button>
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {filteredMeetings.length === 0 ? (
              <div className="rounded-md border px-3 py-2 text-sm text-foreground/70">No meetings found.</div>
            ) : (
              filteredMeetings.map((meeting) => {
                const draft = meetingDrafts[meeting.id] ?? {
                  title: meeting.title,
                  description: meeting.description ?? "",
                  location: meeting.location ?? "",
                  starts_at_local: datetimeLocalFromIso(meeting.starts_at),
                  ends_at_local: datetimeLocalFromIso(meeting.ends_at),
                  status: meeting.status,
                };
                const committeeLabel = meeting.committee_id
                  ? committeeById.get(meeting.committee_id)?.name ?? meeting.committee_id
                  : "—";

                return (
                  <div key={meeting.id} className="rounded-md border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{meeting.title}</div>
                        <div className="text-xs text-foreground/60">
                          {formatMeetingTypeLabel(meeting.meeting_type)}
                          {meeting.committee_id ? ` • ${committeeLabel}` : ""}
                          {meeting.location ? ` • ${meeting.location}` : ""}
                        </div>
                        <div className="text-xs text-foreground/60">
                          {new Date(meeting.starts_at).toLocaleString()} → {new Date(meeting.ends_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => void saveMeeting(meeting)}>
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void cancelMeeting(meeting)}
                          className="text-red-600 hover:bg-red-500/10"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <label className="space-y-1 text-sm md:col-span-2">
                        <div className="text-foreground/70">Title</div>
                        <input
                          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                          value={draft.title}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            updateMeetingDraft(meeting.id, { title: e.target.value })
                          }
                        />
                      </label>

                      <label className="space-y-1 text-sm">
                        <div className="text-foreground/70">Status</div>
                        <select
                          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                          value={draft.status}
                          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                            updateMeetingDraft(meeting.id, { status: e.target.value })
                          }
                        >
                          {MEETING_STATUS_OPTIONS.map((statusOption) => (
                            <option key={statusOption} value={statusOption}>
                              {statusOption}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="space-y-1 text-sm md:col-span-2">
                        <div className="text-foreground/70">Location</div>
                        <input
                          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                          value={draft.location}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            updateMeetingDraft(meeting.id, { location: e.target.value })
                          }
                        />
                      </label>

                      <label className="space-y-1 text-sm">
                        <div className="text-foreground/70">Starts at (local)</div>
                        <input
                          type="datetime-local"
                          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                          value={draft.starts_at_local}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            updateMeetingDraft(meeting.id, { starts_at_local: e.target.value })
                          }
                        />
                      </label>

                      <label className="space-y-1 text-sm">
                        <div className="text-foreground/70">Ends at (local)</div>
                        <input
                          type="datetime-local"
                          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                          value={draft.ends_at_local}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            updateMeetingDraft(meeting.id, { ends_at_local: e.target.value })
                          }
                        />
                      </label>

                      <label className="space-y-1 text-sm md:col-span-3">
                        <div className="text-foreground/70">Description</div>
                        <input
                          className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                          value={draft.description}
                          onChange={(e: ChangeEvent<HTMLInputElement>) =>
                            updateMeetingDraft(meeting.id, { description: e.target.value })
                          }
                        />
                      </label>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
        </>
      ) : null}

      {adminTab === "roles" ? (
        <>
      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Assign roles</h2>
          <p className="text-sm text-foreground/70">
            Advisor is global. All other roles apply to the selected term.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Find user</div>
            <input
              type="text"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={userSearch}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setUserSearch(e.target.value)}
              placeholder="Filter by name or email…"
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">User</div>
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={selectedUserId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {usersForRolePicker.map((u) => (
                <option key={u.id} value={u.id}>
                  {formatUserLabel(u)}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Role</div>
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={selectedRoleKey}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedRoleKey(e.target.value as RoleKey)}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-end">
            <Button onClick={onAssignRole} disabled={!selectedUserId}>
              Assign role
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Active assignments</h2>
          <p className="text-sm text-foreground/70">
            Global Advisor assignments and assignments for the selected term.
          </p>
        </div>

        <div className="space-y-3">
          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-sm font-medium">Global</div>
            <div className="divide-y">
              {globalAdvisorAssignments.length === 0 ? (
                <div className="px-3 py-2 text-sm text-foreground/70">No active global roles.</div>
              ) : (
                globalAdvisorAssignments.map((a) => {
                  const u = usersById.get(a.user_id);
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm">{u ? formatUserLabel(u) : a.user_id}</div>
                        <div className="text-xs text-foreground/70">{a.role_key}</div>
                      </div>
                      <Button variant="ghost" onClick={() => void onEndAssignment(a.id)}>
                        End
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-md border">
            <div className="border-b px-3 py-2 text-sm font-medium">Selected term</div>
            <div className="divide-y">
              {termAssignments.length === 0 ? (
                <div className="px-3 py-2 text-sm text-foreground/70">No active term roles.</div>
              ) : (
                termAssignments.map((a) => {
                  const u = usersById.get(a.user_id);
                  return (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm">{u ? formatUserLabel(u) : a.user_id}</div>
                        <div className="text-xs text-foreground/70">{a.role_key}</div>
                      </div>
                      <Button variant="ghost" onClick={() => void onEndAssignment(a.id)}>
                        End
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>
        </>
      ) : null}
    </div>
  );
}
