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
  Eye,
  GraduationCap,
  RotateCcw,
  ShieldCheck,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";

function wholeNumberLabel(value: unknown) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return "-";
  return String(Math.round(numberValue));
}

function formatDate(value?: string | null) {
  return formatMathPathDateTime(value);
}

export default function AdminAssessmentDetailPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useParams<{ assessmentId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const reattemptMutation = useMutation({
    mutationFn: ({ assessmentId, studentId }: { assessmentId: string; studentId: string }) =>
      allowAdminAssignmentReattempt(assessmentId, studentId, "Teacher requested assessment re-attempt after remediation."),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-assessment-detail", params.assessmentId] });
    },
  });

  const query = useQuery({
    queryKey: ["admin-assessment-detail", params.assessmentId],
    queryFn: () => getAdminAssignmentDetailFull(params.assessmentId),
    enabled: ready && Boolean(params.assessmentId),
  });

  if (!ready) return null;

  const data = query.data;
  const assessment = data?.assignment;

  return (
    <AppShell title="Assessment Detail">
      {query.isLoading ? <LoadingState label="Loading assessment detail..." /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

      {assessment ? (
        <div className="space-y-6">
          <section className="math-hero">
            <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="math-kicker">Assessment detail</p>
                <h1 className="math-title">{assessment.title}</h1>
                <p className="math-subtitle">
                  {assessment.levelCode || "-"} · Lesson {assessment.lessonNumber ?? "-"} · DPS {assessment.dpsNumber ?? "-"} — re-attempts by admin approval only
                </p>
              </div>
              <button className="math-button-secondary" onClick={() => router.push("/admin/assessments")}>
                <ArrowLeft size={17} />
                Back to Assessments
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
              <Info label="Created By" value={`${assessment.assignedByName} (${assessment.assignedByRole})`} />
              <Info label="Target" value={`${assessment.assignedToType}: ${assessment.assignedToLabel}`} />
              <Info label="Rule" value="Admin Unlock Only" />
              <Info label="Created On" value={formatDate(assessment.createdAt)} />
            </div>
          </section>

          <section>
            {data?.students?.some((row) => row.requiresAttention) ? (
              <div className="mb-5"><BenchmarkAlert show message="Caution: One or more assessment attempts are below the 70% benchmark. Please coordinate with the teacher for corrective support." /></div>
            ) : null}
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-2xl bg-violet-50 p-3 text-violet-700">
                <GraduationCap size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950">Assessment Students</h2>
                <p className="text-slate-600">Status, score, accuracy, attempt date, completion date, and admin re-attempt controls.</p>
              </div>
            </div>

            {data?.students?.length ? (
              <div className="math-table">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Accuracy</th>
                      <th>Benchmark</th>
                      <th>Attempt Date</th>
                      <th>Completion Date</th>
                      <th>Review</th>
                      <th>Re-Attempt</th>
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
                          <span className={`math-badge ${
                            row.status === "COMPLETED"
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : row.status === "REATTEMPT_AVAILABLE"
                                ? "border-violet-200 bg-violet-50 text-violet-700"
                                : "border-amber-200 bg-amber-50 text-amber-700"
                          }`}>
                            {row.status === "REATTEMPT_AVAILABLE" ? "REATTEMPT AVAILABLE" : row.status}
                          </span>
                        </td>
                        <td>{wholeNumberLabel(row.score)} / {wholeNumberLabel(row.maxScore)}</td>
                        <td>{wholeNumberLabel(row.accuracyPercentage)}%</td>
                        <td><BenchmarkBadge status={row.benchmarkStatus} requiresAttention={row.requiresAttention} percentage={row.benchmarkPercentage} /></td>
                        <td>{formatDate(row.attemptDate || row.startedAt)}</td>
                        <td>{formatDate(row.completedDate || row.submittedAt)}</td>
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
                          {row.status === "COMPLETED" && row.reattemptStatus !== "APPROVED" ? (
                            <button
                              className="math-role-action-button px-3 py-2"
                              onClick={() => reattemptMutation.mutate({ assessmentId: assessment.assignmentId, studentId: row.studentId })}
                              disabled={reattemptMutation.isPending}
                              title="Unlock this assessment for a corrective student re-attempt"
                            >
                              <RotateCcw size={15} />
                              Allow
                            </button>
                          ) : row.reattemptStatus === "APPROVED" || row.status === "REATTEMPT_AVAILABLE" ? (
                            <span className="math-badge border-violet-200 bg-violet-50 text-violet-700">
                              <ShieldCheck size={14} />
                              Re-Attempt Available
                            </span>
                          ) : row.reattemptStatus === "USED" ? (
                            <span className="math-badge border-slate-200 bg-slate-50 text-slate-600">Used</span>
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
              <EmptyState message="No assigned students are available for this assessment target yet." />
            )}
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function Metric({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="math-card p-5">
      <div className="inline-flex rounded-2xl bg-violet-50 p-3 text-violet-700">{icon}</div>
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
