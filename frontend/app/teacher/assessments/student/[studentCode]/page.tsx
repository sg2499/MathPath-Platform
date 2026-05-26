"use client";

import { AppShell } from "@/components/common/AppShell";
import { AssessmentInsightWorkspace, AssessmentStudentCode, AssessmentStudentName, type AssessmentRow } from "@/components/common/AssessmentInsightWorkspace";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherAssessments } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";

export default function TeacherStudentAssessmentsWorkspacePage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const Router = useRouter();
  const Params = useParams();
  const StudentCode = decodeURIComponent(String(Params.studentCode || ""));

  const Query = useQuery({ queryKey: ["teacher-assessments"], queryFn: getTeacherAssessments, enabled: Ready });
  const Rows: AssessmentRow[] = Query.data?.rows ?? [];
  const StudentRows = useMemo(() => Rows.filter((Row) => AssessmentStudentCode(Row) === StudentCode), [Rows, StudentCode]);
  const StudentName = StudentRows[0] ? AssessmentStudentName(StudentRows[0]) : StudentCode;

  if (!Ready || Query.isLoading) return <LoadingState label="Loading assessment details..." />;
  if (Query.isError) return <ErrorState message={apiErrorMessage(Query.error)} />;

  return (
    <AppShell title="Assessment Tracker">
      {StudentRows.length ? (
        <AssessmentInsightWorkspace
          title={StudentName}
          subtitle={`Student Code: ${StudentCode}`}
          rows={StudentRows}
          role="teacher"
          onView={(Row) => Row.attemptId ? Router.push(`/assessment-result/${encodeURIComponent(Row.attemptId)}?viewer=teacher`) : undefined}
        />
      ) : (
        <section className="mx-auto max-w-[1200px] px-6 py-8">
          <EmptyState message="No matching assessment records are available for this student." />
        </section>
      )}
    </AppShell>
  );
}
