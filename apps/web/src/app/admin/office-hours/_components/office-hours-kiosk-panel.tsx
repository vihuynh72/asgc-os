"use client";

import Link from "next/link";

import type { OfficeConfigRow } from "@/lib/admin/server";

type MemberRow = {
  member_key: string;
  source_type: "user" | "bootstrap_role_grant";
  source_id: string;
  entry_status: "active" | "awaiting_sign_in";
  user_id: string | null;
  bootstrap_role_grant_id: string | null;
  email: string | null;
  display_name: string;
  role_key: "advisor" | "president" | "executive" | "board_member" | "volunteer";
  role_label: string;
  display_title: string | null;
  password_ready: boolean;
};

export function OfficeHoursKioskPanel({
  canEdit,
  initialMembers,
  initialConfig,
}: {
  canEdit: boolean;
  initialMembers: MemberRow[];
  initialConfig: OfficeConfigRow;
}) {
  const activeMembers = initialMembers.filter((member) => member.entry_status === "active");
  const awaitingMembers = initialMembers.filter((member) => member.entry_status === "awaiting_sign_in");
  const passwordReadyCount = activeMembers.filter((member) => member.password_ready).length;

  return (
    <div className="space-y-6">
      {/* Stat strip */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-foreground/60">
        <span><strong className="font-semibold text-foreground">{activeMembers.length}</strong> active</span>
        <span className="mx-1.5 text-foreground/25">·</span>
        <span><strong className="font-semibold text-foreground">{passwordReadyCount}</strong> password ready</span>
        <span className="mx-1.5 text-foreground/25">·</span>
        <span><strong className="font-semibold text-foreground">{awaitingMembers.length}</strong> awaiting sign-in</span>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/office-hours/kiosk"
          className="inline-flex h-9 items-center justify-center rounded-full bg-foreground px-4 text-xs font-medium text-background"
        >
          Open member Office Hours
        </Link>
        <Link
          href="/office-hours/kiosk/review"
          className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-4 text-xs font-medium text-foreground/80"
        >
          Review selfies
        </Link>
        {!canEdit ? (
          <span className="inline-flex h-9 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white/70 px-4 text-xs font-medium text-foreground/60">
            View only
          </span>
        ) : null}
      </div>

      {/* Roster */}
      {initialMembers.length > 0 && (
        <div className="rounded-[1.2rem] border border-[var(--admin-border-soft)] bg-white overflow-hidden max-w-xl">
          <div className="border-b px-4 py-2.5 text-[0.68rem] font-semibold uppercase tracking-wider text-foreground/40">
            Roster
          </div>
          <div className="divide-y divide-[var(--admin-border-soft)]">
            {initialMembers.map((member) => (
              <div key={member.member_key} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">{member.display_name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {member.role_label}
                    </span>
                  </div>
                  {member.email && (
                    <div className="mt-0.5 text-xs text-foreground/45">{member.email}</div>
                  )}
                </div>
                <div className="shrink-0">
                  {member.entry_status === "awaiting_sign_in" ? (
                    <span className="flex h-2 w-2 rounded-full bg-amber-400" title="Awaiting sign-in" />
                  ) : member.password_ready ? (
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500" title="Password ready" />
                  ) : (
                    <span className="flex h-2 w-2 rounded-full bg-slate-300" title="Needs setup" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Config snapshot */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-foreground/45">
        <span>Quiet hours: <strong className="text-foreground/65">{initialConfig.quiet_hours_enabled ? "on" : "off"}</strong></span>
        <span className="mx-1 text-foreground/20">·</span>
        <span>Allowed days: <strong className="text-foreground/65">{(initialConfig.office_hours_allowed_weekdays ?? []).join(", ") || "Mon-Fri"}</strong></span>
      </div>
    </div>
  );
}
