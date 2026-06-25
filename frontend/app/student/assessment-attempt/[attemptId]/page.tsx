"use client";

import { AppShell } from "@/components/common/AppShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { OptionButton } from "@/components/student/OptionButton";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { TestTimer } from "@/components/student/TestTimer";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useAttemptTimer } from "@/hooks/useAttemptTimer";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { autoSubmitAssessmentAttempt, resumeAssessmentAttempt, saveAssessmentAnswer, submitAssessmentAttempt } from "@/lib/api/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, Gauge, Layers3, Clock3 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

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
    onSuccess: () => Router.replace(`/student/assessment-result/${AttemptId}`),
  });

  const ManualSubmitMutation = useMutation({
    mutationFn: () => submitAssessmentAttempt(AttemptId),
    onSuccess: () => Router.replace(`/student/assessment-result/${AttemptId}`),
  });

  const HandleTimeUp = useCallback(() => {
    if (!Attempt || !Attempt.questions || Attempt.questions.length === 0) return;
    if (AutoSubmitMutation.isPending || ManualSubmitMutation.isPending) return;
    AutoSubmitMutation.mutate();
  }, [Attempt, AutoSubmitMutation, ManualSubmitMutation.isPending]);

  const RemainingSeconds = useAttemptTimer(Attempt ? Attempt.remainingSeconds : 999999, HandleTimeUp);
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
      if (Response?.resultAvailable) Router.replace(`/student/assessment-result/${AttemptId}`);
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

  return (
    <AppShell title="Assessment Attempt">
      <section className="math-slide-up rounded-[30px] border border-white/70 bg-gradient-to-br from-white/92 via-sky-50/78 to-cyan-100/58 p-4 shadow-xl backdrop-blur-2xl dark:border-slate-800 dark:from-slate-950/92 dark:via-slate-900/82 dark:to-cyan-950/36 sm:p-5">
        <div className="relative z-10 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="inline-flex rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200">
              Question {CurrentQuestion.questionNumber} Of {Questions.length}
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-[2.1rem]">
              {Attempt.title}
            </h1>
            <p className="mt-1.5 max-w-3xl text-sm font-semibold leading-5 text-slate-600 dark:text-slate-300">
              Answer with focus and move through each question using the navigator.
            </p>
          </div>
        </div>

        <div className="sticky top-[120px] z-[90] mt-4 grid gap-3 rounded-3xl bg-white/60 p-2 shadow-sm backdrop-blur-xl ring-1 ring-slate-200/50 dark:bg-slate-950/60 dark:ring-slate-800/50 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={<ClipboardCheck size={16} />} label="ANSWERED" value={AnsweredNumbers.length} />
          <StatCard icon={<Layers3 size={16} />} label="REMAINING" value={Questions.length - AnsweredNumbers.length} />
          <StatCard icon={<Gauge size={16} />} label="CURRENT" value={`Q${CurrentQuestion.questionNumber}`} />
          <TimerMetricCard remainingSeconds={RemainingSeconds} />
        </div>
      </section>

      <div className="mt-4 math-card overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="math-kicker">{SectionLabel}</p>
            <h2 className="mt-1.5 text-xl font-black text-slate-950 dark:text-white">Question {CurrentQuestion.questionNumber}</h2>
          </div>
          <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${SavingQuestionId === CurrentQuestion.questionId ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {SavingQuestionId === CurrentQuestion.questionId ? "Saving Answer..." : "Auto-Saved"}
          </div>
        </div>
        <div className="mt-4 grid gap-5 xl:grid-cols-[minmax(0,360px)_1fr] xl:items-stretch">
          <div className="flex h-full min-h-[300px] flex-col justify-center rounded-[24px] bg-slate-50/90 p-3 dark:bg-slate-900/70 sm:p-4">
            <MathQuestionDisplay operands={CurrentQuestion.operands} operators={CurrentQuestion.operators} displayType={(CurrentQuestion as any).displayType ?? (CurrentQuestion as any).display_type} questionText={(CurrentQuestion as any).questionText ?? (CurrentQuestion as any).question_text} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {CurrentQuestion.options.map((Option) => (
              <OptionButton
                key={Option.optionId}
                option={Option as any}
                selected={SelectedAnswers[CurrentQuestion.questionId] === Option.optionId}
                disabled={ManualSubmitMutation.isPending || AutoSubmitMutation.isPending || RemainingSeconds <= 0}
                onClick={() => HandleSelect(CurrentQuestion.questionId, Option.optionId)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 math-card p-4">
        <QuestionNavigator totalQuestions={Questions.length} currentQuestionNumber={CurrentQuestion.questionNumber} answeredQuestionNumbers={AnsweredNumbers} onSelectQuestion={(Number) => SetCurrentIndex(Number - 1)} />
        <div className="mt-4 flex flex-wrap justify-between gap-3">
          <button className="math-button-secondary" disabled={CurrentIndex === 0} onClick={() => SetCurrentIndex((Value) => Math.max(0, Value - 1))}>Previous</button>
          <button className="math-button-secondary" disabled={CurrentIndex >= Questions.length - 1} onClick={() => SetCurrentIndex((Value) => Math.min(Questions.length - 1, Value + 1))}>Next</button>
        </div>
        <button className="math-button-primary mt-4 w-full py-3" onClick={() => SetShowConfirm(true)} disabled={ManualSubmitMutation.isPending || AutoSubmitMutation.isPending}>Submit Assessment</button>
      </div>

      <ConfirmDialog open={ShowConfirm} title="Submit Assessment?" message={`You have answered ${AnsweredNumbers.length} out of ${Questions.length} questions. Unanswered questions will receive 0 marks.`} confirmLabel={ManualSubmitMutation.isPending ? "Submitting..." : "Submit"} onCancel={() => SetShowConfirm(false)} onConfirm={() => ManualSubmitMutation.mutate()} />
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
          <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Timer</p>
        </div>
      </div>
      <TestTimer remainingSeconds={remainingSeconds} className="shrink-0" />
    </div>
  );
}
