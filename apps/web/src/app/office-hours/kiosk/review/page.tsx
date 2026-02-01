import { redirect } from "next/navigation";

import { PageShell } from "@/components/page-shell";
import { getSupabaseServerComponentClient } from "@/lib/supabaseServerComponent";

import { KioskPhotoReviewPanel } from "./review-panel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function KioskPhotoReviewPage() {
  const supabase = await getSupabaseServerComponentClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirectTo=/office-hours/kiosk/review");
  }

  const { data: canView, error } = await supabase.rpc("can_view_office_hours_photos");
  if (error || !canView) {
    redirect("/unauthorized?reason=office_hours_photos&redirectTo=/office-hours/kiosk/review");
  }

  return (
    <PageShell
      title="Office Hours — Kiosk Selfie Review"
      description="Review kiosk check-in selfies (retained for 30 days)."
      containerClassName="max-w-5xl"
      backHref="/office-hours"
      backLabel="Back to Office Hours"
    >
      <KioskPhotoReviewPanel />
    </PageShell>
  );
}

