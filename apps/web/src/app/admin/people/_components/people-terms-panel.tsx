"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { AdminField } from "@/components/admin/admin-field";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";
import type { TermRow } from "@/lib/admin/server";

import { PeopleSectionNav } from "./people-section-nav";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

export function PeopleTermsPanel({ initialTerms }: { initialTerms: TermRow[] }) {
  const [terms, setTerms] = useState(initialTerms);
  const [feedback, setFeedback] = useState<{ tone: "positive" | "warning"; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [rolloverFrom, setRolloverFrom] = useState(initialTerms[1]?.id ?? initialTerms[0]?.id ?? "");
  const [rolloverTo, setRolloverTo] = useState(initialTerms[0]?.id ?? "");
  const [endPrior, setEndPrior] = useState(true);
  const [setCurrent, setSetCurrent] = useState(true);
  const [activeTermId, setActiveTermId] = useState("");

  const currentTerm = useMemo(() => terms.find((term) => term.is_current) ?? null, [terms]);

  async function refreshTerms() {
    const { terms: nextTerms } = await fetchJson<{ terms: TermRow[] }>("/api/admin/terms");
    setTerms(nextTerms);
  }

  async function handleCreateTerm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      await fetchJson<{ term: TermRow }>("/api/admin/terms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });
      await refreshTerms();
      setName("");
      setStartDate("");
      setEndDate("");
      setFeedback({ tone: "positive", message: "Term created." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not create term." });
    } finally {
      setSubmitting(false);
    }
  }

  async function setCurrentTerm(termId: string) {
    setActiveTermId(termId);
    setFeedback(null);
    try {
      await fetchJson<{ term: TermRow }>("/api/admin/terms", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ termId, is_current: true }),
      });
      await refreshTerms();
      setFeedback({ tone: "positive", message: "Current term updated." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not change current term." });
    } finally {
      setActiveTermId("");
    }
  }

  async function handleRollover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const result = await fetchJson<{ inserted_count: number }>("/api/admin/terms/rollover", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from_term_id: rolloverFrom,
          to_term_id: rolloverTo,
          end_prior: endPrior,
          set_current: setCurrent,
        }),
      });
      await refreshTerms();
      setFeedback({ tone: "positive", message: `Rollover finished with ${result.inserted_count} copied assignments.` });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not run rollover." });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PeopleSectionNav activeId="terms" />

      {feedback ? <AdminInlineNotice tone={feedback.tone}>{feedback.message}</AdminInlineNotice> : null}

      <AdminSurface
        title="Current term"
        description="Keep the active term obvious, then make rollover a deliberate action instead of something hidden in the middle of another workflow."
      >
        <div className="admin-data-list">
          {terms.map((term) => (
            <div key={term.id} className="rounded-[1.3rem] border border-[var(--admin-border-soft)] bg-white/75 px-4 py-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-foreground">{term.name}</h3>
                    {term.is_current ? <span className="admin-domain-badge">Current</span> : null}
                  </div>
                  <p className="text-sm leading-7 text-foreground/58">
                    {term.start_date || "No start date"} to {term.end_date || "No end date"}
                  </p>
                </div>
                {!term.is_current ? (
                  <Button
                    variant="outline"
                    className="h-11 rounded-full px-4"
                    disabled={activeTermId === term.id}
                    onClick={() => setCurrentTerm(term.id)}
                  >
                    {activeTermId === term.id ? "Setting..." : "Set current"}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </AdminSurface>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminSurface title="Create a term" description="Keep new terms explicit and lightweight.">
          <form className="grid gap-4" onSubmit={handleCreateTerm}>
            <AdminField label="Term name">
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Fall 2026" />
            </AdminField>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="Start date">
                <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
              </AdminField>
              <AdminField label="End date">
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </AdminField>
            </div>
            <Button className="h-12 rounded-full px-5" type="submit" disabled={submitting || name.trim().length === 0}>
              {submitting ? "Saving..." : "Create term"}
            </Button>
          </form>
        </AdminSurface>

        <AdminSurface title="Rollover assignments" description="Copy active term roles into a new term without mixing that action into daily assignment work.">
          <form className="grid gap-4" onSubmit={handleRollover}>
            <div className="grid gap-4 sm:grid-cols-2">
              <AdminField label="From term">
                <select value={rolloverFrom} onChange={(event) => setRolloverFrom(event.target.value)}>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </select>
              </AdminField>
              <AdminField label="To term">
                <select value={rolloverTo} onChange={(event) => setRolloverTo(event.target.value)}>
                  {terms.map((term) => (
                    <option key={term.id} value={term.id}>
                      {term.name}
                    </option>
                  ))}
                </select>
              </AdminField>
            </div>
            <label className="flex items-center gap-3 text-sm text-foreground/72">
              <input type="checkbox" checked={endPrior} onChange={(event) => setEndPrior(event.target.checked)} />
              End assignments in the source term after copying
            </label>
            <label className="flex items-center gap-3 text-sm text-foreground/72">
              <input type="checkbox" checked={setCurrent} onChange={(event) => setSetCurrent(event.target.checked)} />
              Make the destination the current term
            </label>
            <Button
              className="h-12 rounded-full px-5"
              type="submit"
              disabled={submitting || rolloverFrom.length === 0 || rolloverTo.length === 0 || rolloverFrom === rolloverTo}
            >
              {submitting ? "Running..." : "Run rollover"}
            </Button>
          </form>
        </AdminSurface>
      </div>

      {currentTerm ? <AdminInlineNotice tone="positive">Current term: {currentTerm.name}</AdminInlineNotice> : null}
    </div>
  );
}
