import type { SupabaseClient } from "@supabase/supabase-js";

import { buildAdminOverrideNotification } from "./office-hours-admin-overrides.mjs";
import { sendEmail } from "./emailSender";

export function mapAdminCloseRpcError(message: string): { status: number; error: string } {
  if (message === "unauthorized") return { status: 401, error: message };
  if (message === "forbidden") return { status: 403, error: message };
  if (
    message === "session_id_required" ||
    message === "checkout_at_required" ||
    message === "reason_required" ||
    message === "session_not_found" ||
    message === "session_not_open" ||
    message === "invalid_checkout_time"
  ) {
    return { status: 400, error: message };
  }
  return { status: 500, error: message };
}

export async function closeOfficeHoursAdminSession({
  routeSupabase,
  admin,
  actorUserId,
  sessionId,
  checkoutAt,
  excludeFromTotals,
  reason,
  suppressNotification = false,
}: {
  routeSupabase: SupabaseClient;
  admin: SupabaseClient;
  actorUserId: string;
  sessionId: string;
  checkoutAt: string;
  excludeFromTotals: boolean;
  reason: string;
  suppressNotification?: boolean;
}) {
  const { data: session, error: closeErr } = await routeSupabase.rpc("admin_close_office_hour_session", {
    _session_id: sessionId,
    _checkout_at: checkoutAt,
    _exclude_from_totals: excludeFromTotals,
    _reason: reason,
  });

  if (closeErr) {
    const mapped = mapAdminCloseRpcError(closeErr.message || "unknown");
    return { ok: false as const, status: mapped.status, error: mapped.error };
  }

  const sessionRow = Array.isArray(session) ? session[0] : session;

  if (suppressNotification) {
    return {
      ok: true as const,
      status: 200,
      session: sessionRow,
      notify_error: null,
      notification_suppressed: true,
    };
  }

  const userId = sessionRow?.user_id as string | undefined;
  if (!userId) {
    return {
      ok: true as const,
      status: 200,
      session: sessionRow,
      notify_error: "member_not_found",
      notification_suppressed: false,
    };
  }

  const [{ data: profileRow }, { data: privateRow }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    admin.from("profile_private").select("email").eq("id", userId).maybeSingle(),
  ]);

  const memberName = (profileRow as { display_name?: string | null } | null)?.display_name ?? "";
  const toEmail = (privateRow as { email?: string | null } | null)?.email ?? null;

  if (!toEmail) {
    return {
      ok: true as const,
      status: 200,
      session: sessionRow,
      notify_error: "no_email",
      notification_suppressed: false,
    };
  }

  const notification = buildAdminOverrideNotification({
    memberName,
    checkoutAtIso: checkoutAt,
    excludeFromTotals,
    reason,
  });

  const { data: queuedRow } = await admin
    .from("notification_log")
    .insert({
      actor_user_id: actorUserId,
      user_id: userId,
      type: "office_hours.admin_close",
      channel: "email",
      provider: "resend",
      to_email: toEmail,
      subject: notification.subject,
      status: "queued",
      metadata: {
        session_id: sessionId,
        checkout_at: checkoutAt,
        exclude_from_totals: excludeFromTotals,
      },
    })
    .select("id")
    .maybeSingle();

  try {
    const result = await sendEmail({
      to: toEmail,
      subject: notification.subject,
      text: notification.text,
      html: notification.html,
    });

    if (queuedRow?.id) {
      await admin
        .from("notification_log")
        .update({ status: "sent", provider_message_id: result.providerMessageId, error_message: null })
        .eq("id", queuedRow.id);
    }

    await admin.rpc("log_event", {
      action_key: "office_hours.admin_close.email_sent",
      actor_user_id: actorUserId,
      target_type: "office_hour_session",
      target_id: sessionId,
      metadata: { to: toEmail, provider: result.provider, providerMessageId: result.providerMessageId },
    });

    return {
      ok: true as const,
      status: 200,
      session: sessionRow,
      notify_error: null,
      notification_suppressed: false,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";

    if (queuedRow?.id) {
      await admin.from("notification_log").update({ status: "failed", error_message: message }).eq("id", queuedRow.id);
    }

    await admin.rpc("log_event", {
      action_key: "office_hours.admin_close.email_failed",
      actor_user_id: actorUserId,
      target_type: "office_hour_session",
      target_id: sessionId,
      metadata: { to: toEmail, error: message },
    });

    return {
      ok: true as const,
      status: 200,
      session: sessionRow,
      notify_error: message,
      notification_suppressed: false,
    };
  }
}
