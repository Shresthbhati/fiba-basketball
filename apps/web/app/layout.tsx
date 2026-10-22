import type { ReactNode } from "react";
import { SyncIndicator } from "../lib/sync-indicator";
import "./globals.css";
import { Providers } from "./providers";

export const metadata = { title: "COURT IQ" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <header>
            <strong>COURT IQ</strong> · <SyncIndicator />
          </header>
          {children}
        </Providers>
      </body>
    </html>
  );
}
