import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-foreground/10 bg-background">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-xs text-foreground/60 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <div className="font-semibold text-foreground/70">ASGC OS</div>
          <div>Student government operations platform for meetings, tasks, and compliance.</div>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/legal#terms" className="hover:text-foreground">Terms</Link>
          <Link href="/legal#privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/docs" className="hover:text-foreground">Documents</Link>
        </div>
      </div>
    </footer>
  );
}
