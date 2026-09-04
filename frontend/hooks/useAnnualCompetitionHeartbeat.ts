"use client";

import { useCallback, useEffect, useRef } from "react";
import { recordAnnualCompetitionHeartbeat, type AnnualCompetitionAttempt } from "@/lib/api/student";

// Package 4's own heartbeat mechanic (backend/app/services/annual_competition_attempt_service.py)
// only ever moves remaining time in response to an actual heartbeat -- there
// is no server-side scheduler. "~5-10s" is the plan's own interval; 7000ms
// sits comfortably inside that window and well under the 45s grace window,
// so normal use never brushes the grace cap (that only ever happens on a
// real pause -- a backgrounded/closed tab, where this interval simply stops
// firing, which IS the pause signal by design -- see the service's module
// docstring).
const HEARTBEAT_INTERVAL_MS = 7000;

// Drives the section timer's actual source of truth (unlike Competition
// Mock's single client-side countdown against a fixed expires_at, this is a
// real server round-trip on a fixed cadence) and surfaces every response
// back to the caller so it can react to a section auto-advancing, the whole
// attempt finalizing, or the section-not-active / session-superseded errors
// every other mutating endpoint in the backend service can also return.
//
// Also returns `fireNow`, an imperative one-off heartbeat outside the
// regular cadence -- used when the local visual countdown (which just ticks
// between heartbeats, see useAttemptTimer) reaches zero, so the UI reacts
// immediately instead of waiting up to HEARTBEAT_INTERVAL_MS for the next
// scheduled beat to confirm the section has actually ended server-side.
export function useAnnualCompetitionHeartbeat(
  attemptId: string | undefined,
  sessionToken: string | undefined,
  sectionNumber: number | undefined,
  enabled: boolean,
  onUpdate: (attempt: AnnualCompetitionAttempt) => void,
  onError: (error: unknown) => void
) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const inFlightRef = useRef(false);

  const fireNow = useCallback(async () => {
    if (!attemptId || !sessionToken || !sectionNumber) return;
    // Never overlap two in-flight heartbeats (e.g. a slow response
    // straddling the next tick) -- a stray duplicate would still be
    // harmless server-side (each heartbeat just compares itself to the
    // section's last_heartbeat_at), but skipping it here keeps the request
    // pattern predictable.
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const updated = await recordAnnualCompetitionHeartbeat(attemptId, { sessionToken, sectionNumber });
      onUpdateRef.current(updated);
    } catch (error) {
      onErrorRef.current(error);
    } finally {
      inFlightRef.current = false;
    }
  }, [attemptId, sessionToken, sectionNumber]);

  useEffect(() => {
    if (!enabled || !attemptId || !sessionToken || !sectionNumber) return;
    const interval = window.setInterval(fireNow, HEARTBEAT_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [attemptId, sessionToken, sectionNumber, enabled, fireNow]);

  return { fireNow };
}
