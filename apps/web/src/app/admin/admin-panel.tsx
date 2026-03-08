"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { normalizeAdminRoute } from "@/lib/admin/navigation.mjs";

export function AdminPanel({
  tier,
  isEvp,
}: {
  tier: "full" | "partial" | "read-only";
  isEvp?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const tab = searchParams.get("tab");
    const section = searchParams.get("section");
    const hash = window.location.hash ?? "";
    const next = normalizeAdminRoute({
      pathname,
      tab,
      section,
      hash,
      tier,
      isEvp: isEvp ?? false,
    });

    const currentQuery = searchParams.toString();
    const currentLocation = `${pathname}${currentQuery ? `?${currentQuery}` : ""}${hash}`;
    const nextLocation = `${next.pathname}${next.hash ?? ""}`;

    if (currentLocation !== nextLocation && (tab || section || hash.startsWith("#admin-meetings-"))) {
      router.replace(nextLocation);
    }
  }, [isEvp, pathname, router, searchParams, tier]);

  return null;
}
