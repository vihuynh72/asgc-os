import { AdminWorkspaceRoute } from "../admin-workspace-route";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMeetingsPage() {
  return <AdminWorkspaceRoute redirectTo="/admin/meetings" forcedTab="meetings" />;
}
