"use client";

import { useEffect, useState } from "react";
import { getActiveRoleHeaderValue } from "@/lib/auth";

// The protected self-service photo endpoint added in the 2026-07-21 security
// audit (Phase 1, "require auth on profile-photo endpoint"). Photos uploaded
// through Account Settings are stored as base64 in the DB and served back
// through this single route, gated behind get_current_user() on the backend
// so a photo can't be scraped just by guessing a user id.
const ProtectedPhotoPathMarker = "/api/auth/profile-photo/";

/**
 * Resolves an (already base-URL-resolved) image URL to something a plain
 * <img> can render, authenticating against the protected profile-photo
 * endpoint when needed.
 *
 * Why this exists: a plain <img src="..."> request has no way to attach
 * credentials, so once GET /api/auth/profile-photo/{id} started requiring a
 * session (Phase 1), every such <img> silently 401'd and the photo just
 * disappeared. This hook does the fetch itself, then hands the browser a
 * local blob: URL to actually paint. URLs that are NOT the protected
 * endpoint (e.g. admin-uploaded static /uploads/... files, or an external
 * URL) are returned as-is, unchanged, with no extra fetch.
 *
 * 2026-07-22 update: the session moved from a bearer token in localStorage
 * to an httpOnly cookie (see backend/app/core/cookies.py), which page JS
 * can no longer read at all -- so this now sends credentials:"include"
 * instead of attaching an Authorization header. That cookie is only
 * first-party on this app's own domain (via the Next.js rewrite proxy in
 * next.config.mjs), so the fetch must go through the same-origin /api/...
 * path, NOT the absolute Render URL `resolvedUrl` normally carries -- the
 * rewrite below extracts just the path+query starting at the protected
 * marker for that reason.
 */
export function useAuthenticatedImage(resolvedUrl?: string | null): {
  src: string | null;
  failed: boolean;
} {
  const [Src, SetSrc] = useState<string | null>(null);
  const [Failed, SetFailed] = useState(false);

  useEffect(() => {
    SetFailed(false);
    SetSrc(null);

    if (!resolvedUrl) {
      return;
    }

    const MarkerIndex = resolvedUrl.indexOf(ProtectedPhotoPathMarker);
    if (MarkerIndex === -1) {
      // Not the gated endpoint (static file, external URL, etc.) -- no auth
      // needed, use it directly like a normal <img src>.
      SetSrc(resolvedUrl);
      return;
    }

    // Same-origin relative path (e.g. "/api/auth/profile-photo/{id}?v=...")
    // so the request goes through this app's own domain -- and therefore
    // carries the first-party session cookie -- instead of hitting the
    // Render backend's origin directly, which would be cross-site and
    // silently miss the cookie entirely.
    const SameOriginPath = resolvedUrl.slice(MarkerIndex);
    const RoleHeader = getActiveRoleHeaderValue();

    let Cancelled = false;
    let CreatedObjectUrl: string | null = null;

    fetch(SameOriginPath, {
      credentials: "include",
      headers: RoleHeader ? { "X-Auth-Role": RoleHeader } : undefined,
    })
      .then((Response) => {
        if (!Response.ok) {
          throw new Error(`Photo request failed with status ${Response.status}`);
        }
        return Response.blob();
      })
      .then((PhotoBlob) => {
        if (Cancelled) return;
        CreatedObjectUrl = URL.createObjectURL(PhotoBlob);
        SetSrc(CreatedObjectUrl);
      })
      .catch(() => {
        if (!Cancelled) SetFailed(true);
      });

    return () => {
      Cancelled = true;
      if (CreatedObjectUrl) URL.revokeObjectURL(CreatedObjectUrl);
    };
  }, [resolvedUrl]);

  return { src: Src, failed: Failed };
}
