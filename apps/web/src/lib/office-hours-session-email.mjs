import { buildTransactionalEmailLayout, escapeHtml } from "./transactional-email-layout.mjs";

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function safeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${minutesPart}m`;
}

function buildMetricHtml({ label, value }) {
  return (
    `<tr><td style="padding:0 0 14px;">` +
    `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:700;">${escapeHtml(label)}</div>` +
    `<div style="margin-top:6px;font-size:16px;line-height:1.5;color:#0f172a;font-weight:600;">${escapeHtml(value)}</div>` +
    `</td></tr>`
  );
}

function buildLayout({ eyebrow, title, detail, ctaHref, ctaLabel, metrics }) {
  const metricsHtml = metrics.map((metric) => buildMetricHtml(metric)).join("");
  return buildTransactionalEmailLayout({
    eyebrow,
    title,
    detail,
    bodyHtml:
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" bgcolor="#f8fafc" style="margin:0;border-collapse:collapse;border:1px solid #d9e1ec;background-color:#f8fafc;">` +
      `<tr><td style="padding:18px 18px 4px;">` +
      `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="border-collapse:collapse;">${metricsHtml}</table>` +
      `</td></tr></table>`,
    ctaHref,
    ctaLabel,
    footerText: "Keep your session accurate by checking out when you leave the office.",
  });
}

export function buildOfficeHoursSessionEmail({ type, metadata, origin }) {
  const m = typeof metadata === "object" && metadata !== null ? metadata : {};
  const checkinLocal = safeString(m.checkin_at_local);
  const checkoutLocal = safeString(m.checkout_at_local);
  const autoCloseLocal = safeString(m.auto_close_at_local);
  const officeTz = safeString(m.office_tz);
  const elapsedMinutes = safeNumber(m.elapsed_minutes);
  const minutesRemaining = safeNumber(m.minutes_remaining);
  const link = `${origin}/office-hours`;

  if (type === "office_hours.session_checkout_reminder" || type === "office_hours.session_open_long") {
    const elapsed = formatMinutes(elapsedMinutes);
    return {
      subject: "Your office hours session is still open",
      text:
        `Your office hours session is still open.\n\n` +
        `Elapsed time: ${elapsed}\n` +
        `Checked in: ${checkinLocal}${officeTz ? ` (${officeTz})` : ""}\n` +
        `Auto-closes at: ${autoCloseLocal}${officeTz ? ` (${officeTz})` : ""}\n\n` +
        `Open Office Hours: ${link}\n`,
      html: buildLayout({
        eyebrow: "ASGC OS • Office Hours",
        title: "Your session is still running",
        detail: "Check out when you leave so your Office Hours session stays accurate.",
        ctaHref: link,
        ctaLabel: "Open Office Hours",
        metrics: [
          { label: "Elapsed", value: elapsed },
          { label: "Checked in", value: `${checkinLocal}${officeTz ? ` (${officeTz})` : ""}` },
          { label: "Auto-closes", value: `${autoCloseLocal}${officeTz ? ` (${officeTz})` : ""}` },
        ],
      }),
    };
  }

  if (type === "office_hours.session_auto_close_soon") {
    const remaining = `${Math.max(1, Math.round(minutesRemaining || 15))} minutes`;
    return {
      subject: "Your office hours session will auto-close soon",
      text:
        `Your office hours session will auto-close soon.\n\n` +
        `Time remaining: ${remaining}\n` +
        `Checked in: ${checkinLocal}${officeTz ? ` (${officeTz})` : ""}\n` +
        `Auto-closes at: ${autoCloseLocal}${officeTz ? ` (${officeTz})` : ""}\n\n` +
        `Open Office Hours: ${link}\n`,
      html: buildLayout({
        eyebrow: "ASGC OS • Office Hours",
        title: `Auto-close in ${remaining}`,
        detail: "If you are still in the office, keep working. If you already left, check out now before the session closes automatically.",
        ctaHref: link,
        ctaLabel: "Check Out Now",
        metrics: [
          { label: "Time remaining", value: remaining },
          { label: "Checked in", value: `${checkinLocal}${officeTz ? ` (${officeTz})` : ""}` },
          { label: "Auto-closes", value: `${autoCloseLocal}${officeTz ? ` (${officeTz})` : ""}` },
        ],
      }),
    };
  }

  if (type === "office_hours.session_auto_closed") {
    return {
      subject: "Your office hours session was auto-closed",
      text:
        `Your office hours session was auto-closed because it stayed open too long.\n\n` +
        `Checked in: ${checkinLocal}${officeTz ? ` (${officeTz})` : ""}\n` +
        `Auto-closed at: ${checkoutLocal}${officeTz ? ` (${officeTz})` : ""}\n\n` +
        `Open Office Hours: ${link}\n`,
      html: buildLayout({
        eyebrow: "ASGC OS • Office Hours",
        title: "Your session was auto-closed",
        detail: "This session was closed automatically after reaching the maximum allowed duration.",
        ctaHref: link,
        ctaLabel: "Review Office Hours",
        metrics: [
          { label: "Checked in", value: `${checkinLocal}${officeTz ? ` (${officeTz})` : ""}` },
          { label: "Auto-closed", value: `${checkoutLocal}${officeTz ? ` (${officeTz})` : ""}` },
        ],
      }),
    };
  }

  throw new Error(`Unsupported office hours session email type: ${type}`);
}
