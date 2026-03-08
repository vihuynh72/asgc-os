import { AdminWorkspaceRoute } from "../../admin-workspace-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminOfficeHoursConfigPage() {
  return (
    <AdminWorkspaceRoute
      redirectTo="/admin/office-hours/config"
      capability="office_hours"
      forcedTab="office_hours"
      officeHoursFocus="config"
    />
  );
}
