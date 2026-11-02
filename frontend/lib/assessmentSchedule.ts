"use client";

// The teacher-set date and time for a level assessment (2026-11-02,
// Shailesh). Same flow as the Annual Competition: the instructions open 10
// minutes before the set time, and Start opens exactly at it (never before)
// and then stays open. No set time (the test account, or an assessment
// assigned before this rule) means open straight away.
//
// The server refuses an early brief or Start on its own; these helpers only
// make the screen switch on by itself at the right second, with no refresh.

import { useEffect, useState } from "react";
import { formatMathPathDateTime, formatMathPathTime } from "@/lib/date";

export const ASSESSMENT_INSTRUCTIONS_OPEN_MINUTES_BEFORE = 10;

// How far this device's clock is from the server's, from the last reply that
// carried serverNow. Keeps "Opens at 11:30" switching on at the server's
// 11:30 even when the device clock is a minute off.
let ClockOffsetMs = 0;
// Only a newer server reading moves the offset, and each is used once, when
// it first arrives. Re-reading an older serverNow on a later render (every
// row and every re-render carries one) would pull the clock back to the
// moment of that reply and freeze every countdown.
let LastServerMs = 0;

export function RecordAssessmentServerNow(ServerNow?: string | null) {
  if (!ServerNow) return;
  const ServerMs = new Date(ServerNow).getTime();
  if (Number.isNaN(ServerMs) || ServerMs <= LastServerMs) return;
  LastServerMs = ServerMs;
  ClockOffsetMs = ServerMs - Date.now();
}

export function AssessmentNowMs() {
  return Date.now() + ClockOffsetMs;
}

function ToMs(Value?: string | null): number | null {
  if (!Value) return null;
  const Ms = new Date(Value).getTime();
  return Number.isNaN(Ms) ? null : Ms;
}

export type AssessmentScheduleFields = {
  scheduledStartAt?: string | null;
  instructionsOpenAt?: string | null;
  serverNow?: string | null;
};

export function AssessmentStartAtMs(Source?: AssessmentScheduleFields | null): number | null {
  return ToMs(Source?.scheduledStartAt);
}

export function AssessmentInstructionsOpenAtMs(Source?: AssessmentScheduleFields | null): number | null {
  const Explicit = ToMs(Source?.instructionsOpenAt);
  if (Explicit != null) return Explicit;
  const StartMs = AssessmentStartAtMs(Source);
  return StartMs == null ? null : StartMs - ASSESSMENT_INSTRUCTIONS_OPEN_MINUTES_BEFORE * 60 * 1000;
}

// A clock that ticks once a second, and only while there is still a moment
// ahead (UntilMs) to wait for -- the same pattern the Annual Competition's
// assignment card and instructions page use.
export function useAssessmentClock(UntilMs: number | null): number {
  const [NowMs, SetNowMs] = useState(() => AssessmentNowMs());
  const Waiting = UntilMs != null && NowMs < UntilMs;
  useEffect(() => {
    if (!Waiting) return;
    const IntervalId = window.setInterval(() => SetNowMs(AssessmentNowMs()), 1000);
    return () => window.clearInterval(IntervalId);
  }, [Waiting]);
  return NowMs;
}

export function FormatAssessmentSchedule(Value?: string | null) {
  return formatMathPathDateTime(Value);
}

export function FormatAssessmentClock(Value?: string | null) {
  return formatMathPathTime(Value);
}

// "in 2 h 05 min", "in 4:59" -- how long until a moment, for the waiting text.
export function FormatAssessmentCountdown(TargetMs: number, NowMs: number): string {
  const Seconds = Math.max(0, Math.ceil((TargetMs - NowMs) / 1000));
  const Days = Math.floor(Seconds / 86400);
  const Hours = Math.floor((Seconds % 86400) / 3600);
  const Minutes = Math.floor((Seconds % 3600) / 60);
  const Rest = Seconds % 60;
  if (Days > 0) return `in ${Days} day${Days === 1 ? "" : "s"} ${Hours} h`;
  if (Hours > 0) return `in ${Hours} h ${String(Minutes).padStart(2, "0")} min`;
  return `in ${Minutes}:${String(Rest).padStart(2, "0")}`;
}

// India time "YYYY-MM-DDTHH:mm" for a datetime-local input, from an ISO time.
// The teacher's screen works in India time, like every date in MathPath.
export function ToIndiaDateTimeLocal(Value?: string | null): string {
  const Ms = ToMs(Value);
  if (Ms == null) return "";
  const India = new Date(Ms + (5 * 60 + 30) * 60 * 1000);
  return India.toISOString().slice(0, 16);
}

// The reverse: a datetime-local value read as India time, as an ISO string
// with its offset, which the server stores in UTC.
export function FromIndiaDateTimeLocal(Value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(Value)) return null;
  return `${Value}:00+05:30`;
}

// The earliest a teacher may choose: the next whole minute, in India time.
export function IndiaDateTimeLocalMin(): string {
  const Ms = AssessmentNowMs() + 60 * 1000;
  return ToIndiaDateTimeLocal(new Date(Ms).toISOString());
}
