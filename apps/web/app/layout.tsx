import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConsultantCloud Revenue Agent",
  description:
    "A headless Agentforce demo that turns plain-English commercial requests into governed Revenue Management actions.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
