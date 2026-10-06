"use client";

import { AppShell } from "@/components/common/AppShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay, NeedsWideQuestionBoard } from "@/components/common/MathQuestionDisplay";
import { OptionButton } from "@/components/student/OptionButton";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { TestTimer } from "@/components/student/TestTimer";
import { PhoneTestBar } from "@/components/student/PhoneTestBar";
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
import { ClipboardCheck, Gauge, Layers3, Trophy, CheckCircle2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

// Round-1 gamification fix (2026-07-25): the submit/auto-submit/save-answer
// responses already carry `unlockedBadges` (the backend computes it, see
// SubmitCompetitionMockAttemptForStudent / SaveCompetitionMockAnswer), but
// nothing on the frontend ever read it -- a student could earn a badge and
// never see it happen at the actual moment of achievement. This stashes it
// in sessionStorage keyed by attemptId immediately before navigating to the
// result page, which then consumes-and-clears it on mount. sessionStorage
// (not localStorage) is deliberate: this is one-time handoff data for the
// very next navigation, not something that should persist indefinitely or
// resurface if the student returns to this result page later.
function stashUnlockedBadgesForResult(attemptId: string, response: unknown) {
  try {
    const badges = (response as { unlockedBadges?: unknown[] } | undefined)?.unlockedBadges;
    if (Array.isArray(badges) && badges.length > 0) {
      // The submit-side backend response for this specific field is a raw
      // dict (no camelCase alias generator, unlike the /achievements route),
      // so it still carries `icon_name`. Normalize to `iconName` here at the
      // handoff boundary so the result page's reveal UI can share the exact
      // same BadgeIconMap lookup convention as the Trophy Room without ever
      // touching the backend's gamification evaluation logic itself.
      const normalized = badges.map((b: any) => ({
        ...b,
        iconName: b?.iconName ?? b?.icon_name,
      }));
      sessionStorage.setItem(`mp_unlocked_badges_${attemptId}`, JSON.stringify(normalized));
    }
  } catch (e) {
    // Never let a storage failure (e.g. private-browsing quirks) block navigation.
    console.error("Failed to stash unlocked badges for result reveal", e);
  }
}

// Same one-time sessionStorage handoff pattern as stashUnlockedBadgesForResult
// above, for the rankedUp/newRankTier fields the submit response now also
// carries (2026-07-25 Round 1 fix). RankCinematicOverlay previously only
// fired from a student manually clicking a tier inside the rank roadmap
// modal -- this is what lets an actual real rank-up play automatically.
function stashRankUpForResult(attemptId: string, response: unknown) {
  try {
    const data = response as { rankedUp?: boolean; newRankTier?: string | null } | undefined;
    if (data?.rankedUp && data?.newRankTier) {
      sessionStorage.setItem(`mp_rank_up_${attemptId}`, data.newRankTier);
    }
  } catch (e) {
    console.error("Failed to stash rank-up for result reveal", e);
  }
}

// Same one-time sessionStorage handoff pattern as stashUnlockedBadgesForResult
// above, for the rewardBreakdown field the submit response now also carries
// (2026-08-26 reward formula + celebration sequencing rollout). Drives the
// RewardEarnedModal shown on the result page right after the completion
// celebration and before any badge reveals.
function stashRewardBreakdownForResult(attemptId: string, response: unknown) {
  try {
    const data = response as { rewardBreakdown?: unknown } | undefined;
    if (data?.rewardBreakdown) {
      sessionStorage.setItem(`mp_reward_breakdown_${attemptId}`, JSON.stringify(data.rewardBreakdown));
    }
  } catch (e) {
    console.error("Failed to stash reward breakdown for result reveal", e);
  }
}

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
    onSuccess: (data) => {
      stashUnlockedBadgesForResult(attemptId, data);
      stashRankUpForResult(attemptId, data);
      stashRewardBreakdownForResult(attemptId, data);
      router.replace(`/student/competition/mock-result/${attemptId}`);
    },
  });

  const manualSubmitMutation = useMutation({
    mutationFn: () => submitCompetitionMockAttempt(attemptId),
    onSuccess: (data) => {
      stashUnlockedBadgesForResult(attemptId, data);
      stashRankUpForResult(attemptId, data);
      stashRewardBreakdownForResult(attemptId, data);
      router.replace(`/student/competition/mock-result/${attemptId}`);
    },
  });

  const handleTimeUp = useCallback(() => {
    if (!attempt || !attempt.questions || attempt.questions.length === 0) return;
    if (autoSubmitMutation.isPending || manualSubmitMutation.isPending) return;
    autoSubmitMutation.mutate();
  }, [attempt, autoSubmitMutation, manualSubmitMutation.isPending]);

  const remainingSeconds = useAttemptTimer(attempt ? attempt.remainingSeconds : 999999, handleTimeUp, () => query.refetch());
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
  // Decided once for the whole mock, so the options never move between questions.
  const wideBoard = NeedsWideQuestionBoard(questions);
  const showSectionLabel = Boolean(sectionTitle);
  const displaySectionNumber = showSectionLabel ? (sectionNumber || 1) : null;
  const displaySectionTitle = showSectionLabel ? sectionTitle : "Competition Question";

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
      if (response?.status === "AUTO_SUBMITTED") {
        stashUnlockedBadgesForResult(attemptId, response);
        stashRankUpForResult(attemptId, response);
        stashRewardBreakdownForResult(attemptId, response);
        router.replace(`/student/competition/mock-result/${attemptId}`);
      }
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
      {/* Found 2026-09-02: see the matching comment in
          student/attempt/[attemptId]/page.tsx (the DPS attempt screen this
          layout was originally copied from) -- same bug, same fix. These
          arrows used to be absolutely positioned outside the card via
          negative offsets (up to -80px at xl); html/body's overflow-x: clip
          plus .math-page's max-width meant they routinely got clipped off on
          real screen widths. Now normal in-flow flex siblings of the card,
          so they can never be pushed outside the visible page. */}
      <div className="se-test flex items-stretch gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          disabled={currentIndex === 0}
          aria-label="Previous question"
          className="se-arrow hidden md:flex shrink-0 self-center h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>

        <section className="se-test-card math-slide-up math-card flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          <PhoneTestBar questionNumber={currentQuestion.questionNumber} totalQuestions={questions.length} remainingSeconds={remainingSeconds} />
          <div className="se-test-top relative overflow-hidden px-5 py-4 sm:px-6">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h1 className="se-test-title se-test-title-lg">
                {mockExam.title || "Competition Mock"}
              </h1>
              <div className="flex flex-wrap items-center gap-2">
                <p className="se-chip se-chip-accent">
                  Question {currentQuestion.questionNumber} Of {questions.length}
                </p>
                {displaySectionNumber !== null && (
                  <p className="se-chip">
                    Section {displaySectionNumber}
                  </p>
                )}
                <p className="se-chip">
                  {displaySectionTitle}
                </p>
              </div>
            </div>
            <p className="se-test-note relative z-10">
              <span className="se-test-code">
                {mockExam.mockCode ? `${mockExam.mockCode} · ` : ""}
                {mockExam.moduleCode || "Module"} · {mockExam.levelCode || "Level"}
              </span>
              <span className="se-test-note-gap" aria-hidden="true"> · </span>
              Answer carefully. The mock auto-saves each response and submits when time expires.
            </p>
          </div>

          <div className="se-stat-row sticky z-[90] grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <StatCard icon={<ClipboardCheck size={18} />} label="Answered" value={answeredNumbers.length} />
            <StatCard icon={<Layers3 size={18} />} label="Remaining" value={questions.length - answeredNumbers.length} />
            <StatCard icon={<Gauge size={18} />} label="Current" value={`Q${currentQuestion.questionNumber}`} />
            <TimerMetricCard remainingSeconds={remainingSeconds} />
          </div>

          <div className={`se-mcq grid gap-3 ${wideBoard ? "se-mcq-wide" : ""}`}>
            <div className="se-mcq-panel flex min-w-0 flex-col p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="se-chip se-chip-accent"><Layers3 size={14} /> {displaySectionTitle}</span>
                <h2 className="se-mcq-heading">Question {currentQuestion.questionNumber}</h2>
                <span className={`se-save ml-auto ${savingQuestionId === currentQuestion.questionId ? "se-save-busy" : "se-save-done"}`}>
                  {savingQuestionId === currentQuestion.questionId ? "Saving..." : "Auto-Saved"}
                </span>
              </div>
              <div className="mp-qboard mt-3 flex flex-1 items-center justify-center rounded-[22px] p-2.5 sm:p-3">
                <MathQuestionDisplay
                  operands={currentQuestion.operands}
                  operators={currentQuestion.operators}
                  displayType={(currentQuestion as any).displayType ?? (currentQuestion as any).display_type}
                  questionText={(currentQuestion as any).questionText ?? (currentQuestion as any).question_text}
                />
              </div>
            </div>

            <div className="se-mcq-panel flex min-w-0 flex-col p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="se-chip"><CheckCircle2 size={14} /> Select Answer</span>
                <h2 className="se-mcq-heading">Choose The Correct Option</h2>
              </div>
              <div className="se-mcq-options mt-3 grid flex-1 content-center gap-3 sm:grid-cols-2">
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

          <div className="se-test-nav p-3">
            <QuestionNavigator
              totalQuestions={questions.length}
              currentQuestionNumber={currentQuestion.questionNumber}
              answeredQuestionNumbers={answeredNumbers}
              onSelectQuestion={(number) => setCurrentIndex(number - 1)}
            />

            {/* Below md the side arrows are hidden, so Previous / Next live here
                (same as the practice-sheet screen). */}
            <div className="mt-3 flex gap-3 md:hidden">
              <button className="math-button-secondary flex-1" disabled={currentIndex === 0} onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}>Previous</button>
              <button className="math-button-secondary flex-1" disabled={currentIndex >= questions.length - 1} onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}>Next</button>
            </div>

            <div className="mt-3 flex justify-center">
              <button className="math-button-primary w-full max-w-md py-2.5" onClick={() => setShowConfirm(true)} disabled={manualSubmitMutation.isPending || autoSubmitMutation.isPending}>
                Submit Mock
              </button>
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
          disabled={currentIndex >= questions.length - 1}
          aria-label="Next question"
          className="se-arrow hidden md:flex shrink-0 self-center h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
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
    <div className="se-stat">
      <div className="se-stat-icon">{icon}</div>
      <div className="min-w-0">
        <p className="se-stat-label">{label}</p>
        <p className="se-stat-value">{value}</p>
      </div>
    </div>
  );
}

function TimerMetricCard({ remainingSeconds }: { remainingSeconds: number }) {
  return (
    <div className="se-stat se-stat-timer">
      <div className="min-w-0">
        <p className="se-stat-label">Time Left</p>
        <p className="se-stat-sub">Exam Timer</p>
      </div>
      <div className="shrink-0">
        <TestTimer remainingSeconds={remainingSeconds} className="!px-3.5 !py-2 !text-sm" />
      </div>
    </div>
  );
}
