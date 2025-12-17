"use client";

import type { ChangeEvent } from "react";
import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

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

type RoleKey = "advisor" | "president" | "officer" | "volunteer";

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

const ROLE_OPTIONS: Array<{ key: RoleKey; label: string; scope: "global" | "term" }> = [
  { key: "advisor", label: "Advisor (global)", scope: "global" },
  { key: "president", label: "President (term)", scope: "term" },
  { key: "officer", label: "Officer (term)", scope: "term" },
  { key: "volunteer", label: "Volunteer (term)", scope: "term" },
];

function formatUserLabel(u: UserRow) {
  const primary = u.display_name?.trim() || u.email?.trim() || u.id;
  const secondary = u.display_name?.trim() && u.email?.trim() ? ` (${u.email})` : "";
  return `${primary}${secondary}`;
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

export function AdminPanel({
  initialTerms,
  initialUsers,
  initialSelectedTermId,
  initialGlobalAdvisorAssignments,
  initialTermAssignments,
  initialOfficeLocation,
  initialOfficeConfig,
  initialOfficeHourRequirements,
}: {
  initialTerms: TermRow[];
  initialUsers: UserRow[];
  initialSelectedTermId: string;
  initialGlobalAdvisorAssignments: AssignmentRow[];
  initialTermAssignments: AssignmentRow[];
  initialOfficeLocation: OfficeLocationRow | null;
  initialOfficeConfig: OfficeConfigRow | null;
  initialOfficeHourRequirements: OfficeHourRequirementRow[];
}) {
  const [terms, setTerms] = useState<TermRow[]>(initialTerms);
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [selectedTermId, setSelectedTermId] = useState<string>(initialSelectedTermId);

  const [globalAdvisorAssignments, setGlobalAdvisorAssignments] = useState<AssignmentRow[]>(
    initialGlobalAdvisorAssignments,
  );
  const [termAssignments, setTermAssignments] = useState<AssignmentRow[]>(initialTermAssignments);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedRoleKey, setSelectedRoleKey] = useState<RoleKey>("officer");

  const [newTermName, setNewTermName] = useState<string>("");
  const [newTermStart, setNewTermStart] = useState<string>("");
  const [newTermEnd, setNewTermEnd] = useState<string>("");

  const [officeLocation, setOfficeLocation] = useState<OfficeLocationRow | null>(initialOfficeLocation);
  const [officeConfig, setOfficeConfig] = useState<OfficeConfigRow | null>(initialOfficeConfig);

  const [officeHourRequirements, setOfficeHourRequirements] = useState<OfficeHourRequirementRow[]>(
    initialOfficeHourRequirements,
  );

  const [pinStatus, setPinStatus] = useState<string>("");
  const [currentPin, setCurrentPin] = useState<string>("");
  const [pinValidTo, setPinValidTo] = useState<string>("");
  const [pinWindowSeconds, setPinWindowSeconds] = useState<number>(60);
  const [pinAutoRefresh, setPinAutoRefresh] = useState<boolean>(false);

  const [exportWeekStart, setExportWeekStart] = useState<string>("");

  const [shiftUserId, setShiftUserId] = useState<string>("");
  const [shiftStartsAtLocal, setShiftStartsAtLocal] = useState<string>("");
  const [shiftEndsAtLocal, setShiftEndsAtLocal] = useState<string>("");
  const [shiftOfficeLocationId, setShiftOfficeLocationId] = useState<string>("");
  const [shiftStatus, setShiftStatus] = useState<string>("");

  // Meeting form state (Phase 21)
  const [meetingType, setMeetingType] = useState<string>("board");
  const [meetingTitle, setMeetingTitle] = useState<string>("");
  const [meetingDescription, setMeetingDescription] = useState<string>("");
  const [meetingLocation, setMeetingLocation] = useState<string>("");
  const [meetingStartsAtLocal, setMeetingStartsAtLocal] = useState<string>("");
  const [meetingEndsAtLocal, setMeetingEndsAtLocal] = useState<string>("");

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

    const roles: RoleKey[] = ["president", "officer", "volunteer"];
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

  async function fetchCurrentPin() {
    setPinStatus("Loading PIN...");
    try {
      const data = await fetchJson<{ pin: string; validFrom: string; validTo: string; windowSeconds: number }>(
        "/api/admin/presence-pin",
      );
      setCurrentPin(data.pin);
      setPinValidTo(data.validTo);
      setPinWindowSeconds(data.windowSeconds);
      setPinStatus("");
    } catch (e) {
      setPinStatus(e instanceof Error ? e.message : "Failed to load PIN");
    }
  }

  async function loadOfficeConfig() {
    setStatus("Loading office config...");
    try {
      const data = await fetchJson<{ officeConfig: OfficeConfigRow; officeLocation: OfficeLocationRow }>(
        "/api/admin/office-config",
      );
      setOfficeConfig(data.officeConfig);
      setOfficeLocation(data.officeLocation);
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

  const selectedRole = useMemo(
    () => ROLE_OPTIONS.find((r) => r.key === selectedRoleKey) ?? ROLE_OPTIONS[0],
    [selectedRoleKey],
  );

  function downloadWeeklyHoursCsv() {
    const qs = exportWeekStart.trim() ? `?weekStart=${encodeURIComponent(exportWeekStart.trim())}` : "";
    window.location.href = `/api/admin/office-hours/export-week${qs}`;
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
      setShiftStatus(e instanceof Error ? e.message : "Failed to create shift");
    }
  }

  async function onCreateMeeting() {
    setStatus("Creating meeting...");
    try {
      if (!meetingTitle) {
        setStatus("Meeting title is required.");
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
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to create meeting");
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
    if (!nextTermId) return;
    try {
      await Promise.all([loadAssignments(nextTermId), loadOfficeHourRequirements(nextTermId)]);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load role assignments");
    }
  }

  const currentTermId = terms.find((t: TermRow) => t.is_current)?.id ?? "";

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

  // Auto-refresh PIN when enabled.
  // Keep it simple: poll every 5 seconds.
  useEffect(() => {
    if (!pinAutoRefresh) return;

    window.setTimeout(() => {
      void fetchCurrentPin();
    }, 0);
    const id = window.setInterval(() => {
      void fetchCurrentPin();
    }, 5000);

    return () => {
      window.clearInterval(id);
    };
  }, [pinAutoRefresh]);

  return (
    <div className="space-y-10">
      {status ? (
        <div className="rounded-md border px-3 py-2 text-sm text-foreground/80">
          {status}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Terms</h2>
          <p className="text-sm text-foreground/70">
            Role assignments for President/Officer/Volunteer are term-scoped.
          </p>
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
                  {t.name}{t.is_current ? " (current)" : ""}
                </option>
              ))}
            </select>
          </label>

          <Button onClick={onSetCurrentTerm} disabled={!selectedTermId || selectedTermId === currentTermId}>
            Set as current
          </Button>
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
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={newTermStart}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTermStart(e.target.value)}
              placeholder="YYYY-MM-DD"
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">End date (optional)</div>
            <input
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
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Office Hours Export (CSV)</h2>
          <p className="text-sm text-foreground/70">
            Phase 16. Exports weekly totals/deficits for all active users.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Week start (YYYY-MM-DD)</div>
            <input
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={exportWeekStart}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setExportWeekStart(e.target.value)}
              placeholder="2025-12-15"
            />
          </label>

          <div className="flex items-end">
            <Button onClick={downloadWeeklyHoursCsv}>Download CSV</Button>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Office Hour Shifts</h2>
          <p className="text-sm text-foreground/70">
            Phase 17. Admin can schedule shifts; members can see their weekly shifts on the Office Hours page.
          </p>
        </div>

        {shiftStatus ? <div className="rounded-md border px-3 py-2 text-sm text-foreground/80">{shiftStatus}</div> : null}

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm md:col-span-2">
            <div className="text-foreground/70">User</div>
            <select
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={shiftUserId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setShiftUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {formatUserLabel(u)}
                </option>
              ))}
            </select>
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
            {(["president", "officer", "volunteer"] as RoleKey[]).map((roleKey) => {
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
          <h2 className="text-lg font-semibold">Office PIN (kiosk)</h2>
          <p className="text-sm text-foreground/70">
            Rotating PIN used for Office Hours check-in (Phase 13). Keep this displayed in the office.
          </p>
        </div>

        {pinStatus ? <div className="rounded-md border px-3 py-2 text-sm text-foreground/80">{pinStatus}</div> : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void fetchCurrentPin()}>Get current PIN</Button>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={pinAutoRefresh}
              onChange={(e) => setPinAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>

        <div className="rounded-md border p-3">
          <div className="text-sm text-foreground/70">PIN</div>
          <div className="mt-1 font-mono text-3xl tracking-widest">{currentPin || "------"}</div>
          <div className="mt-2 text-sm text-foreground/70">
            Expires at: {pinValidTo || "—"} (window {pinWindowSeconds}s)
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Office Hours Config</h2>
          <p className="text-sm text-foreground/70">
            Phase 11. Single office settings and quiet hours.
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
                value={officeLocation.lat ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  setOfficeLocation({ ...officeLocation, lat: v.trim() ? Number(v) : null });
                }}
                placeholder="32.81..."
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Longitude</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={officeLocation.lon ?? ""}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  const v = e.target.value;
                  setOfficeLocation({ ...officeLocation, lon: v.trim() ? Number(v) : null });
                }}
                placeholder="-117.00..."
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Radius (m)</div>
              <input
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

            <div className="flex items-end gap-3 md:col-span-4">
              <Button
                onClick={async () => {
                  setStatus("Saving office config...");
                  try {
                    const payload = {
                      name: officeLocation.name,
                      timezone: officeLocation.timezone,
                      lat: officeLocation.lat,
                      lon: officeLocation.lon,
                      radius_m: officeLocation.radius_m,
                      grace_radius_m: officeLocation.grace_radius_m,
                      active: officeLocation.active,
                      quiet_hours_enabled: officeConfig.quiet_hours_enabled,
                      quiet_hours_start_local: officeConfig.quiet_hours_start_local.slice(0, 5),
                      quiet_hours_end_local: officeConfig.quiet_hours_end_local.slice(0, 5),
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

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Notifications</h2>
          <p className="text-sm text-foreground/70">
            Phase 10 plumbing. Sends a test email to your own account.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => void onSendTestEmail()}>Send test email</Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Meetings</h2>
          <p className="text-sm text-foreground/70">Create a new meeting (Phase 21).</p>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Meeting type</div>
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={meetingType}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setMeetingType(e.target.value)}
            >
              <option value="board">Board</option>
              <option value="committee">Committee</option>
              <option value="icc">ICC</option>
              <option value="special">Special</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Title</div>
            <input
              type="text"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={meetingTitle}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingTitle(e.target.value)}
              placeholder="Meeting title"
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Location</div>
            <input
              type="text"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={meetingLocation}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingLocation(e.target.value)}
              placeholder="e.g. Room 101"
            />
          </label>

          <div className="flex items-end">
            <Button onClick={() => void onCreateMeeting()} disabled={!meetingTitle || !meetingStartsAtLocal || !meetingEndsAtLocal}>
              Create meeting
            </Button>
          </div>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Starts at (local)</div>
            <input
              type="datetime-local"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={meetingStartsAtLocal}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingStartsAtLocal(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Ends at (local)</div>
            <input
              type="datetime-local"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={meetingEndsAtLocal}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingEndsAtLocal(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm md:col-span-2">
            <div className="text-foreground/70">Description (optional)</div>
            <input
              type="text"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={meetingDescription}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setMeetingDescription(e.target.value)}
              placeholder="Optional description"
            />
          </label>
        </div>
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Assign roles</h2>
          <p className="text-sm text-foreground/70">
            Advisor is global. President/Officer/Volunteer apply to the selected term.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">User</div>
            <select
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={selectedUserId}
              onChange={(e: ChangeEvent<HTMLSelectElement>) => setSelectedUserId(e.target.value)}
            >
              <option value="">Select a user…</option>
              {users.map((u) => (
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
    </div>
  );
}
