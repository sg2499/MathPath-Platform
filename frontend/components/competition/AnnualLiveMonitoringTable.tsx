"use client";

import { useEffect, useRef, useState } from "react";
import { FormatCompetitionLevelLabel } from "@/lib/api/admin";

// 2026-10-07 (Shailesh): the Live Monitoring board, shared by the admin event
// page and the teacher's Live tab so the two can never drift apart.
//
//   * Remaining is ONE overall timer per student: the whole paper's time
//     (10:00 / 20:00 / 35:00) counting down every second from the moment the
//     student starts. It used to show the active SECTION's time as last
//     reported, refreshed every 15 seconds, so it moved in uneven jumps and
//     went back up at every new section.
//   * Section reads "2 of 4".
//   * "Last Heartbeat Gap" is "Last Seen" ("3s ago").
//
// The server is still the source of truth and is re-read every few seconds
// by the page; this component only counts between reads.

export type AnnualLiveMonitoringRow = {
  assignmentId: string;
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  assignedLevelCode: string;
  slot: { slotLabel: string | null; mode: string } | null;
  liveStatus: "NOT_STARTED" | "IN_PROGRESS" | "STUCK" | "SUBMITTED" | "FINALIZED";
  currentSectionNumber: number | null;
  totalSectionCount: number | null;
  totalRemainingSecondsAtLastHeartbeat: number | null;
  heartbeatGapMilliseconds: number | null;
  // True while the student is on the screen shown before a section: their
  // clock is not running (2026-10-07, section screens).
  clockHeld?: boolean;
};

const LiveStatusTone: Record<AnnualLiveMonitoringRow["liveStatus"], string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
  STUCK: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  SUBMITTED: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  FINALIZED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
};

export function AnnualLiveStatusChip({ status }: { status: AnnualLiveMonitoringRow["liveStatus"] }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${LiveStatusTone[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// One clock for the whole board: every cell reads the same "now", so all
// rows tick on the same beat.
function useSecondTick(): number {
  const [NowMs, SetNowMs] = useState(() => Date.now());
  useEffect(() => {
    const IntervalId = window.setInterval(() => SetNowMs(Date.now()), 1000);
    return () => window.clearInterval(IntervalId);
  }, []);
  return NowMs;
}

function FormatMinSec(TotalSeconds: number): string {
  const Total = Math.max(0, Math.round(TotalSeconds));
  return `${Math.floor(Total / 60)}:${String(Total % 60).padStart(2, "0")}`;
}

function FormatAgo(Seconds: number): string {
  const Total = Math.max(0, Math.floor(Seconds));
  if (Total < 60) return `${Total}s ago`;
  if (Total < 3600) return `${Math.floor(Total / 60)}m ${String(Total % 60).padStart(2, "0")}s ago`;
  return `${Math.floor(Total / 3600)}h ${String(Math.floor((Total % 3600) / 60)).padStart(2, "0")}m ago`;
}

const IsRunning = (Row: AnnualLiveMonitoringRow) => Row.liveStatus === "IN_PROGRESS" || Row.liveStatus === "STUCK";

// A re-read gives a fresh "time left as of the last heartbeat". Rounding on
// the server (whole seconds per heartbeat) means two consecutive reads can
// disagree by a second about when the paper ends; adopting each one as it
// arrives would make the display hesitate or skip. So the end time already
// being counted towards is kept unless a read moves it by more than this --
// which a real change (a section finished early, a reconnect after a pause)
// always does.
const END_TIME_TOLERANCE_MS = 1500;

function RemainingCell({
  Row,
  FetchedAtMs,
  GraceSeconds,
  NowMs,
}: {
  Row: AnnualLiveMonitoringRow;
  FetchedAtMs: number;
  GraceSeconds: number;
  NowMs: number;
}) {
  const EndAtRef = useRef<number | null>(null);

  if (!IsRunning(Row) || Row.totalRemainingSecondsAtLastHeartbeat == null || Row.heartbeatGapMilliseconds == null) {
    EndAtRef.current = null;
    return <span className="text-slate-400">--</span>;
  }

  // The student's last heartbeat, placed on THIS screen's clock: "when the
  // answer arrived, it was already this old". No reliance on the admin's
  // clock agreeing with the server's.
  const HeartbeatAtMs = FetchedAtMs - Row.heartbeatGapMilliseconds;

  // On the screen before a section the student's clock is not running at
  // all: show what is left and hold it still, instead of ticking it down
  // and jumping back up at every refresh.
  if (Row.clockHeld) {
    EndAtRef.current = null;
    const Away = NowMs >= HeartbeatAtMs + GraceSeconds * 1000;
    return (
      <span
        className={Away ? "text-rose-600 dark:text-rose-300" : "text-slate-900 dark:text-white"}
        title={Away ? "Paused: no signal from this student's device" : "Between sections: the clock starts when the student starts the next section"}
      >
        {FormatMinSec(Math.max(0, Row.totalRemainingSecondsAtLastHeartbeat))}
      </span>
    );
  }

  const FreshEndAtMs = HeartbeatAtMs + Row.totalRemainingSecondsAtLastHeartbeat * 1000;
  if (EndAtRef.current == null || Math.abs(EndAtRef.current - FreshEndAtMs) > END_TIME_TOLERANCE_MS) {
    EndAtRef.current = FreshEndAtMs;
  }

  // A student's clock only keeps running for the grace window after their
  // last heartbeat; after that it is paused until they are back. The board
  // stops at the same point, on the value the student will resume from.
  const PausedAtMs = HeartbeatAtMs + GraceSeconds * 1000;
  const IsPaused = NowMs >= PausedAtMs;
  // Paused: a fixed value (what was left at the last heartbeat, less the
  // grace window), not a moving calculation, so it cannot flicker by a
  // second between reads while nothing is actually changing.
  const RemainingSeconds = IsPaused
    ? Math.max(0, Row.totalRemainingSecondsAtLastHeartbeat - GraceSeconds)
    : Math.max(0, Math.ceil((EndAtRef.current - NowMs) / 1000));

  return (
    <span className={IsPaused ? "text-rose-600 dark:text-rose-300" : "text-slate-900 dark:text-white"} title={IsPaused ? "Paused: no signal from this student's device" : undefined}>
      {FormatMinSec(RemainingSeconds)}
    </span>
  );
}

function SectionCell({ Row }: { Row: AnnualLiveMonitoringRow }) {
  if (!IsRunning(Row) || Row.currentSectionNumber == null) return <span className="text-slate-400">--</span>;
  if (Row.totalSectionCount == null) return <span>{Row.currentSectionNumber}</span>;
  return (
    <span>
      {Row.currentSectionNumber} of {Row.totalSectionCount}
    </span>
  );
}

function LastSeenCell({ Row, FetchedAtMs, NowMs }: { Row: AnnualLiveMonitoringRow; FetchedAtMs: number; NowMs: number }) {
  if (!IsRunning(Row) || Row.heartbeatGapMilliseconds == null) return <span className="text-slate-400">--</span>;
  const Seconds = (Row.heartbeatGapMilliseconds + Math.max(0, NowMs - FetchedAtMs)) / 1000;
  return <span>{FormatAgo(Seconds)}</span>;
}

// 2026-10-07 (Shailesh): "when one slot gets underway for one level the admin
// can filter that and see the live monitoring for that level." The options
// are the levels the viewer actually has students in (sent by the server);
// the choice is applied on the server, so a filtered board only loads that
// level's students.
export const ANNUAL_LIVE_ALL_LEVELS = "ALL";

export function AnnualLiveLevelFilter({
  Value,
  LevelCodes,
  OnChange,
}: {
  Value: string;
  LevelCodes: string[];
  OnChange: (Next: string) => void;
}) {
  // Keep the selected level in the list even if no student is in it (for
  // example an address shared from another event), so the control never
  // shows a blank.
  const Options = Value !== ANNUAL_LIVE_ALL_LEVELS && !LevelCodes.includes(Value) ? [...LevelCodes, Value] : LevelCodes;
  return (
    <select
      value={Value}
      onChange={(EventValue) => OnChange(EventValue.target.value)}
      className="math-select text-xs font-black"
      // Sized like the buttons beside it, not the full-width form field
      // .math-select is by default: as wide as its longest level name and
      // no wider, so the toolbar stays on one line.
      style={{ width: "auto", maxWidth: "100%", borderRadius: "9999px", padding: "0.5rem 0.9rem" }}
      aria-label="Filter the live board by level"
    >
      <option value={ANNUAL_LIVE_ALL_LEVELS}>All Levels</option>
      {Options.map((Code) => (
        <option key={Code} value={Code}>
          {FormatCompetitionLevelLabel(Code)}
        </option>
      ))}
    </select>
  );
}

// "Updated 3s ago", next to the Refresh Now button: the board is live
// without anything being pressed.
export function AnnualLiveUpdatedAgo({ FetchedAtMs }: { FetchedAtMs: number }) {
  const NowMs = useSecondTick();
  if (!FetchedAtMs) return null;
  const Seconds = Math.max(0, Math.floor((NowMs - FetchedAtMs) / 1000));
  return (
    <span className="inline-block min-w-[8.5rem] whitespace-nowrap text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
      {Seconds < 2 ? "Updated just now" : `Updated ${FormatAgo(Seconds)}`}
    </span>
  );
}

export function AnnualLiveMonitoringTable({
  Rows,
  FetchedAtMs,
  GraceSeconds,
  ShowLastSeen = true,
}: {
  Rows: AnnualLiveMonitoringRow[];
  // When the rows were received (react-query's dataUpdatedAt).
  FetchedAtMs: number;
  GraceSeconds: number;
  ShowLastSeen?: boolean;
}) {
  const NowMs = useSecondTick();
  // The three columns whose text changes every second have a set width that
  // is wider than anything they will ever show, and fixed-width digits, so a
  // ticking number can never nudge the columns beside it. Nothing wraps; on
  // a narrow screen the board scrolls sideways instead.
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm font-bold">
        <colgroup>
          <col />
          <col />
          <col />
          <col />
          <col style={{ width: 112 }} />
          <col style={{ width: 124 }} />
          {ShowLastSeen && <col style={{ width: 148 }} />}
        </colgroup>
        <thead>
          <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
            <th className="whitespace-nowrap px-2 py-1.5">Student</th>
            <th className="whitespace-nowrap px-2 py-1.5">Level</th>
            <th className="whitespace-nowrap px-2 py-1.5">Slot</th>
            <th className="whitespace-nowrap px-2 py-1.5">Status</th>
            <th className="whitespace-nowrap px-2 py-1.5">Section</th>
            <th className="whitespace-nowrap px-2 py-1.5">Remaining</th>
            {ShowLastSeen && <th className="whitespace-nowrap px-2 py-1.5">Last Seen</th>}
          </tr>
        </thead>
        <tbody>
          {Rows.map((Row) => (
            <tr key={Row.assignmentId} className="border-t border-[color:var(--mp-role-border)]">
              <td className="whitespace-nowrap px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
              <td className="whitespace-nowrap px-2 py-2">{FormatCompetitionLevelLabel(Row.assignedLevelCode)}</td>
              <td className="whitespace-nowrap px-2 py-2">{Row.slot?.slotLabel || Row.slot?.mode || "--"}</td>
              <td className="whitespace-nowrap px-2 py-2"><AnnualLiveStatusChip status={Row.liveStatus} /></td>
              <td className="whitespace-nowrap px-2 py-2 tabular-nums"><SectionCell Row={Row} /></td>
              <td className="whitespace-nowrap px-2 py-2 tabular-nums"><RemainingCell Row={Row} FetchedAtMs={FetchedAtMs} GraceSeconds={GraceSeconds} NowMs={NowMs} /></td>
              {ShowLastSeen && <td className="whitespace-nowrap px-2 py-2 tabular-nums"><LastSeenCell Row={Row} FetchedAtMs={FetchedAtMs} NowMs={NowMs} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
