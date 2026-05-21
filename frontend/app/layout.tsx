import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "@/components/common/QueryProvider";

export const metadata: Metadata = {
  title: {
    default: "MathPath",
    template: "%s | MathPath",
  },
  description:
    "MathPath is a premium abacus, visualisation, DPS practice, and competition platform for confident mathematical learning.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/mathpath-logo.png", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#2563eb",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
