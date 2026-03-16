import Link from "next/link";

import { PageShell } from "@/components/page-shell";

export default function LegalPage() {
  return (
    <PageShell title="Legal" description="Terms of use and privacy information for ASGC OS.">
      <div className="space-y-8 text-sm text-foreground/80">
        <section id="terms" className="space-y-2">
          <h2 className="text-lg font-semibold">Terms of Use</h2>
          <p>
            ASGC OS is provided for authorized student government use. Access may be restricted or revoked by ASGC
            leadership. Use the platform responsibly and in compliance with campus policies.
          </p>
        </section>

        <section id="privacy" className="space-y-2">
          <h2 className="text-lg font-semibold">Privacy</h2>
          <p>
            This platform stores meeting, task, compliance, and office-hours records needed to run ASGC operations.
            Only authorized members can access internal records.
          </p>
          <p>
            Kiosk SMS messages are limited to approved phone numbers for registered ASGC members. Members of the public
            do not receive kiosk texts. Read the{" "}
            <Link href="/privacy" className="font-medium text-foreground underline underline-offset-4">
              full privacy policy
            </Link>
            .
          </p>
        </section>
      </div>
    </PageShell>
  );
}
