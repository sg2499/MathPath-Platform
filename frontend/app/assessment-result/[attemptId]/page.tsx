"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { VerticalQuestion } from "@/components/student/VerticalQuestion";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { api, apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import { getStoredUser, getStoredUserForRole, getTokenForRole, setActiveRole } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, CheckCircle2, Clock3, Rocket, ShieldAlert, Sparkles, Target } from "lucide-react";
import { PremiumResultFeedbackCard } from "@/components/common/PerformanceFeedback";
import { AssessmentFeedbackRemarkCard, type AssessmentTeacherFeedback } from "@/components/common/AssessmentFeedbackRemarkCard";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

type AssessmentResultQuestion = {
  questionId: string;
  questionNumber: number;
  operands: number[];
  operators: string[];
  isCorrect: boolean;
  selectedOption?: { label: string; value: string } | null;
  correctOption?: { label: string; value: string } | null;
};

type AssessmentRoleResultPayload = {
  attemptId: string;
  assignmentTitle?: string | null;
  status: string;
  score: number;
  maxScore: number;
  accuracyPercentage: number;
  correct: number;
  wrong: number;
  unanswered: number;
  completedDate?: string | null;
  submittedAt?: string | null;
  performanceBand?: string | null;
  questionReview?: AssessmentResultQuestion[];
  teacherFeedback?: AssessmentTeacherFeedback | null;
};


function CleanNumber(Value: unknown) {
  const NumberValue = Number(Value);
  if (!Number.isFinite(NumberValue)) return "0";
  return String(Math.round(NumberValue));
}

function CappedScore(Score: unknown, MaxScore: unknown) {
  const ScoreValue = Number(Score);
  const MaxValue = Number(MaxScore);
  if (!Number.isFinite(ScoreValue)) return 0;
  if (Number.isFinite(MaxValue) && MaxValue > 0) return Math.min(Math.max(ScoreValue, 0), MaxValue);
  return Math.max(ScoreValue, 0);
}

function NormalizeViewerRole(Value?: string | null) {
  const NormalizedValue = String(Value || "").toUpperCase();
  if (NormalizedValue === "SUPER_ADMIN" || NormalizedValue === "ADMIN") return "ADMIN" as const;
  if (NormalizedValue === "TEACHER") return "TEACHER" as const;
  if (NormalizedValue === "STUDENT") return "STUDENT" as const;
  return null;
}


function MessageIndex(Seed: string, Count: number) {
  if (Count <= 1) return 0;
  const Total = Array.from(Seed || "MathPath").reduce((Sum, Character) => Sum + Character.charCodeAt(0), 0);
  return Total % Count;
}

function ResultFeedback(Result: any) {
  const Accuracy = Math.min(Math.max(Number(Result?.accuracyPercentage || 0), 0), 100);
  const Seed = String(Result?.attemptId || Result?.assignmentTitle || Accuracy);
  if (Accuracy >= 90) {
    const Messages = [
      "You showed excellent focus and strong control of this level. Keep practising so your speed stays as sharp as your accuracy.",
      "Brilliant effort! Your careful work helped you master this assessment. Keep challenging yourself with the same confidence.",
      "You handled the questions beautifully. A little regular revision will help you stay ready for the next milestone.",
    ];
    return {
      Title: "Brilliant Work!",
      Message: Messages[MessageIndex(Seed, Messages.length)],
      NextStep: "Celebrate the progress, then revise the tricky questions once more.",
      Tone: "success" as const,
      Icon: <Sparkles size={24} />,
    };
  }
  if (Accuracy >= 70) {
    const Messages = [
      "You cleared the assessment and proved that your concepts are growing stronger. Review the missed questions to make your next level even smoother.",
      "Great progress! You crossed the benchmark with steady effort. A quick mistake review will help you build stronger accuracy.",
      "Well done on clearing this level assessment. Keep your practice rhythm active so your confidence keeps growing.",
    ];
    return {
      Title: "Great Progress!",
      Message: Messages[MessageIndex(Seed, Messages.length)],
      NextStep: "Review your answers and get ready for the next learning challenge.",
      Tone: "warning" as const,
      Icon: <Rocket size={24} />,
    };
  }
  const Messages = [
    "This result shows exactly where more practice will help. Take it calmly, review your mistakes, and your teacher will guide your next re-attempt.",
    "Keep going — every mistake is a clue for improvement. With focused revision, you can come back stronger in the next assessment.",
    "You are still learning this level, and that is completely okay. Review each question patiently and prepare for a better next attempt.",
  ];
  return {
    Title: "Keep Going — You’re Learning!",
    Message: Messages[MessageIndex(Seed, Messages.length)],
    NextStep: "Revise calmly and wait for your teacher/admin to guide the re-attempt plan.",
    Tone: "danger" as const,
    Icon: <ShieldAlert size={24} />,
  };
}

async function getAssessmentAttemptResultForCurrentRole(AttemptId: string, ViewerRole?: "ADMIN" | "TEACHER" | "STUDENT" | null): Promise<AssessmentRoleResultPayload> {
  const StoredUser = ViewerRole ? getStoredUserForRole(ViewerRole) : getStoredUser();
  const Role = ViewerRole || (StoredUser?.role === "SUPER_ADMIN" ? "ADMIN" : StoredUser?.role);
  const Prefix = Role === "ADMIN" ? "/admin" : Role === "TEACHER" ? "/teacher" : "/student";
  const RoleToken = ViewerRole ? getTokenForRole(ViewerRole) : null;
  const { data } = await api.get(`${Prefix}/assessment-attempts/${AttemptId}/result`, RoleToken ? { headers: { Authorization: `Bearer ${RoleToken}` } } : undefined);
  return data;
}

function assessmentBackRoute(ViewerRole?: "ADMIN" | "TEACHER" | "STUDENT" | null) {
  const StoredUser = ViewerRole ? getStoredUserForRole(ViewerRole) : getStoredUser();
  const Role = ViewerRole || (StoredUser?.role === "SUPER_ADMIN" ? "ADMIN" : StoredUser?.role);
  if (Role === "ADMIN") return "/admin/assessments";
  if (Role === "TEACHER") return "/teacher/assessments";
  return "/student/assessments";
}

function AssessmentFeedbackCard({ Result }: { Result: any }) {
  const Feedback = ResultFeedback(Result);
  return (
    <PremiumResultFeedbackCard
      Kicker="Assessment Feedback"
      Title={Feedback.Title}
      Message={Feedback.Message}
      NextStep={Feedback.NextStep}
      Icon={Feedback.Icon}
      Tone={Feedback.Tone}
    />
  );
}



export default function StudentAssessmentResultPage() {
  return (
    <Suspense fallback={null}>
      <StudentAssessmentResultPageContent />
    </Suspense>
  );
}

function StudentAssessmentResultPageContent() {
  const Params = useParams<{ attemptId: string }>();
  const Router = useRouter();
  const SearchParams = useSearchParams();
  const ViewerRole = NormalizeViewerRole(SearchParams.get("viewer"));

  useEffect(() => {
    if (ViewerRole) {
      setActiveRole(ViewerRole);
    }
  }, [ViewerRole]);

  const AllowedRoles = ViewerRole ? [ViewerRole] : ["STUDENT", "TEACHER", "ADMIN", "SUPER_ADMIN"] as const;
  const Ready = useProtectedPage([...AllowedRoles]);
  const Query = useQuery({
    queryKey: ["assessment-result", Params.attemptId, ViewerRole],
    queryFn: () => getAssessmentAttemptResultForCurrentRole(Params.attemptId, ViewerRole),
    enabled: Ready && Boolean(Params.attemptId),
  });

  if (!Ready) return null;

  return (
    <AppShell title="Assessment Result">
      {Query.isLoading ? <LoadingState label="Loading assessment result..." /> : null}
      {Query.error ? <ErrorState message={apiErrorMessage(Query.error)} /> : null}

      {Query.data ? (
        <div className="space-y-6">
          <section className="relative overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-br from-white via-sky-50 to-cyan-100 p-5 shadow-xl dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
            <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="math-kicker">Assessment Result</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-4xl">Score: {CleanNumber(CappedScore(Query.data.score, Query.data.maxScore))} / {CleanNumber(Query.data.maxScore)}</h1>
                <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{Query.data.assignmentTitle}</p>
              </div>
              <div className={`rounded-2xl px-4 py-3 text-right shadow-sm ring-1 ${Query.data.status === "CLEARED" ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-rose-50 text-rose-800 ring-rose-200"}`}>
                <p className="text-[10px] font-black uppercase tracking-[0.16em]">{Query.data.status === "CLEARED" ? "Cleared" : "Needs Re-Attempt"}</p>
                <p className="text-2xl font-black">{CleanNumber(Math.min(Math.max(Number(Query.data.accuracyPercentage || 0), 0), 100))}%</p>
              </div>
            </div>

            <div className="relative z-10 mt-5 grid gap-3 sm:grid-cols-5">
              <Metric icon={<Target size={16} />} label="ACCURACY" value={`${CleanNumber(Math.min(Math.max(Number(Query.data.accuracyPercentage || 0), 0), 100))}%`} />
              <Metric icon={<CheckCircle2 size={16} />} label="CORRECT" value={Query.data.correct} />
              <Metric icon={<ShieldAlert size={16} />} label="WRONG" value={Query.data.wrong} />
              <Metric icon={<Award size={16} />} label="UNANSWERED" value={Query.data.unanswered} />
              <Metric icon={<Clock3 size={16} />} label="COMPLETION DATE" value={formatMathPathDateTime(Query.data.completedDate || Query.data.submittedAt)} />
            </div>
          </section>

          <AssessmentFeedbackCard Result={Query.data} />

          {ViewerRole ? (
            <AssessmentFeedbackRemarkCard
              AttemptId={Query.data.attemptId}
              ViewerRole={ViewerRole}
              Feedback={Query.data.teacherFeedback}
              AccuracyPercentage={Query.data.accuracyPercentage}
              QueryKey={["assessment-result", Params.attemptId, ViewerRole]}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button className="math-role-action-button px-4 py-3" onClick={() => Router.push(assessmentBackRoute(ViewerRole))}>
              <ArrowLeft size={16} />
              Back To Assessments
            </button>
            <div className={`math-badge ${Query.data.status === "CLEARED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
              {Query.data.performanceBand}
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Award size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950">Question Review</h2>
                <p className="text-slate-600">See each question, your selected answer, and the correct answer.</p>
              </div>
            </div>

            <div className="space-y-5">
              {Query.data.questionReview?.map((Question) => (
                <div key={Question.questionId} className="math-card p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-black text-slate-950">Question {Question.questionNumber}</h3>
                    <span className={`math-badge ${Question.isCorrect ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>{Question.isCorrect ? "Correct" : "Wrong"}</span>
                  </div>

                  <div className="mt-5 rounded-[28px] bg-slate-50/90 p-6">
                    <VerticalQuestion operands={Question.operands} operators={Question.operators} />
                  </div>

                  <div className="mt-5 grid gap-3 xl:grid-cols-2">
                    <div className="rounded-[22px] bg-slate-50 p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Your Answer</p>
                      <p className="mt-2 text-lg font-black text-slate-900">{Question.selectedOption ? `${Question.selectedOption.label}. ${Question.selectedOption.value}` : "Not Answered"}</p>
                    </div>
                    <div className={`rounded-[22px] bg-emerald-50 p-4 text-emerald-900 ${ViewerRole === "ADMIN" ? "dark:!bg-emerald-50 dark:!text-emerald-900 dark:!ring-1 dark:!ring-emerald-200" : ""}`}>
                      <p className={`text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700 ${ViewerRole === "ADMIN" ? "dark:!text-emerald-700" : ""}`}>Correct Answer</p>
                      <p className="mt-2 text-lg font-black">{Question.correctOption ? `${Question.correctOption.label}. ${Question.correctOption.value}` : "Hidden"}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </AppShell>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="math-teacher-light-metric-card rounded-[20px] border border-rose-200/70 bg-white/85 p-3 shadow-sm ring-1 ring-rose-100/80 backdrop-blur-md dark:border-slate-700 dark:bg-slate-900/60 dark:ring-slate-700">
      <div className="inline-flex rounded-xl bg-blue-50 p-1.5 text-blue-700 dark:bg-cyan-950/50 dark:text-cyan-300">{icon}</div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-lg font-black leading-tight text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
