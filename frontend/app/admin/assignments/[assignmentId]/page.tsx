"use client";

import { AppShell } from "@/components/common/AppShell";
import { BenchmarkBadge, BenchmarkAlert } from "@/components/common/BenchmarkBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import { allowAdminAssignmentReattempt, getAdminAssignmentDetailFull } from "@/lib/api/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Clock,
  Eye,
  UserRound,
  UsersRound,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";

function formatDate(value?: string | null) {
  return formatMathPathDateTime(value);
}

export default function AdminAssignmentDetailPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useParams<{ assignmentId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [FreshPracticeRequest, SetFreshPracticeRequest] = useState<any | null>(null);

  const reattemptMutation = useMutation({
    mutationFn: ({ assignmentId, studentId }: { assignmentId: string; studentId: string }) =>
      allowAdminAssignmentReattempt(assignmentId, studentId, "Teacher requested corrective re-attempt."),
    onSuccess: () => {
      SetFreshPracticeRequest(null);
      queryClient.invalidateQueries({ queryKey: ["admin-assignment-detail", params.assignmentId] });
    },
  });

  const query = useQuery({
    queryKey: ["admin-assignment-detail", params.assignmentId],
    queryFn: () => getAdminAssignmentDetailFull(params.assignmentId),
    enabled: ready && Boolean(params.assignmentId),
  });

  if (!ready) return null;

  const data = query.data;
  const assignment = data?.assignment;
  const NextAttemptNumber = Number(FreshPracticeRequest?.nextAttemptNumber || FreshPracticeRequest?.retryAttemptNumber || 0) || 3;
  const UsedAttemptNumber = Number(FreshPracticeRequest?.retryAttemptNumber || FreshPracticeRequest?.nextAttemptNumber || 0) || NextAttemptNumber;

  return (
    <AppShell title="Assignment Detail">
      {query.isLoading ? <LoadingState label="Loading assignment detail..." /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

      {assignment ? (
        <div className="space-y-6">
          <section className="math-hero">
            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="math-kicker">Assignment detail</p>
                <h1 className="math-title">{assignment.title}</h1>
                <p className="math-subtitle">
                  {assignment.levelCode || "-"} · Lesson {assignment.lessonNumber ?? "-"} · DPS {assignment.dpsNumber ?? "-"} — {assignment.dpsTitle || "-"}
                </p>
              </div>
              <button className="math-button-secondary" onClick={() => router.push("/admin/assignments")}>
                <ArrowLeft size={17} />
                Back to Assignment Dashboard
              </button>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-4">
            <Metric label="Assigned Students" value={data?.summary.assignedStudentCount ?? 0} icon={<UsersRound size={18} />} />
            <Metric label="Cleared" value={data?.summary.completedStudentCount ?? 0} icon={<CheckCircle2 size={18} />} />
            <Metric label="Pending" value={data?.summary.pendingStudentCount ?? 0} icon={<XCircle size={18} />} />
            <Metric label="Attempts" value={data?.summary.attemptCount ?? 0} icon={<BarChart3 size={18} />} />
          </section>

          <section className="math-card p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Info label="Created By" value={`${assignment.assignedByName} (${assignment.assignedByRole})`} />
              <Info label="Target" value={`${assignment.assignedToType}: ${assignment.assignedToLabel}`} />
              <Info label="Status" value={assignment.status} />
              <Info label="Created On" value={formatDate(assignment.createdAt)} />
            </div>
          </section>

          <section>
            {data?.students?.some((row) => row.requiresAttention) ? (
              <div className="mb-5"><BenchmarkAlert show message="Caution: One or more students scored below the minimum benchmark of 70%. Teacher intervention is required before the next attempt." /></div>
            ) : null}
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                <UserRound size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950">Assigned Students</h2>
                <p className="text-slate-600">completion date, attempt date, completion date, and scores.</p>
              </div>
            </div>

            {data?.students?.length ? (
              <div className="math-table math-assignment-detail-table">
                <table>
                  <thead>
                    <tr>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Student</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Status</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Score</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Accuracy</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Benchmark</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Attempt Date</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Completion Date</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Time</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Review</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Re-Attempt</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.map((row) => (
                      <tr key={row.studentId}>
                        <td>
                          <p className="font-black text-slate-950">{row.studentName}</p>
                          <p className="text-xs text-slate-500">{row.studentCode}</p>
                        </td>
                        <td>
                          <span className={`math-badge math-assignment-semantic-chip ${
                            row.status === "COMPLETED"
                              ? "math-assignment-semantic-success border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "math-assignment-semantic-warning border-amber-200 bg-amber-50 text-amber-700"
                          }`}>
                            {row.status}
                          </span>
                        </td>
                        <td><PerformanceChip Value={`${RoundedDisplay(row.score)} / ${RoundedDisplay(row.maxScore)}`} Tone={Number.isFinite(Number(row.score)) ? "blue" : "slate"} /></td>
                        <td><PerformanceChip Value={`${RoundedDisplay(row.accuracyPercentage)}%`} Tone={AccuracyTone(row.accuracyPercentage)} /></td>
                        <td><BenchmarkBadge status={row.benchmarkStatus} requiresAttention={row.requiresAttention} percentage={row.benchmarkPercentage} /></td>
                        <td>{formatDate(row.attemptDate || row.startedAt)}</td>
                        <td>{formatDate(row.completedDate || row.submittedAt)}</td>
                        <td>{row.timeTakenSeconds ? `${row.timeTakenSeconds}s` : "-"}</td>
                        <td>
                          {row.attemptId ? (
                            <button className="math-role-action-button px-3 py-2" onClick={() => router.push(`/admin/results/${row.attemptId}`)}>
                              <Eye size={15} />
                              View
                            </button>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">Pending</span>
                          )}
                        </td>
                        <td>
                          {row.reattemptStatus === "USED" ? (
                            <span className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700">Re-Attempt Assigned</span>
                          ) : row.requiresManualIntervention ? (
                            <button
                              className="math-role-action-button px-3 py-2"
                              onClick={() => SetFreshPracticeRequest(row)}
                              disabled={reattemptMutation.isPending}
                              title="Allow the next re-attempt with a different question set from the same DPS concept"
                            >
                              <RotateCcw size={15} />
                              {`Allow Re-Attempt ${Number(row.nextAttemptNumber || row.retryAttemptNumber || 0) || 3}`}
                            </button>
                          ) : row.reattemptStatus === "APPROVED" ? (
                            <span className="math-badge border-amber-200 bg-amber-50 text-amber-700">Approval Pending Assignment</span>
                          ) : (
                            <span className="text-xs font-bold text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No assigned student list is available for this assignment target yet." />
            )}
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-cyan-50 p-3 text-cyan-700">
                <CalendarClock size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950">Attempt History</h2>
                <p className="text-slate-600">Every submitted or in-progress attempt for this assignment.</p>
              </div>
            </div>

            {data?.attempts?.length ? (
              <div className="math-table math-assignment-detail-table">
                <table>
                  <thead>
                    <tr>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Student</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Status</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Score</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Correct</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Benchmark</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Attempt Date</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Completion Date</span></th>
                      <th><span className="math-table-header-label math-table-header-label-nowrap math-assignment-detail-header-label">Review</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.attempts.map((attempt) => (
                      <tr key={attempt.attemptId}>
                        <td>
                          <p className="font-black text-slate-950">{attempt.studentName}</p>
                          <p className="text-xs text-slate-500">{attempt.studentCode}</p>
                        </td>
                        <td><span className={`math-badge math-assignment-semantic-chip ${
                          attempt.status === "CLEARED" || attempt.status === "COMPLETED"
                            ? "math-assignment-semantic-success border-emerald-200 bg-emerald-50 text-emerald-700"
                            : attempt.requiresAttention
                              ? "math-assignment-semantic-danger border-rose-200 bg-rose-50 text-rose-700"
                              : "math-assignment-semantic-blue border-blue-200 bg-blue-50 text-blue-700"
                        }`}>{attempt.status}</span></td>
                        <td>{attempt.score ?? "-"} / {attempt.maxScore ?? "-"}</td>
                        <td>{attempt.correct ?? "-"} correct</td>
                        <td><BenchmarkBadge status={attempt.benchmarkStatus} requiresAttention={attempt.requiresAttention} percentage={attempt.benchmarkPercentage} /></td>
                        <td>{formatDate(attempt.attemptDate || attempt.startedAt)}</td>
                        <td>{formatDate(attempt.completedDate || attempt.submittedAt)}</td>
                        <td>
                          <button className="math-role-action-button px-3 py-2" onClick={() => router.push(`/admin/results/${attempt.attemptId}`)}>
                            <Eye size={15} />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState message="No attempts have been made for this assignment yet." />
            )}
          </section>
        </div>
      ) : null}
      {FreshPracticeRequest && assignment ? (
        <div className="fixed inset-x-0 bottom-0 top-20 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-[2rem] border border-white/70 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-4">
              <div className="rounded-2xl bg-blue-50 p-3 text-blue-700">
                <RotateCcw size={24} />
              </div>
              <div>
                <p className="math-kicker">Approval required</p>
                <h2 className="text-2xl font-black text-slate-950">Allow Re-Attempt</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  {FreshPracticeRequest.studentName} has used all 3 available attempts. This action will assign Re-Attempt {NextAttemptNumber} for the same DPS concept with a different question set. Previous attempts will remain preserved in history.
                </p>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-700">
              {assignment.levelCode || "Level"} · Lesson {assignment.lessonNumber ?? "-"} · DPS {assignment.dpsNumber ?? "-"} — {assignment.dpsTitle || assignment.title}
            </div>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="math-button-secondary" onClick={() => SetFreshPracticeRequest(null)} disabled={reattemptMutation.isPending}>
                Cancel
              </button>
              <button
                className="math-role-action-button px-5 py-3"
                disabled={reattemptMutation.isPending}
                onClick={() => reattemptMutation.mutate({ assignmentId: assignment.assignmentId, studentId: FreshPracticeRequest.studentId })}
              >
                <RotateCcw size={17} />
                {`Confirm Re-Attempt ${NextAttemptNumber}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="math-card p-5">
      <div className="inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">{icon}</div>
      <p className="mt-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/70 p-4">
      <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-2 font-black text-slate-950">{value}</p>
    </div>
  );
}

function PerformanceChip({ Value, Tone = "blue" }: { Value: string; Tone?: "blue" | "green" | "red" | "slate" }) {
  const ToneClasses = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return <span className={`math-badge math-assignment-semantic-chip math-assignment-semantic-${Tone} whitespace-nowrap ${ToneClasses[Tone]}`}>{Value}</span>;
}

function RoundedDisplay(Value: unknown) {
  const NumberValue = Number(Value);
  return Number.isFinite(NumberValue) ? String(Math.round(NumberValue)) : "—";
}

function AccuracyTone(Value: unknown): "green" | "red" | "slate" {
  const NumberValue = Number(Value);
  if (!Number.isFinite(NumberValue)) return "slate";
  return NumberValue >= 70 ? "green" : "red";
}

