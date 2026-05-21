"use client";

import { useEffect, useRef, useState } from "react";

export function useAttemptTimer(initialSeconds: number, onTimeUp: () => void) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);
  const firedRef = useRef(false);

  useEffect(() => {
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
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [remainingSeconds, onTimeUp]);

  return remainingSeconds;
}
