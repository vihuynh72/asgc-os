function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return false;
  if (year < 1000 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;

  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export function todayDateString(): string {
  const d = new Date();
  const y = String(d.getFullYear());
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Attempts to normalize user input or query params into a `YYYY-MM-DD` date-only string.
 * Accepts: `YYYY-MM-DD`, `YYYY-M-D`, ISO timestamps like `YYYY-MM-DDTHH:MM:SSZ`, and US-style `MM/DD/YYYY`.
 */
export function normalizeDateOnlyString(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const s = raw.trim();
  if (!s) return null;

  const ymd = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})(?:$|[T\s])/u.exec(`${s} `);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return `${ymd[1]}-${pad2(month)}-${pad2(day)}`;
  }

  const mdy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/u.exec(s);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (!isValidDateParts(year, month, day)) return null;
    return `${mdy[3]}-${pad2(month)}-${pad2(day)}`;
  }

  return null;
}

export function parseDateUtcNoon(dateStr: string): Date | null {
  const iso = normalizeDateOnlyString(dateStr);
  if (!iso) return null;
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDaysDateOnly(dateStr: string, days: number): string | null {
  const d = parseDateUtcNoon(dateStr);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateUtc(d);
}

export function startOfWeekMondayDateOnly(dateStr: string): string | null {
  const d = parseDateUtcNoon(dateStr);
  if (!d) return null;
  const day = d.getUTCDay(); // 0=Sun
  const daysSinceMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return formatDateUtc(d);
}

