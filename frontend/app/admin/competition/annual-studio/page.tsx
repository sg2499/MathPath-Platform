"use client";

import { AppShell } from "@/components/common/AppShell";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  ANNUAL_COMPETITION_LEVEL_CODES,
  FormatCompetitionLevelLabel,
  FormatMasterCurrentLevelSuffix,
  PRACTICE_BATCH_QUANTITY_OPTIONS,
  PRACTICE_BULK_MAX_STUDENTS_PER_CALL,
  PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL,
  batchAssignAnnualCompetitionPracticePapers,
  createAnnualCompetitionEvent,
  deleteAllAnnualCompetitionPracticeRecordsForStudent,
  deleteAnnualCompetitionEvent,
  deleteAnnualCompetitionPracticeAttempt,
  getAdminTeachers,
  getAnnualCompetitionPracticeReportForLevel,
  getAnnualCompetitionPracticeReportForStudent,
  getAnnualCompetitionPracticeReportOverview,
  listAnnualCompetitionEvents,
  listAnnualCompetitionPracticeResults,
  listStudentsForAnnualCompetitionPracticeBank,
  recomputeAllAnnualCompetitionOfficialResults,
  recomputeAnnualCompetitionPracticeResults,
  updateAnnualCompetitionEvent,
  type AnnualCompetitionEvent,
  type AnnualCompetitionPracticeBatchAssignFailedRow,
  type AnnualCompetitionPracticeReportForLevel,
  type AnnualCompetitionPracticeReportForStudent,
  type AnnualCompetitionPracticeReportOverview,
  type AnnualCompetitionPracticeReportSectionRow,
  type AnnualCompetitionPracticeRosterStudent,
} from "@/lib/api/admin";
import type { AdminTeacher } from "@/types/teacher";
import { GroupPracticePapersByLevel } from "@/lib/annualCompetitionPracticeGrouping";
import { PracticeLeaderboardPodium } from "@/components/common/PracticeLeaderboardPodium";
import {
  LEVEL_CHART_OPTIONS,
  LevelChartPanel,
  OVERVIEW_CHART_OPTIONS,
  OverviewChartPanel,
  STUDENT_CHART_OPTIONS,
  StudentChartPanel,
} from "@/components/common/AnnualCompetitionAnalyticsCharts";
import type {
  LevelChartKey,
  OverviewChartKey,
  StudentChartKey,
} from "@/components/common/AnnualCompetitionAnalyticsCharts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Flame,
  Medal,
  Pencil,
  PlusCircle,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { Suspense, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

function SectionTitle({ kicker, title, description, icon }: { kicker: string; title: string; description: string; icon?: ReactNode }) {
  return (
    <div>
      <p className="math-block-header">{icon}{kicker}</p>
      <h2 className="text-xl font-black text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{description}</p>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const StatusValue = String(status || "DRAFT").toUpperCase();
  const ChipClass =
    StatusValue === "COMPLETED"
      ? "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
      : StatusValue === "DRAFT"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        : StatusValue === "LIVE"
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${ChipClass}`}>{StatusValue}</span>;
}

function FormatEventDate(Value: string | null) {
  if (!Value) return "Not set";
  try {
    return new Date(Value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return Value;
  }
}

function FormatSecondsAsMinSec(Value: number | null): string {
  if (Value == null) return "-";
  const Total = Math.max(0, Math.round(Value));
  const Minutes = Math.floor(Total / 60);
  const Seconds = Total % 60;
  return `${Minutes}:${String(Seconds).padStart(2, "0")}`;
}

// Mirrors the identically-named helper on the per-event detail page
// ([eventId]/page.tsx) -- converts an ISO string into the value a
// datetime-local input expects, so the edit form can be pre-filled with
// the event's current dates.
function ToLocalInputValue(IsoValue: string | null): string {
  if (!IsoValue) return "";
  const D = new Date(IsoValue);
  if (Number.isNaN(D.getTime())) return "";
  const Pad = (N: number) => String(N).padStart(2, "0");
  return `${D.getFullYear()}-${Pad(D.getMonth() + 1)}-${Pad(D.getDate())}T${Pad(D.getHours())}:${Pad(D.getMinutes())}`;
}

// Practice Reports feature, package 3 (Shailesh, 2026-09-16): small display
// helpers + presentational components shared by the Student and Level
// report views below. Kept separate from SectionTitle/StatusChip above
// since these are specific to the Reports sub-tab.

function FormatPercent(Value: number | null): string {
  // Backend already rounds every figure in this flow to a whole number
  // (Shailesh, 2026-09-16 decimal policy) -- Math.round here is a defensive
  // second layer, never the source of truth, so a value never renders as
  // e.g. 16.33% even if some future call site forgets to round upstream.
  return Value == null ? "-" : `${Math.round(Value)}%`;
}

function FormatCount(Value: number | null): string {
  return Value == null ? "-" : String(Value);
}

function StatCard({ Label, Value }: { Label: string; Value: string }) {
  return (
    <div className="rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-3 shadow-sm dark:bg-slate-950/40">
      <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{Label}</p>
      <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{Value}</p>
    </div>
  );
}

// The per-section breakdown table -- shared by the Level report and both
// the Student report's Overall Analytics ("All Levels" byLevel table
// instead, see below) and its dedicated Section Wise Analytics tab, since
// all of these are the same shape (AnnualCompetitionPracticeReportSectionRow[]),
// just aggregated over a different set of attempts server-side.
//
// 2026-09-16 (Shailesh, Practice Reports UI redesign): "you had mentioned
// about the toughest section or something like but i do not see that
// anywhere" -- this was promised in an earlier package's own description
// text but never actually computed or surfaced. Real now: the section with
// the lowest avg accuracy (among sections that actually have attempts --
// never flag a section nobody has touched yet) gets a highlighted row +
// badge. Requires at least 2 sections with real data, otherwise "toughest"
// is meaningless (nothing to compare against).
function SectionBreakdownTable({ Rows }: { Rows: AnnualCompetitionPracticeReportSectionRow[] }) {
  const RowsWithData = Rows.filter((Row) => Row.avgAccuracyPercentage != null && Row.attemptsCount > 0);
  const ToughestSectionNumber =
    RowsWithData.length > 1
      ? RowsWithData.reduce((Toughest, Row) =>
          (Row.avgAccuracyPercentage as number) < (Toughest.avgAccuracyPercentage as number) ? Row : Toughest
        ).sectionNumber
      : null;

  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
      <div className="grid grid-cols-[0.9fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
        <span>Section</span>
        <span>Avg Accuracy</span>
        <span>Avg Score</span>
        <span>Avg Attempted</span>
        <span>Avg Time Taken</span>
        <span>Time Limit</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/10">
        {Rows.map((Row) => {
          const IsToughest = Row.sectionNumber === ToughestSectionNumber;
          return (
            <div
              key={Row.sectionNumber}
              className={`grid grid-cols-[0.9fr_1fr_1fr_1fr_1fr_1fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100 ${
                IsToughest ? "bg-rose-50/70 dark:bg-rose-950/20" : ""
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-black text-slate-950 dark:text-white">
                <span>
                  Section {Row.sectionNumber}
                  {Row.sectionTitle ? `: ${Row.sectionTitle}` : ""}
                </span>
                {IsToughest ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                    <Flame size={10} /> Toughest
                  </span>
                ) : null}
              </div>
              <div>{FormatPercent(Row.avgAccuracyPercentage)}</div>
              <div>{Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}</div>
              <div>{Row.avgAttemptedCount == null ? "-" : `${Row.avgAttemptedCount}/${Row.avgTotalQuestions ?? "-"}`}</div>
              <div>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)}</div>
              <div>{Row.timeLimitSeconds == null ? "-" : FormatSecondsAsMinSec(Row.timeLimitSeconds)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// The per-student Practice Report view, split into two dedicated tabs
// inside the student analytics modal (2026-09-16, Shailesh -- "have 2 sub
// tabs in that window one would be the overall stats and the other would
// be section wise stats"): Overall Analytics (this component) keeps the
// original blended-"All Levels"-vs-one-level behavior including the trend
// history and cohort comparison, but no longer renders the section table
// -- that's StudentSectionWiseAnalyticsView's job below, exclusively, so
// the same data is never shown twice across the two tabs.
function StudentOverallAnalyticsView({ Report }: { Report: AnnualCompetitionPracticeReportForStudent }) {
  const Summary = Report.summary;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard Label="Attempts" Value={FormatCount(Summary.attemptsCount)} />
        <StatCard Label="Papers Assigned" Value={FormatCount(Summary.papersAssignedCount)} />
        <StatCard Label="Papers Completed" Value={FormatCount(Summary.papersCompletedCount)} />
        <StatCard Label="Avg Score" Value={Summary.avgScore == null ? "-" : `${Summary.avgScore}/${Summary.avgMaxScore ?? "-"}`} />
        <StatCard Label="Avg Accuracy" Value={FormatPercent(Summary.avgAccuracyPercentage)} />
        <StatCard Label="Avg Time Taken" Value={FormatSecondsAsMinSec(Summary.avgTimeTakenSeconds)} />
      </div>

      {Report.competitionLevelCode ? (
        <>
          {Report.levelComparison ? (
            <div className="rounded-2xl border border-[color:var(--mp-role-border)] bg-slate-50/60 p-4 text-sm font-bold text-slate-700 dark:bg-white/5 dark:text-slate-200">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[color:var(--mp-role-primary)]">
                Vs. Level Cohort ({Report.levelComparison.cohortStudentsCount} student
                {Report.levelComparison.cohortStudentsCount === 1 ? "" : "s"}, {Report.levelComparison.cohortAttemptsCount} attempt
                {Report.levelComparison.cohortAttemptsCount === 1 ? "" : "s"})
              </p>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                <span>Cohort Avg Accuracy: {FormatPercent(Report.levelComparison.cohortAvgAccuracyPercentage)}</span>
                <span>
                  Cohort Avg Score: {Report.levelComparison.cohortAvgScore ?? "-"}/{Report.levelComparison.cohortAvgMaxScore ?? "-"}
                </span>
                <span>Cohort Avg Time: {FormatSecondsAsMinSec(Report.levelComparison.cohortAvgTimeTakenSeconds)}</span>
              </div>
            </div>
          ) : null}

          {Report.trend.length > 0 ? (
            <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
              <div className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                <span>Attempt Date</span>
                <span>Accuracy</span>
                <span>Score</span>
                <span>Time Taken</span>
                <span>Action</span>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-white/10">
                {Report.trend.map((Row) => (
                  <div
                    key={Row.attemptId}
                    className="grid grid-cols-[1fr_0.8fr_0.8fr_0.9fr_0.9fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
                  >
                    <div>{FormatEventDate(Row.computedAt)}</div>
                    <div>{Row.accuracyPercentage}%</div>
                    <div>{Row.score}/{Row.maxScore}</div>
                    <div>{FormatSecondsAsMinSec(Row.timeTakenSeconds)}</div>
                    <div>
                      <Link
                        href={`/admin/competition/annual-result/${Row.attemptId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                      >
                        <ClipboardList size={12} /> View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : Report.byLevel.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
          <div className="grid grid-cols-[1fr_0.7fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
            <span>Level</span>
            <span>Attempts</span>
            <span>Avg Accuracy</span>
            <span>Avg Score</span>
            <span>Avg Time</span>
            <span>Completed</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {Report.byLevel.map((Row) => (
              <div
                key={Row.competitionLevelCode}
                className="grid grid-cols-[1fr_0.7fr_0.8fr_0.8fr_0.9fr_0.9fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                <div className="font-black text-slate-950 dark:text-white">{FormatCompetitionLevelLabel(Row.competitionLevelCode)}</div>
                <div>{Row.attemptsCount}</div>
                <div>{FormatPercent(Row.avgAccuracyPercentage)}</div>
                <div>{Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}</div>
                <div>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)}</div>
                <div>{Row.papersCompletedCount}/{Row.papersAssignedCount}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="No practice activity yet" description="This student hasn't completed any practice papers yet." />
      )}
    </div>
  );
}

// Section Wise Analytics tab (new, 2026-09-16): always level-scoped (no
// "All Levels" mode -- section identity/count differs per level's paper,
// so blending across levels would be meaningless), hence Report here is
// always fetched with a specific competitionLevelCode. A compact,
// level-scoped stat strip for context, then the shared section table
// (with the Toughest Section highlight) exclusively -- the trend/cohort
// detail lives in Overall Analytics instead, not duplicated here.
function StudentSectionWiseAnalyticsView({ Report }: { Report: AnnualCompetitionPracticeReportForStudent }) {
  const Summary = Report.summary;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard Label="Attempts" Value={FormatCount(Summary.attemptsCount)} />
        <StatCard Label="Avg Score" Value={Summary.avgScore == null ? "-" : `${Summary.avgScore}/${Summary.avgMaxScore ?? "-"}`} />
        <StatCard Label="Avg Accuracy" Value={FormatPercent(Summary.avgAccuracyPercentage)} />
        <StatCard Label="Avg Time Taken" Value={FormatSecondsAsMinSec(Summary.avgTimeTakenSeconds)} />
      </div>

      {Report.perSection.length > 0 ? (
        <SectionBreakdownTable Rows={Report.perSection} />
      ) : (
        <EmptyState title="No section data yet" description="This student hasn't completed a practice paper at this level yet." />
      )}
    </div>
  );
}

// Default level for Section Wise Analytics (2026-09-16, Shailesh: "by
// default the level student is solving papers for should be selected") --
// the competition level of whichever practice paper was assigned to this
// student MOST RECENTLY. Row.papers is already ordered ascending by
// assignment order (see AnnualCompetitionPracticeRosterPaper's own comment
// in lib/api/admin.ts), so the last entry is the most recent one -- zero
// extra fetch, reuses data the block grid already has in hand.
function DefaultSectionLevelForRow(Row: AnnualCompetitionPracticeRosterStudent): string {
  if (Row.papers.length === 0) return ANNUAL_COMPETITION_LEVEL_CODES[0];
  return Row.papers[Row.papers.length - 1].competitionLevelCode;
}

const StudentModalTabList = ["OVERALL", "SECTION"] as const;
type StudentModalTabKey = (typeof StudentModalTabList)[number];

// The student analytics modal (2026-09-16, Shailesh -- "we need to have a
// seperate window popping up when a student is clicked upon ... rather
// than the chaotic feel that we see right now"). A large (~90vh), dimmed-
// backdrop panel rather than a small cramped dialog, per Shailesh's own
// "top notch, neat and clean" ask -- closes via the X button, a backdrop
// click, or Esc. Owns its own tab/level state and its own report fetch
// entirely -- the parent only ever hands it which student to show.
function StudentAnalyticsModal({
  Row,
  OnClose,
}: {
  Row: AnnualCompetitionPracticeRosterStudent;
  OnClose: () => void;
}) {
  const [ActiveTab, SetActiveTab] = useState<StudentModalTabKey>("OVERALL");
  // "All Levels" stays valid for Overall Analytics (2026-09-16 clarification
  // this whole feature was built on -- a returning student isn't in the
  // same level every year). Section Wise Analytics never offers it -- see
  // StudentSectionWiseAnalyticsView's own comment for why -- so it's seeded
  // straight from DefaultSectionLevelForRow and never "ALL".
  const [OverallLevel, SetOverallLevel] = useState<string>("ALL");
  const [SectionLevel, SetSectionLevel] = useState<string>(() => DefaultSectionLevelForRow(Row));

  useEffect(() => {
    const OnKeyDown = (KeyEvent: KeyboardEvent) => {
      if (KeyEvent.key === "Escape") OnClose();
    };
    window.addEventListener("keydown", OnKeyDown);
    return () => window.removeEventListener("keydown", OnKeyDown);
  }, [OnClose]);

  const ActiveLevelParam = ActiveTab === "SECTION" ? SectionLevel : OverallLevel === "ALL" ? undefined : OverallLevel;

  const ReportQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-report-student-modal", Row.studentId, ActiveLevelParam ?? "ALL"],
    queryFn: () => getAnnualCompetitionPracticeReportForStudent(Row.studentId, ActiveLevelParam),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Student practice analytics">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={OnClose} />
      <div className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-[color:var(--mp-role-border)] bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-center justify-between gap-4 border-b border-[color:var(--mp-role-border)] px-6 py-4">
          <div className="min-w-0">
            <p className="truncate text-lg font-black text-slate-950 dark:text-white">
              {Row.studentName || Row.studentCode || Row.studentId}
            </p>
            {Row.studentCode ? (
              <p className="text-xs font-black uppercase tracking-[0.1em] text-[color:var(--mp-role-primary)]">{Row.studentCode}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={OnClose}
            aria-label="Close"
            className="rounded-full border border-[color:var(--mp-role-border)] bg-white p-2 text-slate-500 transition hover:bg-slate-50 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:bg-white/5"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-2 border-b border-[color:var(--mp-role-border)] px-6 pt-3">
          {StudentModalTabList.map((TabKey) => (
            <button
              key={TabKey}
              type="button"
              onClick={() => SetActiveTab(TabKey)}
              aria-selected={ActiveTab === TabKey}
              className={`rounded-t-xl px-4 py-2.5 text-sm font-black transition ${
                ActiveTab === TabKey
                  ? "border-x border-t border-[color:var(--mp-role-border)] border-b-2 border-b-[color:var(--mp-role-primary)] bg-white text-[color:var(--mp-role-primary)] dark:bg-slate-950"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {TabKey === "OVERALL" ? "Overall Analytics" : "Section Wise Analytics"}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
            {ActiveTab === "OVERALL" ? (
              <select
                aria-label="Filter Overall Analytics by level"
                value={OverallLevel}
                onChange={(EventValue) => SetOverallLevel(EventValue.target.value)}
                className="math-input w-auto min-w-[170px]"
              >
                <option value="ALL">All Levels</option>
                {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                  <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                ))}
              </select>
            ) : (
              <select
                aria-label="Select level for Section Wise Analytics"
                value={SectionLevel}
                onChange={(EventValue) => SetSectionLevel(EventValue.target.value)}
                className="math-input w-auto min-w-[170px]"
              >
                {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                  <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                ))}
              </select>
            )}
          </div>

          {ReportQuery.isLoading ? (
            <LoadingState label="Loading student report..." />
          ) : ReportQuery.isError ? (
            <ErrorState message={apiErrorMessage(ReportQuery.error)} />
          ) : ReportQuery.data ? (
            ActiveTab === "OVERALL" ? (
              <StudentOverallAnalyticsView Report={ReportQuery.data} />
            ) : (
              <StudentSectionWiseAnalyticsView Report={ReportQuery.data} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

// The per-level (cohort) Practice Report view, split into two dedicated
// sub-tabs (2026-09-17, Shailesh -- "we need to have 2 sub tabs , one would
// be Section Wise Analytics ... second sub tab would be Student Wise
// Analytics ... right now both of them are shown in one tab which makes it
// look very clumsy and chaotic"): each tab keeps its own copy of the
// summary stat-card row at top (Shailesh's own words: "would show the card
// metrics and the ... table"), mirroring the same pattern the student
// analytics modal's Overall/Section tabs already use. The level filter
// itself lives one level up, outside both tabs (see LevelReportSubTabList's
// render site), so switching it re-scopes whichever tab is active.
function LevelSectionWiseAnalyticsView({ Report }: { Report: AnnualCompetitionPracticeReportForLevel }) {
  const Summary = Report.summary;
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard Label="Students" Value={FormatCount(Summary.studentsWithAttemptsCount)} />
        <StatCard Label="Attempts" Value={FormatCount(Summary.attemptsCount)} />
        <StatCard Label="Papers Assigned" Value={FormatCount(Summary.papersAssignedCount)} />
        <StatCard Label="Papers Completed" Value={FormatCount(Summary.papersCompletedCount)} />
        <StatCard Label="Avg Accuracy" Value={FormatPercent(Summary.avgAccuracyPercentage)} />
        <StatCard Label="Avg Time Taken" Value={FormatSecondsAsMinSec(Summary.avgTimeTakenSeconds)} />
      </div>

      {Report.perSection.length > 0 ? (
        <SectionBreakdownTable Rows={Report.perSection} />
      ) : (
        <EmptyState title="No section data yet" description="No student has completed a practice paper at this level yet." />
      )}
    </div>
  );
}

function LevelStudentWiseAnalyticsView({ Report }: { Report: AnnualCompetitionPracticeReportForLevel }) {
  const Summary = Report.summary;
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard Label="Students" Value={FormatCount(Summary.studentsWithAttemptsCount)} />
        <StatCard Label="Attempts" Value={FormatCount(Summary.attemptsCount)} />
        <StatCard Label="Papers Assigned" Value={FormatCount(Summary.papersAssignedCount)} />
        <StatCard Label="Papers Completed" Value={FormatCount(Summary.papersCompletedCount)} />
        <StatCard Label="Avg Accuracy" Value={FormatPercent(Summary.avgAccuracyPercentage)} />
        <StatCard Label="Avg Time Taken" Value={FormatSecondsAsMinSec(Summary.avgTimeTakenSeconds)} />
      </div>

      {Report.perStudent.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
          <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
            <span>Student</span>
            <span>Attempts</span>
            <span>Avg Accuracy</span>
            <span>Avg Score</span>
            <span>Avg Time</span>
            <span>Completed</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {Report.perStudent.map((Row) => (
              <div
                key={Row.studentId}
                className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.8fr_0.9fr_0.9fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                <div className="min-w-0">
                  <div className="truncate font-black text-slate-950 dark:text-white">{Row.studentName || Row.studentCode || Row.studentId}</div>
                  {Row.studentCode ? (
                    <div className="text-xs font-black uppercase tracking-[0.1em] text-[color:var(--mp-role-primary)]">{Row.studentCode}</div>
                  ) : null}
                </div>
                <div>{Row.attemptsCount}</div>
                <div>{FormatPercent(Row.avgAccuracyPercentage)}</div>
                <div>{Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}</div>
                <div>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)}</div>
                <div>{Row.papersCompletedCount}/{Row.papersAssignedCount}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState title="No practice activity yet" description="No student has completed a practice paper at this level yet." />
      )}
    </div>
  );
}

// 2026-09-12 (Shailesh, full event decoupling): "there are 2 sub tabs in
// the annual competition studio, one practice ... and the other sub tab
// for the official competition ... just like the student tab has 2 sub
// tabs exactly like that the admin should also see it." Official mirrors
// this page's own pre-existing content (create event + events list, each
// event drilling into its own slots/papers/assignments/monitoring/results);
// Practice is fully event-independent -- see PracticeSubTabList below.
const TopTabList = ["OFFICIAL", "PRACTICE"] as const;
type TopTabKey = (typeof TopTabList)[number];

// "the practice tab must have 2 sub tabs within, one for the practice bank
// with the list of all students where they can be assigned papers
// simultaneously and the second sub tab for the practice results."
// 2026-09-16 (Shailesh, Practice Reports feature): "Practice Bank -
// Practice Results - Practice Reports" -- a third sub-tab added here,
// containing its own two further sub-tabs (see PracticeReportsSubTabList
// below) for the per-student and per-level analytics.
// 2026-09-18 (Shailesh, Practice Leaderboard feature): a 4th sub-tab --
// "we need to have a 4th tab for admin ... which is gonna be leaderboard
// ... level wise leaderboards." Deliberately its own top-level sub-tab
// (sibling to Reports), not nested under Reports -- Shailesh's own words
// listed it as a 4th tab alongside the existing 3, not a 3rd Reports
// sub-tab like Analytics Visualization is.
const PracticeSubTabList = ["BANK", "RESULTS", "REPORTS", "LEADERBOARD"] as const;
type PracticeSubTabKey = (typeof PracticeSubTabList)[number];

const PracticeReportsSubTabList = ["STUDENT", "LEVEL", "VISUALIZATION"] as const;
type PracticeReportsSubTabKey = (typeof PracticeReportsSubTabList)[number];

// 2026-09-17 (Shailesh): Individual Level's own two further sub-tabs --
// see LevelSectionWiseAnalyticsView/LevelStudentWiseAnalyticsView above.
const LevelReportSubTabList = ["SECTION", "STUDENT"] as const;
type LevelReportSubTabKey = (typeof LevelReportSubTabList)[number];

export default function AdminAnnualCompetitionStudioPage() {
  return (
    <Suspense fallback={null}>
      <AdminAnnualCompetitionStudioPageContent />
    </Suspense>
  );
}

function AdminAnnualCompetitionStudioPageContent() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();
  // 2026-09-15 (Shailesh): "upon clicking the notification from the tray it
  // should redirect them ... the admin should see the pending papers in
  // their login under the practice results tab." Notifications land here as
  // /admin/competition/annual-studio?tab=PRACTICE&subTab=RESULTS&studentCode=
  // ...&levelCode=... (built client-side in NotificationsBell.tsx) -- read
  // once on mount to pre-select the right tabs/filter and, once the roster
  // has loaded, auto-expand the notified student's row.
  const SearchParams = useSearchParams();
  const DeepLinkTab = SearchParams.get("tab");
  const DeepLinkSubTab = SearchParams.get("subTab");
  const DeepLinkStudentCode = SearchParams.get("studentCode");
  const DeepLinkLevelCode = SearchParams.get("levelCode");

  const [TopTab, SetTopTab] = useState<TopTabKey>(DeepLinkTab === "PRACTICE" ? "PRACTICE" : "OFFICIAL");
  const [PracticeSubTab, SetPracticeSubTab] = useState<PracticeSubTabKey>(DeepLinkSubTab === "RESULTS" ? "RESULTS" : "BANK");

  // 2026-09-16 (Shailesh, 504 fix -- "bulletproof end to end"): this page
  // used to track a success message and per-mutation errors as separate,
  // independently-persisting pieces of state (a bare LastMessage string
  // plus each useMutation's own .error), which meant a success banner from
  // an earlier action could sit on screen forever, unrelated to and never
  // cleared by a LATER action's own failure -- exactly what produced the
  // confusing "assigned 25 papers to 1 student" success banner sitting
  // next to a fresh, unrelated 504 error in the live bug report this fixes.
  // Every action on this page (event create/update/delete, both recompute
  // buttons, practice bulk-assign, both practice-record deletes) now
  // reports through this ONE slot instead: cleared the instant a new action
  // starts (see each mutation's onMutate below) and always fully replaced
  // -- never merged -- by whichever action most recently finished, success
  // or failure. Deliberately separate from DataLoadError below, which is a
  // standing fact about page state (a query failed to load), not a
  // one-shot outcome of something the admin just clicked.
  const [LastActionResult, SetLastActionResult] = useState<{ Kind: "success" | "error"; Label: string; Text: string } | null>(null);
  const ReportActionSuccess = (Label: string, Text: string) => SetLastActionResult({ Kind: "success", Label, Text });
  const ReportActionError = (Label: string, Error: unknown) => SetLastActionResult({ Kind: "error", Label, Text: apiErrorMessage(Error) });
  const ClearActionResult = () => SetLastActionResult(null);

  // ---------------------------------------------------------------------
  // Official (unchanged from before the Official/Practice split -- create
  // event form + events list, each event drilling into its own detail page
  // for slots/papers/assignments/monitoring/results).
  // ---------------------------------------------------------------------

  const [EventName, SetEventName] = useState("");
  const [CompetitionDateInput, SetCompetitionDateInput] = useState("");
  const [ResultsReleaseInput, SetResultsReleaseInput] = useState("");

  const EventsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "events"],
    queryFn: listAnnualCompetitionEvents,
    enabled: Ready && TopTab === "OFFICIAL",
    placeholderData: keepPreviousData,
  });
  const Events = EventsQuery.data || [];

  const CreateMutation = useMutation({
    mutationFn: () =>
      createAnnualCompetitionEvent({
        name: EventName.trim(),
        competitionDate: new Date(CompetitionDateInput).toISOString(),
        resultsReleaseAt: ResultsReleaseInput ? new Date(ResultsReleaseInput).toISOString() : null,
      }),
    onMutate: ClearActionResult,
    onSuccess: (Created) => {
      ReportActionSuccess("Create Event", `"${Created.name}" created.`);
      SetEventName("");
      SetCompetitionDateInput("");
      SetResultsReleaseInput("");
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
    onError: (Error) => ReportActionError("Create Event", Error),
  });

  const CanCreate = EventName.trim().length > 0 && Boolean(CompetitionDateInput);

  // --- Event edit form state -- an event's own row switches into this
  // inline form when EditingEventId matches it; the Create form above is
  // untouched. Deliberately scoped to Name/Competition Date/Results Release
  // Date only (what Shailesh asked for -- "edit the dates and everything
  // else related to an event") and not Status: the per-event detail page
  // already has dedicated DRAFT/SCHEDULED/LIVE/COMPLETED buttons for that,
  // so duplicating a status control here would just be a second place for
  // it to go stale against.
  const [EditingEventId, SetEditingEventId] = useState<string | null>(null);
  const [EditEventName, SetEditEventName] = useState("");
  const [EditCompetitionDateInput, SetEditCompetitionDateInput] = useState("");
  const [EditResultsReleaseInput, SetEditResultsReleaseInput] = useState("");

  const StartEditingEvent = (EventItem: AnnualCompetitionEvent) => {
    SetEditingEventId(EventItem.eventId);
    SetEditEventName(EventItem.name);
    SetEditCompetitionDateInput(ToLocalInputValue(EventItem.competitionDate));
    SetEditResultsReleaseInput(ToLocalInputValue(EventItem.resultsReleaseAt));
  };

  const CancelEditingEvent = () => SetEditingEventId(null);

  const UpdateEventMutation = useMutation({
    mutationFn: (EventId: string) =>
      updateAnnualCompetitionEvent(EventId, {
        name: EditEventName.trim(),
        competitionDate: new Date(EditCompetitionDateInput).toISOString(),
        ...(EditResultsReleaseInput
          ? { resultsReleaseAt: new Date(EditResultsReleaseInput).toISOString() }
          : { clearResultsReleaseAt: true }),
      }),
    onMutate: ClearActionResult,
    onSuccess: (Updated) => {
      ReportActionSuccess("Update Event", `"${Updated.name}" updated.`);
      SetEditingEventId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
    // Also shown inline in the edit form itself (see UpdateEventMutation.isError
    // below) -- reporting it here too means the top banner reflects it as well,
    // consistent with every other action on this page.
    onError: (Error) => ReportActionError("Update Event", Error),
  });

  // Hard delete (CompetitionEvent has no isActive flag to soft-delete with,
  // unlike slots). 2026-09-10 (Shailesh): the backend used to reject this
  // once the event had a real attempt or a locked results-release date --
  // that guard has been removed on purpose, so this is now reachable even
  // for an event with attempts/released results/certificates, as an admin
  // escape hatch for unavoidable circumstances. Confirmed before deleting,
  // same as this page's other consequential actions, with copy that now
  // reflects how much more this button can actually do.
  const DeleteEventMutation = useMutation({
    mutationFn: (EventId: string) => deleteAnnualCompetitionEvent(EventId),
    onMutate: ClearActionResult,
    onSuccess: () => {
      ReportActionSuccess("Delete Event", "Event deleted.");
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
    onError: (Error) => ReportActionError("Delete Event", Error),
  });

  // ---------------------------------------------------------------------
  // Practice -- Bank (2026-09-12, bulk assignment): "let the admin just
  // assign papers to all the students and let them practice instead of
  // creating unnecessary events." Fully event-independent -- the roster
  // below is every active student, tagged with the level they're currently
  // eligible for, so the admin can select all, many, or a filtered subset
  // and assign in one action. A selection is chunked into sequential calls
  // client-side (this backend has no background job queue -- see
  // PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL's own comment in
  // lib/api/admin.ts) with progress shown below. 2026-09-16 (504 fix):
  // chunk size is bounded by total PAPER count (students x quantity), not
  // just student count -- see BulkAssignMutation.
  // ---------------------------------------------------------------------

  const [PracticeSearchText, SetPracticeSearchText] = useState("");
  const [PracticeModuleFilter, SetPracticeModuleFilter] = useState<string>("ALL");
  // 2026-09-14 (Shailesh): "implement the level filter as well in the
  // practice bank tab ... so that we can filter both modules and levels and
  // then assign papers to the students in those levels." Scoped to the
  // currently selected module (like a normal module -> level drill-down)
  // rather than every level across every module at once -- currentLevelCode
  // was already returned by the roster endpoint and shown as a table
  // column, just never filterable until now.
  const [PracticeLevelFilter, SetPracticeLevelFilter] = useState<string>("ALL");
  const [PracticeEligibleOnly, SetPracticeEligibleOnly] = useState(false);
  const [SelectedStudentIdsForPractice, SetSelectedStudentIdsForPractice] = useState<Set<string>>(new Set());
  const [PracticeAssignLevelCode, SetPracticeAssignLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  const [PracticeAssignQuantity, SetPracticeAssignQuantity] = useState<number>(PRACTICE_BATCH_QUANTITY_OPTIONS[0]);
  const [BulkAssignProgress, SetBulkAssignProgress] = useState<{ Done: number; Total: number } | null>(null);
  const [BulkAssignSummary, SetBulkAssignSummary] = useState<{
    StudentsSucceeded: number;
    StudentsFailed: number;
    TotalPapersAssigned: number;
    FailedRows: AnnualCompetitionPracticeBatchAssignFailedRow[];
  } | null>(null);

  const StudentsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-bank-students"],
    queryFn: listStudentsForAnnualCompetitionPracticeBank,
    // 2026-09-16 (Practice Reports feature): also enabled for REPORTS --
    // its Student view's student picker reuses this same roster rather than
    // issuing a second student-list call.
    enabled: Ready && TopTab === "PRACTICE" && (PracticeSubTab === "BANK" || PracticeSubTab === "REPORTS"),
  });
  const StudentRows = StudentsQuery.data?.students || [];

  const PracticeModuleOptions = Array.from(
    new Set(StudentRows.map((Row) => Row.currentModuleCode).filter((Value): Value is string => Boolean(Value)))
  ).sort();

  // 2026-09-14 (Shailesh): "implement the level filter as well in the
  // practice bank tab ... so that we can filter both modules and levels."
  // Scoped to the currently selected module (a normal module -> level
  // drill-down) rather than every level across every module at once.
  const PracticeLevelOptions = Array.from(
    new Set(
      StudentRows.filter((Row) => PracticeModuleFilter === "ALL" || Row.currentModuleCode === PracticeModuleFilter)
        .map((Row) => Row.currentLevelCode)
        .filter((Value): Value is string => Boolean(Value))
    )
  ).sort();

  const PracticeSearchLower = PracticeSearchText.trim().toLowerCase();
  const FilteredStudentRows = StudentRows.filter((Row) => {
    if (PracticeModuleFilter !== "ALL" && Row.currentModuleCode !== PracticeModuleFilter) return false;
    if (PracticeLevelFilter !== "ALL" && Row.currentLevelCode !== PracticeLevelFilter) return false;
    if (PracticeEligibleOnly && Row.eligibleCompetitionLevelCode !== PracticeAssignLevelCode) return false;
    if (PracticeSearchLower) {
      const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
      if (!Haystack.includes(PracticeSearchLower)) return false;
    }
    return true;
  });

  const AllFilteredStudentRowsSelected =
    FilteredStudentRows.length > 0 && FilteredStudentRows.every((Row) => SelectedStudentIdsForPractice.has(Row.studentId));
  const ToggleSelectAllFilteredStudentRows = () => {
    SetSelectedStudentIdsForPractice((Prev) => {
      const Next = new Set(Prev);
      if (AllFilteredStudentRowsSelected) {
        FilteredStudentRows.forEach((Row) => Next.delete(Row.studentId));
      } else {
        FilteredStudentRows.forEach((Row) => Next.add(Row.studentId));
      }
      return Next;
    });
  };
  const ToggleOneStudentRowSelected = (StudentId: string) => {
    SetSelectedStudentIdsForPractice((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(StudentId)) Next.delete(StudentId);
      else Next.add(StudentId);
      return Next;
    });
  };

  const InvalidatePracticeResults = () =>
    QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "practice-results"] });

  const BulkAssignMutation = useMutation({
    mutationFn: async () => {
      const StudentIds = Array.from(SelectedStudentIdsForPractice);
      // 2026-09-16 (Shailesh, 504 fix): the true unit of work for one call
      // is students x quantity (total papers), not student count alone --
      // see PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL's own comment in
      // lib/api/admin.ts. The chunk size must shrink as quantity grows, not
      // stay flat at PRACTICE_BULK_MAX_STUDENTS_PER_CALL regardless of what
      // quantity is selected (that flat cap is kept too, as a
      // defense-in-depth ceiling).
      const MaxStudentsByWorkload = Math.max(1, Math.floor(PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL / PracticeAssignQuantity));
      const ChunkSize = Math.min(PRACTICE_BULK_MAX_STUDENTS_PER_CALL, MaxStudentsByWorkload);
      const Chunks: string[][] = [];
      for (let Index = 0; Index < StudentIds.length; Index += ChunkSize) {
        Chunks.push(StudentIds.slice(Index, Index + ChunkSize));
      }
      SetBulkAssignProgress({ Done: 0, Total: Chunks.length });
      let StudentsSucceeded = 0;
      let StudentsFailed = 0;
      let TotalPapersAssigned = 0;
      const FailedRows: AnnualCompetitionPracticeBatchAssignFailedRow[] = [];
      let ChunkCallError: unknown = null;
      for (let Index = 0; Index < Chunks.length; Index++) {
        try {
          const Result = await batchAssignAnnualCompetitionPracticePapers({
            studentIds: Chunks[Index],
            competitionLevelCode: PracticeAssignLevelCode,
            quantity: PracticeAssignQuantity,
          });
          StudentsSucceeded += Result.studentsSucceeded;
          StudentsFailed += Result.studentsFailed;
          TotalPapersAssigned += Result.totalPapersAssigned;
          FailedRows.push(...Result.failed);
        } catch (Error) {
          // 2026-09-16 (Shailesh, 504 fix): a call-level failure (network
          // hiccup, an unlucky 504 despite the sizing above, etc.) must
          // never discard whatever EARLIER chunks in this same batch
          // already succeeded -- those papers are already durably
          // committed server-side, one commit per paper (see
          // _GeneratePracticePapersForOneStudent's own docstring). Stop
          // here, but still report every earlier chunk's real success
          // rather than throwing it all away.
          ChunkCallError = Error;
          Chunks[Index].forEach((StudentId) => {
            FailedRows.push({
              studentIdentifier: StudentId,
              reason: "This batch call did not complete -- unknown whether papers were generated for this student. Check their practice bank before reassigning.",
            });
          });
          StudentsFailed += Chunks[Index].length;
          break;
        }
        SetBulkAssignProgress({ Done: Index + 1, Total: Chunks.length });
      }
      return { StudentsSucceeded, StudentsFailed, TotalPapersAssigned, FailedRows, ChunkCallError };
    },
    onMutate: ClearActionResult,
    onSuccess: (Result) => {
      const BaseMessage =
        `Assigned ${PracticeAssignQuantity} practice paper${PracticeAssignQuantity === 1 ? "" : "s"} of ${FormatCompetitionLevelLabel(PracticeAssignLevelCode)} to ${Result.StudentsSucceeded} student${Result.StudentsSucceeded === 1 ? "" : "s"}` +
        (Result.StudentsFailed > 0 ? `, ${Result.StudentsFailed} failed.` : ".");
      if (Result.ChunkCallError) {
        ReportActionError(
          "Assign Practice Papers",
          new Error(
            `${BaseMessage} The batch stopped early after a request failed (${apiErrorMessage(Result.ChunkCallError)}) -- ` +
              "check the affected students' practice banks before retrying, since some papers may already have been generated."
          )
        );
      } else {
        ReportActionSuccess("Assign Practice Papers", BaseMessage);
      }
      SetBulkAssignSummary(Result);
      SetSelectedStudentIdsForPractice(new Set());
      SetBulkAssignProgress(null);
      InvalidatePracticeResults();
    },
    onError: (Error) => {
      SetBulkAssignProgress(null);
      ReportActionError("Assign Practice Papers", Error);
    },
  });

  // ---------------------------------------------------------------------
  // Practice -- Results. Never ranked, and always released to the student
  // the instant it's computed -- a separate surface from any OFFICIAL
  // event's own Rank & Release list, never mixed with it, and no longer
  // scoped to any one event either.
  // ---------------------------------------------------------------------

  const [PracticeResultsLevelFilter, SetPracticeResultsLevelFilter] = useState<string>(
    DeepLinkLevelCode && (ANNUAL_COMPETITION_LEVEL_CODES as readonly string[]).includes(DeepLinkLevelCode)
      ? DeepLinkLevelCode
      : "ALL"
  );
  const [PracticeResultsSearchText, SetPracticeResultsSearchText] = useState("");
  const [ExpandedPracticeStudents, SetExpandedPracticeStudents] = useState<Set<string>>(new Set());
  // 2026-09-15 (Shailesh): "the individual student block must contain the
  // different level blocks under it which should be expandable and
  // collapseable and by default collapsed ... right now everything is
  // expanded ... which makes the page look very clumsy and weird." Keyed by
  // `${studentId}::${levelCode}` (not just levelCode) so one student's
  // expanded level never leaks into another student's block. Empty by
  // default -- every level starts collapsed, mirroring the same collapsed-
  // by-default pattern already used for the student's own per-level blocks
  // on student/competition/annual/page.tsx.
  const [ExpandedPracticeLevelGroups, SetExpandedPracticeLevelGroups] = useState<Set<string>>(new Set());
  const DeepLinkStudentAppliedRef = useRef(false);

  const PracticeResultsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-results", PracticeResultsLevelFilter],
    queryFn: () =>
      listAnnualCompetitionPracticeResults({
        competitionLevelCode: PracticeResultsLevelFilter === "ALL" ? undefined : PracticeResultsLevelFilter,
      }),
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "RESULTS",
  });

  // 2026-09-14 (Shailesh): "if a single student will have multiple attempts,
  // then how will the data here be handled? ... we need to figure a way out
  // where we can see the data cleanly." Agreed fix: group by student
  // (mirrors the Competition Mock Tracker's own StudentMockGroup pattern in
  // admin/competition/mock-tracker/page.tsx). The backend now does this
  // grouping itself (ListAnnualCompetitionPracticeResultsForAdmin returns
  // students[].papers[] directly, every paper ascending by paperOrdinal,
  // pending AND submitted together) -- this page just filters and sorts
  // what it's given, no client-side re-grouping needed anymore.
  const GroupedPracticeResults = (() => {
    const Term = PracticeResultsSearchText.trim().toLowerCase();
    const Students = PracticeResultsQuery.data?.students || [];
    const Filtered = !Term
      ? Students
      : Students.filter((StudentGroup) => {
          const Haystack = [
            StudentGroup.studentName,
            StudentGroup.studentCode,
            ...StudentGroup.papers.map((Paper) => Paper.competitionLevelCode),
            ...StudentGroup.papers.map((Paper) => Paper.paperLabel),
          ]
            .join(" ")
            .toLowerCase();
          return Haystack.includes(Term);
        });
    return [...Filtered].sort((Left, Right) =>
      (Left.studentName || Left.studentCode || "").localeCompare(Right.studentName || Right.studentCode || "")
    );
  })();
  function TogglePracticeStudentExpanded(Key: string) {
    SetExpandedPracticeStudents((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }
  function TogglePracticeLevelGroupExpanded(Key: string) {
    SetExpandedPracticeLevelGroups((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }

  // Auto-expand the notified student's row once the roster has actually
  // loaded -- studentCode is all the notification carries (not studentId),
  // so this waits for GroupedPracticeResults to have real rows to match
  // against. Applied at most once per page load (the ref guard) so it never
  // fights a student the admin has since manually collapsed.
  //
  // 2026-09-15 (Shailesh): "on clicking it, it should take them to the
  // correct page with the student's level block expanded for whichever
  // level the notification was assigned." DeepLinkLevelCode above already
  // pre-selects PracticeResultsLevelFilter to this level, but the level
  // group itself still starts collapsed by default like every other level
  // block, so it also needs the explicit expand here -- same
  // `${studentId}::${levelCode}` key the level-group toggle/render below
  // already uses, gated behind the same DeepLinkStudentAppliedRef so it
  // only ever applies once per page load.
  useEffect(() => {
    if (!DeepLinkStudentCode || DeepLinkStudentAppliedRef.current) return;
    const Match = GroupedPracticeResults.find((StudentGroup) => StudentGroup.studentCode === DeepLinkStudentCode);
    if (!Match) return;
    DeepLinkStudentAppliedRef.current = true;
    SetExpandedPracticeStudents((Prev) => new Set(Prev).add(Match.studentId));
    if (DeepLinkLevelCode) {
      SetExpandedPracticeLevelGroups((Prev) => new Set(Prev).add(`${Match.studentId}::${DeepLinkLevelCode}`));
    }
  }, [DeepLinkStudentCode, DeepLinkLevelCode, GroupedPracticeResults]);

  // 2026-09-14 (Shailesh): per-row and per-student-block delete icons in
  // the admin Practice view. Both mutations invalidate the same query key
  // the practice-results list itself uses, so the table reflects the
  // deletion immediately without a manual refetch call.
  const DeletePracticeAttemptMutation = useMutation({
    mutationFn: (LevelPaperId: string) => deleteAnnualCompetitionPracticeAttempt(LevelPaperId),
    onMutate: ClearActionResult,
    // 2026-09-16 (Shailesh, 504-fix pass -- "bulletproof end to end"): this
    // delete used to have no success/error feedback at all -- a failure was
    // silently swallowed, indistinguishable from a delete that never
    // happened. Both delete mutations now report through the same shared
    // action-result banner every other action on this page uses.
    onSuccess: () => {
      ReportActionSuccess("Delete Practice Paper", "Practice paper deleted.");
      InvalidatePracticeResults();
    },
    onError: (Error) => ReportActionError("Delete Practice Paper", Error),
  });
  const DeleteAllPracticeForStudentMutation = useMutation({
    mutationFn: (StudentId: string) => deleteAllAnnualCompetitionPracticeRecordsForStudent(StudentId),
    onMutate: ClearActionResult,
    onSuccess: () => {
      ReportActionSuccess("Delete All Practice Records", "All practice records deleted for this student.");
      InvalidatePracticeResults();
    },
    onError: (Error) => ReportActionError("Delete All Practice Records", Error),
  });

  // 2026-09-14 batch (Shailesh: "for accuracy breakdown part if possible
  // lets backfill the existing attempts as well"). The backend recompute
  // routes (RecomputeAnnualCompetitionResults/RecomputeAnnualCompetition-
  // PracticeResults) already existed API-only with no UI trigger anywhere
  // -- these two buttons are that trigger. Idempotent and safe to run more
  // than once: never touches is_released/rank/consumed_at, only refreshes
  // score/accuracy/correct/wrong/unanswered under whatever the current
  // scoring formula is (see RecomputeAnnualCompetitionResults's own
  // docstring). Both mutations invalidate the same query keys the results
  // tables themselves use, so a refreshed row shows up immediately.
  const RecomputeOfficialMutation = useMutation({
    mutationFn: () => recomputeAllAnnualCompetitionOfficialResults(),
    onMutate: ClearActionResult,
    onSuccess: (Result) => {
      ReportActionSuccess("Recompute Official Results", `Recomputed ${Result.recomputedCount} official result${Result.recomputedCount === 1 ? "" : "s"}.`);
      // Matches the per-event results query key from
      // annual-studio/[eventId]/page.tsx (["admin", "annual-competition",
      // "results", EventId, ...]) as a prefix, so any such query already in
      // the cache is marked stale and refetches next time that page mounts.
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "results"] });
    },
    onError: (Error) => ReportActionError("Recompute Official Results", Error),
  });
  const RecomputePracticeMutation = useMutation({
    mutationFn: () => recomputeAnnualCompetitionPracticeResults(),
    onMutate: ClearActionResult,
    onSuccess: (Result) => {
      ReportActionSuccess("Recompute Practice Results", `Recomputed ${Result.recomputedCount} practice result${Result.recomputedCount === 1 ? "" : "s"}.`);
      InvalidatePracticeResults();
    },
    onError: (Error) => ReportActionError("Recompute Practice Results", Error),
  });

  // ---------------------------------------------------------------------
  // Practice -- Reports (package 3, Shailesh, 2026-09-16; block-list
  // redesign 2026-09-16 per Shailesh's own follow-up: "we need the list of
  // all the students there, that is the student blocks along with the
  // level filters which will filter out the students in those levels only
  // and by default would show all the students... on clicking those
  // blocks it should show the analytics for that particular student").
  // Two inner views: per-student (analytics-scope level filter OPTIONAL --
  // see getAnnualCompetitionPracticeReportForStudent's own comment on why,
  // a 2026-09-16 clarification about a returning student's level changing
  // year to year) and per-level (level REQUIRED, per Shailesh's own
  // confirmation the same day).
  //
  // The student picker is now a clickable block grid, not a dropdown --
  // reuses listAnnualCompetitionPracticeResults (the exact same roster/
  // filtering the Results tab already uses) rather than StudentsQuery's
  // full Bank roster, since a student with zero practice activity has
  // nothing to show a report for anyway. ReportsBlockLevelFilter (and,
  // admin-only, ReportsTeacherFilter) narrow WHICH BLOCKS are visible
  // (server-side). Clicking a block opens StudentAnalyticsModal for that
  // student -- ModalStudentRow below -- which owns its own level filter(s)
  // entirely separately from the block grid's filters (2026-09-16,
  // Shailesh redesign: "a seperate window popping up when a student is
  // clicked upon").
  // ---------------------------------------------------------------------

  const [PracticeReportsSubTab, SetPracticeReportsSubTab] = useState<PracticeReportsSubTabKey>("STUDENT");
  const [ReportsStudentSearchText, SetReportsStudentSearchText] = useState("");
  // "ALL" = every student with any practice activity, across every level.
  const [ReportsBlockLevelFilter, SetReportsBlockLevelFilter] = useState<string>("ALL");
  // Admin-only narrowing (2026-09-16, Shailesh -- "the admin can see the
  // students teacher wise as well"). "ALL" = every teacher's students.
  const [ReportsTeacherFilter, SetReportsTeacherFilter] = useState<string>("ALL");
  const [ReportsLevelCode, SetReportsLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  // 2026-09-17 (Shailesh): which of Individual Level's own two sub-tabs is
  // active -- the level filter above stays shared/outside both (single
  // ReportsLevelCode state, single query), only the displayed table+its own
  // stat-card row switches.
  const [LevelReportSubTab, SetLevelReportSubTab] = useState<LevelReportSubTabKey>("SECTION");
  // The student the analytics modal is open for -- null when closed. The
  // whole roster row is kept (not just an id) so the modal has the
  // student's papers on hand immediately to derive Section Wise Analytics'
  // default level, with zero extra fetch.
  const [ModalStudentRow, SetModalStudentRow] = useState<AnnualCompetitionPracticeRosterStudent | null>(null);

  // Analytics Visualization feature, package 2 (Shailesh, 2026-09-22): the
  // 3rd Reports sub-tab earmarked back on 2026-09-18 (see PracticeReportsSubTabList's
  // own comment above) -- three independent scopes, each with its own state/
  // query, following this file's own established precedent (Leaderboard's
  // LeaderboardLevelCode being kept separate from Reports' ReportsLevelCode
  // "so the two tabs [don't fight] over one shared filter") rather than
  // reusing Individual Level/Individual Student's own state.
  const [VisualizationLevelCode, SetVisualizationLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  const [VisualizationStudentLevelCode, SetVisualizationStudentLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  const [VisualizationStudentSearchText, SetVisualizationStudentSearchText] = useState("");
  const [VisualizationSelectedStudentId, SetVisualizationSelectedStudentId] = useState<string | null>(null);

  // Redesign package (Shailesh, 2026-09-22 review round): the Visualization
  // tab itself now has 3 real sub-tabs (Overview / Level Analysis / Student
  // Analysis) instead of everything stacked on one page, and each scope has
  // its own chart-type picker so the admin can choose which chart/metric to
  // look at rather than seeing one fixed chart per scope. One selected-chart
  // key per scope, each defaulting to that scope's first menu option.
  const VisualizationSubTabList = ["OVERVIEW", "LEVEL", "STUDENT"] as const;
  const [VisualizationSubTab, SetVisualizationSubTab] = useState<(typeof VisualizationSubTabList)[number]>("OVERVIEW");
  const [VisualizationOverviewChartKey, SetVisualizationOverviewChartKey] = useState<OverviewChartKey>(OVERVIEW_CHART_OPTIONS[0].Key);
  const [VisualizationLevelChartKey, SetVisualizationLevelChartKey] = useState<LevelChartKey>(LEVEL_CHART_OPTIONS[0].Key);
  const [VisualizationStudentChartKey, SetVisualizationStudentChartKey] = useState<StudentChartKey>(STUDENT_CHART_OPTIONS[0].Key);

  const TeachersQuery = useQuery({
    queryKey: ["admin-teachers"],
    queryFn: getAdminTeachers,
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "STUDENT",
  });

  const ReportsRosterQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-reports-roster", ReportsBlockLevelFilter, ReportsTeacherFilter],
    queryFn: () =>
      listAnnualCompetitionPracticeResults({
        competitionLevelCode: ReportsBlockLevelFilter === "ALL" ? undefined : ReportsBlockLevelFilter,
        teacherId: ReportsTeacherFilter === "ALL" ? undefined : ReportsTeacherFilter,
      }),
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "STUDENT",
  });

  const ReportsStudentSearchLower = ReportsStudentSearchText.trim().toLowerCase();
  const ReportsFilteredStudentRows = (ReportsRosterQuery.data?.students || []).filter((Row) => {
    if (!ReportsStudentSearchLower) return true;
    const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
    return Haystack.includes(ReportsStudentSearchLower);
  });

  const PracticeReportLevelQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-report-level", ReportsLevelCode],
    queryFn: () => getAnnualCompetitionPracticeReportForLevel(ReportsLevelCode),
    enabled:
      Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "LEVEL" && Boolean(ReportsLevelCode),
  });

  // Analytics Visualization feature, package 2: four independent queries,
  // one per chart scope -- Overview is unconditional (whole platform, no
  // filter); Level Analysis follows VisualizationLevelCode; Student
  // Analysis first lists a roster to search/pick a student (scoped by
  // VisualizationStudentLevelCode, same convention as Individual Student's
  // own ReportsBlockLevelFilter), then fetches that one student's report
  // once selected.
  const VisualizationEnabled = Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "VISUALIZATION";

  const VisualizationOverviewQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-report-overview"],
    queryFn: () => getAnnualCompetitionPracticeReportOverview(),
    enabled: VisualizationEnabled,
  });

  const VisualizationLevelReportQuery = useQuery({
    queryKey: ["admin", "annual-competition", "visualization-level-report", VisualizationLevelCode],
    queryFn: () => getAnnualCompetitionPracticeReportForLevel(VisualizationLevelCode),
    enabled: VisualizationEnabled && Boolean(VisualizationLevelCode),
  });

  const VisualizationRosterQuery = useQuery({
    queryKey: ["admin", "annual-competition", "visualization-roster", VisualizationStudentLevelCode],
    queryFn: () => listAnnualCompetitionPracticeResults({ competitionLevelCode: VisualizationStudentLevelCode }),
    enabled: VisualizationEnabled,
  });

  const VisualizationStudentSearchLower = VisualizationStudentSearchText.trim().toLowerCase();
  const VisualizationFilteredStudentRows = (VisualizationRosterQuery.data?.students || []).filter((Row) => {
    if (!VisualizationStudentSearchLower) return true;
    const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
    return Haystack.includes(VisualizationStudentSearchLower);
  });

  const VisualizationStudentReportQuery = useQuery({
    queryKey: ["admin", "annual-competition", "visualization-student-report", VisualizationSelectedStudentId, VisualizationStudentLevelCode],
    queryFn: () => getAnnualCompetitionPracticeReportForStudent(VisualizationSelectedStudentId as string, VisualizationStudentLevelCode),
    enabled: VisualizationEnabled && Boolean(VisualizationSelectedStudentId),
  });

  // ---------------------------------------------------------------------
  // Practice -- Leaderboard (2026-09-18, Shailesh): "we need to have a 4th
  // tab for admin ... which is gonna be leaderboard ... level wise
  // leaderboards so that ... the admin can see how all the students are
  // faring." Reuses the exact same GetAnnualCompetitionPracticeReportForLevel
  // endpoint the "Individual Level" Reports tab already calls -- its
  // perStudent array is already the leaderboard (sorted, now with an
  // explicit rank field, see that service function's own comment) -- kept
  // as its own query/queryKey rather than sharing PracticeReportLevelQuery
  // so the Leaderboard tab has its own independent level selection instead
  // of the two tabs fighting over one shared filter.
  const [LeaderboardLevelCode, SetLeaderboardLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  const PracticeLeaderboardQuery = useQuery({
    queryKey: ["admin", "annual-competition", "practice-leaderboard-level", LeaderboardLevelCode],
    queryFn: () => getAnnualCompetitionPracticeReportForLevel(LeaderboardLevelCode),
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "LEADERBOARD" && Boolean(LeaderboardLevelCode),
  });

  if (!Ready) return null;

  // 2026-09-16 (Shailesh, 504 fix): a STANDING fact about page state (a
  // query failed to load) -- deliberately separate from LastActionResult
  // above, which is the one-shot outcome of whatever the admin most
  // recently clicked. Keeping these apart means a stale action result can
  // never masquerade as (or hide) a genuine, ongoing data-load failure, and
  // vice versa.
  const DataLoadError =
    EventsQuery.error ||
    (TopTab === "PRACTICE" && PracticeSubTab === "BANK" ? StudentsQuery.error : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "RESULTS" ? PracticeResultsQuery.error : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "STUDENT" ? ReportsRosterQuery.error : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "LEVEL" ? PracticeReportLevelQuery.error : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "VISUALIZATION"
      ? VisualizationOverviewQuery.error || VisualizationLevelReportQuery.error || VisualizationRosterQuery.error
      : null) ||
    (TopTab === "PRACTICE" && PracticeSubTab === "LEADERBOARD" ? PracticeLeaderboardQuery.error : null);

  return (
    <AppShell title="Annual Competition Studio">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-block-header"><Trophy size={14} />Annual Competition</p>
          <h1 className="math-title">Annual Competition Studio</h1>
          <p className="mt-3 max-w-none text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            Official runs the real, scheduled Annual Competition event end to end -- slots, each level&apos;s official
            paper, and student assignments. Practice is fully separate and never tied to any event -- assign practice
            papers to any number of students at once so they can prepare for the mega event, independent of any
            official assignment.
          </p>
        </div>

        {DataLoadError && <ErrorState message={apiErrorMessage(DataLoadError)} />}
        {LastActionResult && LastActionResult.Kind === "error" && (
          <ErrorState title={LastActionResult.Label} message={LastActionResult.Text} />
        )}
        {LastActionResult && LastActionResult.Kind === "success" && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {LastActionResult.Text}
          </div>
        )}

        {/* 2026-09-14 batch: one-time (and repeatable) accuracy backfill
            trigger -- see the mutations above for what this actually calls.
            Safe to click more than once; only refreshes already-finalized
            results under the current formula, never touches release/rank
            state. */}
        <div className="math-card p-5">
          <p className="math-block-header"><RefreshCcw size={14} />Accuracy Backfill</p>
          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            Recomputes score/accuracy/correct/wrong/unanswered for every already-finalized result under the current
            formula. Never touches release status, rank, or certificates -- safe to run again anytime.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => RecomputeOfficialMutation.mutate()}
              disabled={RecomputeOfficialMutation.isPending}
              className="math-button-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-60"
            >
              <RefreshCcw size={14} className={RecomputeOfficialMutation.isPending ? "animate-spin" : ""} />
              {RecomputeOfficialMutation.isPending ? "Recomputing..." : "Recompute Official Results"}
            </button>
            <button
              type="button"
              onClick={() => RecomputePracticeMutation.mutate()}
              disabled={RecomputePracticeMutation.isPending}
              className="math-button-secondary inline-flex items-center gap-1.5 px-4 py-2 text-sm disabled:opacity-60"
            >
              <RefreshCcw size={14} className={RecomputePracticeMutation.isPending ? "animate-spin" : ""} />
              {RecomputePracticeMutation.isPending ? "Recomputing..." : "Recompute Practice Results"}
            </button>
          </div>
        </div>

        <div className="math-card p-3">
          <div className="flex flex-wrap gap-3">
            {TopTabList.map((Tab) => (
              <button
                key={Tab}
                type="button"
                onClick={() => SetTopTab(Tab)}
                aria-selected={TopTab === Tab}
                className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${TopTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
              >
                {Tab === "OFFICIAL" ? "Official" : "Practice"}
              </button>
            ))}
          </div>
        </div>

        {TopTab === "OFFICIAL" && (
          <div className="space-y-6">
            <div className="math-card p-5">
              <SectionTitle
                icon={<PlusCircle size={14} />}
                kicker="New Event"
                title="Create Annual Competition Event"
                description="One event per real competition date. Results Release Date can be left blank until MathPath confirms it -- setting it later locks every linked level paper."
              />
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200 sm:col-span-2">
                  Event Name
                  <input
                    value={EventName}
                    onChange={(EventValue) => SetEventName(EventValue.target.value)}
                    placeholder="Example: MathPath Annual Competition 2026"
                    className="math-input"
                  />
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Competition Date &amp; Time
                  <input
                    type="datetime-local"
                    value={CompetitionDateInput}
                    onChange={(EventValue) => SetCompetitionDateInput(EventValue.target.value)}
                    className="math-input"
                  />
                </label>
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Results Release Date &amp; Time (optional)
                  <input
                    type="datetime-local"
                    value={ResultsReleaseInput}
                    onChange={(EventValue) => SetResultsReleaseInput(EventValue.target.value)}
                    className="math-input"
                  />
                  <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">
                    Formal Results &amp; Prize Distribution date, once confirmed. Leave blank for now.
                  </span>
                </label>
              </div>
              <div className="mt-5">
                <button
                  type="button"
                  disabled={!CanCreate || CreateMutation.isPending}
                  onClick={() => CreateMutation.mutate()}
                  className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PlusCircle size={16} />
                  {CreateMutation.isPending ? "Creating..." : "Create Event"}
                </button>
              </div>
            </div>

            <div className="math-card p-5">
              <SectionTitle icon={<CalendarClock size={14} />} kicker="Events" title="Annual Competition Events" description="Open an event to manage its slots, official papers, and assignments." />
              {EventsQuery.isLoading ? (
                <div className="mt-5"><LoadingState label="Loading events..." /></div>
              ) : Events.length === 0 ? (
                <div className="mt-5">
                  <EmptyState title="No Annual Competition events yet" description="Create the first one above." />
                </div>
              ) : (
                <div className="mt-5 grid gap-3">
                  {Events.map((EventItem: AnnualCompetitionEvent) =>
                    EditingEventId === EventItem.eventId ? (
                      <div key={EventItem.eventId} className="rounded-2xl border border-[color:var(--mp-role-border-strong)] bg-white p-4 dark:bg-slate-950/40">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200 sm:col-span-2">
                            Event Name
                            <input value={EditEventName} onChange={(EventValue) => SetEditEventName(EventValue.target.value)} className="math-input" />
                          </label>
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                            Competition Date &amp; Time
                            <input
                              type="datetime-local"
                              value={EditCompetitionDateInput}
                              onChange={(EventValue) => SetEditCompetitionDateInput(EventValue.target.value)}
                              className="math-input"
                            />
                          </label>
                          <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                            Results Release Date &amp; Time (optional)
                            <input
                              type="datetime-local"
                              value={EditResultsReleaseInput}
                              onChange={(EventValue) => SetEditResultsReleaseInput(EventValue.target.value)}
                              className="math-input"
                            />
                            <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Leave blank to keep it unset.</span>
                          </label>
                        </div>
                        {UpdateEventMutation.isError && (
                          <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-300">{apiErrorMessage(UpdateEventMutation.error)}</p>
                        )}
                        <div className="mt-5 flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={!EditEventName.trim() || !EditCompetitionDateInput || UpdateEventMutation.isPending}
                            onClick={() => UpdateEventMutation.mutate(EventItem.eventId)}
                            className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <CheckCircle2 size={16} />
                            {UpdateEventMutation.isPending ? "Saving..." : "Save Changes"}
                          </button>
                          <button
                            type="button"
                            onClick={CancelEditingEvent}
                            className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-5 py-2.5 text-sm font-black text-slate-600 transition hover:-translate-y-px dark:bg-slate-950/40 dark:text-slate-300"
                          >
                            <X size={16} />
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        key={EventItem.eventId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-5 py-4 shadow-sm transition hover:-translate-y-px hover:shadow-md dark:bg-slate-950/40"
                      >
                        <Link href={`/admin/competition/annual-studio/${EventItem.eventId}`} className="min-w-0 flex-1">
                          <p className="text-base font-black text-slate-950 dark:text-white">{EventItem.name}</p>
                          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                            {FormatEventDate(EventItem.competitionDate)}
                          </p>
                        </Link>
                        <div className="flex items-center gap-3">
                          <StatusChip status={EventItem.status} />
                          <button
                            type="button"
                            title="Edit event"
                            aria-label="Edit event"
                            onClick={(ClickEvent) => {
                              ClickEvent.preventDefault();
                              StartEditingEvent(EventItem);
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--mp-role-border)] text-slate-500 transition hover:-translate-y-px hover:border-[color:var(--mp-role-border-strong)] hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                          >
                            <Pencil size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete event"
                            aria-label="Delete event"
                            disabled={DeleteEventMutation.isPending}
                            onClick={(ClickEvent) => {
                              ClickEvent.preventDefault();
                              if (
                                window.confirm(
                                  `Delete "${EventItem.name}"? This removes the event and everything under it -- slots, papers, assignments, and ALL student attempts, answers, and results, even if results have already been released and certificates issued. This can't be undone.`
                                )
                              ) {
                                DeleteEventMutation.mutate(EventItem.eventId);
                              }
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:text-rose-300"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {TopTab === "PRACTICE" && (
          <div className="space-y-6">
            <div className="math-card p-3">
              <div className="flex flex-wrap gap-3">
                {PracticeSubTabList.map((Tab) => (
                  <button
                    key={Tab}
                    type="button"
                    onClick={() => SetPracticeSubTab(Tab)}
                    aria-selected={PracticeSubTab === Tab}
                    className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${PracticeSubTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
                  >
                    {Tab === "BANK"
                      ? "Practice Bank"
                      : Tab === "RESULTS"
                        ? "Practice Results"
                        : Tab === "REPORTS"
                          ? "Practice Reports"
                          : "Leaderboard"}
                  </button>
                ))}
              </div>
            </div>

            {PracticeSubTab === "BANK" && (
              <div className="math-card p-5">
                <SectionTitle
                  icon={<Sparkles size={14} />}
                  kicker="Practice Bank"
                  title="Assign Practice Papers"
                  description="Generates fresh, always-different practice papers and adds them to every selected student's bank for a level -- safe to call repeatedly, it never touches or consumes a paper already there. Select all, many, or a filtered subset of students below. Quantity must be a multiple of 5, up to 25 per batch."
                />

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Level To Assign
                    <select
                      value={PracticeAssignLevelCode}
                      onChange={(EventValue) => SetPracticeAssignLevelCode(EventValue.target.value)}
                      className="math-input"
                    >
                      {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                        <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Quantity Per Student
                    <select
                      value={PracticeAssignQuantity}
                      onChange={(EventValue) => SetPracticeAssignQuantity(Number(EventValue.target.value))}
                      className="math-input"
                    >
                      {PRACTICE_BATCH_QUANTITY_OPTIONS.map((Quantity) => (
                        <option key={Quantity} value={Quantity}>{Quantity}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={SelectedStudentIdsForPractice.size === 0 || BulkAssignMutation.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Assign ${PracticeAssignQuantity} ${FormatCompetitionLevelLabel(PracticeAssignLevelCode)} practice paper${PracticeAssignQuantity === 1 ? "" : "s"} to ${SelectedStudentIdsForPractice.size} student${SelectedStudentIdsForPractice.size === 1 ? "" : "s"}?`
                        )
                      ) {
                        SetBulkAssignSummary(null);
                        BulkAssignMutation.mutate();
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <PlusCircle size={16} />
                    {BulkAssignMutation.isPending
                      ? BulkAssignProgress
                        ? `Assigning batch ${BulkAssignProgress.Done}/${BulkAssignProgress.Total}...`
                        : "Assigning..."
                      : `Assign To ${SelectedStudentIdsForPractice.size || 0} Selected`}
                  </button>
                  {SelectedStudentIdsForPractice.size > 0 && (
                    <button
                      type="button"
                      onClick={() => SetSelectedStudentIdsForPractice(new Set())}
                      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-xs font-black text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                    >
                      <X size={13} />
                      Deselect All ({SelectedStudentIdsForPractice.size})
                    </button>
                  )}
                </div>

                {BulkAssignSummary && (
                  <div className="mt-4 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-3 text-xs font-bold dark:bg-slate-950/40">
                    <div className="flex flex-wrap gap-4">
                      <span className="text-emerald-600 dark:text-emerald-300">{BulkAssignSummary.StudentsSucceeded} succeeded</span>
                      <span>{BulkAssignSummary.TotalPapersAssigned} papers assigned</span>
                      {BulkAssignSummary.StudentsFailed > 0 && (
                        <span className="text-rose-600 dark:text-rose-300">{BulkAssignSummary.StudentsFailed} failed</span>
                      )}
                    </div>
                    {BulkAssignSummary.FailedRows.length > 0 && (
                      <ul className="mt-2 space-y-1 text-rose-600 dark:text-rose-300">
                        {BulkAssignSummary.FailedRows.map((Row, Index) => (
                          <li key={`${Row.studentIdentifier}-${Index}`}>{Row.studentIdentifier}: {Row.reason}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {StudentRows.length > 0 && (
                  // 2026-09-15 (Shailesh): "the content in that tab is very
                  // small ... we need to have the content displayed properly
                  // and in bigger font sizes ... especially the search bar,
                  // module and level filters ... no matter from which device
                  // the admin logs in everything should be visually top
                  // notch and clean." These used to be forced down to
                  // text-xs (12px) at fixed pixel widths (w-64/w-auto) with
                  // no responsive behaviour at all -- cramped on every
                  // screen size, not just small ones. Rebuilt to match the
                  // clean, responsive precedent already used elsewhere in
                  // this admin app (admin/students/page.tsx's own search/
                  // filter row): full-size math-input/select, a grid that
                  // stacks to one column per control on narrow screens and
                  // opens up on wider ones instead of staying tiny always.
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_200px_200px_auto]">
                    <div className="relative sm:col-span-2 lg:col-span-1">
                      <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={PracticeSearchText}
                        onChange={(EventValue) => SetPracticeSearchText(EventValue.target.value)}
                        placeholder="Search by name or student code..."
                        className="math-input pl-11"
                      />
                    </div>
                    <select
                      value={PracticeModuleFilter}
                      onChange={(EventValue) => {
                        // Reset the level filter whenever the module changes
                        // so a stale level selection that no longer belongs
                        // to the newly selected module can't linger invisibly.
                        SetPracticeModuleFilter(EventValue.target.value);
                        SetPracticeLevelFilter("ALL");
                      }}
                      className="math-select"
                      aria-label="Filter by module"
                    >
                      <option value="ALL">All Modules</option>
                      {PracticeModuleOptions.map((ModuleCode) => (
                        <option key={ModuleCode} value={ModuleCode}>{ModuleCode}</option>
                      ))}
                    </select>
                    <select
                      value={PracticeLevelFilter}
                      onChange={(EventValue) => SetPracticeLevelFilter(EventValue.target.value)}
                      className="math-select"
                      aria-label="Filter by current level"
                    >
                      <option value="ALL">All Levels</option>
                      {PracticeLevelOptions.map((LevelCode) => (
                        <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                      ))}
                    </select>
                    <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-1 lg:justify-self-end">
                      {(PracticeSearchText || PracticeModuleFilter !== "ALL" || PracticeLevelFilter !== "ALL" || PracticeEligibleOnly) && (
                        <button
                          type="button"
                          onClick={() => {
                            SetPracticeSearchText("");
                            SetPracticeModuleFilter("ALL");
                            SetPracticeLevelFilter("ALL");
                            SetPracticeEligibleOnly(false);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-sm font-bold text-slate-500 transition hover:-translate-y-px dark:bg-slate-950/60 dark:text-slate-300"
                        >
                          <X size={14} />
                          Clear Filters
                        </button>
                      )}
                      <span className="text-sm font-bold text-slate-400">
                        {FilteredStudentRows.length} of {StudentRows.length} shown
                      </span>
                    </div>
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-300 sm:col-span-2 lg:col-span-4">
                      <input
                        type="checkbox"
                        checked={PracticeEligibleOnly}
                        onChange={(EventValue) => SetPracticeEligibleOnly(EventValue.target.checked)}
                        className="h-4 w-4"
                      />
                      Only show students eligible for {FormatCompetitionLevelLabel(PracticeAssignLevelCode)}
                    </label>
                  </div>
                )}

                {StudentsQuery.isLoading ? (
                  <div className="mt-5"><LoadingState label="Loading students..." /></div>
                ) : FilteredStudentRows.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm font-bold">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          <th className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={AllFilteredStudentRowsSelected}
                              onChange={ToggleSelectAllFilteredStudentRows}
                              aria-label="Select all shown students"
                              className="h-3.5 w-3.5"
                            />
                          </th>
                          <th className="px-2 py-1.5">Student</th>
                          <th className="px-2 py-1.5">Current Level</th>
                          <th className="px-2 py-1.5">Eligible Competition Level</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FilteredStudentRows.map((Row) => (
                          <tr key={Row.studentId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2">
                              <input
                                type="checkbox"
                                checked={SelectedStudentIdsForPractice.has(Row.studentId)}
                                onChange={() => ToggleOneStudentRowSelected(Row.studentId)}
                                aria-label={`Select ${Row.studentName || Row.studentCode || Row.studentId}`}
                                className="h-3.5 w-3.5"
                              />
                            </td>
                            <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2">
                              {Row.currentLevelCode || "--"}
                              {/* 2026-09-15 (Shailesh): "we need to have the
                                  current lesson number for the MM students as
                                  well ... so that it is clear why the student
                                  is gonna sit for MM-L1" -- Master has exactly
                                  one curriculum level (MM-L1), so this is the
                                  only thing that actually distinguishes
                                  students within it. Current Level itself
                                  stays the real code, never renamed. */}
                              {Row.currentModuleCode === "MM" && (Row.currentLessonNumber != null || Row.masterLevelComplete) ? (
                                <span className="ml-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500">
                                  ({FormatMasterCurrentLevelSuffix(Row.currentLessonNumber, Row.masterLevelComplete)})
                                </span>
                              ) : null}
                            </td>
                            <td className="px-2 py-2">
                              {Row.eligibleCompetitionLevelCode ? (
                                <span className="text-emerald-600 dark:text-emerald-300">{FormatCompetitionLevelLabel(Row.eligibleCompetitionLevelCode)}</span>
                              ) : (
                                <span className="text-slate-400">Not matched</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-5">
                    <EmptyState title="No students found" description="Adjust the search or filters above." />
                  </div>
                )}
              </div>
            )}

            {PracticeSubTab === "RESULTS" && (
              <div className="math-card p-5">
                <SectionTitle
                  icon={<Medal size={14} />}
                  kicker="Practice Results"
                  title="Recent Practice Activity"
                  description="Never ranked, and always released to the student the instant it's computed -- a separate surface from any OFFICIAL event's own Rank &amp; Release list, and never scoped to any one event."
                />
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                    <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                    <input
                      value={PracticeResultsSearchText}
                      onChange={(EventValue) => SetPracticeResultsSearchText(EventValue.target.value)}
                      placeholder="Search student name or code"
                      className="w-64 bg-transparent outline-none placeholder:text-slate-400"
                    />
                  </label>
                  {/* 2026-09-14 (Shailesh): "remove the level filter text
                      from top of the level filter dropdown as it is self
                      explanatory" -- select kept, "Filter by Level" label
                      text dropped (aria-label preserves accessibility). */}
                  <select
                    aria-label="Filter by level"
                    value={PracticeResultsLevelFilter}
                    onChange={(EventValue) => SetPracticeResultsLevelFilter(EventValue.target.value)}
                    className="math-input"
                  >
                    <option value="ALL">All Levels</option>
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                    ))}
                  </select>
                </div>

                {PracticeResultsQuery.isLoading ? (
                  <div className="mt-5"><LoadingState label="Loading practice results..." /></div>
                ) : GroupedPracticeResults.length > 0 ? (
                  <div className="mt-5 space-y-3">
                    {GroupedPracticeResults.map((StudentGroup: AnnualCompetitionPracticeRosterStudent) => {
                      const StudentOpen = ExpandedPracticeStudents.has(StudentGroup.studentId);
                      const PendingCount = StudentGroup.papers.filter((Paper) => Paper.status === "NOT_STARTED").length;
                      return (
                        <div key={StudentGroup.studentId} className="overflow-hidden rounded-3xl border border-[#2563eb]/15 bg-white shadow-sm ring-1 ring-cyan-100/70 dark:border-cyan-300/15 dark:bg-slate-950/35 dark:ring-white/10">
                          <div className="flex w-full flex-col gap-3 bg-[#2563eb]/[0.025] px-4 py-4 sm:flex-row sm:items-center sm:justify-between dark:bg-cyan-400/5">
                            <button
                              type="button"
                              onClick={() => TogglePracticeStudentExpanded(StudentGroup.studentId)}
                              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl text-left transition hover:opacity-80"
                            >
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[#2563eb]/25 bg-white text-[#2563eb] shadow-sm ring-1 ring-[#2563eb]/10 dark:border-cyan-300/30 dark:bg-slate-950/50 dark:text-cyan-100 dark:ring-cyan-300/10">
                                {StudentOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                              </span>
                              <div className="min-w-0">
                                <h3 className="truncate text-base font-black text-slate-950 dark:text-white">
                                  {StudentGroup.studentName || StudentGroup.studentCode || StudentGroup.studentId}
                                </h3>
                                {StudentGroup.studentCode ? (
                                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[#2563eb] dark:text-cyan-100">{StudentGroup.studentCode}</p>
                                ) : null}
                              </div>
                            </button>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-black">
                              <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                                {StudentGroup.papers.length} Paper{StudentGroup.papers.length === 1 ? "" : "s"}
                                {PendingCount > 0 ? ` (${PendingCount} pending)` : ""}
                              </span>
                              {/* 2026-09-14 (Shailesh): per-student "delete
                                  all" -- Practice records only, that
                                  student's OFFICIAL record is untouched. */}
                              <button
                                type="button"
                                title="Delete all practice records for this student"
                                aria-label="Delete all practice records for this student"
                                disabled={DeleteAllPracticeForStudentMutation.isPending}
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete ALL practice records for ${StudentGroup.studentName || StudentGroup.studentCode || StudentGroup.studentId}? This removes every practice paper (pending and submitted), attempt, and result for this student. Their OFFICIAL Annual Competition record, if any, is untouched. This can't be undone.`
                                    )
                                  ) {
                                    DeleteAllPracticeForStudentMutation.mutate(StudentGroup.studentId);
                                  }
                                }}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:text-rose-300"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </div>

                          {StudentOpen ? (
                            <div className="border-t border-[#2563eb]/10 p-3 dark:border-cyan-300/10">
                              {/* 2026-09-15 (Shailesh): "for the grouping of
                                  levels in the student blocks, lets do that
                                  for both teacher and admin login" -- one
                                  sub-table per level instead of every paper
                                  across every level mixed into one long
                                  flat list. Each level group is now its own
                                  expand/collapse toggle, collapsed by
                                  default: "the individual student block must
                                  contain the different level blocks under it
                                  which should be expandable and collapseable
                                  and by default collapsed ... right now
                                  everything is expanded ... which makes the
                                  page look very clumsy and weird." */}
                              <div className="space-y-3">
                                {GroupPracticePapersByLevel(StudentGroup.papers).map((LevelGroup) => {
                                  const LevelKey = `${StudentGroup.studentId}::${LevelGroup.LevelCode}`;
                                  const LevelOpen = ExpandedPracticeLevelGroups.has(LevelKey);
                                  const LevelPendingCount = LevelGroup.Papers.filter((Paper) => Paper.status === "NOT_STARTED").length;
                                  return (
                                  <div
                                    key={LevelGroup.LevelCode}
                                    className="overflow-hidden rounded-2xl border border-[#2563eb]/15 bg-white shadow-sm dark:border-white/10 dark:bg-slate-950/35"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => TogglePracticeLevelGroupExpanded(LevelKey)}
                                      className="flex w-full items-center justify-between gap-3 border-b border-[#2563eb]/10 bg-[#2563eb]/[0.04] px-5 py-2.5 text-left transition hover:bg-[#2563eb]/[0.07] dark:border-cyan-300/10 dark:bg-cyan-400/5 dark:hover:bg-cyan-400/10"
                                    >
                                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[#2563eb] dark:text-cyan-100">
                                        {LevelOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        {FormatCompetitionLevelLabel(LevelGroup.LevelCode)}
                                      </span>
                                      <span className="text-xs font-black text-slate-500 dark:text-slate-400">
                                        {LevelGroup.Papers.length} Paper{LevelGroup.Papers.length === 1 ? "" : "s"}
                                        {LevelPendingCount > 0 ? ` (${LevelPendingCount} pending)` : ""}
                                      </span>
                                    </button>
                                    {LevelOpen ? (
                                    <>
                                    <div className="math-admin-light-student-summary-header grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.5fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                                      <span>Paper Name</span>
                                      <span>Accuracy</span>
                                      <span>Score</span>
                                      <span>Time Taken</span>
                                      <span>Completed</span>
                                      <span>Attempt</span>
                                      <span />
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-white/10">
                                      {LevelGroup.Papers.map((Paper) => {
                                        const IsPending = Paper.status === "NOT_STARTED" || !Paper.result;
                                        return (
                                          <div
                                            key={Paper.levelPaperId}
                                            className="math-admin-light-student-summary-row grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr_0.5fr] items-center gap-3 px-5 py-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50/50 dark:text-slate-100 dark:hover:bg-slate-800/40"
                                          >
                                            <div className="font-black text-slate-950 dark:text-white">{Paper.paperLabel}</div>
                                            <div>{IsPending ? "-" : `${Paper.result!.accuracyPercentage}%`}</div>
                                            <div>{IsPending ? "-" : `${Paper.result!.score}/${Paper.result!.maxScore}`}</div>
                                            <div>{IsPending ? "-" : FormatSecondsAsMinSec(Paper.result!.timeTakenSeconds)}</div>
                                            <div>{IsPending ? "-" : FormatEventDate(Paper.result!.computedAt)}</div>
                                            <div>
                                              {Paper.attemptId ? (
                                                <Link
                                                  href={`/admin/competition/annual-result/${Paper.attemptId}`}
                                                  className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                                                >
                                                  <ClipboardList size={12} />
                                                  View
                                                </Link>
                                              ) : (
                                                <span className="inline-flex rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                  Pending
                                                </span>
                                              )}
                                            </div>
                                            <div>
                                              {/* 2026-09-14 (Shailesh): "pending row
                                                  should get the delete option as
                                                  well ... present everywhere" --
                                                  works on both a pending and a
                                                  submitted row, keyed by
                                                  levelPaperId either way. */}
                                              <button
                                                type="button"
                                                title="Delete this practice paper"
                                                aria-label="Delete this practice paper"
                                                disabled={DeletePracticeAttemptMutation.isPending}
                                                onClick={() => {
                                                  if (
                                                    window.confirm(
                                                      `Delete "${Paper.paperLabel}"? This removes the paper${Paper.attemptId ? ", its attempt, and its result" : ""} entirely. This can't be undone.`
                                                    )
                                                  ) {
                                                    DeletePracticeAttemptMutation.mutate(Paper.levelPaperId);
                                                  }
                                                }}
                                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:text-rose-300"
                                              >
                                                <Trash2 size={13} />
                                              </button>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                    </>
                                    ) : null}
                                  </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-5">
                    <EmptyState title="No practice activity yet" description="Practice papers appear here as soon as a student is assigned some." />
                  </div>
                )}
              </div>
            )}

            {PracticeSubTab === "REPORTS" && (
              <div className="space-y-6">
                <div className="math-card p-3">
                  <div className="flex flex-wrap gap-3">
                    {PracticeReportsSubTabList.map((Tab) => (
                      <button
                        key={Tab}
                        type="button"
                        onClick={() => SetPracticeReportsSubTab(Tab)}
                        aria-selected={PracticeReportsSubTab === Tab}
                        className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${PracticeReportsSubTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
                      >
                        {Tab === "STUDENT" ? "Individual Student" : Tab === "LEVEL" ? "Individual Level" : "Visualization"}
                      </button>
                    ))}
                  </div>
                </div>

                {PracticeReportsSubTab === "STUDENT" && (
                  <div className="math-card p-5">
                    <SectionTitle
                      icon={<Sparkles size={14} />}
                      kicker="Practice Reports"
                      title="Individual Student Analytics"
                      description="Every student who has any practice activity, shown below as a list -- narrow who's shown by level and (teacher-wise) by teacher, search by name or code, then click a student to open their full analytics."
                    />

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                        <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                        <input
                          value={ReportsStudentSearchText}
                          onChange={(EventValue) => SetReportsStudentSearchText(EventValue.target.value)}
                          placeholder="Search student name or code"
                          className="w-full bg-transparent outline-none placeholder:text-slate-400"
                        />
                      </label>
                      {/* Narrows WHICH STUDENT BLOCKS are shown below (server-
                          side, same as the Results tab's own level filter) --
                          "ALL" (the default) shows every student with any
                          practice activity. Wired the same way every other
                          level dropdown in this app is (ANNUAL_COMPETITION_
                          LEVEL_CODES + FormatCompetitionLevelLabel), so
                          Bloomers/Beginners and MM-1/MM-2 show their real
                          display names here too. Deliberately a bounded
                          width (2026-09-16, Shailesh -- "we do not need such
                          a large level filter") instead of this app's usual
                          full-width .math-input, so it sits inline with the
                          search bar instead of wrapping onto its own row. */}
                      <select
                        aria-label="Filter students by level"
                        value={ReportsBlockLevelFilter}
                        onChange={(EventValue) => SetReportsBlockLevelFilter(EventValue.target.value)}
                        className="math-input w-auto min-w-[150px]"
                      >
                        <option value="ALL">All Levels</option>
                        {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                          <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                        ))}
                      </select>
                      {/* Admin-only (2026-09-16, Shailesh -- "the admin can
                          see the students teacher wise as well"), same
                          bounded-width treatment, aligned with the level
                          filter. A teacher's own equivalent screen never
                          shows this -- they're already scoped to their own
                          roster. */}
                      <select
                        aria-label="Filter students by teacher"
                        value={ReportsTeacherFilter}
                        onChange={(EventValue) => SetReportsTeacherFilter(EventValue.target.value)}
                        className="math-input w-auto min-w-[170px]"
                      >
                        <option value="ALL">All Teachers</option>
                        {(TeachersQuery.data || []).map((TeacherRow) => (
                          <option key={TeacherRow.teacherId} value={TeacherRow.teacherId}>{TeacherRow.teacherName}</option>
                        ))}
                      </select>
                    </div>

                    {ReportsRosterQuery.isLoading ? (
                      <div className="mt-5"><LoadingState label="Loading students..." /></div>
                    ) : ReportsFilteredStudentRows.length > 0 ? (
                      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                        {ReportsFilteredStudentRows.map((Row) => {
                          const IsOpenInModal = Row.studentId === ModalStudentRow?.studentId;
                          return (
                            <button
                              key={Row.studentId}
                              type="button"
                              onClick={() => SetModalStudentRow(Row)}
                              aria-pressed={IsOpenInModal}
                              className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-px ${
                                IsOpenInModal
                                  ? "border-[color:var(--mp-role-primary)] bg-[color:var(--mp-role-primary)]/10 dark:bg-[color:var(--mp-role-primary)]/20"
                                  : "border-[color:var(--mp-role-border)] bg-white hover:bg-slate-50 dark:bg-slate-950/40 dark:hover:bg-white/5"
                              }`}
                            >
                              <div className="truncate text-sm font-black text-slate-950 dark:text-white">
                                {Row.studentName || Row.studentCode || Row.studentId}
                              </div>
                              {Row.studentCode ? (
                                <div className="mt-1 text-xs font-black uppercase tracking-[0.1em] text-[color:var(--mp-role-primary)]">
                                  {Row.studentCode}
                                </div>
                              ) : null}
                              <div className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                                {Row.papers.length} paper{Row.papers.length === 1 ? "" : "s"}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-5">
                        <EmptyState title="No students found" description="No student has practice activity matching this search/level/teacher filter yet." />
                      </div>
                    )}
                  </div>
                )}

                {PracticeReportsSubTab === "LEVEL" && (
                  <div className="math-card p-5">
                    <SectionTitle
                      icon={<Medal size={14} />}
                      kicker="Practice Reports"
                      title="Individual Level Analytics"
                      description="Cohort-wide performance across every student who has practiced this level -- averages, the section the cohort finds hardest, and a per-student leaderboard sorted by accuracy, for a rough forecast of what to expect (and from whom) on the day of the official event."
                    />

                    {/* 2026-09-17 (Shailesh): level filter stays OUTSIDE/above
                        both sub-tabs below -- one shared ReportsLevelCode
                        state and one query, so changing it re-scopes whichever
                        sub-tab is active, never just one. */}
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <select
                        aria-label="Select level"
                        value={ReportsLevelCode}
                        onChange={(EventValue) => SetReportsLevelCode(EventValue.target.value)}
                        className="math-input w-auto min-w-[170px]"
                      >
                        {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                          <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                        ))}
                      </select>

                      <div className="flex flex-wrap gap-2">
                        {LevelReportSubTabList.map((Tab) => (
                          <button
                            key={Tab}
                            type="button"
                            onClick={() => SetLevelReportSubTab(Tab)}
                            aria-selected={LevelReportSubTab === Tab}
                            className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${LevelReportSubTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
                          >
                            {Tab === "SECTION" ? "Section Wise Analytics" : "Student Wise Analytics"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {PracticeReportLevelQuery.isLoading ? (
                      <div className="mt-5"><LoadingState label="Loading level report..." /></div>
                    ) : PracticeReportLevelQuery.data ? (
                      LevelReportSubTab === "SECTION" ? (
                        <LevelSectionWiseAnalyticsView Report={PracticeReportLevelQuery.data} />
                      ) : (
                        <LevelStudentWiseAnalyticsView Report={PracticeReportLevelQuery.data} />
                      )
                    ) : null}
                  </div>
                )}

                {PracticeReportsSubTab === "VISUALIZATION" && (
                  <div className="space-y-6">
                    {/* Redesign package (Shailesh, 2026-09-22 review round):
                        3 real sub-tabs -- Overview / Level Analysis / Student
                        Analysis -- instead of everything stacked on one page,
                        using the same pill-button convention as
                        PracticeReportsSubTabList itself just above. Each
                        scope below owns its own chart-type picker so the
                        admin chooses which chart/metric to look at instead
                        of seeing one fixed chart. */}
                    <div className="math-card p-3">
                      <div className="flex flex-wrap gap-3">
                        {VisualizationSubTabList.map((Tab) => (
                          <button
                            key={Tab}
                            type="button"
                            onClick={() => SetVisualizationSubTab(Tab)}
                            aria-selected={VisualizationSubTab === Tab}
                            className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${VisualizationSubTab === Tab ? "is-active math-admin-tab-force-selected" : ""}`}
                          >
                            {Tab === "OVERVIEW" ? "Overview" : Tab === "LEVEL" ? "Level Analysis" : "Student Analysis"}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Overview -- cross-level comparison, unconditional (no
                        filter needed, backed by the GetAnnualCompetitionPracticeReportOverview
                        endpoint -- see that function's own docstring for why
                        avgPercentage is rebased onto each level's own
                        canonical total so levels of different sizes are
                        fairly comparable here). Six chart/metric options to
                        choose from instead of one fixed chart. */}
                    {VisualizationSubTab === "OVERVIEW" && (
                      <div className="math-card p-5">
                        <SectionTitle
                          icon={<Sparkles size={14} />}
                          kicker="Analytics Visualization"
                          title="Overview"
                          description="Every level's average practice performance, side by side, so a weak spot across the whole platform is visible at a glance before drilling into any one level. Choose a metric below to change what's plotted."
                        />
                        <div className="mt-4 flex flex-wrap gap-2">
                          {OVERVIEW_CHART_OPTIONS.map((Option) => (
                            <button
                              key={Option.Key}
                              type="button"
                              onClick={() => SetVisualizationOverviewChartKey(Option.Key)}
                              aria-pressed={VisualizationOverviewChartKey === Option.Key}
                              className={`rounded-xl border px-3.5 py-2 text-xs font-black transition ${
                                VisualizationOverviewChartKey === Option.Key
                                  ? "border-[color:var(--mp-role-primary)] bg-[color:var(--mp-role-primary)]/10 text-[color:var(--mp-role-primary)] dark:bg-[color:var(--mp-role-primary)]/20"
                                  : "border-[color:var(--mp-role-border)] bg-white text-slate-700 hover:-translate-y-px hover:bg-slate-50 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:bg-white/5"
                              }`}
                            >
                              {Option.Label}
                            </button>
                          ))}
                        </div>
                        <div className="mt-5">
                          {VisualizationOverviewQuery.isLoading ? (
                            <LoadingState label="Loading overview..." />
                          ) : VisualizationOverviewQuery.data ? (
                            <OverviewChartPanel ChartKey={VisualizationOverviewChartKey} Rows={VisualizationOverviewQuery.data.byLevel} />
                          ) : null}
                        </div>
                      </div>
                    )}

                    {/* Level Analysis -- section difficulty, score spread,
                        time usage, completion depth/rate, and speed-vs-accuracy
                        for one level's whole cohort. Independent
                        VisualizationLevelCode state, same precedent as
                        Leaderboard's own separate level filter (see this
                        file's comment on LeaderboardLevelCode). Six chart
                        options to choose from. */}
                    {VisualizationSubTab === "LEVEL" && (
                      <div className="math-card p-5">
                        <SectionTitle
                          icon={<Medal size={14} />}
                          kicker="Analytics Visualization"
                          title="Level Analysis"
                          description="Which section this cohort finds hardest, how scores are spread across the roster, and whether students who spend longer are actually scoring higher. Pick a level, then choose a chart below."
                        />
                        <div className="mt-4 max-w-xs">
                          <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">Level</label>
                          <div className="relative">
                            <select
                              aria-label="Select level for Level Analysis"
                              value={VisualizationLevelCode}
                              onChange={(EventValue) => SetVisualizationLevelCode(EventValue.target.value)}
                              className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-[var(--mp-role-primary)] focus:outline-none"
                            >
                              {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                                <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                              ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {LEVEL_CHART_OPTIONS.map((Option) => (
                            <button
                              key={Option.Key}
                              type="button"
                              onClick={() => SetVisualizationLevelChartKey(Option.Key)}
                              aria-pressed={VisualizationLevelChartKey === Option.Key}
                              className={`rounded-xl border px-3.5 py-2 text-xs font-black transition ${
                                VisualizationLevelChartKey === Option.Key
                                  ? "border-[color:var(--mp-role-primary)] bg-[color:var(--mp-role-primary)]/10 text-[color:var(--mp-role-primary)] dark:bg-[color:var(--mp-role-primary)]/20"
                                  : "border-[color:var(--mp-role-border)] bg-white text-slate-700 hover:-translate-y-px hover:bg-slate-50 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:bg-white/5"
                              }`}
                            >
                              {Option.Label}
                            </button>
                          ))}
                        </div>

                        <div className="mt-5">
                          {VisualizationLevelReportQuery.isLoading ? (
                            <LoadingState label="Loading level analysis..." />
                          ) : VisualizationLevelReportQuery.data ? (
                            <LevelChartPanel ChartKey={VisualizationLevelChartKey} Report={VisualizationLevelReportQuery.data} />
                          ) : null}
                        </div>
                      </div>
                    )}

                    {/* Student Analysis -- one student's trend, time-per-attempt
                        trend, section strengths, and standing against their
                        level's cohort. The picker below reuses Individual
                        Student's own roster search UX (Search icon input +
                        level filter), scoped to VisualizationStudentLevelCode
                        -- narrowing by level here also fixes WHICH level's
                        report loads once a student is picked, since
                        perSection/trend are only meaningful within one
                        level's shared paper structure (see
                        GetAnnualCompetitionPracticeReportForStudent's own
                        docstring). Five chart options to choose from. */}
                    {VisualizationSubTab === "STUDENT" && (
                      <div className="math-card p-5">
                        <SectionTitle
                          icon={<ClipboardList size={14} />}
                          kicker="Analytics Visualization"
                          title="Student Analysis"
                          description="Pick a student and a level, then choose a chart below to see their score/accuracy trend, time-per-attempt trend, section-by-section strengths, or how they compare to their level's cohort average."
                        />

                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                            <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                            <input
                              value={VisualizationStudentSearchText}
                              onChange={(EventValue) => SetVisualizationStudentSearchText(EventValue.target.value)}
                              placeholder="Search student name or code"
                              className="w-full bg-transparent outline-none placeholder:text-slate-400"
                            />
                          </label>
                          <div className="w-auto min-w-[170px]">
                            <div className="relative">
                              <select
                                aria-label="Select level for Student Analysis"
                                value={VisualizationStudentLevelCode}
                                onChange={(EventValue) => {
                                  SetVisualizationStudentLevelCode(EventValue.target.value);
                                  SetVisualizationSelectedStudentId(null);
                                }}
                                className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-[var(--mp-role-primary)] focus:outline-none"
                              >
                                {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                                  <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                            </div>
                          </div>
                        </div>

                        <div className="mt-4">
                          {VisualizationRosterQuery.isLoading ? (
                            <LoadingState label="Loading students..." />
                          ) : VisualizationFilteredStudentRows.length > 0 ? (
                            <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto rounded-2xl border border-[color:var(--mp-role-border)] bg-white/60 p-3 dark:bg-slate-950/30">
                              {VisualizationFilteredStudentRows.map((Row) => {
                                const IsSelected = Row.studentId === VisualizationSelectedStudentId;
                                return (
                                  <button
                                    key={Row.studentId}
                                    type="button"
                                    onClick={() => SetVisualizationSelectedStudentId(Row.studentId)}
                                    aria-pressed={IsSelected}
                                    className={`rounded-xl border px-3 py-2 text-left text-xs font-black transition ${
                                      IsSelected
                                        ? "border-[color:var(--mp-role-primary)] bg-[color:var(--mp-role-primary)]/10 text-[color:var(--mp-role-primary)] dark:bg-[color:var(--mp-role-primary)]/20"
                                        : "border-[color:var(--mp-role-border)] bg-white text-slate-700 hover:-translate-y-px hover:bg-slate-50 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:bg-white/5"
                                    }`}
                                  >
                                    {Row.studentName || Row.studentCode || Row.studentId}
                                    {Row.studentCode ? <span className="ml-1.5 opacity-60">{Row.studentCode}</span> : null}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <EmptyState title="No students found" description="No student has practice activity at this level matching your search yet." />
                          )}
                        </div>

                        {VisualizationSelectedStudentId && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {STUDENT_CHART_OPTIONS.map((Option) => (
                              <button
                                key={Option.Key}
                                type="button"
                                onClick={() => SetVisualizationStudentChartKey(Option.Key)}
                                aria-pressed={VisualizationStudentChartKey === Option.Key}
                                className={`rounded-xl border px-3.5 py-2 text-xs font-black transition ${
                                  VisualizationStudentChartKey === Option.Key
                                    ? "border-[color:var(--mp-role-primary)] bg-[color:var(--mp-role-primary)]/10 text-[color:var(--mp-role-primary)] dark:bg-[color:var(--mp-role-primary)]/20"
                                    : "border-[color:var(--mp-role-border)] bg-white text-slate-700 hover:-translate-y-px hover:bg-slate-50 dark:bg-slate-950/40 dark:text-slate-200 dark:hover:bg-white/5"
                                }`}
                              >
                                {Option.Label}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="mt-5">
                          {!VisualizationSelectedStudentId ? (
                            <EmptyState title="Pick a student above" description="Select a student to see their trend, section strengths, and cohort comparison." />
                          ) : VisualizationStudentReportQuery.isLoading ? (
                            <LoadingState label="Loading student analysis..." />
                          ) : VisualizationStudentReportQuery.data ? (
                            <StudentChartPanel ChartKey={VisualizationStudentChartKey} Report={VisualizationStudentReportQuery.data} />
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {PracticeSubTab === "LEADERBOARD" && (
              <div className="math-card p-5">
                <SectionTitle
                  icon={<Trophy size={14} />}
                  kicker="Leaderboard"
                  title="Practice Leaderboard"
                  description="Level-wise rankings across every student's Annual Competition practice papers at this level -- highest average score first, average time taken as tiebreak. Practice only, never mixed with the official event's own ranked results."
                />

                {/* 2026-09-22 (Shailesh, round 2 -- widening min-w alone
                    didn't fix it): the real cause was this select relying on
                    the browser's OWN native dropdown-arrow rendering, which
                    (confirmed against a live Windows screenshot) crowds long
                    text against the arrow regardless of width -- this is
                    exactly the failure mode this codebase's OTHER leaderboard
                    filters (student/teacher DPS leaderboard, student/teacher
                    mock leaderboard -- all four use this identical recipe)
                    already avoid with appearance-none + a custom, absolutely-
                    positioned ChevronDown + explicit pr-10. Matched here
                    verbatim rather than reinvented, so this filter finally
                    renders the same way every other leaderboard's filter on
                    this platform already does. */}
                <div className="mt-4 max-w-xs">
                  <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">Level</label>
                  <div className="relative">
                    <select
                      aria-label="Select level for the leaderboard"
                      value={LeaderboardLevelCode}
                      onChange={(EventValue) => SetLeaderboardLevelCode(EventValue.target.value)}
                      className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-[var(--mp-role-primary)] focus:outline-none"
                    >
                      {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                        <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                <div className="mt-5">
                  {PracticeLeaderboardQuery.isLoading ? (
                    <LoadingState label="Loading leaderboard..." />
                  ) : PracticeLeaderboardQuery.data ? (
                    <PracticeLeaderboardPodium
                      Summary={PracticeLeaderboardQuery.data.summary}
                      Rows={PracticeLeaderboardQuery.data.perStudent}
                      EmptyDescription="No student has completed a practice paper at this level yet -- the leaderboard fills in as soon as the first paper is submitted."
                    />
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </section>
      {ModalStudentRow ? (
        <StudentAnalyticsModal Row={ModalStudentRow} OnClose={() => SetModalStudentRow(null)} />
      ) : null}
    </AppShell>
  );
}
