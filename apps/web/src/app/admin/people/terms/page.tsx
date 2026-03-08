import { PeopleTermsPage } from "../people-terms-page";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminPeopleTermsPage() {
  return <PeopleTermsPage />;
}
