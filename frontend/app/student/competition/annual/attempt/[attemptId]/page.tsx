"use client";

import { AppShell } from "@/components/common/AppShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { OptionButton } from "@/components/student/OptionButton";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { TestTimer } from "@/components/student/TestTimer";
import { useAnnualCompetitionHeartbeat } from "@/hooks/useAnnualCompetitionHeartbeat";
import { useAttemptTimer } from "@/hooks/useAttemptTimer";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorDetail, apiErrorMessage } from "@/lib/api";
import {
  downloadAnnualCompetitionCertificate,
  getAnnualCompetitionAttempt,
  getAnnualCompetitionResult,
  saveAnnualCompetitionAnswer,
  startAnnualCompetitionAttempt,
  submitAnnualCompetitionSection,
  type AnnualCompetitionAttempt,
} from "@/lib/api/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Award, CheckCircle2, ClipboardCheck, Gauge, Layers3, ShieldAlert, Trophy } from "lucide-react";
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
  const bootstrapRequestedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!liveAttempt || liveAttempt.status !== "IN_PROGRESS") return;
    if (sessionToken || bootstrapRequestedRef.current === liveAttempt.attemptId) return;
    bootstrapRequestedRef.current = liveAttempt.attemptId;
    startAnnualCompetitionAttempt(liveAttempt.eventId)
      .then((data) => setSessionToken(data.sessionToken))
      .catch((error) => setBootstrapError(error));
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

  async function handleSelect(questionId: string, selectedOptionId: string) {
    if (!liveAttempt || !sessionToken || liveAttempt.status !== "IN_PROGRESS") return;
    const questions = liveAttempt.activeSectionQuestions || [];
    const selectedQuestionIndex = questions.findIndex((question) => question.questionId === questionId);
    setLocalAnswers((prev) => ({ ...prev, [questionId]: selectedOptionId }));
    if (selectedQuestionIndex >= 0 && selectedQuestionIndex < questions.length - 1) {
      setCurrentIndex(selectedQuestionIndex + 1);
    }
    setSavingQuestionId(questionId);
    setSaveError(null);
    try {
      const updated = await saveAnnualCompetitionAnswer(attemptId, {
        sessionToken,
        sectionNumber: liveAttempt.currentSectionNumber,
        questionId,
        selectedOptionId,
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

  async function handleSubmitSection() {
    if (!liveAttempt || !sessionToken) return;
    setSubmittingSection(true);
    try {
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
          <h1 className="text-2xl font-black text-slate-950 dark:text-white">Competition Submitted</h1>
          {result ? (
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
          ) : (
            <p className="math-subtitle max-w-none">
              Your competition attempt has been submitted. Results are released separately once available.
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

  const questions = liveAttempt.activeSectionQuestions || [];
  const currentQuestion = questions[currentIndex];

  if (!sessionToken || !currentQuestion) {
    return (
      <AppShell title="Annual Competition">
        <LoadingState label={`Preparing Section ${liveAttempt.currentSectionNumber}...`} />
      </AppShell>
    );
  }

  const selectedAnswers: Record<string, string> = {};
  questions.forEach((question) => {
    if (question.savedOptionId) selectedAnswers[question.questionId] = question.savedOptionId;
  });
  Object.assign(selectedAnswers, localAnswers);
  const answeredNumbers = questions.filter((question) => selectedAnswers[question.questionId]).map((question) => question.questionNumber);
  const totalSections = liveAttempt.sections.length;

  return (
    <AppShell title="Annual Competition">
      <section className="math-slide-up math-card flex min-w-0 flex-col gap-4 p-4 sm:p-5 xl:min-h-[calc(100svh-11rem)]">
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
            </div>
            <h1 className="mt-2 max-w-5xl text-3xl font-black leading-tight tracking-tight text-slate-950 dark:text-white sm:text-4xl">
              Annual Competition
            </h1>
            <p className="math-subtitle !mt-3 max-w-3xl">
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

        <div className="grid flex-1 gap-4 xl:items-stretch xl:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)]">
          <div className="math-card flex flex-col min-h-[450px] sm:min-h-[500px] border border-slate-200/80 bg-slate-50/75 p-4 shadow-none dark:border-slate-800 dark:bg-slate-900/55">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div>
                <div className="math-block-header !mb-0"><Layers3 size={14} /> Section {liveAttempt.currentSectionNumber}</div>
                <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Question {currentQuestion.questionNumber}</h2>
              </div>
              <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${savingQuestionId === currentQuestion.questionId ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
                {savingQuestionId === currentQuestion.questionId ? "Saving..." : "Auto-saved"}
              </div>
            </div>
            <div className="flex flex-1 items-center justify-center px-2 py-4 xl:min-h-0">
              <div className="flex w-full h-full min-h-[300px] items-center justify-center rounded-[28px] bg-white/92 p-4 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/80 dark:ring-slate-700">
                <MathQuestionDisplay
                  operands={currentQuestion.operands}
                  operators={currentQuestion.operators}
                  displayType={currentQuestion.displayType}
                  questionText={currentQuestion.questionText}
                />
              </div>
            </div>
          </div>

          <div className="math-card flex flex-col min-h-[450px] sm:min-h-[500px] border border-slate-200/80 bg-white/88 p-4 shadow-none dark:border-slate-800 dark:bg-slate-950/60">
            <div className="shrink-0 border-b border-slate-200/80 pb-3 dark:border-slate-800">
              <div className="math-block-header mb-2"><CheckCircle2 size={14} /> Select Answer</div>
              <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Choose the correct option</h2>
            </div>
            <div className="grid flex-1 gap-3 overflow-y-auto content-center py-4 sm:grid-cols-2 xl:min-h-0">
              {currentQuestion.options.map((option) => (
                <OptionButton
                  key={option.optionId}
                  option={option}
                  selected={selectedAnswers[currentQuestion.questionId] === option.optionId}
                  disabled={Boolean(savingQuestionId) || remainingSeconds <= 0}
                  onClick={() => handleSelect(currentQuestion.questionId, option.optionId)}
                />
              ))}
            </div>
          </div>
        </div>

        {saveError ? <ErrorState message={apiErrorMessage(saveError)} /> : null}

        <div className="rounded-[24px] border border-slate-200 bg-white/92 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/85">
          <QuestionNavigator
            totalQuestions={questions.length}
            currentQuestionNumber={currentQuestion.questionNumber}
            answeredQuestionNumbers={answeredNumbers}
            onSelectQuestion={(number) => setCurrentIndex(number - 1)}
          />

          <div className="mt-4 flex justify-center">
            <button
              className="math-button-primary w-full max-w-md py-3 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => setShowSubmitConfirm(true)}
              disabled={submittingSection}
            >
              {liveAttempt.currentSectionNumber >= totalSections ? "Submit Final Section" : "Submit Section & Continue"}
            </button>
          </div>
        </div>
      </section>

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
