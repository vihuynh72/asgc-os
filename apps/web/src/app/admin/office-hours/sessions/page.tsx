export const dynamic = "force-dynamic";
export const revalidate = 0;

import { redirect } from "next/navigation";

function toSearchString(searchParams: Record<string, string | string[] | undefined> | undefined) {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (typeof value === "string") next.set(key, value);
    else if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string") next.append(key, entry);
      }
    }
  }
  const query = next.toString();
  return query ? `?${query}` : "";
}

export default async function AdminOfficeHoursSessionsRoute({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(`/admin/office-hours${toSearchString(await searchParams)}`);
}
