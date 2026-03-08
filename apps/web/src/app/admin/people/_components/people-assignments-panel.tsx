"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminField } from "@/components/admin/admin-field";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";
import type { AssignmentRow, TermRow, UserRow } from "@/lib/admin/server";

import { PeopleSectionNav } from "./people-section-nav";

type AssignmentWithDisplay = AssignmentRow & {
  display_title?: string | null;
};

type AssignmentsPanelProps = {
  users: UserRow[];
  terms: TermRow[];
  initialSelectedTermId: string;
  initialGlobalAssignments: AssignmentRow[];
  initialTermAssignments: AssignmentRow[];
};

const ROLE_OPTIONS = [
  { value: "advisor", label: "Advisor" },
  { value: "president", label: "President" },
  { value: "executive", label: "Executive" },
  { value: "board_member", label: "Board member" },
  { value: "volunteer", label: "Volunteer" },
] as const;

function formatUserLabel(user: UserRow | undefined) {
  if (!user) return "Unknown member";
  return user.display_name?.trim() || user.email?.trim() || user.id.slice(0, 8);
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? `Request failed: ${response.status}`);
  return payload;
}

export function PeopleAssignmentsPanel({
  users,
  terms,
  initialSelectedTermId,
  initialGlobalAssignments,
  initialTermAssignments,
}: AssignmentsPanelProps) {
  const [selectedTermId, setSelectedTermId] = useState(initialSelectedTermId);
  const [globalAssignments, setGlobalAssignments] = useState<AssignmentWithDisplay[]>(initialGlobalAssignments);
  const [termAssignments, setTermAssignments] = useState<AssignmentWithDisplay[]>(initialTermAssignments);
  const [feedback, setFeedback] = useState<{ tone: "positive" | "warning"; message: string } | null>(null);
  const [loadingAssignments, setLoadingAssignments] = useState(false);

  const [userId, setUserId] = useState("");
  const [roleKey, setRoleKey] = useState<string>("president");
  const [displayTitle, setDisplayTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeAssignmentId, setActiveAssignmentId] = useState("");

  const userMap = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);
  const selectedTerm = useMemo(() => terms.find((term) => term.id === selectedTermId) ?? null, [terms, selectedTermId]);

  async function refreshAssignments(termId: string) {
    setLoadingAssignments(true);
    try {
      const [globalResponse, termResponse] = await Promise.all([
        fetchJson<{ assignments: AssignmentWithDisplay[] }>("/api/admin/role-assignments?scope=global&roleKey=advisor&activeOnly=1"),
        termId
          ? fetchJson<{ assignments: AssignmentWithDisplay[] }>(
              `/api/admin/role-assignments?termId=${encodeURIComponent(termId)}&activeOnly=1`,
            )
          : Promise.resolve({ assignments: [] }),
      ]);
      setGlobalAssignments(globalResponse.assignments);
      setTermAssignments(termResponse.assignments);
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not reload assignments." });
    } finally {
      setLoadingAssignments(false);
    }
  }

  async function handleCreateAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      await fetchJson<{ assignment: AssignmentWithDisplay }>("/api/admin/role-assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId,
          roleKey,
          termId: roleKey === "advisor" ? null : selectedTermId,
          displayTitle: roleKey === "executive" ? displayTitle : undefined,
        }),
      });
      await refreshAssignments(selectedTermId);
      const addedUser = userMap.get(userId);
      setFeedback({
        tone: "positive",
        message: `${formatUserLabel(addedUser)} now has an active ${roleKey.replace("_", " ")} assignment.`,
      });
      setUserId("");
      setDisplayTitle("");
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not create assignment." });
    } finally {
      setSubmitting(false);
    }
  }

  async function revokeAssignment(assignmentId: string) {
    if (!window.confirm("End this assignment?")) return;

    setActiveAssignmentId(assignmentId);
    setFeedback(null);

    try {
      await fetchJson("/api/admin/role-assignments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      });
      await refreshAssignments(selectedTermId);
      setFeedback({ tone: "positive", message: "Assignment ended." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not revoke assignment." });
    } finally {
      setActiveAssignmentId("");
    }
  }

  return (
    <div className="space-y-8">
      <PeopleSectionNav activeId="assignments" />

      {feedback ? <AdminInlineNotice tone={feedback.tone}>{feedback.message}</AdminInlineNotice> : null}

      <AdminSurface
        title="Assign a role"
        description="Choose the member, keep the role explicit, and avoid spreading assignment changes across several panels."
      >
        <form className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_13rem_13rem_minmax(0,1fr)_auto]" onSubmit={handleCreateAssignment}>
          <AdminField label="Member">
            <select value={userId} onChange={(event) => setUserId(event.target.value)}>
              <option value="">Choose a member</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {formatUserLabel(user)}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Role">
            <select value={roleKey} onChange={(event) => setRoleKey(event.target.value)}>
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Term" hint={roleKey === "advisor" ? "Not used for Advisor" : selectedTerm?.name ?? "Choose term"}>
            <select value={selectedTermId} onChange={(event) => setSelectedTermId(event.target.value)} disabled={roleKey === "advisor"}>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Executive title" hint={roleKey === "executive" ? "Optional" : "Only used for Executive"}>
            <input
              value={displayTitle}
              onChange={(event) => setDisplayTitle(event.target.value)}
              placeholder="Board Affairs, Finance, etc."
              disabled={roleKey !== "executive"}
            />
          </AdminField>
          <div className="flex items-end">
            <Button className="h-12 rounded-full px-5" type="submit" disabled={submitting || userId.length === 0}>
              {submitting ? "Saving..." : "Add assignment"}
            </Button>
          </div>
        </form>
      </AdminSurface>

      <AdminSurface
        title="Active assignments"
        description="Keep the current term in view, with global advisors separated so the roster reads cleanly."
        action={
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground/55">{loadingAssignments ? "Refreshing..." : `${termAssignments.length + globalAssignments.length} active`}</span>
            <select
              value={selectedTermId}
              onChange={async (event) => {
                const nextTermId = event.target.value;
                setSelectedTermId(nextTermId);
                await refreshAssignments(nextTermId);
              }}
            >
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </div>
        }
      >
        <div className="grid gap-6 xl:grid-cols-2">
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Global advisors</h3>
              <p className="text-sm leading-7 text-foreground/58">Always visible outside term scoping.</p>
            </div>
            {globalAssignments.length === 0 ? (
              <AdminEmptyState title="No global advisors yet" description="Advisor assignments appear here when they are active." />
            ) : (
              <div className="admin-data-list">
                {globalAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-[1.3rem] border border-[var(--admin-border-soft)] bg-white/75 px-4 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-base font-semibold text-foreground">{formatUserLabel(userMap.get(assignment.user_id))}</div>
                        <div className="mt-1 text-sm text-foreground/58">Advisor role · Started {new Date(assignment.starts_at).toLocaleDateString()}</div>
                      </div>
                      <Button
                        variant="ghost"
                        className="h-11 rounded-full px-4"
                        disabled={activeAssignmentId === assignment.id}
                        onClick={() => revokeAssignment(assignment.id)}
                      >
                        {activeAssignmentId === assignment.id ? "Ending..." : "End"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{selectedTerm?.name ?? "Selected term"} roster</h3>
              <p className="text-sm leading-7 text-foreground/58">Term-scoped board, executive, and volunteer assignments stay here.</p>
            </div>
            {termAssignments.length === 0 ? (
              <AdminEmptyState title="No active term assignments" description="Add a role above to start the roster for this term." />
            ) : (
              <div className="admin-data-list">
                {termAssignments.map((assignment) => (
                  <div key={assignment.id} className="rounded-[1.3rem] border border-[var(--admin-border-soft)] bg-white/75 px-4 py-4">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-base font-semibold text-foreground">{formatUserLabel(userMap.get(assignment.user_id))}</div>
                        <div className="mt-1 text-sm text-foreground/58">
                          {assignment.role_key.replace("_", " ")} · Started {new Date(assignment.starts_at).toLocaleDateString()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        className="h-11 rounded-full px-4"
                        disabled={activeAssignmentId === assignment.id}
                        onClick={() => revokeAssignment(assignment.id)}
                      >
                        {activeAssignmentId === assignment.id ? "Ending..." : "End"}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </AdminSurface>
    </div>
  );
}
