"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { ANNUAL_COMPETITION_LEVEL_CODES, FormatCompetitionLevelLabel } from "@/lib/api/admin";
import { GroupPracticePapersByLevel } from "@/lib/annualCompetitionPracticeGrouping";
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
import { Activity, CalendarClock, ChevronDown, ChevronRight, Eye, Medal, Repeat, RefreshCcw, Search, Sparkles, Trophy } from "lucide-react";
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
  return Value == null ? "-" : `${Value}%`;
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

// The per-section breakdown table -- shared by both the level-scoped
// Student report and the Level report below, same shape either way.
function SectionBreakdownTable({ Rows }: { Rows: TeacherAnnualCompetitionPracticeReportSectionRow[] }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
      <div className="grid grid-cols-[0.6fr_1fr_1fr_1fr_1fr_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
        <span>Section</span>
        <span>Avg Accuracy</span>
        <span>Avg Score</span>
        <span>Avg Attempted</span>
        <span>Avg Time Taken</span>
        <span>Time Limit</span>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-white/10">
        {Rows.map((Row) => (
          <div
            key={Row.sectionNumber}
            className="grid grid-cols-[0.6fr_1fr_1fr_1fr_1fr_1fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
          >
            <div className="font-black text-slate-950 dark:text-white">Section {Row.sectionNumber}</div>
            <div>{FormatPercent(Row.avgAccuracyPercentage)}</div>
            <div>{Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}</div>
            <div>{Row.avgAttemptedCount == null ? "-" : `${Row.avgAttemptedCount}/${Row.avgTotalQuestions ?? "-"}`}</div>
            <div>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)}</div>
            <div>{Row.timeLimitSeconds == null ? "-" : FormatSecondsAsMinSec(Row.timeLimitSeconds)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// The per-student Practice Report view -- summary cards always shown;
// everything below branches on whether a level filter is active
// (Report.competitionLevelCode set) or this is the blended "All Levels"
// view. Read-only, like everything else on this teacher page -- the "View"
// action routes into the same /teacher/competition/annual-result/[attemptId]
// page the Practice Results tab's own View buttons already use.
function StudentReportView({
  Report,
  OnViewAttempt,
}: {
  Report: TeacherAnnualCompetitionPracticeReportForStudent;
  OnViewAttempt: (AttemptId: string) => void;
}) {
  const Summary = Report.summary;
  return (
    <div className="mt-5 space-y-5">
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

          {Report.perSection.length > 0 ? <SectionBreakdownTable Rows={Report.perSection} /> : null}

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

// The per-level (cohort) Practice Report view -- roster-scoped to this
// teacher's own students server-side (StudentIdsFilter, see
// getTeacherAnnualCompetitionPracticeReportForLevel's own comment).
function LevelReportView({ Report }: { Report: TeacherAnnualCompetitionPracticeReportForLevel }) {
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

      {Report.perSection.length > 0 ? <SectionBreakdownTable Rows={Report.perSection} /> : null}

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
const PracticeSubTabList = ["RESULTS", "REPORTS"] as const;
type PracticeSubTabKey = (typeof PracticeSubTabList)[number];

const PracticeReportsSubTabList = ["STUDENT", "LEVEL"] as const;
type PracticeReportsSubTabKey = (typeof PracticeReportsSubTabList)[number];

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
  const [ReportsStudentId, SetReportsStudentId] = useState<string>("");
  // "ALL" = the blended "All Levels" view -- see getTeacherAnnualCompetition-
  // PracticeReportForStudent's own comment for why this stays a genuine,
  // selectable filter rather than defaulting to the student's current level.
  const [ReportsStudentLevelFilter, SetReportsStudentLevelFilter] = useState<string>("ALL");
  const [ReportsLevelCode, SetReportsLevelCode] = useState<string>(ANNUAL_COMPETITION_LEVEL_CODES[0]);

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
    queryKey: ["teacher", "annual-competition", "practice-reports-roster"],
    queryFn: () => getTeacherAnnualCompetitionPracticeResults(undefined),
    enabled: Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS",
  });
  const ReportsRosterStudents = ReportsRosterQuery.data?.students || [];

  const ReportsStudentSearchLower = ReportsStudentSearchText.trim().toLowerCase();
  const ReportsFilteredStudentRows = ReportsRosterStudents.filter((Row) => {
    if (!ReportsStudentSearchLower) return true;
    const Haystack = `${Row.studentName || ""} ${Row.studentCode || ""}`.toLowerCase();
    return Haystack.includes(ReportsStudentSearchLower);
  });

  const PracticeReportStudentQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "practice-report-student", ReportsStudentId, ReportsStudentLevelFilter],
    queryFn: () =>
      getTeacherAnnualCompetitionPracticeReportForStudent(
        ReportsStudentId,
        ReportsStudentLevelFilter === "ALL" ? undefined : ReportsStudentLevelFilter
      ),
    enabled:
      Ready &&
      TopTab === "PRACTICE" &&
      PracticeSubTab === "REPORTS" &&
      PracticeReportsSubTab === "STUDENT" &&
      Boolean(ReportsStudentId),
  });

  const PracticeReportLevelQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "practice-report-level", ReportsLevelCode],
    queryFn: () => getTeacherAnnualCompetitionPracticeReportForLevel(ReportsLevelCode),
    enabled:
      Ready && TopTab === "PRACTICE" && PracticeSubTab === "REPORTS" && PracticeReportsSubTab === "LEVEL" && Boolean(ReportsLevelCode),
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
                <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                  <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                  <input
                    value={PracticeSearchText}
                    onChange={(EventValue) => SetPracticeSearchText(EventValue.target.value)}
                    placeholder="Search student name or code"
                    className="w-64 bg-transparent outline-none placeholder:text-slate-400"
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
                  className="math-input min-w-[200px]"
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
                    {Tab === "RESULTS" ? "Practice Results" : "Practice Reports"}
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
                  Collated performance across every one of this student&apos;s practice attempts. Pick a level to see its
                  section-by-section breakdown, an attempt-by-attempt trend, and how this student compares to the rest of
                  your roster who&apos;ve practiced it -- or leave it on All Levels for a blended summary across every
                  level they&apos;ve ever tried, useful once the same student returns in a later year at a different level.
                </p>

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                    <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                    <input
                      value={ReportsStudentSearchText}
                      onChange={(EventValue) => SetReportsStudentSearchText(EventValue.target.value)}
                      placeholder="Search student name or code"
                      className="w-56 bg-transparent outline-none placeholder:text-slate-400"
                    />
                  </label>
                  <select
                    aria-label="Select student"
                    value={ReportsStudentId}
                    onChange={(EventValue) => SetReportsStudentId(EventValue.target.value)}
                    className="math-input"
                  >
                    <option value="">Select a student...</option>
                    {ReportsFilteredStudentRows.map((Row) => (
                      <option key={Row.studentId} value={Row.studentId}>
                        {Row.studentName || Row.studentCode || Row.studentId}
                        {Row.studentCode ? ` (${Row.studentCode})` : ""}
                      </option>
                    ))}
                  </select>
                  {/* Wired the same way every other level dropdown in this
                      app is (ANNUAL_COMPETITION_LEVEL_CODES + Format-
                      CompetitionLevelLabel), so Bloomers/Beginners and
                      MM-1/MM-2 show their real display names here too. */}
                  <select
                    aria-label="Filter by level"
                    value={ReportsStudentLevelFilter}
                    onChange={(EventValue) => SetReportsStudentLevelFilter(EventValue.target.value)}
                    className="math-input"
                    disabled={!ReportsStudentId}
                  >
                    <option value="ALL">All Levels</option>
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                    ))}
                  </select>
                </div>

                {!ReportsStudentId ? (
                  <div className="mt-5">
                    <EmptyState title="Select a student" description="Pick a student above to see their Practice Reports." />
                  </div>
                ) : PracticeReportStudentQuery.isLoading ? (
                  <div className="mt-5"><LoadingState label="Loading student report..." /></div>
                ) : PracticeReportStudentQuery.error ? (
                  <div className="mt-5"><ErrorState message={apiErrorMessage(PracticeReportStudentQuery.error)} /></div>
                ) : PracticeReportStudentQuery.data ? (
                  <StudentReportView
                    Report={PracticeReportStudentQuery.data}
                    OnViewAttempt={(AttemptId) => Router.push(`/teacher/competition/annual-result/${AttemptId}`)}
                  />
                ) : null}
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

                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <select
                    aria-label="Select level"
                    value={ReportsLevelCode}
                    onChange={(EventValue) => SetReportsLevelCode(EventValue.target.value)}
                    className="math-input"
                  >
                    {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                      <option key={LevelCode} value={LevelCode}>{FormatCompetitionLevelLabel(LevelCode)}</option>
                    ))}
                  </select>
                </div>

                {PracticeReportLevelQuery.isLoading ? (
                  <div className="mt-5"><LoadingState label="Loading level report..." /></div>
                ) : PracticeReportLevelQuery.error ? (
                  <div className="mt-5"><ErrorState message={apiErrorMessage(PracticeReportLevelQuery.error)} /></div>
                ) : PracticeReportLevelQuery.data ? (
                  <LevelReportView Report={PracticeReportLevelQuery.data} />
                ) : null}
              </div>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
