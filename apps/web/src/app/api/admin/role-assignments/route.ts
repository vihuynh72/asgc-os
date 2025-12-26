import { NextResponse, type NextRequest } from "next/server";

import { requireFullAdmin } from "@/lib/adminAuth";
import { sendEmail } from "@/lib/emailSender";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function isValidRoleKey(roleKey: string): roleKey is "advisor" | "president" | "executive" | "director" | "board_member" | "volunteer" {
  return ["advisor", "president", "executive", "director", "board_member", "volunteer"].includes(roleKey);
}

const ROLE_LABEL_BY_KEY: Record<string, string> = {
  advisor: "Advisor",
  president: "President",
  executive: "Executive",
  director: "Director",
  board_member: "Board member",
  volunteer: "Volunteer",
};

// GET: List role assignments (full admin only)
export async function GET(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const url = request.nextUrl;
  const termId = url.searchParams.get("termId");
  const scope = url.searchParams.get("scope");
  const activeOnly = url.searchParams.get("activeOnly") === "1";
  const roleKeyFilter = url.searchParams.get("roleKey");

  const admin = getSupabaseAdminClient();

  let query = admin
    .from("role_assignments")
    .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary")
    .order("starts_at", { ascending: false });

  if (activeOnly) {
    query = query.is("ends_at", null);
  }

  if (roleKeyFilter && isValidRoleKey(roleKeyFilter)) {
    query = query.eq("role_key", roleKeyFilter);
  }

  if (scope === "global") {
    query = query.is("term_id", null);
  } else if (termId) {
    query = query.eq("term_id", termId);
  }

  const { data: assignments, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ assignments });
}

// POST: Create a role assignment (full admin only)
export async function POST(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const body = (await request.json().catch(() => null)) as null | {
    userId?: unknown;
    roleKey?: unknown;
    termId?: unknown;
    displayTitle?: unknown;
  };

  const userId = typeof body?.userId === "string" ? body.userId : "";
  const roleKey = typeof body?.roleKey === "string" ? body.roleKey : "";
  const termId = typeof body?.termId === "string" ? body.termId : null;
  const displayTitleRaw = typeof body?.displayTitle === "string" ? body.displayTitle.trim() : "";
  const displayTitle = displayTitleRaw.length > 0 ? displayTitleRaw : null;

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  if (!roleKey || !isValidRoleKey(roleKey)) {
    return NextResponse.json({ error: "invalid roleKey" }, { status: 400 });
  }

  if (roleKey !== "advisor" && !termId) {
    return NextResponse.json({ error: "termId is required for term-scoped roles" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const insertRow: Record<string, unknown> = {
    user_id: userId,
    role_key: roleKey,
    term_id: roleKey === "advisor" ? null : termId,
    starts_at: new Date().toISOString(),
    ends_at: null,
    is_primary: false,
    display_title: roleKey === "executive" ? displayTitle : null,
  };

  const { data: assignment, error } = await admin
    .from("role_assignments")
    .insert(insertRow)
    .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary,display_title")
    .single();

  if (error) {
    if (error.code === "23505") {
      let existingQuery = admin
        .from("role_assignments")
        .select("id,user_id,role_key,term_id,starts_at,ends_at,is_primary,display_title")
        .eq("user_id", userId)
        .eq("role_key", roleKey)
        .is("ends_at", null)
        .order("starts_at", { ascending: false })
        .limit(1);

      if (roleKey === "advisor") {
        existingQuery = existingQuery.is("term_id", null);
      } else if (termId) {
        existingQuery = existingQuery.eq("term_id", termId);
      }

      const { data: existing } = await existingQuery.maybeSingle();
      if (existing) return NextResponse.json({ assignment: existing });
    }

    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort audit log (server-only)
  await admin.rpc("log_event", {
    action_key: "role_assignment.created",
    actor_user_id: authz.userId,
    target_type: "role_assignment",
    target_id: (assignment as { id: string }).id,
    metadata: { user_id: userId, role_key: roleKey, term_id: roleKey === "advisor" ? null : termId },
  });

  return NextResponse.json({ assignment });
}

// DELETE: End a role assignment (full admin only)
export async function DELETE(request: NextRequest) {
  const authz = await requireFullAdmin(request);
  if (!authz.ok) return authz.response;

  const body = (await request.json().catch(() => null)) as null | {
    assignmentId?: unknown;
    notify?: unknown;
    note?: unknown;
  };

  const assignmentId = typeof body?.assignmentId === "string" ? body.assignmentId : "";
  if (!assignmentId) {
    return NextResponse.json({ error: "assignmentId is required" }, { status: 400 });
  }

  const notify = body?.notify === true;
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  if (note.length > 500) {
    return NextResponse.json({ error: "note_too_long" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("role_assignments")
    .update({ ends_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .is("ends_at", null)
    .select("id,user_id,role_key,term_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    await admin.rpc("log_event", {
      action_key: "role_assignment.ended",
      actor_user_id: authz.userId,
      target_type: "role_assignment",
      target_id: assignmentId,
      metadata: { already_ended: true, notify: false },
    });
    return NextResponse.json({ ok: true, already_ended: true });
  }

  let notifyError: string | null = null;
  if (notify) {
    const { data: privateRow, error: privateErr } = await admin
      .from("profile_private")
      .select("email")
      .eq("id", updated.user_id)
      .maybeSingle();

    const toEmail = (privateRow as { email?: string | null } | null)?.email ?? null;
    if (privateErr || !toEmail) {
      notifyError = privateErr?.message || "no_email_on_file";
    } else {
      let termLabel = "Global";
      if (updated.term_id) {
        const { data: termRow } = await admin
          .from("terms")
          .select("name")
          .eq("id", updated.term_id)
          .maybeSingle();
        termLabel = termRow?.name ? `${termRow.name}` : updated.term_id;
      }

      const roleLabel = ROLE_LABEL_BY_KEY[updated.role_key] ?? updated.role_key;
      const noteBlock = note ? `\nNote from admin:\n${note}\n` : "";
      const subject = "ASGC OS role update";
      const text =
        `Your ${roleLabel} role (${termLabel}) was revoked in ASGC OS.\n\n` +
        `If you have questions, contact your ASGC admin.` +
        noteBlock;

      const { data: queuedRow } = await admin
        .from("notification_log")
        .insert({
          actor_user_id: authz.userId,
          user_id: updated.user_id,
          type: "role_revoked",
          channel: "email",
          provider: "resend",
          to_email: toEmail,
          subject,
          status: "queued",
          metadata: { role_key: updated.role_key, term_id: updated.term_id, note: note || null },
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
      } catch (err) {
        notifyError = err instanceof Error ? err.message : "send_email_failed";
        if (queuedRow?.id) {
          await admin
            .from("notification_log")
            .update({ status: "failed", error_message: notifyError })
            .eq("id", queuedRow.id);
        }
      }
    }
  }

  // Best-effort audit log (server-only)
  await admin.rpc("log_event", {
    action_key: "role_assignment.ended",
    actor_user_id: authz.userId,
    target_type: "role_assignment",
    target_id: assignmentId,
    metadata: {
      notify,
      note: note || null,
      notified: notify && !notifyError,
    },
  });

  return NextResponse.json({ ok: true, notify_error: notifyError || undefined });
}
