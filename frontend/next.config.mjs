import { withSentryConfig } from "@sentry/nextjs";

// 2026-07-22 security hardening: httpOnly session cookies only work as
// first-party cookies. The frontend (vercel.app) and backend (onrender.com)
// are on different domains, so without this rewrite a cookie set by the
// backend would be a third-party cookie from the browser's point of view --
// Safari/iOS block those by default, which would silently break login for
// exactly that slice of users. This rewrite makes every /api/* call same-
// origin (the browser only ever talks to its own domain; Vercel proxies the
// request to Render server-side), so the cookie is first-party and can use
// SameSite=Lax instead of the cross-site None. Reuses the existing
// NEXT_PUBLIC_API_BASE_URL env var already configured on Vercel -- no new
// environment variable needed. Works in `next dev` too, provided that var
// (or BACKEND_ORIGIN) points at the local backend.
function ResolveBackendOrigin() {
  const Raw = (process.env.BACKEND_ORIGIN || process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000")
    .trim()
    .replace(/\/+$/, "");
  return Raw.endsWith("/api") ? Raw.slice(0, -4) : Raw;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${ResolveBackendOrigin()}/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(
  nextConfig,
  {
    silent: true,
    org: process.env.SENTRY_ORG || "mathpath",
    project: process.env.SENTRY_PROJECT || "javascript-nextjs",
  },
  {
    widenClientFileUpload: true,
    transpileClientSDK: true,
    hideSourceMaps: true,
    disableLogger: true,
  }
);
