import { NextResponse, type NextRequest } from "next/server";
import { requireFullAdmin } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type AuditLogRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  action_key: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  actor_display_name?: string | null;
  actor_email?: string | null;
};

export async function GET(request: NextRequest) {
  const authResult = await requireFullAdmin(request);
  if (!authResult.ok) return authResult.response;
  
  const admin = getSupabaseAdminClient();

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
  const offset = Math.max(parseInt(url.searchParams.get("offset") ?? "0", 10), 0);
  const actionKey = url.searchParams.get("action_key") ?? null;
  const actorId = url.searchParams.get("actor_id") ?? null;
  const startDate = url.searchParams.get("start") ?? null;
  const endDate = url.searchParams.get("end") ?? null;

  let query = admin
    .from("audit_log")
    .select("id,occurred_at,actor_user_id,action_key,target_type,target_id,metadata")
    .order("occurred_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (actionKey) {
    query = query.eq("action_key", actionKey);
  }
  if (actorId) {
    query = query.eq("actor_user_id", actorId);
  }
  if (startDate) {
    query = query.gte("occurred_at", startDate);
  }
  if (endDate) {
    query = query.lte("occurred_at", endDate);
  }

  const { data: logs, error } = await query;

  if (error) {
    console.error("[audit-log] Error fetching audit logs:", error);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }

  // Fetch actor profiles for display names
  const actorIds = [...new Set((logs ?? []).map((l: { actor_user_id: string | null }) => l.actor_user_id).filter(Boolean))] as string[];
  const actorsMap: Map<string, { display_name: string | null; email: string | null }> = new Map();

  if (actorIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id,display_name,profile_private(email)")
      .in("id", actorIds);

    if (profiles) {
      for (const p of profiles) {
        const maybePrivate = (p as unknown as { profile_private?: { email?: string | null } | null }).profile_private;
        actorsMap.set((p as unknown as { id: string }).id, {
          display_name: (p as unknown as { display_name: string | null }).display_name,
          email: maybePrivate?.email ?? null,
        });
      }
    }
  }

  const enrichedLogs: AuditLogRow[] = (logs ?? []).map((l: AuditLogRow) => {
    const actor = l.actor_user_id ? actorsMap.get(l.actor_user_id) : null;
    return {
      ...l,
      actor_display_name: actor?.display_name ?? null,
      actor_email: actor?.email ?? null,
    };
  });

  // Get distinct action keys for filter dropdown
  const { data: actionKeys } = await admin
    .from("audit_log")
    .select("action_key")
    .limit(1000);

  const uniqueActionKeys = [...new Set((actionKeys ?? []).map((a: { action_key: string }) => a.action_key))].sort();

  return NextResponse.json({
    logs: enrichedLogs,
    actionKeys: uniqueActionKeys,
    pagination: {
      limit,
      offset,
      hasMore: (logs?.length ?? 0) === limit,
    },
  });
}
