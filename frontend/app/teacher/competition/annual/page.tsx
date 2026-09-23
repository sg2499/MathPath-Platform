"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { ANNUAL_COMPETITION_LEVEL_CODES, FormatCompetitionLevelLabel } from "@/lib/api/admin";
import { GroupPracticePapersByLevel } from "@/lib/annualCompetitionPracticeGrouping";
import { PracticeLeaderboardPodium } from "@/components/common/PracticeLeaderboardPodium";
import {
  getTeacherAnnualCompetitionEvents,
  getTeacherAnnualCompetitionLive,
  getTeacherAnnualCompetitionPracticeReportForLevel,
  getTeacherAnnualCompetitionPracticeReportForStudent,
  getTeacherAnnualCompetitionPracticeResults,
  getTeacherAnnualCompetitionResults,
  type TeacherAnnualCompetitionLiveRow,
  type TeacherAnnualCompetitionPracticeReportForLevel,
  type TeacherAnnualCompetitionPracticeReportForStudent,
  type TeacherAnnualCompetitionPracticeReportSectionRow,
  type TeacherAnnualCompetitionPracticeRosterStudent,
  type TeacherAnnualCompetitionResultRow,
} from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarClock, ChevronDown, ChevronRight, Eye, Flame, Medal, Repeat, RefreshCcw, Search, Sparkles, Trophy, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

// Read-only by design -- Teacher: monitor/review only, no assign/rank/
// release path exists here (pkg-07 checklist item 3, same convention as
// this repo's existing Competition Mock Tracker for teachers).

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

// Practice Reports feature, package 4 (Shailesh, 2026-09-16): small display
// helpers + presentational components for the new Individual Student /
// Individual Level views below -- deliberately a separate, parallel copy of
// the admin page's own equivalents (admin/competition/annual-studio/page.tsx)
// rather than a shared cross-role component, matching this whole feature's
// existing convention of independent, role-scoped page code (see e.g. the
// Practice results block just below, which is its own copy too, not shared
// with admin's).

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
// instead) and its dedicated Section Wise Analytics tab.
//
// 2026-09-16 (Shailesh, Practice Reports UI redesign): "you had mentioned
// about the toughest section or something like but i do not see that
// anywhere" -- real now: the section with the lowest avg accuracy (among
// sections that actually have attempts) gets a highlighted row + badge.
// Mirrors the admin page's own identical addition (admin/competition/
// annual-studio/page.tsx) field for field.
function SectionBreakdownTable({ Rows }: { Rows: TeacherAnnualCompetitionPracticeReportSectionRow[] }) {
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

// The per-student Practice Report view, split into two dedicated modal
// tabs (2026-09-16, Shailesh -- "have 2 sub tabs ... one would be the
// overall stats and the other would be section wise stats"): Overall
// Analytics (this component) keeps the original blended-"All Levels"-vs-
// one-level behavior including trend history and cohort comparison, but no
// longer renders the section table -- that's StudentSectionWiseAnalyticsView's
// job below, exclusively. Read-only, like everything else on this teacher
// page -- the "View" action routes into the same
// /teacher/competition/annual-result/[attemptId] page the Practice Results
// tab's own View buttons already use.
function StudentOverallAnalyticsView({
  Report,
  OnViewAttempt,
}: {
  Report: TeacherAnnualCompetitionPracticeReportForStudent;
  OnViewAttempt: (AttemptId: string) => void;
}) {
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
                      <button
                        type="button"
                        onClick={() => OnViewAttempt(Row.attemptId)}
                        className="inline-flex items-center gap-1 rounded-full border border-[color:var(--mp-role-border)] px-3 py-1 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:bg-slate-50 dark:hover:bg-white/10"
                      >
                        <Eye size={13} /> View
                      </button>
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
// "All Levels" mode -- section identity/count differs per level's paper).
// A compact, level-scoped stat strip for context, then the shared section
// table (with the Toughest Section highlight) exclusively -- the trend/
// cohort detail lives in Overall Analytics instead, not duplicated here.
// Mirrors the admin page's identical component field for field.
function StudentSectionWiseAnalyticsView({ Report }: { Report: TeacherAnnualCompetitionPracticeReportForStudent }) {
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
// assignment order, so the last entry is the most recent one -- zero extra
// fetch. Mirrors the admin page's identical helper.
function DefaultSectionLevelForRow(Row: TeacherAnnualCompetitionPracticeRosterStudent): string {
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
// click, or Esc. Mirrors the admin page's identical modal, plus an
// OnViewAttempt prop since this page routes via next/navigation's Router
// (module-scope components can't reach the page's own Router closure)
// rather than admin's plain <Link>.
function StudentAnalyticsModal({
  Row,
  OnClose,
  OnViewAttempt,
}: {
  Row: TeacherAnnualCompetitionPracticeRosterStudent;
  OnClose: () => void;
  OnViewAttempt: (AttemptId: string) => void;
}) {
  const [ActiveTab, SetActiveTab] = useState<StudentModalTabKey>("OVERALL");
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
    queryKey: ["teacher", "annual-competition", "practice-report-student-modal", Row.studentId, ActiveLevelParam ?? "ALL"],
    queryFn: () => getTeacherAnnualCompetitionPracticeReportForStudent(Row.studentId, ActiveLevelParam),
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
              <StudentOverallAnalyticsView Report={ReportQuery.data} OnViewAttempt={OnViewAttempt} />
            ) : (
              <StudentSectionWiseAnalyticsView Report={ReportQuery.data} />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

// The per-level (cohort) Practice Report view -- roster-scoped to this
// teacher's own students server-side (StudentIdsFilter, see
// getTeacherAnnualCompetitionPracticeReportForLevel's own comment). Split
// into two dedicated sub-tabs (2026-09-17, Shailesh -- "we need to have 2
// sub tabs , one would be Section Wise Analytics ... second sub tab would
// be Student Wise Analytics ... right now both of them are shown in one tab
// which makes it look very clumsy and chaotic"): each tab keeps its own
// copy of the summary stat-card row at top, mirroring the same pattern the
// student analytics modal's Overall/Section tabs already use. The level
// filter itself lives one level up, outside both tabs.
function LevelSectionWiseAnalyticsView({ Report }: { Report: TeacherAnnualCompetitionPracticeReportForLevel }) {
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
        <EmptyState title="No section data yet" description="No student of yours has completed a practice paper at this level yet." />
      )}
    </div>
  );
}

function LevelStudentWiseAnalyticsView({ Report }: { Report: TeacherAnnualCompetitionPracticeReportForLevel }) {
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
        <EmptyState title="No practice activity yet" description="No student of yours has completed a practice paper at this level yet." />
      )}
    </div>
  );
}

const LiveStatusTone: Record<TeacherAnnualCompetitionLiveRow["liveStatus"], string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
  STUCK: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  SUBMITTED: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  FINALIZED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
};

function LiveStatusChip({ status }: { status: TeacherAnnualCompetitionLiveRow["liveStatus"] }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${LiveStatusTone[status]}`}>{status.replace("_", " ")}</span>;
}

// 2026-09-14 (Shailesh, Official/Practice restructure): "it should also
// have the proper separation that is it should have 2 tabs just like the
// student login which will say official and practice. under the official
// tab it should have the sub tabs Live Status and Results ... and the
// second sub tab should be Practice under which the teacher should see the
// same grouped student table." Mirrors the student page's top-level
// Official/Practice split (app/student/competition/annual/page.tsx) exactly
// -- same plain-text .math-role-tab convention, no icons -- with LIVE/
// RESULTS demoted to sub-tabs of Official (unchanged content, just nested
// one level down) and PRACTICE promoted to its own top-level tab instead of
// sitting flat alongside them.
//
// Practice results are always a separately-scoped surface, never mixed
// into the OFFICIAL Results tab (see ListAnnualCompetitionPracticeResultsForRoster's
// own docstring on the backend, and Phase B's original "practice results
// get their own, separately-scoped admin surface" comment this whole
// feature has followed on the admin and student sides alike). It is fully
// independent of SelectedEventId/Events -- practice is never scoped to any
// event, so this tab works even before Admin has created a single OFFICIAL
// event, and its own level-code filter is gated on nothing but the tab
// being active.
const TopTabList = ["OFFICIAL", "PRACTICE"] as const;
type TopTabKey = (typeof TopTabList)[number];

const OfficialSubTabList = ["LIVE", "RESULTS"] as const;
type OfficialSubTabKey = (typeof OfficialSubTabList)[number];

// Practice Reports feature, package 4 (Shailesh, 2026-09-16): "do not change
// anything here just place this under the Practice Results sub tab and the
// new Practice Reports sub tab with the new 2 sub tabs for the individual
// student and individual level analytics." Mirrors the admin page's own
// PracticeSubTabList/PracticeReportsSubTabList exactly (admin/competition/
// annual-studio/page.tsx) -- Teacher just has two sub-tabs (no Bank, that
// stays Admin-only) instead of three.
// 2026-09-18 (Shailesh, Practice Leaderboard feature): "3rd tab for teacher
// which is gonna be leaderboard." Same reasoning as admin's own 4th tab --
// see that page's identical comment.
const PracticeSubTabList = ["RESULTS", "REPORTS", "LEADERBOARD"] as const;
type PracticeSubTabKey = (typeof PracticeSubTabList)[number];

const PracticeReportsSubTabList = ["STUDENT", "LEVEL"] as const;
type PracticeReportsSubTabKey = (typeof PracticeReportsSubTabList)[number];

// 2026-09-17 (Shailesh): Individual Level's own two further sub-tabs --
// see LevelSectionWiseAnalyticsView/LevelStudentWiseAnalyticsView above.
const LevelReportSubTabList = ["SECTION", "STUDENT"] as const;
type LevelReportSubTabKey = (typeof LevelReportSubTabList)[number];

export default function TeacherAnnualCompetitionMonitorPage() {
  return (
    <Suspense fallback={null}>
      <TeacherAnnualCompetitionMonitorPageContent />
    </Suspense>
  );
}

function TeacherAnnualCompetitionMonitorPageContent() {
  const Ready = useProtectedPage(["TEACHER"]);
  const Router = useRouter();
  // 2026-09-15 (Shailesh): "the teacher should see the pending list of
  // papers in their login under the practice tab" -- notifications land
  // here as /teacher/competition/annual?tab=PRACTICE&studentCode=... (built
  // client-side in NotificationsBell.tsx) -- read once on mount to
  // pre-select Practice and, once the roster has loaded, auto-expand the
  // notified student's row.
  const SearchParams = useSearchParams();
  const DeepLinkTab = SearchParams.get("tab");
  const DeepLinkStudentCode = SearchParams.get("studentCode");
  // 2026-09-15 (Shailesh): "on clicking it, it should take them to the
  // correct page with the student's level block expanded for whichever
  // level the notification was assigned" -- the notification's deep link
  // already carries levelCode (AppendDeepLinkParams in NotificationsBell.tsx
  // appends it from the notification's own metadata), so read it the same
  // way as DeepLinkStudentCode and auto-expand the matching level group
  // once the student row itself has been matched, below.
  const DeepLinkLevelCode = SearchParams.get("levelCode");
  const DeepLinkStudentAppliedRef = useRef(false);

  const [SelectedEventId, SetSelectedEventId] = useState<string>("");
  const [TopTab, SetTopTab] = useState<TopTabKey>(DeepLinkTab === "PRACTICE" ? "PRACTICE" : "OFFICIAL");
  const [ActiveTab, SetActiveTab] = useState<OfficialSubTabKey>("LIVE");
  const [PracticeLevelFilter, SetPracticeLevelFilter] = useState<string>("ALL");
  const [PracticeSearchText, SetPracticeSearchText] = useState("");
  const [ExpandedPracticeStudents, SetExpandedPracticeStudents] = useState<Set<string>>(new Set());
  // 2026-09-15 (Shailesh): "the individual student block must contain the
  // different level blocks under it which should be expandable and
  // collapseable and by default collapsed" -- same fix as the admin
  // Practice Results tab, see that page's own comment. Keyed by
  // `${studentId}::${levelCode}` so one student's expanded level never
  // leaks into another's.
  const [ExpandedPracticeLevelGroups, SetExpandedPracticeLevelGroups] = useState<Set<string>>(new Set());

  // Practice Reports feature, package 4 (Shailesh, 2026-09-16). Defaults to
  // RESULTS so the existing Practice content (unchanged below) and the
  // notification deep-link behavior both keep working exactly as before --
  // the deep-link only ever needed TopTab === "PRACTICE", and that still
  // lands a teacher on the same Results view they always saw.
  const [PracticeSubTab, SetPracticeSubTab] = useState<PracticeSubTabKey>("RESULTS");
  const [PracticeReportsSubTab, SetPracticeReportsSubTab] = useState<PracticeReportsSubTabKey>("STUDENT");
  const [ReportsStudentSearchText, SetReportsStudentSearchText] = useState("");
  // "ALL" = every one of the teacher's own students with any practice
  // activity, across every level -- narrows WHICH STUDENT BLOCKS are shown
  // (block-list redesign, 2026-09-16 per Shailesh's own follow-up).
  const [ReportsBlockLevelFilter, SetReportsBlockLevelFilter] = useState<string>("ALL");
  const [ReportsLevelCode, SetReportsLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  // 2026-09-17 (Shailesh): which of Individual Level's own two sub-tabs is
  // active -- the level filter above stays shared/outside both (single
  // ReportsLevelCode state, single query), only the displayed table+its own
  // stat-card row switches.
  const [LevelReportSubTab, SetLevelReportSubTab] = useState<LevelReportSubTabKey>("SECTION");
  // The student the analytics modal is open for -- null when closed. See
  // StudentAnalyticsModal's own comment (2026-09-16 redesign: "a seperate
  // window popping up when a student is clicked upon"). No teacher filter
  // here, unlike admin's equivalent -- a teacher is already scoped to their
  // own roster on every one of these endpoints.
  const [ModalStudentRow, SetModalStudentRow] = useState<TeacherAnnualCompetitionPracticeRosterStudent | null>(null);

  const EventsQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "events"],
    queryFn: getTeacherAnnualCompetitionEvents,
    enabled: Ready,
  });
  const Events = EventsQuery.data || [];

  useEffect(() => {
    if (!SelectedEventId && Events.length > 0) {
      SetSelectedEventId(Events[0].eventId);
    }
  }, [Events, SelectedEventId]);

  const LiveQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "live", SelectedEventId],
    queryFn: () => getTeacherAnnualCompetitionLive(SelectedEventId),
    enabled: Ready && Boolean(SelectedEventId) && TopTab === "OFFICIAL" && ActiveTab === "LIVE",
    refetchInterval: TopTab === "OFFICIAL" && ActiveTab === "LIVE" ? 15000 : false,
  });

  const ResultsQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "results", SelectedEventId],
    queryFn: () => getTeacherAnnualCompetitionResults(SelectedEventId),
    enabled: Ready && Boolean(SelectedEventId) && TopTab === "OFFICIAL" && ActiveTab === "RESULTS",
  });

  // Fully independent of SelectedEventId/Events -- practice is never scoped
  // to any event, so this tab works even before Admin has created a single
  // OFFICIAL event.
  const PracticeQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "practice-results", PracticeLevelFilter],
    queryFn: () => getTeacherAnnualCompetitionPracticeResults(PracticeLevelFilter === "ALL" ? undefined : PracticeLevelFilter),
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "RESULTS",
  });

  // ---------------------------------------------------------------------
  // Practice -- Reports (package 4, Shailesh, 2026-09-16). Same two inner
  // views as Admin's Practice Reports tab (admin/competition/annual-studio/
  // page.tsx): per-student (level filter OPTIONAL) and per-level (level
  // REQUIRED). A teacher only ever sees their own roster here -- both
  // endpoints scope server-side via own_students_query/StudentIdsFilter, see
  // getTeacherAnnualCompetitionPracticeReportForStudent/ForLevel's own
  // comments in lib/api/teacher.ts.
  //
  // The Reports Student picker deliberately uses its OWN roster query below
  // rather than reusing PracticeQuery above -- PracticeQuery is coupled to
  // PracticeLevelFilter (the Results tab's own filter), and reusing it here
  // would silently narrow the Reports student picker to whatever level
  // filter happens to be active on the Results tab, which has nothing to do
  // with which student the teacher wants to look up in Reports.
  // ---------------------------------------------------------------------

  const ReportsRosterQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "practice-reports-roster", ReportsBlockLevelFilter],
    queryFn: () =>
      getTeacherAnnualCompetitionPracticeResults(ReportsBlockLevelFilter === "ALL" ? undefined : ReportsBlockLevelFilter),
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "STUDENT",
  });
  const ReportsRosterStudents = ReportsRosterQuery.data?.students || [];

  const ReportsStudentSearchLower = ReportsStudentSearchText.trim().toLowerCase();
  const ReportsFilteredStudentRows = ReportsRosterStudents.filter((Row) => {
    if (!ReportsStudentSearchLower) return true;
    const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
    return Haystack.includes(ReportsStudentSearchLower);
  });

  const PracticeReportLevelQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "practice-report-level", ReportsLevelCode],
    queryFn: () => getTeacherAnnualCompetitionPracticeReportForLevel(ReportsLevelCode),
    enabled:
      Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "LEVEL" && Boolean(ReportsLevelCode),
  });

  // 2026-09-18 (Shailesh, Practice Leaderboard feature) -- see the identical
  // block on the admin page (admin/competition/annual-studio/page.tsx) for
  // the full reasoning. Automatically scoped to this teacher's own roster
  // server-side (getTeacherAnnualCompetitionPracticeReportForLevel already
  // is, same as every other teacher Practice Reports call in this file).
  const [LeaderboardLevelCode, SetLeaderboardLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);
  const PracticeLeaderboardQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "practice-leaderboard-level", LeaderboardLevelCode],
    queryFn: () => getTeacherAnnualCompetitionPracticeReportForLevel(LeaderboardLevelCode),
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "LEADERBOARD" && Boolean(LeaderboardLevelCode),
  });

  // 2026-09-14 (Shailesh): same student-grouped view as the admin Practice
  // Results tab (admin/competition/annual-studio/page.tsx) -- "the teacher
  // should see the same grouped student table with all their practice
  // attempts in one place along with the search bar and module-level
  // filters." Level filtering happens server-side (PracticeLevelFilter,
  // above); search is client-side across the already-fetched page, same as
  // admin's. The backend now does the student-grouping itself
  // (ListAnnualCompetitionPracticeResultsForRoster returns students[].
  // papers[] directly, every paper ascending by paperOrdinal, pending AND
  // submitted together) -- no client-side re-grouping needed anymore.
  const GroupedPracticeResults = (() => {
    const Term = PracticeSearchText.trim().toLowerCase();
    const Students = PracticeQuery.data?.students || [];
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
  // against. Applied at most once per page load so it never fights a
  // student the teacher has since manually collapsed.
  //
  // 2026-09-15 (Shailesh): "on clicking it, it should take them to the
  // correct page with the student's level block expanded for whichever
  // level the notification was assigned" -- once the student row is
  // matched, also expand the specific level group the notification named
  // (DeepLinkLevelCode), using the exact same `${studentId}::${levelCode}`
  // key the level-group toggle/render below already uses. Gated behind the
  // same DeepLinkStudentAppliedRef as the student-row expansion so it only
  // ever applies once per page load, same reasoning as above.
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

  if (!Ready) return null;

  return (
    <AppShell title="Annual Competition Monitor">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-block-header"><Trophy size={14} />Annual Competition</p>
          <h1 className="math-title">Annual Competition Monitor</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
            Monitor your students during the event and review their results once released. Review only -- assigning
            students, scheduling slots, and releasing results all stay Admin-controlled.
          </p>
        </div>

        {/* Top-level Official/Practice split -- mirrors the student page's
            own .math-role-tab convention exactly (plain text, no icon). */}
        <div className="math-card p-2">
          <div className="flex flex-wrap gap-2">
            {TopTabList.map((Tab) => (
              <button
                key={Tab}
                type="button"
                onClick={() => SetTopTab(Tab)}
                aria-selected={TopTab === Tab}
                className={TopTab === Tab ? "math-role-tab math-role-tab-active" : "math-role-tab"}
              >
                {Tab === "OFFICIAL" ? "Official" : "Practice"}
              </button>
            ))}
          </div>
        </div>

        <div className="math-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            {TopTab === "PRACTICE" && PracticeSubTab === "RESULTS" ? (
              <div className="flex flex-wrap items-end gap-3">
                {/* 2026-09-23 (Shailesh): "the search bar and level filters
                    do not follow the conventions ... they need to be
                    aligned in a single line perfectly as in other places
                    and also the level filter needs to be of the standard
                    size instead of a full block." Same min-w-[220px]
                    flex-1 search / w-auto min-w-[150px] select pattern
                    already used by this page's own Individual Student
                    Analytics filter below, applied here for the first
                    time -- .math-select/.math-input default to w-full
                    (globals.css) which is right for a form field but wrong
                    for an inline filter, hence the per-instance override. */}
                <label className="flex min-w-[220px] flex-1 items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                  <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                  <input
                    value={PracticeSearchText}
                    onChange={(EventValue) => SetPracticeSearchText(EventValue.target.value)}
                    placeholder="Search student name or code"
                    className="w-full bg-transparent outline-none placeholder:text-slate-400"
                  />
                </label>
                {/* 2026-09-14 (Shailesh): "pls remove the level filter text
                    from top of the level filter dropdown as it is self
                    explanatory" -- select kept, "Level" label text dropped
                    (aria-label preserves accessibility). */}
                <select
                  aria-label="Filter by level"
                  value={PracticeLevelFilter}
                  onChange={(EventValue) => SetPracticeLevelFilter(EventValue.target.value)}
                  className="math-input w-auto min-w-[150px]"
                >
                  <option value="ALL">All Levels</option>
                  {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                    <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                  ))}
                </select>
              </div>
            ) : TopTab === "OFFICIAL" && Events.length > 0 ? (
              <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                Event
                <select value={SelectedEventId} onChange={(EventValue) => SetSelectedEventId(EventValue.target.value)} className="math-input min-w-[280px]">
                  {Events.map((EventItem) => (
                    <option key={EventItem.eventId} value={EventItem.eventId}>
                      {EventItem.name} -- {FormatEventDate(EventItem.competitionDate)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span />
            )}
            {TopTab === "OFFICIAL" ? (
              <div className="flex flex-wrap gap-3">
                {OfficialSubTabList.map((Tab) => (
                  <button
                    key={Tab}
                    type="button"
                    onClick={() => SetActiveTab(Tab)}
                    aria-selected={ActiveTab === Tab}
                    className={`math-role-tab-button rounded-2xl px-4 py-2 text-sm font-black transition ${ActiveTab === Tab ? "is-active" : ""}`}
                  >
                    {Tab === "LIVE" ? "Live Status" : "Results"}
                  </button>
                ))}
              </div>
            ) : TopTab === "PRACTICE" ? (
              // Practice Reports feature, package 4 (Shailesh, 2026-09-16):
              // mirrors the OFFICIAL Live Status/Results sub-tab bar above,
              // one level down -- Results (the existing, unchanged practice
              // table) vs. Reports (the new Individual Student/Individual
              // Level analytics).
              <div className="flex flex-wrap gap-3">
                {PracticeSubTabList.map((Tab) => (
                  <button
                    key={Tab}
                    type="button"
                    onClick={() => SetPracticeSubTab(Tab)}
                    aria-selected={PracticeSubTab === Tab}
                    className={`math-role-tab-button rounded-2xl px-4 py-2 text-sm font-black transition ${PracticeSubTab === Tab ? "is-active" : ""}`}
                  >
                    {Tab === "RESULTS" ? "Practice Results" : Tab === "REPORTS" ? "Practice Reports" : "Leaderboard"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {TopTab === "OFFICIAL" && (ActiveTab === "LIVE" || ActiveTab === "RESULTS") && (
          EventsQuery.isLoading ? (
            <LoadingState label="Loading Annual Competition events..." />
          ) : EventsQuery.error ? (
            <ErrorState message={apiErrorMessage(EventsQuery.error)} />
          ) : Events.length === 0 ? (
            <div className="math-card p-6">
              <EmptyState title="No Annual Competition events yet" description="Once Admin schedules an event, it will appear here." />
            </div>
          ) : (
            <>
              {ActiveTab === "LIVE" && (
              <div className="math-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="math-block-header"><Activity size={14} />Live Status</p>
                  <button
                    type="button"
                    disabled={LiveQuery.isFetching}
                    onClick={() => LiveQuery.refetch()}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                  >
                    <RefreshCcw size={14} />
                    {LiveQuery.isFetching ? "Refreshing..." : "Refresh Now"}
                  </button>
                </div>

                {LiveQuery.data && (
                  <div className="mt-4 flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                    <span>{LiveQuery.data.summary.totalCount} total</span>
                    <span className="text-slate-500">{LiveQuery.data.summary.notStartedCount} not started</span>
                    <span className="text-blue-600 dark:text-blue-300">{LiveQuery.data.summary.inProgressCount} in progress</span>
                    <span className="text-rose-600 dark:text-rose-300">{LiveQuery.data.summary.stuckCount} stuck</span>
                    <span className="text-emerald-600 dark:text-emerald-300">{LiveQuery.data.summary.finalizedCount} finalized</span>
                  </div>
                )}

                {LiveQuery.isLoading ? (
                  <div className="mt-4"><LoadingState label="Loading live status..." /></div>
                ) : LiveQuery.error ? (
                  <div className="mt-4"><ErrorState message={apiErrorMessage(LiveQuery.error)} /></div>
                ) : LiveQuery.data && LiveQuery.data.rows.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-sm font-bold">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          <th className="px-2 py-1.5">Student</th>
                          <th className="px-2 py-1.5">Level</th>
                          <th className="px-2 py-1.5">Slot</th>
                          <th className="px-2 py-1.5">Status</th>
                          <th className="px-2 py-1.5">Section</th>
                          <th className="px-2 py-1.5">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LiveQuery.data.rows.map((Row: TeacherAnnualCompetitionLiveRow) => (
                          <tr key={Row.assignmentId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2">{FormatCompetitionLevelLabel(Row.assignedLevelCode)}</td>
                            <td className="px-2 py-2">{Row.slot?.slotLabel || Row.slot?.mode || "--"}</td>
                            <td className="px-2 py-2"><LiveStatusChip status={Row.liveStatus} /></td>
                            <td className="px-2 py-2">{Row.currentSectionNumber ?? "--"}</td>
                            <td className="px-2 py-2">{FormatSecondsAsMinSec(Row.remainingSecondsAtLastHeartbeat)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState title="No students of yours are assigned" description="Nothing to monitor for this event yet." />
                  </div>
                )}
              </div>
            )}

            {ActiveTab === "RESULTS" && (
              <div className="math-card p-5">
                <p className="math-block-header"><Medal size={14} />Results</p>
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  Kept hidden here too until Admin releases them -- exactly the same lock-down students and parents see.
                </p>

                {ResultsQuery.isLoading ? (
                  <div className="mt-4"><LoadingState label="Loading results..." /></div>
                ) : ResultsQuery.error ? (
                  <div className="mt-4"><ErrorState message={apiErrorMessage(ResultsQuery.error)} /></div>
                ) : ResultsQuery.data && ResultsQuery.data.rows.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-sm font-bold">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
                          <th className="px-2 py-1.5">Student</th>
                          <th className="px-2 py-1.5">Level</th>
                          <th className="px-2 py-1.5">Rank</th>
                          <th className="px-2 py-1.5">Accuracy</th>
                          <th className="px-2 py-1.5">Score</th>
                          <th className="px-2 py-1.5">Time Taken</th>
                          <th className="px-2 py-1.5">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ResultsQuery.data.rows.map((Row: TeacherAnnualCompetitionResultRow) => (
                          <tr key={Row.assignmentId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2">{FormatCompetitionLevelLabel(Row.assignedLevelCode)}</td>
                            {Row.released && Row.result ? (
                              <>
                                <td className="px-2 py-2">{Row.result.rank ?? "--"}</td>
                                <td className="px-2 py-2">{Row.result.accuracyPercentage}%</td>
                                <td className="px-2 py-2">{Row.result.score}/{Row.result.maxScore}</td>
                                <td className="px-2 py-2">{FormatSecondsAsMinSec(Row.result.timeTakenSeconds)}</td>
                                <td className="px-2 py-2">
                                  {Row.attemptId ? (
                                    <button
                                      type="button"
                                      onClick={() => Router.push(`/teacher/competition/annual-result/${Row.attemptId}`)}
                                      className="inline-flex items-center gap-1 rounded-full border border-[color:var(--mp-role-border)] px-3 py-1 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:bg-slate-50 dark:hover:bg-white/10"
                                    >
                                      <Eye size={13} /> View
                                    </button>
                                  ) : null}
                                </td>
                              </>
                            ) : (
                              <td className="px-2 py-2 text-slate-400" colSpan={5}>Not released yet</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState title="No students of yours are assigned" description="Nothing to review for this event yet." />
                  </div>
                )}
              </div>
            )}
            </>
          )
        )}

        {TopTab === "PRACTICE" && PracticeSubTab === "RESULTS" && (
              <div className="math-card p-5">
                <p className="math-block-header"><Repeat size={14} />Practice</p>
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  Every practice paper your students have completed -- not tied to any Annual Competition event, results
                  are visible to them the instant they're scored (no release gate, unlike Official). Not ranked --
                  practice papers are for building confidence and speed, never for competing against classmates.
                </p>

                {PracticeQuery.data ? (
                  <div className="mt-4 flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                    <span>{PracticeQuery.data.totalStudents} student{PracticeQuery.data.totalStudents === 1 ? "" : "s"}</span>
                    <span>
                      {PracticeQuery.data.students.reduce((Sum, StudentGroup) => Sum + StudentGroup.papers.length, 0)} total practice papers
                    </span>
                  </div>
                ) : null}

                {PracticeQuery.isLoading ? (
                  <div className="mt-4"><LoadingState label="Loading practice results..." /></div>
                ) : PracticeQuery.error ? (
                  <div className="mt-4"><ErrorState message={apiErrorMessage(PracticeQuery.error)} /></div>
                ) : GroupedPracticeResults.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {/* 2026-09-14 (Shailesh): "the teacher should see the same
                        grouped student table with all their practice attempts
                        in one place" -- same collapsible-by-student pattern as
                        the admin Practice Results tab
                        (admin/competition/annual-studio/page.tsx). Now also
                        carries a View action per completed paper (2026-09-14
                        batch, "have the view button for the teacher login for
                        both the flows") -- still read-only otherwise, no
                        assign/rank/release path exists here. */}
                    {GroupedPracticeResults.map((StudentGroup: TeacherAnnualCompetitionPracticeRosterStudent) => {
                      const StudentOpen = ExpandedPracticeStudents.has(StudentGroup.studentId);
                      const PendingCount = StudentGroup.papers.filter((Paper) => Paper.status === "NOT_STARTED").length;
                      return (
                        <div key={StudentGroup.studentId} className="overflow-hidden rounded-3xl border border-[color:var(--mp-role-border)] bg-white shadow-sm dark:bg-slate-950/35">
                          <button
                            type="button"
                            onClick={() => TogglePracticeStudentExpanded(StudentGroup.studentId)}
                            className="flex w-full flex-col gap-3 bg-slate-50/60 px-4 py-4 text-left transition hover:bg-slate-100/70 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5 dark:hover:bg-white/10"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--mp-role-border)] bg-white text-[color:var(--mp-role-primary)] shadow-sm dark:bg-slate-950/50">
                                {StudentOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                              </span>
                              <div className="min-w-0">
                                <h3 className="truncate text-base font-black text-slate-950 dark:text-white">
                                  {StudentGroup.studentName || StudentGroup.studentCode || StudentGroup.studentId}
                                </h3>
                                {StudentGroup.studentCode ? (
                                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[color:var(--mp-role-primary)]">{StudentGroup.studentCode}</p>
                                ) : null}
                              </div>
                            </div>
                            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                              {StudentGroup.papers.length} Paper{StudentGroup.papers.length === 1 ? "" : "s"}
                              {PendingCount > 0 ? ` (${PendingCount} pending)` : ""}
                            </span>
                          </button>

                          {StudentOpen ? (
                            <div className="border-t border-[color:var(--mp-role-border)] p-3">
                              {/* 2026-09-15 (Shailesh): "for the grouping of
                                  levels in the student blocks, lets do that
                                  for both teacher and admin login" -- one
                                  sub-table per level instead of every paper
                                  across every level mixed into one long
                                  flat list. Each level group is now its own
                                  expand/collapse toggle, collapsed by
                                  default -- same fix as the admin Practice
                                  Results tab, see that page's own comment. */}
                              <div className="space-y-3">
                                {GroupPracticePapersByLevel(StudentGroup.papers).map((LevelGroup) => {
                                  const LevelKey = `${StudentGroup.studentId}::${LevelGroup.LevelCode}`;
                                  const LevelOpen = ExpandedPracticeLevelGroups.has(LevelKey);
                                  const LevelPendingCount = LevelGroup.Papers.filter((Paper) => Paper.status === "NOT_STARTED").length;
                                  return (
                                  <div
                                    key={LevelGroup.LevelCode}
                                    className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)] bg-white shadow-sm dark:bg-slate-950/35"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => TogglePracticeLevelGroupExpanded(LevelKey)}
                                      className="flex w-full items-center justify-between gap-3 border-b border-[color:var(--mp-role-border)] bg-slate-50/80 px-5 py-2.5 text-left transition hover:bg-slate-100/80 dark:bg-white/5 dark:hover:bg-white/10"
                                    >
                                      <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-[color:var(--mp-role-primary)]">
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
                                    <div className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                                      <span>Paper Name</span>
                                      <span>Accuracy</span>
                                      <span>Score</span>
                                      <span>Time Taken</span>
                                      <span>Completed</span>
                                      <span>Action</span>
                                    </div>
                                    <div className="divide-y divide-slate-100 dark:divide-white/10">
                                      {LevelGroup.Papers.map((Paper) => {
                                        const IsPending = Paper.status === "NOT_STARTED" || !Paper.result;
                                        return (
                                          <div
                                            key={Paper.levelPaperId}
                                            className="grid grid-cols-[1.4fr_0.8fr_0.8fr_0.9fr_1fr_0.8fr] items-center gap-3 px-5 py-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50/50 dark:text-slate-100 dark:hover:bg-slate-800/40"
                                          >
                                            <div className="font-black text-slate-950 dark:text-white">{Paper.paperLabel}</div>
                                            <div>{IsPending ? "-" : `${Paper.result!.accuracyPercentage}%`}</div>
                                            <div>{IsPending ? "-" : `${Paper.result!.score}/${Paper.result!.maxScore}`}</div>
                                            <div>{IsPending ? "-" : FormatSecondsAsMinSec(Paper.result!.timeTakenSeconds)}</div>
                                            <div>{IsPending ? "Pending" : FormatEventDate(Paper.result!.computedAt)}</div>
                                            <div>
                                              {!IsPending && Paper.attemptId ? (
                                                <button
                                                  type="button"
                                                  onClick={() => Router.push(`/teacher/competition/annual-result/${Paper.attemptId}`)}
                                                  className="inline-flex items-center gap-1 rounded-full border border-[color:var(--mp-role-border)] px-3 py-1 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:bg-slate-50 dark:hover:bg-white/10"
                                                >
                                                  <Eye size={13} /> View
                                                </button>
                                              ) : null}
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
                  <div className="mt-4">
                    <EmptyState title="No practice activity yet" description="Practice results appear here automatically once a student finishes a practice paper." />
                  </div>
                )}
              </div>
        )}

        {TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && (
          <div className="space-y-6">
            <div className="math-card p-3">
              <div className="flex flex-wrap gap-3">
                {PracticeReportsSubTabList.map((Tab) => (
                  <button
                    key={Tab}
                    type="button"
                    onClick={() => SetPracticeReportsSubTab(Tab)}
                    aria-selected={PracticeReportsSubTab === Tab}
                    className={`math-role-tab-button rounded-2xl px-4 py-2 text-sm font-black transition ${PracticeReportsSubTab === Tab ? "is-active" : ""}`}
                  >
                    {Tab === "STUDENT" ? "Individual Student" : "Individual Level"}
                  </button>
                ))}
              </div>
            </div>

            {PracticeReportsSubTab === "STUDENT" && (
              <div className="math-card p-5">
                <p className="math-block-header"><Sparkles size={14} />Practice Reports</p>
                <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">Individual Student Analytics</h2>
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  Every one of your own students with any practice activity, shown below as a list -- narrow who&apos;s
                  shown by level, search by name or code, then click a student to open their full analytics.
                </p>

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
                      side, same as the Practice Results tab's own level
                      filter) -- "ALL" (the default) shows every one of this
                      teacher's own students with any practice activity.
                      Wired the same way every other level dropdown in this
                      app is (ANNUAL_COMPETITION_LEVEL_CODES + Format-
                      CompetitionLevelLabel), so Bloomers/Beginners and
                      MM-1/MM-2 show their real display names here too.
                      Deliberately a bounded width (2026-09-16, Shailesh --
                      "we do not need such a large level filter") instead of
                      this app's usual full-width .math-input, so it sits
                      inline with the search bar instead of wrapping onto
                      its own row. */}
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
                </div>

                {ReportsRosterQuery.isLoading ? (
                  <div className="mt-5"><LoadingState label="Loading students..." /></div>
                ) : ReportsRosterQuery.error ? (
                  <div className="mt-5"><ErrorState message={apiErrorMessage(ReportsRosterQuery.error)} /></div>
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
                    <EmptyState title="No students found" description="None of your students have practice activity matching this search/level filter yet." />
                  </div>
                )}
              </div>
            )}

            {PracticeReportsSubTab === "LEVEL" && (
              <div className="math-card p-5">
                <p className="math-block-header"><Medal size={14} />Practice Reports</p>
                <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">Individual Level Analytics</h2>
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  Cohort-wide performance across your own students who have practiced this level -- averages, the
                  section they find hardest, and a per-student leaderboard sorted by accuracy, for a rough forecast of
                  what to expect from your roster on the day of the official event.
                </p>

                {/* 2026-09-17 (Shailesh): level filter stays OUTSIDE/above
                    both sub-tabs below -- one shared ReportsLevelCode state
                    and one query, so changing it re-scopes whichever
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
                        className={`math-role-tab-button rounded-2xl px-4 py-2 text-sm font-black transition ${LevelReportSubTab === Tab ? "is-active" : ""}`}
                      >
                        {Tab === "SECTION" ? "Section Wise Analytics" : "Student Wise Analytics"}
                      </button>
                    ))}
                  </div>
                </div>

                {PracticeReportLevelQuery.isLoading ? (
                  <div className="mt-5"><LoadingState label="Loading level report..." /></div>
                ) : PracticeReportLevelQuery.error ? (
                  <div className="mt-5"><ErrorState message={apiErrorMessage(PracticeReportLevelQuery.error)} /></div>
                ) : PracticeReportLevelQuery.data ? (
                  LevelReportSubTab === "SECTION" ? (
                    <LevelSectionWiseAnalyticsView Report={PracticeReportLevelQuery.data} />
                  ) : (
                    <LevelStudentWiseAnalyticsView Report={PracticeReportLevelQuery.data} />
                  )
                ) : null}
              </div>
            )}
          </div>
        )}

        {TopTab === "PRACTICE" && PracticeSubTab === "LEADERBOARD" && (
          <div className="math-card p-5">
            <p className="math-block-header"><Trophy size={14} />Leaderboard</p>
            <h2 className="mt-1 text-lg font-black text-slate-950 dark:text-white">Practice Leaderboard</h2>
            <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
              Level-wise rankings across your own students&apos; Annual Competition practice papers at this level --
              highest average score first, average time taken as tiebreak. Practice only, never mixed with the
              official event&apos;s own ranked results.
            </p>

            {/* 2026-09-22 (Shailesh, round 2 -- widening min-w alone didn't
                fix it): the real cause was this select relying on the
                browser's OWN native dropdown-arrow rendering, which
                (confirmed against a live Windows screenshot) crowds long
                text against the arrow regardless of width -- this is exactly
                the failure mode this codebase's OTHER leaderboard filters
                (student/teacher DPS leaderboard, student/teacher mock
                leaderboard -- all four use this identical recipe) already
                avoid with appearance-none + a custom, absolutely-positioned
                ChevronDown + explicit pr-10. Matched here verbatim rather
                than reinvented, so this filter finally renders the same way
                every other leaderboard's filter on this platform already
                does. */}
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
              ) : PracticeLeaderboardQuery.isError ? (
                <ErrorState message={apiErrorMessage(PracticeLeaderboardQuery.error)} />
              ) : PracticeLeaderboardQuery.data ? (
                <PracticeLeaderboardPodium
                  Summary={PracticeLeaderboardQuery.data.summary}
                  Rows={PracticeLeaderboardQuery.data.perStudent}
                  EmptyDescription="None of your students have completed a practice paper at this level yet -- the leaderboard fills in as soon as the first paper is submitted."
                />
              ) : null}
            </div>
          </div>
        )}
      </section>
      {ModalStudentRow ? (
        <StudentAnalyticsModal
          Row={ModalStudentRow}
          OnClose={() => SetModalStudentRow(null)}
          OnViewAttempt={(AttemptId) => Router.push(`/teacher/competition/annual-result/${AttemptId}`)}
        />
      ) : null}
    </AppShell>
  );
}
