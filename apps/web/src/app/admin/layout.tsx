import type { ReactNode } from "react";

import { AdminAppShell } from "@/components/admin/admin-app-shell";
import { getAdminPrimaryNav } from "@/lib/admin/navigation.mjs";
import { requireAdminViewer } from "@/lib/admin/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function getTierLabel(tier: "full" | "partial" | "read-only", isEvp: boolean) {
  if (tier === "full") return "Full admin access";
  if (isEvp && tier === "partial") return "EVP office-hours access";
  if (tier === "read-only") return "Read-only admin access";
  return "Partial admin access";
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const viewer = await requireAdminViewer({ redirectTo: "/admin", capability: "hub" });
  const navItems = getAdminPrimaryNav({ tier: viewer.tier, isEvp: viewer.isEvp });

  return <AdminAppShell navItems={navItems} tierLabel={getTierLabel(viewer.tier, viewer.isEvp)}>{children}</AdminAppShell>;
}
