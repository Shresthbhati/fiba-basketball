import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { SiteNav } from "../lib/site-nav";
import { PwaManager } from "../lib/pwa-manager";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "COURT IQ",
  description: "Precision basketball analytics, live court scorekeeping, training logging, and competition management.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "COURT IQ",
  },
};

export const viewport: Viewport = {
  themeColor: "#f97316",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="apple-touch-icon" href="/icons/icon-192.svg" />
      </head>
      <body>
        <Providers>
          <PwaManager />
          <SiteNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}

