import { PDFDocument, StandardFonts } from "pdf-lib";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { getSupabaseRouteHandlerClient } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type Params = { params: Promise<{ meetingId: string }> };

type AgendaItem = {
  id: string;
  title: string;
  category: string;
  background: string | null;
  recommended_motion: string | null;
  fiscal_impact: string | null;
  attachments_json?: unknown;
  state: string;
};

type Meeting = {
  id: string;
  title: string;
  meeting_type: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  committee_id: string | null;
};

function formatMeetingTypeLabel(type: string): string {
  switch (type) {
    case "board":
      return "Board";
    case "committee":
      return "Committee";
    case "icc":
      return "ICC";
    case "special":
      return "Special";
    default:
      return type;
  }
}

function formatAgendaDate(iso: string, timeZone?: string | null): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone ?? "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeAttachments(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const flat: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      const trimmed = entry.trim();
      if (trimmed) flat.push(trimmed);
      continue;
    }
    if (entry && typeof entry === "object" && "url" in entry && typeof (entry as { url: unknown }).url === "string") {
      const trimmed = (entry as { url: string }).url.trim();
      if (trimmed) flat.push(trimmed);
    }
  }
  return flat;
}

function wrapLines(text: string, font: Awaited<ReturnType<PDFDocument["embedFont"]>>, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    const width = font.widthOfTextAtSize(next, size);
    if (width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }

  if (line) lines.push(line);
  return lines;
}

export async function POST(request: NextRequest, { params }: Params) {
  const { meetingId } = await params;
  const supabase = await getSupabaseRouteHandlerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc("is_admin", { _uid: user.id });
  if (adminErr || !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: meeting, error: meetingErr } = await supabase
    .from("meetings")
    .select("id,title,meeting_type,starts_at,ends_at,location,committee_id")
    .eq("id", meetingId)
    .maybeSingle();

  if (meetingErr) {
    return NextResponse.json({ error: meetingErr.message }, { status: 500 });
  }

  if (!meeting) {
    return NextResponse.json({ error: "meeting_not_found" }, { status: 404 });
  }

  const { data: agendaItems, error: agendaErr } = await supabase.rpc("meeting_agenda_items", {
    _meeting_id: meetingId,
  });

  if (agendaErr) {
    return NextResponse.json({ error: agendaErr.message }, { status: 500 });
  }

  const { data: officeTzData } = await supabase.rpc("office_timezone");
  const officeTz = typeof officeTzData === "string" && officeTzData.length > 0 ? officeTzData : null;

  const acceptedItems = ((agendaItems ?? []) as AgendaItem[]).filter((item) =>
    ["accepted", "tabled"].includes(item.state),
  );

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [612, 792];
  const margin = 48;
  const maxWidth = pageSize[0] - margin * 2;

  let page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;

  const lineGap = 4;

  const drawLine = (text: string, size = 12, bold = false) => {
    const activeFont = bold ? fontBold : font;
    if (y < margin + size) {
      page = pdfDoc.addPage(pageSize);
      y = pageSize[1] - margin;
    }
    page.drawText(text, { x: margin, y, size, font: activeFont });
    y -= size + lineGap;
  };

  const drawParagraph = (text: string, size = 11, bold = false) => {
    const activeFont = bold ? fontBold : font;
    const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
    for (const paragraph of paragraphs) {
      const lines = wrapLines(paragraph, activeFont, size, maxWidth);
      for (const line of lines) {
        drawLine(line, size, bold);
      }
      y -= lineGap;
    }
  };

  drawLine("Agenda", 18, true);
  drawLine((meeting as Meeting).title, 14, true);

  const startDate = new Date((meeting as Meeting).starts_at);
  const endDate = new Date((meeting as Meeting).ends_at);
  const startLabel = officeTz
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: officeTz,
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(startDate)
    : startDate.toLocaleString();
  const endLabel = officeTz
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: officeTz,
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      }).format(endDate)
    : endDate.toLocaleTimeString();
  const admin = getSupabaseAdminClient();
  let committeeLabel: string | null = null;
  if ((meeting as Meeting).committee_id) {
    const { data: committeeRow } = await admin
      .from("committees")
      .select("name")
      .eq("id", (meeting as Meeting).committee_id)
      .maybeSingle();
    committeeLabel = committeeRow?.name ?? null;
  }

  drawLine(`Type: ${formatMeetingTypeLabel((meeting as Meeting).meeting_type)}`, 11, false);
  if (committeeLabel) {
    drawLine(`Committee: ${committeeLabel}`, 11, false);
  }
  drawLine(`${startLabel} - ${endLabel}`, 11, false);
  if ((meeting as Meeting).location) {
    drawLine(`Location: ${(meeting as Meeting).location}`, 11, false);
  }
  y -= 8;

  if (acceptedItems.length === 0) {
    drawLine("No accepted agenda items.", 12, false);
  } else {
    acceptedItems.forEach((item, idx) => {
      drawLine(`${idx + 1}. ${item.title}`, 12, true);
      drawLine(`Category: ${item.category}`, 10, false);
      if (item.background) {
        drawParagraph(`Background: ${item.background}`, 10, false);
      }
      if (item.recommended_motion) {
        drawParagraph(`Recommended motion: ${item.recommended_motion}`, 10, false);
      }
      if (item.fiscal_impact) {
        drawParagraph(`Fiscal impact: ${item.fiscal_impact}`, 10, false);
      }
      const attachments = normalizeAttachments(item.attachments_json);
      if (attachments.length > 0) {
        drawParagraph(`Attachments: ${attachments.join(", ")}`, 10, false);
      }
      y -= 6;
    });
  }

  const pdfBytes = await pdfDoc.save();
  const bucket = "documents";
  const timestamp = Date.now();
  const storagePath = `agenda/${meetingId}/${timestamp}.pdf`;

  const uploadRes = await admin.storage
    .from(bucket)
    .upload(storagePath, Buffer.from(pdfBytes), {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadRes.error) {
    return NextResponse.json({ error: uploadRes.error.message }, { status: 500 });
  }

  const { data: existingAgendaDocs } = await supabase
    .from("docs")
    .select("id,version_of_doc_id,uploaded_at")
    .eq("meeting_id", meetingId)
    .eq("doc_type", "agenda")
    .order("uploaded_at", { ascending: false })
    .limit(1);

  const latestAgenda = (existingAgendaDocs ?? [])[0] as
    | { id: string; version_of_doc_id: string | null }
    | undefined;
  const versionRootId = latestAgenda
    ? latestAgenda.version_of_doc_id ?? latestAgenda.id
    : null;

  const visibility = (meeting as Meeting).committee_id ? "committee_only" : "internal";
  const agendaDate = formatAgendaDate((meeting as Meeting).starts_at, officeTz);
  const agendaTitle = agendaDate
    ? `${(meeting as Meeting).title} Agenda ${agendaDate}`
    : `${(meeting as Meeting).title} Agenda`;

  const { data: doc, error: docErr } = await supabase.rpc("create_doc", {
    _title: agendaTitle,
    _doc_type: "agenda",
    _storage_path: storagePath,
    _storage_bucket: bucket,
    _mime_type: "application/pdf",
    _size_bytes: pdfBytes.length,
    _visibility: visibility,
    _committee_id: (meeting as Meeting).committee_id,
    _meeting_id: meetingId,
    _description: "Generated agenda PDF",
    _version_of_doc_id: versionRootId,
  });

  if (docErr) {
    return NextResponse.json({ error: docErr.message }, { status: 400 });
  }

  return NextResponse.json({ doc });
}
