import type { Metadata } from "next";
import { Manrope } from "next/font/google";

import { AlessandraMobileShell } from "@/components/birthday/alessandra-mobile-shell";
import { AlessandraMobileStory } from "@/components/birthday/alessandra-mobile-story";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-birthday-sans",
  weight: ["500", "700", "800"],
});

export const metadata: Metadata = {
  title: "Notes",
  description: "Private note.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  },
};

export default function SecretBirthdayPage() {
  return (
    <div className={manrope.variable}>
      <AlessandraMobileShell>
        <AlessandraMobileStory />
      </AlessandraMobileShell>
    </div>
  );
}
