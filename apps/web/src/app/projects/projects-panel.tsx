"use client";

import Link from "next/link";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

type CommitteeRow = {
  id: string;
  committee_key: string;
  name: string;
};

type ProjectRow = {
  id: string;
  committee_id: string;
  name: string;
  status: "active" | "archived";
  created_by: string;
  created_at: string;
  updated_at: string;
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = (await res.json().catch(() => ({}))) as T;
  if (!res.ok) {
    const message = (data as { error?: string }).error || `Request failed: ${res.status}`;
    throw new Error(message);
  }
  return data;
}

export function ProjectsPanel({ initialProjects, committees }: { initialProjects: ProjectRow[]; committees: CommitteeRow[] }) {
  const [projects, setProjects] = useState<ProjectRow[]>(initialProjects);
  const [status, setStatus] = useState<string>("");

  const [committeeId, setCommitteeId] = useState<string>(committees[0]?.id ?? "");
  const [name, setName] = useState<string>("");

  const [filterQuery, setFilterQuery] = useState<string>("");
  const [filterCommitteeId, setFilterCommitteeId] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "archived">("all");
  const [sortKey, setSortKey] = useState<"recent" | "name">("recent");
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editName, setEditName] = useState<string>("");
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const committeesById = useMemo(() => {
    const m = new Map<string, CommitteeRow>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  const projectCounts = useMemo(() => {
    const counts = { active: 0, archived: 0 };
    for (const project of projects) {
      counts[project.status] += 1;
    }
    return counts;
  }, [projects]);

  const filteredProjects = useMemo(() => {
    const query = filterQuery.trim().toLowerCase();
    let next = projects;

    if (filterCommitteeId) {
      next = next.filter((p) => p.committee_id === filterCommitteeId);
    }

    if (filterStatus !== "all") {
      next = next.filter((p) => p.status === filterStatus);
    }

    if (query) {
      next = next.filter((p) => {
        const committeeName = committeesById.get(p.committee_id)?.name ?? "";
        const haystack = `${p.name} ${committeeName}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    const sorted = [...next];
    if (sortKey === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      sorted.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    }

    return sorted;
  }, [committeesById, filterCommitteeId, filterQuery, filterStatus, projects, sortKey]);

  const pageCount = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const resolvedPage = Math.min(page, pageCount);
  const paginatedProjects = useMemo(() => {
    const start = (resolvedPage - 1) * pageSize;
    return filteredProjects.slice(start, start + pageSize);
  }, [filteredProjects, pageSize, resolvedPage]);

  async function reload() {
    const { projects: p } = await fetchJson<{ projects: ProjectRow[] }>("/api/projects");
    setProjects(p);
  }

  async function handleCopy(text: string, label: string) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`${label} copied.`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : `Failed to copy ${label.toLowerCase()}.`);
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!committeeId) {
      setStatus("Pick a committee first.");
      return;
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      setStatus("Project name required.");
      return;
    }

    const duplicate = projects.find(
      (p) => p.committee_id === committeeId && p.name.toLowerCase() === trimmedName.toLowerCase() && p.status === "active",
    );
    if (duplicate) {
      setStatus("An active project with that name already exists.");
      return;
    }

    setStatus("Creating project...");
    try {
      await fetchJson<{ project: ProjectRow }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ committeeId, name: trimmedName }),
      });
      setName("");
      setStatus("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create project");
    }
  }

  function startEditing(project: ProjectRow) {
    setEditingProjectId(project.id);
    setEditName(project.name);
  }

  function cancelEditing() {
    setEditingProjectId(null);
    setEditName("");
  }

  async function saveName(projectId: string) {
    const trimmed = editName.trim();
    if (!trimmed) {
      setStatus("Project name required.");
      return;
    }
    setIsSaving(true);
    setStatus("Saving...");
    try {
      const { project } = await fetchJson<{ project: ProjectRow }>(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
      setStatus("Saved.");
      cancelEditing();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  async function updateStatus(projectId: string, nextStatus: ProjectRow["status"]) {
    const project = projects.find((p) => p.id === projectId);
    const label = project?.name ? `"${project.name}"` : "this project";
    const action = nextStatus === "archived" ? "Archive" : "Unarchive";
    if (!window.confirm(`${action} ${label}?`)) return;
    setIsSaving(true);
    setStatus("Saving...");
    try {
      const { project: updated } = await fetchJson<{ project: ProjectRow }>(
        `/api/projects/${encodeURIComponent(projectId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      {status ? (
        <div className="rounded-md border px-3 py-2 text-sm text-foreground/80" role="status" aria-live="polite">
          {status}
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Create project</h2>
          <p className="text-sm text-foreground/70">Projects are committee-scoped and enforced by RLS.</p>
        </div>

        {committees.length === 0 ? (
          <div className="rounded-md border px-3 py-2 text-sm text-foreground/70">No committee memberships found.</div>
        ) : (
          <form className="grid gap-3 md:grid-cols-5" onSubmit={onCreate}>
            <label className="space-y-1 text-sm md:col-span-2">
              <div className="text-foreground/70">Committee</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={committeeId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => setCommitteeId(e.target.value)}
              >
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm md:col-span-3">
              <div className="text-foreground/70">Name</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={name}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
                placeholder="e.g., Winter Welcome Week"
              />
            </label>

            <div className="flex items-end md:col-span-5">
              <Button type="submit" disabled={!name.trim() || !committeeId}>
                Create
              </Button>
            </div>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Projects</h2>
          <p className="text-sm text-foreground/70">Open the project’s tasks via the Tasks page filter.</p>
        </div>

        <div className="rounded-md border p-3">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Search</div>
              <input
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={filterQuery}
                onChange={(e: ChangeEvent<HTMLInputElement>) => {
                  setFilterQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Project name or committee..."
              />
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Committee</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={filterCommitteeId}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setFilterCommitteeId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {committees.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Status</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={filterStatus}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setFilterStatus(e.target.value as "all" | "active" | "archived");
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <div className="text-foreground/70">Sort</div>
              <select
                className="h-9 w-full rounded-md border bg-transparent px-2 text-sm"
                value={sortKey}
                onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                  setSortKey(e.target.value as typeof sortKey);
                  setPage(1);
                }}
              >
                <option value="recent">Recently updated</option>
                <option value="name">Name</option>
              </select>
            </label>
          </div>

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-foreground/60">
            <div className="flex flex-wrap items-center gap-3">
              <span>
                Showing {paginatedProjects.length} of {filteredProjects.length} filtered ({projects.length} total)
              </span>
              <span>Active {projectCounts.active}</span>
              <span>Archived {projectCounts.archived}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2">
                <span>Rows</span>
                <select
                  className="h-8 rounded-md border bg-transparent px-2 text-xs"
                  value={pageSize}
                  onChange={(e: ChangeEvent<HTMLSelectElement>) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </label>
              <span>
                Page {resolvedPage} of {pageCount}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(Math.max(1, resolvedPage - 1))}
                disabled={resolvedPage <= 1}
              >
                Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage(Math.min(pageCount, resolvedPage + 1))}
                disabled={resolvedPage >= pageCount}
              >
                Next
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void reload()}>
                Refresh list
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFilterQuery("");
                  setFilterCommitteeId("");
                  setFilterStatus("all");
                  setSortKey("recent");
                  setPage(1);
                }}
                disabled={
                  !filterQuery &&
                  !filterCommitteeId &&
                  filterStatus === "all" &&
                  sortKey === "recent"
                }
              >
                Clear filters
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-md border">
          <div className="divide-y">
            {projects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground/70">No projects yet.</div>
            ) : filteredProjects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground/70">
                No projects match the current filters.
              </div>
            ) : (
              paginatedProjects.map((p) => {
                const committee = committeesById.get(p.committee_id);
                const isEditing = editingProjectId === p.id;
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      {isEditing ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            className="h-9 w-full max-w-sm rounded-md border bg-transparent px-2 text-sm"
                            value={editName}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => setEditName(e.target.value)}
                            aria-label="Project name"
                          />
                          <Button
                            size="sm"
                            onClick={() => void saveName(p.id)}
                            disabled={isSaving || !editName.trim()}
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={cancelEditing}
                            disabled={isSaving}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="truncate text-sm font-medium">{p.name}</div>
                          <div className="text-xs text-foreground/70">
                            {committee ? committee.name : p.committee_id}
                            {p.status === "archived" ? " • Archived" : ""}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="text-sm underline underline-offset-4 hover:text-foreground/80"
                        href={`/tasks?projectId=${encodeURIComponent(p.id)}`}
                      >
                        View tasks
                      </Link>
                      <Button variant="ghost" size="sm" onClick={() => void handleCopy(p.id, "Project ID")}>
                        Copy ID
                      </Button>
                      {isEditing ? null : (
                        <Button variant="ghost" size="sm" onClick={() => startEditing(p)} disabled={isSaving}>
                          Rename
                        </Button>
                      )}
                      {p.status === "active" ? (
                        <Button variant="ghost" size="sm" onClick={() => void updateStatus(p.id, "archived")} disabled={isSaving}>
                          Archive
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => void updateStatus(p.id, "active")} disabled={isSaving}>
                          Unarchive
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
