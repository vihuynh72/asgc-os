import { AdminSectionNav } from "@/components/admin/admin-section-nav";

export function OfficeHoursSectionNav({
  activeId,
}: {
  activeId: "overview" | "schedule" | "sessions" | "kiosk" | "requirements" | "config" | "export";
}) {
  return (
    <AdminSectionNav
      activeId={activeId}
      items={[
        { id: "overview", label: "Overview", href: "/admin/office-hours" },
        { id: "schedule", label: "Schedule", href: "/admin/office-hours/schedule" },
        { id: "sessions", label: "Sessions", href: "/admin/office-hours/sessions" },
        { id: "kiosk", label: "Member Flow", href: "/admin/office-hours/kiosk" },
        { id: "requirements", label: "Requirements", href: "/admin/office-hours/requirements" },
        { id: "config", label: "Config", href: "/admin/office-hours/config" },
        { id: "export", label: "Export", href: "/admin/office-hours/export" },
      ]}
    />
  );
}
