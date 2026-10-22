"use client";

// Performance Reports > Learning Performance views (2026-10-21, Part 3):
// the drill-down (Module > Level > Lesson > DPS, then the students on one
// DPS), By Student and By Teacher. Every number is the server's
// (/admin/results/learning-rollup), counted like the tiles and the trackers.

import { SortableHeader } from "@/components/common/SortableHeader";
import { StatePill, type ChainTone } from "@/components/common/DetailWorkspaceViews";
import type {
  LearningContentRow,
  LearningDpsStudentRow,
  LearningPeriod,
  LearningRollup,
  LearningStudentRow,
  LearningTeacherRow,
  LearningView,
} from "@/lib/api/admin";
import type { SortDirection } from "@/lib/sortable";
import { formatMathPathDate } from "@/lib/date";
import { ArrowRight, ChevronLeft, ChevronRight, ChevronsRight, Home } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

export const LEARNING_VIEWS: readonly LearningView[] = ["content", "students", "teachers", "attempts"] as const;
export const LEARNING_PERIODS: readonly LearningPeriod[] = ["7d", "30d", "90d", "all"] as const;
const VIEW_LABEL: Record<LearningView, string> = { content: "Drill-Down", students: "By Student", teachers: "By Teacher", attempts: "All Attempts" };
const PERIOD_LABEL: Record<LearningPeriod, string> = { "7d": "7 Days", "30d": "30 Days", "90d": "90 Days", all: "All Time" };
const KIND_HEADING: Record<string, string> = { module: "Module", level: "Level", lesson: "Lesson", dps: "DPS" };
const PAGE = 50;

const Count = (Value: number | null | undefined) => (Value === null || Value === undefined ? "—" : Value.toLocaleString("en-IN"));
const Percent = (Value: number | null | undefined) => (Value === null || Value === undefined ? "—" : `${Value}%`);
function Duration(Seconds: number | null | undefined) {
  if (!Seconds) return "—";
  const Total = Math.round(Seconds);
  if (Total < 60) return `${Total} Sec`;
  const Minutes = Math.floor(Total / 60);
  if (Minutes < 60) return Total % 60 ? `${Minutes} Min ${String(Total % 60).padStart(2, "0")} Sec` : `${Minutes} Min`;
  const Hours = Math.floor(Minutes / 60);
  return Minutes % 60 ? `${Hours} H ${Minutes % 60} Min` : `${Hours} H`;
}
const When = (Value: string | null | undefined) => (Value ? formatMathPathDate(Value) : "—");

export function PeriodLabel(Period: LearningPeriod) {
  return Period === "all" ? "All Time" : `Last ${PERIOD_LABEL[Period]}`;
}

/** The view switcher and the period, in one card. */
export function LearningViewBar({ View, OnView, Period, OnPeriod }: { View: LearningView; OnView: (Next: LearningView) => void; Period: LearningPeriod; OnPeriod: (Next: LearningPeriod) => void }) {
  return (
    <section className="math-card pr-lv-bar p-3 sm:p-4">
      <div role="tablist" aria-label="Learning Performance View" className="pr-lv-group">
        {LEARNING_VIEWS.map((Value) => (
          <button
            key={Value}
            type="button"
            role="tab"
            aria-selected={View === Value}
            onClick={() => OnView(Value)}
            className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${View === Value ? "is-active math-admin-tab-force-selected" : ""}`}
          >
            {VIEW_LABEL[Value]}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Period" className="pr-lv-group">
        {LEARNING_PERIODS.map((Value) => (
          <button
            key={Value}
            type="button"
            aria-pressed={Period === Value}
            onClick={() => OnPeriod(Value)}
            className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${Period === Value ? "is-active math-admin-tab-force-selected" : ""}`}
          >
            {PERIOD_LABEL[Value]}
          </button>
        ))}
      </div>
    </section>
  );
}

function useSorted<Row, Key extends string>(Rows: Row[], DefaultKey: Key | null, Value: (Row: Row, Key: Key) => string | number | null) {
  const [Sort, SetSort] = useState<{ Key: Key | null; Direction: SortDirection }>({ Key: DefaultKey, Direction: "desc" });
  const Sorted = useMemo(() => {
    if (!Sort.Key) return Rows;
    const SortKey = Sort.Key;
    const Out = [...Rows];
    Out.sort((First, Second) => {
      const A = Value(First, SortKey);
      const B = Value(Second, SortKey);
      if (A === B) return 0;
      if (A === null) return 1; // empty values last, either way
      if (B === null) return -1;
      const Order = typeof A === "number" && typeof B === "number" ? A - B : String(A).localeCompare(String(B));
      return Sort.Direction === "asc" ? Order : -Order;
    });
    return Out;
  }, [Rows, Sort, Value]);
  const Header = (Key: Key, Label: ReactNode, Align: "left" | "center" = "center") => (
    <SortableHeader
      active={Sort.Key === Key}
      direction={Sort.Direction}
      align={Align}
      onClick={() =>
        SetSort((Current) =>
          Current.Key !== Key ? { Key, Direction: Align === "left" ? "asc" : "desc" } : Current.Direction === (Align === "left" ? "asc" : "desc") ? { Key, Direction: Align === "left" ? "desc" : "asc" } : { Key: DefaultKey, Direction: "desc" },
        )
      }
    >
      {Label}
    </SortableHeader>
  );
  return { Sorted, Header };
}

function usePaged<Row>(Rows: Row[]) {
  const [Page, SetPage] = useState(0);
  useEffect(() => SetPage(0), [Rows]);
  const Pages = Math.max(1, Math.ceil(Rows.length / PAGE));
  const Safe = Math.min(Page, Pages - 1);
  return {
    Shown: Rows.slice(Safe * PAGE, (Safe + 1) * PAGE),
    Footer: (Noun: string) => (
      <div className="pr-lv-foot">
        <p className="pr-attempts-count">{`Showing ${Rows.length ? Safe * PAGE + 1 : 0}–${Math.min(Rows.length, (Safe + 1) * PAGE)} of ${Rows.length.toLocaleString("en-IN")} ${Noun}`}</p>
        {Pages > 1 ? (
          <nav className="pr-pager" aria-label="Pages">
            <button type="button" className="math-button-secondary" disabled={Safe === 0} onClick={() => SetPage(Safe - 1)}><ChevronLeft size={16} />Previous</button>
            <span className="pr-pager-text">{`Page ${Safe + 1} Of ${Pages}`}</span>
            <button type="button" className="math-button-secondary" disabled={Safe >= Pages - 1} onClick={() => SetPage(Safe + 1)}>Next<ChevronRight size={16} /></button>
          </nav>
        ) : null}
      </div>
    ),
  };
}

function Flag({ Row, Benchmark }: { Row: { flag: string | null }; Benchmark: number }) {
  if (!Row.flag) return null;
  const Title = Row.flag === "LOW_ACCURACY" ? `Average accuracy below the ${Benchmark}% benchmark` : "Fewer than half the DPS cleared on the first try";
  return (
    <span className="pr-lv-flag">
      <StatePill tone="amber" title={Title}>{Row.flag === "LOW_ACCURACY" ? "Low Accuracy" : "Few First-Try Clears"}</StatePill>
    </span>
  );
}

function Accuracy({ Value, Benchmark }: { Value: number | null; Benchmark: number }) {
  if (Value === null || Value === undefined) return <span className="pr-muted">—</span>;
  return <span className="pr-score-accuracy" data-met={Value >= Benchmark ? "true" : "false"}>{`${Value}%`}</span>;
}

function Cleared({ Row }: { Row: { dpsCleared: number; dpsCovered: number } }) {
  const Share = Row.dpsCovered ? Math.round((100 * Row.dpsCleared) / Row.dpsCovered) : 0;
  return (
    <span className="pr-lv-cleared">
      <span className="pr-lv-cleared-text">{`${Count(Row.dpsCleared)} of ${Count(Row.dpsCovered)}`}</span>
      <span className="pr-ov-bar pr-lv-cleared-bar" aria-hidden="true"><span style={{ width: `${Math.max(Row.dpsCleared ? 4 : 0, Share)}%` }} /></span>
    </span>
  );
}

function Backlog({ Value }: { Value: number }) {
  return Value ? <StatePill tone="amber">{Count(Value)}</StatePill> : <span className="pr-muted">0</span>;
}

/** Where the drill-down is, each step a way back. */
export function LearningBreadcrumb({ Path, OnCrumb }: { Path: LearningRollup["path"]; OnCrumb: (Kind: LearningRollup["path"][number]["kind"]) => void }) {
  return (
    <nav aria-label="Drill-Down" className="pr-lv-crumbs">
      {Path.map((Item, Index) => {
        const Last = Index === Path.length - 1;
        return (
          <span key={`${Item.kind}-${Item.id ?? "all"}`} className="pr-lv-crumb">
            {Index ? <ChevronsRight size={14} className="pr-lv-crumb-sep" aria-hidden="true" /> : null}
            {Last ? (
              <span aria-current="page" className="pr-lv-crumb-here">{Index === 0 ? <Home size={14} aria-hidden="true" /> : null}{Item.label}</span>
            ) : (
              <button type="button" className="pr-lv-crumb-link" onClick={() => OnCrumb(Item.kind)}>{Index === 0 ? <Home size={14} aria-hidden="true" /> : null}{Item.label}</button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

type ContentKey = "name" | "students" | "cleared" | "firstTry" | "tries" | "accuracy" | "time" | "backlog";

export function LearningContentTable({ Data, OnOpen }: { Data: LearningRollup; OnOpen: (Row: LearningContentRow) => void }) {
  const Rows = Data.rows as LearningContentRow[];
  const Benchmark = Data.rules.benchmark;
  const Heading = KIND_HEADING[Data.level || "module"] || "Scope";
  const { Sorted, Header } = useSorted<LearningContentRow, ContentKey>(Rows, null, (Row, Key) => {
    switch (Key) {
      case "name": return Row.kind === "lesson" || Row.kind === "dps" ? Number((Row.code || "").replace(/\D+/g, "")) : Row.code || "";
      case "students": return Row.students;
      case "cleared": return Row.dpsCovered ? Row.dpsCleared / Row.dpsCovered : null;
      case "firstTry": return Row.firstTryClearRate;
      case "tries": return Row.averageTriesToClear;
      case "accuracy": return Row.averageAccuracy;
      case "time": return Row.medianTimeSeconds;
      default: return Row.dpsNeedsReattempt;
    }
  });
  return (
    <div className="pr-lv">
      <div className="math-table pr-lv-table pr-lv-content">
        <table className="ad-cards">
          <colgroup>
            <col className="pr-lv-col-name" />
            <col /><col className="pr-lv-col-cleared" /><col /><col /><col /><col /><col />
            <col className="pr-lv-col-open" />
          </colgroup>
          <thead>
            <tr>
              <th>{Header("name", Heading, "left")}</th>
              <th className="pr-center">{Header("students", "Students")}</th>
              <th className="pr-center">{Header("cleared", "DPS Cleared")}</th>
              <th className="pr-center">{Header("firstTry", "First-Try Clear")}</th>
              <th className="pr-center">{Header("tries", "Average Tries")}</th>
              <th className="pr-center">{Header("accuracy", "Average Accuracy")}</th>
              <th className="pr-center">{Header("time", "Median Time")}</th>
              <th className="pr-center">{Header("backlog", "Needs Re‑Attempt")}</th>
              <th className="pr-center"><span className="math-table-header-label">Open</span></th>
            </tr>
          </thead>
          <tbody>
            {Sorted.map((Row) => (
              <tr key={Row.id} data-flag={Row.flag || undefined}>
                <td className="ad-card-title" data-label={Heading}>
                  <p className="pr-name">{Row.code || "—"}</p>
                  <p className="pr-sub">{Row.name || "—"}</p>
                  <Flag Row={Row} Benchmark={Benchmark} />
                </td>
                <td className="pr-center" data-label="Students">{Count(Row.students)}</td>
                <td className="pr-center" data-label="DPS Cleared"><Cleared Row={Row} /></td>
                <td className="pr-center" data-label="First-Try Clear">{Percent(Row.firstTryClearRate)}</td>
                <td className="pr-center" data-label="Average Tries">{Row.averageTriesToClear === null ? "—" : Row.averageTriesToClear.toFixed(1)}</td>
                <td className="pr-center" data-label="Average Accuracy"><Accuracy Value={Row.averageAccuracy} Benchmark={Benchmark} /></td>
                <td className="pr-center" data-label="Median Time">{Duration(Row.medianTimeSeconds)}</td>
                <td className="pr-center" data-label="Needs Re-Attempt"><Backlog Value={Row.dpsNeedsReattempt} /></td>
                <td className="pr-center ad-card-wide" data-label="Open">
                  <button type="button" className="math-role-action-button math-history-review-button" onClick={() => OnOpen(Row)} aria-label={`Open ${Row.code || Heading}`}>
                    <span>{Row.kind === "dps" ? "Students" : "Open"}</span>
                    <ArrowRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pr-lv-note">{`Each DPS practised in the period counts once per student, by where it stands now. First-try clear and average tries look at every try, also before the period. Marked rows: ${Data.rules.flagMinAttempts}+ attempts and average accuracy below ${Benchmark}%, or fewer than ${Data.rules.flagFirstTry}% cleared on the first try.`}</p>
    </div>
  );
}

type DpsStudentKey = "student" | "status" | "tries" | "best" | "when";
const BUCKET_ORDER: Record<string, number> = { NEEDS_REATTEMPT: 0, PENDING: 1, CLEARED: 2 };

function TrackerHref(Row: LearningDpsStudentRow) {
  const Params = new URLSearchParams({ tab: "lesson-insights", dpsId: Row.dpsId });
  if (Row.assignmentId) Params.set("assignmentId", Row.assignmentId);
  if (Row.attemptId) Params.set("attemptId", Row.attemptId);
  return `/admin/assignments/student/${encodeURIComponent(Row.studentCode || "")}?${Params.toString()}`;
}

export function LearningDpsStudentsTable({ Data }: { Data: LearningRollup }) {
  const Rows = Data.rows as LearningDpsStudentRow[];
  const { Sorted, Header } = useSorted<LearningDpsStudentRow, DpsStudentKey>(Rows, null, (Row, Key) => {
    switch (Key) {
      case "student": return (Row.studentName || "").toLowerCase();
      case "status": return (Row.awaitingApproval ? -1 : BUCKET_ORDER[Row.bucket] ?? 1);
      case "tries": return Row.tries;
      case "best": return Row.bestAccuracy;
      default: return Row.lastActive;
    }
  });
  const { Shown, Footer } = usePaged(Sorted);
  return (
    <div className="pr-lv">
      <div className="math-table pr-lv-table pr-lv-students-on-dps">
        <table className="ad-cards">
          <colgroup>
            <col className="pr-lv-col-name" /><col /><col className="pr-lv-col-status" /><col /><col /><col /><col className="pr-lv-col-open" />
          </colgroup>
          <thead>
            <tr>
              <th>{Header("student", "Student", "left")}</th>
              <th><span className="math-table-header-label">Teacher</span></th>
              <th className="pr-center">{Header("status", "Status")}</th>
              <th className="pr-center">{Header("tries", "Tries")}</th>
              <th className="pr-center">{Header("best", "Best Accuracy")}</th>
              <th className="pr-center">{Header("when", "Last Active")}</th>
              <th className="pr-center"><span className="math-table-header-label">Tracker</span></th>
            </tr>
          </thead>
          <tbody>
            {Shown.map((Row) => (
              <tr key={Row.studentId}>
                <td className="ad-card-title" data-label="Student">
                  <p className="pr-name">{Row.studentName || "—"}</p>
                  <p className="pr-code">{Row.studentCode || "—"}</p>
                </td>
                <td data-label="Teacher"><p className="pr-name">{Row.teacherName || "Not Assigned"}</p></td>
                <td className="pr-center" data-label="Status"><StatePill tone={(Row.statusTone as ChainTone) || "slate"}>{Row.statusLabel}</StatePill></td>
                <td className="pr-center" data-label="Tries">{Row.triesText}</td>
                <td className="pr-center" data-label="Best Accuracy"><Accuracy Value={Row.bestAccuracy} Benchmark={Data.rules.benchmark} /></td>
                <td className="pr-center" data-label="Last Active">{When(Row.lastActive)}</td>
                <td className="pr-center ad-card-wide" data-label="Tracker">
                  <Link href={TrackerHref(Row)} className="math-role-action-button math-history-review-button">
                    <span>{Row.awaitingApproval ? "Review" : "Open"}</span>
                    <ArrowRight size={14} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Footer("Students")}
    </div>
  );
}

type StudentKey = "student" | "level" | "cleared" | "firstTry" | "accuracy" | "time" | "backlog" | "when";

export function LearningStudentsTable({ Data, OnOpen }: { Data: LearningRollup; OnOpen: (Row: LearningStudentRow) => void }) {
  const Rows = Data.rows as LearningStudentRow[];
  const Benchmark = Data.rules.benchmark;
  const { Sorted, Header } = useSorted<LearningStudentRow, StudentKey>(Rows, null, (Row, Key) => {
    switch (Key) {
      case "student": return (Row.studentName || "").toLowerCase();
      case "level": return Row.currentLevelCode || null;
      case "cleared": return Row.dpsCleared;
      case "firstTry": return Row.firstTryClearRate;
      case "accuracy": return Row.averageAccuracy;
      case "time": return Row.practiceSeconds;
      case "backlog": return Row.dpsNeedsReattempt;
      default: return Row.lastActive;
    }
  });
  const { Shown, Footer } = usePaged(Sorted);
  return (
    <div className="pr-lv">
      <div className="math-table pr-lv-table pr-lv-students">
        <table className="ad-cards">
          <colgroup>
            <col className="pr-lv-col-name" /><col /><col className="pr-lv-col-cleared" /><col /><col /><col /><col /><col /><col className="pr-lv-col-open" />
          </colgroup>
          <thead>
            <tr>
              <th>{Header("student", "Student", "left")}</th>
              <th className="pr-center">{Header("level", "Current Level")}</th>
              <th className="pr-center">{Header("cleared", "DPS Cleared")}</th>
              <th className="pr-center">{Header("firstTry", "First-Try Clear")}</th>
              <th className="pr-center">{Header("accuracy", "Average Accuracy")}</th>
              <th className="pr-center">{Header("time", "Practice Time")}</th>
              <th className="pr-center">{Header("backlog", "Needs Re‑Attempt")}</th>
              <th className="pr-center">{Header("when", "Last Active")}</th>
              <th className="pr-center"><span className="math-table-header-label">History</span></th>
            </tr>
          </thead>
          <tbody>
            {Shown.map((Row) => (
              <tr key={Row.studentId} data-flag={Row.flag || undefined}>
                <td className="ad-card-title" data-label="Student">
                  <p className="pr-name">{Row.studentName || "—"}</p>
                  <p className="pr-code">{[Row.studentCode, Row.teacherName].filter(Boolean).join(" · ") || "—"}</p>
                  <Flag Row={Row} Benchmark={Benchmark} />
                </td>
                <td className="pr-center" data-label="Current Level">{Row.currentLevelCode || "—"}</td>
                <td className="pr-center" data-label="DPS Cleared"><Cleared Row={Row} /></td>
                <td className="pr-center" data-label="First-Try Clear">{Percent(Row.firstTryClearRate)}</td>
                <td className="pr-center" data-label="Average Accuracy"><Accuracy Value={Row.averageAccuracy} Benchmark={Benchmark} /></td>
                <td className="pr-center" data-label="Practice Time">{Duration(Row.practiceSeconds)}</td>
                <td className="pr-center" data-label="Needs Re-Attempt"><Backlog Value={Row.dpsNeedsReattempt} /></td>
                <td className="pr-center" data-label="Last Active">{When(Row.lastActive)}</td>
                <td className="pr-center ad-card-wide" data-label="History">
                  <button type="button" className="math-role-action-button math-history-review-button" onClick={() => OnOpen(Row)} aria-label={`Open ${Row.studentName || "the student"}'s history`}>
                    <span>Open</span>
                    <ArrowRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Footer("Students")}
    </div>
  );
}

type TeacherKey = "teacher" | "students" | "cleared" | "firstTry" | "accuracy" | "backlog" | "approvals" | "ready";

export function LearningTeachersTable({ Data, OnOpen }: { Data: LearningRollup; OnOpen: (Row: LearningTeacherRow) => void }) {
  const Rows = Data.rows as LearningTeacherRow[];
  const Benchmark = Data.rules.benchmark;
  const { Sorted, Header } = useSorted<LearningTeacherRow, TeacherKey>(Rows, null, (Row, Key) => {
    switch (Key) {
      case "teacher": return (Row.teacherName || "").toLowerCase();
      case "students": return Row.roster;
      case "cleared": return Row.dpsCleared;
      case "firstTry": return Row.firstTryClearRate;
      case "accuracy": return Row.averageAccuracy;
      case "backlog": return Row.dpsNeedsReattempt;
      case "approvals": return Row.approvalsWaiting;
      default: return Row.readyToPromote;
    }
  });
  return (
    <div className="pr-lv">
      <div className="math-table pr-lv-table pr-lv-teachers">
        <table className="ad-cards">
          <colgroup>
            <col className="pr-lv-col-name" /><col className="pr-lv-col-roster" /><col className="pr-lv-col-cleared" /><col /><col /><col /><col /><col /><col className="pr-lv-col-open" />
          </colgroup>
          <thead>
            <tr>
              <th>{Header("teacher", "Teacher", "left")}</th>
              <th className="pr-center">{Header("students", "Students")}</th>
              <th className="pr-center">{Header("cleared", "DPS Cleared")}</th>
              <th className="pr-center">{Header("firstTry", "First-Try Clear")}</th>
              <th className="pr-center">{Header("accuracy", "Average Accuracy")}</th>
              <th className="pr-center">{Header("backlog", "Needs Re‑Attempt")}</th>
              <th className="pr-center">{Header("approvals", "Approvals Waiting")}</th>
              <th className="pr-center">{Header("ready", "Ready To Promote")}</th>
              <th className="pr-center"><span className="math-table-header-label">Drill-Down</span></th>
            </tr>
          </thead>
          <tbody>
            {Sorted.map((Row) => (
              <tr key={Row.teacherId || "none"} data-flag={Row.flag || undefined}>
                <td className="ad-card-title" data-label="Teacher">
                  <p className="pr-name">{Row.teacherName || "Not Assigned"}</p>
                  <p className="pr-code">{Row.teacherCode || "—"}</p>
                  <Flag Row={Row} Benchmark={Benchmark} />
                </td>
                <td className="pr-center" data-label="Students">
                  <p className="pr-name">{Count(Row.roster)}</p>
                  <p className="pr-sub">{`${Count(Row.activeLast7Days)} active this week`}</p>
                </td>
                <td className="pr-center" data-label="DPS Cleared"><Cleared Row={Row} /></td>
                <td className="pr-center" data-label="First-Try Clear">{Percent(Row.firstTryClearRate)}</td>
                <td className="pr-center" data-label="Average Accuracy"><Accuracy Value={Row.averageAccuracy} Benchmark={Benchmark} /></td>
                <td className="pr-center" data-label="Needs Re-Attempt"><Backlog Value={Row.dpsNeedsReattempt} /></td>
                <td className="pr-center" data-label="Approvals Waiting">{Row.approvalsWaiting ? <StatePill tone="red">{Count(Row.approvalsWaiting)}</StatePill> : <span className="pr-muted">0</span>}</td>
                <td className="pr-center" data-label="Ready To Promote">{Row.readyToPromote ? <StatePill tone="purple">{Count(Row.readyToPromote)}</StatePill> : <span className="pr-muted">0</span>}</td>
                <td className="pr-center ad-card-wide" data-label="Drill-Down">
                  {Row.teacherId ? (
                    <button type="button" className="math-role-action-button math-history-review-button" onClick={() => OnOpen(Row)} aria-label={`Open ${Row.teacherName || "the teacher"}'s students in the drill-down`}>
                      <span>Open</span>
                      <ArrowRight size={14} />
                    </button>
                  ) : <span className="pr-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pr-lv-note">Students are each teacher&apos;s active students; active this week means practice submitted in the last 7 days. Approvals waiting and ready to promote are as they stand now.</p>
    </div>
  );
}
