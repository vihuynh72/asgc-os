"use client";

import { useState } from "react";

import { AdminInlineNotice } from "@/components/admin/admin-inline-notice";
import { Button } from "@/components/ui/button";
import { getPasswordSetupFailureMessage, getPasswordSetupWarningMessage } from "@/lib/auth/password-setup.mjs";

export function ChangePasswordPanel() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [notice, setNotice] = useState<{ tone: "good" | "warning" | "critical"; message: string } | null>(null);

  const canSubmit = password.length >= 8 && password === confirm && status !== "saving";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setNotice(null);

    if (password.length < 8) {
      setStatus("error");
      setNotice({ tone: "critical", message: "Password must be at least 8 characters." });
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setNotice({ tone: "critical", message: "Passwords do not match." });
      return;
    }

    const response = await fetch("/api/auth/setup-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, redirectTo: "/account" }),
    });

    if (!response.ok) {
      const json = (await response.json().catch(() => null)) as { reason?: string } | null;
      setStatus("error");
      setNotice({ tone: "critical", message: getPasswordSetupFailureMessage(json?.reason) });
      return;
    }

    const json = (await response.json().catch(() => null)) as { warningReason?: string } | null;
    const warningMessage = getPasswordSetupWarningMessage(json?.warningReason);

    setPassword("");
    setConfirm("");
    setStatus("success");
    setNotice({
      tone: warningMessage ? "warning" : "good",
      message: warningMessage ?? "Password updated. Next time you can sign in with your password.",
    });
  }

  return (
    <section className="rounded-[1.5rem] border border-foreground/10 bg-white/72 p-5 shadow-[0_22px_44px_-34px_rgba(15,23,42,0.38)] backdrop-blur">
      <h2 className="text-base font-semibold tracking-tight">Password</h2>
      <p className="mt-1 text-sm text-foreground/65">
        Update the password used by the new member sign-in flow. Saving it here also refreshes your Office Hours password-ready flag.
      </p>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-1 text-sm">
          <div className="text-foreground/70">New password</div>
          <input
            type="password"
            autoComplete="new-password"
            className="h-11 w-full rounded-[1rem] border bg-background px-3 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <div className="text-foreground/70">Confirm password</div>
          <input
            type="password"
            autoComplete="new-password"
            className="h-11 w-full rounded-[1rem] border bg-background px-3 text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit} className="h-11 rounded-full px-5">
            {status === "saving" ? "Saving..." : "Update password"}
          </Button>
        </div>
      </form>

      {notice ? (
        <div className="mt-3">
          <AdminInlineNotice tone={notice.tone}>{notice.message}</AdminInlineNotice>
        </div>
      ) : null}
    </section>
  );
}
