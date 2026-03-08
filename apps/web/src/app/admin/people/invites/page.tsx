import { AdminWorkspaceRoute } from "../../admin-workspace-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeopleInvitesPage() {
  return <AdminWorkspaceRoute redirectTo="/admin/people/invites" capability="people" forcedTab="people" forcedSection="invites" />;
}
