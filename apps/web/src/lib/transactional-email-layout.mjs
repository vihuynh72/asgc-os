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
  return (
    "<!doctype html>" +
    `<html lang="en"><head>` +
    `<meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="light">` +
    `<meta name="supported-color-schemes" content="light">` +
    `<title>${escapeHtml(title)}</title>` +
    `</head><body style="margin:0;background:#f6f7fb;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader || detail || title)}</div>` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;background:#f6f7fb;">` +
    `<tr><td align="center" style="padding:0;">` +
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:600px;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-radius:28px;">` +
    `<tr><td style="padding:32px 28px 30px;">` +
    `<div style="font-size:12px;letter-spacing:0.22em;text-transform:uppercase;color:#64748b;font-weight:700;">${escapeHtml(eyebrow)}</div>` +
    `<h1 style="margin:16px 0 10px;font-size:30px;line-height:1.05;letter-spacing:-0.04em;color:#020617;">${escapeHtml(title)}</h1>` +
    `<p style="margin:0 0 20px;font-size:16px;line-height:1.7;color:#475569;">${escapeHtml(detail)}</p>` +
    `<div style="font-size:15px;line-height:1.8;color:#334155;">${bodyHtml}</div>` +
    (ctaHref && ctaLabel
      ? `<div style="margin-top:24px;"><a href="${escapeHtml(ctaHref)}" style="display:inline-flex;min-height:48px;align-items:center;justify-content:center;padding:0 20px;border-radius:999px;background:#00685e;color:#ffffff;text-decoration:none;font-weight:700;">${escapeHtml(ctaLabel)}</a></div>`
      : "") +
    (footerText
      ? `<p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#64748b;">${escapeHtml(footerText)}</p>`
      : "") +
    `</td></tr>` +
    `</table>` +
    `</td></tr>` +
    `</table>` +
    `</body></html>`
  );
}
