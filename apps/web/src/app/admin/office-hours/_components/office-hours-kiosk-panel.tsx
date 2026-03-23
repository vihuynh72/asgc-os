"use client";

import Link from "next/link";

import { AdminSurface } from "@/components/admin/admin-surface";
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
  role_key: "president" | "executive" | "board_member";
  role_label: string;
  display_title: string | null;
  password_ready: boolean;
};

export function OfficeHoursKioskPanel({
  initialMembers,
  initialConfig,
}: {
  initialMembers: MemberRow[];
  initialConfig: OfficeConfigRow;
}) {
  const activeMembers = initialMembers.filter((member) => member.entry_status === "active");
  const awaitingMembers = initialMembers.filter((member) => member.entry_status === "awaiting_sign_in");
  const passwordReadyCount = activeMembers.filter((member) => member.password_ready).length;

  return (
    <div className="space-y-8">
      <AdminSurface
        title="Member check-in flow"
        description="The public member picker and SMS OTP flow are retired. Members now sign in once, optionally trust the browser for 30 days, then use the signed-in Office Hours flow with a fresh selfie at every check-in."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { label: "Active roster", value: String(activeMembers.length), detail: "Current members can enter Office Hours directly from the app." },
            { label: "Password ready", value: String(passwordReadyCount), detail: "Members who have completed the new password setup." },
            { label: "Awaiting sign-in", value: String(awaitingMembers.length), detail: "Pending grants that still need first sign-in onboarding." },
          ].map((card) => (
            <article
              key={card.label}
              className="rounded-[1.35rem] border border-[var(--admin-border-soft)] bg-white/78 p-4"
            >
              <div className="text-xs uppercase tracking-[0.14em] text-[var(--admin-label)]">{card.label}</div>
              <div className="mt-2 text-3xl font-semibold text-foreground">{card.value}</div>
              <div className="mt-2 text-sm text-foreground/65">{card.detail}</div>
            </article>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href="/office-hours"
            className="inline-flex h-11 items-center justify-center rounded-full bg-foreground px-5 text-sm font-medium text-background"
          >
            Open member Office Hours
          </Link>
          <Link
            href="/office-hours/kiosk/review"
            className="inline-flex h-11 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white px-5 text-sm font-medium text-foreground/85"
          >
            Review selfies
          </Link>
        </div>
      </AdminSurface>

      <AdminSurface
        title="Roster and onboarding"
        description="Visibility only. Password setup and trusted-device management happen in the member-facing auth flow and Account page."
      >
        <div className="space-y-4">
          {initialMembers.map((member) => (
            <article
              key={member.member_key}
              className="rounded-[1.35rem] border border-[var(--admin-border-soft)] bg-white/78 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="text-sm font-semibold text-foreground">{member.display_name}</div>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600">
                      {member.role_label}
                    </span>
                    {member.entry_status === "awaiting_sign_in" ? (
                      <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        Awaiting sign-in
                      </span>
                    ) : null}
                    {member.entry_status === "active" ? (
                      <span
                        className={
                          member.password_ready
                            ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-emerald-700"
                            : "rounded-full bg-slate-200 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-slate-600"
                        }
                      >
                        {member.password_ready ? "Password ready" : "Needs password setup"}
                      </span>
                    ) : null}
                  </div>
                  {member.email ? <div className="text-sm text-foreground/58">{member.email}</div> : null}
                </div>

                <div className="text-xs text-foreground/55">
                  {member.entry_status === "awaiting_sign_in"
                    ? "Will enter through first-time email verification."
                    : member.password_ready
                      ? "Can use the password-first member flow immediately."
                      : "Will be redirected into Office Hours password setup on first use."}
                </div>
              </div>
            </article>
          ))}
        </div>
      </AdminSurface>

      <AdminSurface
        title="Legacy config retained"
        description="Historical SMS OTP records and config remain in the database for audit purposes, but they are no longer part of the active member check-in flow."
      >
        <div className="grid gap-4 md:grid-cols-3">
          <article className="rounded-[1.35rem] border border-[var(--admin-border-soft)] bg-white/78 p-4 text-sm text-foreground/65">
            Primary office location: <span className="font-medium text-foreground">{initialConfig.primary_office_location_id || "Not set"}</span>
          </article>
          <article className="rounded-[1.35rem] border border-[var(--admin-border-soft)] bg-white/78 p-4 text-sm text-foreground/65">
            Quiet hours: <span className="font-medium text-foreground">{initialConfig.quiet_hours_enabled ? "Enabled" : "Disabled"}</span>
          </article>
          <article className="rounded-[1.35rem] border border-[var(--admin-border-soft)] bg-white/78 p-4 text-sm text-foreground/65">
            Allowed weekdays: <span className="font-medium text-foreground">{(initialConfig.office_hours_allowed_weekdays ?? []).join(", ") || "Mon-Fri"}</span>
          </article>
        </div>
      </AdminSurface>
    </div>
  );
}
