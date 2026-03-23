import { hashLoginEmailChallengeCode } from "./password-signin.mjs";

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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildCodeCell(value) {
  return (
    `<td style="width:56px;padding:0 4px 0 0;">` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:separate;border-spacing:0;">` +
    `<tr>` +
    `<td style="height:64px;border:1px solid #d7dde8;border-radius:18px;background:#ffffff;text-align:center;font-size:34px;line-height:34px;font-weight:700;color:#0f172a;font-variant-numeric:tabular-nums;white-space:nowrap;">${escapeHtml(value)}</td>` +
    `</tr>` +
    `</table>` +
    `</td>`
  );
}

function buildCodeRow(code) {
  const digits = String(code).trim().slice(0, 6).split("");
  const cells = digits.map((digit, index) => {
    const gap = index === 2 ? `<td style="width:10px;font-size:0;line-height:0;">&nbsp;</td>` : "";
    return `${buildCodeCell(digit)}${gap}`;
  });

  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:16px auto 0;border-collapse:collapse;white-space:nowrap;">` +
    `<tr>${cells.join("")}</tr>` +
    `</table>`
  );
}

export function buildAuthCodeEmail({ kind, code, expiresInMinutes }) {
  const copy = emailCopyForKind(kind);
  const safeExpires = escapeHtml(expiresInMinutes);
  const safeTitle = escapeHtml(copy.title);
  const safeDetail = escapeHtml(copy.detail);
  const preheader = escapeHtml(`${copy.title}. This six-digit code expires in ${expiresInMinutes} minutes.`);
  const codeRow = buildCodeRow(code);

  return {
    subject: copy.subject,
    text:
      `${copy.title}\n\n` +
      `${copy.detail}\n\n` +
      `Code: ${code}\n` +
      `Expires in ${expiresInMinutes} minutes.\n\n` +
      `If you did not request this code, you can ignore this email.`,
    html:
      "<!doctype html>" +
      `<html lang="en"><head>` +
      `<meta charset="utf-8">` +
      `<meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<meta name="color-scheme" content="light">` +
      `<meta name="supported-color-schemes" content="light">` +
      `<title>${safeTitle}</title>` +
      `</head><body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">` +
      `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>` +
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;background:#ffffff;">` +
      `<tr><td align="center" style="padding:24px 16px;">` +
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:560px;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;">` +
      `<tr><td style="padding:32px 28px 30px;">` +
      `<div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#64748b;font-weight:700;">${AUTH_CODE_EMAIL_BRAND}</div>` +
      `<h1 style="margin:16px 0 10px;font-size:30px;line-height:1.05;letter-spacing:-0.04em;color:#020617;">${safeTitle}</h1>` +
      `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#475569;">${safeDetail}</p>` +
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;border-radius:24px;background:#f8fafc;border:1px solid #e2e8f0;">` +
      `<tr><td align="center" style="padding:24px 18px;">` +
      `<div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#64748b;font-weight:700;">One-time code</div>` +
      `${codeRow}` +
      `</td></tr>` +
      `</table>` +
      `<p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#475569;">Expires in ${safeExpires} minutes. If you did not request this code, you can ignore this email.</p>` +
      `</td></tr>` +
      `</table>` +
      `</td></tr>` +
      `</table>` +
      `</body></html>`,
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
