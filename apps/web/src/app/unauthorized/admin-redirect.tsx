"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AdminRedirect({ enabled, delayMs = 2500 }: { enabled: boolean; delayMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => {
      router.replace("/meetings");
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [enabled, delayMs, router]);

  return null;
}
