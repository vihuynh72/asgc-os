import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

export const runtime = "nodejs";

async function getSupabaseForRequest(request: NextRequest) {
  const env = getPublicEnv();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op for JSON APIs.
      },
    },
  });
}

function escapeCsv(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes("\"") || str.includes("\n")) {
    return `"${str.replace(/\"/g, "\"\"")}"`;
  }
  return str;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ meetingId: string }> }) {
  const supabase = await getSupabaseForRequest(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { meetingId } = await params;

  const { data: meeting, error: meetingErr } = await supabase
    .from("icc_meetings")
    .select("id,starts_at,location")
    .eq("id", meetingId)
    .single();

  if (meetingErr) {
    return NextResponse.json({ error: meetingErr.message }, { status: 500 });
  }

  const [attendanceRes, clubsRes] = await Promise.all([
    supabase
      .from("icc_attendance")
      .select("club_id,status,present_at_call_to_order,excused_reason,notes")
      .eq("icc_meeting_id", meetingId),
    supabase
      .from("clubs")
      .select("id,name,status")
      .order("name", { ascending: true }),
  ]);

  if (attendanceRes.error) {
    return NextResponse.json({ error: attendanceRes.error.message }, { status: 500 });
  }
  if (clubsRes.error) {
    return NextResponse.json({ error: clubsRes.error.message }, { status: 500 });
  }

  const attendanceByClubId = new Map<string, (typeof attendanceRes.data)[number]>();
  for (const row of attendanceRes.data ?? []) {
    attendanceByClubId.set(row.club_id, row);
  }

  const rows = [
    [
      "club_name",
      "status",
      "present_at_call_to_order",
      "excused_reason",
      "notes",
    ],
  ];

  for (const club of clubsRes.data ?? []) {
    const attendance = attendanceByClubId.get(club.id);
    rows.push([
      escapeCsv(club.name ?? ""),
      escapeCsv(attendance?.status ?? "absent"),
      escapeCsv(attendance?.present_at_call_to_order ? "yes" : "no"),
      escapeCsv(attendance?.excused_reason ?? ""),
      escapeCsv(attendance?.notes ?? ""),
    ]);
  }

  const csv = rows.map((r) => r.join(",")).join("\n");
  const filename = `icc-attendance-${meeting.starts_at?.slice(0, 10) ?? meetingId}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
    },
  });
}
