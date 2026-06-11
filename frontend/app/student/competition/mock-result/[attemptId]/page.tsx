"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getCompetitionMockResult } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import { BookOpenCheck, CheckCircle2, Clock3, Target, XCircle } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Number(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins && secs) return `${mins} Mins ${secs} Secs`;
  if (mins) return `${mins} Mins`;
  return `${secs} Secs`;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
  const numeric = Number(value);
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

type ResultTab = "questions" | "analysis";

export default function StudentCompetitionMockResultPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;
  const [activeTab, setActiveTab] = useState<ResultTab>("questions");

  const query = useQuery({
    queryKey: ["student-competition-mock-result", attemptId],
    queryFn: () => getCompetitionMockResult(attemptId),
    enabled: ready && Boolean(attemptId),
  });

  if (!ready) return null;

  if (query.isLoading) {
    return (
      <AppShell title="Competition Mock Result">
        <LoadingState label="Loading mock result..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell title="Competition Mock Result">
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  const result = query.data;
  if (!result) {
    return (
      <AppShell title="Competition Mock Result">
        <LoadingState label="Preparing result summary..." />
      </AppShell>
    );
  }

  const mock = result.mockExam || {};
  const questionReview = result.questionReview || [];

  return (
    <AppShell title="Competition Mock Result">
      <section className="space-y-5">
        <div className="math-card p-6">
          <button className="math-button-secondary mb-4 px-4 py-2 text-sm" onClick={() => router.push("/student/competition/mock-exams")}>
            Back To Mock Exams
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="math-kicker">Competition Result</p>
              <h1 className="math-title">{mock.title || "Mock Result"}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {mock.mockCode ? <Chip label={mock.mockCode} /> : null}
                <Chip label={`${mock.moduleCode || "Module"} · ${mock.levelCode || "Level"}`} />
                <Chip label={result.performanceBand || "Completed"} />
              </div>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-300">
                Submitted {formatDate(result.completedAt || result.submittedAt)}. Competition mocks remain independent from Practice, Assessment Readiness, and Promotion.
              </p>
            </div>
            <div className="rounded-[24px] border border-orange-200 bg-orange-50/70 px-6 py-4 text-center dark:border-orange-800 dark:bg-orange-950/30">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">Score</p>
              <p className="mt-1 text-4xl font-black text-slate-950 dark:text-white">{formatNumber(result.score)}/{formatNumber(result.maxScore)}</p>
              <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">{formatNumber(result.percentage)}%</p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <MetricCard icon={<Target size={18} />} label="ACCURACY" value={`${formatNumber(result.accuracyPercentage)}%`} helper="Attempted answers" />
          <MetricCard icon={<CheckCircle2 size={18} />} label="CORRECT" value={result.correct} helper={`${result.totalQuestions} total questions`} />
          <MetricCard icon={<XCircle size={18} />} label="UNANSWERED" value={result.unanswered} helper="Scored as zero" />
          <MetricCard icon={<Clock3 size={18} />} label="TIME TAKEN" value={formatDuration(result.timeTakenSeconds)} helper={`${formatNumber(result.timeUtilizationPercentage)}% time used`} />
        </div>

        <div className="math-card p-2">
          <div className="flex flex-wrap gap-2">
            <ResultTabButton active={activeTab === "questions"} onClick={() => setActiveTab("questions")} label="Question Review" />
            <ResultTabButton active={activeTab === "analysis"} onClick={() => setActiveTab("analysis")} label="Result Analysis" />
          </div>
        </div>

        {activeTab === "questions" ? <QuestionReviewTab questions={questionReview} /> : null}
        {activeTab === "analysis" ? <ResultAnalysisTab result={result} /> : null}
      </section>
    </AppShell>
  );
}

function ResultTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-orange-200 transition dark:shadow-orange-950/30"
          : "inline-flex items-center justify-center rounded-full border border-orange-200 bg-white px-5 py-2.5 text-sm font-black text-orange-700 transition hover:border-orange-500 hover:bg-orange-600 hover:text-white hover:shadow-md hover:shadow-orange-100 dark:border-slate-700 dark:bg-slate-950 dark:text-orange-200 dark:hover:border-orange-500 dark:hover:bg-orange-600 dark:hover:text-white"
      }
    >
      {label}
    </button>
  );
}

function QuestionReviewTab({ questions }: { questions: NonNullable<Awaited<ReturnType<typeof getCompetitionMockResult>>["questionReview"]> }) {
  return (
    <section className="math-card p-5">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">
          <BookOpenCheck size={22} />
        </div>
        <div>
          <p className="math-kicker">Question Review</p>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">Questions, Student Answers And Correct Answers</h2>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Review every mock question with the selected answer and the correct answer.</p>
        </div>
      </div>

      {questions.length === 0 ? (
        <p className="rounded-[22px] border border-orange-100 bg-orange-50/50 p-5 text-sm font-bold text-slate-700 dark:border-orange-900 dark:bg-orange-950/20 dark:text-slate-300">
          Question review is not available for this submitted mock yet.
        </p>
      ) : (
        <div className="space-y-5">
          {questions.map((question) => (
            <article key={question.questionId} className="rounded-[28px] border border-orange-100 bg-white/86 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-black text-slate-950 dark:text-white">Question {question.questionNumber}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
                      Section {question.sectionNumber || "-"}
                    </span>
                    <span className="rounded-full border border-orange-200 bg-white px-3 py-1 text-[11px] font-black text-orange-700 dark:border-slate-700 dark:bg-slate-950 dark:text-orange-200">
                      {question.sectionTitle || question.concept || "Competition Mock"}
                    </span>
                  </div>
                </div>
                <span
                  className={
                    question.isUnanswered
                      ? "math-badge border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      : question.isCorrect
                        ? "math-badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200"
                        : "math-badge border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-200"
                  }
                >
                  {question.isUnanswered ? "Unanswered" : question.isCorrect ? "Correct" : "Wrong"}
                </span>
              </div>

              <div className="mt-5 rounded-[24px] bg-slate-50/90 p-5 dark:bg-slate-950/60">
                <MathQuestionDisplay
                  operands={(question.operands || []) as any}
                  operators={(question.operators || []) as any}
                  displayType={(question as any).displayType ?? (question as any).display_type}
                  questionText={(question as any).questionText ?? (question as any).question_text}
                />
              </div>

              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                <AnswerBox title="Student Answer" tone={question.isCorrect ? "correct" : question.isUnanswered ? "neutral" : "wrong"}>
                  {question.selectedOption ? `${question.selectedOption.label}. ${question.selectedOption.value}` : "Not Answered"}
                </AnswerBox>
                <AnswerBox title="Correct Answer" tone="correct">
                  {question.correctOption ? `${question.correctOption.label}. ${question.correctOption.value}` : "Not Available"}
                </AnswerBox>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function AnswerBox({ title, children, tone }: { title: string; children: React.ReactNode; tone: "correct" | "wrong" | "neutral" }) {
  const className =
    tone === "correct"
      ? "border-emerald-100 bg-emerald-50/80 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-100"
      : tone === "wrong"
        ? "border-rose-100 bg-rose-50/80 text-rose-950 dark:border-rose-800 dark:bg-rose-950/25 dark:text-rose-100"
        : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100";
  return (
    <div className={`rounded-[22px] border p-4 ${className}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] opacity-80">{title}</p>
      <p className="mt-2 text-lg font-black">{children}</p>
    </div>
  );
}

function ResultAnalysisTab({ result }: { result: Awaited<ReturnType<typeof getCompetitionMockResult>> }) {
  return (
    <>
      <div className="math-card overflow-hidden p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="math-kicker">Concept Analysis</p>
            <h2 className="text-xl font-black text-slate-950 dark:text-white">Section Performance</h2>
          </div>
        </div>
        <div className="mt-5 overflow-hidden rounded-[24px] border border-orange-100 dark:border-slate-700">
          {(result.conceptPerformance || []).length === 0 ? (
            <div className="p-5 text-sm font-bold text-slate-700 dark:text-slate-300">No concept analysis is available for this mock yet.</div>
          ) : (
            <div className="divide-y divide-orange-100 dark:divide-slate-700">
              {result.conceptPerformance.map((item) => (
                <div key={item.concept} className="grid gap-2 p-4 text-sm font-bold text-slate-800 dark:text-slate-100 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <span>{item.concept}</span>
                  <span>{item.correct}/{item.total} Correct</span>
                  <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
                    {formatNumber(item.percentage)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InsightCard title="Strengths" items={result.conceptStrengths || []} empty="No strong areas identified yet." />
        <InsightCard title="Weak Areas" items={result.conceptWeaknesses || []} empty="No weak areas identified from this mock." />
      </div>
    </>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-200">
      {label}
    </span>
  );
}

function MetricCard({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <article className="math-card p-5">
      <div className="inline-flex rounded-2xl bg-orange-50 p-2 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">{icon}</div>
      <p className="mt-3 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">{helper}</p>
    </article>
  );
}

function InsightCard({ title, items, empty }: { title: string; items: Array<{ concept: string; correct: number; total: number; percentage: number }>; empty: string }) {
  return (
    <article className="math-card p-5">
      <p className="math-kicker">Result Insight</p>
      <h3 className="text-lg font-black text-slate-950 dark:text-white">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-4 rounded-[20px] border border-orange-100 bg-orange-50/50 p-4 text-sm font-bold text-slate-700 dark:border-orange-900 dark:bg-orange-950/20 dark:text-slate-300">{empty}</p>
      ) : (
        <div className="mt-4 grid gap-2">
          {items.map((item) => (
            <div key={item.concept} className="flex items-center justify-between rounded-[18px] border border-orange-100 bg-white/80 px-4 py-3 text-sm font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100">
              <span>{item.concept}</span>
              <span>{formatNumber(item.percentage)}%</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}
