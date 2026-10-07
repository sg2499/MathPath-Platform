// "A student is sitting a paper on this page right now."
//
// 2026-10-07 (event-day readiness): the notification bell asks the server for
// the student's notifications every 15 seconds on every page -- including
// the page where they are sitting an Annual Competition paper, where nobody
// is going to read them. With a few hundred students mid-paper at once that
// was about a fifth of all the traffic reaching the server, competing with
// the calls that matter (heartbeats and answer saves).
//
// The paper page sets this flag while a paper is IN_PROGRESS; the bell skips
// its background refresh while it is set, and refreshes once the moment it
// clears, so nothing is missed -- it simply arrives when the paper is over.
// Clicking the bell still loads the list as always.
//
// A module-level flag plus a window event (not React context) because the
// bell lives in the shared shell and the paper page is a leaf: neither
// should have to know where the other is mounted.
const CHANGE_EVENT = "mathpath:paper-in-progress-change";

let PaperInProgress = false;

export function setPaperInProgress(Value: boolean) {
  if (PaperInProgress === Value) return;
  PaperInProgress = Value;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function isPaperInProgress() {
  return PaperInProgress;
}

export function onPaperInProgressChange(Listener: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, Listener);
  return () => window.removeEventListener(CHANGE_EVENT, Listener);
}
