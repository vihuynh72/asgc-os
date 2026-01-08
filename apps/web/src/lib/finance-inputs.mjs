export function sanitizeFiscalYearInput(value, { maxDigits = 4 } = {}) {
  const raw = typeof value === "string" ? value : value == null ? "" : String(value);
  const digits = raw.replace(/[^\d]/g, "");
  const safeMaxDigits = Number.isFinite(maxDigits) ? Math.max(1, Math.floor(maxDigits)) : 4;
  return digits.slice(0, safeMaxDigits);
}

export function parseFiscalYearInput(value, { min = 2000 } = {}) {
  const digits = sanitizeFiscalYearInput(value, { maxDigits: 4 });
  if (digits.length !== 4) return null;

  const year = Number.parseInt(digits, 10);
  const safeMin = Number.isFinite(min) ? min : 2000;
  if (!Number.isFinite(year) || year < safeMin) return null;

  return year;
}

