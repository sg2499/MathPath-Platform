"use client";

import { useEffect, useRef, useState } from "react";

// Countdown is anchored to a real deadline (Date.now() + initialSeconds) and
// recomputed from that deadline on every tick and on tab-visibility regain,
// instead of blindly decrementing a counter once per setTimeout firing.
// Background tabs/apps throttle or fully pause setTimeout chains, which used
// to let the displayed time drift far ahead of the real, server-enforced
// deadline -- a student could background the tab, the exam would genuinely
// expire server-side, and the frozen/lagging display would still show
// minutes left until the next network call (an answer save) surfaced the
// already-completed status. Anchoring to a deadline makes every recompute
// self-correcting regardless of timer drift, and the optional onVisible
// callback lets the caller re-fetch the attempt from the server the instant
// the tab becomes visible again, so a background auto-submit shows up
// immediately instead of leaving stale "still active" UI on screen.
export function useAttemptTimer(
  initialSeconds: number,
  onTimeUp: () => void,
  onVisible?: () => void
) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);
  const firedRef = useRef(false);
  const deadlineRef = useRef(Date.now() + initialSeconds * 1000);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    deadlineRef.current = Date.now() + initialSeconds * 1000;
    setRemainingSeconds(initialSeconds);
    if (initialSeconds > 0) firedRef.current = false;
  }, [initialSeconds]);

  useEffect(() => {
    if (remainingSeconds <= 0) {
      if (!firedRef.current) {
        firedRef.current = true;
        onTimeUp();
      }
      return;
    }

    const timer = window.setTimeout(() => {
      const next = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemainingSeconds(next);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [remainingSeconds, onTimeUp]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) return;
      const next = Math.max(0, Math.round((deadlineRef.current - Date.now()) / 1000));
      setRemainingSeconds(next);
      onVisibleRef.current?.();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  return remainingSeconds;
}
