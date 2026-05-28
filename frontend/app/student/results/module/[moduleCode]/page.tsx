"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import {
  AnyRow,
  levelCodeOf,
  moduleCodeOf,
  moduleTitle,
  RecordWorkspace,
} from "@/components/common/DetailWorkspaceViews";
import { apiErrorMessage } from "@/lib/api";
import { getStudentResults } from "@/lib/api/student";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useQuery } from "@tanstack/react-query";
import { Suspense, useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";



export default function StudentModuleProgressWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <StudentModuleProgressWorkspacePageContent />
    </Suspense>
  );
}

function StudentModuleProgressWorkspacePageContent() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Router = useRouter();
  const Params = useParams();
  const SearchParams = useSearchParams();
  const ModuleCode = decodeURIComponent(String(Params.moduleCode || ""));
  const SelectedLevel = SearchParams.get("level") || SearchParams.get("levelCode") || "";
  const FocusTarget = {
    assignmentId: SearchParams.get("assignmentId") || undefined,
    attemptId: SearchParams.get("attemptId") || undefined,
    dpsId: SearchParams.get("dpsId") || undefined,
    lessonId: SearchParams.get("lessonId") || undefined,
    moduleCode: SearchParams.get("moduleCode") || ModuleCode || undefined,
    levelCode: SearchParams.get("levelCode") || SelectedLevel || undefined,
    targetAction: SearchParams.get("targetAction") || "lesson-insights",
  };

  const Query = useQuery({ queryKey: ["student-results"], queryFn: getStudentResults, enabled: Ready, retry: 1 });
  const Rows: AnyRow[] = Query.data ?? [];
  const LevelRequirementMap = useMemo(() => {
    const MapByLevel = new Map<string, number>();
    Rows.forEach((Row) => {
      const IsLevelProgressRow = String(Row.recordKind || Row.assignmentType || "").toUpperCase() === "LEVEL_PROGRESS";
      if (!IsLevelProgressRow) return;
      const LevelCode = levelCodeOf(Row);
      const RequiredValue = Number(
        Row.requiredDpsCount ??
          Row.requiredDPSCount ??
          Row.totalDpsCount ??
          Row.totalDPSCount ??
          Row.levelDpsCount ??
          Row.levelDPSCount,
      );
      if (LevelCode && !Number.isNaN(RequiredValue) && RequiredValue > 0) {
        MapByLevel.set(`${moduleCodeOf(Row)}|${LevelCode}`, RequiredValue);
      }
    });
    return MapByLevel;
  }, [Rows]);
  const ResultRows = useMemo(() => {
    return Rows
      .filter((Row) => String(Row.recordKind || Row.assignmentType || "").toUpperCase() !== "LEVEL_PROGRESS")
      .map((Row) => {
        const Requirement = LevelRequirementMap.get(`${moduleCodeOf(Row)}|${levelCodeOf(Row)}`);
        if (!Requirement) return Row;
        return {
          ...Row,
          requiredDpsCount: Row.requiredDpsCount ?? Requirement,
          totalDpsCount: Row.totalDpsCount ?? Requirement,
          levelDpsCount: Row.levelDpsCount ?? Requirement,
        };
      });
  }, [Rows, LevelRequirementMap]);
  const ModuleRows = useMemo(() => ResultRows.filter((Row) => moduleCodeOf(Row) === ModuleCode), [ResultRows, ModuleCode]);
  const VisibleRows = useMemo(
    () => SelectedLevel ? ModuleRows.filter((Row) => levelCodeOf(Row) === SelectedLevel) : ModuleRows,
    [ModuleRows, SelectedLevel]
  );
  const Title = ModuleRows[0] ? moduleTitle(ModuleRows[0]) : ModuleCode;
  const Subtitle = SelectedLevel
    ? `Module Code: ${ModuleCode} • Level: ${SelectedLevel} • Review lesson-wise progress and attempt history.`
    : `Module Code: ${ModuleCode} • Review lesson-wise progress and attempt history for this module.`;

  if (!Ready || Query.isLoading) return <LoadingState label="Loading progress details..." />;
  if (Query.isError) return <ErrorState message={apiErrorMessage(Query.error)} />;

  return (
    <AppShell title="Progress Detail">
      {VisibleRows.length ? (
        <RecordWorkspace
          title={SelectedLevel ? `${Title} · ${SelectedLevel}` : Title}
          subtitle={Subtitle}
          backLabel="Back to Progress"
          onBack={() => Router.push("/student/results")}
          rows={VisibleRows}
          accuracyRows={ResultRows}
          role="student"
          initialTab={(SearchParams.get("tab") === "lesson-insights" || SearchParams.get("tab") === "lessons") ? "lessons" : "overview"}
          focusTarget={FocusTarget}
          onView={(Row) => Row.attemptId && Router.push(`/student/result/${Row.attemptId}`)}
        />
      ) : (
        <section className="w-full">
          <EmptyState title="No module records found" description="No progress records are available for this module level yet." />
        </section>
      )}
    </AppShell>
  );
}
