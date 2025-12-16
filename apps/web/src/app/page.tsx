import Link from "next/link";

import { PageShell } from "@/components/page-shell";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/office-hours", label: "Office Hours" },
  { href: "/tasks", label: "Tasks" },
  { href: "/meetings", label: "Meetings" },
  { href: "/docs", label: "Docs" },
  { href: "/finance", label: "Finance" },
  { href: "/admin", label: "Admin" },
];

export default function Home() {
  return (
    <PageShell
      title="ASGC OS"
      description="Internal work operating system for ASGC. PHASE 01: bootstrap + placeholder routes (no auth yet)."
    >
      <div className="space-y-6">
        <div className="rounded-lg border p-4">
          <p className="text-sm text-foreground/70">
            This repo follows the build packet phases. Office Hours is the top MVP priority, but it
            is implemented in later phases (PHASE 11–20).
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="rounded-lg border p-4 transition-colors hover:bg-foreground/5"
            >
              <div className="font-medium">{l.label}</div>
              <div className="mt-1 text-sm text-foreground/70">Placeholder page</div>
            </Link>
          ))}
        </div>

        <div className="text-sm">
          <Link className="underline" href="/login">
            Sign in
          </Link>
        </div>

        <div className="text-sm text-foreground/70">
          Health check: <Link className="underline" href="/api/healthz">/api/healthz</Link>
        </div>
      </div>
    </PageShell>
  );
}
