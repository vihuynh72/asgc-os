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

export default async function DashboardPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const nowIso = new Date().toISOString();

  const [
    { data: weeklyRows },
    { data: tzData },
    { data: tasksRaw },
    { data: shiftsRaw },
    { data: meetingsRaw },
  ] = await Promise.all([
    supabase.rpc("my_weekly_hours"),
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
      .from("office_hour_shifts")
      .select("id,starts_at,ends_at,status")
      .eq("user_id", user.id)
      .eq("status", "scheduled")
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(6),
    supabase.rpc("my_upcoming_meetings", { _limit: 4 }),
  ]);

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

  return (
    <PageShell title="Dashboard" description="My tasks, my hours this week, and upcoming shifts.">
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-md border p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">My hours this week</h2>
            <p className="text-xs text-foreground/70">
              Totals include closed sessions + approved exceptions.
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm text-foreground/70">Total</div>
              <div className="text-lg font-semibold">
                {formatHours(weekly?.total_minutes ?? 0)}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm text-foreground/70">In-office</div>
              <div className="text-lg font-semibold">
                {formatHours(weekly?.in_office_minutes ?? 0)}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm text-foreground/70">Deficit (total)</div>
              <div className="text-sm font-medium">
                {formatHours(weekly?.deficit_minutes ?? 0)}
              </div>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm text-foreground/70">Deficit (in-office)</div>
              <div className="text-sm font-medium">
                {formatHours(weekly?.deficit_in_office_minutes ?? 0)}
              </div>
            </div>
            {weekly?.week_start ? (
              <div className="pt-2 text-xs text-foreground/60">Week of {weekly.week_start}</div>
            ) : null}
          </div>
        </section>

        <section className="rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">My tasks</h2>
            <Link className="text-xs text-foreground/70 underline" href="/tasks">
              View all
            </Link>
          </div>
          {tasks.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/70">No assigned tasks right now.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {tasks.map((t) => (
                <div key={t.id} className="flex items-start justify-between gap-3 rounded-md border border-foreground/10 px-3 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="mt-1 text-xs text-foreground/70">
                      {t.status.toUpperCase()}
                      {t.due_at ? ` • due ${formatInOfficeTz(t.due_at)}` : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">My upcoming shifts</h2>
            <Link className="text-xs text-foreground/70 underline" href="/office-hours">
              Office hours
            </Link>
          </div>
          {shifts.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/70">No upcoming shifts scheduled.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {shifts.map((s) => (
                <div key={s.id} className="rounded-md border border-foreground/10 px-3 py-2">
                  <div className="text-sm text-foreground/80">
                    {formatInOfficeTz(s.starts_at)} → {formatInOfficeTz(s.ends_at)}
                  </div>
                  <div className="mt-1 text-xs text-foreground/70">{s.status}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-md border p-4">
          <h2 className="text-sm font-semibold">Finance</h2>
          <p className="mt-1 text-sm text-foreground/70">Placeholder widget (later phase).</p>
        </section>

        <section className="rounded-md border p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold">Meetings</h2>
            <Link className="text-xs text-foreground/70 underline" href="/meetings">
              View all
            </Link>
          </div>
          {meetings.length === 0 ? (
            <p className="mt-2 text-sm text-foreground/70">No upcoming meetings.</p>
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
                    <div className="text-xs text-foreground/70">{m.status}</div>
                  </div>
                  <div className="mt-2 text-xs text-foreground/70">
                    {formatInOfficeTz(m.starts_at)} → {formatInOfficeTz(m.ends_at)}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </PageShell>
  );
}
