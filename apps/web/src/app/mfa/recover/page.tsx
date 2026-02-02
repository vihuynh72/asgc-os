import { PageShell } from "@/components/page-shell";

import { RecoverClient } from "./recover-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MfaRecoverPage() {
  return (
    <PageShell
      title="Recover access"
      description="Use your email link to reset 2FA and sign back in."
    >
      <RecoverClient />
    </PageShell>
  );
}

