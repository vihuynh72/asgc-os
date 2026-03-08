import { PeopleAccessAuditPage } from "../people-access-audit-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeopleAccessAuditPage() {
  return <PeopleAccessAuditPage />;
}
