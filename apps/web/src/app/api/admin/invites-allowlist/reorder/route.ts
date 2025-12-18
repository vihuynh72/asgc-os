import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getPublicEnv } from "@/lib/env";
import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

async function isAdminForRequest(
  request: NextRequest,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
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

  return { ok: true };
}

const BodySchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(["up", "down"]),
  activeOnly: z.boolean().optional(),
});

type SortRow = { id: string; sort_order: number; invited_at: string };

export async function POST(request: NextRequest) {
  const authz = await isAdminForRequest(request);
  if (!authz.ok) return authz.response;

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const admin = getSupabaseAdminClient();

  const query = admin
    .from("invites_allowlist")
    .select("id,sort_order,invited_at")
    .order("sort_order", { ascending: false })
    .order("invited_at", { ascending: false })
    .limit(200);

  if (parsed.data.activeOnly) {
    query.eq("is_active", true);
  }

  const { data: rows, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = (rows ?? []) as SortRow[];
  const idx = list.findIndex((r) => r.id === parsed.data.id);
  if (idx < 0) return NextResponse.json({ ok: true });

  const neighborIdx = parsed.data.direction === "up" ? idx - 1 : idx + 1;
  const neighbor = list[neighborIdx];
  if (!neighbor) return NextResponse.json({ ok: true });

  const current = list[idx];
  const currentOrder = Number(current.sort_order ?? 0);
  const neighborOrder = Number(neighbor.sort_order ?? 0);

  let nextCurrentOrder = neighborOrder;
  let nextNeighborOrder = currentOrder;

  if (currentOrder === neighborOrder) {
    const delta = parsed.data.direction === "up" ? 1 : -1;
    nextCurrentOrder = currentOrder + delta;
    nextNeighborOrder = neighborOrder - delta;
  }

  const [{ error: updateCurrentErr }, { error: updateNeighborErr }] = await Promise.all([
    admin.from("invites_allowlist").update({ sort_order: nextCurrentOrder }).eq("id", current.id),
    admin.from("invites_allowlist").update({ sort_order: nextNeighborOrder }).eq("id", neighbor.id),
  ]);

  const updateErr = updateCurrentErr ?? updateNeighborErr;
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
