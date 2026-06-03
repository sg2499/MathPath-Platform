"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function AdminCurriculumPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();
  const Router = useRouter();
  const SearchParams = useSearchParams();

  const [moduleId, setModuleId] = useState(
    () => SearchParams.get("moduleId") ?? "",
  );
  const [levelId, setLevelId] = useState(
    () => SearchParams.get("levelId") ?? "",
  );
  const [lessonId, setLessonId] = useState(
    () => SearchParams.get("lessonId") ?? "",
  );
  const [dpsId, setDpsId] = useState(() => SearchParams.get("dpsId") ?? "");

  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState<
    AdminPreviewQuestion[]
  >([]);

  const UpdateSelectionUrl = useCallback(
    (NextSelection: {
      moduleId?: string | null;
      levelId?: string | null;
      lessonId?: string | null;
      dpsId?: string | null;
    }) => {
      const Params = new URLSearchParams(
        typeof window === "undefined"
          ? SearchParams.toString()
          : window.location.search,
      );

      Object.entries(NextSelection).forEach(([Key, Value]) => {
        if (Value) {
          Params.set(Key, Value);
        } else {
          Params.delete(Key);
        }
      });

      const QueryString = Params.toString();
      Router.replace(
        QueryString ? `?${QueryString}` : window.location.pathname,
        {
          scroll: false,
        },
      );
    },
    [Router, SearchParams],
  );

  const ClearPreviewState = useCallback(() => {
    setPreviewQuestions([]);
    setShowCorrectAnswers(false);
  }, []);

  const handleModuleSelect = useCallback(
    (NextModuleId: string) => {
      if (NextModuleId === moduleId) return;

      setModuleId(NextModuleId);
      setLevelId("");
      setLessonId("");
      setDpsId("");
      ClearPreviewState();
      UpdateSelectionUrl({
        moduleId: NextModuleId,
        levelId: null,
        lessonId: null,
        dpsId: null,
      });
    },
    [ClearPreviewState, UpdateSelectionUrl, moduleId],
  );

  const handleLevelSelect = useCallback(
    (NextLevelId: string) => {
      if (NextLevelId === levelId) return;

      setLevelId(NextLevelId);
      setLessonId("");
      setDpsId("");
      ClearPreviewState();
      UpdateSelectionUrl({
        levelId: NextLevelId,
        lessonId: null,
        dpsId: null,
      });
    },
    [ClearPreviewState, UpdateSelectionUrl, levelId],
  );

  const handleLessonSelect = useCallback(
    (NextLessonId: string) => {
      if (NextLessonId === lessonId) return;

      setLessonId(NextLessonId);
      setDpsId("");
      ClearPreviewState();
      UpdateSelectionUrl({ lessonId: NextLessonId, dpsId: null });
    },
    [ClearPreviewState, UpdateSelectionUrl, lessonId],
  );

  const handleDpsSelect = useCallback(
    (NextDpsId: string) => {
      if (NextDpsId === dpsId) return;

      setDpsId(NextDpsId);
      ClearPreviewState();
      UpdateSelectionUrl({ dpsId: NextDpsId });
    },
    [ClearPreviewState, UpdateSelectionUrl, dpsId],
  );

  const modulesQuery = useQuery({
    queryKey: ["admin-curriculum-modules"],
    queryFn: getModules,
    enabled: ready,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const levelsQuery = useQuery({
    queryKey: ["admin-curriculum-levels", moduleId],
    queryFn: () => getLevels(moduleId),
    enabled: ready && Boolean(moduleId),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const lessonsQuery = useQuery({
    queryKey: ["admin-curriculum-lessons", levelId],
    queryFn: () => getLessons(levelId),
    enabled: ready && Boolean(levelId),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const dpsQuery = useQuery({
    queryKey: ["admin-curriculum-dps", lessonId],
    queryFn: () => getDpsByLesson(lessonId),
    enabled: ready && Boolean(lessonId),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const selectedModule = useMemo(
    () => modulesQuery.data?.find((item) => item.moduleId === moduleId),
    [modulesQuery.data, moduleId],
  );

  const selectedLevel = useMemo(
    () => levelsQuery.data?.find((item) => item.levelId === levelId),
    [levelsQuery.data, levelId],
  );

  const selectedLesson = useMemo(
    () => lessonsQuery.data?.find((item) => item.lessonId === lessonId),
    [lessonsQuery.data, lessonId],
  );

  const selectedDps = useMemo(
    () => dpsQuery.data?.find((item) => item.dpsId === dpsId),
    [dpsQuery.data, dpsId],
  );

  useEffect(() => {
    if (!modulesQuery.data?.length) return;

    const HasSelectedModule = modulesQuery.data.some(
      (item) => item.moduleId === moduleId,
    );

    if (moduleId && HasSelectedModule) return;

    const DefaultModule =
      modulesQuery.data.find((item) => item.moduleCode === "YLM") ||
      modulesQuery.data[0];

    setModuleId(DefaultModule.moduleId);
    UpdateSelectionUrl({ moduleId: DefaultModule.moduleId });
  }, [UpdateSelectionUrl, modulesQuery.data, moduleId]);

  useEffect(() => {
    if (!modulesQuery.data?.length) return;

    modulesQuery.data.forEach((Module) => {
      if (Module.moduleId === moduleId) return;

      QueryClient.prefetchQuery({
        queryKey: ["admin-curriculum-levels", Module.moduleId],
        queryFn: () => getLevels(Module.moduleId),
        staleTime: 10 * 60 * 1000,
      });
    });
  }, [QueryClient, modulesQuery.data, moduleId]);

  useEffect(() => {
    if (!levelsQuery.data?.length) return;

    const HasSelectedLevel = levelsQuery.data.some(
      (item) => item.levelId === levelId,
    );

    if (levelId && HasSelectedLevel) return;

    const DefaultLevel = levelsQuery.data[0];
    setLevelId(DefaultLevel.levelId);
    UpdateSelectionUrl({ levelId: DefaultLevel.levelId });
  }, [UpdateSelectionUrl, levelsQuery.data, levelId]);

  useEffect(() => {
    if (!levelsQuery.data?.length) return;

    levelsQuery.data.forEach((Level) => {
      if (Level.levelId === levelId) return;

      QueryClient.prefetchQuery({
        queryKey: ["admin-curriculum-lessons", Level.levelId],
        queryFn: () => getLessons(Level.levelId),
        staleTime: 10 * 60 * 1000,
      });
    });
  }, [QueryClient, levelsQuery.data, levelId]);

  useEffect(() => {
    if (!lessonsQuery.data?.length) return;

    const HasSelectedLesson = lessonsQuery.data.some(
      (item) => item.lessonId === lessonId,
    );

    if (lessonId && HasSelectedLesson) return;

    const DefaultLesson = lessonsQuery.data[0];
    setLessonId(DefaultLesson.lessonId);
    UpdateSelectionUrl({ lessonId: DefaultLesson.lessonId });
  }, [UpdateSelectionUrl, lessonsQuery.data, lessonId]);

  useEffect(() => {
    if (!lessonsQuery.data?.length) return;

    lessonsQuery.data.forEach((Lesson) => {
      if (Lesson.lessonId === lessonId) return;

      QueryClient.prefetchQuery({
        queryKey: ["admin-curriculum-dps", Lesson.lessonId],
        queryFn: () => getDpsByLesson(Lesson.lessonId),
        staleTime: 10 * 60 * 1000,
      });
    });
  }, [QueryClient, lessonsQuery.data, lessonId]);

  useEffect(() => {
    if (!dpsQuery.data?.length) return;

    const HasSelectedDps = dpsQuery.data.some((item) => item.dpsId === dpsId);

    if (dpsId && HasSelectedDps) return;

    const DefaultDps = dpsQuery.data[0];
    setDpsId(DefaultDps.dpsId);
    UpdateSelectionUrl({ dpsId: DefaultDps.dpsId });
  }, [UpdateSelectionUrl, dpsQuery.data, dpsId]);

  const previewMutation = useMutation({
    mutationFn: () => generateDpsPreview(dpsId),
    onSuccess: (data) => {
      setPreviewQuestions(data.questions ?? []);
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishDps(dpsId),
    onSuccess: () => {
      QueryClient.invalidateQueries({
        queryKey: ["admin-curriculum-dps", lessonId],
      });
    },
  });

  const isLoading =
    modulesQuery.isLoading ||
    (levelsQuery.isLoading && !levelsQuery.data) ||
    (lessonsQuery.isLoading && !lessonsQuery.data) ||
    (dpsQuery.isLoading && !dpsQuery.data);

  const IsHierarchyFetching =
    modulesQuery.isFetching ||
    levelsQuery.isFetching ||
    lessonsQuery.isFetching ||
    dpsQuery.isFetching;

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
    Boolean(dpsId) && previewQuestions.length > 0 && !publishMutation.isPending;

  const previewSections = useMemo(() => {
    const Groups: Array<{
      key: string;
      title: string;
      questions: AdminPreviewQuestion[];
    }> = [];
    const SectionIndex = new Map<string, number>();

    previewQuestions.forEach((Question) => {
      const Metadata = (Question as any).metadata || {};
      const SectionNumber = String(
        Metadata.section_number || Metadata.sectionNumber || 1,
      );
      const SectionTitle = String(
        Metadata.section_title ||
          Metadata.sectionTitle ||
          selectedDps?.dpsTitle ||
          "Questions",
      );
      const Key = `${SectionNumber}-${SectionTitle}`;
      if (!SectionIndex.has(Key)) {
        SectionIndex.set(Key, Groups.length);
        Groups.push({ key: Key, title: SectionTitle, questions: [] });
      }
      Groups[SectionIndex.get(Key)!].questions.push(Question);
    });

    return Groups;
  }, [previewQuestions, selectedDps?.dpsTitle]);

  if (!ready) return null;

  return (
    <AppShell>
      <section className="math-hero">
        <p className="math-kicker">Admin Learning Path</p>

        <h1 className="math-title">Learning Path Studio</h1>

        <p className="math-subtitle">
          Review modules, levels, lessons, and DPS sheets before publishing
          practice content for teacher assignment.
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

      {IsHierarchyFetching && !isLoading ? (
        <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/80 px-4 py-3 text-sm font-semibold text-blue-700 dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-100">
          Syncing latest learning path data in the background...
        </div>
      ) : null}

      <div className="mt-6 grid gap-4 lg:grid-cols-4">
        <Panel title="Modules">
          {(modulesQuery.data ?? []).map((moduleItem: ModuleItem) => (
            <Item
              key={moduleItem.moduleId}
              active={moduleId === moduleItem.moduleId}
              onClick={() => handleModuleSelect(moduleItem.moduleId)}
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
              onClick={() => handleLevelSelect(level.levelId)}
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
              onClick={() => handleLessonSelect(lesson.lessonId)}
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
              onClick={() => handleDpsSelect(dps.dpsId)}
            >
              <span className="block">
                DPS {dps.dpsNumber}: {dps.dpsTitle}
              </span>
              <span className="mt-1 block text-[0.65rem] font-black uppercase tracking-[0.16em] opacity-80">
                {(dps.publicationStatus || "DRAFT") === "PUBLISHED"
                  ? "Published"
                  : "Draft"}
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
              {selectedDps ? (
                <PublishStatusChip Status={SelectedDpsStatus} />
              ) : null}
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
                previewQuestions.length === 0
                  ? "Generate and review a fresh preview before publishing."
                  : IsSelectedDpsPublished
                    ? "Republish this DPS with the newly generated question set."
                    : "Publish this DPS for teacher assignment."
              }
              onClick={() => publishMutation.mutate()}
            >
              <CheckCircle2 size={16} />
              {publishMutation.isPending
                ? "Publishing..."
                : IsSelectedDpsPublished
                  ? "Republish DPS"
                  : "Publish DPS"}
            </button>
          </div>
        </div>

        {publishMutation.isSuccess ? (
          <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-700">
            DPS published successfully. Teachers will receive the latest
            approved question set for this sheet.
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
            Select a DPS and click Generate Preview to inspect questions before
            publishing.
          </div>
        ) : (
          <div className="grid gap-6">
            {previewSections.map((Section, SectionIndex) => (
              <div key={Section.key} className="grid gap-4">
                {previewSections.length > 1 ? (
                  <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-5 py-4 text-slate-900 shadow-sm dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-50">
                    <p className="text-xs font-black uppercase tracking-[0.18em] text-blue-600 dark:text-cyan-200">
                      Section {SectionIndex + 1}
                    </p>
                    <h3 className="mt-1 text-xl font-black">{Section.title}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-cyan-100/80">
                      {Section.questions.length} questions
                    </p>
                  </div>
                ) : null}

                {Section.questions.map((question, index) => (
                  <PreviewQuestionCard
                    key={`${question.seed || Section.key}-${index}`}
                    question={question}
                    showCorrectAnswers={showCorrectAnswers}
                  />
                ))}
              </div>
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
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0),
  );

  return (
    <div className="math-card p-4 sm:p-5">
      <p className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
        Question{" "}
        {(question as any).metadata?.section_question_number ??
          (question as any).metadata?.sectionQuestionNumber ??
          question.question_number}
      </p>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-center">
        <div className="flex min-w-0 items-center justify-center rounded-[22px] border border-slate-100 bg-slate-50/60 px-4 py-4 dark:border-slate-700/70 dark:bg-slate-900/55">
          <MathQuestionDisplay
            operands={question.operands as Array<number | string>}
            operators={question.operators ?? []}
            displayType={
              (question as any).displayType ?? (question as any).display_type
            }
            questionText={
              (question as any).questionText ?? (question as any).question_text
            }
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:self-center">
          {options.map((option) => {
            const isCorrect = Boolean(option.is_correct);
            const optionStateClass =
              showCorrectAnswers && isCorrect
                ? "math-mcq-correct-option border-emerald-300 bg-emerald-50 text-emerald-900 shadow-[0_10px_24px_rgba(16,185,129,0.12)] dark:border-emerald-400/70 dark:bg-emerald-700/70 dark:text-emerald-50"
                : "border-slate-200 bg-white text-slate-800 shadow-sm hover:border-blue-300 hover:bg-blue-50/70 dark:border-slate-700/70 dark:bg-slate-800/88 dark:text-slate-100 dark:hover:border-cyan-400/50 dark:hover:bg-slate-700/88";

            const pillClass =
              showCorrectAnswers && isCorrect
                ? "math-mcq-option-pill bg-emerald-100 text-emerald-800 dark:bg-emerald-100/20 dark:text-emerald-50"
                : "bg-slate-100 text-slate-700 dark:bg-slate-700/80 dark:text-slate-100";

            return (
              <div
                key={`${option.label}-${option.value}`}
                className={`flex min-h-[70px] items-center gap-3 rounded-2xl border px-4 py-3.5 text-base font-semibold transition-all duration-200 ${optionStateClass}`}
              >
                <span
                  className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-black ${pillClass}`}
                >
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
      <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
        {children}
      </div>
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
