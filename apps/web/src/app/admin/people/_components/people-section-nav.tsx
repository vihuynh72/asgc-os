import { AdminSectionNav } from "@/components/admin/admin-section-nav";

export function PeopleSectionNav({
  activeId,
}: {
  activeId: "invites" | "assignments" | "terms" | "access_audit";
}) {
  return (
    <AdminSectionNav
      activeId={activeId}
      items={[
        { id: "invites", label: "Invites", href: "/admin/people" },
        { id: "assignments", label: "Assignments", href: "/admin/people/assignments" },
        { id: "terms", label: "Terms", href: "/admin/people/terms" },
        { id: "access_audit", label: "Access Audit", href: "/admin/people/access-audit" },
      ]}
    />
  );
}
