import { AdminWorkspaceRoute } from "../../admin-workspace-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursRequirementsPage() {
  return (
    <AdminWorkspaceRoute
      redirectTo="/admin/office-hours/requirements"
      capability="office_hours"
      forcedTab="office_hours"
      officeHoursFocus="requirements"
    />
  );
}
