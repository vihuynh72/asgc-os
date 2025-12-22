"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";

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

export function FinanceDashboard({
  isFinanceAdmin,
  isBoardMember,
}: {
  isFinanceAdmin: boolean;
  isBoardMember: boolean;
}) {
  return (
    <div className="space-y-10">
      {isFinanceAdmin ? <FinanceConfigPanel /> : null}
      {isFinanceAdmin ? <BudgetLinesPanel /> : null}
      <FundingRequestsPanel isFinanceAdmin={isFinanceAdmin} />
      {isBoardMember || isFinanceAdmin ? <BoardVotesPanel /> : null}
      {isFinanceAdmin ? <ExpensesPanel /> : null}
      {isFinanceAdmin ? <BudgetBurndownPanel /> : null}
      {isFinanceAdmin ? <GrantCyclesPanel /> : null}
      <GrantApplicationsPanel isFinanceAdmin={isFinanceAdmin} />
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
      const payload = {
        board_action_threshold: Number(form.board_action_threshold),
        grant_max: Number(form.grant_max),
        lead_time_days: Number(form.lead_time_days),
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
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}
      {config ? (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">
            Board action threshold
            <input
              type="number"
              step="0.01"
              value={form.board_action_threshold}
              onChange={(event) => setForm((prev) => ({ ...prev, board_action_threshold: event.target.value }))}
              className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-sm">
            Grant max
            <input
              type="number"
              step="0.01"
              value={form.grant_max}
              onChange={(event) => setForm((prev) => ({ ...prev, grant_max: event.target.value }))}
              className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
            />
          </label>
          <label className="text-sm">
            Contract lead-time days
            <input
              type="number"
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
    setStatus("Updating...");
    try {
      const data = await fetchJson<{ budgetLine: BudgetLine }>(`/api/finance/budget-lines/${line.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !line.is_active }),
      });
      setLines((prev) => prev.map((item) => (item.id === line.id ? data.budgetLine : item)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to update budget line");
    }
  }

  return (
    <Section title="Budget Lines" description="Manage annual budget allocations.">
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Fiscal year
          <input
            type="number"
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
            <div key={line.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-foreground/10 p-3 text-sm">
              <div>
                <div className="font-medium">
                  {line.name} ({line.fiscal_year})
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

function FundingRequestsPanel({ isFinanceAdmin }: { isFinanceAdmin: boolean }) {
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
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Committee ID (optional)
          <input
            type="text"
            value={form.committee_id}
            onChange={(event) => setForm((prev) => ({ ...prev, committee_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
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
}: {
  request: FundingRequest;
  isFinanceAdmin: boolean;
  onSubmit: () => void;
  onWithdraw: () => void;
  onTransition: (state: string) => void;
}) {
  const [attachments, setAttachments] = useState<FundingAttachment[]>([]);
  const [docId, setDocId] = useState<string>("");
  const [docKind, setDocKind] = useState<string>("attachment");
  const [status, setStatus] = useState<string>("");

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
            value={docId}
            onChange={(event) => setDocId(event.target.value)}
            className="flex-1 rounded border border-foreground/20 bg-background px-2 py-1 text-xs"
          />
          <select
            value={docKind}
            onChange={(event) => setDocKind(event.target.value)}
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
        {status ? <div className="mt-1 text-xs text-foreground/70">{status}</div> : null}
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

function BoardVotesPanel() {
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
        setStatus("Meeting ID is required");
        return;
      }
      if (!form.motion_text.trim()) {
        setStatus("Motion text is required");
        return;
      }
      const payload = {
        meeting_id: form.meeting_id,
        funding_request_id: form.funding_request_id || null,
        motion_text: form.motion_text,
        moved_by: form.moved_by || null,
        seconded_by: form.seconded_by || null,
        vote_yes: Number(form.vote_yes || 0),
        vote_no: Number(form.vote_no || 0),
        vote_abstain: Number(form.vote_abstain || 0),
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
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Meeting ID
          <input
            type="text"
            value={form.meeting_id}
            onChange={(event) => setForm((prev) => ({ ...prev, meeting_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Funding request ID (optional)
          <input
            type="text"
            value={form.funding_request_id}
            onChange={(event) => setForm((prev) => ({ ...prev, funding_request_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
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
            value={form.moved_by}
            onChange={(event) => setForm((prev) => ({ ...prev, moved_by: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Seconded by (user id)
          <input
            type="text"
            value={form.seconded_by}
            onChange={(event) => setForm((prev) => ({ ...prev, seconded_by: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Yes votes
          <input
            type="number"
            value={form.vote_yes}
            onChange={(event) => setForm((prev) => ({ ...prev, vote_yes: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          No votes
          <input
            type="number"
            value={form.vote_no}
            onChange={(event) => setForm((prev) => ({ ...prev, vote_no: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Abstain votes
          <input
            type="number"
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
          {votes.map((vote) => (
            <div key={vote.id} className="rounded border border-foreground/10 p-3 text-sm">
              <div className="font-medium">{vote.motion_text}</div>
              <div className="text-xs text-foreground/70">
                {vote.result} • {vote.vote_yes}-{vote.vote_no}-{vote.vote_abstain}
              </div>
              <div className="text-xs text-foreground/70">Meeting: {vote.meeting_id}</div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function ExpensesPanel() {
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
        setStatus("Budget line ID is required");
        return;
      }
      if (!form.payee.trim()) {
        setStatus("Payee is required");
        return;
      }
      const amountValue = Number(form.amount);
      if (!Number.isFinite(amountValue) || amountValue <= 0) {
        setStatus("Amount must be greater than 0");
        return;
      }
      if (!form.purchased_at) {
        setStatus("Purchased date/time is required");
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
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Budget line ID
          <input
            type="text"
            value={form.budget_line_id}
            onChange={(event) => setForm((prev) => ({ ...prev, budget_line_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Funding request ID (optional)
          <input
            type="text"
            value={form.funding_request_id}
            onChange={(event) => setForm((prev) => ({ ...prev, funding_request_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
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
          Receipt doc ID (optional)
          <input
            type="text"
            value={form.receipt_doc_id}
            onChange={(event) => setForm((prev) => ({ ...prev, receipt_doc_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
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
          {expenses.map((expense) => (
            <div key={expense.id} className="rounded border border-foreground/10 p-3 text-sm">
              <div className="font-medium">{expense.payee}</div>
              <div className="text-xs text-foreground/70">
                {formatCurrency(expense.amount)} • {expense.status} • {formatDateTime(expense.purchased_at)}
              </div>
              {expense.description ? (
                <div className="text-xs text-foreground/70">{expense.description}</div>
              ) : null}
            </div>
          ))}
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
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm">
          Fiscal year
          <input
            type="number"
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

function GrantCyclesPanel() {
  const [cycles, setCycles] = useState<GrantCycle[]>([]);
  const [status, setStatus] = useState<string>("");
  const [form, setForm] = useState({ name: "", opens_at: "", closes_at: "", max_amount: "", board_meeting_target_id: "" });

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
      const maxAmount = Number(form.max_amount);
      if (!Number.isFinite(maxAmount) || maxAmount <= 0) {
        setStatus("Max amount must be greater than 0");
        return;
      }

      const payload = {
        name: form.name,
        opens_at: new Date(form.opens_at).toISOString(),
        closes_at: new Date(form.closes_at).toISOString(),
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
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}
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
            value={form.board_meeting_target_id}
            onChange={(event) => setForm((prev) => ({ ...prev, board_meeting_target_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
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
          {cycles.map((cycle) => (
            <div key={cycle.id} className="rounded border border-foreground/10 p-3 text-sm">
              <div className="font-medium">{cycle.name}</div>
              <div className="text-xs text-foreground/70">
                {formatDateTime(cycle.opens_at)} → {formatDateTime(cycle.closes_at)} • Max {formatCurrency(cycle.max_amount)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function GrantApplicationsPanel({ isFinanceAdmin }: { isFinanceAdmin: boolean }) {
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
        setStatus("Cycle ID is required");
        return;
      }
      if (!form.applicant_type.trim()) {
        setStatus("Applicant type is required");
        return;
      }
      if (!form.title.trim()) {
        setStatus("Title is required");
        return;
      }
      if (!form.doc_id.trim()) {
        setStatus("Doc ID is required");
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
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}

      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Cycle ID
          <input
            type="text"
            value={form.cycle_id}
            onChange={(event) => setForm((prev) => ({ ...prev, cycle_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Applicant type
          <input
            type="text"
            value={form.applicant_type}
            onChange={(event) => setForm((prev) => ({ ...prev, applicant_type: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm">
          Club ID (optional)
          <input
            type="text"
            value={form.club_id}
            onChange={(event) => setForm((prev) => ({ ...prev, club_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
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
            value={form.amount_requested}
            onChange={(event) => setForm((prev) => ({ ...prev, amount_requested: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-sm sm:col-span-2">
          Doc ID (grant application file)
          <input
            type="text"
            value={form.doc_id}
            onChange={(event) => setForm((prev) => ({ ...prev, doc_id: event.target.value }))}
            className="mt-1 w-full rounded border border-foreground/20 bg-background px-2 py-1 text-sm"
          />
        </label>
        <div className="sm:col-span-2 space-y-2">
          <div className="text-sm font-medium">Breakdown</div>
          {breakdown.map((item, idx) => (
            <div key={idx} className="flex flex-wrap gap-2">
              <input
                type="text"
                placeholder="Description"
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
          {applications.map((app) => (
            <div key={app.id} className="rounded border border-foreground/10 p-3 text-sm">
              <div className="font-medium">{app.title}</div>
              <div className="text-xs text-foreground/70">
                {formatCurrency(app.amount_requested)} • {app.state}
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {app.state === "draft" ? (
                  <Button type="button" size="sm" onClick={() => submitApplication(app.id)}>
                    Submit
                  </Button>
                ) : null}
                {isFinanceAdmin && app.state === "submitted" ? (
                  <>
                    <Button type="button" variant="outline" size="sm" onClick={() => reviewApplication(app.id, "approved")}
                    >
                      Approve
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => reviewApplication(app.id, "denied")}
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
          ))}
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
      {status ? <div className="text-sm text-foreground/70">{status}</div> : null}
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
