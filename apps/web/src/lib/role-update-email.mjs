import { buildTransactionalEmailLayout, escapeHtml } from "./transactional-email-layout.mjs";

export function buildRoleUpdateEmail({ roleLabel, termLabel, note = "" }) {
  const safeNote = note.trim();
  const subject = "ASGC OS role update";
  const noteBlock = safeNote ? `\nNote from admin:\n${safeNote}\n` : "";
  const text =
    `Your ${roleLabel} role (${termLabel}) was revoked in ASGC OS.\n\n` +
    `If you have questions, contact your ASGC admin.` +
    noteBlock;

  return {
    subject,
    text,
    html: buildTransactionalEmailLayout({
      eyebrow: "ASGC OS",
      title: "Role updated",
      detail: "An ASGC admin changed one of your role assignments.",
      bodyHtml:
        `<p style="margin:0 0 8px;"><strong>Role:</strong> ${escapeHtml(roleLabel)}</p>` +
        `<p style="margin:0 0 8px;"><strong>Term:</strong> ${escapeHtml(termLabel)}</p>` +
        (safeNote ? `<p style="margin:0;"><strong>Admin note:</strong> ${escapeHtml(safeNote)}</p>` : ""),
      footerText: "If this looks incorrect, contact your ASGC admin.",
    }),
  };
}
