import { NextResponse } from "next/server";

import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Meeting = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  description: string | null;
  remote_url: string | null;
  livestream_url: string | null;
};

function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function formatIcsDate(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
}

function buildMeetingLines(meeting: Meeting): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${meeting.id}@asgc.app`,
    `DTSTAMP:${formatIcsDate(new Date().toISOString())}`,
    `DTSTART:${formatIcsDate(meeting.starts_at)}`,
    `DTEND:${formatIcsDate(meeting.ends_at)}`,
    `SUMMARY:${escapeIcsText(meeting.title)}`,
  ];

  if (meeting.location) {
    lines.push(`LOCATION:${escapeIcsText(meeting.location)}`);
  }

  const descriptionParts: string[] = [];
  if (meeting.description) descriptionParts.push(meeting.description);
  if (meeting.remote_url) descriptionParts.push(`Remote: ${meeting.remote_url}`);
  if (meeting.livestream_url) descriptionParts.push(`Livestream: ${meeting.livestream_url}`);
  if (descriptionParts.length > 0) {
    lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join("\n"))}`);
  }

  lines.push("END:VEVENT");
  return lines;
}

export async function GET() {
  const supabase = await getSupabaseRouteHandlerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("my_upcoming_meetings", { _limit: 200 });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const meetings = (data ?? []) as Meeting[];
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ASGC//Meetings//EN", "CALSCALE:GREGORIAN"];
  for (const meeting of meetings) {
    lines.push(...buildMeetingLines(meeting));
  }
  lines.push("END:VCALENDAR");

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
