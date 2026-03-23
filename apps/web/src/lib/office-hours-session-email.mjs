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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMinutes(totalMinutes) {
  const minutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${minutesPart}m`;
}

function buildMetricHtml({ label, value }) {
  return (
    `<div style="min-width:140px;flex:1 1 0;border-radius:20px;background:#f8fafc;padding:16px 18px;">` +
    `<div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;color:#64748b;font-weight:700;">${escapeHtml(label)}</div>` +
    `<div style="margin-top:8px;font-size:16px;line-height:1.5;color:#0f172a;font-weight:600;">${escapeHtml(value)}</div>` +
    `</div>`
  );
}

function buildLayout({ eyebrow, title, detail, ctaHref, ctaLabel, metrics }) {
  const metricsHtml = metrics.map((metric) => buildMetricHtml(metric)).join("");
  return (
    "<!doctype html>" +
    `<html><body style="margin:0;background:#f3f5f8;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">` +
    `<div style="margin:0 auto;max-width:620px;border-radius:28px;background:#ffffff;padding:32px;box-shadow:0 24px 60px rgba(15,23,42,0.12);">` +
    `<div style="font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#64748b;font-weight:700;">${escapeHtml(eyebrow)}</div>` +
    `<h1 style="margin:16px 0 10px;font-size:30px;line-height:1.05;letter-spacing:-0.04em;color:#020617;">${escapeHtml(title)}</h1>` +
    `<p style="margin:0 0 24px;font-size:16px;line-height:1.7;color:#475569;">${escapeHtml(detail)}</p>` +
    `<div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:24px;">${metricsHtml}</div>` +
    `<a href="${escapeHtml(ctaHref)}" style="display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;background:#00685e;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">${escapeHtml(ctaLabel)}</a>` +
    `<p style="margin:18px 0 0;font-size:13px;line-height:1.7;color:#64748b;">Keep your session accurate by checking out when you leave the office.</p>` +
    `</div></body></html>`
  );
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
