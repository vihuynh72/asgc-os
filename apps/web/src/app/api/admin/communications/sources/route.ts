import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getAdminCommunicationsAccess } from "@/lib/admin/communications.mjs";
import { listAdminCommunicationRealSources } from "@/lib/admin/communications-real-data.mjs";
import { getAdminTierForRequest } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const QuerySchema = z.object({
  templateId: z.string().min(1),
  userId: z.string().uuid().optional(),
});

function mapErrorStatus(message: string) {
  if (message === "forbidden") return 403;
  if (message === "not_found") return 404;
  if (message === "real_mode_not_supported") return 400;
  return 500;
}

export async function GET(request: NextRequest) {
  const authz = await getAdminTierForRequest(request);
  if (!authz.ok) return authz.response;

  const access = getAdminCommunicationsAccess({
    tier: authz.tierInfo.tier,
    isEvp: authz.tierInfo.isEvp,
  });
  if (!access.canAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = QuerySchema.safeParse({
    templateId: request.nextUrl.searchParams.get("templateId"),
    userId: request.nextUrl.searchParams.get("userId") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const sources = await listAdminCommunicationRealSources({
      access,
      templateId: parsed.data.templateId,
      admin: getSupabaseAdminClient(),
      viewer: await getSupabaseRouteHandlerClient(),
      preferredUserId: parsed.data.userId ?? null,
      nowIso: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true, sources });
  } catch (error) {
    const message = error instanceof Error ? error.message : "source_lookup_failed";
    return NextResponse.json({ error: message }, { status: mapErrorStatus(message) });
  }
}
