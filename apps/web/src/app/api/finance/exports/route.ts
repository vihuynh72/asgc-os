import { PDFDocument, StandardFonts } from "pdf-lib";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSupabaseAdminClient } from "@/lib/supabaseAdmin";

import { requireFinanceAdmin } from "../finance-auth";

export const runtime = "nodejs";

const ExportSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
});

type BudgetLine = {
  id: string;
  name: string;
  category: string;
  fiscal_year: number;
};

type Expense = {
  id: string;
  budget_line_id: string;
  payee: string;
  description: string | null;
  amount: number;
  purchased_at: string;
  status: string;
};

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function formatAmount(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function buildCsv(expenses: Expense[], budgetLineMap: Map<string, BudgetLine>) {
  const lines = [
    ["Date", "Payee", "Description", "Amount", "Status", "Budget Line"].join(","),
  ];

  for (const expense of expenses) {
    const budgetLine = budgetLineMap.get(expense.budget_line_id);
    const row = [
      formatDate(expense.purchased_at),
      expense.payee.replace(/"/g, '""'),
      (expense.description ?? "").replace(/"/g, '""'),
      expense.amount.toFixed(2),
      expense.status,
      budgetLine ? budgetLine.name.replace(/"/g, '""') : "",
    ].map((value) => `"${value}"`);

    lines.push(row.join(","));
  }

  return lines.join("\n");
}

async function buildPdf(month: string, expenses: Expense[], budgetLineMap: Map<string, BudgetLine>) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pageSize: [number, number] = [612, 792];
  const margin = 48;
  const lineGap = 4;
  const maxWidth = pageSize[0] - margin * 2;

  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;

  const drawLine = (text: string, size = 12, bold = false) => {
    const activeFont = bold ? fontBold : font;
    if (y < margin + size) {
      page = pdf.addPage(pageSize);
      y = pageSize[1] - margin;
    }
    page.drawText(text, { x: margin, y, size, font: activeFont });
    y -= size + lineGap;
  };

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  drawLine("Finance Export", 18, true);
  drawLine(`Month: ${month}`, 12, false);
  drawLine(`Total spent: ${formatAmount(total)}`, 12, false);
  y -= 8;

  if (expenses.length === 0) {
    drawLine("No expenses recorded for this period.", 12, false);
  } else {
    const sorted = [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 25);
    drawLine("Top expenses", 12, true);
    for (const expense of sorted) {
      const budgetLine = budgetLineMap.get(expense.budget_line_id);
      const label = `${formatDate(expense.purchased_at)} - ${expense.payee} - ${formatAmount(expense.amount)}`;
      drawLine(label, 10, false);
      if (expense.description) {
        const description = `Description: ${expense.description}`;
        const words = description.replace(/\s+/g, " ").trim().split(" ");
        let line = "";
        for (const word of words) {
          const next = line ? `${line} ${word}` : word;
          if (font.widthOfTextAtSize(next, 10) > maxWidth && line) {
            drawLine(line, 10, false);
            line = word;
          } else {
            line = next;
          }
        }
        if (line) drawLine(line, 10, false);
      }
      if (budgetLine) {
        drawLine(`Budget line: ${budgetLine.name}`, 10, false);
      }
      y -= 4;
    }
  }

  return pdf.save();
}

export async function POST(request: NextRequest) {
  const authResult = await requireFinanceAdmin(request);
  if (!authResult.ok) return authResult.response;

  const parsed = ExportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { month } = parsed.data;
  const start = new Date(`${month}-01T00:00:00.000Z`);
  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({ error: "invalid_month" }, { status: 400 });
  }
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const admin = getSupabaseAdminClient();

  const [{ data: expenses, error: expenseErr }, { data: budgetLines, error: budgetErr }] =
    await Promise.all([
      admin
        .from("expenses")
        .select("id,budget_line_id,payee,description,amount,purchased_at,status")
        .gte("purchased_at", start.toISOString())
        .lt("purchased_at", end.toISOString())
        .order("purchased_at", { ascending: false }),
      admin
        .from("budget_lines")
        .select("id,name,category,fiscal_year")
        .order("name", { ascending: true }),
    ]);

  if (expenseErr || budgetErr) {
    return NextResponse.json({ error: expenseErr?.message ?? budgetErr?.message ?? "query_failed" }, { status: 500 });
  }

  const budgetLineMap = new Map(
    (budgetLines ?? []).map((line) => [line.id, line as BudgetLine]),
  );

  const expenseRows = (expenses ?? []) as Expense[];
  const csv = buildCsv(expenseRows, budgetLineMap);
  const pdfBytes = await buildPdf(month, expenseRows, budgetLineMap);

  const timestamp = Date.now();
  const basePath = `finance/exports/${month}/${timestamp}`;
  const bucket = "documents";

  const pdfPath = `${basePath}.pdf`;
  const csvPath = `${basePath}.csv`;

  const pdfUpload = await admin.storage.from(bucket).upload(pdfPath, Buffer.from(pdfBytes), {
    contentType: "application/pdf",
    upsert: false,
  });

  if (pdfUpload.error) {
    return NextResponse.json({ error: pdfUpload.error.message }, { status: 500 });
  }

  const csvUpload = await admin.storage.from(bucket).upload(csvPath, Buffer.from(csv), {
    contentType: "text/csv",
    upsert: false,
  });

  if (csvUpload.error) {
    await admin.storage.from(bucket).remove([pdfPath]);
    return NextResponse.json({ error: csvUpload.error.message }, { status: 500 });
  }

  const actorId = authResult.auth.userId;

  const { data: pdfDoc, error: pdfDocErr } = await admin
    .from("docs")
    .insert({
      doc_type: "finance_export",
      title: `Finance Export ${month} (PDF)`,
      storage_path: pdfPath,
      storage_bucket: bucket,
      mime_type: "application/pdf",
      size_bytes: pdfBytes.length,
      uploaded_by: actorId,
      visibility: "restricted",
      description: `Monthly finance export for ${month}`,
    })
    .select("id,storage_path,storage_bucket")
    .single();

  if (pdfDocErr) {
    await admin.storage.from(bucket).remove([pdfPath, csvPath]);
    return NextResponse.json({ error: pdfDocErr.message }, { status: 500 });
  }

  const { data: csvDoc, error: csvDocErr } = await admin
    .from("docs")
    .insert({
      doc_type: "finance_export",
      title: `Finance Export ${month} (CSV)`,
      storage_path: csvPath,
      storage_bucket: bucket,
      mime_type: "text/csv",
      size_bytes: csv.length,
      uploaded_by: actorId,
      visibility: "restricted",
      description: `Monthly finance export for ${month}`,
    })
    .select("id,storage_path,storage_bucket")
    .single();

  if (csvDocErr) {
    await admin.from("docs").delete().eq("id", pdfDoc.id);
    await admin.storage.from(bucket).remove([pdfPath, csvPath]);
    return NextResponse.json({ error: csvDocErr.message }, { status: 500 });
  }

  await admin.rpc("log_event", {
    action_key: "finance.export.generated",
    actor_user_id: actorId,
    target_type: "finance_export",
    target_id: pdfDoc.id,
    metadata: { month, pdf_doc_id: pdfDoc.id, csv_doc_id: csvDoc.id },
  });

  return NextResponse.json({ pdfDoc, csvDoc });
}
