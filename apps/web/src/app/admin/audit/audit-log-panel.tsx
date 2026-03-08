"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminStatStrip } from "@/components/admin/admin-stat-strip";
import { AdminSurface } from "@/components/admin/admin-surface";
import { AdminToolbar } from "@/components/admin/admin-toolbar";
import type { AdminStat } from "@/components/admin/admin-types";
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

function toCsvValue(value: string | number | null | undefined): string {
  const stringValue = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function buildAuditCsv(rows: AuditLogRow[]): string {
  const headers = [
    "Occurred At",
    "Action Key",
    "Actor Name",
    "Actor Email",
    "Actor User ID",
    "Target Type",
    "Target ID",
    "Metadata",
  ];
  const lines = rows.map((row) => [
    row.occurred_at,
    row.action_key,
    row.actor_display_name ?? "",
    row.actor_email ?? "",
    row.actor_user_id ?? "",
    row.target_type ?? "",
    row.target_id ?? "",
    Object.keys(row.metadata).length > 0 ? JSON.stringify(row.metadata) : "",
  ]);
  return [headers, ...lines].map((line) => line.map(toCsvValue).join(",")).join("\n");
}

function normalizeDateParam(value: string | null): string {
  if (!value) return "";
  if (value.length >= 10) return value.slice(0, 10);
  return value;
}

export function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [actionKeys, setActionKeys] = useState<string[]>([]);
  const [targetTypes, setTargetTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const [filtersReady, setFiltersReady] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  // Filters
  const [filterAction, setFilterAction] = useState<string>("");
  const [filterActor, setFilterActor] = useState<string>("");
  const [filterTargetType, setFilterTargetType] = useState<string>("");
  const [filterTargetId, setFilterTargetId] = useState<string>("");
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");

  const buildFilterParams = useCallback(() => {
    const params = new URLSearchParams();
    if (filterAction) params.set("action_key", filterAction);
    if (filterActor) params.set("actor", filterActor);
    if (filterTargetType) params.set("target_type", filterTargetType);
    if (filterTargetId) params.set("target_id", filterTargetId);
    if (filterStartDate) params.set("start", filterStartDate);
    if (filterEndDate) params.set("end", filterEndDate);
    return params;
  }, [filterAction, filterActor, filterTargetId, filterTargetType, filterEndDate, filterStartDate]);

  const syncUrl = useCallback(() => {
    const params = buildFilterParams();
    const query = params.toString();
    const next = query ? `?${query}` : "";
    window.history.replaceState(null, "", `${window.location.pathname}${next}`);
  }, [buildFilterParams]);

  const loadLogs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      const params = buildFilterParams();
      params.set("limit", String(limit));
      params.set("offset", String(currentOffset));
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
  }, [offset, limit, filterStartDate, filterEndDate, buildFilterParams]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFilterAction(params.get("action_key") ?? "");
    setFilterActor(params.get("actor") ?? "");
    setFilterTargetType(params.get("target_type") ?? "");
    setFilterTargetId(params.get("target_id") ?? "");
    setFilterStartDate(normalizeDateParam(params.get("start")));
    setFilterEndDate(normalizeDateParam(params.get("end")));
    setFiltersReady(true);
  }, []);

  useEffect(() => {
    if (!filtersReady) return;
    void loadLogs(true);
  }, [filtersReady, loadLogs, reloadToken]);

  const handleFilter = () => {
    setOffset(0);
    setReloadToken((prev) => prev + 1);
    syncUrl();
  };

  const handleRefresh = () => {
    setOffset(0);
    setReloadToken((prev) => prev + 1);
  };

  const handleClearFilters = () => {
    setFilterAction("");
    setFilterActor("");
    setFilterTargetType("");
    setFilterTargetId("");
    setFilterStartDate("");
    setFilterEndDate("");
    setOffset(0);
    setReloadToken((prev) => prev + 1);
    window.history.replaceState(null, "", window.location.pathname);
  };

  const summary = useMemo(() => {
    const total = logs.length;
    const actors = new Set<string>();
    logs.forEach((log) => {
      actors.add(log.actor_user_id ?? log.actor_email ?? log.actor_display_name ?? "system");
    });
    const newest = logs[0]?.occurred_at ?? "";
    const oldest = logs[logs.length - 1]?.occurred_at ?? "";
    return { total, uniqueActors: actors.size, newest, oldest };
  }, [logs]);

  const summaryRange = summary.total ? `${formatDate(summary.oldest)} → ${formatDate(summary.newest)}` : "—";
  const stats: AdminStat[] = [
    { id: "audit-total", label: "Loaded entries", value: String(summary.total), detail: loading ? "Refreshing…" : "Current client-side result set" },
    { id: "audit-actors", label: "Unique actors", value: String(summary.uniqueActors), detail: "People or systems represented in the loaded logs" },
    { id: "audit-range", label: "Range", value: summary.total ? formatDate(summary.newest) : "—", detail: summaryRange },
    { id: "audit-more", label: "More pages", value: hasMore ? "Available" : "Complete", detail: hasMore ? "Load more to extend the window" : "All loaded entries are visible" },
  ];

  function handleExportCsv() {
    if (logs.length === 0) {
      toast.error("No logs to export");
      return;
    }
    const csv = buildAuditCsv(logs);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success("CSV downloaded");
  }

  async function handleCopyFilterLink() {
    const params = buildFilterParams();
    const query = params.toString();
    const url = `${window.location.origin}${window.location.pathname}${query ? `?${query}` : ""}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Filter link copied");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to copy link");
    }
  }

  return (
    <div className="space-y-5">
      <AdminStatStrip stats={stats} />

      <AdminSurface
        title="Filters"
        description="Keep the filter wall tucked away until you need it, then save or share the exact slice you are reviewing."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopyFilterLink}>
              Copy filter link
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportCsv} disabled={logs.length === 0}>
              Export CSV
            </Button>
          </div>
        }
      >
        <details open={summary.total === 0}>
          <summary className="px-1 py-1 text-sm font-medium text-foreground/72">
            Show filters
          </summary>
          <div className="mt-4">
            <AdminToolbar
              primary={
                <>
                  <Button onClick={handleFilter} disabled={loading}>
                    Apply
                  </Button>
                  <Button variant="outline" onClick={handleClearFilters} disabled={loading}>
                    Clear
                  </Button>
                  <Button variant="ghost" onClick={handleRefresh} disabled={loading}>
                    Refresh
                  </Button>
                </>
              }
            >
              <label className="space-y-1 text-sm">
                <div className="text-foreground/62">Action</div>
                <select
                  className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
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
                <div className="text-foreground/62">Actor</div>
                <input
                  className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
                  value={filterActor}
                  onChange={(e) => setFilterActor(e.target.value)}
                  placeholder="Name or email..."
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-foreground/62">Target type</div>
                <select
                  className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
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
                <div className="text-foreground/62">Target ID</div>
                <input
                  className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
                  value={filterTargetId}
                  onChange={(e) => setFilterTargetId(e.target.value)}
                  placeholder="Exact ID..."
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-foreground/62">Start date</div>
                <input
                  type="date"
                  className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                />
              </label>
              <label className="space-y-1 text-sm">
                <div className="text-foreground/62">End date</div>
                <input
                  type="date"
                  className="h-10 w-full rounded-xl border bg-transparent px-3 text-sm"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                />
              </label>
            </AdminToolbar>
          </div>
        </details>
      </AdminSurface>

      <AdminSurface
        title="Activity log"
        description="Review the loaded activity set, then expand metadata only for the rows that matter."
        action={
          !loading && hasMore ? (
            <Button variant="outline" onClick={() => loadLogs(false)} disabled={loading}>
              Load more
            </Button>
          ) : null
        }
      >
        {loading && logs.length === 0 ? (
          <AdminEmptyState title="Loading audit log entries" description="The client is fetching the first page of activity." />
        ) : logs.length === 0 ? (
          <AdminEmptyState title="No audit log entries found" description="Adjust the filters or clear them to widen the search window." />
        ) : (
          <>
            <div className="space-y-3 md:hidden">
              {logs.map((log) => (
                <div key={log.id} className="rounded-2xl border border-black/6 bg-[color:var(--admin-surface-raised)] p-4 dark:border-white/8">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium">{log.actor_display_name || log.actor_email || log.actor_user_id?.slice(0, 8) || "System"}</div>
                      <div className="mt-1 text-xs text-foreground/60">{formatDate(log.occurred_at)}</div>
                    </div>
                    <code className="rounded-full bg-black/6 px-2.5 py-1 text-[0.7rem] dark:bg-white/8">{log.action_key}</code>
                  </div>
                  <div className="mt-3 text-xs text-foreground/65">
                    {log.target_type ? `${log.target_type}${log.target_id ? ` / ${log.target_id.slice(0, 8)}...` : ""}` : "No target"}
                  </div>
                  {Object.keys(log.metadata).length > 0 ? (
                    <details className="mt-3">
                      <summary className="text-xs font-medium text-foreground/72">View metadata</summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-muted p-3 text-xs">
                        {formatMetadata(log.metadata)}
                      </pre>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="hidden overflow-auto md:block">
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
                        {log.target_type ? (
                          <span className="text-foreground/70">
                            {log.target_type}
                            {log.target_id ? (
                              <span className="text-foreground/50"> / {log.target_id.slice(0, 8)}...</span>
                            ) : null}
                          </span>
                        ) : (
                          <span className="text-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-4 py-2 max-w-xs">
                        {Object.keys(log.metadata).length > 0 ? (
                          <details className="cursor-pointer">
                            <summary className="text-foreground/70 hover:text-foreground">
                              View metadata
                            </summary>
                            <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs">
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
          </>
        )}

        <div className="mt-4 flex justify-center gap-4">
          {loading ? <div className="text-foreground/60">Loading...</div> : null}
          {!loading && !hasMore && logs.length > 0 ? (
            <div className="text-foreground/60 text-sm">All entries loaded ({logs.length} total)</div>
          ) : null}
          {!loading && logs.length > 0 && hasMore ? (
            <div className="text-foreground/60 text-sm">Loaded {logs.length} entries</div>
          ) : null}
        </div>
      </AdminSurface>
    </div>
  );
}
