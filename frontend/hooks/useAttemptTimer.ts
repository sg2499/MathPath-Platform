"use client";

import { useEffect, useRef, useState } from "react";

// The countdown on every paper: DPS sheets, level assessments, Competition
// Mocks and the Annual Competition all use this one hook.
//
// It counts down to a real deadline (not a counter), so a backgrounded or
// throttled tab can never drift: every tick recomputes from the deadline,
// and the optional onVisible callback re-fetches the attempt the moment the
// tab is visible again.
//
// 2026-11-02 (Shailesh): "the timer goes like 59:59, 59:58 then stutters and
// goes to 59:52 ... it should be smooth". The old version re-created its
// 1-second timeout whenever the page redrew -- its effect depended on the
// page's onTimeUp callback, which is a new function on almost every render
// (it closes over React Query mutation objects). Every typed key, answer
// save or question change therefore restarted the second, so while a child
// was typing the clock stood still and then jumped to catch up. Now:
// - the callbacks live in refs, so redraws never touch the clock;
// - one self-scheduling tick per second, timed to the exact moment the
//   displayed second changes (not "1 s after the last redraw");
// - a fresh value from the server (answer saves, refetches, heartbeats)
//   only moves the deadline when it really differs (over 1.5 s), so normal
//   network rounding never makes the display hop;
// - `paused` freezes the countdown and, on resume, moves the deadline on by
//   exactly the time it was paused (the assessment section slide).
const RESYNC_THRESHOLD_MS = 1500;

function SecondsLeft(DeadlineMs: number, NowMs: number) {
  // Ceil: a 60-minute paper shows 60:00 for its first second, then 59:59.
  return Math.max(0, Math.ceil((DeadlineMs - NowMs) / 1000));
}

export function useAttemptTimer(
  initialSeconds: number,
  onTimeUp: () => void,
  onVisible?: () => void,
  paused: boolean = false
) {
  const onTimeUpRef = useRef(onTimeUp);
  onTimeUpRef.current = onTimeUp;
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  const deadlineRef = useRef(Date.now() + initialSeconds * 1000);
  const pausedAtRef = useRef<number | null>(paused ? Date.now() : null);
  const firedRef = useRef(false);
  const [remainingSeconds, setRemainingSeconds] = useState(Math.max(0, Math.ceil(initialSeconds)));
  // Bumped whenever the deadline moves, so the tick loop re-aligns to it.
  const [anchorVersion, setAnchorVersion] = useState(0);

  // A new value from the server.
  useEffect(() => {
    if (pausedAtRef.current != null) {
      // Frozen: keep showing the paused value. The value that matters is the
      // one that arrives after the pause ends.
      return;
    }
    const NowMs = Date.now();
    const ServerDeadline = NowMs + initialSeconds * 1000;
    if (Math.abs(ServerDeadline - deadlineRef.current) > RESYNC_THRESHOLD_MS) {
      deadlineRef.current = ServerDeadline;
      setRemainingSeconds(SecondsLeft(ServerDeadline, NowMs));
      setAnchorVersion((Value) => Value + 1);
    }
    if (initialSeconds > 0) firedRef.current = false;
  }, [initialSeconds]);

  // Pause and resume.
  useEffect(() => {
    const NowMs = Date.now();
    if (paused) {
      if (pausedAtRef.current == null) pausedAtRef.current = NowMs;
      return;
    }
    if (pausedAtRef.current != null) {
      deadlineRef.current += NowMs - pausedAtRef.current;
      pausedAtRef.current = null;
      setRemainingSeconds(SecondsLeft(deadlineRef.current, NowMs));
      setAnchorVersion((Value) => Value + 1);
    }
  }, [paused]);

  // The tick: wakes exactly when the displayed second changes.
  useEffect(() => {
    if (paused) return;
    let TimerId: number | undefined;
    let Stopped = false;
    const Tick = () => {
      if (Stopped) return;
      const NowMs = Date.now();
      const MsLeft = deadlineRef.current - NowMs;
      const Seconds = SecondsLeft(deadlineRef.current, NowMs);
      setRemainingSeconds((Previous) => (Previous === Seconds ? Previous : Seconds));
      if (Seconds <= 0) {
        if (!firedRef.current) {
          firedRef.current = true;
          onTimeUpRef.current();
        }
        return;
      }
      const UntilNextSecond = MsLeft % 1000 || 1000;
      TimerId = window.setTimeout(Tick, UntilNextSecond + 15);
    };
    Tick();
    return () => {
      Stopped = true;
      if (TimerId !== undefined) window.clearTimeout(TimerId);
    };
  }, [paused, anchorVersion]);

  // Back from a hidden tab: show the true time at once and let the page
  // re-fetch the attempt.
  useEffect(() => {
    const HandleVisibility = () => {
      if (document.hidden) return;
      if (pausedAtRef.current == null) {
        setRemainingSeconds(SecondsLeft(deadlineRef.current, Date.now()));
        setAnchorVersion((Value) => Value + 1);
      }
      onVisibleRef.current?.();
    };
    document.addEventListener("visibilitychange", HandleVisibility);
    return () => document.removeEventListener("visibilitychange", HandleVisibility);
  }, []);

  return remainingSeconds;
}
