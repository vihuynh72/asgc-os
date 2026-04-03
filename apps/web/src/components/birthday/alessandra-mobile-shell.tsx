"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";

export function AlessandraMobileShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.getAttribute("data-birthday");
    html.setAttribute("data-birthday", "true");

    return () => {
      if (previous === null) {
        html.removeAttribute("data-birthday");
        return;
      }

      html.setAttribute("data-birthday", previous);
    };
  }, []);

  return <>{children}</>;
}
