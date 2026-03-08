import { PeopleAssignmentsPage } from "../people-assignments-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeopleAssignmentsPage() {
  return <PeopleAssignmentsPage />;
}
