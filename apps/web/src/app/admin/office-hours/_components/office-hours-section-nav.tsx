import { AdminSectionNav } from "@/components/admin/admin-section-nav";

export function OfficeHoursSectionNav({
  activeId,
}: {
  activeId: "sessions" | "requirements" | "config" | "export";
}) {
  return (
    <AdminSectionNav
      activeId={activeId}
      items={[
        { id: "sessions", label: "Sessions", href: "/admin/office-hours" },
        { id: "requirements", label: "Requirements", href: "/admin/office-hours/requirements" },
        { id: "config", label: "Config", href: "/admin/office-hours/config" },
        { id: "export", label: "Export", href: "/admin/office-hours/export" },
      ]}
    />
  );
}
