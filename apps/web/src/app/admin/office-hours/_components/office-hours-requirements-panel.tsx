"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";
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
    <div className="space-y-8">
      <OfficeHoursSectionNav activeId="requirements" />

      {feedback ? <AdminInlineNotice tone={feedback.tone}>{feedback.message}</AdminInlineNotice> : null}

      <AdminSurface
        title="Weekly requirements"
        description="Set the expected hours for each role without carrying live session review onto the same page."
        action={
          <select
            value={termId}
            onChange={async (event) => {
              const nextTermId = event.target.value;
              setTermId(nextTermId);
              await loadRequirements(nextTermId);
            }}
          >
            {terms.map((term) => (
              <option key={term.id} value={term.id}>
                {term.name}
              </option>
            ))}
          </select>
        }
      >
        <form className="space-y-6" onSubmit={handleSave}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ROLE_ROWS.map((role) => (
              <div key={role.key} className="rounded-[1.4rem] border border-[var(--admin-border-soft)] bg-white/80 p-4">
                <AdminField label={role.label} hint="Hours per week">
                  <input
                    type="number"
                    min={0}
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
                </AdminField>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button className="h-12 rounded-full px-5" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save requirements"}
            </Button>
            <span className="text-sm text-foreground/55">{loading ? "Loading term requirements..." : selectedTerm?.name ?? "No term selected"}</span>
          </div>
        </form>
      </AdminSurface>
    </div>
  );
}
