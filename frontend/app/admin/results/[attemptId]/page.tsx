"use client";

import { ResultReviewTabs, ToPracticeReviewQuestions } from "@/components/common/ResultReviewTabs";
import { AppShell } from "@/components/common/AppShell";
import { BenchmarkAlert } from "@/components/common/BenchmarkBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResultSummary } from "@/components/student/ResultSummary";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import { getAdminAttemptResult } from "@/lib/api/admin";
import { formatSeconds } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck, CalendarClock, Clock, Stethoscope, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

// One practice attempt, as the admin sees it (2026-10, admin revamp, item D):
//   - the wording is about the student ("Aarav met the benchmark…"), not to
//     the student ("Excellent work! You have…"), and an approval that is due
//     is the admin's own ("once you approve it");
//   - Back goes to this student's practice page;
//   - the score, accuracy and benchmark appear once (in the result overview);
//   - time taken as 2:42, not 162s; "—" when a value is missing, and no
//     "Class -" when there is no class.
export default function AdminAttemptDetailPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["admin-attempt-result", params.attemptId],
    queryFn: () => getAdminAttemptResult(params.attemptId),
    enabled: ready && Boolean(params.attemptId),
  });

  const data: any = query.data;
  if (!ready) return null;

  const StudentName: string = data?.student?.studentName || "The student";
  const StudentCode: string = data?.student?.studentCode || "";
  const ClassText = [data?.student?.className, data?.student?.section].filter(Boolean).join(" ");
  const FirstName = StudentName.split(" ")[0] || StudentName;
  const TimeTaken = data?.summary?.timeTakenSeconds;
  const BackHref = StudentCode ? `/admin/assignments/student/${encodeURIComponent(StudentCode)}` : "/admin/assignments";

  return (
    <AppShell title="Attempt Review">
      {query.isLoading ? <LoadingState label="Loading detailed attempt review..." /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

      {data ? (
        <div className="math-admin-attempt-detail-page space-y-6">
          <div className="ad-back-row">
            <button type="button" className="ad-back" onClick={() => router.push(BackHref)}>
              <ArrowLeft size={16} />
              {StudentCode ? `Back To ${FirstName}'s Practice` : "Back To Practice Control"}
            </button>
          </div>

          <section className="math-hero">
            <div className="relative z-10">
              <p className="math-block-header"><Stethoscope size={14} />Practice Result</p>
              <h1 className="math-title">Attempt Details</h1>
              <p className="math-subtitle">The result, benchmark and every question of this attempt.</p>
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <InfoCard
              icon={<UserRound size={20} />}
              label="Student"
              value={StudentName}
              subValue={[StudentCode, ClassText ? `Class ${ClassText}` : ""].filter(Boolean).join(" · ") || "—"}
            />
            <InfoCard
              icon={<BookOpenCheck size={20} />}
              label="Practice Sheet"
              value={`Lesson ${data.dps?.lessonNumber ?? "—"} · DPS ${data.dps?.dpsNumber ?? "—"}`}
              subValue={data.dps?.dpsTitle || data.assignment?.title || "Assigned work"}
            />
            <InfoCard icon={<CalendarClock size={20} />} label="Started" value={formatMathPathDateTime(data.attemptDate || data.startedAt) || "—"} subValue="When the sheet was opened" />
            <InfoCard
              icon={<Clock size={20} />}
              label="Submitted"
              value={formatMathPathDateTime(data.completedDate || data.submittedAt) || "—"}
              subValue={TimeTaken ? `Time taken ${formatSeconds(Number(TimeTaken))}` : "Time taken —"}
            />
          </section>

          <BenchmarkAlert show={data.requiresAttention || data.summary?.requiresAttention} message={data.benchmarkMessage || data.summary?.benchmarkMessage} />

          <ResultSummary result={data} viewer={{ kind: "ADMIN", studentName: StudentName }} />

          <ResultReviewTabs Questions={ToPracticeReviewQuestions(data.questionReview as any)} Viewer="ADMIN" />
        </div>
      ) : null}
    </AppShell>
  );
}

function InfoCard({ icon, label, value, subValue }: { icon: ReactNode; label: string; value: string; subValue: ReactNode }) {
  return (
    <div className="math-teacher-light-metric-card ad-info-card relative overflow-hidden rounded-[22px] border p-5">
      <div className="math-teacher-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10">{label}</p>
      <p className="relative z-10 ad-info-value">{value}</p>
      <p className="relative z-10">{subValue}</p>
    </div>
  );
}
