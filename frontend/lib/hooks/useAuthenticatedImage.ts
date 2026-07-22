"use client";

import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";

// The protected self-service photo endpoint added in the 2026-07-21 security
// audit (Phase 1, "require auth on profile-photo endpoint"). Photos uploaded
// through Account Settings are stored as base64 in the DB and served back
// through this single route, gated behind get_current_user() on the backend
// so a photo can't be scraped just by guessing a user id.
const ProtectedPhotoPathMarker = "/api/auth/profile-photo/";

/**
 * Resolves an (already base-URL-resolved) image URL to something a plain
 * <img> can render, attaching the caller's bearer token when the URL points
 * at the protected profile-photo endpoint.
 *
 * Why this exists: a plain <img src="..."> request has no way to attach an
 * Authorization header, so once GET /api/auth/profile-photo/{id} started
 * requiring a session (Phase 1), every such <img> silently 401'd and the
 * photo just disappeared -- for both existing photos and fresh uploads. This
 * hook does the fetch itself (where a custom header CAN be attached), then
 * hands the browser a local blob: URL to actually paint. URLs that are NOT
 * the protected endpoint (e.g. admin-uploaded static /uploads/... files, or
 * an external URL) are returned as-is, unchanged, with no extra fetch.
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

    if (!resolvedUrl.includes(ProtectedPhotoPathMarker)) {
      // Not the gated endpoint (static file, external URL, etc.) -- no auth
      // header needed, use it directly like a normal <img src>.
      SetSrc(resolvedUrl);
      return;
    }

    const Token = getToken();
    if (!Token) {
      // No session to attach -- nothing this hook can do differently than
      // the browser already would (the request will 401 either way).
      SetFailed(true);
      return;
    }

    let Cancelled = false;
    let CreatedObjectUrl: string | null = null;

    fetch(resolvedUrl, { headers: { Authorization: `Bearer ${Token}` } })
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
