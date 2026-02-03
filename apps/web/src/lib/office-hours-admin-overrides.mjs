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
