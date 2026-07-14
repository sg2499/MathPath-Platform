"use client";

import { AppShell } from "@/components/common/AppShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { QuestionCard } from "@/components/student/QuestionCard";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { TestTimer } from "@/components/student/TestTimer";
import { useAttemptTimer } from "@/hooks/useAttemptTimer";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  autoSubmitAttempt,
  resumeAttempt,
  saveAnswer,
  submitAttempt,
} from "@/lib/api/student";
import type { AttemptPayload } from "@/types/attempt";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Gauge, Layers3, Clock3, BookOpenCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

export default function AttemptPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();

  const attemptId = params.attemptId;
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["attempt", attemptId],
    queryFn: () => resumeAttempt(attemptId),
    enabled: ready && Boolean(attemptId),
  });

  const attempt =
    query.data && "questions" in query.data ? (query.data as AttemptPayload) : null;

  const autoSubmitMutation = useMutation({
    mutationFn: () => autoSubmitAttempt(attemptId),
    onSuccess: () => router.replace(`/student/result/${attemptId}`),
  });

  const manualSubmitMutation = useMutation({
    mutationFn: () => submitAttempt(attemptId),
    onSuccess: () => router.replace(`/student/result/${attemptId}`),
  });

  const handleTimeUp = useCallback(() => {
    if (!attempt || !attempt.questions || attempt.questions.length === 0) return;
    if (autoSubmitMutation.isPending || manualSubmitMutation.isPending) return;
    autoSubmitMutation.mutate();
  }, [attempt, autoSubmitMutation, manualSubmitMutation.isPending]);

  const remainingSeconds = useAttemptTimer(
    attempt ? attempt.remainingSeconds : 999999,
    handleTimeUp,
    () => query.refetch()
  );

  const questions = attempt?.questions || [];
  const currentQuestion = questions[currentIndex];

  const selectedAnswers = useMemo(() => {
    const saved: Record<string, string> = {};

    questions.forEach((q) => {
      if (q.savedOptionId) saved[q.questionId] = q.savedOptionId;
    });

    return { ...saved, ...localAnswers };
  }, [questions, localAnswers]);

  const answeredNumbers = questions
    .filter((q) => selectedAnswers[q.questionId])
    .map((q) => q.questionNumber);

  async function handleSelect(questionId: string, selectedOptionId: string) {
    if (!attempt || remainingSeconds <= 0) return;

    const selectedQuestionIndex = questions.findIndex(
      (question) => question.questionId === questionId
    );

    setLocalAnswers((prev) => ({ ...prev, [questionId]: selectedOptionId }));

    if (selectedQuestionIndex >= 0 && selectedQuestionIndex < questions.length - 1) {
      setCurrentIndex(selectedQuestionIndex + 1);
    }

    setSavingQuestionId(questionId);

    try {
      const response = await saveAnswer(attemptId, {
        questionId,
        selectedOptionId,
      });

      if (response?.status === "AUTO_SUBMITTED") {
        router.replace(`/student/result/${attemptId}`);
      }
    } finally {
      setSavingQuestionId(null);
    }
  }

  if (!ready) return null;

  if (query.isLoading || !query.data) {
    return (
      <AppShell title="Practice Attempt">
        <LoadingState label="Loading attempt..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell title="Practice Attempt">
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  if (query.data && !("questions" in query.data)) {
    return (
      <AppShell title="Practice Attempt">
        <div className="math-card p-6">
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">
            {query.data.message || "Attempt closed."}
          </h1>

          <button
            className="math-role-action-button mt-5 px-4 py-2.5 text-sm"
            onClick={() => router.push(`/student/result/${attemptId}`)}
          >
            View Result
          </button>
        </div>
      </AppShell>
    );
  }

  if (!attempt || questions.length === 0 || !currentQuestion) {
    return (
      <AppShell title="Practice Attempt">
        <LoadingState label="Preparing questions..." />
      </AppShell>
    );
  }

  // Real sheet title/module context from the attempt itself -- never a
  // hardcoded placeholder, so this is correct no matter which module
  // (MM/YLM/IM/future) the sheet being attempted belongs to.
  const sheetTitle = attempt.dpsTitle || "Practice Attempt";
  const contextLine = [
    attempt.moduleCode,
    attempt.lessonNumber ? `Lesson ${attempt.lessonNumber}` : null,
    attempt.dpsNumber ? `DPS ${attempt.dpsNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppShell title="Practice Attempt">
      <section className="math-slide-up math-card flex flex-col gap-4 !overflow-visible p-4 sm:p-5 xl:min-h-[calc(100svh-11rem)] relative">
        {/* Floating Side Navigation Arrows -- matches the mock exam attempt screen */}
        <button
          onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          disabled={currentIndex === 0}
          aria-label="Previous question"
          className="hidden md:flex absolute -left-6 lg:-left-16 xl:-left-20 top-1/2 z-[100] -translate-y-1/2 h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all hover:scale-110 hover:bg-white dark:hover:bg-slate-950 disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
          disabled={currentIndex >= questions.length - 1}
          aria-label="Next question"
          className="hidden md:flex absolute -right-6 lg:-right-16 xl:-right-20 top-1/2 z-[100] -translate-y-1/2 h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all hover:scale-110 hover:bg-white dark:hover:bg-slate-950 disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-br from-white via-sky-50 to-cyan-100 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
          <div className="relative z-10">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">
                Question {currentQuestion.questionNumber} Of {questions.length}
              </p>
            </div>
            <h1 className="mt-2 max-w-5xl text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              {sheetTitle}
            </h1>
            <div className="math-subtitle !mt-3 max-w-3xl flex flex-col gap-1">
              {contextLine ? (
                <p className="font-bold inline-flex items-center gap-1.5"><BookOpenCheck size={14} /> {contextLine}</p>
              ) : null}
              <p className="opacity-80">
                Answer with focus and move through each question using the navigator.
              </p>
            </div>
          </div>
        </div>

        <div className="sticky top-[80px] sm:top-[104px] 2xl:top-[144px] z-[90] grid gap-3 rounded-3xl bg-slate-50 p-2 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800 md:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={<ClipboardCheck size={16} />}
            label="ANSWERED"
            value={answeredNumbers.length}
          />
          <StatCard
            icon={<Layers3 size={16} />}
            label="REMAINING"
            value={questions.length - answeredNumbers.length}
          />
          <StatCard
            icon={<Gauge size={16} />}
            label="CURRENT"
            value={`Q${currentQuestion.questionNumber}`}
          />
          <TimerMetricCard remainingSeconds={remainingSeconds} />
        </div>

        <div>
          <QuestionCard
            question={currentQuestion}
            selectedOptionId={selectedAnswers[currentQuestion.questionId]}
            disabled={
              manualSubmitMutation.isPending ||
              autoSubmitMutation.isPending ||
              remainingSeconds <= 0
            }
            saving={savingQuestionId === currentQuestion.questionId}
            onSelect={(optionId) =>
              handleSelect(currentQuestion.questionId, optionId)
            }
          />
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/85">
          <QuestionNavigator
            totalQuestions={questions.length}
            currentQuestionNumber={currentQuestion.questionNumber}
            answeredQuestionNumbers={answeredNumbers}
            onSelectQuestion={(number) => setCurrentIndex(number - 1)}
          />

          <div className="mt-4 flex flex-wrap justify-between gap-3">
            <button
              className="math-button-secondary"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((v) => Math.max(0, v - 1))}
            >
              Previous
            </button>

            <button
              className="math-button-secondary"
              disabled={currentIndex >= questions.length - 1}
              onClick={() =>
                setCurrentIndex((v) => Math.min(questions.length - 1, v + 1))
              }
            >
              Next
            </button>
          </div>

          <button
            className="math-button-primary mt-4 w-full py-3"
            onClick={() => setShowConfirm(true)}
            disabled={manualSubmitMutation.isPending || autoSubmitMutation.isPending}
          >
            Submit Test
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={showConfirm}
        title="Submit Test?"
        message={`You have answered ${answeredNumbers.length} out of ${questions.length} questions. Unanswered questions will receive 0 marks.`}
        confirmLabel={manualSubmitMutation.isPending ? "Submitting..." : "Submit"}
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => manualSubmitMutation.mutate()}
      />
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex min-h-[96px] items-center gap-3 rounded-[24px]" style={{ boxShadow: 'hover: 0 20px 40px rgba(0,0,0,0.1)' }}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />

      <div className="math-student-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md h-11 w-11 flex items-center justify-center rounded-2xl text-cyan-700 dark:text-cyan-300">
        {icon}
      </div>
      <div>
        <p className="relative z-10 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-300">
          {label}
        </p>
        <p className="relative z-10 mt-1 origin-left text-3xl font-black leading-none text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

function TimerMetricCard({ remainingSeconds }: { remainingSeconds: number }) {
  return (
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex min-h-[96px] items-center justify-between gap-3" style={{ boxShadow: 'hover: 0 20px 40px rgba(0,0,0,0.1)' }}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />

      <div className="flex items-center gap-3 relative z-10">
        <div className="math-student-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
          <Clock3 size={18} />
        </div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-100">TIME LEFT</p>
          <p className="mt-1 text-sm font-bold text-slate-700 transition-colors duration-300 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100">Practice timer</p>
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <TestTimer remainingSeconds={remainingSeconds} />
      </div>
    </div>
  );
}
