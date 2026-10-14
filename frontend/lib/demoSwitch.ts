// "Show Demo Accounts" (2026-10-14, Phase 2 part 3). Demo / test student
// accounts are left out of every list, count, leaderboard, notification and
// payments screen for admin and teachers -- unless this switch is on, when
// they appear everywhere like real students so new features can be tested
// on them. Remembered per browser. lib/api.ts sends X-MP-Show-Demo: 1 on
// every admin/teacher request while it is on; the server decides the rest
// (backend app/services/demo_students.py).

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "mathpath_show_demo";
const CHANGE_EVENT = "mathpath-demo-switch";

export function IsShowingDemo(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function SetShowingDemo(Value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (Value) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage blocked: the switch simply stays off.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function Subscribe(Callback: () => void) {
  const OnStorage = (Event: StorageEvent) => {
    if (Event.key === STORAGE_KEY) Callback();
  };
  window.addEventListener(CHANGE_EVENT, Callback);
  window.addEventListener("storage", OnStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, Callback);
    window.removeEventListener("storage", OnStorage);
  };
}

export function useShowDemo(): boolean {
  return useSyncExternalStore(Subscribe, IsShowingDemo, () => false);
}
