"use client";

import type { FormEvent } from "react";
import { useMemo, useState } from "react";

import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminField } from "@/components/admin/admin-field";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { AdminSurface } from "@/components/admin/admin-surface";
import { Button } from "@/components/ui/button";
import type {
  BootstrapRoleGrantRow,
  InviteAllowlistRow,
  InviteBlocklistRow,
  TermRow,
  UserRow,
} from "@/lib/admin/server";

type FeedbackTone = "default" | "positive" | "warning";

type AccessFeedback = {
  tone: FeedbackTone;
  message: string;
};

type PeopleInvitesPanelProps = {
  terms: TermRow[];
  users: UserRow[];
  initialInvites: InviteAllowlistRow[];
  initialBlocklist: InviteBlocklistRow[];
  initialGrants: BootstrapRoleGrantRow[];
};

const ROLE_OPTIONS = [
  { value: "advisor", label: "Advisor" },
  { value: "president", label: "President" },
  { value: "executive", label: "Executive" },
  { value: "board_member", label: "Board member" },
  { value: "volunteer", label: "Volunteer" },
] as const;

function normalizeEmailKey(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function termLabel(termId: string | null, terms: TermRow[]) {
  if (!termId) return "Global";
  return terms.find((term) => term.id === termId)?.name ?? "Unknown term";
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? `Request failed: ${response.status}`);
  }

  return payload;
}

function parseBulkEntries(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, roleKey, notes] = line.split(",").map((part) => part.trim());
      return {
        email,
        role_key: roleKey || undefined,
        notes: notes || undefined,
      };
    })
    .filter((entry) => entry.email.length > 0);
}

export function PeopleInvitesPanel({
  terms,
  users,
  initialInvites,
  initialBlocklist,
  initialGrants,
}: PeopleInvitesPanelProps) {
  const [invites, setInvites] = useState(initialInvites);
  const [blocklist, setBlocklist] = useState(initialBlocklist);
  const [grants, setGrants] = useState(initialGrants);
  const [feedback, setFeedback] = useState<AccessFeedback | null>(null);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteNotes, setInviteNotes] = useState("");
  const [inviteSubmitting, setInviteSubmitting] = useState(false);

  const [grantEmail, setGrantEmail] = useState("");
  const [grantRoleKey, setGrantRoleKey] = useState<string>("president");
  const [grantTermId, setGrantTermId] = useState<string>("");
  const [grantNotes, setGrantNotes] = useState("");
  const [grantSubmitting, setGrantSubmitting] = useState(false);

  const [blockPattern, setBlockPattern] = useState("");
  const [blockNotes, setBlockNotes] = useState("");
  const [blockSubmitting, setBlockSubmitting] = useState(false);

  const [bulkText, setBulkText] = useState("");
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [activeInviteAction, setActiveInviteAction] = useState<string>("");
  const [activeGrantAction, setActiveGrantAction] = useState<string>("");
  const [activeBlockAction, setActiveBlockAction] = useState<string>("");

  const signedInEmails = useMemo(() => new Set(users.map((user) => normalizeEmailKey(user.email))), [users]);
  const currentTerm = useMemo(() => terms.find((term) => term.is_current) ?? terms[0] ?? null, [terms]);

  const exactInvites = useMemo(
    () => invites.filter((invite) => !invite.email_normalized.startsWith("@")),
    [invites],
  );
  const domainInvites = useMemo(
    () => invites.filter((invite) => invite.email_normalized.startsWith("@")),
    [invites],
  );

  const pendingInvites = useMemo(
    () =>
      exactInvites.filter(
        (invite) => invite.is_active && !signedInEmails.has(normalizeEmailKey(invite.email_normalized)),
      ),
    [exactInvites, signedInEmails],
  );

  const activeGrants = useMemo(
    () => grants.filter((grant) => grant.is_active && !grant.consumed_at),
    [grants],
  );
  const activeBlocks = useMemo(() => blocklist.filter((ban) => ban.is_active), [blocklist]);

  async function refreshAccessData() {
    const [inviteResponse, grantResponse, blockResponse] = await Promise.all([
      fetchJson<{ invites: InviteAllowlistRow[] }>("/api/admin/invites-allowlist"),
      fetchJson<{ grants: BootstrapRoleGrantRow[] }>("/api/admin/bootstrap-role-grants?limit=1000"),
      fetchJson<{ bans: InviteBlocklistRow[] }>("/api/admin/invites-blocklist"),
    ]);

    setInvites(inviteResponse.invites);
    setGrants(grantResponse.grants);
    setBlocklist(blockResponse.bans);
  }

  async function handleInviteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setInviteSubmitting(true);
    setFeedback(null);

    try {
      const { invite } = await fetchJson<{ invite: InviteAllowlistRow }>("/api/admin/invites-allowlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, notes: inviteNotes }),
      });

      setInvites((current) => [invite, ...current.filter((row) => row.id !== invite.id)]);
      setInviteEmail("");
      setInviteNotes("");
      setFeedback({ tone: "positive", message: `${invite.email} is now in the invite queue.` });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not add invite." });
    } finally {
      setInviteSubmitting(false);
    }
  }

  async function sendInviteLink(email: string) {
    setActiveInviteAction(email);
    setFeedback(null);

    try {
      await fetchJson("/api/admin/invites-allowlist/send-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, redirectTo: "/admin/people" }),
      });
      setFeedback({ tone: "positive", message: `Sent a sign-in link to ${email}.` });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not send sign-in link." });
    } finally {
      setActiveInviteAction("");
    }
  }

  async function toggleInvite(invite: InviteAllowlistRow, nextActive: boolean) {
    setActiveInviteAction(invite.id);
    setFeedback(null);

    try {
      const { invite: updated } = await fetchJson<{ invite: InviteAllowlistRow }>("/api/admin/invites-allowlist", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: invite.id,
          is_active: nextActive,
          notes: invite.notes,
        }),
      });

      setInvites((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setFeedback({
        tone: nextActive ? "positive" : "warning",
        message: `${updated.email} is now ${nextActive ? "active" : "paused"} in the invite queue.`,
      });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not update invite." });
    } finally {
      setActiveInviteAction("");
    }
  }

  async function removeInvite(id: string) {
    if (!window.confirm("Remove this invite entry?")) return;

    setActiveInviteAction(id);
    setFeedback(null);

    try {
      await fetchJson("/api/admin/invites-allowlist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setInvites((current) => current.filter((row) => row.id !== id));
      setFeedback({ tone: "positive", message: "Invite entry removed." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not remove invite." });
    } finally {
      setActiveInviteAction("");
    }
  }

  async function handleGrantSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setGrantSubmitting(true);
    setFeedback(null);

    try {
      const { grant } = await fetchJson<{ grant: BootstrapRoleGrantRow }>("/api/admin/bootstrap-role-grants", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: grantEmail,
          roleKey: grantRoleKey,
          termId: grantRoleKey === "advisor" ? null : grantTermId || undefined,
          notes: grantNotes || undefined,
        }),
      });

      setGrants((current) => [grant, ...current.filter((row) => row.id !== grant.id)]);
      setGrantEmail("");
      setGrantNotes("");
      setGrantTermId("");
      setFeedback({ tone: "positive", message: `Queued a ${grant.role_key} role grant for ${grant.email}.` });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not save role grant." });
    } finally {
      setGrantSubmitting(false);
    }
  }

  async function removeGrant(id: string) {
    if (!window.confirm("Remove this queued role grant?")) return;

    setActiveGrantAction(id);
    setFeedback(null);

    try {
      await fetchJson("/api/admin/bootstrap-role-grants", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setGrants((current) => current.filter((row) => row.id !== id));
      setFeedback({ tone: "positive", message: "Queued role grant removed." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not remove role grant." });
    } finally {
      setActiveGrantAction("");
    }
  }

  async function handleBlockSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBlockSubmitting(true);
    setFeedback(null);

    try {
      const { ban } = await fetchJson<{ ban: InviteBlocklistRow }>("/api/admin/invites-blocklist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pattern: blockPattern, notes: blockNotes || undefined }),
      });

      setBlocklist((current) => [ban, ...current.filter((row) => row.id !== ban.id)]);
      setBlockPattern("");
      setBlockNotes("");
      setFeedback({ tone: "positive", message: `${ban.pattern} is now blocked from receiving invites.` });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not update blocklist." });
    } finally {
      setBlockSubmitting(false);
    }
  }

  async function removeBlock(id: string) {
    if (!window.confirm("Delete this blocklist entry?")) return;

    setActiveBlockAction(id);
    setFeedback(null);

    try {
      await fetchJson("/api/admin/invites-blocklist", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setBlocklist((current) => current.filter((row) => row.id !== id));
      setFeedback({ tone: "positive", message: "Blocklist entry removed." });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Could not remove blocklist entry." });
    } finally {
      setActiveBlockAction("");
    }
  }

  async function handleBulkImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entries = parseBulkEntries(bulkText);

    if (entries.length === 0) {
      setFeedback({ tone: "warning", message: "Add at least one line before running the bulk import." });
      return;
    }

    setBulkSubmitting(true);
    setFeedback(null);

    try {
      const result = await fetchJson<{ allowlist_count: number; role_grants: number }>("/api/admin/bulk-import-members", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ entries }),
      });
      await refreshAccessData();
      setBulkText("");
      setFeedback({
        tone: "positive",
        message: `Imported ${result.allowlist_count} invite entries and queued ${result.role_grants} role grants.`,
      });
    } catch (error) {
      setFeedback({ tone: "warning", message: error instanceof Error ? error.message : "Bulk import failed." });
    } finally {
      setBulkSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <AdminSectionNav
        activeId="invites"
        items={[
          { id: "invites", label: "Invites", href: "/admin/people" },
          { id: "assignments", label: "Assignments", href: "/admin/people/assignments" },
          { id: "terms", label: "Terms", href: "/admin/people/terms" },
          { id: "access_audit", label: "Access Audit", href: "/admin/people/access-audit" },
        ]}
      />

      {feedback ? <AdminInlineNotice tone={feedback.tone}>{feedback.message}</AdminInlineNotice> : null}

      <AdminSurface
        title="Invite someone"
        description="Start with one address, keep notes human, and leave bulk or policy changes tucked into advanced tools."
      >
        <form className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto]" onSubmit={handleInviteSubmit}>
          <AdminField label="Email or domain" hint="`name@gcccd.edu` or `@gcccd.edu`">
            <input value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="name@gcccd.edu" />
          </AdminField>
          <AdminField label="Name or note" hint="Optional">
            <input value={inviteNotes} onChange={(event) => setInviteNotes(event.target.value)} placeholder="Display name or quick context" />
          </AdminField>
          <div className="flex items-end">
            <Button className="h-12 rounded-full px-5" type="submit" disabled={inviteSubmitting || inviteEmail.trim().length === 0}>
              {inviteSubmitting ? "Adding..." : "Add invite"}
            </Button>
          </div>
        </form>
      </AdminSurface>

      <AdminSurface
        title="Pending invites"
        description="This is the main queue: exact invite entries that still need a first sign-in."
        action={<span className="text-sm text-foreground/55">{pendingInvites.length} waiting</span>}
      >
        {exactInvites.length === 0 ? (
          <AdminEmptyState
            title="No exact invite entries yet"
            description="Add individuals here. Domain-wide allowlist rules still live under advanced tools."
          />
        ) : (
          <div className="admin-data-list">
            {exactInvites.map((invite) => {
              const isPending = invite.is_active && !signedInEmails.has(normalizeEmailKey(invite.email_normalized));
              const inviteBusy = activeInviteAction === invite.id || activeInviteAction === invite.email;

              return (
                <div key={invite.id} className="admin-surface bg-transparent">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">{invite.email}</h3>
                        <span className="admin-domain-badge">{invite.is_active ? (isPending ? "Awaiting sign-in" : "Active") : "Paused"}</span>
                      </div>
                      <p className="text-sm leading-7 text-foreground/62">
                        {invite.notes?.trim()
                          ? invite.notes
                          : isPending
                            ? "No note added yet."
                            : "This invite already matches an existing signed-in member."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {invite.is_active ? (
                        <Button variant="outline" className="h-11 rounded-full px-4" disabled={inviteBusy} onClick={() => sendInviteLink(invite.email)}>
                          {activeInviteAction === invite.email ? "Sending..." : "Send sign-in link"}
                        </Button>
                      ) : null}
                      <Button
                        variant="outline"
                        className="h-11 rounded-full px-4"
                        disabled={inviteBusy}
                        onClick={() => toggleInvite(invite, !invite.is_active)}
                      >
                        {invite.is_active ? "Pause" : "Resume"}
                      </Button>
                      <Button variant="ghost" className="h-11 rounded-full px-4" disabled={inviteBusy} onClick={() => removeInvite(invite.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </AdminSurface>

      <AdminSurface
        title="Role grants waiting"
        description="Queue a role before first sign-in, then keep the list short and current."
        action={<span className="text-sm text-foreground/55">{activeGrants.length} waiting</span>}
      >
        <form className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_14rem_14rem_minmax(0,1fr)_auto]" onSubmit={handleGrantSubmit}>
          <AdminField label="Email">
            <input value={grantEmail} onChange={(event) => setGrantEmail(event.target.value)} placeholder="name@gcccd.edu" />
          </AdminField>
          <AdminField label="Role">
            <select value={grantRoleKey} onChange={(event) => setGrantRoleKey(event.target.value)}>
              {ROLE_OPTIONS.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Term" hint={grantRoleKey === "advisor" ? "Not used for Advisor" : currentTerm ? `Current: ${currentTerm.name}` : "Optional"}>
            <select value={grantTermId} onChange={(event) => setGrantTermId(event.target.value)} disabled={grantRoleKey === "advisor"}>
              <option value="">Use current term</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
          </AdminField>
          <AdminField label="Note" hint="Optional">
            <input value={grantNotes} onChange={(event) => setGrantNotes(event.target.value)} placeholder="Reason or context" />
          </AdminField>
          <div className="flex items-end">
            <Button className="h-12 rounded-full px-5" type="submit" disabled={grantSubmitting || grantEmail.trim().length === 0}>
              {grantSubmitting ? "Saving..." : "Queue role grant"}
            </Button>
          </div>
        </form>

        {activeGrants.length > 0 ? (
          <div className="mt-6 admin-data-list">
            {activeGrants.map((grant) => (
              <div key={grant.id} className="admin-surface bg-transparent">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-[-0.03em] text-foreground">{grant.email}</h3>
                      <span className="admin-domain-badge">{grant.role_key.replace("_", " ")}</span>
                      <span className="text-sm text-foreground/56">{termLabel(grant.term_id, terms)}</span>
                    </div>
                    <p className="text-sm leading-7 text-foreground/62">{grant.notes?.trim() || "No note added."}</p>
                  </div>
                  <Button
                    variant="ghost"
                    className="h-11 rounded-full px-4"
                    disabled={activeGrantAction === grant.id}
                    onClick={() => removeGrant(grant.id)}
                  >
                    {activeGrantAction === grant.id ? "Removing..." : "Remove"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </AdminSurface>

      <AdminSurface
        title="Advanced access tools"
        description="Less common policy changes stay here so the main invite flow remains easy to read."
      >
        <div className="space-y-4">
          <details open={domainInvites.length === 0}>
            <summary className="px-5 py-4 text-base font-medium text-foreground">Domain allowlist</summary>
            <div className="space-y-4 px-5 pb-5">
              {domainInvites.length > 0 ? (
                <div className="admin-data-list">
                  {domainInvites.map((invite) => (
                    <div key={invite.id} className="flex flex-col gap-3 rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-white/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-base font-semibold text-foreground">{invite.email}</div>
                        <div className="mt-1 text-sm text-foreground/58">{invite.notes?.trim() || "No note added."}</div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" className="h-11 rounded-full px-4" onClick={() => toggleInvite(invite, !invite.is_active)}>
                          {invite.is_active ? "Pause" : "Resume"}
                        </Button>
                        <Button variant="ghost" className="h-11 rounded-full px-4" onClick={() => removeInvite(invite.id)}>
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <AdminEmptyState
                  title="No domain rules yet"
                  description="Add a domain invite like `@gcccd.edu` with the regular invite form above if you want wider access."
                />
              )}
            </div>
          </details>

          <details>
            <summary className="px-5 py-4 text-base font-medium text-foreground">Blocklist</summary>
            <div className="space-y-4 px-5 pb-5">
              <form className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_auto]" onSubmit={handleBlockSubmit}>
                <AdminField label="Email or domain">
                  <input value={blockPattern} onChange={(event) => setBlockPattern(event.target.value)} placeholder="@example.com" />
                </AdminField>
                <AdminField label="Reason" hint="Optional">
                  <input value={blockNotes} onChange={(event) => setBlockNotes(event.target.value)} placeholder="Why this is blocked" />
                </AdminField>
                <div className="flex items-end">
                  <Button className="h-12 rounded-full px-5" type="submit" disabled={blockSubmitting || blockPattern.trim().length === 0}>
                    {blockSubmitting ? "Saving..." : "Add block"}
                  </Button>
                </div>
              </form>

              {activeBlocks.length > 0 ? (
                <div className="admin-data-list">
                  {activeBlocks.map((ban) => (
                    <div key={ban.id} className="flex flex-col gap-3 rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-white/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="text-base font-semibold text-foreground">{ban.pattern}</div>
                        <div className="mt-1 text-sm text-foreground/58">{ban.notes?.trim() || "No reason added."}</div>
                      </div>
                      <Button
                        variant="ghost"
                        className="h-11 rounded-full px-4"
                        disabled={activeBlockAction === ban.id}
                        onClick={() => removeBlock(ban.id)}
                      >
                        {activeBlockAction === ban.id ? "Removing..." : "Remove"}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </details>

          <details>
            <summary className="px-5 py-4 text-base font-medium text-foreground">Bulk import</summary>
            <div className="space-y-4 px-5 pb-5">
              <p className="text-sm leading-7 text-foreground/58">
                One row per line. Use `email`, or `email,role_key`, or `email,role_key,note`. Role grants default to the current term.
              </p>
              <form className="space-y-4" onSubmit={handleBulkImport}>
                <textarea
                  rows={7}
                  value={bulkText}
                  onChange={(event) => setBulkText(event.target.value)}
                  placeholder={"member1@gcccd.edu,president\nmember2@gcccd.edu,board_member,Returning representative"}
                />
                <Button className="h-12 rounded-full px-5" type="submit" disabled={bulkSubmitting || bulkText.trim().length === 0}>
                  {bulkSubmitting ? "Importing..." : "Run bulk import"}
                </Button>
              </form>
            </div>
          </details>
        </div>
      </AdminSurface>
    </div>
  );
}
