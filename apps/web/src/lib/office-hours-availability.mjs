function assertArray(value, err) {
  if (!Array.isArray(value)) throw new Error(err);
}

function toFiniteInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const next = Math.floor(value);
  return Number.isFinite(next) ? next : null;
}

export function normalizeOfficeHoursAllowedWeekdays(value) {
  assertArray(value, "invalid_weekdays");

  const unique = new Set();
  for (const raw of value) {
    const next = toFiniteInt(raw);
    if (next === null || next < 1 || next > 7) throw new Error("invalid_weekdays");
    unique.add(next);
  }

  const sorted = Array.from(unique).sort((a, b) => a - b);
  if (sorted.length === 0) throw new Error("invalid_weekdays");
  return sorted;
}

function isValidIsoDateString(s) {
  if (typeof s !== "string") return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map((p) => Number(p));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;

  const dt = new Date(Date.UTC(y, m - 1, d));
  if (!Number.isFinite(dt.getTime())) return false;
  const roundTrip = dt.toISOString().slice(0, 10);
  return roundTrip === s;
}

export function normalizeOfficeHoursExtraAllowedDates(value) {
  assertArray(value, "invalid_dates");

  const unique = new Set();
  for (const raw of value) {
    if (!isValidIsoDateString(raw)) throw new Error("invalid_dates");
    unique.add(raw);
  }

  return Array.from(unique).sort();
}

