"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type AuditLogRow = {
  id: string;
  occurred_at: string;
  actor_user_id: string | null;
  action_key: string;
  target_type: string | null;
  target_id: string | null;
  metadata: Record<string, unknown>;
  actor_display_name?: string | null;
  actor_email?: string | null;
};

type AuditLogResponse = {
  logs: AuditLogRow[];
  actionKeys: string[];
  targetTypes: string[];
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
  };
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatMetadata(metadata: Record<string, unknown>): string {
  if (Object.keys(metadata).length === 0) return "—";
  return JSON.stringify(metadata, null, 2);
}

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [actionKeys, setActionKeys] = useState<string[]>([]);
  const [targetTypes, setTargetTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Filters
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterActor, setFilterActor] = useState<string>("");
  const [filterTargetType, setFilterTargetType] = useState<string>("");
  const [filterTargetId, setFilterTargetId] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  const loadLogs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams({ limit: String(limit), offset: String(currentOffset) });
      if (filterAction) params.set("action_key", filterAction);
      if (filterActor) params.set("actor", filterActor);
      if (filterTargetType) params.set("target_type", filterTargetType);
      if (filterTargetId) params.set("target_id", filterTargetId);
      if (filterStartDate) params.set("start", new Date(filterStartDate).toISOString());
      if (filterEndDate) params.set("end", new Date(filterEndDate + "T23:59:59").toISOString());

      const data = await fetchJson<AuditLogResponse>(`/api/admin/audit-log?${params}`);
      
      if (reset) {
        setLogs(data.logs);
        setOffset(limit);
      } else {
        setLogs((prev) => [...prev, ...data.logs]);
        setOffset((prev) => prev + limit);
      }
      setHasMore(data.pagination.hasMore);
      setActionKeys(data.actionKeys);
      setTargetTypes(data.targetTypes);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [offset, filterAction, filterActor, filterTargetType, filterTargetId, filterStartDate, filterEndDate]);

  useEffect(() => {
    void loadLogs(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilter = () => {
    setOffset(0);
    void loadLogs(true);
  };

  const handleRefresh = () => {
    setOffset(0);
    void loadLogs(true);
  };

  const handleClearFilters = () => {
    setFilterAction("");
    setFilterActor("");
    setFilterTargetType("");
    setFilterTargetId("");
    setFilterStartDate("");
    setFilterEndDate("");
    setOffset(0);
    void loadLogs(true);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="rounded-md border p-4 space-y-4">
        <h2 className="text-lg font-semibold">Filters</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-7">
          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Action</div>
            <select
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <option value="">All actions</option>
              {actionKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Actor</div>
            <input
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={filterActor}
              onChange={(e) => setFilterActor(e.target.value)}
              placeholder="Name or email..."
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Target type</div>
            <select
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={filterTargetType}
              onChange={(e) => setFilterTargetType(e.target.value)}
            >
              <option value="">All targets</option>
              {targetTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Target ID</div>
            <input
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={filterTargetId}
              onChange={(e) => setFilterTargetId(e.target.value)}
              placeholder="Exact ID..."
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">Start date</div>
            <input
              type="date"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={filterStartDate}
              onChange={(e) => setFilterStartDate(e.target.value)}
            />
          </label>

          <label className="space-y-1 text-sm">
            <div className="text-foreground/70">End date</div>
            <input
              type="date"
              className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
              value={filterEndDate}
              onChange={(e) => setFilterEndDate(e.target.value)}
            />
          </label>

          <div className="flex items-end gap-2">
            <Button onClick={handleFilter} disabled={loading}>
              Apply
            </Button>
            <Button variant="outline" onClick={handleClearFilters} disabled={loading}>
              Clear
            </Button>
            <Button variant="ghost" onClick={handleRefresh} disabled={loading}>
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Log table */}
      <div className="rounded-md border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Time</th>
              <th className="px-4 py-2 text-left font-medium">Action</th>
              <th className="px-4 py-2 text-left font-medium">Actor</th>
              <th className="px-4 py-2 text-left font-medium">Target</th>
              <th className="px-4 py-2 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody>
            {loading && logs.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground/60">
                  Loading audit log entries...
                </td>
              </tr>
            )}
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-foreground/60">
                  No audit log entries found.
                </td>
              </tr>
            )}
            {logs.map((log) => (
              <tr key={log.id} className="border-t">
                <td className="px-4 py-2 whitespace-nowrap">{formatDate(log.occurred_at)}</td>
                <td className="px-4 py-2">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{log.action_key}</code>
                </td>
                <td className="px-4 py-2">
                  {log.actor_display_name || log.actor_email || log.actor_user_id?.slice(0, 8) || (
                    <span className="text-foreground/50">System</span>
                  )}
                </td>
                <td className="px-4 py-2">
                  {log.target_type && (
                    <span className="text-foreground/70">
                      {log.target_type}
                      {log.target_id && (
                        <span className="text-foreground/50"> / {log.target_id.slice(0, 8)}...</span>
                      )}
                    </span>
                  )}
                  {!log.target_type && <span className="text-foreground/50">—</span>}
                </td>
                <td className="px-4 py-2 max-w-xs">
                  {Object.keys(log.metadata).length > 0 ? (
                    <details className="cursor-pointer">
                      <summary className="text-foreground/70 hover:text-foreground">
                        View metadata
                      </summary>
                      <pre className="mt-2 rounded bg-muted p-2 text-xs overflow-auto max-h-40">
                        {formatMetadata(log.metadata)}
                      </pre>
                    </details>
                  ) : (
                    <span className="text-foreground/50">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex justify-center gap-4">
        {loading && <div className="text-foreground/60">Loading...</div>}
        {!loading && hasMore && (
          <Button variant="outline" onClick={() => loadLogs(false)} disabled={loading}>
            Load more
          </Button>
        )}
        {!loading && !hasMore && logs.length > 0 && (
          <div className="text-foreground/60 text-sm">All entries loaded ({logs.length} total)</div>
        )}
        {!loading && logs.length > 0 && hasMore && (
          <div className="text-foreground/60 text-sm">Loaded {logs.length} entries</div>
        )}
      </div>
    </div>
  );
}
