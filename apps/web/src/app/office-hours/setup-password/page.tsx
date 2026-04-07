import { redirect } from "next/navigation";

import { buildPasswordSetupHref } from "@/lib/auth/password-setup.mjs";
import { OFFICE_HOURS_MEMBER_KIOSK_PATH } from "@/lib/office-hours-member-routing.mjs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OfficeHoursSetupPasswordAliasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const redirectTo =
    typeof sp.redirectTo === "string"
      ? sp.redirectTo
      : OFFICE_HOURS_MEMBER_KIOSK_PATH;
  const mode = typeof sp.mode === "string" ? sp.mode : "first_time";

  redirect(buildPasswordSetupHref({ mode, redirectTo }));
}
