import { hashLoginEmailChallengeCode } from "./password-signin.mjs";
import { buildTransactionalEmailLayout, escapeHtml } from "../transactional-email-layout.mjs";

export const AUTH_CODE_EMAIL_BRAND = "ASGC OS";
export const AUTH_CODE_EMAIL_TTL_MINUTES = 10;
export const PASSWORD_SIGNIN_CHALLENGE_KIND = "password_signin";
export const FIRST_TIME_SIGNIN_CHALLENGE_KIND = "first_time_signin";

function emailCopyForKind(kind) {
  if (kind === PASSWORD_SIGNIN_CHALLENGE_KIND) {
    return {
      subject: `${AUTH_CODE_EMAIL_BRAND} sign-in code`,
      title: "Verify this browser",
      detail: "Enter this code to finish signing in on this browser.",
    };
  }

  return {
    subject: `${AUTH_CODE_EMAIL_BRAND} sign-in code`,
    title: "Finish your first sign-in",
    detail: "Use this six-digit code to verify your campus email and continue.",
  };
}

function buildCodePanel(code) {
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#f8fafc" style="margin:16px 0 0;border-collapse:collapse;border:1px solid #d9e1ec;background-color:#f8fafc;">` +
    `<tr><td align="center" style="padding:22px 16px;">` +
    `<div style="font-size:12px;line-height:18px;letter-spacing:0.2em;text-transform:uppercase;color:#64748b;font-weight:700;">One-time code</div>` +
    `<div style="margin-top:10px;font-size:40px;line-height:1.1;font-weight:700;color:#0f172a;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(code)}</div>` +
    `</td></tr>` +
    `</table>`
  );
}

export function buildAuthCodeEmail({ kind, code, expiresInMinutes }) {
  const copy = emailCopyForKind(kind);
  const safeExpires = escapeHtml(expiresInMinutes);
  const preheader = `Your ASGC OS sign-in code is ${code}. It expires in ${expiresInMinutes} minutes.`;

  return {
    subject: copy.subject,
    text:
      `${copy.title}\n\n` +
      `Your ASGC OS sign-in code is ${code}.\n` +
      `${copy.detail}\n\n` +
      `Expires in ${expiresInMinutes} minutes.\n\n` +
      `If you did not request this code, you can ignore this email.`,
    html: buildTransactionalEmailLayout({
      eyebrow: AUTH_CODE_EMAIL_BRAND,
      title: copy.title,
      detail: copy.detail,
      bodyHtml:
        `<p style="margin:0 0 12px;">Your ${AUTH_CODE_EMAIL_BRAND} sign-in code is <strong style="white-space:nowrap;">${escapeHtml(code)}</strong>.</p>` +
        `${buildCodePanel(code)}` +
        `<p style="margin:18px 0 0;">Expires in ${safeExpires} minutes. If you did not request this code, you can ignore this email.</p>`,
      footerText: "For security, never share this code with anyone.",
      preheader,
    }),
  };
}

export function buildFirstTimeSignInChallengeInsert({
  challengeId,
  userId,
  email,
  code,
  redirectTo,
  requestIp,
  userAgent,
  expiresAt,
  supabaseTokenHash,
  supabaseVerificationType,
  secret,
}) {
  return {
    id: challengeId,
    user_id: userId,
    email,
    challenge_kind: FIRST_TIME_SIGNIN_CHALLENGE_KIND,
    code_hash: hashLoginEmailChallengeCode({
      challengeId,
      code,
      secret,
    }),
    redirect_to: redirectTo,
    request_ip: requestIp,
    user_agent: userAgent,
    expires_at: expiresAt,
    supabase_token_hash: supabaseTokenHash,
    supabase_verification_type: supabaseVerificationType,
  };
}
