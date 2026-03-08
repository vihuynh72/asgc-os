"use client";

import { useEffect, useState } from "react";

import { AdminEmptyState } from "@/components/admin/admin-empty-state";
import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { AdminSurface } from "@/components/admin/admin-surface";

import { PeopleSectionNav } from "./people-section-nav";

type AuditRow = {
  assignment_id: string;
  user_id: string;
  role_key: "advisor" | "president";
  term_id: string | null;
  term_label: string | null;
  display_name: string | null;
  email: string | null;
};

type AuditResponse = {
  current_term: { id: string; name: string } | null;
  admin_assignments: AuditRow[];
  non_current_presidents: AuditRow[];
  invalid_assignments: AuditRow[];
};

function renderUserLabel(row: AuditRow) {
  return row.display_name?.trim() || row.email?.trim() || row.user_id.slice(0, 8);
}

export function PeopleAccessAuditPanel() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const response = await fetch("/api/admin/admin-access-audit");
        const payload = (await response.json().catch(() => ({}))) as AuditResponse & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `Request failed: ${response.status}`);
        }
        if (!cancelled) {
          setData(payload);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load access audit.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <PeopleSectionNav activeId="access_audit" />

      {error ? <AdminInlineNotice tone="warning">{error}</AdminInlineNotice> : null}
      {data?.current_term ? <AdminInlineNotice tone="positive">Current term: {data.current_term.name}</AdminInlineNotice> : null}

      <div className="grid gap-6 xl:grid-cols-3">
        {[
          {
            title: "Correct current admin access",
            description: "Assignments that still match the current admin rules.",
            rows: data?.admin_assignments ?? [],
          },
          {
            title: "Non-current presidents",
            description: "Presidential assignments that belong to older terms.",
            rows: data?.non_current_presidents ?? [],
          },
          {
            title: "Invalid assignments",
            description: "Assignments that break the expected admin-access model.",
            rows: data?.invalid_assignments ?? [],
          },
        ].map((section) => (
          <AdminSurface key={section.title} title={section.title} description={section.description}>
            {loading ? (
              <p className="text-sm text-foreground/58">Loading…</p>
            ) : section.rows.length === 0 ? (
              <AdminEmptyState title="Nothing to review here" description="This section is clear right now." />
            ) : (
              <div className="admin-data-list">
                {section.rows.map((row) => (
                  <div key={row.assignment_id} className="rounded-[1.25rem] border border-[var(--admin-border-soft)] bg-white/75 px-4 py-4">
                    <div className="text-base font-semibold text-foreground">{renderUserLabel(row)}</div>
                    <div className="mt-1 text-sm leading-7 text-foreground/58">
                      {row.role_key} · {row.term_label ?? "No term"} · {row.email ?? "No email"}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </AdminSurface>
        ))}
      </div>
    </div>
  );
}
