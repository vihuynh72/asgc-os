import { buildOfficeHoursSessionEmail } from "./office-hours-session-email.mjs";
import { buildTransactionalEmailLayout, escapeHtml } from "./transactional-email-layout.mjs";

function safeString(value) {
  return typeof value === "string" ? value : "";
}

function safeNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function formatMinutes(totalMinutes) {
  if (totalMinutes === null) return "n/a";
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${hoursPart}h ${minutesPart}m`;
}

function buildGenericOfficeHoursEmail({ title, detail, bodyHtml, ctaLabel, origin }) {
  return buildTransactionalEmailLayout({
    eyebrow: "ASGC OS • Office Hours",
    title,
    detail,
    bodyHtml,
    ctaHref: `${origin}/office-hours`,
    ctaLabel,
    footerText: "Open Office Hours to review the latest status.",
  });
}

export function buildOfficeHoursNotificationEmail({ type, metadata, origin }) {
  const m = typeof metadata === "object" && metadata !== null ? metadata : {};
  const startsLocal = safeString(m.starts_at_local);
  const endsLocal = safeString(m.ends_at_local);
  const tz = safeString(m.office_tz);
  const weekStart = safeString(m.week_start);
  const weekEnd = safeString(m.week_end);
  const totalMinutes = safeNumber(m.total_minutes);
  const deficitMinutes = safeNumber(m.deficit_minutes);
  const requiredTotalMinutes = safeNumber(m.required_total_minutes);

  if (
    type === "office_hours.session_open_long" ||
    type === "office_hours.session_checkout_reminder" ||
    type === "office_hours.session_auto_close_soon" ||
    type === "office_hours.session_auto_closed"
  ) {
    return buildOfficeHoursSessionEmail({ type, metadata, origin });
  }

  if (type === "office_hours.weekly_hours_reminder") {
    const weekRange =
      weekStart && weekEnd ? `Week of ${weekStart} through ${weekEnd}` : weekStart ? `Week of ${weekStart}` : "This week";
    return {
      subject: "Office hours reminder: hours remaining this week",
      text:
        `Office hours reminder.\n\n${weekRange}\n` +
        `Required total: ${formatMinutes(requiredTotalMinutes)}\n` +
        `Completed total: ${formatMinutes(totalMinutes)}\n` +
        `Remaining total: ${formatMinutes(deficitMinutes)}\n\n` +
        `Open Office Hours: ${origin}/office-hours\n`,
      html: buildGenericOfficeHoursEmail({
        title: "Hours remaining this week",
        detail: "A quick snapshot of your Office Hours progress for the current week.",
        bodyHtml:
          `<p style="margin:0 0 8px;"><strong>Week:</strong> ${escapeHtml(weekRange)}</p>` +
          `<p style="margin:0 0 8px;"><strong>Required:</strong> ${escapeHtml(formatMinutes(requiredTotalMinutes))}</p>` +
          `<p style="margin:0 0 8px;"><strong>Completed:</strong> ${escapeHtml(formatMinutes(totalMinutes))}</p>` +
          `<p style="margin:0;"><strong>Remaining:</strong> ${escapeHtml(formatMinutes(deficitMinutes))}</p>`,
        ctaLabel: "Open Office Hours",
        origin,
      }),
    };
  }

  if (type === "office_hours.shift_start_soon") {
    return {
      subject: "Office hours shift starts soon",
      text: `Your office hours shift starts soon.\n\nStart: ${startsLocal}${tz ? ` (${tz})` : ""}\nEnd: ${endsLocal}${tz ? ` (${tz})` : ""}\n\nOpen Office Hours: ${origin}/office-hours\n`,
      html: buildGenericOfficeHoursEmail({
        title: "Your shift starts soon",
        detail: "A quick reminder before your Office Hours shift begins.",
        bodyHtml:
          `<p style="margin:0 0 8px;"><strong>Start:</strong> ${escapeHtml(startsLocal)}${tz ? ` (${escapeHtml(tz)})` : ""}</p>` +
          `<p style="margin:0;"><strong>End:</strong> ${escapeHtml(endsLocal)}${tz ? ` (${escapeHtml(tz)})` : ""}</p>`,
        ctaLabel: "Open Office Hours",
        origin,
      }),
    };
  }

  if (type === "office_hours.shift_late") {
    return {
      subject: "You are late to your office hours shift",
      text: `You are late to your office hours shift.\n\nStart: ${startsLocal}${tz ? ` (${tz})` : ""}\nEnd: ${endsLocal}${tz ? ` (${tz})` : ""}\n\nOpen Office Hours: ${origin}/office-hours\n`,
      html: buildGenericOfficeHoursEmail({
        title: "You are late to your shift",
        detail: "Your Office Hours shift has already started.",
        bodyHtml:
          `<p style="margin:0 0 8px;"><strong>Start:</strong> ${escapeHtml(startsLocal)}${tz ? ` (${escapeHtml(tz)})` : ""}</p>` +
          `<p style="margin:0;"><strong>End:</strong> ${escapeHtml(endsLocal)}${tz ? ` (${escapeHtml(tz)})` : ""}</p>`,
        ctaLabel: "Open Office Hours",
        origin,
      }),
    };
  }

  if (type === "office_hours.shift_missed") {
    return {
      subject: "You missed your office hours shift",
      text: `You missed your office hours shift.\n\nStart: ${startsLocal}${tz ? ` (${tz})` : ""}\nEnd: ${endsLocal}${tz ? ` (${tz})` : ""}\n\nOpen Office Hours: ${origin}/office-hours\n`,
      html: buildGenericOfficeHoursEmail({
        title: "You missed your shift",
        detail: "This scheduled Office Hours shift ended without a completed session.",
        bodyHtml:
          `<p style="margin:0 0 8px;"><strong>Start:</strong> ${escapeHtml(startsLocal)}${tz ? ` (${escapeHtml(tz)})` : ""}</p>` +
          `<p style="margin:0;"><strong>End:</strong> ${escapeHtml(endsLocal)}${tz ? ` (${escapeHtml(tz)})` : ""}</p>`,
        ctaLabel: "Review Office Hours",
        origin,
      }),
    };
  }

  if (type === "office_hours.coverage_requested") {
    return {
      subject: "Office hours coverage needed",
      text: `A colleague is requesting coverage for their shift.\n\nShift: ${startsLocal} – ${endsLocal}${tz ? ` (${tz})` : ""}\n\nIf you are available, you can claim this shift.\n\nOpen Office Hours: ${origin}/office-hours\n`,
      html: buildGenericOfficeHoursEmail({
        title: "Coverage needed",
        detail: "A colleague requested help covering an upcoming Office Hours shift.",
        bodyHtml: `<p style="margin:0;"><strong>Shift:</strong> ${escapeHtml(startsLocal)} – ${escapeHtml(endsLocal)}${tz ? ` (${escapeHtml(tz)})` : ""}</p>`,
        ctaLabel: "Open Office Hours",
        origin,
      }),
    };
  }

  if (type === "office_hours.coverage_claimed") {
    return {
      subject: "Your shift coverage was claimed",
      text: `Good news! Someone has claimed your coverage request.\n\nShift: ${startsLocal} – ${endsLocal}${tz ? ` (${tz})` : ""}\n\nOpen Office Hours: ${origin}/office-hours\n`,
      html: buildGenericOfficeHoursEmail({
        title: "Coverage was claimed",
        detail: "Your Office Hours coverage request has been picked up.",
        bodyHtml: `<p style="margin:0;"><strong>Shift:</strong> ${escapeHtml(startsLocal)} – ${escapeHtml(endsLocal)}${tz ? ` (${escapeHtml(tz)})` : ""}</p>`,
        ctaLabel: "Open Office Hours",
        origin,
      }),
    };
  }

  return {
    subject: "Office hours notification",
    text: `You have a new office hours notification.\n\nOpen Office Hours: ${origin}/office-hours\n`,
    html: buildGenericOfficeHoursEmail({
      title: "Office Hours notification",
      detail: "You have a new Office Hours update waiting.",
      bodyHtml: `<p style="margin:0;">Open Office Hours to review the latest status.</p>`,
      ctaLabel: "Open Office Hours",
      origin,
    }),
  };
}
