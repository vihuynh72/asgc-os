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
            This platform stores meeting, task, and compliance data needed to run ASGC operations. Only authorized
            members can access internal records. Contact an admin if you have questions about data retention.
          </p>
        </section>
      </div>
    </PageShell>
  );
}
