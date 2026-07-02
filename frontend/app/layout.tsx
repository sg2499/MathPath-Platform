import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "@/components/common/QueryProvider";
import { PostHogProvider } from "@/components/providers/PostHogProvider";

export const metadata: Metadata = {
  title: {
    default: "MathPath",
    template: "%s | MathPath",
  },
  description:
    "MathPath is a premium abacus, visualisation, DPS practice, and competition platform for confident mathematical learning.",
  keywords: ["Math", "Abacus", "Mental Math", "Competition", "Education", "EdTech"],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://mathpath.app",
    title: "MathPath | Confident Mathematical Learning",
    description: "Premium abacus, visualisation, and practice platform.",
    siteName: "MathPath",
    images: [
      {
        url: "/mathpath-logo.png",
        width: 1200,
        height: 630,
        alt: "MathPath Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "MathPath | Confident Mathematical Learning",
    description: "Premium abacus, visualisation, and practice platform.",
    images: ["/mathpath-logo.png"],
  },
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
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const ThemeBootstrapScript = `
(function () {
  try {
    var StorageTheme = window.localStorage.getItem("mathpath_theme");
    var UserSelectedTheme = window.localStorage.getItem("mathpath_theme_user_set") === "true";
    var Mode = UserSelectedTheme && (StorageTheme === "dark" || StorageTheme === "light") ? StorageTheme : "light";
    var Root = document.documentElement;
    Root.classList.toggle("dark", Mode === "dark");
    Root.style.colorScheme = Mode === "dark" ? "dark" : "light";
  } catch (Error) {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "light";
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ThemeBootstrapScript }} />
      </head>
      <body suppressHydrationWarning>
        <PostHogProvider>
          <QueryProvider>{children}</QueryProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
