import { buildTransactionalEmailLayout, escapeHtml } from "./transactional-email-layout.mjs";

export function validateAdminCheckoutAt({ checkinAtIso, checkoutAtIso, nowIso }) {
  const checkinMs = Date.parse(checkinAtIso);
  const checkoutMs = Date.parse(checkoutAtIso);
  const nowMs = Date.parse(nowIso);

  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs) || !Number.isFinite(nowMs)) {
    return { ok: false, error: "invalid_timestamp" };
  }
  if (checkoutMs < checkinMs) return { ok: false, error: "before_checkin" };
  if (checkoutMs > nowMs) return { ok: false, error: "after_now" };
  return { ok: true };
}

export function computeAdminOverrideMinutes(checkinAtIso, checkoutAtIso) {
  const checkinMs = Date.parse(checkinAtIso);
  const checkoutMs = Date.parse(checkoutAtIso);
  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs)) return 0;
  return Math.max(Math.round((checkoutMs - checkinMs) / 60000), 0);
}

export function buildAdminOverrideNotification({ memberName, checkoutAtIso, excludeFromTotals, reason }) {
  const labelName = memberName?.trim() ? `Hi ${memberName.trim()},` : "Hello,";
  const checkoutLabel = checkoutAtIso ? new Date(checkoutAtIso).toISOString() : "the updated time";
  const excludeLabel = excludeFromTotals ? "yes" : "no";

  return {
    subject: "Office hours updated",
    text: `${labelName}\n\nAn admin updated your office hours session.\n\nCheckout time: ${checkoutLabel}\nExcluded from totals: ${excludeLabel}\nReason: ${reason}\n\nIf this looks incorrect, please contact an admin.\n`,
    html: buildTransactionalEmailLayout({
      eyebrow: "ASGC OS • Office Hours",
      title: "Your session was updated",
      detail: "An admin adjusted one of your Office Hours sessions.",
      bodyHtml:
        `<p style="margin:0 0 8px;"><strong>Checkout time:</strong> ${escapeHtml(checkoutLabel)}</p>` +
        `<p style="margin:0 0 8px;"><strong>Excluded from totals:</strong> ${escapeHtml(excludeLabel)}</p>` +
        `<p style="margin:0;"><strong>Reason:</strong> ${escapeHtml(reason)}</p>`,
      footerText: "If this looks incorrect, please contact an ASGC admin.",
    }),
  };
}
