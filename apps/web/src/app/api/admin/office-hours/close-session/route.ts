import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireFullAdminOrEvp } from "@/lib/adminAuth";
import { buildAdminOverrideNotification } from "@/lib/office-hours-admin-overrides";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";
import { sendEmail } from "@/lib/emailSender";

export const runtime = "nodejs";

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  checkoutAt: z.string().min(1),
  excludeFromTotals: z.boolean().optional().default(false),
  reason: z.string().trim().min(2),
});

function mapRpcError(message: string): { status: number; error: string } {
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

export async function POST(request: NextRequest) {
  const authz = await requireFullAdminOrEvp(request);
  if (!authz.ok) return authz.response;

  const body = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message || "invalid_request";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { sessionId, checkoutAt, excludeFromTotals, reason } = parsed.data;

  const supabase = await getSupabaseRouteHandlerClient();
  const { data: session, error: closeErr } = await supabase.rpc("admin_close_office_hour_session", {
    _session_id: sessionId,
    _checkout_at: checkoutAt,
    _exclude_from_totals: excludeFromTotals,
    _reason: reason,
  });

  if (closeErr) {
    const mapped = mapRpcError(closeErr.message || "unknown");
    return NextResponse.json({ error: mapped.error }, { status: mapped.status });
  }

  const admin = getSupabaseAdminClient();
  const sessionRow = Array.isArray(session) ? session[0] : session;
  const userId = sessionRow?.user_id as string | undefined;

  if (!userId) {
    return NextResponse.json({ ok: true, session: sessionRow, notify_error: "member_not_found" });
  }

  const [{ data: profileRow }, { data: privateRow }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", userId).maybeSingle(),
    admin.from("profile_private").select("email").eq("id", userId).maybeSingle(),
  ]);

  const memberName = (profileRow as { display_name?: string | null } | null)?.display_name ?? "";
  const toEmail = (privateRow as { email?: string | null } | null)?.email ?? null;

  if (!toEmail) {
    return NextResponse.json({ ok: true, session: sessionRow, notify_error: "no_email" });
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
      actor_user_id: authz.userId,
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
    const result = await sendEmail({ to: toEmail, subject: notification.subject, text: notification.text });

    if (queuedRow?.id) {
      await admin
        .from("notification_log")
        .update({ status: "sent", provider_message_id: result.providerMessageId, error_message: null })
        .eq("id", queuedRow.id);
    }

    await admin.rpc("log_event", {
      action_key: "office_hours.admin_close.email_sent",
      actor_user_id: authz.userId,
      target_type: "office_hour_session",
      target_id: sessionId,
      metadata: { to: toEmail, provider: result.provider, providerMessageId: result.providerMessageId },
    });

    return NextResponse.json({ ok: true, session: sessionRow });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send email";

    if (queuedRow?.id) {
      await admin.from("notification_log").update({ status: "failed", error_message: message }).eq("id", queuedRow.id);
    }

    await admin.rpc("log_event", {
      action_key: "office_hours.admin_close.email_failed",
      actor_user_id: authz.userId,
      target_type: "office_hour_session",
      target_id: sessionId,
      metadata: { to: toEmail, error: message },
    });

    return NextResponse.json({ ok: true, session: sessionRow, notify_error: message });
  }
}
