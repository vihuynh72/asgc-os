import type { Metadata } from "next";
import { Lato, Source_Code_Pro } from "next/font/google";
import "./globals.css";

import { SiteNav } from "@/components/site-nav";
import { SiteFooter } from "@/components/site-footer";
import { OfficeHoursPresenceMonitor } from "@/components/office-hours-presence-monitor";
import { RoleChangeListener } from "@/components/role-change-listener";
import { Toaster } from "@/components/ui/toaster";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        suppressHydrationWarning
        className={`${lato.variable} ${sourceCodePro.variable} antialiased`}
      >
        <div className="min-h-dvh">
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          <SiteNav />
          <OfficeHoursPresenceMonitor />
          <RoleChangeListener />
          {children}
          <SiteFooter />
          <Toaster />
        </div>
      </body>
    </html>
  );
}
