import { AdminHero } from "@/components/admin/admin-hero";
import { AdminSectionNav } from "@/components/admin/admin-section-nav";
import { requireAdminViewer } from "@/lib/admin/server";

import { AuditLogPanel } from "./audit-log-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AuditLogPage() {
  await requireAdminViewer({ redirectTo: "/admin/audit", capability: "audit" });

  return (
    <div className="admin-page space-y-6">
      <AdminHero
        eyebrow="Audit"
        title="System activity and admin traceability"
        description="Audit logs stay separate from People operations so filter-heavy review does not crowd everyday admin tasks."
      />

      <AdminSectionNav
        activeId="audit"
        items={[
          { id: "overview", label: "Overview", href: "/admin" },
          { id: "people", label: "People", href: "/admin/people" },
          { id: "audit", label: "Audit Log", href: "/admin/audit" },
        ]}
      />

      <AuditLogPanel />
    </div>
  );
}
