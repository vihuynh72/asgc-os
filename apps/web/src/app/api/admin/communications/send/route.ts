import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildAdminCommunicationSendInput } from "@/lib/admin/communications-service.mjs";
import { getAdminCommunicationsAccess } from "@/lib/admin/communications.mjs";
import { getAdminTierForRequest } from "@/lib/adminAuth";
import { sendEmail } from "@/lib/emailSender";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const BodySchema = z.object({
  templateId: z.string().min(1),
  scenarioId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const authz = await getAdminTierForRequest(request);
  if (!authz.ok) return authz.response;

  const access = getAdminCommunicationsAccess({
    tier: authz.tierInfo.tier,
    isEvp: authz.tierInfo.isEvp,
  });

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  if (!access.canSend) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = getSupabaseAdminClient();
  const { data: privateRow, error: privateErr } = await admin
    .from("profile_private")
    .select("email")
    .eq("id", authz.userId)
    .maybeSingle();

  if (privateErr) {
    return NextResponse.json({ error: privateErr.message }, { status: 500 });
  }

  const toEmail = (privateRow as { email?: string | null } | null)?.email ?? null;
  if (!toEmail) {
    return NextResponse.json({ error: "no_email_on_file" }, { status: 400 });
  }

  let sendInput;
  try {
    sendInput = buildAdminCommunicationSendInput({
      access,
      actorUserId: authz.userId,
      recipientEmail: toEmail,
      templateId: parsed.data.templateId,
      scenarioId: parsed.data.scenarioId ?? "default",
      origin: new URL(request.url).origin,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_failed";
    const status = message === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }

  const { data: queuedRow } = await admin
    .from("notification_log")
    .insert(sendInput.notification)
    .select("id")
    .maybeSingle();

  try {
    const result = await sendEmail({
      to: sendInput.toEmail,
      subject: sendInput.email.subject,
      text: sendInput.email.text,
      html: sendInput.email.html,
    });

    if (queuedRow?.id) {
      await admin
        .from("notification_log")
        .update({ status: "sent", provider_message_id: result.providerMessageId, error_message: null })
        .eq("id", queuedRow.id);
    }

    await admin.rpc("log_event", {
      action_key: "notification.communication_test.sent",
      actor_user_id: authz.userId,
      target_type: "notification_log",
      target_id: queuedRow?.id ?? null,
      metadata: {
        to: sendInput.toEmail,
        template_id: sendInput.preview.template.id,
        scenario_id: sendInput.preview.scenario.id,
        providerMessageId: result.providerMessageId,
      },
    });

    return NextResponse.json({
      ok: true,
      to: sendInput.toEmail,
      subject: sendInput.email.subject,
      providerMessageId: result.providerMessageId,
      notificationId: queuedRow?.id ?? null,
      templateId: sendInput.preview.template.id,
      scenarioId: sendInput.preview.scenario.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "send_failed";

    if (queuedRow?.id) {
      await admin.from("notification_log").update({ status: "failed", error_message: message }).eq("id", queuedRow.id);
    }

    await admin.rpc("log_event", {
      action_key: "notification.communication_test.failed",
      actor_user_id: authz.userId,
      target_type: "notification_log",
      target_id: queuedRow?.id ?? null,
      metadata: {
        to: sendInput.toEmail,
        template_id: sendInput.preview.template.id,
        scenario_id: sendInput.preview.scenario.id,
        error: message,
      },
    });

    return NextResponse.json(
      {
        error: message,
        notificationId: queuedRow?.id ?? null,
        templateId: sendInput.preview.template.id,
        scenarioId: sendInput.preview.scenario.id,
      },
      { status: 500 },
    );
  }
}
