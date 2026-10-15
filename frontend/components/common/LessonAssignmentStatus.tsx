import { CalendarClock, CircleDashed, CircleCheck, RotateCcw, Split } from "lucide-react";
import type { LessonAssignmentStateValue, TeacherLessonStatus } from "@/lib/api/teacher";

// 2026-10-15 (Shailesh): "for a teacher it is very difficult to understand
// which students have been assigned the next lesson and the ones which have
// not been assigned". Every lesson now says, in plain words, whether it has
// been given to the student:
//
//   Not Assigned                       nothing from this lesson given yet
//   Assigned · Mon 20 – Fri 24 Oct     every sheet given (the usual "whole
//                                      week at once"); the dates are the days
//                                      the sheets open
//   Scheduled · starts Mon 20 Oct      every sheet given, none open yet
//   Partly Assigned · 2 of 5 Sheets    the rare one-sheet-at-a-time case
//
// The status comes from the backend (lesson_progress_service.py,
// _LessonStatus); a lesson missing from a student's lessonStatus map means
// nothing from it has been given.

const IST = "Asia/Kolkata";

function DayParts(Value?: string | null) {
  if (!Value) return null;
  const DateValue = new Date(Value);
  if (Number.isNaN(DateValue.getTime())) return null;
  const Parts: Record<string, string> = {};
  new Intl.DateTimeFormat("en-IN", { timeZone: IST, weekday: "short", day: "numeric", month: "short", year: "numeric" })
    .formatToParts(DateValue)
    .forEach((Part) => {
      if (Part.type !== "literal") Parts[Part.type] = Part.value;
    });
  return { weekday: Parts.weekday, day: Parts.day, month: Parts.month, year: Parts.year };
}

/** "Mon 20 Oct" (India time). */
export function LessonDayLabel(Value?: string | null) {
  const Day = DayParts(Value);
  return Day ? `${Day.weekday} ${Day.day} ${Day.month}` : "";
}

/** "Mon 20 – Fri 24 Oct", "Fri 31 Oct – Tue 4 Nov" or "Mon 20 Oct". */
export function LessonDayRange(First?: string | null, Last?: string | null) {
  const Start = DayParts(First);
  const End = DayParts(Last);
  if (!Start) return "";
  if (!End || (Start.day === End.day && Start.month === End.month && Start.year === End.year)) {
    return `${Start.weekday} ${Start.day} ${Start.month}`;
  }
  if (Start.month === End.month && Start.year === End.year) {
    return `${Start.weekday} ${Start.day} – ${End.weekday} ${End.day} ${End.month}`;
  }
  return `${Start.weekday} ${Start.day} ${Start.month} – ${End.weekday} ${End.day} ${End.month}`;
}

export type LessonStateView = {
  state: LessonAssignmentStateValue;
  label: string;
  tone: string;
  Icon: typeof CircleCheck;
};

const TONES: Record<LessonAssignmentStateValue, string> = {
  NOT_ASSIGNED: "border-dashed border-amber-400 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  PARTLY: "border-orange-200 bg-orange-50 text-orange-800 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-200",
  // Not blue/violet: the teacher and student themes recolour those families
  // to the role colour (globals.css), which would make Assigned look like
  // every other pill.
  SCHEDULED: "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950 dark:text-teal-200",
  ASSIGNED: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
};

export function LessonStatusState(Status?: TeacherLessonStatus | null): LessonAssignmentStateValue {
  return Status?.state || "NOT_ASSIGNED";
}

export function DescribeLessonStatus(Status?: TeacherLessonStatus | null, TotalFallback = 0): LessonStateView {
  const State = LessonStatusState(Status);
  if (State === "ASSIGNED") {
    const Range = LessonDayRange(Status?.firstOpensAt, Status?.lastOpensAt);
    return { state: State, label: Range ? `Assigned · ${Range}` : "Assigned", tone: TONES[State], Icon: CircleCheck };
  }
  if (State === "SCHEDULED") {
    const Day = LessonDayLabel(Status?.nextOpensAt || Status?.firstOpensAt);
    return { state: State, label: Day ? `Scheduled · starts ${Day}` : "Scheduled", tone: TONES[State], Icon: CalendarClock };
  }
  if (State === "PARTLY") {
    const Total = Status?.assignableTotal || Status?.total || TotalFallback;
    return { state: State, label: `Partly Assigned · ${Status?.given ?? 0} of ${Total} Sheets`, tone: TONES[State], Icon: Split };
  }
  return { state: "NOT_ASSIGNED", label: "Not Assigned", tone: TONES.NOT_ASSIGNED, Icon: CircleDashed };
}

/** The selected lesson's status on an Assign Practice card. */
export function LessonAssignmentPill({ Status, TotalFallback = 0 }: { Status?: TeacherLessonStatus | null; TotalFallback?: number }) {
  const View = DescribeLessonStatus(Status, TotalFallback);
  const Total = Status?.total || TotalFallback;
  const Started = Boolean(Status && (Status.done > 0 || Status.cleared > 0));
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`math-badge ${View.tone}`} data-lesson-state={View.state}>
        <View.Icon size={12} />
        {View.label}
      </span>
      {Started ? (
        <span className="math-badge border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {Status?.done ?? 0}/{Total} Done · {Status?.cleared ?? 0}/{Total} Cleared
        </span>
      ) : null}
      {Status?.reattemptOpen ? (
        <span className="math-badge border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <RotateCcw size={12} />
          Reattempt Open
        </span>
      ) : null}
    </span>
  );
}
