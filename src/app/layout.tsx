import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Traefik Proxy Admin",
  description: "Manage Traefik HTTP provider services, authentication, sessions, and live proxy diagnostics.",
  icons: {
    icon: "/tpa-icon.svg",
    shortcut: "/tpa-icon.svg",
    apple: "/tpa-icon.svg",
  },
};

export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Make BUILD_ID available globally via a data attribute
  const buildId = process.env.BUILD_ID || "0.1.0";

  return (
    <html lang="en" suppressHydrationWarning data-build-id={buildId}>
      <body
        suppressHydrationWarning
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
