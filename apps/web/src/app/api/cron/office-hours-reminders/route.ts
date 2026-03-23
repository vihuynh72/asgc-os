import { NextResponse, type NextRequest } from "next/server";

import { sendEmail } from "@/lib/emailSender";
import { isAuthorizedCronRequest } from "@/lib/cron-auth.mjs";
import { getCronEnv, getSmsEnv } from "@/lib/envServer";
import { buildKioskCheckoutReminderSmsText } from "@/lib/office-hours-kiosk-messages.mjs";
import { buildOfficeHoursNotificationEmail } from "@/lib/office-hours-notification-email.mjs";
import { isOfficeHoursKioskSchemaError } from "@/lib/office-hours-kiosk-setup.mjs";
import { sendSms } from "@/lib/smsSender.mjs";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type NotificationLogRow = {
  id: string;
  type: string;
  channel: string | null;
  to_email: string | null;
  to_phone: string | null;
  subject: string | null;
  metadata: unknown;
  attempt_count: number;
};

const KIOSK_PHOTO_BUCKET = "office-hours-kiosk";
const KIOSK_PHOTO_RETENTION_DAYS = 30;

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function safeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatMinutes(totalMinutes: number | null): string {
  if (totalMinutes === null) return "n/a";
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${minutesPart}m`;
}

async function cleanupKioskCheckinPhotos(supabase: ReturnType<typeof getSupabaseAdminClient>) {
  const cutoff = new Date(Date.now() - KIOSK_PHOTO_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await supabase
    .from("office_hour_sessions")
    .select("id,checkin_at,kiosk_checkin_photo_bucket,kiosk_checkin_photo_path,kiosk_checkin_photo_deleted_at")
    .not("kiosk_checkin_photo_path", "is", null)
    .is("kiosk_checkin_photo_deleted_at", null)
    .lt("checkin_at", cutoff)
    .limit(100);

  if (error) {
    return { attempted: 0, deleted: 0, error: error.message || "query_failed" };
  }

  const candidates = (rows ?? [])
    .map((r) => r as Record<string, unknown>)
    .map((r) => ({
      id: typeof r.id === "string" ? r.id : "",
      bucket: typeof r.kiosk_checkin_photo_bucket === "string" ? r.kiosk_checkin_photo_bucket : "",
      path: typeof r.kiosk_checkin_photo_path === "string" ? r.kiosk_checkin_photo_path : "",
    }))
    .filter((r) => r.id && r.path && (r.bucket === "" || r.bucket === KIOSK_PHOTO_BUCKET));

  if (candidates.length === 0) {
    return { attempted: 0, deleted: 0, error: null };
  }

  const paths = candidates.map((c) => c.path);
  const { data: removed, error: removeErr } = await supabase.storage.from(KIOSK_PHOTO_BUCKET).remove(paths);
  if (removeErr) {
    return { attempted: candidates.length, deleted: 0, error: removeErr.message || "delete_failed" };
  }

  const removedNames = new Set((removed ?? []).map((r) => (r as { name?: unknown }).name).filter((n): n is string => typeof n === "string"));
  const deletedIds = candidates.filter((c) => removedNames.has(c.path)).map((c) => c.id);

  if (deletedIds.length > 0) {
    await supabase
      .from("office_hour_sessions")
      .update({
        kiosk_checkin_photo_deleted_at: new Date().toISOString(),
        kiosk_checkin_photo_bucket: null,
        kiosk_checkin_photo_path: null,
        kiosk_checkin_photo_mime: null,
      })
      .in("id", deletedIds);
  }

  return { attempted: candidates.length, deleted: deletedIds.length, error: null };
}

function renderEmail(type: string, metadata: unknown, origin: string): { subject: string; text: string; html?: string } {
  return buildOfficeHoursNotificationEmail({ type, metadata, origin });
}

function renderSmsText(type: string, metadata: unknown): string {
  const m = (typeof metadata === "object" && metadata !== null ? (metadata as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;

  if (type === "office_hours.kiosk_checkout_reminder") {
    return buildKioskCheckoutReminderSmsText({
      elapsedMinutes: safeNumber(m.elapsed_minutes) ?? 0,
    });
  }

  throw new Error(`Unsupported SMS notification type: ${type}`);
}

async function handle(request: NextRequest) {
  let env: ReturnType<typeof getCronEnv>;
  try {
    env = getCronEnv();
  } catch (e) {
    const message = e instanceof Error ? e.message : "missing cron env";
    return NextResponse.json(
      {
        error: message,
        debug: {
          vercel_env: process.env.VERCEL_ENV ?? null,
          vercel_url: process.env.VERCEL_URL ?? null,
          vercel_git_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
          vercel_git_ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
        },
      },
      { status: 500 },
    );
  }
  const debug = {
    vercel_env: process.env.VERCEL_ENV ?? null,
    vercel_url: process.env.VERCEL_URL ?? null,
    vercel_git_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    vercel_git_ref: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    has_authorization_header: request.headers.has("authorization"),
    has_legacy_cron_header: request.headers.has("x-cron-secret"),
  };
  if (!isAuthorizedCronRequest(request.headers, { cronSecret: env.CRON_SECRET })) {
    return NextResponse.json({ error: "unauthorized", debug }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const supabase = getSupabaseAdminClient();

  const kioskPhotoCleanup = await cleanupKioskCheckinPhotos(supabase);

  const presenceTimeoutMinutes = 15;
  const nowMs = Date.now();
  const staleBeforeMs = nowMs - presenceTimeoutMinutes * 60_000;
  const { data: officeConfigForDebug } = await supabase
    .from("office_config")
    .select("primary_office_location_id")
    .eq("id", true)
    .maybeSingle();
  const primaryOfficeLocationId =
    (officeConfigForDebug as { primary_office_location_id?: unknown } | null)?.primary_office_location_id ?? null;

  const { data: officeLocationForDebug } = primaryOfficeLocationId
    ? await supabase
        .from("office_locations")
        .select("timezone")
        .eq("id", String(primaryOfficeLocationId))
        .maybeSingle()
    : { data: null };

  const officeTzRaw = (officeLocationForDebug as { timezone?: unknown } | null)?.timezone;
  const officeTz = typeof officeTzRaw === "string" && officeTzRaw.trim() ? officeTzRaw : "America/Los_Angeles";

  const isAfter5pmLocal = (() => {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: officeTz,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).formatToParts(new Date(nowMs));

      const hourRaw = parts.find((p) => p.type === "hour")?.value ?? "";
      const minuteRaw = parts.find((p) => p.type === "minute")?.value ?? "";
      const hour = Number(hourRaw);
      const minute = Number(minuteRaw);
      if (!Number.isFinite(hour) || !Number.isFinite(minute)) return false;
      return hour > 17 || (hour === 17 && minute >= 0);
    } catch {
      return false;
    }
  })();
  const { data: openSessionsForDebug } = await supabase
    .from("office_hour_sessions")
    .select("checkin_at,last_presence_at,requires_presence")
    .eq("status", "open")
    .is("checkout_at", null)
    .order("checkin_at", { ascending: false })
    .limit(10);
  const presenceDebug = (() => {
    const sessions = (openSessionsForDebug ?? []).map((row) => {
      const checkinAt = safeString((row as Record<string, unknown>).checkin_at);
      const lastPresenceAt = safeString((row as Record<string, unknown>).last_presence_at);
      const requiresPresence = (row as Record<string, unknown>).requires_presence !== false;
      const lastSeenMs = Date.parse(lastPresenceAt || checkinAt);
      const isStale =
        requiresPresence && isAfter5pmLocal && Number.isFinite(lastSeenMs) && lastSeenMs <= staleBeforeMs;
      return {
        checkin_at: checkinAt || null,
        last_presence_at: lastPresenceAt || null,
        requires_presence: requiresPresence,
        stale: isStale,
      };
    });
    return {
      office_tz: officeTz,
      after_5pm_local: isAfter5pmLocal,
      timeout_minutes: presenceTimeoutMinutes,
      open_sessions_sample: sessions,
      open_sessions_total_in_sample: sessions.length,
      open_sessions_stale_in_sample: sessions.filter((s) => s.stale).length,
      open_sessions_without_presence_in_sample: sessions.filter((s) => !s.requires_presence).length,
    };
  })();

  // Strict presence: auto-checkout sessions with stale presence.
  const { data: autoCheckedOutStale, error: staleErr } = await supabase.rpc("auto_checkout_stale_presence");
  if (staleErr) {
    return NextResponse.json({ error: staleErr.message }, { status: 500 });
  }

  // Phase 19: enqueue session-open reminders and auto-close long sessions
  const { data: sessionCheckoutEmailReminders, error: sessionCheckoutEmailErr } = await supabase.rpc(
    "enqueue_session_checkout_email_reminders"
  );
  if (sessionCheckoutEmailErr) {
    return NextResponse.json({ error: sessionCheckoutEmailErr.message }, { status: 500 });
  }

  const { data: sessionAutoCloseSoonReminders, error: sessionAutoCloseSoonErr } = await supabase.rpc(
    "enqueue_session_auto_close_soon_reminders"
  );
  if (sessionAutoCloseSoonErr) {
    return NextResponse.json({ error: sessionAutoCloseSoonErr.message }, { status: 500 });
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

  const { data: weeklyReminders, error: weeklyErr } = await supabase.rpc("enqueue_weekly_hours_reminders");
  if (weeklyErr) {
    return NextResponse.json({ error: weeklyErr.message }, { status: 500 });
  }

  let kioskCheckoutSmsReminders = 0;
  const { data: kioskCheckoutSmsRemindersRaw, error: kioskCheckoutSmsErr } = await supabase.rpc(
    "enqueue_kiosk_checkout_sms_reminders"
  );
  if (kioskCheckoutSmsErr && !isOfficeHoursKioskSchemaError(kioskCheckoutSmsErr)) {
    return NextResponse.json({ error: kioskCheckoutSmsErr.message }, { status: 500 });
  }
  kioskCheckoutSmsReminders = Number(kioskCheckoutSmsRemindersRaw ?? 0) || 0;

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
  let smsEnv: ReturnType<typeof getSmsEnv> | null | undefined;

  let sent = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      let result: { providerMessageId: string | null | undefined };

      if (row.channel === "sms") {
        const text = renderSmsText(row.type, row.metadata);
        if (!smsEnv) smsEnv = getSmsEnv();
        if (!row.to_phone) throw new Error("Missing SMS recipient");
        result = await sendSms({
          to: row.to_phone,
          body: text,
          env: smsEnv,
        });
      } else {
        const { subject, text, html } = renderEmail(row.type, row.metadata, origin);
        const resolvedSubject = row.subject && row.subject.length > 0 ? row.subject : subject;
        if (!row.to_email) throw new Error("Missing email recipient");
        result = await sendEmail({
          to: row.to_email,
          subject: resolvedSubject,
          text,
          html,
        });
      }

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
    auto_checked_out_stale: autoCheckedOutStale ?? 0,
    kiosk_photo_cleanup: kioskPhotoCleanup,
    presence_debug: presenceDebug,
    session_checkout_email_reminders: sessionCheckoutEmailReminders ?? 0,
    session_auto_close_soon_reminders: sessionAutoCloseSoonReminders ?? 0,
    auto_closed: autoClosed ?? 0,
    enqueue: enqueueRes ?? null,
    missed_marked: missedCount ?? 0,
    weekly_reminders: weeklyReminders ?? null,
    claimed: rows.length,
    sent,
    failed,
    kiosk_checkout_sms_reminders: kioskCheckoutSmsReminders,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
