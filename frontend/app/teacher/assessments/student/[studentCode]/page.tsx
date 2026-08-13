"use client";

import { AppShell } from "@/components/common/AppShell";
import { AssessmentInsightWorkspace, AssessmentStudentCode, AssessmentStudentName, type AssessmentRow } from "@/components/common/AssessmentInsightWorkspace";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherAssessments, getTeacherParentReportDeliveries, downloadTeacherParentReportDelivery, type TeacherParentReportDelivery } from "@/lib/api/teacher";
import { formatMathPathDateTime } from "@/lib/date";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { FileText } from "lucide-react";

function triggerBlobDownload(BlobValue: Blob, FileName: string) {
  const Url = window.URL.createObjectURL(BlobValue);
  const Anchor = document.createElement("a");
  Anchor.href = Url;
  Anchor.download = FileName;
  document.body.appendChild(Anchor);
  Anchor.click();
  Anchor.remove();
  window.URL.revokeObjectURL(Url);
}

function ParentReportsPanel({ StudentCode, Ready }: { StudentCode: string; Ready: boolean }) {
  const ReportsQuery = useQuery({
    queryKey: ["teacher-parent-report-deliveries", StudentCode],
    queryFn: () => getTeacherParentReportDeliveries(StudentCode),
    enabled: Ready && Boolean(StudentCode),
  });
  const DownloadMutation = useMutation({
    mutationFn: async (Item: TeacherParentReportDelivery) => ({
      BlobValue: await downloadTeacherParentReportDelivery(Item.id),
      FileName: Item.fileName || `${Item.studentName || "Student"}-Progress-Report.pdf`,
    }),
    onSuccess: ({ BlobValue, FileName }) => triggerBlobDownload(BlobValue, FileName),
    onError: (Error) => window.alert(apiErrorMessage(Error)),
  });

  const Reports = ReportsQuery.data?.logs ?? [];
  if (!Ready || ReportsQuery.isLoading || !Reports.length) return null;

  return (
    <div className="math-card mb-4 p-5">
      <p className="math-block-header"><FileText size={14} />Parent Progress Reports</p>
      <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">
        Reports Published By Admin
      </h3>
      <p className="mt-1 text-sm font-semibold text-slate-500">
        These completed-level progress reports have been generated and published for this student. Download to review or share with the parent.
      </p>
      <div className="mt-4 space-y-2">
        {Reports.map((Item) => (
          <div
            key={Item.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                {Item.levelLabel || Item.levelCode}
              </p>
              <p className="mt-0.5 text-xs font-bold text-slate-500">
                {Item.moduleLabel} · Published {Item.publishedToTeacherAt ? formatMathPathDateTime(Item.publishedToTeacherAt) : "recently"}
              </p>
            </div>
            <button
              type="button"
              className="math-role-action-button math-role-row-action"
              onClick={() => DownloadMutation.mutate(Item)}
              disabled={DownloadMutation.isPending}
            >
              {DownloadMutation.isPending ? "Downloading" : "Download Report"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

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
      <ParentReportsPanel StudentCode={StudentCode} Ready={Ready} />
      {StudentRows.length ? (
        <AssessmentInsightWorkspace
          title={StudentName}
          subtitle={`Student Code: ${StudentCode}`}
          rows={StudentRows}
          role="teacher"
          onView={(Row) => Row.attemptId ? Router.push(`/assessment-result/${Row.attemptId}?viewer=teacher`) : undefined}
        />
      ) : (
        <section className="mx-auto max-w-[1200px] px-6 py-8">
          <EmptyState message="No matching assessment records are available for this student." />
        </section>
      )}
    </AppShell>
  );
}
