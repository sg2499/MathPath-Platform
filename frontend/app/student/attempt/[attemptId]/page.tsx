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
import type { DpsAttemptPayload } from "@/types/attempt";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Gauge, Layers3, BookOpenCheck } from "lucide-react";
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
    query.data && "questions" in query.data ? (query.data as DpsAttemptPayload) : null;

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

  // DPS questions are typed free-text answers now, not MCQ picks -- see
  // OPEN_ISSUES.md 2026-08-03e. savedAnswers is keyed by questionId -> the
  // typed text (server-saved value merged with anything typed locally this
  // session but not yet round-tripped).
  const savedAnswers = useMemo(() => {
    const saved: Record<string, string> = {};

    questions.forEach((q) => {
      if (q.savedAnswerText) saved[q.questionId] = q.savedAnswerText;
    });

    return { ...saved, ...localAnswers };
  }, [questions, localAnswers]);

  const answeredNumbers = questions
    .filter((q) => (savedAnswers[q.questionId] || "").trim())
    .map((q) => q.questionNumber);

  async function persistAnswer(questionId: string, answerText: string) {
    if (!attempt || remainingSeconds <= 0) return;

    setLocalAnswers((prev) => ({ ...prev, [questionId]: answerText }));
    setSavingQuestionId(questionId);

    try {
      const response = await saveAnswer(attemptId, { questionId, answerText });

      if (response?.status === "AUTO_SUBMITTED") {
        router.replace(`/student/result/${attemptId}`);
      }
    } finally {
      setSavingQuestionId(null);
    }
  }

  // Fired on a shorter pause while typing -- just persists so nothing is
  // ever lost, without moving the student anywhere.
  function handleSaveAnswer(questionId: string, answerText: string) {
    void persistAnswer(questionId, answerText);
  }

  // Fired on a longer pause once the typed text looks like a finished
  // number, or immediately on Enter -- mirrors the old MCQ flow where
  // picking an option instantly saved and moved to the next question.
  async function handleAdvanceAnswer(questionId: string, answerText: string) {
    await persistAnswer(questionId, answerText);

    const answeredQuestionIndex = questions.findIndex(
      (question) => question.questionId === questionId
    );
    if (answeredQuestionIndex < 0 || answeredQuestionIndex >= questions.length - 1) return;

    // Only actually move forward if the student is still on the question
    // they just answered -- if they'd already manually navigated elsewhere
    // while this save was in flight, don't yank them away from wherever
    // they went.
    setCurrentIndex((prevIndex) =>
      prevIndex === answeredQuestionIndex ? answeredQuestionIndex + 1 : prevIndex
    );
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

  // The instructions page (which the student already saw before starting)
  // is where the sheet's concept names live -- repeating dpsTitle here is
  // redundant, so this bar shows the current question's section instead
  // (same derivation QuestionCard uses internally).
  const currentMetadata = (currentQuestion.metadata || {}) as Record<string, unknown>;
  const currentSectionTitle = String(
    currentMetadata.section_title || currentMetadata.sectionTitle || ""
  ).trim();
  const currentSectionNumber = currentMetadata.section_number || currentMetadata.sectionNumber;
  const currentTotalSections = Number(
    currentMetadata.dps_total_sections || currentMetadata.dpsTotalSections || 0
  );
  const sectionLabel = currentSectionTitle
    ? currentTotalSections > 1
      ? `Section ${currentSectionNumber || 1} · ${currentSectionTitle}`
      : currentSectionTitle
    : sheetTitle;

  return (
    <AppShell title="Practice Attempt">
      <section className="math-slide-up math-card flex flex-col gap-3 !overflow-visible p-3 sm:p-4 relative">
        {/* Floating Side Navigation Arrows -- matches the mock exam attempt screen */}
        <button
          onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          disabled={currentIndex === 0}
          aria-label="Previous question"
          className="hidden md:flex absolute -left-3 lg:-left-16 xl:-left-20 top-1/2 z-[100] -translate-y-1/2 h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all hover:scale-110 hover:bg-white dark:hover:bg-slate-950 disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
        <button
          onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
          disabled={currentIndex >= questions.length - 1}
          aria-label="Next question"
          className="hidden md:flex absolute -right-3 lg:-right-16 xl:-right-20 top-1/2 z-[100] -translate-y-1/2 h-12 w-12 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all hover:scale-110 hover:bg-white dark:hover:bg-slate-950 disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>

        <div className="relative flex shrink-0 flex-col gap-3 overflow-hidden rounded-[24px] border border-white/70 bg-gradient-to-br from-white via-sky-50 to-cyan-100 px-5 py-4 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:px-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-32 w-32 rounded-full bg-cyan-300/20 blur-3xl" />

          <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              {contextLine ? (
                <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50/90 px-3.5 py-1.5 text-xs font-black uppercase tracking-[0.14em] text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">
                  <BookOpenCheck size={14} /> {contextLine}
                </span>
              ) : null}
              <h1 className="mt-1.5 truncate text-base font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-lg" title={sectionLabel}>
                {sectionLabel}
              </h1>
            </div>
            <p className="shrink-0 rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-black text-slate-700 dark:bg-slate-900/70 dark:text-slate-200">
              Question {currentQuestion.questionNumber} of {questions.length}
            </p>
          </div>

          <div className="relative z-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <CompactStat
              icon={<ClipboardCheck size={18} />}
              label="Answered"
              value={answeredNumbers.length}
            />
            <CompactStat
              icon={<Layers3 size={18} />}
              label="Remaining"
              value={questions.length - answeredNumbers.length}
            />
            <CompactStat
              icon={<Gauge size={18} />}
              label="Current"
              value={`Q${currentQuestion.questionNumber}`}
            />
            <CompactTimerStat remainingSeconds={remainingSeconds} />
          </div>
        </div>

        <div className="shrink-0">
          <QuestionCard
            key={currentQuestion.questionId}
            question={currentQuestion}
            savedAnswerText={savedAnswers[currentQuestion.questionId]}
            disabled={
              manualSubmitMutation.isPending ||
              autoSubmitMutation.isPending ||
              remainingSeconds <= 0
            }
            saving={savingQuestionId === currentQuestion.questionId}
            compact
            onSave={(answerText) =>
              handleSaveAnswer(currentQuestion.questionId, answerText)
            }
            onAdvance={(answerText) =>
              handleAdvanceAnswer(currentQuestion.questionId, answerText)
            }
          />
        </div>

        <div className="shrink-0 rounded-[18px] border border-slate-200 bg-white/92 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/85">
          <QuestionNavigator
            totalQuestions={questions.length}
            currentQuestionNumber={currentQuestion.questionNumber}
            answeredQuestionNumbers={answeredNumbers}
            onSelectQuestion={(number) => setCurrentIndex(number - 1)}
          />

          {/* The floating side arrows above are hidden below md (there's no
              room for their off-card offset on narrow screens), and Enter
              only advances forward -- so without this, phone/small-tablet
              students would have no way to go back except tapping question
              numbers one at a time. Hidden at md+ where the floating arrows
              already cover it, so larger screens keep the cleaner look. */}
          <div className="mt-3 flex gap-3 md:hidden">
            <button
              className="math-button-secondary flex-1"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((v) => Math.max(0, v - 1))}
            >
              Previous
            </button>
            <button
              className="math-button-secondary flex-1"
              disabled={currentIndex >= questions.length - 1}
              onClick={() => setCurrentIndex((v) => Math.min(questions.length - 1, v + 1))}
            >
              Next
            </button>
          </div>

          <button
            className="math-button-primary mt-3 w-full py-2.5"
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

function CompactStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-white px-3.5 py-3 dark:bg-slate-950/60">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <p className="truncate text-lg font-black leading-tight text-slate-950 dark:text-white">
          {value}
        </p>
      </div>
    </div>
  );
}

function CompactTimerStat({ remainingSeconds }: { remainingSeconds: number }) {
  return (
    <div className="flex min-w-0 items-center justify-center rounded-2xl bg-white px-3 py-3 dark:bg-slate-950/60">
      <TestTimer remainingSeconds={remainingSeconds} className="!px-3.5 !py-2 !text-sm" />
    </div>
  );
}
