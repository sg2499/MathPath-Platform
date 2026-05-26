"use client";

import { AppShell } from "@/components/common/AppShell";
import { AssessmentInsightWorkspace, AssessmentStudentCode, AssessmentStudentName, type AssessmentRow } from "@/components/common/AssessmentInsightWorkspace";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { deleteAssessmentAssignment, getAdminAssessments, updateAssessmentAssignmentStatus } from "@/lib/api/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

export default function AdminStudentAssessmentsWorkspacePage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Router = useRouter();
  const Params = useParams();
  const QueryClient = useQueryClient();
  const StudentCode = decodeURIComponent(String(Params.studentCode || ""));
  const [DeleteTarget, SetDeleteTarget] = useState<AssessmentRow | null>(null);
  const [ConfirmText, SetConfirmText] = useState("");

  const Query = useQuery({ queryKey: ["admin-assessments"], queryFn: getAdminAssessments, enabled: Ready });
  const Rows: AssessmentRow[] = Query.data ?? [];
  const StudentRows = useMemo(() => Rows.filter((Row) => AssessmentStudentCode(Row) === StudentCode), [Rows, StudentCode]);
  const StudentName = StudentRows[0] ? AssessmentStudentName(StudentRows[0]) : StudentCode;

  const StatusMutation = useMutation({
    mutationFn: (Payload: { assignmentId: string; isActive: boolean }) => updateAssessmentAssignmentStatus(Payload.assignmentId, Payload.isActive),
    onSuccess: () => QueryClient.invalidateQueries({ queryKey: ["admin-assessments"] }),
  });

  const DeleteMutation = useMutation({
    mutationFn: deleteAssessmentAssignment,
    onSuccess: () => {
      SetDeleteTarget(null);
      SetConfirmText("");
      QueryClient.invalidateQueries({ queryKey: ["admin-assessments"] });
    },
  });

  if (!Ready || Query.isLoading) return <LoadingState label="Loading assessment details..." />;
  if (Query.isError) return <ErrorState message={apiErrorMessage(Query.error)} />;

  return (
    <AppShell title="Assessment Control">
      {StudentRows.length ? (
        <AssessmentInsightWorkspace
          title={StudentName}
          subtitle={`Student Code: ${StudentCode}`}
          rows={StudentRows}
          role="admin"
          onView={(Row) => Row.attemptId ? Router.push(`/assessment-result/${encodeURIComponent(Row.attemptId)}?viewer=admin`) : undefined}
          onArchive={(Row) => StatusMutation.mutate({ assignmentId: Row.assignmentId || Row.assessmentAssignmentId, isActive: false })}
          onRestore={(Row) => StatusMutation.mutate({ assignmentId: Row.assignmentId || Row.assessmentAssignmentId, isActive: true })}
          onDelete={(Row) => SetDeleteTarget(Row)}
        />
      ) : (
        <section className="mx-auto max-w-[1200px] px-6 py-8">
          <EmptyState message="No matching assessment records are available for this student." />
        </section>
      )}
      <DeleteConfirmModal
        Target={DeleteTarget}
        ConfirmText={ConfirmText}
        SetConfirmText={SetConfirmText}
        Pending={DeleteMutation.isPending}
        Error={DeleteMutation.error ? apiErrorMessage(DeleteMutation.error) : ""}
        OnClose={() => { SetDeleteTarget(null); SetConfirmText(""); }}
        OnDelete={() => DeleteTarget && DeleteMutation.mutate(DeleteTarget.assignmentId || DeleteTarget.assessmentAssignmentId)}
      />
    </AppShell>
  );
}

function DeleteConfirmModal({
  Target,
  ConfirmText,
  SetConfirmText,
  Pending,
  Error,
  OnClose,
  OnDelete,
}: {
  Target: AssessmentRow | null;
  ConfirmText: string;
  SetConfirmText: (value: string) => void;
  Pending: boolean;
  Error: string;
  OnClose: () => void;
  OnDelete: () => void;
}) {
  if (!Target) return null;
  const HasAttempts = Boolean(Target.completedAttemptCount || Target.attemptCount || (Target as any).latestAttemptId);
  const CanDelete = !HasAttempts || ConfirmText.trim().toUpperCase() === "DELETE";

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">Admin Control</p>
        <h3 className="mt-2 text-2xl font-black">Delete assessment record?</h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">If attempts exist, type DELETE to confirm removal.</p>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-black">{Target.title}</div>
        {HasAttempts ? <input className="math-input mt-4" value={ConfirmText} onChange={(Event) => SetConfirmText(Event.target.value)} placeholder="Type DELETE to confirm" /> : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 text-sm font-black text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:text-blue-700 hover:shadow-md"
            onClick={OnClose}
            title="Cancel delete"
            aria-label="Cancel delete"
          >
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-5 text-sm font-black text-rose-700 shadow-sm transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-55"
            disabled={!CanDelete || Pending}
            onClick={OnDelete}
            title="Delete assessment record"
            aria-label="Delete assessment record"
          >
            <Trash2 size={16} /> {Pending ? "Deleting..." : "Delete"}
          </button>
        </div>
        {Error ? <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">{Error}</p> : null}
      </div>
    </div>
  );
}
