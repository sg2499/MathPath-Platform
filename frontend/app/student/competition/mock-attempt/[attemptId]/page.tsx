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
import { ClipboardCheck, Clock3, Gauge, Layers3, Trophy, CheckCircle2 } from "lucide-react";
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
          <div className="math-block-header mb-2"><Trophy size={14} /> Competition Mock</div>
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
      <section className="math-slide-up flex flex-col gap-2 sm:gap-3 p-2 sm:p-3 h-[calc(100svh-80px)] -mt-6 -mb-10 relative overflow-hidden">
        {/* Floating Side Navigation Arrows */}
        <button
          onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          disabled={currentIndex === 0}
          className="absolute left-1 sm:left-4 top-[55%] sm:top-1/2 z-[100] -translate-y-1/2 flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white/80 dark:bg-slate-900/80 shadow-lg backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all hover:scale-110 hover:bg-white dark:hover:bg-slate-950 disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
          disabled={currentIndex >= questions.length - 1}
          className="absolute right-1 sm:right-4 top-[55%] sm:top-1/2 z-[100] -translate-y-1/2 flex h-10 w-10 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white/80 dark:bg-slate-900/80 shadow-lg backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all hover:scale-110 hover:bg-white dark:hover:bg-slate-950 disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        {/* 1. Metric Bar (Top, non-sticky, completely un-obscuring) */}
        <div className="shrink-0 z-[90] grid gap-2 sm:gap-3 rounded-2xl sm:rounded-3xl bg-white/60 p-2 shadow-sm backdrop-blur-xl ring-1 ring-slate-200/50 dark:bg-slate-950/60 dark:ring-slate-800/50 grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<ClipboardCheck size={16} />} label="ANSWERED" value={answeredNumbers.length} />
          <StatCard icon={<Layers3 size={16} />} label="REMAINING" value={questions.length - answeredNumbers.length} />
          <StatCard icon={<Gauge size={16} />} label="CURRENT" value={`Q${currentQuestion.questionNumber}`} />
          <TimerMetricCard remainingSeconds={remainingSeconds} />
        </div>

        {/* 2. Header Info */}
        <div className="shrink-0 grid gap-2 sm:gap-4 rounded-[16px] sm:rounded-[24px] border border-orange-100 bg-gradient-to-r from-white/98 via-orange-50/70 to-amber-100/55 p-3 sm:p-4 shadow-sm dark:border-slate-800 dark:from-slate-950/96 dark:via-slate-900/88 dark:to-orange-950/36 mx-12 sm:mx-20">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
                Question {currentQuestion.questionNumber} Of {questions.length}
              </p>
              <p className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                {sectionLabel}
              </p>
            </div>
            <h1 className="mt-2 text-xl sm:text-2xl font-black tracking-tight text-slate-950 dark:text-white">
              {mockExam.title || "Competition Mock"}
            </h1>
          </div>
        </div>

        {/* 3. Cards Container */}
        <div className={`grid flex-1 min-h-0 gap-3 xl:items-stretch mx-12 sm:mx-20 ${isExpressionQuestion ? "xl:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)]" : "xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]"}`}>
          <div className="math-card flex flex-col flex-1 min-h-[250px] overflow-hidden border border-slate-200/80 bg-slate-50/75 p-3 sm:p-4 shadow-none dark:border-slate-800 dark:bg-slate-900/55">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div>
                <div className="math-block-header mb-2"><Layers3 size={14} /> {sectionLabel}</div>
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

          <div className={`math-card flex flex-col flex-1 min-h-[250px] overflow-hidden border border-slate-200/80 bg-white/88 p-3 sm:p-4 shadow-none dark:border-slate-800 dark:bg-slate-950/60 ${isExpressionQuestion ? "xl:p-3.5" : ""}`}>
            <div className="shrink-0 border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div className="math-block-header mb-2"><CheckCircle2 size={14} /> Select Answer</div>
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

        {/* 4. Navigator and Submit Block (Bottom) */}
        <div className="shrink-0 flex flex-col xl:flex-row gap-4 items-center justify-between rounded-[20px] sm:rounded-[24px] border border-slate-200 bg-white/92 p-3 sm:p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/85 mx-12 sm:mx-20">
          <div className="w-full xl:w-2/3 overflow-hidden">
            {/* The navigator will scroll internally if there are 100 questions */}
            <div className="max-h-[70px] sm:max-h-[85px] overflow-y-auto pr-2 custom-scrollbar">
              <QuestionNavigator
                totalQuestions={questions.length}
                currentQuestionNumber={currentQuestion.questionNumber}
                answeredQuestionNumbers={answeredNumbers}
                onSelectQuestion={(number) => setCurrentIndex(number - 1)}
              />
            </div>
          </div>

          <div className="w-full xl:w-1/3 shrink-0">
            <button className="math-button-primary w-full py-3" onClick={() => setShowConfirm(true)} disabled={manualSubmitMutation.isPending || autoSubmitMutation.isPending}>
              Submit Mock
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
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex min-h-[96px] items-center gap-3 rounded-[24px]" style={{ boxShadow: 'hover: 0 20px 40px rgba(0,0,0,0.1)' }}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      <div className="math-student-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md h-11 w-11 flex items-center justify-center rounded-2xl text-orange-700 dark:text-orange-300">
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
          <p className="mt-1 text-sm font-bold text-slate-700 transition-colors duration-300 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100">Exam timer</p>
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <TestTimer remainingSeconds={remainingSeconds} />
      </div>
    </div>
  );
}
