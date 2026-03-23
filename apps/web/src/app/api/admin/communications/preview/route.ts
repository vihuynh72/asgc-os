import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildAdminCommunicationPreview, getAdminCommunicationsAccess } from "@/lib/admin/communications.mjs";
import { loadAdminCommunicationRealSource } from "@/lib/admin/communications-real-data.mjs";
import { getAdminTierForRequest } from "@/lib/adminAuth";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

const BodySchema = z.object({
  templateId: z.string().min(1),
  mode: z.enum(["sample", "real"]).optional(),
  scenarioId: z.string().optional(),
  sourceId: z.string().optional(),
});

function mapErrorStatus(message: string) {
  if (message === "forbidden") return 403;
  if (message === "not_found" || message === "source_not_found") return 404;
  if (message === "real_mode_not_supported" || message === "source_required") return 400;
  return 500;
}

export async function POST(request: NextRequest) {
  const authz = await getAdminTierForRequest(request);
  if (!authz.ok) return authz.response;

  const access = getAdminCommunicationsAccess({
    tier: authz.tierInfo.tier,
    isEvp: authz.tierInfo.isEvp,
  });
  if (!access.canAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const mode = parsed.data.mode ?? "sample";
    const viewer = mode === "real" ? await getSupabaseRouteHandlerClient() : null;
    const source =
      mode === "real"
        ? await loadAdminCommunicationRealSource({
            access,
            templateId: parsed.data.templateId,
            sourceId: parsed.data.sourceId ?? "",
            admin: getSupabaseAdminClient(),
            viewer,
            nowIso: new Date().toISOString(),
          })
        : null;

    const preview = buildAdminCommunicationPreview({
      access,
      templateId: parsed.data.templateId,
      mode,
      scenarioId: parsed.data.scenarioId ?? "default",
      source,
      origin: new URL(request.url).origin,
    });

    return NextResponse.json({ ok: true, preview, canSend: access.canSend });
  } catch (error) {
    const message = error instanceof Error ? error.message : "preview_failed";
    const status = mapErrorStatus(message);
    return NextResponse.json({ error: message }, { status });
  }
}
