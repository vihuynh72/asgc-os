import type { SupabaseClient } from "@supabase/supabase-js";

import type { OfficeConfigRow, OfficeLocationRow } from "@/lib/admin/server";
import { ensureOfficeHoursConfigWithKioskFallback } from "@/lib/office-hours-kiosk-setup.mjs";

export async function loadOfficeHoursLabContext(admin: SupabaseClient): Promise<{
  officeConfig: OfficeConfigRow | null;
  officeLocation: OfficeLocationRow | null;
}> {
  try {
    const officeConfig = (await ensureOfficeHoursConfigWithKioskFallback(admin)) as OfficeConfigRow | null;
    if (!officeConfig?.primary_office_location_id) {
      return { officeConfig: officeConfig ?? null, officeLocation: null };
    }

    const { data: officeLocation, error } = await admin
      .from("office_locations")
      .select("id,name,lat,lon,radius_m,grace_radius_m,timezone,active")
      .eq("id", officeConfig.primary_office_location_id)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "office_location_lookup_failed");
    }

    return {
      officeConfig,
      officeLocation: (officeLocation as OfficeLocationRow | null) ?? null,
    };
  } catch {
    return {
      officeConfig: null,
      officeLocation: null,
    };
  }
}
