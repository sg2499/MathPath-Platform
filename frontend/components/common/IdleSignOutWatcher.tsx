"use client";

// 2026-10-12 (Shailesh): teacher and student accounts sign out after 20
// minutes with no activity; at 19 minutes a small box gives 60 seconds to
// stay. Staying keeps everything exactly where it was (nothing reloads).
// Never shown while a student is taking a test (lib/activity.ts treats a
// test screen as active). Admins don't get this at all.
//
// Mounted once for the whole app (QueryProvider), so it covers every teacher
// and student page, including full-screen ones like the leaderboards. The
// sign-out itself is handed to AppShell when one is on screen (its instant
// sign-out, no "Securing" flash); otherwise it signs out here the same way.
import { api } from "@/lib/api";
import { signOutInBackground } from "@/lib/api/auth";
import { clearSession, getStoredUserForRole } from "@/lib/auth";
import { usePathname } from "next/navigation";
import { IDLE_SIGN_OUT_MS, IDLE_WARNING_MS, IsRecentlyActive, LastInteractionAt, MarkActive, SetIdleWarningShowing, SIGNED_OUT_REASON_KEY } from "@/lib/activity";
import { Clock3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export const IDLE_SIGN_OUT_EVENT = "mathpath-idle-signout";

function RoleForPath(Pathname: string | null): "STUDENT" | "TEACHER" | null {
  if (!Pathname) return null;
  if (Pathname.startsWith("/student")) return "STUDENT";
  if (Pathname.startsWith("/teacher")) return "TEACHER";
  return null;
}

export function IdleSignOutWatcher() {
  const Pathname = usePathname();
  const [Mounted, SetMounted] = useState(false);
  useEffect(() => SetMounted(true), []);
  const Role = RoleForPath(Pathname);
  const SignedIn = Boolean(Mounted && Role && getStoredUserForRole(Role));
  return Role && SignedIn ? <IdleSignOutTimer Role={Role} /> : null;
}

function SignOut(Role: "STUDENT" | "TEACHER") {
  // AppShell, when on screen, does its own instant sign-out.
  const Handled = !window.dispatchEvent(new CustomEvent(IDLE_SIGN_OUT_EVENT, { cancelable: true }));
  if (Handled) return;
  try {
    localStorage.setItem("mathpath_login_role", Role);
  } catch {
    // Not needed for the sign-out itself.
  }
  signOutInBackground();
  clearSession();
  window.location.replace(`/login?role=${Role.toLowerCase()}`);
}

function IdleSignOutTimer({ Role }: { Role: "STUDENT" | "TEACHER" }) {
  const [SecondsLeft, SetSecondsLeft] = useState<number | null>(null);
  const SignedOutRef = useRef(false);
  const StayRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const Tick = () => {
      if (SignedOutRef.current) return;
      const Idle = Date.now() - LastInteractionAt();
      if (Idle >= IDLE_SIGN_OUT_MS) {
        SignedOutRef.current = true;
        SetIdleWarningShowing(false);
        try {
          localStorage.setItem(SIGNED_OUT_REASON_KEY, "idle");
        } catch {
          // Only the explanation on the sign-in page is lost.
        }
        SignOut(Role);
        return;
      }
      if (Idle >= IDLE_WARNING_MS) {
        SetIdleWarningShowing(true);
        SetSecondsLeft(Math.max(1, Math.ceil((IDLE_SIGN_OUT_MS - Idle) / 1000)));
      } else {
        SetIdleWarningShowing(false);
        SetSecondsLeft(null);
      }
    };
    Tick();
    const Timer = window.setInterval(Tick, 1000);
    // Report activity to the server every 45 seconds while the person is
    // active, on every page (including full-screen ones without the usual
    // heartbeat), so the server's clock follows the browser's.
    const Report = window.setInterval(() => {
      if (!SignedOutRef.current && document.visibilityState === "visible" && IsRecentlyActive()) {
        void api.get("/auth/ping").catch(() => undefined);
      }
    }, 45000);
    // A tab coming back from the background checks at once.
    document.addEventListener("visibilitychange", Tick);
    return () => {
      window.clearInterval(Timer);
      window.clearInterval(Report);
      document.removeEventListener("visibilitychange", Tick);
      SetIdleWarningShowing(false);
    };
  }, [Role]);

  const Showing = SecondsLeft !== null;
  useEffect(() => {
    if (Showing) StayRef.current?.focus();
  }, [Showing]);

  function Stay() {
    MarkActive();
    SetIdleWarningShowing(false);
    SetSecondsLeft(null);
    // Tell the server now, so its clock restarts too.
    void api.get("/auth/ping").catch(() => undefined);
  }

  if (!Showing) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/45 px-4" role="alertdialog" aria-modal="true" aria-labelledby="mp-idle-title" aria-describedby="mp-idle-text">
      <div className="w-full max-w-sm rounded-[24px] border border-[color:var(--mp-role-border,#e2e8f0)] bg-white p-6 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl text-[color:var(--mp-role-primary,#2563eb)]" style={{ background: "color-mix(in srgb, var(--mp-role-primary, #2563eb) 12%, transparent)" }}>
          <Clock3 size={22} />
        </div>
        <h2 id="mp-idle-title" className="mt-4 text-lg font-black text-slate-950 dark:text-white">
          Still There?
        </h2>
        <p id="mp-idle-text" className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
          You&apos;ll be signed out in <span className="font-black tabular-nums text-slate-950 dark:text-white">{SecondsLeft}</span> seconds because there has been no activity for a while.
        </p>
        <button ref={StayRef} type="button" onClick={Stay} className="math-button-primary mt-5 w-full justify-center">
          Stay Signed In
        </button>
      </div>
    </div>
  );
}
