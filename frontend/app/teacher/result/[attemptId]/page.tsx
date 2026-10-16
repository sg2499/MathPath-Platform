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
import { getTeacherAttemptResult } from "@/lib/api/teacher";
import { formatSeconds } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpenCheck, Clock, FileQuestion, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";

// One practice attempt, as a teacher sees it (2026-10, teacher revamp):
//   - the same page width as every other teacher page;
//   - Back goes to this student's practice page, at the top;
//   - the score, accuracy and benchmark appear once (in the result overview),
//     not three times;
//   - the wording is about the student ("Sayantan met the benchmark…"), not
//     to the student ("Excellent work! You have…");
//   - time taken as 12:54, not 774s; no "Class -" when there is no class.
export default function TeacherAttemptDetailPage() {
  const ready = useProtectedPage(["TEACHER"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();

  const query = useQuery({
    queryKey: ["teacher-attempt-result", params.attemptId],
    queryFn: () => getTeacherAttemptResult(params.attemptId),
    enabled: ready && Boolean(params.attemptId),
  });

  const data: any = query.data;
  const questionReview = Array.isArray(data?.questionReview) ? data.questionReview : [];

  if (!ready) return null;

  const StudentName: string = data?.student?.studentName || "The student";
  const StudentCode: string = data?.student?.studentCode || "";
  const ClassText = [data?.student?.className, data?.student?.section].filter(Boolean).join(" ");
  const FirstName = StudentName.split(" ")[0] || StudentName;
  const TimeTaken = data?.summary?.timeTakenSeconds;
  const BackHref = StudentCode ? `/teacher/assignment-tracker/student/${encodeURIComponent(StudentCode)}` : "/teacher/assignment-tracker";

  return (
    <AppShell title="Attempt Review">
      {query.isLoading ? <LoadingState label="Loading detailed attempt review..." /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

      {data ? (
        <div className="space-y-6">
          <div className="te-back-row">
            <button type="button" className="te-back" onClick={() => router.push(BackHref)}>
              <ArrowLeft size={16} />
              {StudentCode ? `Back To ${FirstName}'s Practice` : "Back To Practice Tracker"}
            </button>
          </div>

          <section className="math-hero">
            <div className="relative z-10">
              <p className="math-block-header">
                <FileQuestion size={14} />
                Practice Result
              </p>
              <h1 className="math-title">Attempt Review</h1>
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
            <InfoCard icon={<Clock size={20} />} label="Started" value={formatMathPathDateTime(data.attemptDate || data.startedAt)} subValue="When the sheet was opened" />
            <InfoCard
              icon={<Clock size={20} />}
              label="Submitted"
              value={formatMathPathDateTime(data.completedDate || data.submittedAt)}
              subValue={TimeTaken ? `Time taken ${formatSeconds(Number(TimeTaken))}` : "Time taken —"}
            />
          </section>

          <BenchmarkAlert show={data.requiresAttention || data.summary?.requiresAttention} message={data.benchmarkMessage || data.summary?.benchmarkMessage} />

          <ResultSummary result={data} viewer={{ kind: "TEACHER", studentName: StudentName }} />

          <ResultReviewTabs Questions={ToPracticeReviewQuestions(questionReview)} Viewer="TEACHER" />
        </div>
      ) : null}
    </AppShell>
  );
}

function InfoCard({ icon, label, value, subValue }: { icon: ReactNode; label: string; value: string; subValue: ReactNode }) {
  return (
    <div className="math-teacher-light-metric-card te-info-card relative overflow-hidden rounded-[22px] border p-5">
      <div className="math-teacher-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10">{label}</p>
      <p className="relative z-10 te-info-value">{value}</p>
      <p className="relative z-10">{subValue}</p>
    </div>
  );
}
