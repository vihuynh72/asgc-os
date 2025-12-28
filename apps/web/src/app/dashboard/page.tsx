import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type WeeklyHoursRow = {
  user_id: string;
  week_start: string;
  total_minutes: number;
  in_office_minutes: number;
  deficit_minutes: number;
  deficit_in_office_minutes: number;
};

type TaskRow = {
  id: string;
  title: string;
  status: "todo" | "doing" | "done";
  due_at: string | null;
  assigned_to?: string | null;
};

type ShiftRow = {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
};

type MeetingRow = {
  id: string;
  title: string;
  meeting_type: string;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
};

function formatHours(minutes: number) {
  const safe = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m}m`;
}

function formatMeetingType(type: string): string {
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

function formatDateLabel(iso: string, options?: Intl.DateTimeFormatOptions): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso;
  const d = new Date(normalized);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, options ?? { month: "short", day: "numeric", year: "numeric" }).format(d);
}

function isOverdue(iso: string | null, nowMs: number): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  return Number.isFinite(ts) && ts < nowMs;
}

function isDueSoon(iso: string | null, nowMs: number, days: number): boolean {
  if (!iso) return false;
  const ts = new Date(iso).getTime();
  const windowMs = days * 24 * 60 * 60 * 1000;
  return Number.isFinite(ts) && ts >= nowMs && ts <= nowMs + windowMs;
}

function isSameLocalDay(iso: string, now: Date): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

type IconProps = {
  className?: string;
};

function IconClock({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconChecklist({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M9 6h12" />
      <path d="M9 12h12" />
      <path d="M9 18h12" />
      <path d="M3 6l1.5 1.5L7 5" />
      <path d="M3 12l1.5 1.5L7 11" />
      <path d="M3 18l1.5 1.5L7 17" />
    </svg>
  );
}

function IconCalendar({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function IconUsers({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="8" cy="8" r="3" />
      <path d="M2.5 20a5.5 5.5 0 0 1 11 0" />
      <circle cx="17" cy="10" r="3" />
      <path d="M14.5 20a4.5 4.5 0 0 1 7.5 0" />
    </svg>
  );
}

function IconFolder({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  );
}

function IconZap({ className }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13 2L3 14h7l-1 8 10-12h-7l1-8z" />
    </svg>
  );
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.parse(nowIso);

  const [
    weeklyRes,
    { data: tzData },
    { data: tasksRaw },
    { data: delegatedTasksRaw },
    { data: shiftsRaw },
    { data: meetingsRaw },
    { data: openSessionRaw },
  ] = await Promise.all([
    supabase.rpc("my_weekly_hours", { _week_start: null }),
    supabase.rpc("office_timezone"),
    supabase
      .from("tasks")
      .select("id,title,status,due_at")
      .eq("assigned_to", user.id)
      .neq("status", "done")
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("tasks")
      .select("id,title,status,due_at,assigned_to")
      .eq("created_by", user.id)
      .neq("status", "done")
      .order("due_at", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(6),
    supabase
      .from("office_hour_shifts")
      .select("id,starts_at,ends_at,status")
      .eq("user_id", user.id)
      .eq("status", "scheduled")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(6),
    supabase.rpc("my_upcoming_meetings", { _limit: 4 }),
    supabase
      .from("office_hour_sessions")
      .select("checkin_at")
      .eq("user_id", user.id)
      .eq("status", "open")
      .is("checkout_at", null)
      .order("checkin_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let weeklyRows = weeklyRes.data;
  if (weeklyRes.error) {
    // Compatibility: older DBs may only have the no-arg version (or may not support overloads well).
    const fallback = await supabase.rpc("my_weekly_hours");
    weeklyRows = fallback.data;
  }

  const weekly = (weeklyRows?.[0] as WeeklyHoursRow | undefined) ?? null;
  const officeTz = typeof tzData === "string" && tzData.length > 0 ? tzData : null;

  const formatInOfficeTz = (iso: string) => {
    const d = new Date(iso);
    if (!officeTz) return d.toLocaleString();
    return new Intl.DateTimeFormat(undefined, {
      timeZone: officeTz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  };

  const tasks = (tasksRaw ?? []) as TaskRow[];
  const delegatedTasks = ((delegatedTasksRaw ?? []) as TaskRow[]).filter((t) => t.assigned_to !== user.id);
  const shifts = (shiftsRaw ?? []) as ShiftRow[];
  const meetings = (meetingsRaw ?? []) as MeetingRow[];
  const now = new Date(nowIso);
  const taskOverdueCount = tasks.filter((t) => isOverdue(t.due_at, nowMs)).length;
  const taskDueSoonCount = tasks.filter((t) => isDueSoon(t.due_at, nowMs, 7)).length;
  const meetingsTodayCount = meetings.filter((m) => isSameLocalDay(m.starts_at, now)).length;
  const meetingsWeekCount = meetings.filter((m) => isDueSoon(m.starts_at, nowMs, 7)).length;
  const deficitMinutes = weekly?.deficit_minutes ?? 0;
  const inOfficeDeficitMinutes = weekly?.deficit_in_office_minutes ?? 0;
  const totalMinutes = weekly?.total_minutes ?? 0;
  const inOfficeMinutes = weekly?.in_office_minutes ?? 0;
  const weekStartLabel = weekly?.week_start
    ? formatDateLabel(weekly.week_start)
    : null;

  const openSession = (openSessionRaw as { checkin_at?: string } | null) ?? null;
  const openMinutes = openSession?.checkin_at
    ? Math.max(0, Math.floor((nowMs - Date.parse(openSession.checkin_at)) / 60000))
    : 0;

  const delegatedAssigneeIds = Array.from(
    new Set(
      delegatedTasks
        .map((t) => t.assigned_to)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  );

  const { data: delegatedAssigneesRaw } =
    delegatedAssigneeIds.length === 0
      ? { data: [] }
      : await supabase.from("profiles").select("id,display_name").in("id", delegatedAssigneeIds);

  const delegatedAssignees = new Map(
    ((delegatedAssigneesRaw ?? []) as Array<{ id: string; display_name: string | null }>).map((p) => [
      p.id,
      p.display_name,
    ]),
  );

  return (
    <PageShell
      title="Dashboard"
      description="Hours, tasks, meetings, and shifts at a glance."
      containerClassName="max-w-6xl"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground/60">
                <IconClock className="h-4 w-4" />
                Deficit
              </div>
              <div
                className={`mt-2 text-2xl font-semibold ${
                  deficitMinutes > 0 ? "text-rose-600" : "text-emerald-600"
                }`}
              >
                {deficitMinutes > 0 ? formatHours(deficitMinutes) : "0h 0m"}
              </div>
              <div className="mt-1 text-xs text-foreground/60">
                {deficitMinutes > 0 ? "Below target" : "On track"}
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground/60">
                <IconChecklist className="h-4 w-4" />
                Tasks
              </div>
              <div className="mt-2 text-2xl font-semibold">{tasks.length}</div>
              <div className="mt-1 text-xs text-foreground/60">
                {taskOverdueCount} overdue, {taskDueSoonCount} due soon
              </div>
            </div>

            <div className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground/60">
                <IconCalendar className="h-4 w-4" />
                Meetings
              </div>
              <div className="mt-2 text-2xl font-semibold">{meetingsTodayCount}</div>
              <div className="mt-1 text-xs text-foreground/60">
                {meetingsWeekCount} in the next 7 days
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <IconClock className="h-4 w-4 text-foreground/70" />
                  Weekly hours
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[0.7rem] font-semibold ${
                    deficitMinutes > 0 ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {deficitMinutes > 0 ? `${formatHours(deficitMinutes)} deficit` : "On track"}
                </span>
              </div>
              <p className="mt-1 text-xs text-foreground/60">
                Totals include closed sessions + approved exceptions.
              </p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-foreground/70">Total</div>
                  <div className="font-semibold">{formatHours(totalMinutes)}</div>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-foreground/70">In office</div>
                  <div className="font-semibold">{formatHours(inOfficeMinutes)}</div>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <div className="text-foreground/70">Deficit (in office)</div>
                  <div
                    className={`font-medium ${
                      inOfficeDeficitMinutes > 0 ? "text-rose-600" : "text-foreground"
                    }`}
                  >
                    {formatHours(inOfficeDeficitMinutes)}
                  </div>
                </div>
                {openSession?.checkin_at ? (
                  <div className="rounded-md border border-foreground/10 bg-muted/40 px-3 py-2 text-xs text-foreground/70">
                    In progress: {formatHours(openMinutes)} since {formatInOfficeTz(openSession.checkin_at)}
                  </div>
                ) : null}
                {weekStartLabel ? (
                  <div className="pt-1 text-xs text-foreground/60">Week of {weekStartLabel}</div>
                ) : null}
              </div>
            </section>

            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <IconChecklist className="h-4 w-4 text-foreground/70" />
                  Tasks
                </div>
                <Link className="text-xs text-foreground/70 underline" href="/tasks">
                  Open tasks
                </Link>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-foreground/60">
                <span>{tasks.length} open</span>
                <span>{taskOverdueCount} overdue</span>
                <span>{taskDueSoonCount} due in 7 days</span>
              </div>
              {tasks.length === 0 ? (
                <div className="mt-3 rounded-md border border-dashed border-foreground/20 p-3 text-sm text-foreground/70">
                  <p>All caught up on assigned tasks.</p>
                  <Link className="mt-1 inline-flex text-xs text-foreground/70 underline" href="/tasks">
                    Create a task
                  </Link>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {tasks.map((t) => {
                    const overdue = isOverdue(t.due_at, nowMs);
                    const dueSoon = !overdue && isDueSoon(t.due_at, nowMs, 7);
                    const dueLabel = t.due_at ? `Due ${formatInOfficeTz(t.due_at)}` : "No due date";
                    const dueClass = overdue
                      ? "bg-rose-100 text-rose-700"
                      : dueSoon
                      ? "bg-amber-100 text-amber-700"
                      : "bg-muted/60 text-foreground/70";
                    return (
                      <div
                        key={t.id}
                        className="flex items-start justify-between gap-3 rounded-md border border-foreground/10 px-3 py-2 transition-colors hover:border-foreground/20 hover:bg-foreground/5"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{t.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border border-foreground/10 px-2 py-0.5 text-foreground/70">
                              {t.status.toUpperCase()}
                            </span>
                            <span className={`rounded-full px-2 py-0.5 ${dueClass}`}>{dueLabel}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {delegatedTasks.length > 0 ? (
                <div className="mt-5 border-t pt-4">
                  <div className="text-xs font-medium text-foreground/70">Delegated</div>
                  <div className="mt-2 space-y-2">
                    {delegatedTasks.map((t) => {
                      const assignee = t.assigned_to
                        ? (delegatedAssignees.get(t.assigned_to) ?? t.assigned_to)
                        : "Unassigned";
                      return (
                        <div
                          key={t.id}
                          className="flex items-start justify-between gap-3 rounded-md border border-foreground/10 px-3 py-2 transition-colors hover:border-foreground/20 hover:bg-foreground/5"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium">{t.title}</div>
                            <div className="mt-1 text-xs text-foreground/70">
                              {assignee}
                              {t.due_at ? ` • due ${formatInOfficeTz(t.due_at)}` : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <IconCalendar className="h-4 w-4 text-foreground/70" />
                  Meetings
                </div>
                <Link className="text-xs text-foreground/70 underline" href="/meetings">
                  Open meetings
                </Link>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-foreground/60">
                <span>{meetingsTodayCount} today</span>
                <span>{meetingsWeekCount} next 7 days</span>
              </div>
              {meetings.length === 0 ? (
                <div className="mt-3 rounded-md border border-dashed border-foreground/20 p-3 text-sm text-foreground/70">
                  <p>No upcoming meetings scheduled.</p>
                  <Link className="mt-1 inline-flex text-xs text-foreground/70 underline" href="/meetings">
                    Browse meetings
                  </Link>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {meetings.map((m) => (
                    <Link
                      key={m.id}
                      href={`/meetings/${m.id}`}
                      className="block rounded-md border border-foreground/10 px-3 py-2 transition-colors hover:border-foreground/20 hover:bg-foreground/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{m.title}</div>
                          <div className="mt-1 text-xs text-foreground/70">
                            {formatMeetingType(m.meeting_type)}
                            {m.location ? ` • ${m.location}` : ""}
                          </div>
                        </div>
                        <span className="rounded-full border border-foreground/10 px-2 py-0.5 text-[0.7rem] text-foreground/70">
                          {m.status}
                        </span>
                      </div>
                      <div className="mt-2 text-xs text-foreground/70">
                        {formatInOfficeTz(m.starts_at)} → {formatInOfficeTz(m.ends_at)}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-baseline justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <IconClock className="h-4 w-4 text-foreground/70" />
                  Upcoming shifts
                </div>
                <Link className="text-xs text-foreground/70 underline" href="/office-hours">
                  Office hours
                </Link>
              </div>
              <div className="mt-2 text-xs text-foreground/60">{shifts.length} scheduled</div>
              {shifts.length === 0 ? (
                <div className="mt-3 rounded-md border border-dashed border-foreground/20 p-3 text-sm text-foreground/70">
                  <p>No upcoming shifts scheduled.</p>
                  <Link className="mt-1 inline-flex text-xs text-foreground/70 underline" href="/office-hours">
                    Pick up a shift
                  </Link>
                </div>
              ) : (
                <div className="mt-3 space-y-2">
                  {shifts.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-md border border-foreground/10 px-3 py-2 transition-colors hover:border-foreground/20 hover:bg-foreground/5"
                    >
                      <div className="text-sm text-foreground/80">
                        {formatInOfficeTz(s.starts_at)} → {formatInOfficeTz(s.ends_at)}
                      </div>
                      <div className="mt-1 text-xs text-foreground/70">{s.status}</div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </section>
        </div>

        <aside className="order-first space-y-4 xl:order-last xl:sticky xl:top-20 xl:self-start">
          <section className="rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground/60">
              <IconZap className="h-4 w-4" />
              Quick actions
            </div>
            <div className="mt-3 grid gap-2 text-sm">
              <Link
                href="/office-hours"
                className="flex items-center justify-between rounded-md border border-transparent bg-muted/40 px-2 py-2 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/20 hover:bg-muted/60 hover:text-foreground"
              >
                Log hours
              </Link>
              <Link
                href="/tasks"
                className="flex items-center justify-between rounded-md border border-transparent bg-muted/40 px-2 py-2 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/20 hover:bg-muted/60 hover:text-foreground"
              >
                Create task
              </Link>
              <Link
                href="/meetings"
                className="flex items-center justify-between rounded-md border border-transparent bg-muted/40 px-2 py-2 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/20 hover:bg-muted/60 hover:text-foreground"
              >
                View meetings
              </Link>
              <Link
                href="/finance"
                className="flex items-center justify-between rounded-md border border-transparent bg-muted/40 px-2 py-2 text-sm font-medium text-foreground/80 transition-colors hover:border-foreground/20 hover:bg-muted/60 hover:text-foreground"
              >
                Open finance
              </Link>
            </div>
          </section>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground/60">
                <IconUsers className="h-4 w-4" />
                Community
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <Link
                  href="/clubs"
                  className="flex items-center justify-between rounded-md px-2 py-1 text-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  Clubs
                </Link>
                <Link
                  href="/icc"
                  className="flex items-center justify-between rounded-md px-2 py-1 text-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  ICC
                </Link>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wide text-foreground/60">
                <IconFolder className="h-4 w-4" />
                Resources
              </div>
              <div className="mt-2 space-y-1 text-sm">
                <Link
                  href="/docs"
                  className="flex items-center justify-between rounded-md px-2 py-1 text-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  Docs
                </Link>
                <Link
                  href="/finance"
                  className="flex items-center justify-between rounded-md px-2 py-1 text-foreground/70 transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  Finance
                </Link>
              </div>
            </section>
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
