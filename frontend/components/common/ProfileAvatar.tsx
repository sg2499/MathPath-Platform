"use client";

import { useEffect, useMemo, useState } from "react";
import type { UserRole } from "@/types/auth";

type ProfileAvatarTone = UserRole | "ADMIN" | "TEACHER" | "STUDENT";

type ProfileAvatarProps = {
  name?: string | null;
  imageUrl?: string | null;
  role?: ProfileAvatarTone | null;
  className?: string;
  imageClassName?: string;
  initialsClassName?: string;
  title?: string;
};

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api").replace(/\/api\/?$/, "");

export function ResolveAssetUrl(Url?: string | null): string {
  const CleanUrl = String(Url || "").trim();
  if (!CleanUrl) return "";
  if (CleanUrl.startsWith("data:")) return "";
  if (CleanUrl.startsWith("http://") || CleanUrl.startsWith("https://")) return CleanUrl;
  return `${API_BASE_URL}${CleanUrl.startsWith("/") ? CleanUrl : `/${CleanUrl}`}`;
}

export function ProfileInitials(Name?: string | null, Fallback = "MP"): string {
  const Parts = String(Name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (Parts.length >= 2) return `${Parts[0][0]}${Parts[1][0]}`.toUpperCase();
  if (Parts.length === 1) return Parts[0].slice(0, 2).toUpperCase();
  return Fallback.slice(0, 2).toUpperCase();
}

function AvatarToneClass(Role?: ProfileAvatarTone | null): string {
  if (Role === "STUDENT") return "from-orange-500 via-rose-500 to-amber-400";
  if (Role === "TEACHER") return "from-[#6D2E5F] via-[#B76E79] to-[#E6B8A2]";
  return "from-blue-700 via-indigo-600 to-fuchsia-500";
}

export function ProfileAvatar({
  name,
  imageUrl,
  role,
  className = "h-11 w-11 text-xs",
  imageClassName = "",
  initialsClassName = "",
  title,
}: ProfileAvatarProps) {
  const ResolvedImageUrl = useMemo(() => ResolveAssetUrl(imageUrl), [imageUrl]);
  const [ImageFailed, SetImageFailed] = useState(false);

  useEffect(() => {
    SetImageFailed(false);
  }, [ResolvedImageUrl]);

  const Initials = ProfileInitials(name, role === "TEACHER" ? "TE" : role === "STUDENT" ? "ST" : "MP");
  const ShowImage = Boolean(ResolvedImageUrl && !ImageFailed);

  return (
    <div
      className={`math-record-avatar relative flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br ${AvatarToneClass(role)} font-black uppercase tracking-[-0.03em] text-white shadow-sm ring-1 ring-white/70 ${className}`}
      title={title || String(name || "MathPath User")}
      aria-label={String(name || "MathPath User")}
    >
      {!ShowImage ? <span className={`leading-none ${initialsClassName}`}>{Initials}</span> : null}
      {ShowImage ? (
        <img
          key={ResolvedImageUrl}
          src={ResolvedImageUrl}
          alt={String(name || "MathPath User")}
          className={`absolute inset-0 h-full w-full object-cover ${imageClassName}`}
          onError={() => SetImageFailed(true)}
        />
      ) : null}
    </div>
  );
}
