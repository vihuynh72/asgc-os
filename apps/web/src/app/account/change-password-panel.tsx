"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ChangePasswordPanel() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  const canSubmit = password.length >= 8 && password === confirm && status !== "saving";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    setMessage("");

    if (password.length < 8) {
      setStatus("error");
      setMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setMessage("Passwords do not match.");
      return;
    }

    const response = await fetch("/api/auth/setup-password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password, redirectTo: "/account" }),
    });

    if (!response.ok) {
      setStatus("error");
      setMessage("Could not update password.");
      return;
    }

    setPassword("");
    setConfirm("");
    setStatus("success");
    setMessage("Password updated. Next time you can sign in with your password.");
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
          {message ? <span className="text-sm text-foreground/70">{message}</span> : null}
        </div>
      </form>
    </section>
  );
}
