import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Lato, Source_Code_Pro } from "next/font/google";
import "./globals.css";

import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { OfficeHoursPresenceMonitor } from "@/components/office-hours-presence-monitor";
import { RoleChangeListener } from "@/components/role-change-listener";
import { Toaster } from "@/components/ui/toaster";
import { DESIGN_COOKIE_NAME, getEffectiveDesign } from "@/lib/design-toggle.mjs";

const lato = Lato({
  variable: "--font-lato",
  subsets: ["latin"],
  weight: ["300", "400", "700"],
});

const sourceCodePro = Source_Code_Pro({
  variable: "--font-code",
  subsets: ["latin"],
  weight: ["400", "600"],
});

export const metadata: Metadata = {
  title: "ASGC OS",
  description: "Internal work operating system for ASGC.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const designCookie = cookieStore.get(DESIGN_COOKIE_NAME)?.value ?? null;
  const design = getEffectiveDesign({ cookieValue: designCookie, defaultDesign: process.env.DESIGN_DEFAULT });

  return (
    <html lang="en" data-design={design} data-color-mode="light" style={{ colorScheme: "light" }}>
      <body
        suppressHydrationWarning
        className={`${lato.variable} ${sourceCodePro.variable} bg-white antialiased`}
      >
        <div className="min-h-dvh">
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <SiteNav />
          <OfficeHoursPresenceMonitor />
          <RoleChangeListener />
          <main id="main-content" tabIndex={-1}>
            {children}
          </main>
          <SiteFooter />
          <Toaster />
        </div>
      </body>
    </html>
  );
}
