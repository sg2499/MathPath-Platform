"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  AnyRow,
  averageAccuracy,
  currentWorkRows,
  isBelowBenchmark,
  isCompleted,
  levelCodeOf,
  NaturalCompare,
  requiredDpsForLevel,
  uniqueNeedsReattemptCount,
  uniquePendingConceptCount,
} from "@/components/common/DetailWorkspaceViews";
import { NotificationTargetBanner } from "@/components/common/NotificationTargetBanner";
import { AssignmentCard } from "@/components/student/AssignmentCard";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getStudentAssignments, getStudentResults } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  FileText,
  Target,
  Laptop,
  BookOpenCheck,
} from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function CleanPercent(Value: unknown) {
  const NumberValue = Number(Value);
  if (!Number.isFinite(NumberValue)) return null;
  return Math.min(100, Math.max(0, Math.round(NumberValue)));
}

function AssignmentAccuracy(Assignment: {
  accuracy?: number | null;
  accuracyPercentage?: number | null;
  percentage?: number | null;
  score?: number | null;
  totalMarks?: number | null;
  maxScore?: number | null;
}) {
  const DirectAccuracy = CleanPercent(
    Assignment.accuracy ??
      Assignment.accuracyPercentage ??
      Assignment.percentage,
  );
  if (DirectAccuracy !== null) return DirectAccuracy;

  const Score = Number(Assignment.score);
  const Total = Number(Assignment.totalMarks ?? Assignment.maxScore);
  if (Number.isFinite(Score) && Number.isFinite(Total) && Total > 0) {
    return CleanPercent((Score / Total) * 100);
  }

  return null;
}

function AverageAccuracyDisplay(
  Assignments: Array<{
    accuracy?: number | null;
    accuracyPercentage?: number | null;
    percentage?: number | null;
    score?: number | null;
    totalMarks?: number | null;
    maxScore?: number | null;
  }>,
) {
  const AccuracyValues = Assignments.map((Assignment) =>
    AssignmentAccuracy(Assignment),
  ).filter((Value): Value is number => Value !== null);

  if (!AccuracyValues.length) return "0%";

  const Average =
    AccuracyValues.reduce((Total, Value) => Total + Value, 0) /
    AccuracyValues.length;
  return `${Math.round(Average)}%`;
}



function IsLevelProgressRow(Row: AnyRow) {
  return String(Row.recordKind || Row.assignmentType || "").toUpperCase() === "LEVEL_PROGRESS";
}

function IsPracticeResultRow(Row: AnyRow) {
  return !IsLevelProgressRow(Row);
}

function SortLevelCodes(LevelCodes: string[]) {
  return [...LevelCodes].sort(NaturalCompare);
}

function ActivePracticeLevelCode(Rows: AnyRow[]) {
  const ActiveProgressRow = Rows.find(
    (Row) =>
      IsLevelProgressRow(Row) &&
      String(Row.progressionRole || "").toUpperCase() === "ACTIVE_LEVEL",
  );
  if (ActiveProgressRow) return levelCodeOf(ActiveProgressRow);

  const LevelCodes = SortLevelCodes(
    Array.from(new Set(Rows.map(levelCodeOf).filter(Boolean))),
  );

  const FirstOpenLevel = LevelCodes.find((LevelCode) => {
    const LevelRows = Rows.filter((Row) => levelCodeOf(Row) === LevelCode);
    const PracticeRows = currentWorkRows(LevelRows.filter(IsPracticeResultRow));
    const Required = requiredDpsForLevel(LevelRows.length ? LevelRows : PracticeRows, LevelCode);
    const Cleared = PracticeRows.filter(
      (Row) => isCompleted(Row) && !isBelowBenchmark(Row),
    ).length;
    return Cleared < Required;
  });

  return FirstOpenLevel || LevelCodes[LevelCodes.length - 1] || "";
}

function BuildPracticeHeroMetrics(Results: AnyRow[], Assignments: AnyRow[]) {
  if (Results.length) {
    const LevelCode = ActivePracticeLevelCode(Results);
    const ScopedRows = LevelCode
      ? Results.filter((Row) => levelCodeOf(Row) === LevelCode)
      : Results;
    const CurrentRows = currentWorkRows(ScopedRows.filter(IsPracticeResultRow));
    const Required = requiredDpsForLevel(
      ScopedRows.length ? ScopedRows : CurrentRows,
      LevelCode || undefined,
    );
    const Assigned = CurrentRows.length;
    const Cleared = CurrentRows.filter(
      (Row) => isCompleted(Row) && !isBelowBenchmark(Row),
    ).length;
    const NeedsReattempt = uniqueNeedsReattemptCount(CurrentRows);
    const Pending = uniquePendingConceptCount(CurrentRows);
    const AverageAccuracy = averageAccuracy(CurrentRows);

    return {
      Total: Required,
      Assigned,
      Cleared,
      Pending,
      NeedsReattempt,
      AverageAccuracy: typeof AverageAccuracy === "number" ? `${AverageAccuracy}%` : "0%",
    };
  }

  const CurrentAssignments = currentWorkRows(Assignments);
  const Assigned = CurrentAssignments.length;
  const ActiveLevelCode = ActivePracticeLevelCode(CurrentAssignments);
  const Required = requiredDpsForLevel(
    CurrentAssignments,
    ActiveLevelCode || undefined,
  );
  const Cleared = CurrentAssignments.filter(
    (Assignment) => isCompleted(Assignment) && !isBelowBenchmark(Assignment),
  ).length;
  const NeedsReattempt = uniqueNeedsReattemptCount(CurrentAssignments);
  const Pending = uniquePendingConceptCount(CurrentAssignments);

  return {
    Total: Required,
    Assigned,
    Cleared,
    Pending,
    NeedsReattempt,
    AverageAccuracy: AverageAccuracyDisplay(CurrentAssignments),
  };
}


export default function StudentPracticePage() {
  return (
    <Suspense fallback={null}>
      <StudentPracticePageContent />
    </Suspense>
  );
}

function StudentPracticePageContent() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Router = useRouter();
  const SearchParams = useSearchParams();

  const AssignmentQuery = useQuery({
    queryKey: ["student-assignments"],
    queryFn: getStudentAssignments,
    enabled: Ready,
  });

  const ResultsQuery = useQuery({
    queryKey: ["student-results-for-practice-accuracy"],
    queryFn: getStudentResults,
    enabled: Ready,
  });

  if (!Ready) return null;

  const Assignments = AssignmentQuery.data ?? [];
  const ActiveAssignments = Assignments.filter(
    (Assignment) =>
      Assignment.status === "NOT_STARTED" ||
      Assignment.status === "IN_PROGRESS" ||
      Assignment.status === "REATTEMPT_AVAILABLE",
  );
  const CompletedAssignments = Assignments.filter(
    (Assignment) =>
      Assignment.status === "SUBMITTED" ||
      Assignment.status === "AUTO_SUBMITTED" ||
      Assignment.status === "COMPLETED",
  );
  const NeedsReattemptAssignments = Assignments.filter(
    (Assignment) => Assignment.status === "REATTEMPT_AVAILABLE",
  );
  const PendingAssignments = Assignments.filter(
    (Assignment) =>
      Assignment.status === "NOT_STARTED" ||
      Assignment.status === "IN_PROGRESS",
  );

  const TargetAssignmentId = SearchParams.get("assignmentId") || "";
  const TargetDpsId = SearchParams.get("dpsId") || "";
  const TargetDpsCount = Number(SearchParams.get("dpsCount") || SearchParams.get("assignmentCount") || 0);
  const HasGroupedPracticeTarget = TargetDpsCount > 1 || SearchParams.get("isGrouped") === "true";
  const TargetAssignment = ActiveAssignments.find(
    (Assignment) =>
      (TargetAssignmentId && Assignment.assignmentId === TargetAssignmentId) ||
      (TargetDpsId && Assignment.dpsId === TargetDpsId),
  );
  const OrderedActiveAssignments = TargetAssignment
    ? [
        TargetAssignment,
        ...ActiveAssignments.filter(
          (Assignment) =>
            Assignment.assignmentId !== TargetAssignment.assignmentId,
        ),
      ]
    : ActiveAssignments;

  const CompletedPracticeResults = (ResultsQuery.data ?? []).filter(
    (Result) => {
      const TypeText = String(Result.assignmentType ?? "").toUpperCase();
      const StatusText = String(Result.status ?? "").toUpperCase();
      const IsAssessment = TypeText.includes("ASSESSMENT");
      const IsCompleted =
        StatusText.includes("SUBMITTED") ||
        StatusText.includes("COMPLETED") ||
        StatusText.includes("CLEARED") ||
        Boolean(
          Result.submittedAt || Result.completedDate || Result.attemptDate,
        );
      return !IsAssessment && IsCompleted;
    },
  );

  const PracticeHeroMetrics = BuildPracticeHeroMetrics(
    ResultsQuery.data ?? [],
    Assignments,
  );

  const HasLoaded = !AssignmentQuery.isLoading && !AssignmentQuery.error;

  return (
    <AppShell>
      <main className="w-full space-y-5">
        <section className="math-hero">
          <div className="math-block-header">
            <Laptop size={14} />
            Student Practice
          </div>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">
            Assigned Practice
          </h1>
          <p className="math-subtitle">
            Open active DPS work, continue timed attempts, and complete the
            practice assigned by your teacher.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <MetricCard
              Icon={<ClipboardList size={18} />}
              Label="Total DPS"
              Value={PracticeHeroMetrics.Total}
            />
            <MetricCard
              Icon={<FileText size={18} />}
              Label="Assigned DPS"
              Value={PracticeHeroMetrics.Assigned}
            />
            <MetricCard
              Icon={<CheckCircle2 size={18} />}
              Label="Cleared DPS"
              Value={PracticeHeroMetrics.Cleared}
            />
            <MetricCard
              Icon={<Target size={18} />}
              Label="Pending DPS"
              Value={PracticeHeroMetrics.Pending}
            />
            <MetricCard
              Icon={<AlertTriangle size={18} />}
              Label="Needs Re-Attempt"
              Value={PracticeHeroMetrics.NeedsReattempt}
            />
            <MetricCard
              Icon={<BarChart3 size={18} />}
              Label="Average Accuracy"
              Value={PracticeHeroMetrics.AverageAccuracy}
            />
          </div>
        </section>

        <section className="rounded-[30px] border border-white/50 bg-white/40 p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/40 relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
          <div className="relative z-10">
            <div className="math-block-header mb-2">
              <BookOpenCheck size={14} /> Practice Work
            </div>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              Current DPS Assignments
            </h2>
            <p className="math-subtitle">
              Review and begin your assigned practice work below. Start with the highlighted assignment to continue your structured learning journey.
            </p>
          </div>
        </section>

        {AssignmentQuery.isLoading ? (
          <LoadingState label="Loading practice cards..." />
        ) : null}
        {AssignmentQuery.error ? (
          <ErrorState message={apiErrorMessage(AssignmentQuery.error)} />
        ) : null}

        {HasLoaded && ActiveAssignments.length === 0 ? (
          <EmptyState message="No active practice right now. Visit Progress to review your completed work and learning milestones." />
        ) : null}

        {HasLoaded && TargetAssignment ? (
          <NotificationTargetBanner
            label="Practice"
            title={HasGroupedPracticeTarget ? `${TargetDpsCount} DPS Ready` : "DPS Ready"}
            description={
              HasGroupedPracticeTarget
                ? `${TargetAssignment.levelCode || "Selected Level"} has ${TargetDpsCount} assigned DPS sheets ready.`
                : `${TargetAssignment.levelCode || "Selected Level"} · ${TargetAssignment.lessonTitle || (TargetAssignment as any).lessonName || "Lesson"} · ${TargetAssignment.dpsTitle || "DPS"}`
            }
            actionLabel={HasGroupedPracticeTarget ? "Start First DPS" : "Start Practice"}
            onAction={() =>
              Router.push(
                `/student/dps/${TargetAssignment.dpsId}?assignmentId=${TargetAssignment.assignmentId}`,
              )
            }
          />
        ) : null}

        {HasLoaded && ActiveAssignments.length > 0 ? (
          <section className="grid gap-5 xl:grid-cols-2">
            {OrderedActiveAssignments.map((Assignment, Index) => {
              const IsTarget =
                TargetAssignment?.assignmentId === Assignment.assignmentId;
              return (
                <div
                  key={Assignment.assignmentId}
                  className={`math-pop-in rounded-[30px] transition ${IsTarget ? "ring-2 ring-blue-300/70 ring-offset-2 ring-offset-blue-50/50 dark:ring-blue-400/50 dark:ring-offset-slate-950" : ""}`}
                  style={{ animationDelay: `${Index * 70}ms` }}
                >
                  <AssignmentCard assignment={Assignment} />
                </div>
              );
            })}
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}

function MetricCard({
  Icon,
  Label,
  Value,
}: {
  Icon: ReactNode;
  Label: string;
  Value: string | number;
}) {
  return (
    <div className="group relative overflow-hidden transition-all duration-500 hover:-translate-y-1 p-5 rounded-[28px] bg-white/40 dark:bg-slate-900/40 border border-white/50 dark:border-white/10 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:hover:shadow-[0_20px_50px_rgba(0,0,0,0.3)]">
      {/* Gamified hover shine */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      
      <div className="math-student-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
        {Icon}
      </div>
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-800 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-100">
        {Label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white">
        {Value}
      </p>
      {Label === "Average Accuracy" && typeof Value === "string" && Value.endsWith("%") && (
        <div className="relative z-10 mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-400 transition-all duration-1000 ease-out"
            style={{ width: Value }}
          />
        </div>
      )}
    </div>
  );
}
