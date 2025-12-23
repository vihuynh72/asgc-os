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

  const committeesById = useMemo(() => {
    const m = new Map<string, CommitteeRow>();
    for (const c of committees) m.set(c.id, c);
    return m;
  }, [committees]);

  async function reload() {
    const { projects: p } = await fetchJson<{ projects: ProjectRow[] }>("/api/projects");
    setProjects(p);
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!committeeId) {
      setStatus("Pick a committee first.");
      return;
    }

    setStatus("Creating project...");
    try {
      await fetchJson<{ project: ProjectRow }>("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ committeeId, name }),
      });
      setName("");
      setStatus("");
      await reload();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to create project");
    }
  }

  async function archive(projectId: string) {
    setStatus("Saving...");
    try {
      const { project } = await fetchJson<{ project: ProjectRow }>(`/api/projects/${encodeURIComponent(projectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "archived" }),
      });
      setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
      setStatus("");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Failed to archive");
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

        <div className="rounded-md border">
          <div className="divide-y">
            {projects.length === 0 ? (
              <div className="px-3 py-2 text-sm text-foreground/70">No projects yet.</div>
            ) : (
              projects.map((p) => {
                const committee = committeesById.get(p.committee_id);
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="text-xs text-foreground/70">
                        {committee ? committee.name : p.committee_id}
                        {p.status === "archived" ? " • Archived" : ""}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        className="text-sm underline underline-offset-4 hover:text-foreground/80"
                        href={`/tasks?projectId=${encodeURIComponent(p.id)}`}
                      >
                        View tasks
                      </Link>

                      {p.status === "active" ? (
                        <Button variant="ghost" onClick={() => void archive(p.id)}>
                          Archive
                        </Button>
                      ) : null}
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
