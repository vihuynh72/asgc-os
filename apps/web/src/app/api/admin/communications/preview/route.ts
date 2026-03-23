import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { buildAdminCommunicationPreview, getAdminCommunicationsAccess } from "@/lib/admin/communications.mjs";
import { getAdminTierForRequest } from "@/lib/adminAuth";

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
  if (!access.canAccess) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const preview = buildAdminCommunicationPreview({
      access,
      templateId: parsed.data.templateId,
      scenarioId: parsed.data.scenarioId ?? "default",
      origin: new URL(request.url).origin,
    });

    return NextResponse.json({ ok: true, preview, canSend: access.canSend });
  } catch (error) {
    const message = error instanceof Error ? error.message : "preview_failed";
    const status = message === "forbidden" ? 403 : 404;
    return NextResponse.json({ error: message }, { status });
  }
}
