import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";
import { sendEmail } from "@/lib/emailSender";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function isAdminForRequest(
  request: NextRequest,
): Promise<{ ok: true; userId: string; supabase: ReturnType<typeof createServerClient> } | { ok: false; response: NextResponse }> {
  const env = getPublicEnv();

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll() {
        // No-op
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }

  return { ok: true, userId: user.id, supabase };
}

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  // Best practice: send only to the logged-in admin's own email.
  const { data: privateRow, error: privateErr } = await authz.supabase
    .from("profile_private")
    .select("email")
    .eq("id", authz.userId)
    .maybeSingle();

  if (privateErr) {
    return NextResponse.json({ error: privateErr.message }, { status: 500 });
  }

  const toEmail = (privateRow as unknown as { email?: string | null } | null)?.email ?? null;
  if (!toEmail) {
    return NextResponse.json({ error: "no email on file for current user" }, { status: 400 });
  }

  const subject = "ASGC OS: Test email";
  const text = "This is a test email from ASGC OS (Phase 10 notifications plumbing).";

  const admin = getSupabaseAdminClient();

  // Insert a queued row first (best-effort).
  const { data: queuedRow } = await admin
    .from("notification_log")
    .insert({
      actor_user_id: authz.userId,
      user_id: authz.userId,
      type: "test_email",
      channel: "email",
      provider: "resend",
      to_email: toEmail,
      subject,
      status: "queued",
      metadata: {},
    })
    .select("id")
    .maybeSingle();

  try {
    const result = await sendEmail({ to: toEmail, subject, text });

    if (queuedRow?.id) {
      await admin
        .from("notification_log")
        .update({ status: "sent", provider_message_id: result.providerMessageId, error_message: null })
        .eq("id", queuedRow.id);
    }

    await admin.rpc("log_event", {
      action_key: "notification.test_email.sent",
      actor_user_id: authz.userId,
      target_type: "notification_log",
      target_id: queuedRow?.id ?? null,
      metadata: { to: toEmail, provider: result.provider, providerMessageId: result.providerMessageId },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send test email";

    if (queuedRow?.id) {
      await admin
        .from("notification_log")
        .update({ status: "failed", error_message: message })
        .eq("id", queuedRow.id);
    }

    await admin.rpc("log_event", {
      action_key: "notification.test_email.failed",
      actor_user_id: authz.userId,
      target_type: "notification_log",
      target_id: queuedRow?.id ?? null,
      metadata: { to: toEmail, error: message },
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
