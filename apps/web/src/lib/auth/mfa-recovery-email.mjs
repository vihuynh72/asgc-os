import { buildTransactionalEmailLayout } from "../transactional-email-layout.mjs";

/**
 * @param {{ recoveryLink: string; emailOtp?: string | null }} input
 */
export function buildMfaRecoveryEmail({ recoveryLink, emailOtp = null }) {
  const subject = "ASGC OS: recover access (reset 2FA)";
  const otpLine = emailOtp ? `\nOr use this one-time code:\n${emailOtp}\n` : "";
  const text =
    `You requested to recover access to ASGC OS.\n\n` +
    `Open this link to continue:\n${recoveryLink}\n${otpLine}\n` +
    `If you did not request this email, you can ignore it.`;

  return {
    subject,
    text,
    html: buildTransactionalEmailLayout({
      eyebrow: "ASGC OS",
      title: "Recover access",
      detail: "Use the secure recovery link or the one-time code to reset two-factor access.",
      bodyHtml:
        (emailOtp
          ? `<p style="margin:0 0 12px;"><strong>One-time code:</strong> ${emailOtp}</p>`
          : "") + `<p style="margin:0;">This request clears your current two-factor setup after you confirm email ownership.</p>`,
      ctaHref: recoveryLink,
      ctaLabel: "Recover access",
      footerText: "If you did not request this email, you can ignore it.",
    }),
  };
}
