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
import { ClipboardCheck, Gauge, Layers3, Clock3 } from "lucide-react";
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
    handleTimeUp
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
      <AppShell>
        <LoadingState label="Loading attempt..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell>
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  if (query.data && !("questions" in query.data)) {
    return (
      <AppShell>
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
      <AppShell>
        <LoadingState label="Preparing questions..." />
      </AppShell>
    );
  }

  return (
    <AppShell title="Practice Attempt">
      <section className="math-slide-up rounded-[30px] border border-white/70 bg-gradient-to-br from-white/92 via-sky-50/78 to-cyan-100/58 p-4 shadow-xl backdrop-blur-2xl dark:border-slate-800 dark:from-slate-950/92 dark:via-slate-900/82 dark:to-cyan-950/36 sm:p-5">
        <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">
              Question {currentQuestion.questionNumber} Of {questions.length}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-[2.1rem]">
              MathPath YLM Practice
            </h1>
            <p className="mt-1.5 max-w-3xl text-sm font-semibold leading-5 text-slate-600 dark:text-slate-300">
              Answer with focus and move through each question using the navigator.
            </p>
          </div>
        </div>

        <div className="sticky top-[104px] z-[90] mt-4 grid gap-3 rounded-3xl bg-white/60 p-2 shadow-sm backdrop-blur-xl ring-1 ring-slate-200/50 dark:bg-slate-950/60 dark:ring-slate-800/50 sm:grid-cols-2 xl:grid-cols-4">
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
      </section>

      <div className="mt-4 math-slide-up">
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

      <div className="mt-4 math-card p-4">
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
    <div className="math-student-metric-card flex min-h-[96px] items-center gap-3 rounded-[24px]">
      <div className="math-student-icon-chip h-11 w-11 items-center justify-center rounded-2xl text-cyan-700 dark:text-cyan-300">
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">
          {label}
        </p>
        <p className="mt-1 text-3xl font-black leading-none text-slate-950 dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

function TimerMetricCard({ remainingSeconds }: { remainingSeconds: number }) {
  return (
    <div className="math-student-metric-card flex min-h-[96px] items-center justify-between gap-3 rounded-[24px]">
      <div className="flex items-center gap-3">
        <div className="math-student-icon-chip flex h-11 w-11 items-center justify-center rounded-2xl text-cyan-700 dark:text-cyan-300">
          <Clock3 size={16} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">TIME LEFT</p>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Practice timer</p>
        </div>
      </div>
      <TestTimer remainingSeconds={remainingSeconds} className="shrink-0" />
    </div>
  );
}
