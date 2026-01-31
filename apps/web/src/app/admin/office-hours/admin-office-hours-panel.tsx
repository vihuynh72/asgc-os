"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { normalizeDateOnlyString } from "@/lib/dateOnly";
import { cn } from "@/lib/utils";

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
};

type OfficeHourAdminSession = {
  id: string;
  user_id: string;
  user_display_name: string;
  user_email: string;
  office_location_id: string | null;
  office_location_name: string;
  office_location_timezone: string;
  checkin_at: string;
  checkout_at: string | null;
  status: string;
  duration_minutes: number | null;
  within_radius: boolean | null;
  within_grace: boolean | null;
  distance_m_at_checkin: number | null;
  distance_m_at_checkout: number | null;
};

type ViewMode = "day" | "week" | "month";

function todayDateString(): string {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDateUtc(dateStr: string): Date {
  // Use midday UTC to avoid timezone-related "previous day" rendering issues.
  const iso = normalizeDateOnlyString(dateStr) ?? todayDateString();
  return new Date(`${iso}T12:00:00Z`);
}

function formatDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = parseDateUtc(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateUtc(d);
}

function startOfWeekMonday(dateStr: string): string {
  const d = parseDateUtc(dateStr);
  const day = d.getUTCDay(); // 0=Sun ... 6=Sat
  const daysSinceMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return formatDateUtc(d);
}

function startOfMonth(dateStr: string): string {
  const d = parseDateUtc(dateStr);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return formatDateUtc(new Date(Date.UTC(y, m, 1)));
}

function startOfNextMonth(dateStr: string): string {
  const d = parseDateUtc(dateStr);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return formatDateUtc(new Date(Date.UTC(y, m + 1, 1)));
}

function formatDateKeyInTz(iso: string, timeZone: string | null): string {
  const d = new Date(iso);
  if (!timeZone) return iso.slice(0, 10);

  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const year = parts.find((p) => p.type === "year")?.value ?? "0000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function formatTimeInTz(iso: string, timeZone: string | null): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone ?? undefined,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

function formatDateHeading(dateStr: string, timeZone: string | null): string {
  const d = parseDateUtc(dateStr);
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timeZone ?? undefined,
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export function AdminOfficeHoursPanel({ initialUsers }: { initialUsers: UserRow[] }) {
  const [view, setView] = useState<ViewMode>("week");
  const [anchorDate, setAnchorDate] = useState<string>(() => todayDateString());
  const [tz, setTz] = useState<string | null>(null);

  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [groupByUser, setGroupByUser] = useState<boolean>(true);
  const [statusFilter, setStatusFilter] = useState<Record<string, boolean>>({
    open: true,
    closed: true,
    auto_closed: true,
    voided: false,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [sessions, setSessions] = useState<OfficeHourAdminSession[]>([]);

  const { startDate, endDate } = useMemo(() => {
    if (view === "day") {
      const start = normalizeDateOnlyString(anchorDate) ?? todayDateString();
      return { startDate: start, endDate: addDays(start, 1) };
    }

    if (view === "week") {
      const wk = startOfWeekMonday(anchorDate);
      return { startDate: wk, endDate: addDays(wk, 5) };
    }

    const m = startOfMonth(anchorDate);
    return { startDate: m, endDate: startOfNextMonth(anchorDate) };
  }, [anchorDate, view]);

  const enabledStatuses = useMemo(
    () => Object.entries(statusFilter).filter(([, on]) => on).map(([k]) => k),
    [statusFilter],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const params = new URLSearchParams({
          startDate,
          endDate,
          limit: view === "month" ? "5000" : "2000",
        });

        if (selectedUserId) params.set("userId", selectedUserId);
        if (enabledStatuses.length > 0) params.set("status", enabledStatuses.join(","));

        const data = await fetchJson<{
          tz: string;
          sessions: OfficeHourAdminSession[];
        }>(`/api/admin/office-hours/sessions?${params.toString()}`);

        if (cancelled) return;
        setTz(data.tz || null);
        setSessions(data.sessions ?? []);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load sessions");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [endDate, enabledStatuses, selectedUserId, startDate, view]);

  function onPrev() {
    if (view === "day") setAnchorDate((d) => addDays(d, -1));
    else if (view === "week") setAnchorDate((d) => addDays(d, -7));
    else setAnchorDate((d) => addDays(startOfMonth(d), -1));
  }

  function onNext() {
    if (view === "day") setAnchorDate((d) => addDays(d, 1));
    else if (view === "week") setAnchorDate((d) => addDays(d, 7));
    else setAnchorDate((d) => startOfNextMonth(d));
  }

  const filteredSessions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => {
      const hay = `${s.user_display_name} ${s.user_email} ${s.office_location_name} ${s.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [search, sessions]);

  const sessionsByDay = useMemo(() => {
    const m = new Map<string, OfficeHourAdminSession[]>();
    for (const s of filteredSessions) {
      const key = formatDateKeyInTz(s.checkin_at, tz);
      const arr = m.get(key);
      if (arr) arr.push(s);
      else m.set(key, [s]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => Date.parse(a.checkin_at) - Date.parse(b.checkin_at));
    }
    return m;
  }, [filteredSessions, tz]);

  const userGroupsByDay = useMemo(() => {
    const byDay = new Map<
      string,
      Array<{
        user_id: string;
        user_display_name: string;
        user_email: string;
        total_minutes: number;
        sessions: OfficeHourAdminSession[];
      }>
    >();

    for (const [day, daySessions] of sessionsByDay.entries()) {
      const byUser = new Map<
        string,
        {
          user_id: string;
          user_display_name: string;
          user_email: string;
          total_minutes: number;
          sessions: OfficeHourAdminSession[];
        }
      >();

      for (const s of daySessions) {
        const key = s.user_id;
        const existing =
          byUser.get(key) ?? {
            user_id: s.user_id,
            user_display_name: s.user_display_name,
            user_email: s.user_email,
            total_minutes: 0,
            sessions: [],
          };

        existing.sessions.push(s);
        if (typeof s.duration_minutes === "number") existing.total_minutes += s.duration_minutes;

        byUser.set(key, existing);
      }

      const groups = Array.from(byUser.values());
      groups.sort((a, b) => b.total_minutes - a.total_minutes);
      byDay.set(day, groups);
    }

    return byDay;
  }, [sessionsByDay]);

  const weekDays = useMemo(() => {
    if (view !== "week") return [];
    const out: string[] = [];
    for (let i = 0; i < 5; i += 1) out.push(addDays(startDate, i));
    return out;
  }, [startDate, view]);

  const monthGrid = useMemo(() => {
    if (view !== "month") return { days: [] as Array<string | null>, monthStart: startDate };
    const monthStart = startDate;
    const first = parseDateUtc(monthStart);
    const dow = first.getUTCDay(); // 0=Sun
    const leading = dow; // calendar grid starting Sunday
    const cells: Array<string | null> = [];
    for (let i = 0; i < leading; i += 1) cells.push(null);

    const nextMonth = parseDateUtc(endDate);
    const daysInMonth = Math.round((nextMonth.getTime() - first.getTime()) / (24 * 60 * 60 * 1000));
    for (let i = 0; i < daysInMonth; i += 1) cells.push(addDays(monthStart, i));

    while (cells.length % 7 !== 0) cells.push(null);
    return { days: cells, monthStart };
  }, [endDate, startDate, view]);

  const totalMinutes = useMemo(() => {
    let sum = 0;
    for (const s of filteredSessions) {
      if (typeof s.duration_minutes === "number") sum += s.duration_minutes;
    }
    return sum;
  }, [filteredSessions]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="text-sm text-foreground/70">
          {tz ? `Times shown in ${tz}. Week view is Mon-Fri only.` : "Loading office timezone…"}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant={view === "day" ? "default" : "outline"} onClick={() => setView("day")}>
            Day
          </Button>
          <Button variant={view === "week" ? "default" : "outline"} onClick={() => setView("week")}>
            Week
          </Button>
          <Button variant={view === "month" ? "default" : "outline"} onClick={() => setView("month")}>
            Month
          </Button>
        </div>
      </div>

      <div className="rounded-md border p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onPrev}>
              Prev
            </Button>
            <Button variant="outline" onClick={() => setAnchorDate(todayDateString())}>
              Today
            </Button>
            <Button variant="outline" onClick={onNext}>
              Next
            </Button>
          </div>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">{view === "week" ? "Work week of" : "Date"}</div>
            <input
              type="date"
              className="h-9 rounded-md border bg-transparent px-2 text-sm"
              value={anchorDate}
              onChange={(e) => setAnchorDate(normalizeDateOnlyString(e.target.value) ?? todayDateString())}
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">User (optional)</div>
            <select
              className="h-9 w-72 rounded-md border bg-transparent px-2 text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">All users</option>
              {initialUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {(u.display_name?.trim() || u.email?.trim() || u.id) + (u.email && u.display_name ? ` (${u.email})` : "")}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Search</div>
            <input
              className="h-9 w-60 rounded-md border bg-transparent px-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, email, status…"
            />
          </label>

          {view === "week" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={groupByUser}
                onChange={(e) => setGroupByUser(e.target.checked)}
              />
              <span className="text-foreground/70">Group by user</span>
            </label>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-foreground/70">
          <span>Status:</span>
          {Object.keys(statusFilter).map((k) => (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={statusFilter[k]}
                onChange={(e) => setStatusFilter((prev) => ({ ...prev, [k]: e.target.checked }))}
              />
              <span className="font-mono">{k}</span>
            </label>
          ))}
          <span className="ml-auto">
            {loading ? "Loading…" : `${filteredSessions.length} session${filteredSessions.length === 1 ? "" : "s"} • ${formatMinutes(totalMinutes)}`}
          </span>
        </div>

        {error ? (
          <div className="mt-3 text-sm text-red-600" role="alert">
            {error}
          </div>
        ) : null}
      </div>

      {view === "day" ? (
        <div className="rounded-md border">
          <div className="px-3 py-2 text-sm text-foreground/70">
            {formatDateHeading(startDate, tz)} • {filteredSessions.length} session{filteredSessions.length === 1 ? "" : "s"}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead className="border-t bg-foreground/5 text-left text-xs text-foreground/70">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Check-in</th>
                  <th className="px-3 py-2">Check-out</th>
                  <th className="px-3 py-2">Duration</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Location</th>
                  <th className="px-3 py-2">In radius</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredSessions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-3 py-2">
                      <div className="font-medium">{s.user_display_name || "—"}</div>
                      <div className="text-xs text-foreground/60">{s.user_email || s.user_id}</div>
                    </td>
                    <td className="px-3 py-2 font-mono">{formatTimeInTz(s.checkin_at, tz)}</td>
                    <td className="px-3 py-2 font-mono">{s.checkout_at ? formatTimeInTz(s.checkout_at, tz) : "—"}</td>
                    <td className="px-3 py-2">{typeof s.duration_minutes === "number" ? formatMinutes(s.duration_minutes) : "—"}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="px-3 py-2">{s.office_location_name || "—"}</td>
                    <td className="px-3 py-2">{s.within_radius ? "Yes" : "No"}</td>
                  </tr>
                ))}
                {filteredSessions.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-foreground/60" colSpan={7}>
                      No sessions found for this day.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {view === "week" ? (
        <div className="overflow-x-auto pb-4">
          <div className="grid min-w-[1400px] grid-cols-5 gap-4">
            {weekDays.map((day) => {
              const daySessions = sessionsByDay.get(day) ?? [];
              const dayMinutes = daySessions.reduce((sum, s) => sum + (typeof s.duration_minutes === "number" ? s.duration_minutes : 0), 0);
              const groups = userGroupsByDay.get(day) ?? [];
              const isToday = day === todayDateString();

              return (
                <div
                  key={day}
                  className={cn(
                    "flex h-full min-h-[24rem] flex-col rounded-lg border bg-card text-card-foreground shadow-sm",
                    isToday && "ring-2 ring-primary/20 border-primary/50",
                  )}
                >
                  <div className="border-b p-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">{formatDateHeading(day, tz)}</div>
                      {isToday && <span className="text-[10px] font-bold uppercase tracking-wider text-primary">Today</span>}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {daySessions.length} session{daySessions.length === 1 ? "" : "s"}
                      {dayMinutes > 0 && <span className="ml-1">• {formatMinutes(dayMinutes)}</span>}
                    </div>
                  </div>

                  <div className="flex-1 space-y-3 p-2 overflow-y-auto max-h-[500px]">
                    {daySessions.length === 0 ? (
                      <div className="py-8 text-center text-xs text-muted-foreground/50 italic">No sessions</div>
                    ) : groupByUser ? (
                      groups.map((g) => (
                        <details
                          key={`${day}:${g.user_id}`}
                          className="group rounded-md border bg-background text-xs shadow-sm open:ring-1 open:ring-ring/10"
                        >
                          <summary className="flex cursor-pointer select-none items-center justify-between p-2 hover:bg-muted/50 transition-colors [&::-webkit-details-marker]:hidden">
                            <div className="flex flex-col min-w-0 flex-1 mr-2">
                              <span className="font-medium truncate" title={g.user_display_name || g.user_email || g.user_id}>
                                {g.user_display_name || g.user_email || g.user_id}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {g.sessions.length} sess • {formatMinutes(g.total_minutes)}
                              </span>
                            </div>
                            <div className="text-muted-foreground/50 group-open:rotate-180 transition-transform duration-200">
                              <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path
                                  d="M1 1L5 5L9 1"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </div>
                          </summary>
                          <div className="border-t bg-muted/10 p-2 space-y-2">
                            {g.sessions.map((s) => (
                              <SessionCard key={s.id} session={s} tz={tz} />
                            ))}
                          </div>
                        </details>
                      ))
                    ) : (
                      daySessions.map((s) => <SessionCard key={s.id} session={s} tz={tz} showUser />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {view === "month" ? (
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm text-foreground/70">
            Month starting {monthGrid.monthStart}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="bg-background px-2 py-2 text-xs font-medium text-foreground/70">
                {d}
              </div>
            ))}
            {monthGrid.days.map((day, idx) => {
              if (!day) {
                return <div key={`empty-${idx}`} className="bg-background px-2 py-6" />;
              }

              const daySessions = sessionsByDay.get(day) ?? [];
              const dayMinutes = daySessions.reduce((sum, s) => sum + (typeof s.duration_minutes === "number" ? s.duration_minutes : 0), 0);

              return (
                <button
                  key={day}
                  type="button"
                  className="min-h-24 bg-background px-2 py-2 text-left hover:bg-foreground/5"
                  onClick={() => {
                    setView("day");
                    setAnchorDate(day);
                  }}
                >
                  <div className="text-xs font-medium">{day.slice(-2)}</div>
                  {daySessions.length > 0 ? (
                    <div className="mt-1 text-xs text-foreground/70">
                      {daySessions.length} • {formatMinutes(dayMinutes)}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-foreground/50">—</div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 text-xs text-foreground/60">
            Tip: click a day to jump to Day view.
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SessionCard({
  session,
  tz,
  showUser,
}: {
  session: OfficeHourAdminSession;
  tz: string | null;
  showUser?: boolean;
}) {
  return (
    <div className="rounded border bg-background p-2 text-xs shadow-sm">
      {showUser && (
        <div className="mb-1.5 font-medium truncate border-b pb-1">
          {session.user_display_name || session.user_email || session.user_id}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <div className="font-mono text-muted-foreground whitespace-nowrap">
          {formatTimeInTz(session.checkin_at, tz)}
          <span className="mx-1 text-muted-foreground/40">→</span>
          {session.checkout_at ? formatTimeInTz(session.checkout_at, tz) : "—"}
        </div>
        <StatusBadge status={session.status} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-muted-foreground">
        <div className="font-medium">
          {typeof session.duration_minutes === "number" ? formatMinutes(session.duration_minutes) : "—"}
        </div>
        {session.within_radius === false && (
          <span className="flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            Outside
          </span>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles = {
    open: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    closed: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400",
    auto_closed: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    voided: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  };
  const style = styles[status as keyof typeof styles] || "bg-gray-100 text-gray-700";

  return (
    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium capitalize", style)}>
      {status.replace("_", " ")}
    </span>
  );
}
