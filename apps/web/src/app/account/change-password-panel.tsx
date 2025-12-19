"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export function ChangePasswordPanel() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
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

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setPassword("");
    setConfirm("");
    setStatus("success");
    setMessage("Password updated. Next time you can sign in with your password.");
  }

  return (
    <section className="rounded-md border p-4">
      <h2 className="text-sm font-semibold">Password</h2>
      <p className="mt-1 text-sm text-foreground/70">
        Set a password once, then you can sign in without email OTP on trusted devices.
      </p>

      <form className="mt-4 space-y-3" onSubmit={onSubmit}>
        <label className="block space-y-1 text-sm">
          <div className="text-foreground/70">New password</div>
          <input
            type="password"
            autoComplete="new-password"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        <label className="block space-y-1 text-sm">
          <div className="text-foreground/70">Confirm password</div>
          <input
            type="password"
            autoComplete="new-password"
            className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit}>
            {status === "saving" ? "Saving..." : "Update password"}
          </Button>
          {message ? <span className="text-sm text-foreground/70">{message}</span> : null}
        </div>
      </form>
    </section>
  );
}

