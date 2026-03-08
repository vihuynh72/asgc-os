import { AdminWorkspaceRoute } from "../../admin-workspace-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeopleAssignmentsPage() {
  return <AdminWorkspaceRoute redirectTo="/admin/people/assignments" capability="people" forcedTab="people" forcedSection="assignments" />;
}
