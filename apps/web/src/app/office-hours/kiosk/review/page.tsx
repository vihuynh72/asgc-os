import { redirect } from "next/navigation";
import Link from "next/link";

import { KioskShell, KioskStepHeader } from "@/components/office-hours/kiosk";
import { canEditOfficeHoursPhotoReview } from "@/lib/office-hours-authz.mjs";
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

  const { data: tierData } = await supabase.rpc("get_admin_tier", { _uid: user.id });
  const canEdit = canEditOfficeHoursPhotoReview({
    tier: (tierData?.tier as "full" | "partial" | "read-only" | null | undefined) ?? null,
    isEvp: tierData?.is_evp ?? false,
  });

  return (
    <KioskShell className="max-w-6xl items-start py-4 sm:py-6">
      <div className="kiosk-panel space-y-4">
        <KioskStepHeader
          eyebrow="Office Hours"
          title="Selfie review"
          subtitle="Inspect, quarantine, restore."
          step={1}
          totalSteps={1}
          actions={
            <Link
              href="/office-hours"
              className="inline-flex h-10 items-center justify-center rounded-full border border-[var(--admin-border-soft)] bg-white/80 px-3 text-xs font-medium text-foreground/80"
            >
              Back
            </Link>
          }
        />
        <KioskPhotoReviewPanel canEdit={canEdit} />
      </div>
    </KioskShell>
  );
}
