"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  generateDpsPreview,
  publishDps,
  getDpsByLesson,
  getLessons,
  getLevels,
  getModules,
} from "@/lib/api/admin";
import type {
  DpsItem,
  LessonItem,
  LevelItem,
  ModuleItem,
} from "@/types/curriculum";
import type { AdminPreviewQuestion } from "@/types/question";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

export default function AdminCurriculumPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();

  const [moduleId, setModuleId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [lessonId, setLessonId] = useState("");
  const [dpsId, setDpsId] = useState("");

  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState<
    AdminPreviewQuestion[]
  >([]);

  const modulesQuery = useQuery({
    queryKey: ["admin-curriculum-modules"],
    queryFn: getModules,
    enabled: ready,
  });

  const levelsQuery = useQuery({
    queryKey: ["admin-curriculum-levels", moduleId],
    queryFn: () => getLevels(moduleId),
    enabled: ready && Boolean(moduleId),
  });

  const lessonsQuery = useQuery({
    queryKey: ["admin-curriculum-lessons", levelId],
    queryFn: () => getLessons(levelId),
    enabled: ready && Boolean(levelId),
  });

  const dpsQuery = useQuery({
    queryKey: ["admin-curriculum-dps", lessonId],
    queryFn: () => getDpsByLesson(lessonId),
    enabled: ready && Boolean(lessonId),
  });

  const selectedModule = useMemo(
    () => modulesQuery.data?.find((item) => item.moduleId === moduleId),
    [modulesQuery.data, moduleId]
  );

  const selectedLevel = useMemo(
    () => levelsQuery.data?.find((item) => item.levelId === levelId),
    [levelsQuery.data, levelId]
  );

  const selectedLesson = useMemo(
    () => lessonsQuery.data?.find((item) => item.lessonId === lessonId),
    [lessonsQuery.data, lessonId]
  );

  const selectedDps = useMemo(
    () => dpsQuery.data?.find((item) => item.dpsId === dpsId),
    [dpsQuery.data, dpsId]
  );

  useEffect(() => {
    if (!modulesQuery.data?.length || moduleId) return;

    const ylm =
      modulesQuery.data.find((item) => item.moduleCode === "YLM") ||
      modulesQuery.data[0];

    setModuleId(ylm.moduleId);
  }, [modulesQuery.data, moduleId]);

  useEffect(() => {
    setLevelId("");
    setLessonId("");
    setDpsId("");
    setPreviewQuestions([]);
  }, [moduleId]);

  useEffect(() => {
    if (!levelsQuery.data?.length || levelId) return;
    setLevelId(levelsQuery.data[0].levelId);
  }, [levelsQuery.data, levelId]);

  useEffect(() => {
    setLessonId("");
    setDpsId("");
    setPreviewQuestions([]);
  }, [levelId]);

  useEffect(() => {
    if (!lessonsQuery.data?.length || lessonId) return;
    setLessonId(lessonsQuery.data[0].lessonId);
  }, [lessonsQuery.data, lessonId]);

  useEffect(() => {
    setDpsId("");
    setPreviewQuestions([]);
  }, [lessonId]);

  useEffect(() => {
    if (!dpsQuery.data?.length || dpsId) return;
    setDpsId(dpsQuery.data[0].dpsId);
  }, [dpsQuery.data, dpsId]);

  useEffect(() => {
    setPreviewQuestions([]);
  }, [dpsId]);

  const previewMutation = useMutation({
    mutationFn: () => generateDpsPreview(dpsId),
    onSuccess: (data) => {
      setPreviewQuestions(data.questions ?? []);
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishDps(dpsId),
    onSuccess: () => {
      QueryClient.invalidateQueries({ queryKey: ["admin-curriculum-dps", lessonId] });
    },
  });

  const isLoading =
    modulesQuery.isLoading ||
    levelsQuery.isLoading ||
    lessonsQuery.isLoading ||
    dpsQuery.isLoading;

  const error =
    modulesQuery.error ||
    levelsQuery.error ||
    lessonsQuery.error ||
    dpsQuery.error ||
    previewMutation.error ||
    publishMutation.error;

  const SelectedDpsStatus = selectedDps?.publicationStatus || "DRAFT";
  const IsSelectedDpsPublished = SelectedDpsStatus === "PUBLISHED";
  const canPreview = Boolean(dpsId) && !previewMutation.isPending;
  const canPublish =
    Boolean(dpsId) &&
    previewQuestions.length > 0 &&
    !IsSelectedDpsPublished &&
    !publishMutation.isPending;

  if (!ready) return null;

  return (
    <AppShell>
      <section className="math-hero">
        <p className="math-kicker">
          Admin Learning Path
        </p>

        <h1 className="math-title">
          Learning Path Studio
        </h1>

        <p className="math-subtitle">
          Review modules, levels, lessons, and DPS sheets before publishing practice content for teacher assignment.
        </p>
      </section>

      {isLoading ? (
        <div className="mt-6">
          <LoadingState label="Loading learning path..." />
        </div>
      ) : null}

      {error ? (
        <div className="mt-6">
          <ErrorState message={apiErrorMessage(error)} />
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <Panel title="Modules">
          {(modulesQuery.data ?? []).map((moduleItem: ModuleItem) => (
            <Item
              key={moduleItem.moduleId}
              active={moduleId === moduleItem.moduleId}
              onClick={() => setModuleId(moduleItem.moduleId)}
            >
              <span className="block">{moduleItem.moduleCode}</span>
              <span className="block text-xs font-normal opacity-80">
                {moduleItem.moduleName}
              </span>
            </Item>
          ))}
        </Panel>

        <Panel title="Levels">
          {(levelsQuery.data ?? []).map((level: LevelItem) => (
            <Item
              key={level.levelId}
              active={levelId === level.levelId}
              onClick={() => setLevelId(level.levelId)}
            >
              <span className="block">{level.levelCode}</span>
              <span className="block text-xs font-normal opacity-80">
                {level.levelName}
              </span>
            </Item>
          ))}
        </Panel>

        <Panel title="Lessons">
          {(lessonsQuery.data ?? []).map((lesson: LessonItem) => (
            <Item
              key={lesson.lessonId}
              active={lessonId === lesson.lessonId}
              onClick={() => setLessonId(lesson.lessonId)}
            >
              Lesson {lesson.lessonNumber}: {lesson.lessonTitle}
            </Item>
          ))}
        </Panel>

        <Panel title="DPS">
          {(dpsQuery.data ?? []).map((dps: DpsItem) => (
            <Item
              key={dps.dpsId}
              active={dpsId === dps.dpsId}
              onClick={() => setDpsId(dps.dpsId)}
            >
              <span className="block">DPS {dps.dpsNumber}: {dps.dpsTitle}</span>
              <span className="mt-1 block text-[0.65rem] font-black uppercase tracking-[0.16em] opacity-80">
                {(dps.publicationStatus || "DRAFT") === "PUBLISHED" ? "Published" : "Draft"}
              </span>
            </Item>
          ))}
        </Panel>
      </div>

      <div className="mt-6 math-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">
              Selected DPS
            </p>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h2 className="text-2xl font-black text-slate-900">
                {selectedDps
                  ? `DPS ${selectedDps.dpsNumber}: ${selectedDps.dpsTitle}`
                  : "No DPS selected"}
              </h2>
              {selectedDps ? <PublishStatusChip Status={SelectedDpsStatus} /> : null}
            </div>

            <div className="mt-3 space-y-1 text-sm text-slate-600">
              <p>
                <span className="font-semibold">Module:</span>{" "}
                {selectedModule
                  ? `${selectedModule.moduleCode} - ${selectedModule.moduleName}`
                  : "Not selected"}
              </p>

              <p>
                <span className="font-semibold">Level:</span>{" "}
                {selectedLevel
                  ? `${selectedLevel.levelCode} - ${selectedLevel.levelName}`
                  : "Not selected"}
              </p>

              <p>
                <span className="font-semibold">Lesson:</span>{" "}
                {selectedLesson
                  ? `Lesson ${selectedLesson.lessonNumber} - ${selectedLesson.lessonTitle}`
                  : "Not selected"}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
            <button
              className="math-role-action-button px-4"
              disabled={!canPreview}
              onClick={() => previewMutation.mutate()}
            >
              <RefreshCcw size={16} />
              {previewMutation.isPending ? "Generating..." : "Generate Preview"}
            </button>

            <button
              className="math-role-action-button px-4"
              disabled={previewQuestions.length === 0}
              onClick={() => setShowCorrectAnswers((value) => !value)}
            >
              {showCorrectAnswers ? <EyeOff size={16} /> : <Eye size={16} />}
              {showCorrectAnswers ? "Hide Answers" : "Show Answers"}
            </button>

            <button
              className="math-button-primary inline-flex items-center justify-center gap-2"
              disabled={!canPublish}
              title={
                IsSelectedDpsPublished
                  ? "This DPS is already published for teacher assignment."
                  : previewQuestions.length === 0
                    ? "Generate and review the preview before publishing."
                    : "Publish this DPS for teacher assignment."
              }
              onClick={() => publishMutation.mutate()}
            >
              <CheckCircle2 size={16} />
              {publishMutation.isPending
                ? "Publishing..."
                : IsSelectedDpsPublished
                  ? "Published"
                  : "Publish DPS"}
            </button>
          </div>
        </div>

        {publishMutation.isSuccess ? (
          <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-700">
            DPS published successfully. Teachers can now assign this sheet to eligible students.
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-black text-slate-900">
            Generated MCQ Preview
          </h2>

          <p className="text-sm text-slate-500">
            {previewQuestions.length} questions
          </p>
        </div>

        {previewQuestions.length === 0 ? (
          <div className="math-card p-6 text-center text-slate-500">
            Select a DPS and click Generate Preview to inspect questions before publishing.
          </div>
        ) : (
          <div className="grid gap-4">
            {previewQuestions.map((question, index) => (
              <PreviewQuestionCard
                key={`${question.seed || index}-${index}`}
                question={question}
                showCorrectAnswers={showCorrectAnswers}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PreviewQuestionCard({
  question,
  showCorrectAnswers,
}: {
  question: AdminPreviewQuestion;
  showCorrectAnswers: boolean;
}) {
  const options = [...(question.options ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  );

  return (
    <div className="math-card p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="lg:w-[260px] lg:shrink-0">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            Question {question.question_number}
          </p>

          <div className="mt-4 inline-block rounded-[24px] border border-slate-200/80 bg-slate-50/95 p-5 text-right font-mono text-3xl font-bold text-slate-900 shadow-sm dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-50">
            {question.operands?.map((operand, index) => (
              <div
                key={`${operand}-${index}`}
                className="grid grid-cols-[24px_1fr] gap-3"
              >
                <span>
                  {index === 0
                    ? ""
                    : operand < 0
                      ? "-"
                      : question.operators?.[index] || "+"}
                </span>
                <span>{Math.abs(Number(operand))}</span>
              </div>
            ))}

            <div className="mt-2 border-t-4 border-slate-800 pt-2 text-blue-700 dark:border-slate-200 dark:text-cyan-300">
              ?
            </div>
          </div>
        </div>

        <div className="grid flex-1 gap-3 sm:grid-cols-2">
          {options.map((option) => {
            const isCorrect = Boolean(option.is_correct);
            const optionStateClass = showCorrectAnswers && isCorrect
              ? "math-mcq-correct-option border-emerald-300 bg-emerald-50 text-emerald-900 shadow-[0_10px_24px_rgba(16,185,129,0.12)] dark:border-emerald-400/70 dark:bg-emerald-700/70 dark:text-emerald-50"
              : "border-slate-200 bg-white text-slate-800 shadow-sm hover:border-blue-300 hover:bg-blue-50/70 dark:border-slate-700/70 dark:bg-slate-800/88 dark:text-slate-100 dark:hover:border-cyan-400/50 dark:hover:bg-slate-700/88";

            const pillClass = showCorrectAnswers && isCorrect
              ? "math-mcq-option-pill bg-emerald-100 text-emerald-800 dark:bg-emerald-100/20 dark:text-emerald-50"
              : "bg-slate-100 text-slate-700 dark:bg-slate-700/80 dark:text-slate-100";

            return (
              <div
                key={`${option.label}-${option.value}`}
                className={`flex min-h-[72px] items-center gap-3 rounded-2xl border px-4 py-3.5 text-base font-semibold transition-all duration-200 ${optionStateClass}`}
              >
                <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-black ${pillClass}`}>
                  {option.label}
                </span>

                <span className="flex-1 leading-6">{option.value}</span>

                {showCorrectAnswers && isCorrect ? (
                  <span className="math-mcq-correct-pill rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:bg-emerald-100/20 dark:text-emerald-50">
                    Correct
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {showCorrectAnswers ? (
        <div className="math-correct-answer-strip mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-cyan-400/30 dark:bg-cyan-400/10 dark:text-cyan-100">
          Correct answer:{" "}
          <span className="font-black">{question.correct_answer}</span>
        </div>
      ) : null}
    </div>
  );
}

function PublishStatusChip({ Status }: { Status: string }) {
  const Published = Status === "PUBLISHED";
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.16em] ${
        Published
          ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100"
          : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100"
      }`}
    >
      {Published ? "Published" : "Draft"}
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="math-card p-4">
      <h2 className="mb-3 font-black text-slate-900">{title}</h2>
      <div className="max-h-[420px] space-y-2 overflow-auto pr-1">{children}</div>
    </div>
  );
}

function Item({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full rounded-xl p-3 text-left text-sm font-semibold transition ${
        active
          ? "bg-blue-600 text-white"
          : "bg-slate-50 text-slate-700 hover:bg-blue-50"
      }`}
    >
      {children}
    </button>
  );
}
