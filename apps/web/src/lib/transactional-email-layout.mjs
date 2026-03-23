function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export { escapeHtml };

export function buildTransactionalEmailLayout({
  eyebrow,
  title,
  detail,
  bodyHtml,
  ctaHref,
  ctaLabel,
  footerText,
  preheader,
}) {
  const safeEyebrow = escapeHtml(eyebrow);
  const safeTitle = escapeHtml(title);
  const safeDetail = escapeHtml(detail);
  const safePreheader = escapeHtml(preheader || detail || title);
  const safeFooterText = footerText ? escapeHtml(footerText) : "";
  const safeCtaHref = ctaHref ? escapeHtml(ctaHref) : "";
  const safeCtaLabel = ctaLabel ? escapeHtml(ctaLabel) : "";

  return (
    "<!doctype html>" +
    `<html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta http-equiv="x-ua-compatible" content="ie=edge">` +
    `<meta name="x-apple-disable-message-reformatting">` +
    `<meta name="color-scheme" content="light">` +
    `<meta name="supported-color-schemes" content="light">` +
    `<title>${safeTitle}</title>` +
    `</head><body bgcolor="#f5f7fa" style="margin:0;padding:0;background-color:#f5f7fa;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${safePreheader}</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#f5f7fa" style="border-collapse:collapse;background-color:#f5f7fa;">` +
    `<tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#ffffff" style="max-width:600px;border-collapse:separate;background-color:#ffffff;border:1px solid #d9e1ec;">` +
    `<tr><td style="padding:32px 28px 30px;">` +
    `<div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;font-weight:700;">${safeEyebrow}</div>` +
    `<h1 style="margin:16px 0 10px;font-size:30px;line-height:1.1;letter-spacing:-0.03em;color:#020617;">${safeTitle}</h1>` +
    `<p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#475569;">${safeDetail}</p>` +
    `<div style="font-size:15px;line-height:1.8;color:#334155;">${bodyHtml}</div>` +
    (ctaHref && ctaLabel
      ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:24px;border-collapse:collapse;"><tr><td bgcolor="#00685e" style="background-color:#00685e;border-radius:999px;"><a href="${safeCtaHref}" style="display:inline-block;padding:14px 22px;border-radius:999px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">${safeCtaLabel}</a></td></tr></table>` +
        `<p style="margin:14px 0 0;font-size:12px;line-height:1.7;color:#64748b;">If the button does not open properly, copy and paste this link into your browser:</p>` +
        `<p style="margin:8px 0 0;font-size:12px;line-height:1.7;color:#0f172a;word-break:break-all;">${safeCtaHref}</p>`
      : "") +
    (footerText
      ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#64748b;">${safeFooterText}</p>`
      : "") +
    `</td></tr>` +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`
  );
}
