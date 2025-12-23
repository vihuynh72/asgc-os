"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { fetchJson, formatCurrency, formatDateTime } from "./finance-utils";

type FinanceConfig = {
  board_action_threshold: number;
  grant_max: number;
  lead_time_days: number;
  updated_at: string;
};

type BudgetLine = {
  id: string;
  fiscal_year: number;
  name: string;
  category: string;
  allocated_amount: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type FundingRequest = {
  id: string;
  requestor_user_id: string;
  committee_id: string | null;
  title: string;
  purpose: string;
  amount_requested: number;
  breakdown_json: { description: string; amount: number }[];
  needs_board_action: boolean;
  state: string;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  requires_contract: boolean;
  event_date: string | null;
  contract_warning: boolean;
  created_at: string;
  updated_at: string;
};

type FundingAttachment = {
  id: string;
  doc_kind: string;
  created_at: string;
  docs?: {
    id: string;
    title: string;
    doc_type: string;
    storage_bucket: string;
    storage_path: string | null;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
  } | null;
};

type BoardVote = {
  id: string;
  meeting_id: string;
  funding_request_id: string | null;
  motion_text: string;
  moved_by: string | null;
  seconded_by: string | null;
  vote_yes: number;
  vote_no: number;
  vote_abstain: number;
  result: string;
  notes: string | null;
  created_at: string;
};

type Expense = {
  id: string;
  funding_request_id: string | null;
  budget_line_id: string;
  payee: string;
  description: string | null;
  amount: number;
  purchased_at: string;
  receipt_doc_id: string | null;
  status: string;
  entered_by: string | null;
  created_at: string;
  updated_at: string;
};

type BurndownRow = {
  fiscal_year: number;
  budget_line_id: string;
  name: string;
  category: string;
  allocated_amount: number;
  spent: number;
  remaining: number;
};

type GrantCycle = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  max_amount: number;
  board_meeting_target_id: string | null;
  created_at: string;
  updated_at: string;
};

type GrantApplication = {
  id: string;
  cycle_id: string;
  applicant_type: string;
  club_id: string | null;
  title: string;
  event_date: string | null;
  amount_requested: number;
  breakdown_json: { description: string; amount: number }[];
  advisor_approved: boolean;
  doc_id: string;
  state: string;
  submitted_by: string;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

type DocRow = {
  id: string;
  title: string;
  doc_type: string;
  storage_bucket: string;
  storage_path: string | null;
  created_at: string;
  size_bytes: number | null;
};

type CommitteeLookup = {
  id: string;
  name: string;
  committee_key: string | null;
};

type MeetingLookup = {
  id: string;
  title: string;
  meeting_type: string;
  starts_at: string;
  status: string;
};

type FundingRequestLookup = {
  id: string;
  title: string;
  amount_requested: number;
  state: string;
  committee_id: string | null;
  submitted_at: string | null;
};

type BudgetLineLookup = {
  id: string;
  name: string;
  fiscal_year: number;
  category: string;
  is_active: boolean;
};

type GrantCycleLookup = {
  id: string;
  name: string;
  opens_at: string;
  closes_at: string;
  max_amount: number;
};

type ClubLookup = {
  id: string;
  name: string;
  status: string;
};

type DocLookup = {
  id: string;
  title: string;
  doc_type: string;
  created_at: string;
};

type UserLookup = {
  id: string;
  display_name: string | null;
  status: string;
};

type FinanceLookups = {
  committees: CommitteeLookup[];
  meetings: MeetingLookup[];
  fundingRequests: FundingRequestLookup[];
  budgetLines: BudgetLineLookup[];
  grantCycles: GrantCycleLookup[];
  clubs: ClubLookup[];
  docs: DocLookup[];
  users: UserLookup[];
};

const EMPTY_LOOKUPS: FinanceLookups = {
  committees: [],
  meetings: [],
  fundingRequests: [],
  budgetLines: [],
  grantCycles: [],
  clubs: [],
  docs: [],
  users: [],
};

export function FinanceDashboard({
  isFinanceAdmin,
  isBoardMember,
}: {
  isFinanceAdmin: boolean;
  isBoardMember: boolean;
}) {
  const [lookups, setLookups] = useState<FinanceLookups>(EMPTY_LOOKUPS);
  const [lookupError, setLookupError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function loadLookups() {
      try {
        const data = await fetchJson<FinanceLookups>("/api/finance/lookups");
        if (!cancelled) {
          setLookups({
            committees: data.committees ?? [],
            meetings: data.meetings ?? [],
            fundingRequests: data.fundingRequests ?? [],
            budgetLines: data.budgetLines ?? [],
            grantCycles: data.grantCycles ?? [],
            clubs: data.clubs ?? [],
            docs: data.docs ?? [],
            users: data.users ?? [],
          });
        }
      } catch (err) {
        if (!cancelled) {
          setLookupError(err instanceof Error ? err.message : "Failed to load reference data");
        }
      }
    }

    void loadLookups();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-10">
      {lookupError ? (
        <div className="rounded-md border px-3 py-2 text-sm text-red-600" role="alert">
          {lookupError}
        </div>
      ) : null}
      {isFinanceAdmin ? <FinanceConfigPanel /> : null}
      {isFinanceAdmin ? <BudgetLinesPanel /> : null}
      <FundingRequestsPanel
        isFinanceAdmin={isFinanceAdmin}
        committees={lookups.committees}
        docs={lookups.docs}
      />
      {isBoardMember || isFinanceAdmin ? (
        <BoardVotesPanel meetings={lookups.meetings} fundingRequests={lookups.fundingRequests} users={lookups.users} />
      ) : null}
      {isFinanceAdmin ? (
        <ExpensesPanel
          budgetLines={lookups.budgetLines}
          fundingRequests={lookups.fundingRequests}
          docs={lookups.docs}
        />
      ) : null}
      {isFinanceAdmin ? <BudgetBurndownPanel /> : null}
      {isFinanceAdmin ? <GrantCyclesPanel meetings={lookups.meetings} /> : null}
      <GrantApplicationsPanel
        isFinanceAdmin={isFinanceAdmin}
        grantCycles={lookups.grantCycles}
        clubs={lookups.clubs}
        docs={lookups.docs}
      />
      {isFinanceAdmin ? <FinanceExportsPanel /> : null}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-foreground/10 p-4">
      <div className="space-y-1">
        <h2 className="text-lg font-medium">{title}</h2>
        {description ? <p className="text-sm text-foreground/70">{description}</p> : null}
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function FinanceConfigPanel() {
  const [config, setConfig] = useState<FinanceConfig | null>(null);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({ board_action_threshold: "", grant_max: "", lead_time_days: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchJson<{ config: FinanceConfig | null }>("/api/finance/config");
        if (cancelled) return;
        if (data.config) {
          setConfig(data.config);
          setForm({
            board_action_threshold: String(data.config.board_action_threshold),
            grant_max: String(data.config.grant_max),
            lead_time_days: String(data.config.lead_time_days),
          });
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load config");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    try {
      const boardThreshold = Number(form.board_action_threshold);
      if (!Number.isFinite(boardThreshold) || boardThreshold < 0) {
        setStatus("Board action threshold must be 0 or higher.");
        return;
      }
      const grantMax = Number(form.grant_max);
      if (!Number.isFinite(grantMax) || grantMax < 0) {
        setStatus("Grant max must be 0 or higher.");
        return;
      }
      const leadTimeDays = Number(form.lead_time_days);
      if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) {
        setStatus("Contract lead-time days must be 0 or higher.");
        return;
      }

      const payload = {
        board_action_threshold: boardThreshold,
        grant_max: grantMax,
        lead_time_days: leadTimeDays,
      };

      const data = await fetchJson<{ config: FinanceConfig }>("/api/finance/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setConfig(data.config);
      setStatus("Saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save config");
    }
  }

  return (
    <Section title="Finance Config" description="Thresholds and defaults used across finance workflows.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      {config ? (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Board action threshold (USD)
            <input
              type="number"
              step="0.01"
              min={0}
              value={form.board_action_threshold}
              onChange={(event) => setForm((prev) => ({ ...prev, board_action_threshold: event.target.value }))}
              className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-sm">
            Grant max (USD)
            <input
              type="number"
              step="0.01"
              min={0}
              value={form.grant_max}
              onChange={(event) => setForm((prev) => ({ ...prev, grant_max: event.target.value }))}
              className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-sm">
            Contract lead-time days
            <input
              type="number"
              min={0}
              step={1}
              value={form.lead_time_days}
              onChange={(event) => setForm((prev) => ({ ...prev, lead_time_days: event.target.value }))}
              className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
            />
          </label>
          <div className="sm:col-span-3 flex justify-end">
            <Button type="submit" size="sm">
              Save Config
            </Button>
          </div>
        </form>
      ) : (
        <div className="text-sm text-foreground/70">Loading config...</div>
      )}
    </Section>
  );
}

function BudgetLinesPanel() {
  const [lines, setLines] = useState<BudgetLine[]>([]);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({ fiscal_year: "", name: "", category: "", allocated_amount: "", notes: "" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchJson<{ budgetLines: BudgetLine[] }>("/api/finance/budget-lines");
        if (!cancelled) {
          setLines(data.budgetLines ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load budget lines");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    try {
      const fiscalYear = Number(form.fiscal_year);
      const allocatedAmount = Number(form.allocated_amount);
      if (!Number.isFinite(fiscalYear) || fiscalYear < 2000) {
        setStatus("Fiscal year is required");
        return;
      }
      if (!form.name.trim() || !form.category.trim()) {
        setStatus("Name and category are required");
        return;
      }
      if (!Number.isFinite(allocatedAmount) || allocatedAmount < 0) {
        setStatus("Allocated amount must be 0 or higher");
        return;
      }

      const payload = {
        fiscal_year: fiscalYear,
        name: form.name.trim(),
        category: form.category.trim(),
        allocated_amount: allocatedAmount,
        notes: form.notes.trim() || undefined,
      };

      const data = await fetchJson<{ budgetLine: BudgetLine }>("/api/finance/budget-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setLines((prev) => [data.budgetLine, ...prev]);
      setForm({ fiscal_year: "", name: "", category: "", allocated_amount: "", notes: "" });
      setStatus("Saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save budget line");
    }
  }

  async function toggleActive(line: BudgetLine) {
    if (line.is_active) {
      const ok = window.confirm(`Archive budget line "${line.name}" (${line.fiscal_year})?`);
      if (!ok) return;
    }

    setStatus("Updating...");
    try {
      const data = await fetchJson<{ budgetLine: BudgetLine }>(`/api/finance/budget-lines/${line.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !line.is_active }),
      });
      setLines((prev) => prev.map((item) => (item.id === line.id ? data.budgetLine : item)));
      setStatus(line.is_active ? "Archived." : "Restored.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update budget line");
    }
  }

  return (
    <Section title="Budget Lines" description="Manage annual budget allocations.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Fiscal year
          <input
            type="number"
            min={2000}
            step={1}
            value={form.fiscal_year}
            onChange={(event) => setForm((prev) => ({ ...prev, fiscal_year: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Name
          <input
            type="text"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Category
          <input
            type="text"
            value={form.category}
            onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Allocated amount
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.allocated_amount}
            onChange={(event) => setForm((prev) => ({ ...prev, allocated_amount: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Notes
          <input
            type="text"
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">
            Add Budget Line
          </Button>
        </div>
      </form>

      <div className="space-y-2">
        {lines.length === 0 ? (
          <div className="text-sm text-foreground/70">No budget lines yet.</div>
        ) : (
          lines.map((line) => (
            <div
              key={line.id}
              className={`flex flex-wrap items-center justify-between gap-2 rounded border p-3 text-sm ${
                line.is_active
                  ? "border-foreground/10"
                  : "border-foreground/5 bg-muted/30 opacity-60"
              }`}
            >
              <div>
                <div className="font-medium">
                  {line.name} ({line.fiscal_year})
                  {!line.is_active && <span className="ml-2 text-xs text-foreground/50">(Archived)</span>}
                </div>
                <div className="text-xs text-foreground/70">
                  {line.category} • {formatCurrency(line.allocated_amount)}
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void toggleActive(line)}>
                {line.is_active ? "Archive" : "Restore"}
              </Button>
            </div>
          ))
        )}
      </div>
    </Section>
  );
}

function FundingRequestsPanel({
  isFinanceAdmin,
  committees,
  docs,
}: {
  isFinanceAdmin: boolean;
  committees: CommitteeLookup[];
  docs: DocLookup[];
}) {
  const [requests, setRequests] = useState<FundingRequest[]>([]);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({
    committee_id: "",
    title: "",
    purpose: "",
    amount_requested: "",
    requires_contract: false,
    event_date: "",
  });
  const [breakdown, setBreakdown] = useState<{ description: string; amount: string }[]>([
    { description: "", amount: "" },
  ]);
  const docListId = useId();
  const docsById = useMemo(() => new Map(docs.map((doc) => [doc.id, doc])), [docs]);
  const committeeById = useMemo(() => new Map(committees.map((c) => [c.id, c])), [committees]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchJson<{ fundingRequests: FundingRequest[] }>("/api/finance/funding-requests");
        if (!cancelled) {
          setRequests(data.fundingRequests ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load funding requests");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalBreakdown = useMemo(() =>
    breakdown.reduce((sum, item) => sum + Number(item.amount || 0), 0), [breakdown]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Submitting...");

    try {
      if (!form.title.trim()) {
        setStatus("Title is required");
        return;
      }
      if (!form.purpose.trim()) {
        setStatus("Purpose is required");
        return;
      }
      const amount = Number(form.amount_requested);
      const items = breakdown
        .map((item) => ({ description: item.description.trim(), amount: Number(item.amount) }))
        .filter((item) => item.description && item.amount > 0);

      if (!Number.isFinite(amount) || amount <= 0) {
        setStatus("Amount requested must be greater than 0");
        return;
      }
      if (form.requires_contract && !form.event_date) {
        setStatus("Event date is required when a contract is needed");
        return;
      }

      if (items.length === 0) {
        setStatus("Add at least one breakdown item");
        return;
      }

      if (Math.abs(totalBreakdown - amount) > 0.01) {
        setStatus("Breakdown total must match amount requested");
        return;
      }

      let { fundingRequest } = await fetchJson<{ fundingRequest: FundingRequest }>(
        "/api/finance/funding-requests",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            committee_id: form.committee_id.trim() || null,
            title: form.title.trim(),
            purpose: form.purpose.trim(),
            amount_requested: amount,
            breakdown: items,
          }),
        },
      );

      if (form.requires_contract || form.event_date) {
        const { fundingRequest: updated } = await fetchJson<{ fundingRequest: FundingRequest }>(
          `/api/finance/funding-requests/${fundingRequest.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requires_contract: form.requires_contract,
              event_date: form.event_date || null,
            }),
          },
        );
        fundingRequest = updated;
      }

      setRequests((prev) => [fundingRequest, ...prev]);
      setForm({ committee_id: "", title: "", purpose: "", amount_requested: "", requires_contract: false, event_date: "" });
      setBreakdown([{ description: "", amount: "" }]);
      setStatus("Submitted");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create request");
    }
  }

  async function submitRequest(requestId: string) {
    setStatus("Submitting request...");
    try {
      const { fundingRequest } = await fetchJson<{ fundingRequest: FundingRequest }>(
        `/api/finance/funding-requests/${requestId}/submit`,
        { method: "POST" },
      );
      setRequests((prev) => prev.map((item) => (item.id === requestId ? fundingRequest : item)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to submit request");
    }
  }

  async function withdrawRequest(requestId: string) {
    const ok = window.confirm("Withdraw this funding request?");
    if (!ok) return;

    setStatus("Withdrawing request...");
    try {
      const { fundingRequest } = await fetchJson<{ fundingRequest: FundingRequest }>(
        `/api/finance/funding-requests/${requestId}/withdraw`,
        { method: "POST" },
      );
      setRequests((prev) => prev.map((item) => (item.id === requestId ? fundingRequest : item)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to withdraw request");
    }
  }

  async function transitionRequest(requestId: string, nextState: string) {
    if (nextState === "denied") {
      const ok = window.confirm("Mark this funding request as denied?");
      if (!ok) return;
    }

    setStatus("Updating status...");
    try {
      const { fundingRequest } = await fetchJson<{ fundingRequest: FundingRequest }>(
        `/api/finance/funding-requests/${requestId}/transition`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ next_state: nextState }),
        },
      );
      setRequests((prev) => prev.map((item) => (item.id === requestId ? fundingRequest : item)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to transition request");
    }
  }

  return (
    <Section title="Funding Requests" description="Submit and manage funding requests with breakdowns and attachments.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Committee (optional)
          <select
            value={form.committee_id}
            onChange={(event) => setForm((prev) => ({ ...prev, committee_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— None —</option>
            {committees.map((committee) => {
              const label = committee.committee_key
                ? `${committee.name} (${committee.committee_key})`
                : committee.name;
              return (
                <option key={committee.id} value={committee.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </label>
        <label className="text-sm">
          Title
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Purpose
          <textarea
            value={form.purpose}
            onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
            rows={2}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Amount requested
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.amount_requested}
            onChange={(event) => setForm((prev) => ({ ...prev, amount_requested: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Event date (optional)
          <input
            type="date"
            value={form.event_date}
            onChange={(event) => setForm((prev) => ({ ...prev, event_date: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.requires_contract}
            onChange={(event) => setForm((prev) => ({ ...prev, requires_contract: event.target.checked }))}
          />
          Requires contract
        </label>

        <div className="sm:col-span-2 space-y-2">
          <div className="text-sm font-medium">Breakdown</div>
          {breakdown.map((item, idx) => (
            <div key={idx} className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Description"
                aria-label="Line item description"
                value={item.description}
                onChange={(event) =>
                  setBreakdown((prev) =>
                    prev.map((row, rIdx) => (rIdx === idx ? { ...row, description: event.target.value } : row)),
                  )
                }
                className="flex-1 rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
              <input
                type="number"
                step="0.01"
                min={0}
                placeholder="Amount"
                aria-label="Line item amount"
                value={item.amount}
                onChange={(event) =>
                  setBreakdown((prev) =>
                    prev.map((row, rIdx) => (rIdx === idx ? { ...row, amount: event.target.value } : row)),
                  )
                }
                className="w-32 rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBreakdown((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs text-foreground/70">
            <span>Total: {formatCurrency(totalBreakdown)}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setBreakdown((prev) => [...prev, { description: "", amount: "" }])}>
              Add line
            </Button>
          </div>
        </div>

        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">
            Create Request
          </Button>
        </div>
      </form>

      <datalist id={docListId}>
        {docs.map((doc) => (
          <option key={doc.id} value={doc.id} label={`${doc.title} • ${doc.doc_type}`} />
        ))}
      </datalist>

      <div className="space-y-3">
        {requests.length === 0 ? (
          <div className="text-sm text-foreground/70">No funding requests yet.</div>
        ) : (
          requests.map((request) => (
            <FundingRequestRow
              key={request.id}
              request={request}
              isFinanceAdmin={isFinanceAdmin}
              onSubmit={() => submitRequest(request.id)}
              onWithdraw={() => withdrawRequest(request.id)}
              onTransition={(state) => transitionRequest(request.id, state)}
              docListId={docListId}
              docsById={docsById}
              committeeById={committeeById}
            />
          ))
        )}
      </div>
    </Section>
  );
}

function FundingRequestRow({
  request,
  isFinanceAdmin,
  onSubmit,
  onWithdraw,
  onTransition,
  docListId,
  docsById,
  committeeById,
}: {
  request: FundingRequest;
  isFinanceAdmin: boolean;
  onSubmit: () => void;
  onWithdraw: () => void;
  onTransition: (state: string) => void;
  docListId: string;
  docsById: Map<string, DocLookup>;
  committeeById: Map<string, CommitteeLookup>;
}) {
  const [attachments, setAttachments] = useState<FundingAttachment[]>([]);
  const [docId, setDocId] = useState<string>("");
  const [docKind, setDocKind] = useState<string>("attachment");
  const [status, setStatus] = useState<string>("");
  const selectedDoc = docId.trim() ? docsById.get(docId.trim()) ?? null : null;
  const selectedCommittee = request.committee_id ? committeeById.get(request.committee_id) ?? null : null;

  useEffect(() => {
    let cancelled = false;

    async function loadAttachments() {
      try {
        const data = await fetchJson<{ attachments: FundingAttachment[] }>(
          `/api/finance/funding-requests/${request.id}/attachments`,
        );
        if (!cancelled) {
          setAttachments(data.attachments ?? []);
        }
      } catch {
        // silent
      }
    }

    void loadAttachments();

    return () => {
      cancelled = true;
    };
  }, [request.id]);

  const transitionOptions = useMemo(() => {
    switch (request.state) {
      case "submitted":
        return ["under_review", "scheduled_for_vote", "approved", "denied"];
      case "under_review":
        return ["scheduled_for_vote", "approved", "denied"];
      case "scheduled_for_vote":
        return ["approved", "denied"];
      default:
        return [];
    }
  }, [request.state]);

  async function attachDoc(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Attaching...");
    try {
      if (!docId.trim()) {
        setStatus("Doc ID is required");
        return;
      }
      const data = await fetchJson<{ attachment: FundingAttachment }>(
        `/api/finance/funding-requests/${request.id}/attachments`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ doc_id: docId, doc_kind: docKind }),
        },
      );
      setAttachments((prev) => [data.attachment, ...prev]);
      setDocId("");
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to attach doc");
    }
  }

  return (
    <div className="rounded border border-foreground/10 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">{request.title}</div>
          <div className="text-xs text-foreground/70">
            {formatCurrency(request.amount_requested)} • {request.state}
            {request.needs_board_action ? " • Board action" : ""}
            {request.contract_warning ? " • Contract warning" : ""}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {request.state === "draft" ? (
            <Button type="button" size="sm" onClick={onSubmit}>
              Submit
            </Button>
          ) : null}
          {request.state === "submitted" ? (
            <Button type="button" variant="outline" size="sm" onClick={onWithdraw}>
              Withdraw
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-2 text-xs text-foreground/70">Purpose: {request.purpose}</div>
      {selectedCommittee ? (
        <div className="mt-1 text-xs text-foreground/70">
          Committee: {selectedCommittee.name}
        </div>
      ) : null}
      <div className="mt-2 text-xs text-foreground/70">
        Submitted: {formatDateTime(request.submitted_at)}
      </div>
      {request.event_date ? (
        <div className="mt-1 text-xs text-foreground/70">Event date: {request.event_date}</div>
      ) : null}

      {isFinanceAdmin && transitionOptions.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-foreground/70">Transition:</span>
          {transitionOptions.map((option) => (
            <Button key={option} type="button" variant="outline" size="sm" onClick={() => onTransition(option)}>
              {option.replace(/_/g, " ")}
            </Button>
          ))}
        </div>
      ) : null}

      <div className="mt-3">
        <form onSubmit={attachDoc} className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Doc ID"
            aria-label="Document ID"
            list={docListId}
            value={docId}
            onChange={(event) => setDocId(event.target.value)}
            className="flex-1 rounded border border-foreground/20 bg-background px-2 py-1 text-xs"
          />
          <select
            value={docKind}
            onChange={(event) => setDocKind(event.target.value)}
            aria-label="Document kind"
            className="rounded border border-foreground/20 bg-background px-2 py-1 text-xs"
          >
            <option value="attachment">Attachment</option>
            <option value="quote">Quote</option>
            <option value="invoice">Invoice</option>
            <option value="other">Other</option>
          </select>
          <Button type="submit" size="sm" variant="outline">
            Attach Doc
          </Button>
        </form>
        {selectedDoc ? (
          <div className="mt-1 text-xs text-foreground/60">
            Selected: {selectedDoc.title} • {selectedDoc.doc_type}
          </div>
        ) : null}
        {status ? (
          <div className="mt-1 text-xs text-foreground/70" role="status" aria-live="polite">
            {status}
          </div>
        ) : null}
      </div>

      {attachments.length > 0 ? (
        <div className="mt-3 space-y-1 text-xs text-foreground/70">
          {attachments.map((attachment) => (
            <div key={attachment.id}>
              {attachment.doc_kind} • {attachment.docs?.title ?? attachment.id}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BoardVotesPanel({
  meetings,
  fundingRequests,
  users,
}: {
  meetings: MeetingLookup[];
  fundingRequests: FundingRequestLookup[];
  users: UserLookup[];
}) {
  const [votes, setVotes] = useState<BoardVote[]>([]);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({
    meeting_id: "",
    funding_request_id: "",
    motion_text: "",
    moved_by: "",
    seconded_by: "",
    vote_yes: "",
    vote_no: "",
    vote_abstain: "",
    result: "approved",
    notes: "",
  });
  const userListId = useId();
  const meetingsById = useMemo(() => new Map(meetings.map((m) => [m.id, m])), [meetings]);
  const requestsById = useMemo(() => new Map(fundingRequests.map((r) => [r.id, r])), [fundingRequests]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const selectedMovedBy = form.moved_by.trim() ? usersById.get(form.moved_by.trim()) ?? null : null;
  const selectedSecondedBy = form.seconded_by.trim() ? usersById.get(form.seconded_by.trim()) ?? null : null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchJson<{ votes: BoardVote[] }>("/api/finance/board-votes");
        if (!cancelled) {
          setVotes(data.votes ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load votes");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    try {
      if (!form.meeting_id.trim()) {
        setStatus("Please select a meeting");
        return;
      }
      if (!form.motion_text.trim()) {
        setStatus("Please enter the motion text");
        return;
      }
      const voteYes = Number(form.vote_yes || 0);
      const voteNo = Number(form.vote_no || 0);
      const voteAbstain = Number(form.vote_abstain || 0);
      if (voteYes < 0 || voteNo < 0 || voteAbstain < 0) {
        setStatus("Vote counts cannot be negative");
        return;
      }
      const payload = {
        meeting_id: form.meeting_id,
        funding_request_id: form.funding_request_id || null,
        motion_text: form.motion_text,
        moved_by: form.moved_by || null,
        seconded_by: form.seconded_by || null,
        vote_yes: voteYes,
        vote_no: voteNo,
        vote_abstain: voteAbstain,
        result: form.result,
        notes: form.notes || undefined,
      };

      const data = await fetchJson<{ vote: BoardVote }>("/api/finance/board-votes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setVotes((prev) => [data.vote, ...prev]);
      setForm({
        meeting_id: "",
        funding_request_id: "",
        motion_text: "",
        moved_by: "",
        seconded_by: "",
        vote_yes: "",
        vote_no: "",
        vote_abstain: "",
        result: "approved",
        notes: "",
      });
      setStatus("Saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save vote");
    }
  }

  return (
    <Section title="Board Votes" description="Record board votes and outcomes tied to funding requests.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Meeting
          <select
            value={form.meeting_id}
            onChange={(event) => setForm((prev) => ({ ...prev, meeting_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— Select meeting —</option>
            {meetings.map((meeting) => (
              <option key={meeting.id} value={meeting.id}>
                {formatDateTime(meeting.starts_at)} • {meeting.title}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Funding request (optional)
          <select
            value={form.funding_request_id}
            onChange={(event) => setForm((prev) => ({ ...prev, funding_request_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— None —</option>
            {fundingRequests.map((request) => (
              <option key={request.id} value={request.id}>
                {request.title} • {formatCurrency(request.amount_requested)} • {request.state}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Motion text
          <input
            type="text"
            value={form.motion_text}
            onChange={(event) => setForm((prev) => ({ ...prev, motion_text: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Moved by (user id)
          <input
            type="text"
            list={userListId}
            value={form.moved_by}
            onChange={(event) => setForm((prev) => ({ ...prev, moved_by: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
          {selectedMovedBy ? (
            <div className="mt-1 text-xs text-foreground/60">
              Selected: {selectedMovedBy.display_name?.trim() || selectedMovedBy.id}
            </div>
          ) : null}
        </label>
        <label className="text-sm">
          Seconded by (user id)
          <input
            type="text"
            list={userListId}
            value={form.seconded_by}
            onChange={(event) => setForm((prev) => ({ ...prev, seconded_by: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
          {selectedSecondedBy ? (
            <div className="mt-1 text-xs text-foreground/60">
              Selected: {selectedSecondedBy.display_name?.trim() || selectedSecondedBy.id}
            </div>
          ) : null}
        </label>
        <datalist id={userListId}>
          {users.map((user) => (
            <option key={user.id} value={user.id} label={user.display_name?.trim() || user.id} />
          ))}
        </datalist>
        <label className="text-sm">
          Yes votes
          <input
            type="number"
            min={0}
            step={1}
            value={form.vote_yes}
            onChange={(event) => setForm((prev) => ({ ...prev, vote_yes: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          No votes
          <input
            type="number"
            min={0}
            step={1}
            value={form.vote_no}
            onChange={(event) => setForm((prev) => ({ ...prev, vote_no: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Abstain votes
          <input
            type="number"
            min={0}
            step={1}
            value={form.vote_abstain}
            onChange={(event) => setForm((prev) => ({ ...prev, vote_abstain: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Result
          <select
            value={form.result}
            onChange={(event) => setForm((prev) => ({ ...prev, result: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
            <option value="tabled">Tabled</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Notes
          <input
            type="text"
            value={form.notes}
            onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">
            Record Vote
          </Button>
        </div>
      </form>

      {votes.length === 0 ? (
        <div className="text-sm text-foreground/70">No votes recorded yet.</div>
      ) : (
        <div className="space-y-2">
          {votes.map((vote) => {
            const meeting = meetingsById.get(vote.meeting_id) ?? null;
            const request = vote.funding_request_id ? requestsById.get(vote.funding_request_id) ?? null : null;
            const movedBy = vote.moved_by ? usersById.get(vote.moved_by) ?? null : null;
            const secondedBy = vote.seconded_by ? usersById.get(vote.seconded_by) ?? null : null;

            return (
              <div key={vote.id} className="rounded border border-foreground/10 p-3 text-sm">
                <div className="font-medium">{vote.motion_text}</div>
                <div className="text-xs text-foreground/70">
                  {vote.result} • {vote.vote_yes}-{vote.vote_no}-{vote.vote_abstain}
                </div>
                <div className="text-xs text-foreground/70">
                  Meeting: {meeting ? `${formatDateTime(meeting.starts_at)} • ${meeting.title}` : vote.meeting_id}
                </div>
                {request ? (
                  <div className="text-xs text-foreground/70">
                    Request: {request.title} • {formatCurrency(request.amount_requested)} • {request.state}
                  </div>
                ) : null}
                {vote.moved_by ? (
                  <div className="text-xs text-foreground/70">
                    Moved by: {movedBy?.display_name?.trim() || vote.moved_by}
                  </div>
                ) : null}
                {vote.seconded_by ? (
                  <div className="text-xs text-foreground/70">
                    Seconded by: {secondedBy?.display_name?.trim() || vote.seconded_by}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function ExpensesPanel({
  budgetLines,
  fundingRequests,
  docs,
}: {
  budgetLines: BudgetLineLookup[];
  fundingRequests: FundingRequestLookup[];
  docs: DocLookup[];
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({
    funding_request_id: "",
    budget_line_id: "",
    payee: "",
    description: "",
    amount: "",
    purchased_at: "",
    receipt_doc_id: "",
    status: "pending",
  });
  const budgetLinesById = useMemo(() => new Map(budgetLines.map((line) => [line.id, line])), [budgetLines]);
  const requestsById = useMemo(() => new Map(fundingRequests.map((r) => [r.id, r])), [fundingRequests]);
  const docsById = useMemo(() => new Map(docs.map((doc) => [doc.id, doc])), [docs]);


  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchJson<{ expenses: Expense[] }>("/api/finance/expenses");
        if (!cancelled) {
          setExpenses(data.expenses ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load expenses");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    try {
      if (!form.budget_line_id.trim()) {
        setStatus("Please select a budget line");
        return;
      }
      if (!form.payee.trim()) {
        setStatus("Please enter the payee name");
        return;
      }
      const amountValue = Number(form.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setStatus("Amount must be greater than 0");
        return;
      }
      if (!form.purchased_at) {
        setStatus("Please enter the purchase date/time");
        return;
      }

      const payload = {
        funding_request_id: form.funding_request_id || null,
        budget_line_id: form.budget_line_id,
        payee: form.payee,
        description: form.description || undefined,
        amount: amountValue,
        purchased_at: new Date(form.purchased_at).toISOString(),
        receipt_doc_id: form.receipt_doc_id || null,
        status: form.status,
      };

      const data = await fetchJson<{ expense: Expense }>("/api/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setExpenses((prev) => [data.expense, ...prev]);
      setForm({
        funding_request_id: "",
        budget_line_id: "",
        payee: "",
        description: "",
        amount: "",
        purchased_at: "",
        receipt_doc_id: "",
        status: "pending",
      });
      setStatus("Saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save expense");
    }
  }

  return (
    <Section title="Expenses" description="Log expenses and link receipts.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Budget line
          <select
            value={form.budget_line_id}
            onChange={(event) => setForm((prev) => ({ ...prev, budget_line_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— Select budget line —</option>
            {budgetLines.filter((line) => line.is_active).map((line) => (
              <option key={line.id} value={line.id}>
                {line.name} ({line.fiscal_year}) — {line.category}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Funding request (optional)
          <select
            value={form.funding_request_id}
            onChange={(event) => setForm((prev) => ({ ...prev, funding_request_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— None —</option>
            {fundingRequests.map((request) => (
              <option key={request.id} value={request.id}>
                {request.title} • {formatCurrency(request.amount_requested)} • {request.state}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Payee
          <input
            type="text"
            value={form.payee}
            onChange={(event) => setForm((prev) => ({ ...prev, payee: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Amount
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Purchased at
          <input
            type="datetime-local"
            value={form.purchased_at}
            onChange={(event) => setForm((prev) => ({ ...prev, purchased_at: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Status
          <select
            value={form.status}
            onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="paid">Paid</option>
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Receipt document (optional)
          <select
            value={form.receipt_doc_id}
            onChange={(event) => setForm((prev) => ({ ...prev, receipt_doc_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— None —</option>
            {docs.filter((doc) => doc.doc_type === "receipt").map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title} • {formatDateTime(doc.created_at)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm sm:col-span-2">
          Description
          <input
            type="text"
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">
            Log Expense
          </Button>
        </div>
      </form>

      {expenses.length === 0 ? (
        <div className="text-sm text-foreground/70">No expenses logged yet.</div>
      ) : (
        <div className="space-y-2">
          {expenses.map((expense) => {
            const budgetLine = budgetLinesById.get(expense.budget_line_id) ?? null;
            const request = expense.funding_request_id ? requestsById.get(expense.funding_request_id) ?? null : null;
            const receipt = expense.receipt_doc_id ? docsById.get(expense.receipt_doc_id) ?? null : null;

            return (
              <div key={expense.id} className="rounded border border-foreground/10 p-3 text-sm">
                <div className="font-medium">{expense.payee}</div>
                <div className="text-xs text-foreground/70">
                  {formatCurrency(expense.amount)} • {expense.status} • {formatDateTime(expense.purchased_at)}
                </div>
                {budgetLine ? (
                  <div className="text-xs text-foreground/70">
                    Budget line: {budgetLine.name} ({budgetLine.fiscal_year})
                  </div>
                ) : null}
                {request ? (
                  <div className="text-xs text-foreground/70">
                    Request: {request.title} • {formatCurrency(request.amount_requested)} • {request.state}
                  </div>
                ) : null}
                {receipt ? (
                  <div className="text-xs text-foreground/70">
                    Receipt: {receipt.title} • {receipt.doc_type}
                  </div>
                ) : null}
                {expense.description ? (
                  <div className="text-xs text-foreground/70">{expense.description}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function BudgetBurndownPanel() {
  const [rows, setRows] = useState<BurndownRow[]>([]);
  const [status, setStatus] = useState<string>("");
  const [fiscalYear, setFiscalYear] = useState<string>("");
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const query = fiscalYear ? `?fiscal_year=${encodeURIComponent(fiscalYear)}` : "";
        const data = await fetchJson<{ burndown: BurndownRow[] }>(`/api/finance/budget-burndown${query}`);
        if (!cancelled) {
          setRows(data.burndown ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load burndown");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [fiscalYear, refreshToken]);

  return (
    <Section title="Budget Burn-down" description="Allocated vs spent by budget line.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          Fiscal year
          <input
            type="number"
            min={2000}
            step={1}
            value={fiscalYear}
            onChange={(event) => setFiscalYear(event.target.value)}
            className="ml-2 w-28 rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <Button type="button" variant="outline" size="sm" onClick={() => setRefreshToken((value) => value + 1)}>
          Refresh
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-foreground/70">No data yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((row) => (
            <div key={row.budget_line_id} className="rounded border border-foreground/10 p-3 text-sm">
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-foreground/70">
                Allocated: {formatCurrency(row.allocated_amount)} • Spent: {formatCurrency(row.spent)} • Remaining:{" "}
                <span className={row.remaining < 0 ? "text-red-500" : ""}>{formatCurrency(row.remaining)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function GrantCyclesPanel({ meetings }: { meetings: MeetingLookup[] }) {
  const [cycles, setCycles] = useState<GrantCycle[]>([]);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({ name: "", opens_at: "", closes_at: "", max_amount: "", board_meeting_target_id: "" });
  const meetingListId = useId();
  const meetingsById = useMemo(() => new Map(meetings.map((m) => [m.id, m])), [meetings]);
  const selectedMeeting = form.board_meeting_target_id.trim()
    ? meetingsById.get(form.board_meeting_target_id.trim()) ?? null
    : null;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchJson<{ cycles: GrantCycle[] }>("/api/finance/grant-cycles");
        if (!cancelled) {
          setCycles(data.cycles ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load grant cycles");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Saving...");

    try {
      if (!form.name.trim()) {
        setStatus("Name is required");
        return;
      }
      if (!form.opens_at || !form.closes_at) {
        setStatus("Open and close dates are required");
        return;
      }
      const opensAtDate = new Date(form.opens_at);
      const closesAtDate = new Date(form.closes_at);
      if (Number.isNaN(opensAtDate.getTime()) || Number.isNaN(closesAtDate.getTime())) {
        setStatus("Open and close dates must be valid");
        return;
      }
      if (closesAtDate <= opensAtDate) {
        setStatus("Close date must be after open date");
        return;
      }
      const maxAmount = Number(form.max_amount);
      if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
        setStatus("Max amount must be greater than 0");
        return;
      }

      const payload = {
        name: form.name,
        opens_at: opensAtDate.toISOString(),
        closes_at: closesAtDate.toISOString(),
        max_amount: maxAmount,
        board_meeting_target_id: form.board_meeting_target_id || null,
      };

      const data = await fetchJson<{ cycle: GrantCycle }>("/api/finance/grant-cycles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      setCycles((prev) => [data.cycle, ...prev]);
      setForm({ name: "", opens_at: "", closes_at: "", max_amount: "", board_meeting_target_id: "" });
      setStatus("Saved");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create cycle");
    }
  }

  return (
    <Section title="Grant Cycles" description="Define grant cycles and deadlines.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Name
          <input
            type="text"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Max amount
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.max_amount}
            onChange={(event) => setForm((prev) => ({ ...prev, max_amount: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Opens at
          <input
            type="datetime-local"
            value={form.opens_at}
            onChange={(event) => setForm((prev) => ({ ...prev, opens_at: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Closes at
          <input
            type="datetime-local"
            value={form.closes_at}
            onChange={(event) => setForm((prev) => ({ ...prev, closes_at: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Target board meeting ID (optional)
          <input
            type="text"
            list={meetingListId}
            value={form.board_meeting_target_id}
            onChange={(event) => setForm((prev) => ({ ...prev, board_meeting_target_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
          <datalist id={meetingListId}>
            {meetings.map((meeting) => (
              <option
                key={meeting.id}
                value={meeting.id}
                label={`${formatDateTime(meeting.starts_at)} • ${meeting.title}`}
              />
            ))}
          </datalist>
          {selectedMeeting ? (
            <div className="mt-1 text-xs text-foreground/60">
              Selected: {formatDateTime(selectedMeeting.starts_at)} • {selectedMeeting.title}
            </div>
          ) : null}
        </label>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">
            Create Cycle
          </Button>
        </div>
      </form>

      {cycles.length === 0 ? (
        <div className="text-sm text-foreground/70">No grant cycles yet.</div>
      ) : (
        <div className="space-y-2">
          {cycles.map((cycle) => {
            const target = cycle.board_meeting_target_id
              ? meetingsById.get(cycle.board_meeting_target_id) ?? null
              : null;

            return (
              <div key={cycle.id} className="rounded border border-foreground/10 p-3 text-sm">
                <div className="font-medium">{cycle.name}</div>
                <div className="text-xs text-foreground/70">
                  {formatDateTime(cycle.opens_at)} → {formatDateTime(cycle.closes_at)} • Max{" "}
                  {formatCurrency(cycle.max_amount)}
                </div>
                {target ? (
                  <div className="text-xs text-foreground/70">
                    Target meeting: {formatDateTime(target.starts_at)} • {target.title}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function GrantApplicationsPanel({
  isFinanceAdmin,
  grantCycles,
  clubs,
  docs,
}: {
  isFinanceAdmin: boolean;
  grantCycles: GrantCycleLookup[];
  clubs: ClubLookup[];
  docs: DocLookup[];
}) {
  const [applications, setApplications] = useState<GrantApplication[]>([]);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({
    cycle_id: "",
    applicant_type: "club",
    club_id: "",
    title: "",
    event_date: "",
    amount_requested: "",
    doc_id: "",
  });
  const [breakdown, setBreakdown] = useState<{ description: string; amount: string }[]>([
    { description: "", amount: "" },
  ]);
  const cyclesById = useMemo(() => new Map(grantCycles.map((c) => [c.id, c])), [grantCycles]);
  const clubsById = useMemo(() => new Map(clubs.map((c) => [c.id, c])), [clubs]);
  const docsById = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchJson<{ applications: GrantApplication[] }>("/api/finance/grant-applications");
        if (!cancelled) {
          setApplications(data.applications ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load grant applications");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const totalBreakdown = useMemo(() =>
    breakdown.reduce((sum, item) => sum + Number(item.amount || 0), 0), [breakdown]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("Submitting...");

    try {
      if (!form.cycle_id.trim()) {
        setStatus("Please select a grant cycle");
        return;
      }
      if (!form.applicant_type.trim()) {
        setStatus("Please select an applicant type");
        return;
      }
      if (!form.title.trim()) {
        setStatus("Please enter a title for your application");
        return;
      }
      if (!form.doc_id.trim()) {
        setStatus("Please select the application document");
        return;
      }
      const amount = Number(form.amount_requested);
      const items = breakdown
        .map((item) => ({ description: item.description.trim(), amount: Number(item.amount) }))
        .filter((item) => item.description && item.amount > 0);

      if (!Number.isFinite(amount) || amount <= 0) {
        setStatus("Amount requested must be greater than 0");
        return;
      }

      if (items.length === 0) {
        setStatus("Add at least one breakdown item");
        return;
      }

      if (Math.abs(totalBreakdown - amount) > 0.01) {
        setStatus("Breakdown total must match amount requested");
        return;
      }

      const { application } = await fetchJson<{ application: GrantApplication }>("/api/finance/grant-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycle_id: form.cycle_id.trim(),
          applicant_type: form.applicant_type.trim(),
          club_id: form.club_id.trim() || null,
          title: form.title.trim(),
          event_date: form.event_date || null,
          amount_requested: amount,
          breakdown: items,
          doc_id: form.doc_id.trim(),
        }),
      });

      setApplications((prev) => [application, ...prev]);
      setForm({ cycle_id: "", applicant_type: "club", club_id: "", title: "", event_date: "", amount_requested: "", doc_id: "" });
      setBreakdown([{ description: "", amount: "" }]);
      setStatus("Created");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create grant application");
    }
  }

  async function submitApplication(id: string) {
    setStatus("Submitting...");
    try {
      const { application } = await fetchJson<{ application: GrantApplication }>(
        `/api/finance/grant-applications/${id}/submit`,
        { method: "POST" },
      );
      setApplications((prev) => prev.map((item) => (item.id === id ? application : item)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to submit application");
    }
  }

  async function reviewApplication(id: string, decision: "approved" | "denied") {
    if (decision === "denied") {
      const ok = window.confirm("Mark this grant application as denied?");
      if (!ok) return;
    }

    setStatus("Reviewing...");
    try {
      const { application } = await fetchJson<{ application: GrantApplication }>(
        `/api/finance/grant-applications/${id}/review`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      setApplications((prev) => prev.map((item) => (item.id === id ? application : item)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to review application");
    }
  }

  async function markAwarded(id: string) {
    setStatus("Marking awarded...");
    try {
      const { application } = await fetchJson<{ application: GrantApplication }>(
        `/api/finance/grant-applications/${id}/award`,
        { method: "POST" },
      );
      setApplications((prev) => prev.map((item) => (item.id === id ? application : item)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to mark awarded");
    }
  }

  async function markExpended(id: string) {
    setStatus("Marking expended...");
    try {
      const { application } = await fetchJson<{ application: GrantApplication }>(
        `/api/finance/grant-applications/${id}/expended`,
        { method: "POST" },
      );
      setApplications((prev) => prev.map((item) => (item.id === id ? application : item)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to mark expended");
    }
  }

  return (
    <Section title="Grant Applications" description="Submit and review grant applications.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Grant cycle
          <select
            value={form.cycle_id}
            onChange={(event) => setForm((prev) => ({ ...prev, cycle_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— Select grant cycle —</option>
            {grantCycles.map((cycle) => (
              <option key={cycle.id} value={cycle.id}>
                {cycle.name} • Opens {formatDateTime(cycle.opens_at)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Applicant type
          <select
            value={form.applicant_type}
            onChange={(event) => setForm((prev) => ({ ...prev, applicant_type: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="club">Club</option>
            <option value="individual">Individual</option>
            <option value="committee">Committee</option>
          </select>
        </label>
        <label className="text-sm">
          Club (optional)
          <select
            value={form.club_id}
            onChange={(event) => setForm((prev) => ({ ...prev, club_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— None —</option>
            {clubs.filter((club) => club.status === "chartered").map((club) => (
              <option key={club.id} value={club.id}>
                {club.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Title
          <input
            type="text"
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Event date
          <input
            type="date"
            value={form.event_date}
            onChange={(event) => setForm((prev) => ({ ...prev, event_date: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Amount requested
          <input
            type="number"
            step="0.01"
            min={0}
            value={form.amount_requested}
            onChange={(event) => setForm((prev) => ({ ...prev, amount_requested: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Application document
          <select
            value={form.doc_id}
            onChange={(event) => setForm((prev) => ({ ...prev, doc_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          >
            <option value="">— Select document —</option>
            {docs.map((doc) => (
              <option key={doc.id} value={doc.id}>
                {doc.title} • {doc.doc_type}
              </option>
            ))}
          </select>
        </label>
        <div className="sm:col-span-2 space-y-2">
          <div className="text-sm font-medium">Breakdown</div>
          {breakdown.map((item, idx) => (
            <div key={idx} className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Description"
                aria-label="Application line item description"
                value={item.description}
                onChange={(event) =>
                  setBreakdown((prev) =>
                    prev.map((row, rIdx) => (rIdx === idx ? { ...row, description: event.target.value } : row)),
                  )
                }
                className="flex-1 rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                aria-label="Application line item amount"
                value={item.amount}
                onChange={(event) =>
                  setBreakdown((prev) =>
                    prev.map((row, rIdx) => (rIdx === idx ? { ...row, amount: event.target.value } : row)),
                  )
                }
                className="w-32 rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setBreakdown((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex items-center justify-between text-xs text-foreground/70">
            <span>Total: {formatCurrency(totalBreakdown)}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setBreakdown((prev) => [...prev, { description: "", amount: "" }])}>
              Add line
            </Button>
          </div>
        </div>
        <div className="sm:col-span-2 flex justify-end">
          <Button type="submit" size="sm">
            Create Application
          </Button>
        </div>
      </form>

      {applications.length === 0 ? (
        <div className="text-sm text-foreground/70">No grant applications yet.</div>
      ) : (
        <div className="space-y-2">
          {applications.map((app) => {
            const cycle = cyclesById.get(app.cycle_id) ?? null;
            const club = app.club_id ? clubsById.get(app.club_id) ?? null : null;
            const doc = docsById.get(app.doc_id) ?? null;

            return (
              <div key={app.id} className="rounded border border-foreground/10 p-3 text-sm">
                <div className="font-medium">{app.title}</div>
                <div className="text-xs text-foreground/70">
                  {formatCurrency(app.amount_requested)} • {app.state}
                </div>
                {cycle ? (
                  <div className="text-xs text-foreground/70">
                    Cycle: {cycle.name} • {formatDateTime(cycle.opens_at)} → {formatDateTime(cycle.closes_at)}
                  </div>
                ) : null}
                {club ? (
                  <div className="text-xs text-foreground/70">
                    Club: {club.name} ({club.status})
                  </div>
                ) : null}
                {doc ? (
                  <div className="text-xs text-foreground/70">
                    Doc: {doc.title} • {doc.doc_type}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {app.state === "draft" ? (
                    <Button type="button" size="sm" onClick={() => submitApplication(app.id)}>
                      Submit
                    </Button>
                  ) : null}
                  {isFinanceAdmin && app.state === "submitted" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => reviewApplication(app.id, "approved")}
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => reviewApplication(app.id, "denied")}
                      >
                        Deny
                      </Button>
                    </>
                  ) : null}
                  {isFinanceAdmin && app.state === "approved" ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => markAwarded(app.id)}>
                      Mark Awarded
                    </Button>
                  ) : null}
                  {isFinanceAdmin && app.state === "awarded" ? (
                    <Button type="button" variant="outline" size="sm" onClick={() => markExpended(app.id)}>
                      Mark Expended
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function FinanceExportsPanel() {
  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState<string>("");
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await fetchJson<{ docs: DocRow[] }>(`/api/docs?doc_type=finance_export&limit=50`);
        if (!cancelled) {
          setDocs(data.docs ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setStatus(err instanceof Error ? err.message : "Failed to load exports");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  async function generateExport() {
    setStatus("Generating export...");
    try {
      await fetchJson("/api/finance/exports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month }),
      });
      setStatus("Export generated");
      setRefreshToken((value) => value + 1);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to generate export");
    }
  }

  async function downloadDoc(docId: string) {
    try {
      const { signedUrl } = await fetchJson<{ signedUrl: string | null }>(`/api/docs/${docId}`);
      if (signedUrl) {
        window.open(signedUrl, "_blank");
      }
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to download");
    }
  }

  return (
    <Section title="Finance Exports" description="Generate monthly PDF/CSV exports.">
      {status ? (
        <div className="text-sm text-foreground/70" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          Month
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="ml-2 rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <Button type="button" size="sm" onClick={() => void generateExport()}>
          Generate Export
        </Button>
      </div>

      {docs.length === 0 ? (
        <div className="text-sm text-foreground/70">No exports yet.</div>
      ) : (
        <div className="space-y-2">
          {docs.map((doc) => (
            <div key={doc.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-foreground/10 p-3 text-sm">
              <div>
                <div className="font-medium">{doc.title}</div>
                <div className="text-xs text-foreground/70">{formatDateTime(doc.created_at)}</div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => void downloadDoc(doc.id)}>
                Download
              </Button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
