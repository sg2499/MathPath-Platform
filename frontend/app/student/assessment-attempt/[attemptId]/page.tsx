"use client";

import { AppShell } from "@/components/common/AppShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { OptionButton } from "@/components/student/OptionButton";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { TestTimer } from "@/components/student/TestTimer";
import { MathQuestionDisplay, NeedsWideQuestionBoard } from "@/components/common/MathQuestionDisplay";
import { useAttemptTimer } from "@/hooks/useAttemptTimer";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { autoSubmitAssessmentAttempt, resumeAssessmentAttempt, saveAssessmentAnswer, submitAssessmentAttempt } from "@/lib/api/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Gauge, Layers3 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

// Same one-time sessionStorage handoff pattern used for mock exams and DPS
// (see stashRewardBreakdownForResult in those attempt pages) -- the reward
// modal is now wired into assessments too (2026-08-26), just without a
// cutscene sequence yet: it shows immediately on the result page, no
// confetti/badge/rank-up ordering in front of it yet.
function stashRewardBreakdownForResult(AttemptId: string, Response: unknown) {
  try {
    const Data = Response as { rewardBreakdown?: unknown } | undefined;
    if (Data?.rewardBreakdown) {
      sessionStorage.setItem(`mp_reward_breakdown_${AttemptId}`, JSON.stringify(Data.rewardBreakdown));
    }
  } catch (Error) {
    console.error("Failed to stash reward breakdown for result reveal", Error);
  }
}

export default function StudentAssessmentAttemptPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Params = useParams<{ attemptId: string }>();
  const Router = useRouter();
  const AttemptId = Params.attemptId;
  const [CurrentIndex, SetCurrentIndex] = useState(0);
  const [ShowConfirm, SetShowConfirm] = useState(false);
  const [SavingQuestionId, SetSavingQuestionId] = useState<string | null>(null);
  const [LocalAnswers, SetLocalAnswers] = useState<Record<string, string>>({});

  const Query = useQuery({
    queryKey: ["assessment-attempt", AttemptId],
    queryFn: () => resumeAssessmentAttempt(AttemptId),
    enabled: Ready && Boolean(AttemptId),
  });

  const Attempt = Query.data && Query.data.questions ? Query.data : null;

  const AutoSubmitMutation = useMutation({
    mutationFn: () => autoSubmitAssessmentAttempt(AttemptId),
    onSuccess: (Data) => {
      stashRewardBreakdownForResult(AttemptId, Data);
      Router.replace(`/student/assessment-result/${AttemptId}`);
    },
  });

  const ManualSubmitMutation = useMutation({
    mutationFn: () => submitAssessmentAttempt(AttemptId),
    onSuccess: (Data) => {
      stashRewardBreakdownForResult(AttemptId, Data);
      Router.replace(`/student/assessment-result/${AttemptId}`);
    },
  });

  const HandleTimeUp = useCallback(() => {
    if (!Attempt || !Attempt.questions || Attempt.questions.length === 0) return;
    if (AutoSubmitMutation.isPending || ManualSubmitMutation.isPending) return;
    AutoSubmitMutation.mutate();
  }, [Attempt, AutoSubmitMutation, ManualSubmitMutation.isPending]);

  const RemainingSeconds = useAttemptTimer(Attempt ? Attempt.remainingSeconds : 999999, HandleTimeUp, () => Query.refetch());
  const Questions = Attempt?.questions || [];
  const CurrentQuestion = Questions[CurrentIndex];

  const SelectedAnswers = useMemo(() => {
    const Saved: Record<string, string> = {};
    Questions.forEach((Question) => {
      if (Question.savedOptionId) Saved[Question.questionId] = Question.savedOptionId;
    });
    return { ...Saved, ...LocalAnswers };
  }, [Questions, LocalAnswers]);

  const AnsweredNumbers = Questions.filter((Question) => SelectedAnswers[Question.questionId]).map((Question) => Question.questionNumber);

  async function HandleSelect(QuestionId: string, SelectedOptionId: string) {
    if (!Attempt || RemainingSeconds <= 0) return;

    const SelectedQuestionIndex = Questions.findIndex(
      (Question) => Question.questionId === QuestionId
    );

    SetLocalAnswers((Previous) => ({ ...Previous, [QuestionId]: SelectedOptionId }));

    if (SelectedQuestionIndex >= 0 && SelectedQuestionIndex < Questions.length - 1) {
      SetCurrentIndex(SelectedQuestionIndex + 1);
    }

    SetSavingQuestionId(QuestionId);
    try {
      const Response = await saveAssessmentAnswer(AttemptId, { questionId: QuestionId, selectedOptionId: SelectedOptionId });
      if (Response?.resultAvailable) {
        stashRewardBreakdownForResult(AttemptId, Response);
        Router.replace(`/student/assessment-result/${AttemptId}`);
      }
    } finally {
      SetSavingQuestionId(null);
    }
  }

  if (!Ready) return null;

  if (Query.isLoading || !Query.data) {
    return <AppShell><LoadingState label="Loading assessment..." /></AppShell>;
  }

  if (Query.error) {
    return <AppShell><ErrorState message={apiErrorMessage(Query.error)} /></AppShell>;
  }

  if (Query.data && Query.data.resultAvailable && !Query.data.questions?.length) {
    return (
      <AppShell>
        <div className="math-card p-6">
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">Assessment closed.</h1>
          <button className="math-role-action-button mt-5 px-4 py-2.5 text-sm" onClick={() => Router.push(`/student/assessment-result/${AttemptId}`)}>View Result</button>
        </div>
      </AppShell>
    );
  }

  if (!Attempt || Questions.length === 0 || !CurrentQuestion) {
    return <AppShell><LoadingState label="Preparing assessment questions..." /></AppShell>;
  }

  const Metadata = (CurrentQuestion as any).metadata || {};
  const SectionTitle = String(Metadata.section_title || Metadata.sectionTitle || "").trim();
  const SectionNumber = Metadata.section_number || Metadata.sectionNumber;
  const TotalSections = Number(Metadata.dps_total_sections || Metadata.dpsTotalSections || 0);
  const ShowSectionLabel = Boolean(SectionTitle);
  const SectionLabel = ShowSectionLabel
    ? (TotalSections > 1 ? `Section ${SectionNumber || 1} · ${SectionTitle}` : SectionTitle)
    : "Assessment Question";

  const Busy = ManualSubmitMutation.isPending || AutoSubmitMutation.isPending;
  const Saving = SavingQuestionId === CurrentQuestion.questionId;

  return (
    <AppShell title="Assessment Attempt">
      {/* 2026-10 (student revamp): same test shell as the practice-sheet, mock
          and annual screens -- side arrows as in-flow siblings of the card (see
          the 2026-09-02 note in student/attempt/[attemptId]/page.tsx), a compact
          title bar, counters and timer pinned under the header, the question
          board beside the options, then the navigator. Behaviour is unchanged:
          the same queries, mutations, timer and handlers as before. */}
      <div className="se-test flex items-stretch gap-2 sm:gap-3">
        <button
          type="button"
          onClick={() => SetCurrentIndex((Value) => Math.max(0, Value - 1))}
          disabled={CurrentIndex === 0}
          aria-label="Previous question"
          className="se-arrow hidden md:flex shrink-0 self-center h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>

        <section className="se-test-card math-slide-up math-card flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
          <div className="se-test-top relative overflow-hidden px-5 py-4 sm:px-6">
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <h1 className="se-test-title se-test-title-lg">{Attempt.title}</h1>
              <p className="se-chip se-chip-accent">
                Question {CurrentQuestion.questionNumber} Of {Questions.length}
              </p>
            </div>
            <p className="se-test-note relative z-10">
              Answer with focus and move through each question using the navigator.
            </p>
          </div>

          <div className="se-stat-row sticky z-[90] grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <StatCard icon={<ClipboardCheck size={18} />} label="Answered" value={AnsweredNumbers.length} />
            <StatCard icon={<Layers3 size={18} />} label="Remaining" value={Questions.length - AnsweredNumbers.length} />
            <StatCard icon={<Gauge size={18} />} label="Current" value={`Q${CurrentQuestion.questionNumber}`} />
            <TimerMetricCard remainingSeconds={RemainingSeconds} />
          </div>

          {/* Decided once for the whole assessment, so the options never move between questions. */}
          <div className={`se-mcq grid gap-3 ${NeedsWideQuestionBoard(Questions) ? "se-mcq-wide" : ""}`}>
            <div className="se-mcq-panel flex min-w-0 flex-col p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="se-chip se-chip-accent"><Layers3 size={14} /> {SectionLabel}</span>
                <h2 className="se-mcq-heading">Question {CurrentQuestion.questionNumber}</h2>
                <span className={`se-save ml-auto ${Saving ? "se-save-busy" : "se-save-done"}`}>
                  {Saving ? "Saving Answer..." : "Auto-Saved"}
                </span>
              </div>
              <div className="mp-qboard mt-3 flex flex-1 items-center justify-center rounded-[22px] p-2.5 sm:p-3">
                <MathQuestionDisplay operands={CurrentQuestion.operands} operators={CurrentQuestion.operators} displayType={(CurrentQuestion as any).displayType ?? (CurrentQuestion as any).display_type} questionText={(CurrentQuestion as any).questionText ?? (CurrentQuestion as any).question_text} />
              </div>
            </div>

            <div className="se-mcq-panel flex min-w-0 flex-col p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <span className="se-chip"><CheckCircle2 size={14} /> Select Answer</span>
              </div>
              <div className="se-mcq-options mt-3 grid flex-1 content-center gap-3 sm:grid-cols-2">
                {CurrentQuestion.options.map((Option) => (
                  <OptionButton
                    key={Option.optionId}
                    option={Option as any}
                    selected={SelectedAnswers[CurrentQuestion.questionId] === Option.optionId}
                    disabled={Busy || RemainingSeconds <= 0}
                    onClick={() => HandleSelect(CurrentQuestion.questionId, Option.optionId)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="se-test-nav p-3">
            <QuestionNavigator totalQuestions={Questions.length} currentQuestionNumber={CurrentQuestion.questionNumber} answeredQuestionNumbers={AnsweredNumbers} onSelectQuestion={(Number) => SetCurrentIndex(Number - 1)} />
            {/* Below md the side arrows are hidden, so Previous / Next live here. */}
            <div className="mt-3 flex gap-3 md:hidden">
              <button className="math-button-secondary flex-1" disabled={CurrentIndex === 0} onClick={() => SetCurrentIndex((Value) => Math.max(0, Value - 1))}>Previous</button>
              <button className="math-button-secondary flex-1" disabled={CurrentIndex >= Questions.length - 1} onClick={() => SetCurrentIndex((Value) => Math.min(Questions.length - 1, Value + 1))}>Next</button>
            </div>
            <div className="mt-3 flex justify-center">
              <button className="math-button-primary w-full max-w-md py-2.5" onClick={() => SetShowConfirm(true)} disabled={Busy}>Submit Assessment</button>
            </div>
          </div>
        </section>

        <button
          type="button"
          onClick={() => SetCurrentIndex((Value) => Math.min(Questions.length - 1, Value + 1))}
          disabled={CurrentIndex >= Questions.length - 1}
          aria-label="Next question"
          className="se-arrow hidden md:flex shrink-0 self-center h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      <ConfirmDialog open={ShowConfirm} title="Submit Assessment?" message={`You have answered ${AnsweredNumbers.length} out of ${Questions.length} questions. Unanswered questions will receive 0 marks.`} confirmLabel={ManualSubmitMutation.isPending ? "Submitting..." : "Submit"} onCancel={() => SetShowConfirm(false)} onConfirm={() => ManualSubmitMutation.mutate()} />
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
        <p className="se-stat-sub">Timer</p>
      </div>
      <div className="shrink-0">
        <TestTimer remainingSeconds={remainingSeconds} className="!px-3.5 !py-2 !text-sm" />
      </div>
    </div>
  );
}
