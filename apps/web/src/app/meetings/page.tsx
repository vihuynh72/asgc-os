"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { PageShell } from "@/components/page-shell";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

type Meeting = {
  id: string;
  committee_id: string | null;
  meeting_type: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

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

export default function MeetingsPage() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [officeTz, setOfficeTz] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const formatInOfficeTz = useCallback(
    (iso: string) => {
      const d = new Date(iso);
      if (!officeTz) return d.toLocaleString();

      return new Intl.DateTimeFormat(undefined, {
        timeZone: officeTz,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(d);
    },
    [officeTz],
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      const { data: tzData, error: tzErr } = await supabase.rpc("office_timezone");
      if (!cancelled && !tzErr && typeof tzData === "string" && tzData.length > 0) {
        setOfficeTz(tzData);
      }

      const res = await fetch(showPast ? "/api/meetings?includePast=1" : "/api/meetings");
      if (cancelled) return;

      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(json?.error ?? "Failed to load meetings");
        setLoading(false);
        return;
      }

      const json = (await res.json().catch(() => null)) as { meetings?: Meeting[] } | null;
      setMeetings((json?.meetings ?? []) as Meeting[]);
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [showPast, supabase]);

  return (
    <PageShell title="Meetings" description="View your upcoming meetings.">
      <div className="space-y-4">
        {error ? (
          <div className="text-sm text-red-600" role="alert">
            {error}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm text-foreground/70">
            <input
              type="checkbox"
              checked={showPast}
              onChange={(event) => setShowPast(event.target.checked)}
            />
            Show past meetings
          </label>
        </div>

        {loading ? (
          <div className="text-sm text-foreground/70">Loading…</div>
        ) : meetings.length === 0 ? (
          <div className="text-sm text-foreground/70">
            {showPast ? "No meetings found." : "No upcoming meetings."}
          </div>
        ) : (
          <div className="space-y-3">
            {meetings.map((m) => (
              <Link
                key={m.id}
                href={`/meetings/${m.id}`}
                className="block rounded-lg border border-foreground/10 p-4 transition-colors hover:border-foreground/20 hover:bg-foreground/5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{m.title}</div>
                    <div className="mt-1 text-sm text-foreground/80">
                      {formatMeetingType(m.meeting_type)}
                      {m.location ? ` • ${m.location}` : ""}
                    </div>
                  </div>
                  <div className="text-xs text-foreground/70">{m.status}</div>
                </div>
                <div className="mt-2 text-sm text-foreground/80">
                  {formatInOfficeTz(m.starts_at)} → {formatInOfficeTz(m.ends_at)}
                </div>
                {m.description ? (
                  <div className="mt-2 text-sm text-foreground/70">{m.description}</div>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
