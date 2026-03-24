"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { Button } from "@/components/ui/button";
import type { OfficeHourRequirementRow, TermRow } from "@/lib/admin/server";

import { OfficeHoursSectionNav } from "./office-hours-section-nav";

const ROLE_ROWS = [
  { key: "advisor", label: "Advisor" },
  { key: "president", label: "President" },
  { key: "executive", label: "Executive" },
  { key: "board_member", label: "Board member" },
  { key: "volunteer", label: "Volunteer" },
] as const;

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

function buildHoursMap(rows: OfficeHourRequirementRow[]) {
  const next = new Map<string, number>();
  for (const row of rows) {
    next.set(row.role_key, row.weekly_total_hours);
  }
  return next;
}

export function OfficeHoursRequirementsPanel({
  terms,
  initialSelectedTermId,
  initialRequirements,
}: {
  terms: TermRow[];
  initialSelectedTermId: string;
  initialRequirements: OfficeHourRequirementRow[];
}) {
  const [termId, setTermId] = useState(initialSelectedTermId);
  const [hoursByRole, setHoursByRole] = useState(() => buildHoursMap(initialRequirements));
  const [feedback, setFeedback] = useState<{ tone: "positive" | "warning"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selectedTerm = useMemo(() => terms.find((term) => term.id === termId) ?? null, [termId, terms]);

  async function loadRequirements(nextTermId: string) {
    setLoading(true);
    setFeedback(null);
    try {
      const { requirements } = await fetchJson<{ requirements: OfficeHourRequirementRow[] }>(
        `/api/admin/office-hour-requirements?termId=${encodeURIComponent(nextTermId)}`,
      );
      setHoursByRole(buildHoursMap(requirements));
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not load requirements." });
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      await fetchJson("/api/admin/office-hour-requirements", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          termId,
          requirements: ROLE_ROWS.map((role) => ({
            roleKey: role.key,
            weeklyTotalHours: Number(hoursByRole.get(role.key) ?? 0),
          })),
        }),
      });
      setFeedback({ tone: "positive", message: `Saved weekly requirements for ${selectedTerm?.name ?? "the selected term"}.` });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not save requirements." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <OfficeHoursSectionNav activeId="requirements" />

      {feedback ? <AdminInlineNotice tone={feedback.tone}>{feedback.message}</AdminInlineNotice> : null}

      <form className="max-w-sm space-y-6" onSubmit={handleSave}>
        {/* Term selector */}
        <div className="flex items-center gap-3">
          <select
            className="h-9 rounded-xl border border-[var(--admin-border-soft)] bg-white px-3 text-sm text-foreground"
            value={termId}
            onChange={async (event) => {
              const nextTermId = event.target.value;
              setTermId(nextTermId);
              await loadRequirements(nextTermId);
            }}
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>{term.name}</option>
            ))}
          </select>
          {loading && <span className="text-xs text-foreground/45">Loading…</span>}
        </div>

        {/* Role hours table */}
        <div className="rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-white overflow-hidden">
          <div className="border-b px-4 py-2.5 text-[0.68rem] font-semibold uppercase tracking-wider text-foreground/40 grid grid-cols-[1fr_8rem]">
            <span>Role</span>
            <span>Hours / week</span>
          </div>
          <div className="divide-y divide-[var(--admin-border-soft)]">
            {ROLE_ROWS.map((role) => (
              <div key={role.key} className="grid grid-cols-[1fr_8rem] items-center px-4 py-3">
                <span className="text-sm font-medium text-foreground">{role.label}</span>
                <input
                  type="number"
                  min={0}
                  className="h-9 w-full rounded-xl border border-[var(--admin-border-soft)] bg-foreground/[0.02] px-3 text-sm text-foreground"
                  value={hoursByRole.get(role.key) ?? 0}
                  onChange={(event) => {
                    const next = Number(event.target.value || 0);
                    setHoursByRole((current) => {
                      const updated = new Map(current);
                      updated.set(role.key, Number.isFinite(next) ? next : 0);
                      return updated;
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <Button className="h-10 rounded-full px-5" type="submit" disabled={saving || loading}>
          {saving ? "Saving…" : "Save requirements"}
        </Button>
      </form>
    </div>
  );
}
