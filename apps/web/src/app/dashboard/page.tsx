import type { CSSProperties } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { ButtonLink } from "@/components/ui/button-link";
import { IconCalendar, IconCheck, IconClock, IconFileText } from "@/components/ui/icons";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

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

function formatDateLabel(iso: string, options?: Intl.DateTimeFormatOptions): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso;
  const d = new Date(normalized);
  if (!Number.isFinite(d.getTime())) return iso;
  return new Intl.DateTimeFormat(undefined, options ?? { month: "short", day: "numeric", year: "numeric" }).format(d);
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
      .limit(1),
    supabase
      .from("office_hour_shifts")
      .select("id,starts_at,ends_at,status")
      .eq("user_id", user.id)
      .eq("status", "scheduled")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(1),
    supabase.rpc("my_upcoming_meetings", { _limit: 1 }),
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
  const shifts = (shiftsRaw ?? []) as ShiftRow[];
  const meetings = (meetingsRaw ?? []) as MeetingRow[];

  const totalMinutes = weekly?.total_minutes ?? 0;
  const inOfficeMinutes = weekly?.in_office_minutes ?? 0;
  const deficitMinutes = weekly?.deficit_minutes ?? 0;

  const targetMinutes = Math.max(totalMinutes + deficitMinutes, totalMinutes, 0);
  const totalProgress = targetMinutes > 0 ? Math.min(Math.max(totalMinutes / targetMinutes, 0), 1) : 0;

  const weekStartLabel = weekly?.week_start ? formatDateLabel(weekly.week_start) : null;

  const openSession = (openSessionRaw as { checkin_at?: string } | null) ?? null;
  const openMinutes = openSession?.checkin_at
    ? Math.max(0, Math.floor((nowMs - Date.parse(openSession.checkin_at)) / 60000))
    : 0;

  const nextTask = tasks[0] ?? null;
  const nextMeeting = meetings[0] ?? null;
  const nextShift = shifts[0] ?? null;

  const dashStyle = (value: number): CSSProperties => ({ "--dash-delay": value } as CSSProperties);
  const surfaceClassName =
    "rounded-3xl bg-card p-6 shadow-sm ring-1 ring-border/70 sm:p-7";
  const sectionTitleClassName = "text-sm font-semibold text-foreground";
  const sectionMetaClassName = "text-sm text-foreground/70";
  const listClassName = "mt-4 divide-y divide-border/60 overflow-hidden rounded-2xl bg-muted/50 ring-1 ring-border/60";
  const listRowClassName =
    "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-background/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  const rowIconWrapClassName =
    "mt-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border/40 text-primary";
  const rowTitleClassName = "text-sm font-medium text-foreground";
  const rowBodyClassName = "mt-1 text-sm text-foreground/70";
  const dockClassName = "rounded-3xl bg-card p-3 shadow-sm ring-1 ring-border/70";
  const dockItemClassName =
    "flex items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
  const dockIconWrapClassName =
    "flex h-10 w-10 items-center justify-center rounded-xl bg-background shadow-sm ring-1 ring-border/40 text-primary";

  const hoursStatusLabel =
    deficitMinutes > 0 ? `${formatHours(deficitMinutes)} behind target` : totalMinutes > 0 ? "On track" : "No hours yet";

  return (
    <PageShell
      title="Dashboard"
      showHeader={false}
      containerClassName="max-w-6xl"
    >
      <div className="relative">
        <div className="pointer-events-none absolute inset-x-0 -top-10 -z-10 h-56 rounded-[28px] bg-gradient-to-br from-primary/10 via-transparent to-transparent" />

        <div className="space-y-6">
          <section className={`dash-fade-up ${surfaceClassName}`} style={dashStyle(1)}>
            <div className="grid gap-8 lg:grid-cols-2">
              <section>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <IconClock className="text-muted-foreground" />
                    <span className={sectionTitleClassName}>This week</span>
                  </div>
                  {weekStartLabel ? <span className="text-xs text-foreground/60">Week of {weekStartLabel}</span> : null}
                </div>

                <div className="mt-5">
                  <div className="text-4xl font-semibold tracking-tight">{formatHours(totalMinutes)}</div>
                  <div className="mt-1 text-sm text-foreground/70">{hoursStatusLabel}</div>
                </div>

                <div className="mt-5 space-y-2">
                  <div className="flex items-center justify-between gap-3 text-xs text-foreground/60">
                    <span>Progress</span>
                    <span>
                      {Math.round(totalProgress * 100)}% • Target {formatHours(targetMinutes)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.round(totalProgress * 100)}%` }} />
                  </div>
                  <div className="text-xs text-foreground/60">In office: {formatHours(inOfficeMinutes)}</div>
                </div>

                {openSession?.checkin_at ? (
                  <div className="mt-5 rounded-xl bg-muted/40 px-4 py-3 text-sm text-foreground/70">
                    In progress: <span className="font-medium text-foreground">{formatHours(openMinutes)}</span> since{" "}
                    {formatInOfficeTz(openSession.checkin_at)}
                  </div>
                ) : null}

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <ButtonLink href="/office-hours">Log hours</ButtonLink>
                  <ButtonLink href="/office-hours" variant="ghost">
                    Open office hours
                  </ButtonLink>
                </div>
              </section>

              <section>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <IconCalendar className="text-muted-foreground" />
                    <span className={sectionTitleClassName}>Up next</span>
                  </div>
                  <span className="text-xs text-foreground/60">{nextMeeting ? "Next meeting scheduled" : "Nothing scheduled"}</span>
                </div>

                <div className={listClassName}>
                  <Link
                    href={nextMeeting ? `/meetings/${nextMeeting.id}` : "/meetings"}
                    className={listRowClassName}
                  >
                    <span className={rowIconWrapClassName}>
                      <IconCalendar />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={rowTitleClassName}>Meeting</div>
                      <div className={`${rowBodyClassName} truncate`} title={nextMeeting?.title ?? undefined}>
                        {nextMeeting ? nextMeeting.title : "No upcoming meetings"}
                      </div>
                      {nextMeeting ? (
                        <div className="mt-1 text-xs text-foreground/60">
                          {formatInOfficeTz(nextMeeting.starts_at)}
                          {nextMeeting.location ? ` • ${nextMeeting.location}` : ""}
                        </div>
                      ) : null}
                    </div>
                  </Link>

                  <Link href="/tasks" className={listRowClassName}>
                    <span className={rowIconWrapClassName}>
                      <IconCheck />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={rowTitleClassName}>Task</div>
                      <div className={`${rowBodyClassName} truncate`} title={nextTask?.title ?? undefined}>
                        {nextTask ? nextTask.title : "No open tasks"}
                      </div>
                      {nextTask?.due_at ? (
                        <div className="mt-1 text-xs text-foreground/60">Due {formatInOfficeTz(nextTask.due_at)}</div>
                      ) : null}
                    </div>
                  </Link>

                  <Link href="/office-hours" className={listRowClassName}>
                    <span className={rowIconWrapClassName}>
                      <IconClock />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={rowTitleClassName}>Shift</div>
                      <div className={`${rowBodyClassName} truncate`}>
                        {nextShift
                          ? `${formatInOfficeTz(nextShift.starts_at)} → ${formatInOfficeTz(nextShift.ends_at)}`
                          : "No upcoming shifts"}
                      </div>
                      {nextShift ? <div className="mt-1 text-xs text-foreground/60">{nextShift.status}</div> : null}
                    </div>
                  </Link>
                </div>
              </section>
            </div>
          </section>

          <section className={`dash-fade-up ${dockClassName}`} style={dashStyle(2)}>
            <h2 className="sr-only">Shortcuts</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Link href="/office-hours" className={dockItemClassName}>
                <span className={dockIconWrapClassName}>
                  <IconClock />
                </span>
                <div className="min-w-0">
                  <div className={sectionTitleClassName}>Office hours</div>
                  <div className={sectionMetaClassName}>Log hours & shifts</div>
                </div>
              </Link>

              <Link href="/tasks" className={dockItemClassName}>
                <span className={dockIconWrapClassName}>
                  <IconCheck />
                </span>
                <div className="min-w-0">
                  <div className={sectionTitleClassName}>Tasks</div>
                  <div className={sectionMetaClassName}>Create & track</div>
                </div>
              </Link>

              <Link href="/meetings" className={dockItemClassName}>
                <span className={dockIconWrapClassName}>
                  <IconCalendar />
                </span>
                <div className="min-w-0">
                  <div className={sectionTitleClassName}>Meetings</div>
                  <div className={sectionMetaClassName}>View schedule</div>
                </div>
              </Link>

              <Link href="/finance" className={dockItemClassName}>
                <span className={dockIconWrapClassName}>
                  <IconFileText />
                </span>
                <div className="min-w-0">
                  <div className={sectionTitleClassName}>Finance</div>
                  <div className={sectionMetaClassName}>Requests & docs</div>
                </div>
              </Link>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 px-2 text-sm text-foreground/70">
              <Link href="/clubs" className="hover:text-foreground">
                Clubs
              </Link>
              <Link href="/icc" className="hover:text-foreground">
                ICC
              </Link>
              <Link href="/docs" className="hover:text-foreground">
                Docs
              </Link>
            </div>
          </section>
        </div>
      </div>
    </PageShell>
  );
}
