import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { requireBoardOrFinance } from "../finance-auth";

export const runtime = "nodejs";

const VoteSchema = z.object({
  meeting_id: z.string().uuid(),
  funding_request_id: z.string().uuid().nullable().optional(),
  motion_text: z.string().trim().min(1),
  moved_by: z.string().uuid().nullable().optional(),
  seconded_by: z.string().uuid().nullable().optional(),
  vote_yes: z.number().int().min(0),
  vote_no: z.number().int().min(0),
  vote_abstain: z.number().int().min(0),
  result: z.enum(["approved", "denied", "tabled"]),
  notes: z.string().trim().max(2000).optional(),
});

export async function GET(request: NextRequest) {
  const authResult = await requireBoardOrFinance(request);
  if (!authResult.ok) return authResult.response;

  const { supabase } = authResult.auth;
  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get("meeting_id");
  const requestId = searchParams.get("funding_request_id");

  let query = supabase
    .from("board_votes")
    .select("id,meeting_id,funding_request_id,motion_text,moved_by,seconded_by,vote_yes,vote_no,vote_abstain,result,notes,created_at")
    .order("created_at", { ascending: false });

  if (meetingId) {
    query = query.eq("meeting_id", meetingId);
  }

  if (requestId) {
    query = query.eq("funding_request_id", requestId);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ votes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const authResult = await requireBoardOrFinance(request);
  if (!authResult.ok) return authResult.response;

  const parsed = VoteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const payload = parsed.data;
  const { supabase } = authResult.auth;

  const { data, error } = await supabase.rpc("record_board_vote", {
    _meeting_id: payload.meeting_id,
    _funding_request_id: payload.funding_request_id ?? null,
    _motion_text: payload.motion_text,
    _moved_by: payload.moved_by ?? null,
    _seconded_by: payload.seconded_by ?? null,
    _vote_yes: payload.vote_yes,
    _vote_no: payload.vote_no,
    _vote_abstain: payload.vote_abstain,
    _result: payload.result,
    _notes: payload.notes ?? null,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ vote: data });
}
