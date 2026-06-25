"use client";

import { AppShell } from "@/components/common/AppShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { OptionButton } from "@/components/student/OptionButton";
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
import { ClipboardCheck, Clock3, Gauge, Layers3 } from "lucide-react";
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

  const answeredNumbers = questions
    .filter((question) => selectedAnswers[question.questionId])
    .map((question) => question.questionNumber);

  const metadata = (currentQuestion as any)?.metadata || {};
  const sectionTitle = String(metadata.section_title || metadata.sectionTitle || "").trim();
  const sectionNumber = metadata.section_number || metadata.sectionNumber;
  const totalSections = Number(metadata.dps_total_sections || metadata.dpsTotalSections || 0);
  const currentDisplayType = String((currentQuestion as any)?.displayType ?? (currentQuestion as any)?.display_type ?? "").toUpperCase();
  const isExpressionQuestion = currentDisplayType === "EXPRESSION" || currentDisplayType === "EXPRESSION_WORKSHEET" || currentDisplayType === "COMPACT_EXPRESSION";
  const showSectionLabel = Boolean(sectionTitle);
  const sectionLabel = showSectionLabel
    ? (totalSections > 1 ? `Section ${sectionNumber || 1} · ${sectionTitle}` : sectionTitle)
    : "Competition Question";

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
      <section className="math-slide-up math-card flex flex-col gap-4 overflow-visible p-4 sm:p-5 xl:min-h-[calc(100svh-11rem)]">
        <div className="grid gap-4 rounded-[24px] border border-orange-100 bg-gradient-to-r from-white/98 via-orange-50/70 to-amber-100/55 p-4 shadow-sm dark:border-slate-800 dark:from-slate-950/96 dark:via-slate-900/88 dark:to-orange-950/36">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
                Question {currentQuestion.questionNumber} Of {questions.length}
              </p>
              <p className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                {sectionLabel}
              </p>
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-[1.8rem]">
              {mockExam.title || "Competition Mock"}
            </h1>
            <p className="mt-1 text-sm font-semibold leading-5 text-slate-700 dark:text-slate-300">
              {mockExam.mockCode ? `${mockExam.mockCode} · ` : ""}
              {mockExam.moduleCode || "Module"} · {mockExam.levelCode || "Level"}. Answer carefully. The mock auto-saves each response and submits when time expires.
            </p>
          </div>
        </div>

        <div className="sticky top-[80px] sm:top-[104px] 2xl:top-[144px] z-[90] grid gap-3 rounded-3xl bg-white/60 p-2 shadow-sm backdrop-blur-xl ring-1 ring-slate-200/50 dark:bg-slate-950/60 dark:ring-slate-800/50 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<ClipboardCheck size={16} />} label="ANSWERED" value={answeredNumbers.length} />
          <StatCard icon={<Layers3 size={16} />} label="REMAINING" value={questions.length - answeredNumbers.length} />
          <StatCard icon={<Gauge size={16} />} label="CURRENT" value={`Q${currentQuestion.questionNumber}`} />
          <TimerMetricCard remainingSeconds={remainingSeconds} />
        </div>

        <div className={`grid flex-1 gap-4 xl:items-stretch ${isExpressionQuestion ? "xl:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)]" : "xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]"}`}>
          <div className="math-card flex flex-col h-[450px] sm:h-[500px] overflow-hidden border border-slate-200/80 bg-slate-50/75 p-4 shadow-none dark:border-slate-800 dark:bg-slate-900/55">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div>
                <p className="math-kicker">{sectionLabel}</p>
                <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Question {currentQuestion.questionNumber}</h2>
              </div>
              <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${savingQuestionId === currentQuestion.questionId ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
                {savingQuestionId === currentQuestion.questionId ? "Saving..." : "Auto-saved"}
              </div>
            </div>
            <div className={`flex flex-1 items-center justify-center overflow-auto px-2 py-4 xl:min-h-0 ${isExpressionQuestion ? "xl:px-1" : ""}`}>
              <div className={`flex w-full h-full items-center justify-center overflow-auto rounded-[28px] bg-white/92 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/80 dark:ring-slate-700 ${isExpressionQuestion ? "p-3 xl:p-2.5" : "p-4"}`}>
                <MathQuestionDisplay
                  operands={currentQuestion.operands}
                  operators={currentQuestion.operators}
                  displayType={(currentQuestion as any).displayType ?? (currentQuestion as any).display_type}
                  questionText={(currentQuestion as any).questionText ?? (currentQuestion as any).question_text}
                />
              </div>
            </div>
          </div>

          <div className={`math-card flex flex-col h-[450px] sm:h-[500px] overflow-hidden border border-slate-200/80 bg-white/88 p-4 shadow-none dark:border-slate-800 dark:bg-slate-950/60 ${isExpressionQuestion ? "xl:p-3.5" : ""}`}>
            <div className="shrink-0 border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <p className="math-kicker">Select Answer</p>
              <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Choose the correct option</h2>
            </div>
            <div className={`grid flex-1 overflow-y-auto content-center py-4 sm:grid-cols-2 xl:min-h-0 ${isExpressionQuestion ? "gap-2.5 xl:gap-2" : "gap-3"}`}>
              {currentQuestion.options.map((option) => (
                <OptionButton
                  key={option.optionId}
                  option={option}
                  selected={selectedAnswers[currentQuestion.questionId] === option.optionId}
                  disabled={manualSubmitMutation.isPending || autoSubmitMutation.isPending || remainingSeconds <= 0}
                  onClick={() => handleSelect(currentQuestion.questionId, option.optionId)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/85">
          <QuestionNavigator
            totalQuestions={questions.length}
            currentQuestionNumber={currentQuestion.questionNumber}
            answeredQuestionNumbers={answeredNumbers}
            onSelectQuestion={(number) => setCurrentIndex(number - 1)}
          />

          <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center">
            <button className="math-button-secondary" disabled={currentIndex === 0} onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}>
              Previous
            </button>
            <button className="math-button-primary w-full py-3" onClick={() => setShowConfirm(true)} disabled={manualSubmitMutation.isPending || autoSubmitMutation.isPending}>
              Submit Mock
            </button>
            <button className="math-button-secondary" disabled={currentIndex >= questions.length - 1} onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}>
              Next
            </button>
          </div>
        </div>
      </section>

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
    <div className="math-student-metric-card flex min-h-[96px] items-center gap-3 rounded-[24px]">
      <div className="math-student-icon-chip h-11 w-11 items-center justify-center rounded-2xl text-orange-700 dark:text-orange-300">{icon}</div>
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">{label}</p>
        <p className="mt-1 text-3xl font-black leading-none text-slate-950 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function TimerMetricCard({ remainingSeconds }: { remainingSeconds: number }) {
  return (
    <div className="math-student-metric-card flex min-h-[96px] items-center justify-between gap-3 rounded-[24px]">
      <div className="flex items-center gap-3">
        <div className="math-student-icon-chip flex h-11 w-11 items-center justify-center rounded-2xl text-orange-700 dark:text-orange-300">
          <Clock3 size={16} />
        </div>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">TIME LEFT</p>
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Exam timer</p>
        </div>
      </div>
      <TestTimer remainingSeconds={remainingSeconds} className="shrink-0" />
    </div>
  );
}
