"use client";

import type { ChangeEvent } from "react";
import { useMemo, useState } from "react";

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
}: {
  initialTerms: TermRow[];
  initialUsers: UserRow[];
  initialSelectedTermId: string;
  initialGlobalAdvisorAssignments: AssignmentRow[];
  initialTermAssignments: AssignmentRow[];
  initialOfficeLocation: OfficeLocationRow | null;
  initialOfficeConfig: OfficeConfigRow | null;
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

  const [status, setStatus] = useState<string>("");

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
      await loadAssignments(nextTermId);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Failed to load role assignments");
    }
  }

  const currentTermId = terms.find((t: TermRow) => t.is_current)?.id ?? "";

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
