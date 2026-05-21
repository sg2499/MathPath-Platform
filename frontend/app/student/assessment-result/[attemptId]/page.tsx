"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { VerticalQuestion } from "@/components/student/VerticalQuestion";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import { getAssessmentAttemptResult } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Award, CheckCircle2, Clock3, Rocket, ShieldAlert, Sparkles, Target } from "lucide-react";
import { PremiumResultFeedbackCard } from "@/components/common/PerformanceFeedback";
import { useParams, useRouter } from "next/navigation";


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


function MessageIndex(Seed: string, Count: number) {
  if (Count <= 1) return 0;
  const Total = Array.from(Seed || "MathPath").reduce((Sum, Character) => Sum + Character.charCodeAt(0), 0);
  return Total % Count;
}

function NormalizeProgressionStatus(Value: unknown) {
  return String(Value ?? "").toUpperCase();
}

function HasStartedPromotedLevel(Result: any) {
  return Boolean(Result?.hasStartedPromotedLevel);
}

function StudentProgressionNextStep(Result: any) {
  const Seed = Result?.attemptId || Result?.assignmentTitle || Result?.assessmentTitle || Result?.accuracyPercentage;
  if ((Result?.isPromoted || NormalizeProgressionStatus(Result?.progressionStatus) === "PROMOTED") && !HasStartedPromotedLevel(Result)) {
    const Messages = [
      "Your next level is ready. Continue your learning journey with focus and confidence.",
      "A new learning milestone is open for you. Keep building speed, accuracy, and calm confidence.",
      "You have moved forward in your MathPath journey. Stay curious and keep learning step by step.",
    ];
    return Messages[MessageIndex(Seed, Messages.length)];
  }
  if (!HasStartedPromotedLevel(Result) && (Result?.isReadyForNextLevel || NormalizeProgressionStatus(Result?.progressionStatus) === "READY_FOR_NEXT_LEVEL" || Result?.status === "CLEARED")) {
    const Messages = [
      "You are ready for the Next Level. Your teacher will guide the next step.",
      "Your next learning milestone is within reach. Keep your confidence high while your teacher guides you.",
      "You cleared this level assessment with steady effort. Stay ready for the next learning challenge.",
    ];
    return Messages[MessageIndex(Seed, Messages.length)];
  }
  if (HasStartedPromotedLevel(Result)) {
    return "Continue your current level practice with focus. Your new learning journey has already started.";
  }
  return "Keep reviewing your work calmly. Each correction helps you grow stronger for the next step.";
}

function StudentProgressionBadge(Result: any) {
  if ((Result?.isPromoted || NormalizeProgressionStatus(Result?.progressionStatus) === "PROMOTED") && !HasStartedPromotedLevel(Result)) {
    return { Label: "Promoted", ClassName: "border-emerald-200 bg-emerald-50 text-emerald-700" };
  }
  if (!HasStartedPromotedLevel(Result) && (Result?.isReadyForNextLevel || NormalizeProgressionStatus(Result?.progressionStatus) === "READY_FOR_NEXT_LEVEL" || Result?.status === "CLEARED")) {
    return { Label: "Ready For Next Level", ClassName: "border-violet-200 bg-violet-50 text-violet-700" };
  }
  return null;
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
      NextStep: StudentProgressionNextStep(Result),
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
      NextStep: StudentProgressionNextStep(Result),
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
    NextStep: "Revise calmly and wait for your teacher to guide the re-attempt plan.",
    Tone: "danger" as const,
    Icon: <ShieldAlert size={24} />,
  };
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
  const Ready = useProtectedPage(["STUDENT"]);
  const Params = useParams<{ attemptId: string }>();
  const Router = useRouter();
  const Query = useQuery({
    queryKey: ["assessment-result", Params.attemptId],
    queryFn: () => getAssessmentAttemptResult(Params.attemptId),
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

          <div className="flex flex-wrap items-center gap-3">
            <button className="math-role-action-button px-4 py-3" onClick={() => Router.push("/student/assessments")}>
              <ArrowLeft size={16} />
              Back To Assessments
            </button>
            <div className={`math-badge ${Query.data.status === "CLEARED" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
              {Query.data.performanceBand}
            </div>
            {StudentProgressionBadge(Query.data) ? (
              <div className={`math-badge ${StudentProgressionBadge(Query.data)!.ClassName}`}>{StudentProgressionBadge(Query.data)!.Label}</div>
            ) : null}
          </div>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <Award size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950">Question Review</h2>
                <p className="text-slate-600">Review each question, your answer, and the correct answer calmly.</p>
              </div>
            </div>

            <div className="space-y-5">
              {Query.data.questionReview?.map((Question) => (
                <div key={Question.questionId} className="math-student-panel">
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
                    <div className="rounded-[22px] bg-emerald-50 p-4 text-emerald-900">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">Correct Answer</p>
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
    <div className="math-student-metric-card">
      <div className="math-student-icon-chip">{icon}</div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-lg font-black leading-tight text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
