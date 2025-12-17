import { NextResponse, type NextRequest } from "next/server";

import { sendEmail } from "@/lib/emailSender";
import { getCronEnv } from "@/lib/envServer";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type NotificationLogRow = {
  id: string;
  type: string;
  to_email: string;
  subject: string | null;
  metadata: unknown;
  attempt_count: number;
};

function getHeader(request: NextRequest, name: string): string | null {
  const v = request.headers.get(name);
  return typeof v === "string" && v.length > 0 ? v : null;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function renderEmailText(type: string, metadata: unknown, origin: string): { subject: string; text: string } {
  const m = (typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  const startsLocal = safeString(m.starts_at_local);
  const endsLocal = safeString(m.ends_at_local);
  const checkinLocal = safeString(m.checkin_at_local);
  const checkoutLocal = safeString(m.checkout_at_local);
  const tz = safeString(m.office_tz);

  const link = `${origin}/office-hours`;

  if (type === "office_hours.shift_start_soon") {
    return {
      subject: "Office hours shift starts soon",
      text: `Your office hours shift starts soon.\n\nStart: ${startsLocal}${tz ? ` (${tz})` : ""}\nEnd: ${endsLocal}${tz ? ` (${tz})` : ""}\n\nOpen Office Hours: ${link}\n`,
    };
  }

  if (type === "office_hours.shift_late") {
    return {
      subject: "You are late to your office hours shift",
      text: `You are late to your office hours shift.\n\nStart: ${startsLocal}${tz ? ` (${tz})` : ""}\nEnd: ${endsLocal}${tz ? ` (${tz})` : ""}\n\nOpen Office Hours: ${link}\n`,
    };
  }

  if (type === "office_hours.shift_missed") {
    return {
      subject: "You missed your office hours shift",
      text: `You missed your office hours shift.\n\nStart: ${startsLocal}${tz ? ` (${tz})` : ""}\nEnd: ${endsLocal}${tz ? ` (${tz})` : ""}\n\nOpen Office Hours: ${link}\n`,
    };
  }

  // Phase 19: auto-close notifications
  if (type === "office_hours.session_open_long") {
    return {
      subject: "Your office hours session is still open",
      text: `Reminder: Your office hours session has been open for a while.\n\nChecked in: ${checkinLocal}${tz ? ` (${tz})` : ""}\n\nIf you forgot to check out, please do so now.\n\nOpen Office Hours: ${link}\n`,
    };
  }

  if (type === "office_hours.session_auto_closed") {
    return {
      subject: "Your office hours session was auto-closed",
      text: `Your office hours session was automatically closed because it exceeded the maximum allowed duration.\n\nChecked in: ${checkinLocal}${tz ? ` (${tz})` : ""}\nAuto-closed at: ${checkoutLocal}${tz ? ` (${tz})` : ""}\n\nThis session has been flagged for review.\n\nOpen Office Hours: ${link}\n`,
    };
  }

  // Phase 20: coverage notifications
  if (type === "office_hours.coverage_requested") {
    return {
      subject: "Office hours coverage needed",
      text: `A colleague is requesting coverage for their shift.\n\nShift: ${startsLocal} – ${endsLocal}${tz ? ` (${tz})` : ""}\n\nIf you are available, you can claim this shift.\n\nOpen Office Hours: ${link}\n`,
    };
  }

  if (type === "office_hours.coverage_claimed") {
    return {
      subject: "Your shift coverage was claimed",
      text: `Good news! Someone has claimed your coverage request.\n\nShift: ${startsLocal} – ${endsLocal}${tz ? ` (${tz})` : ""}\n\nOpen Office Hours: ${link}\n`,
    };
  }

  return {
    subject: "Office hours notification",
    text: `You have a new office hours notification.\n\nOpen Office Hours: ${link}\n`,
  };
}

async function handle(request: NextRequest) {
  let env: ReturnType<typeof getCronEnv>;
  try {
    env = getCronEnv();
  } catch (e) {
    const message = e instanceof Error ? e.message : "missing cron env";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const provided = getHeader(request, "x-cron-secret");

  if (!provided || provided !== env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const supabase = getSupabaseAdminClient();

  // Phase 19: enqueue session-open reminders and auto-close long sessions
  const { data: sessionOpenReminders, error: sessionOpenErr } = await supabase.rpc(
    "enqueue_session_open_reminders"
  );
  if (sessionOpenErr) {
    return NextResponse.json({ error: sessionOpenErr.message }, { status: 500 });
  }

  const { data: autoClosed, error: autoCloseErr } = await supabase.rpc("auto_close_sessions");
  if (autoCloseErr) {
    return NextResponse.json({ error: autoCloseErr.message }, { status: 500 });
  }

  // Phase 18: shift reminders and missed shifts
  const { data: enqueueRes, error: enqueueErr } = await supabase.rpc("enqueue_shift_reminders");
  if (enqueueErr) {
    return NextResponse.json({ error: enqueueErr.message }, { status: 500 });
  }

  const { data: missedCount, error: missedErr } = await supabase.rpc("mark_missed_shifts");
  if (missedErr) {
    return NextResponse.json({ error: missedErr.message }, { status: 500 });
  }

  const lockId = `cron:${crypto.randomUUID()}`;

  // Claim all office_hours.* notifications (shifts, sessions, coverage)
  const { data: claimed, error: claimErr } = await supabase.rpc("claim_notification_log", {
    _limit: 50,
    _lock_id: lockId,
    _type_prefix: "office_hours.",
  });

  if (claimErr) {
    return NextResponse.json({ error: claimErr.message }, { status: 500 });
  }

  const rows = (claimed ?? []) as NotificationLogRow[];

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    const { subject, text } = renderEmailText(row.type, row.metadata, origin);
    const resolvedSubject = row.subject && row.subject.length > 0 ? row.subject : subject;

    try {
      const result = await sendEmail({
        to: row.to_email,
        subject: resolvedSubject,
        text,
      });

      sent += 1;

      await supabase
        .from("notification_log")
        .update({
          status: "sent",
          provider_message_id: result.providerMessageId,
          error_message: null,
          locked_at: null,
          locked_by: null,
        })
        .eq("id", row.id);
    } catch (e) {
      failed += 1;

      const nextAttempt = (row.attempt_count ?? 0) + 1;
      const errorMessage = e instanceof Error ? e.message : "send_failed";
      const shouldFail = nextAttempt >= 5;

      const retryDelayMinutes = Math.min(60, Math.max(5, 2 ** Math.min(nextAttempt, 5)));
      const sendAfter = new Date(Date.now() + retryDelayMinutes * 60_000).toISOString();

      await supabase
        .from("notification_log")
        .update({
          status: shouldFail ? "failed" : "queued",
          attempt_count: nextAttempt,
          error_message: errorMessage,
          send_after: sendAfter,
          locked_at: null,
          locked_by: null,
        })
        .eq("id", row.id);
    }
  }

  return NextResponse.json({
    ok: true,
    session_open_reminders: sessionOpenReminders ?? 0,
    auto_closed: autoClosed ?? 0,
    enqueue: enqueueRes ?? null,
    missed_marked: missedCount ?? 0,
    claimed: rows.length,
    sent,
    failed,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
