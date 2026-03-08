import { AdminWorkspaceRoute } from "../../admin-workspace-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeopleAccessAuditPage() {
  return <AdminWorkspaceRoute redirectTo="/admin/people/access-audit" capability="people" forcedTab="people" forcedSection="audit" />;
}
