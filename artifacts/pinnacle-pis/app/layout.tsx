import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Providers } from "./providers";
import "../src/index.css";

export const metadata: Metadata = {
  title: "Pinnacle Intelligence System",
  description:
    "Evidence-led property intelligence for Pinnacle Estate Surveyors.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
