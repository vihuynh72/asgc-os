import { PageShell } from "@/components/page-shell";

import { MfaClient } from "./mfa-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MfaPage() {
  return (
    <PageShell
      title="Two-factor authentication"
      description="2FA is required to continue."
    >
      <MfaClient />
    </PageShell>
  );
}

