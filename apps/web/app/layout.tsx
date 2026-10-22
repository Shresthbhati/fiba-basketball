import type { ReactNode } from "react";
import { SiteNav } from "../lib/site-nav";
import "./globals.css";
import { Providers } from "./providers";

export const metadata = { title: "COURT IQ" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <SiteNav />
          {children}
        </Providers>
      </body>
    </html>
  );
}
