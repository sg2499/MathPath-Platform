"use client";

import { AppShell } from "@/components/common/AppShell";
import { Chip } from "@/components/common/DetailWorkspaceViews";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { QuestionCard } from "@/components/student/QuestionCard";
import type { AnswerInputBoxHandle } from "@/components/student/AnswerInputBox";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { TestTimer } from "@/components/student/TestTimer";
import { useAnnualCompetitionHeartbeat } from "@/hooks/useAnnualCompetitionHeartbeat";
import { useAttemptTimer } from "@/hooks/useAttemptTimer";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorDetail, apiErrorMessage } from "@/lib/api";
import {
  downloadAnnualCompetitionCertificate,
  getAnnualCompetitionAttempt,
  getAnnualCompetitionAttemptReview,
  getAnnualCompetitionResult,
  saveAnnualCompetitionAnswer,
  startAnnualCompetitionAttempt,
  startAnnualCompetitionPracticeAttempt,
  submitAnnualCompetitionSection,
  type AnnualCompetitionAttempt,
  type AnnualCompetitionAttemptReview,
  type AnnualCompetitionAttemptReviewQuestion,
} from "@/lib/api/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, ClipboardCheck, Gauge, Layers3, ListChecks, ShieldAlert, Trophy } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

function triggerBlobDownload(BlobValue: Blob, FileName: string) {
  const Url = window.URL.createObjectURL(BlobValue);
  const Anchor = document.createElement("a");
  Anchor.href = Url;
  Anchor.download = FileName;
  document.body.appendChild(Anchor);
  Anchor.click();
  Anchor.remove();
  window.URL.revokeObjectURL(Url);
}

export default function AnnualCompetitionAttemptPage() {
  return <AnnualCompetitionAttemptContent />;
}

function AnnualCompetitionAttemptContent() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;

  const [liveAttempt, setLiveAttempt] = useState<AnnualCompetitionAttempt | null>(null);
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [sessionSuperseded, setSessionSuperseded] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<unknown>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});
  const [savingQuestionId, setSavingQuestionId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<unknown>(null);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [submittingSection, setSubmittingSection] = useState(false);
  // Point 8 (Shailesh, 2026-09-08): mirrors the DPS attempt page's own
  // isFinalizingSubmit exactly -- the window where a section-submit is
  // flushing and awaiting every pending typed-answer save before the
  // submit call itself is made, so a correct, already-typed answer can
  // never lose a race against Submit firing before its debounced save
  // lands (see AnswerInputBox's own docstring and the DPS attempt page's
  // flushAndAwaitAllPendingSaves() for the confirmed 2026-09-04 bug this
  // closes). The backend's matching half of this guarantee is
  // _LockAttemptForUpdate in annual_competition_attempt_service.py.
  const [isFinalizingSubmit, setIsFinalizingSubmit] = useState(false);
  const answerInputRef = useRef<AnswerInputBoxHandle>(null);
  // Every currently-in-flight saveAnnualCompetitionAnswer() call, keyed by
  // its own promise -- each entry removes itself once settled.
  // flushAndAwaitAllPendingSaves below awaits this whole set, exactly
  // mirroring the DPS attempt page's own pendingSavesRef.
  const pendingSavesRef = useRef<Set<Promise<unknown>>>(new Set());

  const attemptQuery = useQuery({
    queryKey: ["annual-competition-attempt", attemptId],
    queryFn: () => getAnnualCompetitionAttempt(attemptId),
    enabled: ready && Boolean(attemptId),
    // Heartbeats already keep timing/state fresh on their own cadence -- this
    // query is only ever (re)fetched deliberately (initial load, or after a
    // detected section/status change), never on a background poll.
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (attemptQuery.data) setLiveAttempt(attemptQuery.data);
  }, [attemptQuery.data]);

  // Package 6 (Scoring + Results): only ever queried once the attempt has
  // left IN_PROGRESS -- there is nothing to show mid-attempt, and the
  // endpoint itself always returns released:false rather than an error
  // while a result is uncomputed/unreleased (REQUIREMENTS.md item 5's full
  // lock-down is the expected common state here, not a failure).
  const resultQuery = useQuery({
    queryKey: ["annual-competition-result", attemptId],
    queryFn: () => getAnnualCompetitionResult(attemptId),
    enabled: ready && Boolean(attemptId) && Boolean(liveAttempt) && liveAttempt?.status !== "IN_PROGRESS",
    refetchOnWindowFocus: false,
  });

  // Phase G (Competition Practice): the Answer Sheet/Scorecard tabs below,
  // shared by OFFICIAL and PRACTICE attempts alike -- same gating as
  // resultQuery above (nothing to show mid-attempt), and same
  // released:false lock-down convention (a lean shape while unreleased,
  // never a partial peek -- see getAnnualCompetitionAttemptReview's own
  // docstring on the backend).
  const reviewQuery = useQuery({
    queryKey: ["annual-competition-attempt-review", attemptId],
    queryFn: () => getAnnualCompetitionAttemptReview(attemptId),
    enabled: ready && Boolean(attemptId) && Boolean(liveAttempt) && liveAttempt?.status !== "IN_PROGRESS",
    refetchOnWindowFocus: false,
  });
  const [reviewTab, setReviewTab] = useState<"answerSheet" | "scorecard">("answerSheet");

  // Package 8 (certificate half): only ever offered once resultQuery.data
  // itself says released:true -- the backend re-checks this independently
  // on every download, so this button being visible is a UX convenience,
  // not the actual gate.
  const certificateMutation = useMutation({
    mutationFn: () => downloadAnnualCompetitionCertificate(attemptId),
    onSuccess: (BlobValue) => triggerBlobDownload(BlobValue, "MathPath-Annual-Competition-Certificate.pdf"),
  });

  // Bootstrap: a plain GET never carries a session_token (only Start/Resume
  // does -- see the backend service's own module docstring on why). So the
  // very first thing this screen does once it knows the attempt is still
  // IN_PROGRESS is call Start again, which resumes this exact attempt and
  // reissues a fresh token -- this IS the "resume here" remediation, and it
  // runs unconditionally on every mount (a refresh included), not just the
  // very first visit.
  //
  // Phase G (Competition Practice): this attempt can be OFFICIAL or
  // PRACTICE -- StartAnnualCompetitionPracticeAttempt is a different
  // endpoint that additionally requires the competition level code (it
  // looks the practice paper up by event+level, not just event, even to
  // resume). liveAttempt.competitionLevelCode is sourced by the backend's
  // _AttemptPayload specifically so this resume call never needs a second
  // round trip to find it. If it's ever missing on a PRACTICE attempt
  // (should not happen -- see that backend comment), this fails loudly via
  // bootstrapError rather than silently guessing an endpoint/argument.
  const bootstrapRequestedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!liveAttempt || liveAttempt.status !== "IN_PROGRESS") return;
    if (sessionToken || bootstrapRequestedRef.current === liveAttempt.attemptId) return;
    bootstrapRequestedRef.current = liveAttempt.attemptId;
    if (liveAttempt.attemptType === "PRACTICE") {
      if (!liveAttempt.competitionLevelCode) {
        setBootstrapError(new Error("This practice attempt is missing its competition level code and cannot be resumed."));
        return;
      }
      startAnnualCompetitionPracticeAttempt(liveAttempt.eventId, liveAttempt.competitionLevelCode)
        .then((data) => setSessionToken(data.sessionToken))
        .catch((error) => setBootstrapError(error));
    } else {
      startAnnualCompetitionAttempt(liveAttempt.eventId)
        .then((data) => setSessionToken(data.sessionToken))
        .catch((error) => setBootstrapError(error));
    }
  }, [liveAttempt, sessionToken]);

  const handleHeartbeatUpdate = useCallback(
    (updated: AnnualCompetitionAttempt) => {
      setLiveAttempt((prev) => {
        if (!prev) return updated;
        const sectionChanged = updated.currentSectionNumber !== prev.currentSectionNumber;
        const statusChanged = updated.status !== prev.status;
        if (sectionChanged || statusChanged) {
          // The heartbeat response is deliberately lean (no question data) --
          // fetch the new section's questions (or the final SUBMITTED state)
          // via a real GET rather than trying to patch that in locally.
          attemptQuery.refetch();
          setCurrentIndex(0);
          setLocalAnswers({});
        }
        return { ...prev, status: updated.status, currentSectionNumber: updated.currentSectionNumber, submittedAt: updated.submittedAt, sections: updated.sections };
      });
    },
    [attemptQuery]
  );

  const handleHeartbeatError = useCallback((error: unknown) => {
    const detail = apiErrorDetail(error);
    if (detail?.code === "COMPETITION_ATTEMPT_SESSION_SUPERSEDED") {
      setSessionSuperseded(true);
      setSessionToken(undefined);
    }
    // Any other error (a transient network hiccup) is left to the next
    // scheduled heartbeat -- surfacing every single one would be noisy and
    // self-corrects within HEARTBEAT_INTERVAL_MS anyway.
  }, []);

  const activeSectionState = liveAttempt?.sections.find((section) => section.sectionNumber === liveAttempt.currentSectionNumber) || null;
  const heartbeatEnabled = Boolean(liveAttempt && liveAttempt.status === "IN_PROGRESS" && sessionToken && !sessionSuperseded);

  const { fireNow } = useAnnualCompetitionHeartbeat(
    attemptId,
    sessionToken,
    liveAttempt?.currentSectionNumber,
    heartbeatEnabled,
    handleHeartbeatUpdate,
    handleHeartbeatError
  );

  // Purely visual countdown between heartbeats -- re-anchors to the fresh
  // server value every time a heartbeat lands (activeSectionState.remainingSeconds
  // changes), same anchoring approach as useAttemptTimer already uses for
  // Competition Mock. Hitting zero locally does not submit anything itself
  // (there is no separate auto-submit endpoint here); it just asks the
  // server for an out-of-cadence heartbeat so the lazy self-correction
  // (already proven server-side) reflects here immediately instead of
  // waiting for the next scheduled beat.
  const handleLocalTimeUp = useCallback(() => {
    fireNow();
  }, [fireNow]);

  const remainingSeconds = useAttemptTimer(
    activeSectionState?.remainingSeconds ?? 999999,
    handleLocalTimeUp
  );

  const questions = liveAttempt?.activeSectionQuestions || [];
  const currentQuestion = questions[currentIndex];

  // Point 8 (2026-09-08): typed free-text answers, matching DPS -- see
  // DPS's own attempt page for the identical pattern this mirrors.
  // savedAnswers is keyed by questionId -> the typed text (server-saved
  // value merged with anything typed locally this session but not yet
  // round-tripped).
  const savedAnswers: Record<string, string> = {};
  questions.forEach((question) => {
    if (question.savedAnswerText) savedAnswers[question.questionId] = question.savedAnswerText;
  });
  Object.assign(savedAnswers, localAnswers);
  const answeredNumbers = questions
    .filter((question) => (savedAnswers[question.questionId] || "").trim())
    .map((question) => question.questionNumber);

  async function persistAnswer(questionId: string, answerText: string) {
    if (!liveAttempt || !sessionToken || liveAttempt.status !== "IN_PROGRESS" || remainingSeconds <= 0) return;
    setLocalAnswers((prev) => ({ ...prev, [questionId]: answerText }));
    setSavingQuestionId(questionId);
    setSaveError(null);
    try {
      const updated = await saveAnnualCompetitionAnswer(attemptId, {
        sessionToken,
        sectionNumber: liveAttempt.currentSectionNumber,
        questionId,
        answerText,
      });
      setLiveAttempt((prev) => (prev ? { ...prev, ...updated } : updated));
      if (updated.status !== "IN_PROGRESS" || updated.currentSectionNumber !== liveAttempt.currentSectionNumber) {
        setCurrentIndex(0);
        setLocalAnswers({});
      }
    } catch (error) {
      const detail = apiErrorDetail(error);
      if (detail?.code === "COMPETITION_ATTEMPT_SESSION_SUPERSEDED") {
        setSessionSuperseded(true);
        setSessionToken(undefined);
      } else {
        setSaveError(error);
      }
    } finally {
      setSavingQuestionId(null);
    }
  }

  // Fired on a shorter pause while typing -- just persists so nothing is
  // ever lost, without moving the student anywhere. Tracked in
  // pendingSavesRef (rather than plain fire-and-forget) so
  // flushAndAwaitAllPendingSaves can guarantee Submit never fires while
  // this request is still on the wire -- see isFinalizingSubmit's own
  // comment above.
  function handleSaveAnswer(questionId: string, answerText: string) {
    const savePromise = persistAnswer(questionId, answerText);
    pendingSavesRef.current.add(savePromise);
    savePromise.finally(() => {
      pendingSavesRef.current.delete(savePromise);
    });
  }

  // Forces whatever's currently sitting in the visible question's 450ms
  // debounce window to save right now, then waits for that request -- and
  // any other still-in-flight save from a question the student already
  // moved past -- to actually be acknowledged by the server. Submit awaits
  // this before firing, so it can never race ahead of an answer the
  // student already finished typing. Exactly mirrors the DPS attempt
  // page's own flushAndAwaitAllPendingSaves().
  const flushAndAwaitAllPendingSaves = useCallback(async () => {
    answerInputRef.current?.flushPendingSave();
    while (pendingSavesRef.current.size > 0) {
      await Promise.allSettled(Array.from(pendingSavesRef.current));
    }
  }, []);

  // Enter-to-advance (2026-09-10, Shailesh): "on hitting the enter key
  // whether from the answer box or not should not matter as soon as the
  // key is hit it should take them to the next question always seamlessly."
  // This is a single page-level listener rather than a per-input handler on
  // AnswerInputBox specifically because focus can legitimately be anywhere
  // (or nowhere) when Enter is pressed -- see AnswerInputBox's own comment
  // for the focus-loss bug that made a per-input handler unreliable here.
  // Flushes whatever's sitting in the debounce window (same as a blur
  // always did) before advancing, so nothing typed is ever lost to the
  // jump. Guarded against firing while the submit-confirm dialog is open
  // (Enter there should confirm the dialog, not skip a question) or while a
  // submit is already in flight.
  useEffect(() => {
    function handleGlobalKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter" || event.repeat) return;
      if (event.target instanceof HTMLButtonElement) return;
      if (showSubmitConfirm || isFinalizingSubmit || submittingSection) return;
      if (!liveAttempt || liveAttempt.status !== "IN_PROGRESS" || remainingSeconds <= 0) return;
      if (questions.length === 0) return;
      event.preventDefault();
      answerInputRef.current?.flushPendingSave();
      setCurrentIndex((value) => Math.min(questions.length - 1, value + 1));
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [showSubmitConfirm, isFinalizingSubmit, submittingSection, liveAttempt, remainingSeconds, questions.length]);

  async function handleSubmitSection() {
    if (!liveAttempt || !sessionToken) return;
    setSubmittingSection(true);
    setIsFinalizingSubmit(true);
    try {
      await flushAndAwaitAllPendingSaves();
      const updated = await submitAnnualCompetitionSection(attemptId, {
        sessionToken,
        sectionNumber: liveAttempt.currentSectionNumber,
      });
      setLiveAttempt((prev) =>
        prev
          ? { ...prev, status: updated.status, currentSectionNumber: updated.currentSectionNumber, submittedAt: updated.submittedAt, sections: updated.sections }
          : updated
      );
      setCurrentIndex(0);
      setLocalAnswers({});
      setShowSubmitConfirm(false);
      // Lean response (no question data) -- same as the heartbeat path.
      attemptQuery.refetch();
    } catch (error) {
      const detail = apiErrorDetail(error);
      if (detail?.code === "COMPETITION_ATTEMPT_SESSION_SUPERSEDED") {
        setSessionSuperseded(true);
        setSessionToken(undefined);
      } else {
        setSaveError(error);
      }
    } finally {
      setSubmittingSection(false);
      setIsFinalizingSubmit(false);
    }
  }

  if (!ready) return null;

  if (attemptQuery.isLoading || !attemptQuery.data) {
    return (
      <AppShell title="Annual Competition">
        <LoadingState label="Loading your competition attempt..." />
      </AppShell>
    );
  }

  if (attemptQuery.error) {
    return (
      <AppShell title="Annual Competition">
        <ErrorState message={apiErrorMessage(attemptQuery.error)} />
      </AppShell>
    );
  }

  if (!liveAttempt) {
    return (
      <AppShell title="Annual Competition">
        <LoadingState label="Loading your competition attempt..." />
      </AppShell>
    );
  }

  if (liveAttempt.status !== "IN_PROGRESS") {
    const result = resultQuery.data?.released ? resultQuery.data.result : null;
    return (
      <AppShell title="Annual Competition">
        <div className="math-card p-6">
          <div className="math-block-header mb-2"><Trophy size={14} /> Annual Competition</div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">Attempt Complete</h1>
          {result ? (
            <>
              <p className="math-subtitle max-w-none">
                Your Annual Competition attempt has been scored. Your official rank and certificate will be released once
                every student at your level has completed their slot.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="math-card p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Accuracy</div>
                  <div className="text-xl font-black text-slate-950 dark:text-white">{result.accuracyPercentage}%</div>
                </div>
                <div className="math-card p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Correct</div>
                  <div className="text-xl font-black text-slate-950 dark:text-white">{result.correctCount}</div>
                </div>
                <div className="math-card p-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Time Taken</div>
                  <div className="text-xl font-black text-slate-950 dark:text-white">{Math.round((result.timeTakenSeconds || 0) / 60)}m</div>
                </div>
                {result.rank ? (
                  <div className="math-card p-3">
                    <div className="text-xs text-slate-500 dark:text-slate-400">Rank</div>
                    <div className="text-xl font-black text-slate-950 dark:text-white">#{result.rank}</div>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="math-subtitle max-w-none">
              Your Annual Competition attempt has been submitted and is now being scored. Ranked results and certificates
              are released together once every student at your level has completed their slot -- check back after the
              competition window closes.
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="math-role-action-button px-4 py-2.5 text-sm" onClick={() => router.push("/student/competition/annual")}>
              Back To Annual Competition
            </button>
            {result ? (
              <button
                className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-950/60"
                onClick={() => certificateMutation.mutate()}
                disabled={certificateMutation.isPending}
              >
                <Award size={16} />
                {certificateMutation.isPending ? "Preparing Certificate..." : "Download Certificate"}
              </button>
            ) : null}
          </div>
          {certificateMutation.isError ? (
            <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-300">{apiErrorMessage(certificateMutation.error)}</p>
          ) : null}
        </div>

        {/* Phase G: Answer Sheet/Scorecard -- reuses this exact tab pair's
            naming/layout from the admin review screen
            (annual-result/[attemptId]/page.tsx), the one thing this screen
            deliberately mirrors, per that page's own comment on why. Only
            rendered once the review is actually released -- for an
            unreleased OFFICIAL attempt reviewQuery.data.sections stays
            null (PRACTICE is always released instantly, see the backend
            docstring, so this appears immediately for practice results). */}
        {reviewQuery.data?.released && reviewQuery.data.sections ? (
          <div className="mt-5 space-y-5">
            <div className="math-card p-2">
              <div className="flex flex-wrap gap-2">
                <ReviewTabButton active={reviewTab === "answerSheet"} onClick={() => setReviewTab("answerSheet")} label="Answer Sheet" />
                <ReviewTabButton active={reviewTab === "scorecard"} onClick={() => setReviewTab("scorecard")} label="Scorecard" />
              </div>
            </div>

            {reviewTab === "answerSheet" ? (
              reviewQuery.data.sections.length === 0 ? (
                <div className="math-card p-5 text-sm font-bold text-slate-700 dark:text-slate-300">
                  No section data is available for this attempt yet.
                </div>
              ) : (
                reviewQuery.data.sections.map((sectionReview) => (
                  <div key={sectionReview.sectionNumber} className="math-card p-5">
                    <div className="mb-4 flex flex-col gap-2 rounded-[22px] border border-[#2563eb]/15 bg-[#2563eb]/5 px-4 py-3 dark:border-slate-700 dark:bg-slate-950/30 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#2563eb] dark:text-cyan-100">
                          Section {sectionReview.sectionNumber}
                        </p>
                        <h3 className="text-lg font-black text-slate-950 dark:text-white">
                          {sectionReview.sectionTitle || `Section ${sectionReview.sectionNumber}`}
                          {sectionReview.mode ? ` · ${sectionReview.mode}` : ""}
                        </h3>
                      </div>
                      <Chip tone="slate">{sectionReview.questions.length} Questions</Chip>
                    </div>

                    {sectionReview.questions.length === 0 ? (
                      <p className="rounded-[20px] border border-[#2563eb]/15 bg-[#2563eb]/5 p-4 text-sm font-bold text-slate-700 dark:border-cyan-300/25 dark:bg-cyan-400/10 dark:text-slate-300">
                        No questions found for this section.
                      </p>
                    ) : (
                      <div className="space-y-5">
                        {sectionReview.questions.map((questionReview) => (
                          <QuestionReviewCard key={questionReview.questionId} question={questionReview} />
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )
            ) : (
              <ScorecardTab review={reviewQuery.data} />
            )}
          </div>
        ) : null}
      </AppShell>
    );
  }

  if (sessionSuperseded) {
    return (
      <AppShell title="Annual Competition">
        <div className="math-card p-6">
          <div className="math-block-header mb-2"><ShieldAlert size={14} /> Session Replaced</div>
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">This attempt is now active elsewhere</h1>
          <p className="math-subtitle max-w-none">
            Your competition attempt was resumed from another tab or device. Reload here to take it back over.
          </p>
          <button className="math-role-action-button mt-5 px-4 py-2.5 text-sm" onClick={() => window.location.reload()}>
            Resume Here
          </button>
        </div>
      </AppShell>
    );
  }

  if (bootstrapError) {
    return (
      <AppShell title="Annual Competition">
        <ErrorState message={apiErrorMessage(bootstrapError)} />
      </AppShell>
    );
  }

  if (!sessionToken || !currentQuestion) {
    return (
      <AppShell title="Annual Competition">
        <LoadingState label={`Preparing Section ${liveAttempt.currentSectionNumber}...`} />
      </AppShell>
    );
  }

  const totalSections = liveAttempt.sections.length;
  // Point 5 fix (2026-09-08): now sourced from the backend (see
  // AnnualCompetitionSectionState's own comment) instead of being entirely
  // absent -- students previously had no way to know a section's actual
  // name or ABACUS/VISUAL method, only its bare number.
  const sectionTitle = activeSectionState?.sectionTitle || null;
  const sectionMode = activeSectionState?.mode || null;
  const sectionHeading = sectionTitle
    ? `Section ${liveAttempt.currentSectionNumber}: ${sectionTitle}`
    : `Section ${liveAttempt.currentSectionNumber}`;

  return (
    <AppShell title="Annual Competition">
      {/* Floating prev/next arrows: normal in-flow flex siblings of the
          card (not absolutely positioned), same fix already proven on the
          DPS attempt page (2026-09-02) for exactly this kind of screen --
          see that page's own comment for why an absolutely-positioned
          version reliably got clipped on real screen widths. */}
      <div className="flex items-stretch gap-2 sm:gap-3">
        <button
          onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
          disabled={currentIndex === 0}
          aria-label="Previous question"
          className="hidden md:flex shrink-0 self-center h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all hover:scale-110 hover:bg-white dark:hover:bg-slate-950 disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>

        <section className="math-slide-up math-card flex min-w-0 flex-1 flex-col gap-4 p-4 sm:p-5 xl:min-h-[calc(100svh-11rem)]">
          <div className="relative overflow-hidden rounded-[34px] border border-white/70 bg-gradient-to-br from-white via-orange-50 to-amber-100 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900 sm:p-6">
            <div className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-amber-300/25 blur-3xl" />
            <div className="relative z-10">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-200">
                  Question {currentQuestion.questionNumber} Of {questions.length}
                </p>
                <p className="inline-flex rounded-full border border-slate-200 bg-white/90 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-200">
                  Section {liveAttempt.currentSectionNumber} Of {totalSections}
                </p>
                {sectionMode ? (
                  <p className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
                    {sectionMode}
                  </p>
                ) : null}
              </div>
              <h1 className="mt-2 w-full text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
                Annual Competition
              </h1>
              <p className="math-subtitle !mt-3 w-full">
                Stay connected -- your timer only pauses briefly on a genuine disconnect. Sections lock sequentially and cannot be revisited.
              </p>
            </div>
          </div>

          <div className="sticky top-[80px] sm:top-[104px] 2xl:top-[144px] z-[90] grid gap-3 rounded-3xl bg-slate-50 p-2 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800 md:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<ClipboardCheck size={16} />} label="ANSWERED" value={answeredNumbers.length} />
            <StatCard icon={<Layers3 size={16} />} label="REMAINING" value={questions.length - answeredNumbers.length} />
            <StatCard icon={<Gauge size={16} />} label="CURRENT" value={`Q${currentQuestion.questionNumber}`} />
            <TimerMetricCard remainingSeconds={remainingSeconds} />
          </div>

          <div>
            <div className="math-block-header !mb-2"><Layers3 size={14} /> {sectionHeading}</div>
            <QuestionCard
              key={currentQuestion.questionId}
              question={currentQuestion}
              answerInputRef={answerInputRef}
              savedAnswerText={savedAnswers[currentQuestion.questionId]}
              disabled={
                isFinalizingSubmit ||
                submittingSection ||
                remainingSeconds <= 0
              }
              saving={savingQuestionId === currentQuestion.questionId}
              compact
              onSave={(answerText) => handleSaveAnswer(currentQuestion.questionId, answerText)}
            />
            {/* 2026-09-10 (Shailesh): "we can add a tooltip somewhere where
                the students know that enter key helps them do this" -- Enter
                itself is handled page-wide by the global listener above
                (see its own comment for why), so the hint lives here rather
                than inside AnswerInputBox. */}
            <p className="mt-2 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400">
              Press{" "}
              <kbd className="rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200">
                Enter
              </kbd>{" "}
              to move to the next question
            </p>
          </div>

          {saveError ? <ErrorState message={apiErrorMessage(saveError)} /> : null}

          <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/85">
            <QuestionNavigator
              totalQuestions={questions.length}
              currentQuestionNumber={currentQuestion.questionNumber}
              answeredQuestionNumbers={answeredNumbers}
              onSelectQuestion={(number) => setCurrentIndex(number - 1)}
            />

            {/* The floating side arrows above are hidden below md -- same
                mobile fallback the DPS attempt page uses for the identical
                reason (no room for their off-card offset on narrow
                screens). */}
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
              className="math-button-primary mt-4 w-full py-3 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submittingSection}
            >
              {submittingSection
                ? "Submitting..."
                : liveAttempt.currentSectionNumber >= totalSections
                  ? "Submit Final Section"
                  : "Submit Section & Continue"}
            </button>
          </div>
        </section>

        <button
          onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}
          disabled={currentIndex >= questions.length - 1}
          aria-label="Next question"
          className="hidden md:flex shrink-0 self-center h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full bg-white/95 dark:bg-slate-900/95 shadow-xl backdrop-blur-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 transition-all hover:scale-110 hover:bg-white dark:hover:bg-slate-950 disabled:opacity-30 disabled:pointer-events-none"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      <ConfirmDialog
        open={showSubmitConfirm}
        title={liveAttempt.currentSectionNumber >= totalSections ? "Submit Final Section?" : "Submit This Section?"}
        message={
          liveAttempt.currentSectionNumber >= totalSections
            ? `You have answered ${answeredNumbers.length} out of ${questions.length} questions in this final section. Once submitted, your whole competition attempt is complete.`
            : `You have answered ${answeredNumbers.length} out of ${questions.length} questions in Section ${liveAttempt.currentSectionNumber}. Once submitted, you cannot return to this section.`
        }
        confirmLabel={submittingSection ? "Submitting..." : "Submit"}
        onCancel={() => setShowSubmitConfirm(false)}
        onConfirm={handleSubmitSection}
      />
    </AppShell>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex min-h-[96px] items-center gap-3 rounded-[24px]">
      <div className="math-student-icon-chip relative z-10 h-11 w-11 flex items-center justify-center rounded-2xl text-orange-700 dark:text-orange-300">
        {icon}
      </div>
      <div>
        <p className="relative z-10 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-300">{label}</p>
        <p className="relative z-10 mt-1 origin-left text-3xl font-black leading-none text-slate-950 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

// Phase G: local duplicates of the admin review screen's own
// QuestionReviewCard/AnswerBox/ScorecardTab (annual-result/[attemptId]/
// page.tsx) -- deliberately re-declared here rather than imported across
// the admin/student route trees, matching this codebase's own established
// per-page-helper-duplication convention (see e.g. FormatDateTime,
// triggerBlobDownload above).
function ReviewTabButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={active ? "math-role-tab math-role-tab-active" : "math-role-tab"}>
      {label}
    </button>
  );
}

function QuestionReviewCard({ question }: { question: AnnualCompetitionAttemptReviewQuestion }) {
  return (
    <article className="rounded-[28px] border border-[#2563eb]/15 bg-white/86 p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-black text-slate-950 dark:text-white">Question {question.questionNumber}</h3>
        <Chip tone={question.isUnanswered ? "slate" : question.isCorrect ? "green" : "red"}>
          {question.isUnanswered ? "Unanswered" : question.isCorrect ? "Correct" : "Wrong"}
        </Chip>
      </div>

      <div className="mt-5 rounded-[24px] bg-slate-50/90 p-5 dark:bg-slate-950/60">
        <MathQuestionDisplay
          operands={question.operands}
          operators={question.operators}
          displayType={question.displayType}
          questionText={question.questionText}
        />
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        <AnswerBox title="Your Answer" tone={question.isUnanswered ? "neutral" : question.isCorrect ? "correct" : "wrong"}>
          {question.studentAnswer ?? "Not Answered"}
        </AnswerBox>
        <AnswerBox title="Correct Answer" tone="correct">
          {question.correctAnswer ?? "Not Available"}
        </AnswerBox>
      </div>
    </article>
  );
}

function AnswerBox({ title, children, tone }: { title: string; children: React.ReactNode; tone: "correct" | "wrong" | "neutral" }) {
  const className =
    tone === "correct"
      ? "border-emerald-100 bg-emerald-50/80 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-100"
      : tone === "wrong"
        ? "border-cyan-100 bg-cyan-50/80 text-cyan-950 dark:border-cyan-800 dark:bg-cyan-950/25 dark:text-cyan-100"
        : "border-slate-200 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-100";
  return (
    <div className={`rounded-[22px] border p-4 ${className}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.14em] opacity-80">{title}</p>
      <p className="mt-2 text-lg font-black">{children}</p>
    </div>
  );
}

// Section-by-section marks table, derived from the exact same `sections`
// data the Answer Sheet tab above already renders -- never re-fetched or
// re-derived from a separate result payload, so this tab's totals can
// never drift from what the Answer Sheet visibly shows (mirrors the admin
// ScorecardTab's own reasoning verbatim).
function ScorecardTab({ review }: { review: AnnualCompetitionAttemptReview }) {
  const rows = (review.sections || []).map((sectionReview) => ({
    sectionNumber: sectionReview.sectionNumber,
    sectionTitle: sectionReview.sectionTitle || `Section ${sectionReview.sectionNumber}`,
    totalQuestions: sectionReview.questions.length,
    correctCount: sectionReview.questions.filter((questionReview) => questionReview.isCorrect).length,
  }));
  const totalQuestions = rows.reduce((sum, row) => sum + row.totalQuestions, 0);
  const totalMarksObtained = rows.reduce((sum, row) => sum + row.correctCount, 0);

  return (
    <div className="math-card p-5">
      <div className="mb-4">
        <p className="math-block-header"><ListChecks size={14} />Scorecard</p>
        <h3 className="text-lg font-black text-slate-950 dark:text-white">Section-wise Marks</h3>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[20px] border border-[#2563eb]/15 bg-[#2563eb]/5 p-4 text-sm font-bold text-slate-700 dark:border-cyan-300/25 dark:bg-cyan-400/10 dark:text-slate-300">
          No section data is available for this attempt yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                <th className="px-3 py-2.5 text-left text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Section</th>
                <th className="px-3 py-2.5 text-right text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Total Questions</th>
                <th className="px-3 py-2.5 text-right text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Correct Answers</th>
                <th className="px-3 py-2.5 text-right text-xs font-black uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">Marks Obtained</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.sectionNumber} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 font-bold text-slate-900 dark:text-slate-100">
                    Section {row.sectionNumber} -- {row.sectionTitle}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{row.totalQuestions}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-800 dark:text-slate-200">{row.correctCount}</td>
                  <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">{row.correctCount}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[#2563eb]/30 dark:border-cyan-300/30">
                <td className="px-3 py-3 text-xs font-black uppercase tracking-[0.14em] text-[#2563eb] dark:text-cyan-100">Total</td>
                <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">{totalQuestions}</td>
                <td className="px-3 py-3 text-right font-black text-slate-950 dark:text-white">{totalMarksObtained}</td>
                <td className="px-3 py-3 text-right text-lg font-black text-[#2563eb] dark:text-cyan-100">{totalMarksObtained}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <div className="mt-4 rounded-[22px] border border-[#2563eb]/25 bg-[#2563eb]/5 px-5 py-4 text-center dark:border-cyan-300/30 dark:bg-cyan-400/10">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2563eb] dark:text-cyan-100">Total Marks Obtained</p>
        <p className="mt-1 text-3xl font-black text-slate-950 dark:text-white">
          {totalMarksObtained}/{totalQuestions}
        </p>
      </div>
    </div>
  );
}

function TimerMetricCard({ remainingSeconds }: { remainingSeconds: number }) {
  return (
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl flex min-h-[96px] items-center justify-between gap-3">
      <div className="flex items-center gap-3 relative z-10">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-800 dark:text-slate-100">TIME LEFT</p>
          <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-300">Section timer</p>
        </div>
      </div>
      <div className="relative z-10 shrink-0">
        <TestTimer remainingSeconds={remainingSeconds} />
      </div>
    </div>
  );
}
