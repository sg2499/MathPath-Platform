"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { AssignmentCard } from "@/components/student/AssignmentCard";
import { getStudentAssessments } from "@/lib/api/student";
import { apiErrorMessage } from "@/lib/api";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, GraduationCap, LockKeyhole } from "lucide-react";

export default function StudentAssessmentsPage() {
  const ready = useProtectedPage(["STUDENT"]);

  const query = useQuery({
    queryKey: ["student-assessments"],
    queryFn: getStudentAssessments,
    enabled: ready,
  });

  if (!ready) return null;

  const assessments = query.data ?? [];
  const activeAssessments = assessments.filter(
    (assessment) => assessment.status === "NOT_STARTED" || assessment.status === "IN_PROGRESS" || assessment.status === "REATTEMPT_AVAILABLE"
  );
  const completedAssessments = assessments.filter(
    (assessment) => assessment.status === "SUBMITTED" || assessment.status === "AUTO_SUBMITTED"
  );

  return (
    <AppShell title="Assessments">
      <section className="math-hero math-slide-up">
        <div className="relative z-10">
          <p className="math-kicker">Student assessments</p>
          <h1 className="math-title">Formal Assessments</h1>
          <p className="math-subtitle">
            Assessments are separate from practice. Re-Attempts appear only after admin approval.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-3">
            <Metric icon={<GraduationCap size={18} />} label="Available" value={activeAssessments.length} />
            <Metric icon={<CheckCircle2 size={18} />} label="Cleared" value={completedAssessments.length} />
            <Metric icon={<LockKeyhole size={18} />} label="Re-Attempt" value="Admin Only" />
          </div>
        </div>
      </section>

      <div className="mt-8">
        {query.isLoading ? <LoadingState label="Loading assessments..." /> : null}
        {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}
        {!query.isLoading && !query.error && !activeAssessments.length ? (
          <EmptyState message="No active assessments right now." />
        ) : null}
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        {activeAssessments.map((assessment, index) => (
          <div key={assessment.assignmentId} className="math-pop-in" style={{ animationDelay: `${index * 70}ms` }}>
            <AssignmentCard assignment={assessment} />
          </div>
        ))}
      </div>

      {completedAssessments.length ? (
        <section className="mt-10">
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">Cleared Assessments</h2>
          <div className="mt-5 grid gap-5 xl:grid-cols-2">
            {completedAssessments.map((assessment, index) => (
              <div key={assessment.assignmentId} className="math-pop-in" style={{ animationDelay: `${index * 70}ms` }}>
                <AssignmentCard assignment={assessment} />
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-[24px] bg-white/75 p-4 shadow-sm ring-1 ring-white/70 backdrop-blur-md transition hover:-translate-y-0.5 dark:bg-slate-900/60 dark:ring-slate-700">
      <div className="inline-flex rounded-2xl bg-violet-50 p-2 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
        {icon}
      </div>
      <p className="mt-3 text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
