import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import { env } from "@/lib/env";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_SITE_URL),
  title: "AgentFund",
  description: "A2MCP strategy engine for autonomous finance agents on X Layer.",
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/agentfund-logo.png"
  },
  openGraph: {
    title: "AgentFund",
    description: "Paid strategy intelligence for autonomous finance agents on X Layer.",
    images: ["/agentfund-logo.png"]
  }
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
