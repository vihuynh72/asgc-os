import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { closeOfficeHoursAdminSession } from "@/lib/office-hours-admin-close";
import { OfficeHoursLabRequestSchema, type OfficeHoursLabParsedRequest } from "@/lib/office-hours-lab-schema";
import type { OfficeHoursLabCleanup, OfficeHoursLabResult } from "@/lib/office-hours-lab";
import {
  runOfficeHoursLabAdminCloseLiveProbe,
  runOfficeHoursLabKioskCheckInLiveProbe,
  runOfficeHoursLabShiftCreationLiveProbe,
} from "@/lib/office-hours-lab-server";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

import { getOpenKioskSession } from "@/app/api/office-hours/kiosk/_kiosk";
import { performKioskCheckIn } from "@/lib/office-hours-kiosk-check-in";

export const runtime = "nodejs";

function cleanupState(ok: boolean, message: string | null): OfficeHoursLabCleanup {
  return {
    attempted: true,
    ok,
    message,
  };
}

function buildLiveResult({
  kind,
  verdict,
  resultCode = null,
  errorCode = null,
  headline,
  trace,
  evidence,
  cleanup = { attempted: false, ok: true, message: null },
}: {
  kind: OfficeHoursLabResult["kind"];
  verdict: OfficeHoursLabResult["verdict"];
  resultCode?: string | null;
  errorCode?: string | null;
  headline: string;
  trace: OfficeHoursLabResult["trace"];
  evidence: OfficeHoursLabResult["evidence"];
  cleanup?: OfficeHoursLabCleanup;
}): OfficeHoursLabResult {
  return {
    kind,
    mode: "live",
    verdict,
    resultCode,
    errorCode,
    headline,
    trace,
    evidence,
    cleanup,
  };
}

function requireUserId(request: OfficeHoursLabParsedRequest): string {
  const userId = request.userId ?? request.shift?.userId ?? null;
  if (!userId) {
    throw new Error("user_id_required");
  }
  return userId;
}

async function cleanupAuditLog(admin: ReturnType<typeof getSupabaseAdminClient>, targetId: string | null, targetType: string) {
  if (!targetId) return;
  await admin.from("audit_log").delete().eq("target_id", targetId).eq("target_type", targetType);
}

async function cleanupMemberCheckInLive(admin: ReturnType<typeof getSupabaseAdminClient>, request: OfficeHoursLabParsedRequest) {
  const userId = requireUserId(request);
  if (!Number.isFinite(request.lat) || !Number.isFinite(request.lon)) {
    return buildLiveResult({
      kind: "member_check_in",
      verdict: "fail",
      errorCode: "location_required",
      headline: "Live member check-in needs coordinates",
      trace: [
        { label: "Scenario", value: "Member check-in" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "User", value: userId }],
    });
  }
  const lat = request.lat as number;
  const lon = request.lon as number;

  const { data, error } = await admin.rpc("admin_lab_check_in_office_hours", {
    _user_id: userId,
    _lat: lat,
    _lon: lon,
    _now: request.timestamp,
  });

  if (error) {
    return buildLiveResult({
      kind: "member_check_in",
      verdict: "fail",
      errorCode: error.message || "unknown",
      headline: "Live member check-in failed",
      trace: [
        { label: "Scenario", value: "Member check-in" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "User", value: userId }],
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return buildLiveResult({
    kind: "member_check_in",
    verdict: row?.within_grace ? "warning" : "pass",
    resultCode: row?.within_grace ? "member_check_in_grace" : "member_check_in_ok",
    headline: row?.within_grace ? "Live member check-in succeeded in the grace zone" : "Live member check-in succeeded",
    trace: [
      { label: "Scenario", value: "Member check-in" },
      { label: "Mode", value: "Live verify" },
      { label: "Timestamp", value: request.timestamp },
    ],
    evidence: [
      { label: "User", value: userId },
      { label: "Distance", value: `${row?.distance_m ?? "?"} m` },
      { label: "Band", value: row?.within_grace ? "Grace zone" : "In radius" },
    ],
    cleanup: cleanupState(Boolean(row?.cleanup_ok), row?.cleanup_error ?? null),
  });
}

async function cleanupPresenceLive(admin: ReturnType<typeof getSupabaseAdminClient>, request: OfficeHoursLabParsedRequest) {
  const userId = requireUserId(request);
  const session = request.session;
  if (!session?.checkinAt) {
    return buildLiveResult({
      kind: request.kind,
      verdict: "fail",
      errorCode: "session_not_found",
      headline: "Live presence verification needs a session seed",
      trace: [
        { label: "Scenario", value: request.kind === "presence_ping" ? "Presence ping" : "Presence heartbeat" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "User", value: userId }],
    });
  }

  if (request.kind === "presence_heartbeat" && (!Number.isFinite(request.lat) || !Number.isFinite(request.lon))) {
    return buildLiveResult({
      kind: "presence_heartbeat",
      verdict: "fail",
      errorCode: "location_required",
      headline: "Live presence heartbeat needs coordinates",
      trace: [
        { label: "Scenario", value: "Presence heartbeat" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "User", value: userId }],
    });
  }

  const rpcName =
    request.kind === "presence_ping"
      ? "admin_lab_record_office_hours_presence_ping"
      : "admin_lab_record_office_hours_presence";
  const rpcArgs =
    request.kind === "presence_ping"
      ? {
          _user_id: userId,
          _checkin_at: session.checkinAt,
          _last_presence_at: session.lastPresenceAt ?? null,
          _requires_presence: session.requiresPresence ?? true,
          _now: request.timestamp,
        }
      : {
          _user_id: userId,
          _checkin_at: session.checkinAt,
          _last_presence_at: session.lastPresenceAt ?? null,
          _requires_presence: session.requiresPresence ?? true,
          _lat: request.lat as number,
          _lon: request.lon as number,
          _now: request.timestamp,
        };

  const { data, error } = await admin.rpc(rpcName, rpcArgs);
  if (error) {
    return buildLiveResult({
      kind: request.kind,
      verdict: "fail",
      errorCode: error.message || "unknown",
      headline: "Live presence verification failed",
      trace: [
        { label: "Scenario", value: request.kind === "presence_ping" ? "Presence ping" : "Presence heartbeat" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "User", value: userId }],
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const checkedOut = row?.action === "checked_out";
  return buildLiveResult({
    kind: request.kind,
    verdict: checkedOut ? "fail" : "pass",
    resultCode: checkedOut ? "presence_checked_out" : row?.action === "ignored" ? "presence_ignored" : "presence_ok",
    errorCode: checkedOut ? "presence_timeout_after_5pm" : null,
    headline: checkedOut ? "Live presence verification auto-closed the session" : "Live presence verification kept the session open",
    trace: [
      { label: "Scenario", value: request.kind === "presence_ping" ? "Presence ping" : "Presence heartbeat" },
      { label: "Mode", value: "Live verify" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Action", value: row?.action ?? "unknown" },
    ],
    evidence: [
      { label: "User", value: userId },
      { label: "Check-in", value: session.checkinAt },
      { label: "Last presence", value: session.lastPresenceAt ?? session.checkinAt },
    ],
    cleanup: cleanupState(Boolean(row?.cleanup_ok), row?.cleanup_error ?? null),
  });
}

async function liveKioskStatus(admin: ReturnType<typeof getSupabaseAdminClient>, request: OfficeHoursLabParsedRequest) {
  const userId = requireUserId(request);
  const { data: phoneRow, error: phoneErr } = await admin
    .from("office_hours_kiosk_phone_allowlist")
    .select("phone_last4")
    .eq("user_id", userId)
    .maybeSingle();

  if (phoneErr || !phoneRow?.phone_last4) {
    return buildLiveResult({
      kind: "kiosk_status",
      verdict: "fail",
      errorCode: "phone_not_allowed",
      headline: "Live kiosk status could not find an allowlisted phone",
      trace: [
        { label: "Scenario", value: "Kiosk status" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "User", value: userId }],
    });
  }

  const openSession = await getOpenKioskSession(admin, userId);
  const hasOpenSession = Boolean(openSession?.id);

  return buildLiveResult({
    kind: "kiosk_status",
    verdict: "pass",
    resultCode: hasOpenSession ? "kiosk_status_check_out" : "kiosk_status_check_in",
    headline: hasOpenSession ? "Live kiosk status resolves to check out" : "Live kiosk status resolves to check in",
    trace: [
      { label: "Scenario", value: "Kiosk status" },
      { label: "Mode", value: "Live verify" },
      { label: "Timestamp", value: request.timestamp },
      { label: "Intent", value: hasOpenSession ? "check_out" : "check_in" },
    ],
    evidence: [
      { label: "User", value: userId },
      { label: "Phone", value: `••••${phoneRow.phone_last4}` },
    ],
  });
}

async function liveKioskCheckIn(admin: ReturnType<typeof getSupabaseAdminClient>, request: OfficeHoursLabParsedRequest) {
  const userId = requireUserId(request);
  if (!Number.isFinite(request.lat) || !Number.isFinite(request.lon)) {
    return buildLiveResult({
      kind: "kiosk_check_in",
      verdict: "fail",
      errorCode: "location_required",
      headline: "Live kiosk check-in needs coordinates",
      trace: [
        { label: "Scenario", value: "Kiosk check-in" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "User", value: userId }],
    });
  }
  const lat = request.lat as number;
  const lon = request.lon as number;

  return runOfficeHoursLabKioskCheckInLiveProbe({
    timestamp: request.timestamp,
    lat,
    lon,
    createVerifiedChallenge: async () => {
      const { data: phoneRow, error } = await admin
        .from("office_hours_kiosk_phone_allowlist")
        .select("phone_e164")
        .eq("user_id", userId)
        .maybeSingle();

      if (error || !phoneRow?.phone_e164) {
        throw new Error("phone_not_allowed");
      }

      const verificationToken = randomUUID();
      const verifiedAtIso = request.timestamp;
      const expiresAtIso = new Date(new Date(request.timestamp).getTime() + 10 * 60_000).toISOString();
      const challengeId = randomUUID();

      const { error: insertErr } = await admin.from("office_hours_kiosk_otp_challenges").insert({
        id: challengeId,
        user_id: userId,
        phone_e164: phoneRow.phone_e164,
        intent: "check_in",
        code_hash: "lab",
        attempt_count: 0,
        send_count: 1,
        expires_at: expiresAtIso,
        verified_at: verifiedAtIso,
        verification_token: verificationToken,
        verification_expires_at: expiresAtIso,
        used_at: null,
      });

      if (insertErr) {
        throw new Error(insertErr.message || "challenge_insert_failed");
      }

      return {
        id: challengeId,
        user_id: userId,
        phone_e164: phoneRow.phone_e164,
        verified_at: verifiedAtIso,
      };
    },
    performCheckIn: async (input) =>
      performKioskCheckIn({
        admin,
        challenge: input.challenge,
        lat: input.lat,
        lon: input.lon,
        timestamp: input.timestamp,
        options: input.options,
      }),
    cleanupArtifacts: async ({ challengeId, sessionId }) => {
      const cleanupErrors: string[] = [];
      if (sessionId) {
        const { error: sessionErr } = await admin.from("office_hour_sessions").delete().eq("id", sessionId);
        if (sessionErr) cleanupErrors.push(sessionErr.message);
        await cleanupAuditLog(admin, sessionId, "office_hour_session");
      }
      if (challengeId) {
        const { error: challengeErr } = await admin.from("office_hours_kiosk_otp_challenges").delete().eq("id", challengeId);
        if (challengeErr) cleanupErrors.push(challengeErr.message);
      }
      return {
        ok: cleanupErrors.length === 0,
        message: cleanupErrors[0] ?? null,
      };
    },
  });
}

async function liveShiftCreation(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  routeSupabase: Awaited<ReturnType<typeof getSupabaseRouteHandlerClient>>,
  request: OfficeHoursLabParsedRequest,
) {
  const shift = request.shift;
  if (!shift?.startsAt || !shift.endsAt) {
    return buildLiveResult({
      kind: "shift_creation",
      verdict: "fail",
      errorCode: "time_required",
      headline: "Live shift creation needs a shift window",
      trace: [
        { label: "Scenario", value: "Shift creation" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [],
    });
  }

  return runOfficeHoursLabShiftCreationLiveProbe({
    timestamp: request.timestamp,
    shift: {
      userId: requireUserId(request),
      startsAt: shift.startsAt,
      endsAt: shift.endsAt,
      officeLocationId: shift.officeLocationId ?? null,
    },
    createShift: async (input) => {
      const { data, error } = await routeSupabase.rpc("admin_create_office_hour_shift", {
        _user_id: input.userId,
        _starts_at: input.startsAt,
        _ends_at: input.endsAt,
        _office_location_id: input.officeLocationId ?? null,
      });
      if (error) throw new Error(error.message || "shift_create_failed");
      const shiftRow = Array.isArray(data) ? data[0] : data;
      return { id: shiftRow?.id as string };
    },
    cleanupArtifacts: async ({ shiftId, auditTargetId }) => {
      const cleanupErrors: string[] = [];
      if (shiftId) {
        const { error: deleteErr } = await admin.from("office_hour_shifts").delete().eq("id", shiftId);
        if (deleteErr) cleanupErrors.push(deleteErr.message);
      }
      await cleanupAuditLog(admin, auditTargetId, "office_hour_shift");
      return {
        ok: cleanupErrors.length === 0,
        message: cleanupErrors[0] ?? null,
      };
    },
  });
}

async function liveAdminClose(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  routeSupabase: Awaited<ReturnType<typeof getSupabaseRouteHandlerClient>>,
  authzUserId: string,
  request: OfficeHoursLabParsedRequest,
) {
  const userId = requireUserId(request);
  const adminClose = request.adminClose;
  if (!adminClose?.checkoutAt) {
    return buildLiveResult({
      kind: "admin_close_session",
      verdict: "fail",
      errorCode: "checkout_at_required",
      headline: "Live admin close needs a checkout time",
      trace: [
        { label: "Scenario", value: "Admin close session" },
        { label: "Mode", value: "Live verify" },
        { label: "Timestamp", value: request.timestamp },
      ],
      evidence: [{ label: "User", value: userId }],
    });
  }

  return runOfficeHoursLabAdminCloseLiveProbe({
    timestamp: request.timestamp,
    sessionSeed: {
      userId,
      checkinAt: request.session?.checkinAt ?? new Date(new Date(adminClose.checkoutAt).getTime() - 60 * 60_000).toISOString(),
    },
    adminClose: {
      checkoutAt: adminClose.checkoutAt,
      excludeFromTotals: adminClose.excludeFromTotals ?? false,
      reason: adminClose.reason?.trim() || "Office Hours lab verification",
    },
    createTemporarySession: async () => {
      const checkinAt = request.session?.checkinAt ?? new Date(new Date(adminClose.checkoutAt).getTime() - 60 * 60_000).toISOString();
      const { data: locationRow } = await admin.from("office_config").select("primary_office_location_id").eq("id", true).maybeSingle();
      const { data, error } = await admin
        .from("office_hour_sessions")
        .insert({
          user_id: userId,
          office_location_id: locationRow?.primary_office_location_id ?? null,
          checkin_at: checkinAt,
          status: "open",
          within_radius: true,
          within_grace: false,
          distance_m_at_checkin: 0,
          needs_review: false,
          review_reason: null,
          requires_presence: true,
          last_presence_at: checkinAt,
        })
        .select("id,user_id")
        .single();
      if (error) throw new Error(error.message || "temp_session_insert_failed");
      return { id: data.id, user_id: data.user_id };
    },
    closeSession: async (input) => {
      const result = await closeOfficeHoursAdminSession({
        routeSupabase,
        admin,
        actorUserId: authzUserId,
        sessionId: input.sessionId,
        checkoutAt: input.checkoutAt,
        excludeFromTotals: input.excludeFromTotals,
        reason: input.reason,
        suppressNotification: input.options.suppressNotification,
      });
      if (!result.ok) throw new Error(result.error);
      return { session: result.session };
    },
    cleanupArtifacts: async ({ sessionId, auditTargetId }) => {
      const cleanupErrors: string[] = [];
      await cleanupAuditLog(admin, auditTargetId, "office_hour_session");
      if (sessionId) {
        const { error: deleteErr } = await admin.from("office_hour_sessions").delete().eq("id", sessionId);
        if (deleteErr) cleanupErrors.push(deleteErr.message);
      }
      return {
        ok: cleanupErrors.length === 0,
        message: cleanupErrors[0] ?? null,
      };
    },
  });
}

export async function POST(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const parsed = OfficeHoursLabRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const routeSupabase = await getSupabaseRouteHandlerClient();

  let result: OfficeHoursLabResult;
  switch (parsed.data.kind) {
    case "member_check_in":
      result = await cleanupMemberCheckInLive(admin, parsed.data);
      break;
    case "kiosk_status":
      result = await liveKioskStatus(admin, parsed.data);
      break;
    case "kiosk_check_in":
      result = await liveKioskCheckIn(admin, parsed.data);
      break;
    case "presence_ping":
    case "presence_heartbeat":
      result = await cleanupPresenceLive(admin, parsed.data);
      break;
    case "shift_creation":
      result = await liveShiftCreation(admin, routeSupabase, parsed.data);
      break;
    case "admin_close_session":
      result = await liveAdminClose(admin, routeSupabase, authz.userId, parsed.data);
      break;
    default:
      result = buildLiveResult({
        kind: parsed.data.kind,
        verdict: "fail",
        errorCode: "unsupported_live_probe",
        headline: "This scenario is available in simulation only",
        trace: [
          { label: "Scenario", value: parsed.data.kind },
          { label: "Mode", value: "Live verify" },
          { label: "Timestamp", value: parsed.data.timestamp },
        ],
        evidence: [],
      });
  }

  return NextResponse.json({ ok: true, result });
}
