import { AdminWorkspaceRoute } from "../../admin-workspace-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeopleTermsPage() {
  return <AdminWorkspaceRoute redirectTo="/admin/people/terms" capability="people" forcedTab="people" forcedSection="terms" />;
}
