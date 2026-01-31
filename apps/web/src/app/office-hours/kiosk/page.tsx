import Link from "next/link";

import { PageShell } from "@/components/page-shell";
import { buttonClassName } from "@/components/ui/button";

export default function OfficeHoursKioskLandingPage() {
  return (
    <PageShell
      title="Office Hours Check-In"
      description="Continue to sign in, then check in with your location."
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-foreground/10 p-4">
          <p className="text-sm text-foreground/80">
            This QR code is a shortcut to the Office Hours check-in page. You’ll need to sign in first.
          </p>

          <div className="mt-4 flex flex-col gap-2">
            <Link
              className={buttonClassName({ className: "h-12 text-base" })}
              href="/login?redirectTo=/office-hours/check-in"
            >
              Sign in and check in
            </Link>
            <Link
              className={buttonClassName({ variant: "outline", className: "h-12 text-base" })}
              href="/office-hours"
            >
              Go to Office Hours
            </Link>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
