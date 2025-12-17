import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";
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

function formatHours(minutes: number) {
  const safe = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m}m`;
}

export default async function DashboardPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: weeklyRows } = await supabase.rpc("my_weekly_hours");
  const weekly = (weeklyRows?.[0] as WeeklyHoursRow | undefined) ?? null;

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
          <h2 className="text-sm font-semibold">My tasks</h2>
          <p className="mt-1 text-sm text-foreground/70">Coming in Phase 7 (Tasks v1).</p>
        </section>

        <section className="rounded-md border p-4">
          <h2 className="text-sm font-semibold">My upcoming shifts</h2>
          <p className="mt-1 text-sm text-foreground/70">Coming in Phase 17 (Shift scheduling v1).</p>
        </section>

        <section className="rounded-md border p-4">
          <h2 className="text-sm font-semibold">Finance</h2>
          <p className="mt-1 text-sm text-foreground/70">Placeholder widget (later phase).</p>
        </section>

        <section className="rounded-md border p-4">
          <h2 className="text-sm font-semibold">Meetings</h2>
          <p className="mt-1 text-sm text-foreground/70">Placeholder widget (later phase).</p>
        </section>
      </div>
    </PageShell>
  );
}
