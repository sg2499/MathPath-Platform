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
  autoSubmitCompetitionMockAttempt,
  resumeCompetitionMockAttempt,
  saveCompetitionMockAnswer,
  submitCompetitionMockAttempt,
} from "@/lib/api/student";
import type { AttemptPayload } from "@/types/attempt";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Gauge, Layers3 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

export default function StudentCompetitionMockAttemptPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ["student-competition-mock-attempt", attemptId],
    queryFn: () => resumeCompetitionMockAttempt(attemptId),
    enabled: ready && Boolean(attemptId),
  });

  const attempt = query.data && "questions" in query.data ? (query.data as AttemptPayload) : null;

  const autoSubmitMutation = useMutation({
    mutationFn: () => autoSubmitCompetitionMockAttempt(attemptId),
    onSuccess: () => router.replace(`/student/competition/mock-result/${attemptId}`),
  });

  const manualSubmitMutation = useMutation({
    mutationFn: () => submitCompetitionMockAttempt(attemptId),
    onSuccess: () => router.replace(`/student/competition/mock-result/${attemptId}`),
  });

  const handleTimeUp = useCallback(() => {
    if (!attempt || !attempt.questions || attempt.questions.length === 0) return;
    if (autoSubmitMutation.isPending || manualSubmitMutation.isPending) return;
    autoSubmitMutation.mutate();
  }, [attempt, autoSubmitMutation, manualSubmitMutation.isPending]);

  const remainingSeconds = useAttemptTimer(attempt ? attempt.remainingSeconds : 999999, handleTimeUp);
  const questions = attempt?.questions || [];
  const currentQuestion = questions[currentIndex];

  const selectedAnswers = useMemo(() => {
    const saved: Record<string, string> = {};
    questions.forEach((question) => {
      if (question.savedOptionId) saved[question.questionId] = question.savedOptionId;
    });
    return { ...saved, ...localAnswers };
  }, [questions, localAnswers]);

  const answeredNumbers = questions.filter((question) => selectedAnswers[question.questionId]).map((question) => question.questionNumber);

  async function handleSelect(questionId: string, selectedOptionId: string) {
    if (!attempt || remainingSeconds <= 0) return;
    const selectedQuestionIndex = questions.findIndex((question) => question.questionId === questionId);
    setLocalAnswers((prev) => ({ ...prev, [questionId]: selectedOptionId }));
    if (selectedQuestionIndex >= 0 && selectedQuestionIndex < questions.length - 1) {
      setCurrentIndex(selectedQuestionIndex + 1);
    }
    setSavingQuestionId(questionId);
    try {
      const response = await saveCompetitionMockAnswer(attemptId, { questionId, selectedOptionId });
      if (response?.status === "AUTO_SUBMITTED") router.replace(`/student/competition/mock-result/${attemptId}`);
    } finally {
      setSavingQuestionId(null);
    }
  }

  if (!ready) return null;

  if (query.isLoading || !query.data) {
    return (
      <AppShell title="Competition Mock Attempt">
        <LoadingState label="Loading mock attempt..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell title="Competition Mock Attempt">
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  if (query.data && !("questions" in query.data)) {
    return (
      <AppShell title="Competition Mock Attempt">
        <div className="math-card p-6">
          <p className="math-kicker">Competition Mock</p>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">{query.data.message || "Mock attempt closed."}</h1>
          <button className="math-role-action-button mt-5 px-4 py-2.5 text-sm" onClick={() => router.push("/student/competition/mock-exams")}>
            Back To Mock Exams
          </button>
        </div>
      </AppShell>
    );
  }

  if (!attempt || questions.length === 0 || !currentQuestion) {
    return (
      <AppShell title="Competition Mock Attempt">
        <LoadingState label="Preparing mock questions..." />
      </AppShell>
    );
  }

  const mockExam = (attempt as any).mockExam || {};

  return (
    <AppShell title="Competition Mock Attempt">
      <section className="math-slide-up rounded-[30px] border border-white/70 bg-gradient-to-br from-white/92 via-orange-50/80 to-amber-100/60 p-4 shadow-xl backdrop-blur-2xl dark:border-slate-800 dark:from-slate-950/92 dark:via-slate-900/82 dark:to-orange-950/36 sm:p-5">
        <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
              Question {currentQuestion.questionNumber} Of {questions.length}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-[2.1rem]">
              {mockExam.title || "Competition Mock"}
            </h1>
            <p className="mt-1.5 max-w-5xl text-sm font-semibold leading-5 text-slate-700 dark:text-slate-300">
              {mockExam.mockCode ? `${mockExam.mockCode} · ` : ""}{mockExam.moduleCode || "Module"} · {mockExam.levelCode || "Level"}. Answer carefully. The mock auto-saves each response and submits when time expires.
            </p>
          </div>
          <TestTimer remainingSeconds={remainingSeconds} />
        </div>

        <div className="relative z-10 mt-4 grid gap-3 sm:grid-cols-3">
          <StatCard icon={<ClipboardCheck size={16} />} label="ANSWERED" value={answeredNumbers.length} />
          <StatCard icon={<Layers3 size={16} />} label="REMAINING" value={questions.length - answeredNumbers.length} />
          <StatCard icon={<Gauge size={16} />} label="CURRENT" value={`Q${currentQuestion.questionNumber}`} />
        </div>
      </section>

      <div className="mt-4 math-slide-up">
        <QuestionCard
          question={currentQuestion}
          selectedOptionId={selectedAnswers[currentQuestion.questionId]}
          disabled={manualSubmitMutation.isPending || autoSubmitMutation.isPending || remainingSeconds <= 0}
          saving={savingQuestionId === currentQuestion.questionId}
          onSelect={(optionId) => handleSelect(currentQuestion.questionId, optionId)}
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
          <button className="math-button-secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}>
            Previous
          </button>
          <button className="math-button-secondary" disabled={currentIndex >= questions.length - 1} onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}>
            Next
          </button>
        </div>

        <button className="math-button-primary mt-4 w-full py-3" onClick={() => setShowConfirm(true)} disabled={manualSubmitMutation.isPending || autoSubmitMutation.isPending}>
          Submit Mock
        </button>
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="Submit Mock?"
        message={`You have answered ${answeredNumbers.length} out of ${questions.length} questions. Unanswered questions will receive 0 marks.`}
        confirmLabel={manualSubmitMutation.isPending ? "Submitting..." : "Submit Mock"}
        onCancel={() => setShowConfirm(false)}
        onConfirm={() => manualSubmitMutation.mutate()}
      />
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="rounded-[20px] bg-white/78 p-3 shadow-sm ring-1 ring-white/70 backdrop-blur-md transition hover:-translate-y-0.5 dark:bg-slate-900/60 dark:ring-slate-700">
      <div className="inline-flex rounded-xl bg-orange-50 p-1.5 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300">{icon}</div>
      <p className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">{label}</p>
      <p className="mt-1 text-2xl font-black leading-none text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
