import { buildTransactionalEmailLayout } from "../transactional-email-layout.mjs";

export function buildPasswordResetEmail({ resetLink }) {
  const subject = "ASGC OS password reset";
  const text =
    `Reset your ASGC OS password.\n\n` +
    `Open this link to continue:\n${resetLink}\n\n` +
    `If you did not request this email, you can ignore it.`;

  return {
    subject,
    text,
    html: buildTransactionalEmailLayout({
      eyebrow: "ASGC OS",
      title: "Reset your password",
      detail: "Use the secure link below to continue resetting your ASGC OS password.",
      bodyHtml: `<p style="margin:0;">This link routes you back into ASGC OS and expires automatically.</p>`,
      ctaHref: resetLink,
      ctaLabel: "Reset password",
      footerText: "If you did not request this email, you can ignore it.",
      preheader: `Reset your ASGC OS password using the secure link: ${resetLink}`,
    }),
  };
}
