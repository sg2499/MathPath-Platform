"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { NotificationTargetBanner } from "@/components/common/NotificationTargetBanner";
import {
  AnyRow,
  RecordWorkspace,
  studentCodeOf,
  studentNameOf,
} from "@/components/common/DetailWorkspaceViews";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  deleteAssignment,
  getAdminAssignments,
  updateAssignmentStatus,
  type AdminAssignment,
} from "@/lib/api/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

export default function AdminStudentAssignmentsWorkspacePage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const router = useRouter();
  const params = useParams();
  const SearchParams = useSearchParams();
  const queryClient = useQueryClient();
  const studentCode = decodeURIComponent(String(params.studentCode || ""));
  const [deleteTarget, setDeleteTarget] = useState<AdminAssignment | null>(
    null,
  );
  const [confirmText, setConfirmText] = useState("");

  const query = useQuery({
    queryKey: ["admin-assignments"],
    queryFn: getAdminAssignments,
    enabled: ready,
  });
  const rows: AnyRow[] = query.data ?? [];
  const ScopeModuleCode = SearchParams.get("moduleCode") || "";
  const ScopeLevelCode = SearchParams.get("levelCode") || "";
  const AllStudentRows = useMemo(
    () => rows.filter((row) => studentCodeOf(row) === studentCode),
    [rows, studentCode],
  );
  const studentRows = useMemo(
    () =>
      AllStudentRows.filter((row) => {
        const ModuleMatch =
          !ScopeModuleCode ||
          String(row.moduleCode || row.moduleId || "") === ScopeModuleCode;
        const LevelMatch =
          !ScopeLevelCode ||
          String(row.levelCode || row.levelId || "") === ScopeLevelCode;
        return ModuleMatch && LevelMatch;
      }),
    [AllStudentRows, ScopeModuleCode, ScopeLevelCode],
  );
  const studentName = AllStudentRows[0]
    ? studentNameOf(AllStudentRows[0])
    : studentCode;

  const QuickTarget = useMemo(() => {
    const AssignmentId = SearchParams.get("assignmentId") || "";
    const AttemptId = SearchParams.get("attemptId") || "";
    const DpsId = SearchParams.get("dpsId") || "";
    const ModuleCode = SearchParams.get("moduleCode") || "";
    const LevelCode = SearchParams.get("levelCode") || "";

    return studentRows.find((Row) => {
      const Candidate = Row as AnyRow;
      const AssignmentMatch =
        AssignmentId &&
        String(Candidate.assignmentId || Candidate.id || "") === AssignmentId;
      const AttemptMatch =
        AttemptId &&
        String(Candidate.attemptId || Candidate.latestAttemptId || "") ===
          AttemptId;
      const DpsMatch =
        DpsId && String(Candidate.dpsId || Candidate.dps_id || "") === DpsId;
      const ModuleMatch =
        !ModuleCode ||
        String(Candidate.moduleCode || Candidate.moduleId || "") === ModuleCode;
      const LevelMatch =
        !LevelCode ||
        String(Candidate.levelCode || Candidate.levelId || "") === LevelCode;
      return (
        (AssignmentMatch || AttemptMatch || DpsMatch) &&
        ModuleMatch &&
        LevelMatch
      );
    }) as AdminAssignment | undefined;
  }, [SearchParams, studentRows]);
  const TargetDpsCount = Number(SearchParams.get("dpsCount") || SearchParams.get("assignmentCount") || 0);
  const HasGroupedPracticeTarget = TargetDpsCount > 1 || SearchParams.get("isGrouped") === "true";

  const statusMutation = useMutation({
    mutationFn: (payload: { assignmentId: string; isActive: boolean }) =>
      updateAssignmentStatus(payload.assignmentId, payload.isActive),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["admin-assignments"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAssignment,
    onSuccess: () => {
      setDeleteTarget(null);
      setConfirmText("");
      queryClient.invalidateQueries({ queryKey: ["admin-assignments"] });
    },
  });

  if (!ready || query.isLoading)
    return <LoadingState label="Loading details..." />;
  if (query.isError)
    return <ErrorState message={apiErrorMessage(query.error)} />;

  return (
    <AppShell title="Practice Control">
      {studentRows.length ? (
        <>
          {QuickTarget ? (
            <NotificationTargetBanner
              className="mb-5"
              label="Practice"
              title={HasGroupedPracticeTarget ? `${TargetDpsCount} DPS Records Highlighted` : "DPS Record Highlighted"}
              description={
                HasGroupedPracticeTarget
                  ? `${studentName} · ${String(QuickTarget.moduleCode || "Module")} · ${String(QuickTarget.levelCode || "Level")} has ${TargetDpsCount} assigned DPS records in focus.`
                  : `${studentName} · ${String(QuickTarget.moduleCode || "Module")} · ${String(QuickTarget.levelCode || "Level")} · ${String(QuickTarget.lessonTitle || (QuickTarget as any).lessonName || "Lesson")} · ${String(QuickTarget.dpsTitle || (QuickTarget as any).dpsName || "DPS")}`
              }
              actionLabel={QuickTarget.assignmentId ? "View Record" : undefined}
              onAction={
                QuickTarget.assignmentId
                  ? () =>
                      router.push(
                        `/admin/assignments/${QuickTarget.assignmentId}`,
                      )
                  : undefined
              }
            />
          ) : null}
          <RecordWorkspace
            title={studentName}
            subtitle={`Student Code: ${studentCode}${ScopeModuleCode ? ` • Module: ${ScopeModuleCode}` : ""}${ScopeLevelCode ? ` • Level: ${ScopeLevelCode}` : ""}`}
            backLabel="Back to Practice Control"
            onBack={() => router.push("/admin/assignments")}
            rows={studentRows}
            role="admin"
            onView={(row) =>
              row.assignmentId &&
              router.push(`/admin/assignments/${row.assignmentId}`)
            }
            onArchive={(row) =>
              statusMutation.mutate({
                assignmentId: row.assignmentId,
                isActive: false,
              })
            }
            onRestore={(row) =>
              statusMutation.mutate({
                assignmentId: row.assignmentId,
                isActive: true,
              })
            }
            onDelete={(row) => setDeleteTarget(row as AdminAssignment)}
          />
        </>
      ) : (
        <section className="mx-auto max-w-[1200px] px-6 py-8">
          <EmptyState message="No matching records are available for this student." />
        </section>
      )}
      <DeleteConfirmModal
        target={deleteTarget}
        confirmText={confirmText}
        setConfirmText={setConfirmText}
        pending={deleteMutation.isPending}
        error={
          deleteMutation.error ? apiErrorMessage(deleteMutation.error) : ""
        }
        onClose={() => {
          setDeleteTarget(null);
          setConfirmText("");
        }}
        onDelete={() =>
          deleteTarget?.assignmentId &&
          deleteMutation.mutate(deleteTarget.assignmentId)
        }
      />
    </AppShell>
  );
}

function DeleteConfirmModal({
  target,
  confirmText,
  setConfirmText,
  pending,
  error,
  onClose,
  onDelete,
}: {
  target: AdminAssignment | null;
  confirmText: string;
  setConfirmText: (value: string) => void;
  pending: boolean;
  error: string;
  onClose: () => void;
  onDelete: () => void;
}) {
  if (!target) return null;
  const hasAttempts = Boolean(
    target.completedAttemptCount ||
    target.attemptCount ||
    (target as AnyRow).latestAttemptId,
  );
  const canDelete =
    !hasAttempts || confirmText.trim().toUpperCase() === "DELETE";

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-600">
          Admin Control
        </p>
        <h3 className="mt-2 text-2xl font-black">Delete record?</h3>
        <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">
          If attempts exist, type DELETE to confirm removal.
        </p>
        <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-black">
          {target.title}
        </div>
        {hasAttempts ? (
          <input
            className="math-input mt-4"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="Type DELETE to confirm"
          />
        ) : null}
        <div className="mt-6 flex justify-end gap-3">
          <button
            className="math-button-secondary"
            onClick={onClose}
            title="Cancel delete"
            aria-label="Cancel delete"
          >
            Cancel
          </button>
          <button
            className="math-button-danger"
            disabled={!canDelete || pending}
            onClick={onDelete}
            title="Delete record"
            aria-label="Delete record"
          >
            <Trash2 size={16} /> {pending ? "Deleting..." : "Delete"}
          </button>
        </div>
        {error ? (
          <p className="mt-4 rounded-2xl bg-rose-50 p-3 text-sm font-bold text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
