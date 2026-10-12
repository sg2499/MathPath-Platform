// 2026-10-12 (Shailesh): teacher and student accounts sign out after 20
// minutes with no activity (admins never). This module tracks real
// interaction -- a click, key, scroll, touch or mouse movement -- in any open
// tab of the platform (shared through localStorage), and tells the server
// about it: every request from this app carries X-MP-Client, and a request
// that follows interaction in the last minute also carries X-MP-Active: 1
// (see lib/api.ts). The server keeps its own clock from those
// (app/dependencies.py), so a closed tab or a sleeping laptop can't keep a
// session alive. Background polling never counts as activity.

export const IDLE_SIGN_OUT_MS = 20 * 60 * 1000;
export const IDLE_WARNING_MS = 19 * 60 * 1000;
// Longer than the 45-second activity report below, so no interaction falls
// between two reports uncounted.
const RECENT_MS = 90 * 1000;
const SHARED_KEY = "mathpath_last_interaction";
const SHARE_EVERY_MS = 10 * 1000;
export const SIGNED_OUT_REASON_KEY = "mathpath_signed_out_reason";

// A student taking a test is always treated as active: a practice sheet,
// assessment, mock exam or annual paper in progress is never interrupted.
const TEST_ROUTE_PATTERN = /^\/student\/(attempt|assessment-attempt|competition\/mock-attempt|competition\/annual\/attempt)\//;

let LastInteraction = typeof window !== "undefined" ? Date.now() : 0;
let LastShared = 0;
let Started = false;
// While the "you'll be signed out" warning is showing, mouse movement alone
// doesn't count: a click, tap, key or the Stay Signed In button does.
let WarningShowing = false;
export function SetIdleWarningShowing(Showing: boolean): void {
  WarningShowing = Showing;
}

function ReadShared(): number {
  try {
    return Number(localStorage.getItem(SHARED_KEY)) || 0;
  } catch {
    return 0;
  }
}

export function IsOnTestScreen(): boolean {
  return typeof window !== "undefined" && TEST_ROUTE_PATTERN.test(window.location.pathname);
}

export function MarkActive(): void {
  const Now = Date.now();
  LastInteraction = Now;
  if (Now - LastShared >= SHARE_EVERY_MS) {
    LastShared = Now;
    try {
      localStorage.setItem(SHARED_KEY, String(Now));
    } catch {
      // Storage unavailable: this tab still tracks itself.
    }
  }
}

// The most recent interaction in this tab or any other open tab.
export function LastInteractionAt(): number {
  if (IsOnTestScreen()) return Date.now();
  return Math.max(LastInteraction, ReadShared());
}

export function IsRecentlyActive(): boolean {
  return Date.now() - LastInteractionAt() < RECENT_MS;
}

export function StartActivityTracking(): void {
  if (Started || typeof window === "undefined") return;
  Started = true;
  MarkActive();
  let LastMove = 0;
  const OnMove = () => {
    if (WarningShowing) return;
    const Now = Date.now();
    if (Now - LastMove < 2000) return;
    LastMove = Now;
    MarkActive();
  };
  const Options: AddEventListenerOptions = { passive: true, capture: true };
  ["pointerdown", "keydown", "wheel", "touchstart", "scroll"].forEach((Name) => window.addEventListener(Name, MarkActive, Options));
  window.addEventListener("mousemove", OnMove, Options);
  // A test in progress keeps every other open tab from signing the student
  // out (it reports itself as active to the other tabs every few seconds).
  window.setInterval(() => {
    if (IsOnTestScreen()) MarkActive();
  }, 5000);
  // Coming back to the tab is not activity by itself; the next real
  // interaction is.
}
