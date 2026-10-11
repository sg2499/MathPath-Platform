"use client";

import { AppShell } from "@/components/common/AppShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { NeedsWideQuestionBoard } from "@/components/common/MathQuestionDisplay";
import { QuestionCard } from "@/components/student/QuestionCard";
import type { AnswerInputBoxHandle } from "@/components/student/AnswerInputBox";
import { AssessmentSectionBriefing } from "@/components/student/AssessmentSectionBriefing";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { TestTimer } from "@/components/student/TestTimer";
import { PhoneTestBar } from "@/components/student/PhoneTestBar";
import { useAttemptTimer } from "@/hooks/useAttemptTimer";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  autoSubmitAssessmentAttempt,
  resumeAssessmentAttempt,
  saveAssessmentAnswer,
  submitAssessmentAttempt,
  type AssessmentSection,
} from "@/lib/api/student";
import { setPaperInProgress } from "@/lib/paperFocus";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Gauge, Layers3 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// Same one-time sessionStorage handoff pattern used for mock exams and DPS
// (see stashRewardBreakdownForResult in those attempt pages) -- the reward
// modal is wired into assessments too (2026-08-26). It shows immediately on
// the result page: an assessment has no confetti and no badge reveal. Since
// 2026-10-06 a rank-up plays after it (stashRankUpForResult below).
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

// Same handoff for a rank-up: when the XP this assessment awarded moved the
// student to a new rank tier, the submit reply says so (rankedUp /
// newRankTier) and the result page plays the rank-up animation after the
// reward window -- the same finale the practice-sheet and mock result pages
// have. Mirrors stashRankUpForResult on those attempt pages.
function stashRankUpForResult(AttemptId: string, Response: unknown) {
  try {
    const Data = Response as { rankedUp?: boolean; newRankTier?: string | null } | undefined;
    if (Data?.rankedUp && Data?.newRankTier) {
      sessionStorage.setItem(`mp_rank_up_${AttemptId}`, Data.newRankTier);
    }
  } catch (Error) {
    console.error("Failed to stash rank-up for result reveal", Error);
  }
}

// Waits between tries of a failed answer save, as on the Annual Competition
// screen: a save that fails because the connection or the server hiccuped is
// tried again by itself, and an error shows only if every try fails.
const SAVE_RETRY_DELAYS_MS = [1000, 2000, 4000, 6000];

function IsRetryableSaveError(Error: unknown): boolean {
  const Status = (Error as { response?: { status?: number } } | null)?.response?.status;
  if (Status == null) return true;
  return Status >= 500 || Status === 408 || Status === 429;
}

// Which sections of this attempt have had their slide (kept per browser tab,
// so a refresh does not show a slide again).
function SeenSectionsKey(AttemptId: string) {
  return `mp_assessment_sections_seen_${AttemptId}`;
}

function ReadSeenSections(AttemptId: string): Set<number> {
  try {
    const Raw = sessionStorage.getItem(SeenSectionsKey(AttemptId));
    return new Set(Raw ? (JSON.parse(Raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function WriteSeenSections(AttemptId: string, Seen: Set<number>) {
  try {
    sessionStorage.setItem(SeenSectionsKey(AttemptId), JSON.stringify(Array.from(Seen)));
  } catch {
    // Private mode or storage blocked: the slide may show again after a refresh.
  }
}

function SectionForQuestion(Sections: AssessmentSection[], QuestionNumber: number | undefined): AssessmentSection | null {
  if (QuestionNumber == null) return null;
  return Sections.find((Section) => QuestionNumber >= Section.firstQuestionNumber && QuestionNumber <= Section.lastQuestionNumber) || null;
}

export default function StudentAssessmentAttemptPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Params = useParams<{ attemptId: string }>();
  const Router = useRouter();
  const AttemptId = Params.attemptId;
  const [CurrentIndex, SetCurrentIndex] = useState(0);
  const [ShowConfirm, SetShowConfirm] = useState(false);
  const [SavingQuestionId, SetSavingQuestionId] = useState<string | null>(null);
  const [SaveError, SetSaveError] = useState<unknown>(null);
  const [LocalAnswers, SetLocalAnswers] = useState<Record<string, string>>({});
  // The window where Submit (or time-up) is waiting for every typed answer to
  // reach the server before the submit call itself is made -- the same guard
  // the practice-sheet and Annual Competition screens have.
  const [IsFinalizing, SetIsFinalizing] = useState(false);
  const AnswerInputRef = useRef<AnswerInputBoxHandle>(null);
  const PendingSavesRef = useRef<Set<Promise<unknown>>>(new Set());
  const LatestTypedRef = useRef<Map<string, string>>(new Map());
  const LeavingRef = useRef(false);

  // Section slides (option "a", Shailesh 2026-10-11): one slide as each
  // section is first reached; one timer for the whole paper.
  const [Briefing, SetBriefing] = useState<{ Upcoming: AssessmentSection; Previous: AssessmentSection | null } | null>(null);
  const SeenSectionsRef = useRef<Set<number> | null>(null);
  const LastSectionNumberRef = useRef<number | null>(null);

  const Query = useQuery({
    queryKey: ["assessment-attempt", AttemptId],
    queryFn: () => resumeAssessmentAttempt(AttemptId),
    enabled: Ready && Boolean(AttemptId),
    refetchOnWindowFocus: false,
  });

  const Attempt = Query.data && Query.data.questions ? Query.data : null;
  const Questions = Attempt?.questions || [];
  const Sections = Attempt?.sections || [];
  const CurrentQuestion = Questions[CurrentIndex];
  const AttemptRunning = Boolean(Attempt && Attempt.status === "IN_PROGRESS" && Questions.length > 0);

  // While the paper is running the notification bell stops its background
  // refresh (see lib/paperFocus.ts), as on every other test screen.
  useEffect(() => {
    setPaperInProgress(AttemptRunning);
    return () => setPaperInProgress(false);
  }, [AttemptRunning]);

  const GoToResult = useCallback(
    (Response: unknown) => {
      if (LeavingRef.current) return;
      LeavingRef.current = true;
      stashRewardBreakdownForResult(AttemptId, Response);
      stashRankUpForResult(AttemptId, Response);
      Router.replace(`/student/assessment-result/${AttemptId}`);
    },
    [AttemptId, Router]
  );

  const AutoSubmitMutation = useMutation({
    mutationFn: () => autoSubmitAssessmentAttempt(AttemptId),
    onSuccess: GoToResult,
    // A failed auto-submit must not leave the screen locked: the server
    // submits the expired attempt itself on the next read.
    onError: () => {
      SetIsFinalizing(false);
      Query.refetch();
    },
  });

  const ManualSubmitMutation = useMutation({
    mutationFn: () => submitAssessmentAttempt(AttemptId),
    onSuccess: GoToResult,
  });

  // Forces whatever is in the visible answer box's short save delay to save
  // now, then waits for every save still on its way to the server.
  const FlushAndAwaitAllPendingSaves = useCallback(async () => {
    AnswerInputRef.current?.flushPendingSave();
    while (PendingSavesRef.current.size > 0) {
      await Promise.allSettled(Array.from(PendingSavesRef.current));
    }
  }, []);

  const HandleTimeUp = useCallback(() => {
    if (!Attempt || Questions.length === 0) return;
    if (AutoSubmitMutation.isPending || ManualSubmitMutation.isPending) return;
    SetIsFinalizing(true);
    FlushAndAwaitAllPendingSaves()
      .catch(() => undefined)
      .finally(() => AutoSubmitMutation.mutate());
  }, [Attempt, Questions.length, AutoSubmitMutation, ManualSubmitMutation.isPending, FlushAndAwaitAllPendingSaves]);

  const RemainingSeconds = useAttemptTimer(Attempt ? Attempt.remainingSeconds : 999999, HandleTimeUp, () => Query.refetch());

  const SavedAnswers: Record<string, string> = {};
  Questions.forEach((Question) => {
    if (Question.savedAnswerText) SavedAnswers[Question.questionId] = Question.savedAnswerText;
  });
  Object.assign(SavedAnswers, LocalAnswers);
  const AnsweredNumbers = Questions.filter((Question) => (SavedAnswers[Question.questionId] || "").trim()).map((Question) => Question.questionNumber);

  // A slide the first time each section is reached -- by Enter, the arrows
  // or the number strip alike. Going back to a section already seen shows
  // none. A paper with a single section has no slides.
  useEffect(() => {
    if (!AttemptRunning || Sections.length < 2 || !CurrentQuestion) return;
    if (!SeenSectionsRef.current) SeenSectionsRef.current = ReadSeenSections(AttemptId);
    const Section = SectionForQuestion(Sections, CurrentQuestion.questionNumber);
    if (!Section) return;
    const PreviousNumber = LastSectionNumberRef.current;
    LastSectionNumberRef.current = Section.sectionNumber;
    if (SeenSectionsRef.current.has(Section.sectionNumber)) return;
    const Previous = PreviousNumber != null && PreviousNumber !== Section.sectionNumber
      ? Sections.find((Item) => Item.sectionNumber === PreviousNumber) || null
      : null;
    AnswerInputRef.current?.flushPendingSave();
    SetBriefing({ Upcoming: Section, Previous });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [AttemptRunning, CurrentQuestion?.questionNumber, Sections.length, AttemptId]);

  function HandleStartSection() {
    if (!Briefing) return;
    const Seen = SeenSectionsRef.current || new Set<number>();
    Seen.add(Briefing.Upcoming.sectionNumber);
    SeenSectionsRef.current = Seen;
    WriteSeenSections(AttemptId, Seen);
    // The student stays on the question that brought them here (the first
    // question of the section when moving on, or the one they picked).
    SetBriefing(null);
  }

  async function PersistAnswer(QuestionId: string, AnswerText: string) {
    // Not gated on the local timer: at time-up the last typed answer is
    // flushed through here just before the auto-submit.
    if (!Attempt || LeavingRef.current) return;
    LatestTypedRef.current.set(QuestionId, AnswerText);
    SetLocalAnswers((Previous) => ({ ...Previous, [QuestionId]: AnswerText }));
    SetSavingQuestionId(QuestionId);
    SetSaveError(null);
    let RetriesDone = 0;
    try {
      for (;;) {
        try {
          const Response = await saveAssessmentAnswer(AttemptId, { questionId: QuestionId, answerText: AnswerText });
          if (Response?.resultAvailable) {
            // The server closed the attempt (time ran out) while this was typed.
            Router.replace(`/student/assessment-result/${AttemptId}`);
          }
          return;
        } catch (Error) {
          if (!IsRetryableSaveError(Error) || RetriesDone >= SAVE_RETRY_DELAYS_MS.length) {
            SetSaveError(Error);
            return;
          }
          await new Promise((Resolve) => window.setTimeout(Resolve, SAVE_RETRY_DELAYS_MS[RetriesDone]));
          RetriesDone += 1;
          // A newer answer for this question has its own save under way.
          if (LatestTypedRef.current.get(QuestionId) !== AnswerText) return;
        }
      }
    } finally {
      SetSavingQuestionId((Value) => (Value === QuestionId ? null : Value));
    }
  }

  function HandleSaveAnswer(QuestionId: string, AnswerText: string) {
    const SavePromise = PersistAnswer(QuestionId, AnswerText);
    PendingSavesRef.current.add(SavePromise);
    SavePromise.finally(() => {
      PendingSavesRef.current.delete(SavePromise);
    });
  }

  async function HandleSubmit() {
    if (ManualSubmitMutation.isPending || AutoSubmitMutation.isPending) return;
    SetIsFinalizing(true);
    try {
      await FlushAndAwaitAllPendingSaves();
      ManualSubmitMutation.mutate();
    } finally {
      SetIsFinalizing(false);
    }
  }

  // Enter moves to the next question from anywhere on the page, as on the
  // Annual Competition screen (the slide handles its own Enter).
  const Busy = ManualSubmitMutation.isPending || AutoSubmitMutation.isPending || IsFinalizing;
  useEffect(() => {
    function HandleGlobalKeyDown(Event: KeyboardEvent) {
      if (Event.key !== "Enter" || Event.repeat) return;
      if (Event.target instanceof HTMLButtonElement) return;
      if (Briefing || ShowConfirm || Busy) return;
      if (!AttemptRunning || RemainingSeconds <= 0 || Questions.length === 0) return;
      Event.preventDefault();
      AnswerInputRef.current?.flushPendingSave();
      SetCurrentIndex((Value) => Math.min(Questions.length - 1, Value + 1));
    }
    window.addEventListener("keydown", HandleGlobalKeyDown);
    return () => window.removeEventListener("keydown", HandleGlobalKeyDown);
  }, [Briefing, ShowConfirm, Busy, AttemptRunning, RemainingSeconds, Questions.length]);

  if (!Ready) return null;

  if (Query.isLoading || !Query.data) {
    return <AppShell title="Level Assessment"><LoadingState label="Loading assessment..." /></AppShell>;
  }

  if (Query.error) {
    return <AppShell title="Level Assessment"><ErrorState message={apiErrorMessage(Query.error)} /></AppShell>;
  }

  if (Query.data.resultAvailable && !Query.data.questions?.length) {
    return (
      <AppShell title="Level Assessment">
        <div className="math-card p-6">
          <div className="math-block-header mb-2"><ClipboardCheck size={14} /> {Query.data.title}</div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">This assessment is submitted</h1>
          <p className="math-subtitle max-w-none">Your answers have been marked. Open the result to see your score.</p>
          <button className="math-role-action-button mt-5 px-4 py-2.5 text-sm" onClick={() => Router.push(`/student/assessment-result/${AttemptId}`)}>View Result</button>
        </div>
      </AppShell>
    );
  }

  if (!Attempt || Questions.length === 0 || !CurrentQuestion) {
    return <AppShell title="Level Assessment"><LoadingState label="Preparing assessment questions..." /></AppShell>;
  }

  if (Briefing) {
    const PreviousAnswered = Briefing.Previous
      ? AnsweredNumbers.filter((Number) => Number >= Briefing.Previous!.firstQuestionNumber && Number <= Briefing.Previous!.lastQuestionNumber).length
      : 0;
    return (
      <AppShell title="Level Assessment">
        <AssessmentSectionBriefing
          Title={Attempt.title}
          Upcoming={Briefing.Upcoming}
          Previous={Briefing.Previous}
          PreviousAnswered={PreviousAnswered}
          TotalSections={Sections.length}
          RemainingSeconds={RemainingSeconds}
          OnStart={HandleStartSection}
        />
      </AppShell>
    );
  }

  const CurrentSection = SectionForQuestion(Sections, CurrentQuestion.questionNumber);
  const SectionHeading = CurrentSection
    ? CurrentSection.title
      ? `Section ${CurrentSection.sectionNumber}: ${CurrentSection.title}`
      : `Section ${CurrentSection.sectionNumber}`
    : "Assessment Question";
  const IsLastQuestion = CurrentIndex >= Questions.length - 1;
  const Unanswered = Questions.length - AnsweredNumbers.length;

  return (
    <AppShell title="Level Assessment">
      {/* 2026-10-11 (Shailesh): the same test screen as the Annual
          Competition -- side arrows as in-flow siblings of the card, a
          compact title bar, counters and timer pinned under the header, the
          typed answer box beside the question, the Enter hint, then the
          number strip and Submit. One timer runs for the whole paper; the
          student can go back to any question or section before submitting. */}
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
          <PhoneTestBar questionNumber={CurrentQuestion.questionNumber} totalQuestions={Questions.length} remainingSeconds={RemainingSeconds} />
          <div className="se-test-top relative overflow-hidden px-5 py-4 sm:px-6">
            <div className="relative z-10">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h1 className="se-test-title se-test-title-lg">{Attempt.title}</h1>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="se-chip se-chip-accent">
                    Question {CurrentQuestion.questionNumber} Of {Questions.length}
                  </p>
                  {CurrentSection && Sections.length > 1 ? (
                    <p className="se-chip">
                      Section {CurrentSection.sectionNumber} Of {Sections.length}
                    </p>
                  ) : null}
                </div>
              </div>
              <p className="se-test-note">
                One timer runs for the whole assessment. You can go back to any question or section and change your answer before you submit.
              </p>
            </div>
          </div>

          <div className="se-stat-row sticky z-[90] grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
            <StatCard icon={<ClipboardCheck size={18} />} label="Answered" value={AnsweredNumbers.length} />
            <StatCard icon={<Layers3 size={18} />} label="Remaining" value={Unanswered} />
            <StatCard icon={<Gauge size={18} />} label="Current" value={`Q${CurrentQuestion.questionNumber}`} />
            <TimerMetricCard remainingSeconds={RemainingSeconds} />
          </div>

          <div>
            <div className="math-block-header !mb-2"><Layers3 size={14} /> {SectionHeading}</div>
            <QuestionCard
              key={CurrentQuestion.questionId}
              question={CurrentQuestion}
              answerInputRef={AnswerInputRef}
              savedAnswerText={SavedAnswers[CurrentQuestion.questionId]}
              disabled={Busy || RemainingSeconds <= 0}
              saving={SavingQuestionId === CurrentQuestion.questionId}
              compact
              wide={NeedsWideQuestionBoard(Questions)}
              onSave={(AnswerText) => HandleSaveAnswer(CurrentQuestion.questionId, AnswerText)}
              phoneNav={{
                canPrevious: CurrentIndex > 0,
                canNext: !IsLastQuestion,
                onPrevious: () => SetCurrentIndex((Value) => Math.max(0, Value - 1)),
                onNext: () => SetCurrentIndex((Value) => Math.min(Questions.length - 1, Value + 1)),
              }}
            />
            <p className="se-test-hint mt-2 text-center font-bold text-slate-500 dark:text-slate-400">
              Press{" "}
              <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Enter
              </kbd>{" "}
              to move to the next question
            </p>
          </div>

          {SaveError ? <ErrorState message={`Your last answer did not save. Check your connection and type it again. (${apiErrorMessage(SaveError)})`} /> : null}
          {ManualSubmitMutation.error ? <ErrorState message={apiErrorMessage(ManualSubmitMutation.error)} /> : null}
          {AutoSubmitMutation.error ? <ErrorState message={apiErrorMessage(AutoSubmitMutation.error)} /> : null}

          <div className="se-test-nav p-3">
            <QuestionNavigator
              totalQuestions={Questions.length}
              currentQuestionNumber={CurrentQuestion.questionNumber}
              answeredQuestionNumbers={AnsweredNumbers}
              onSelectQuestion={(Number) => SetCurrentIndex(Number - 1)}
            />
            <button
              className="math-button-primary mt-3 w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => SetShowConfirm(true)}
              disabled={Busy}
            >
              {Busy ? "Submitting..." : "Submit Assessment"}
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={() => SetCurrentIndex((Value) => Math.min(Questions.length - 1, Value + 1))}
          disabled={IsLastQuestion}
          aria-label="Next question"
          className="se-arrow hidden md:flex shrink-0 self-center h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      <ConfirmDialog
        open={ShowConfirm}
        title="Submit Assessment?"
        message={
          Unanswered > 0
            ? `You have answered ${AnsweredNumbers.length} of ${Questions.length} questions. The ${Unanswered} unanswered ${Unanswered === 1 ? "question gets" : "questions get"} 0 marks. Once submitted, the assessment is complete.`
            : `You have answered all ${Questions.length} questions. Once submitted, the assessment is complete.`
        }
        confirmLabel={Busy ? "Submitting..." : "Submit"}
        onCancel={() => SetShowConfirm(false)}
        onConfirm={() => {
          SetShowConfirm(false);
          HandleSubmit();
        }}
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
        <p className="se-stat-sub">Assessment Timer</p>
      </div>
      <div className="shrink-0">
        <TestTimer remainingSeconds={remainingSeconds} className="!px-3.5 !py-2 !text-sm" />
      </div>
    </div>
  );
}
