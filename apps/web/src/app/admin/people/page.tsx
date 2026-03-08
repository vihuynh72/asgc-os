import { PeopleInvitesPage } from "./people-invites-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeoplePage() {
  return <PeopleInvitesPage redirectTo="/admin/people" />;
}
