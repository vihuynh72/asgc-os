export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export function normalizeEligibilityReasons(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.filter((v) => typeof v === "string") as string[];
  }
  return [];
}

export const ELIGIBILITY_REASON_LABELS: Record<string, string> = {
  min_members: "Minimum members not met",
  benefit_cards: "Benefit card threshold not met",
  charter_checklist: "Charter checklist incomplete",
  not_chartered: "Club not chartered",
  constitution_missing: "Constitution missing",
};
