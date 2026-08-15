"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  generateDpsPreview,
  generateDpsPreviewForLesson,
  publishDps,
  publishAllDpsForLesson,
  getDpsByLesson,
  getLessons,
  getLevels,
  getModules,
} from "@/lib/api/admin";
import type {
  LessonBulkPreviewResult,
  LessonBulkSkippedSheet,
} from "@/lib/api/admin";
import type {
  DpsItem,
  LessonItem,
  LevelItem,
  ModuleItem,
} from "@/types/curriculum";
import type { AdminPreviewQuestion } from "@/types/question";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ChevronDown, ChevronUp, Compass, Eye, EyeOff, Filter, Hash, Layers, RefreshCcw, X } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AdminCurriculumPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading Learning Path Studio..." />}>
      <AdminCurriculumPageContent />
    </Suspense>
  );
}

function AdminCurriculumPageContent() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();
  const SearchParams = useSearchParams();

  const GetInitialSelection = useCallback(
    (Key: "moduleId" | "levelId" | "lessonId" | "dpsId") => {
      const UrlValue = SearchParams.get(Key);
      if (UrlValue) return UrlValue;

      if (typeof window === "undefined") return "";

      try {
        const StoredSelection = window.localStorage.getItem(
          "mathpath-admin-curriculum-selection",
        );
        if (!StoredSelection) return "";

        const ParsedSelection = JSON.parse(StoredSelection) as Partial<
          Record<"moduleId" | "levelId" | "lessonId" | "dpsId", string>
        >;

        return ParsedSelection[Key] || "";
      } catch {
        return "";
      }
    },
    [SearchParams],
  );

  const [moduleId, setModuleId] = useState(() =>
    GetInitialSelection("moduleId"),
  );
  const [levelId, setLevelId] = useState(() => GetInitialSelection("levelId"));
  const [lessonId, setLessonId] = useState(() =>
    GetInitialSelection("lessonId"),
  );
  const [dpsId, setDpsId] = useState(() => GetInitialSelection("dpsId"));

  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false);
  const [previewQuestions, setPreviewQuestions] = useState<
    AdminPreviewQuestion[]
  >([]);

  const PersistSelection = useCallback(
    (NextSelection: {
      moduleId?: string | null;
      levelId?: string | null;
      lessonId?: string | null;
      dpsId?: string | null;
    }) => {
      if (typeof window === "undefined") return;

      const CurrentSelection = {
        moduleId,
        levelId,
        lessonId,
        dpsId,
      };

      const MergedSelection = {
        ...CurrentSelection,
        ...NextSelection,
      };

      const Params = new URLSearchParams(window.location.search);

      Object.entries(MergedSelection).forEach(([Key, Value]) => {
        if (Value) {
          Params.set(Key, Value);
        } else {
          Params.delete(Key);
        }
      });

      const QueryString = Params.toString();
      const NextUrl = QueryString
        ? `${window.location.pathname}?${QueryString}`
        : window.location.pathname;

      window.history.replaceState(null, "", NextUrl);

      try {
        window.localStorage.setItem(
          "mathpath-admin-curriculum-selection",
          JSON.stringify(MergedSelection),
        );
      } catch {
        // URL persistence still keeps refresh behavior intact when storage is blocked.
      }
    },
    [dpsId, lessonId, levelId, moduleId],
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
      PersistSelection({
        moduleId: NextModuleId,
        levelId: null,
        lessonId: null,
        dpsId: null,
      });
    },
    [ClearPreviewState, PersistSelection, moduleId],
  );

  const handleLevelSelect = useCallback(
    (NextLevelId: string) => {
      if (NextLevelId === levelId) return;

      setLevelId(NextLevelId);
      setLessonId("");
      setDpsId("");
      ClearPreviewState();
      PersistSelection({
        levelId: NextLevelId,
        lessonId: null,
        dpsId: null,
      });
    },
    [ClearPreviewState, PersistSelection, levelId],
  );

  const handleLessonSelect = useCallback(
    (NextLessonId: string) => {
      if (NextLessonId === lessonId) return;

      setLessonId(NextLessonId);
      setDpsId("");
      ClearPreviewState();
      PersistSelection({ lessonId: NextLessonId, dpsId: null });
    },
    [ClearPreviewState, PersistSelection, lessonId],
  );

  const handleDpsSelect = useCallback(
    (NextDpsId: string) => {
      if (NextDpsId === dpsId) return;

      setDpsId(NextDpsId);
      ClearPreviewState();
      PersistSelection({ dpsId: NextDpsId });
    },
    [ClearPreviewState, PersistSelection, dpsId],
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
    PersistSelection({ moduleId: DefaultModule.moduleId });
  }, [PersistSelection, modulesQuery.data, moduleId]);

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
    PersistSelection({ levelId: DefaultLevel.levelId });
  }, [PersistSelection, levelsQuery.data, levelId]);

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
    PersistSelection({ lessonId: DefaultLesson.lessonId });
  }, [PersistSelection, lessonsQuery.data, lessonId]);

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
    PersistSelection({ dpsId: DefaultDps.dpsId });
  }, [PersistSelection, dpsQuery.data, dpsId]);

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

  // "Publish All Sheets" -- generates a fresh preview for every unpublished
  // DPS in the selected lesson (or every DPS if includePublishedInBulk is
  // on), holds them here for a combined review, then one confirm publishes
  // exactly the sheets that were reviewed.
  const [includePublishedInBulk, setIncludePublishedInBulk] = useState(false);
  const [bulkReview, setBulkReview] = useState<{
    results: LessonBulkPreviewResult[];
    skipped: LessonBulkSkippedSheet[];
  } | null>(null);
  const [expandedBulkSheetId, setExpandedBulkSheetId] = useState<string | null>(null);
  const [bulkShowAnswers, setBulkShowAnswers] = useState(false);

  const bulkPreviewMutation = useMutation({
    mutationFn: () => generateDpsPreviewForLesson(lessonId, includePublishedInBulk),
    onSuccess: (data) => {
      setBulkReview({ results: data.results, skipped: data.skipped });
      setExpandedBulkSheetId(data.results[0]?.dpsId ?? null);
      setBulkShowAnswers(false);
    },
  });

  const bulkPublishMutation = useMutation({
    mutationFn: () =>
      publishAllDpsForLesson(
        lessonId,
        (bulkReview?.results ?? []).map((result) => result.dpsId),
      ),
    onSuccess: () => {
      setBulkReview(null);
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
    publishMutation.error ||
    bulkPreviewMutation.error ||
    bulkPublishMutation.error;

  const lessonDpsRows = dpsQuery.data ?? [];
  const publishedLessonDpsCount = lessonDpsRows.filter(
    (item) => (item.publicationStatus || "DRAFT") === "PUBLISHED",
  ).length;
  const canPublishAllSheets =
    Boolean(lessonId) &&
    lessonDpsRows.length > 0 &&
    (includePublishedInBulk
      ? lessonDpsRows.length > 0
      : publishedLessonDpsCount < lessonDpsRows.length) &&
    !bulkPreviewMutation.isPending;

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
        <p className="math-block-header"><Compass size={14} />Admin Learning Path</p>

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

      {lessonId ? (
        <div className="mt-6 math-card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="math-block-header text-blue-600">
                <Layers size={14} />Selected Lesson
              </p>

              <h2 className="mt-1 text-2xl font-black text-slate-900">
                {selectedLesson
                  ? `Lesson ${selectedLesson.lessonNumber}: ${selectedLesson.lessonTitle}`
                  : "No lesson selected"}
              </h2>

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
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {lessonDpsRows.map((dps: DpsItem) => (
                  <span
                    key={dps.dpsId}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700"
                  >
                    DPS {dps.dpsNumber}
                    <PublishStatusChip Status={dps.publicationStatus || "DRAFT"} />
                  </span>
                ))}
              </div>

              <p className="mt-3 text-xs font-semibold text-slate-500">
                {publishedLessonDpsCount} of {lessonDpsRows.length} sheet(s) published in this lesson.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row lg:flex-col">
              <label className="flex items-center gap-2 whitespace-nowrap text-xs font-bold text-slate-600">
                <input
                  type="checkbox"
                  checked={includePublishedInBulk}
                  onChange={(event) => setIncludePublishedInBulk(event.target.checked)}
                />
                Include already-published (republish)
              </label>

              <button
                className="math-button-primary inline-flex items-center justify-center gap-2 whitespace-nowrap px-4"
                disabled={!canPublishAllSheets}
                title={
                  lessonDpsRows.length === 0
                    ? "This lesson has no DPS sheets yet."
                    : !includePublishedInBulk && publishedLessonDpsCount >= lessonDpsRows.length
                      ? "Every sheet in this lesson is already published. Check \"Include already-published\" to republish them."
                      : "Generate fresh previews for this lesson's sheets, then review before publishing all at once."
                }
                onClick={() => bulkPreviewMutation.mutate()}
              >
                <Layers size={16} />
                {bulkPreviewMutation.isPending ? "Preparing Review..." : "Publish All Sheets"}
              </button>
            </div>
          </div>

          {bulkReview ? (
            <div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-5 dark:border-cyan-400/20 dark:bg-cyan-400/10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="math-block-header text-blue-600 dark:text-cyan-200">
                    <CheckCircle2 size={14} />Review Before Publishing
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-cyan-100/80">
                    {bulkReview.results.length} sheet(s) ready to publish
                    {bulkReview.skipped.length ? `, ${bulkReview.skipped.length} skipped` : ""}.
                  </p>
                </div>
                <button
                  className="math-role-action-button whitespace-nowrap px-3"
                  onClick={() => setBulkShowAnswers((value) => !value)}
                  disabled={!bulkReview.results.length}
                >
                  {bulkShowAnswers ? <EyeOff size={16} /> : <Eye size={16} />}
                  {bulkShowAnswers ? "Hide Answers" : "Show Answers"}
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                {bulkReview.results.map((result) => {
                  const IsExpanded = expandedBulkSheetId === result.dpsId;
                  return (
                    <div key={result.dpsId} className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 p-4 text-left"
                        onClick={() => setExpandedBulkSheetId(IsExpanded ? null : result.dpsId)}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="shrink-0 font-black text-slate-900 dark:text-white">
                            DPS {result.dpsNumber}
                          </span>
                          <span className="truncate text-sm font-semibold text-slate-600 dark:text-slate-300">
                            {result.dpsTitle}
                          </span>
                          {result.wasAlreadyPublished ? (
                            <span className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[0.6rem] font-black uppercase tracking-[0.14em] text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                              Republish
                            </span>
                          ) : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-slate-500">
                          {result.questions.length} questions
                          {IsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      </button>

                      {IsExpanded ? (
                        <div className="grid gap-4 border-t border-slate-100 p-4 dark:border-slate-800">
                          {result.questions.map((question, index) => (
                            <PreviewQuestionCard
                              key={`${result.dpsId}-${question.seed || index}`}
                              question={question}
                              showCorrectAnswers={bulkShowAnswers}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {bulkReview.skipped.length ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
                  Skipped: {bulkReview.skipped.map((item) => `DPS ${item.dpsNumber}`).join(", ")}
                  {" "}
                  (already published -- check &quot;Include already-published&quot; to republish them too).
                </div>
              ) : null}

              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  className="math-button-secondary whitespace-nowrap"
                  onClick={() => setBulkReview(null)}
                  disabled={bulkPublishMutation.isPending}
                >
                  <X size={16} />
                  Cancel
                </button>
                <button
                  type="button"
                  className="math-button-primary whitespace-nowrap"
                  onClick={() => bulkPublishMutation.mutate()}
                  disabled={bulkPublishMutation.isPending || !bulkReview.results.length}
                >
                  <CheckCircle2 size={16} />
                  {bulkPublishMutation.isPending
                    ? "Publishing..."
                    : `Confirm & Publish ${bulkReview.results.length} Sheet(s)`}
                </button>
              </div>
            </div>
          ) : null}

          {bulkPublishMutation.isSuccess && !bulkReview ? (
            <div className="mt-4 rounded-2xl bg-green-50 p-4 text-sm font-semibold text-green-700">
              {bulkPublishMutation.data?.message}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 math-card p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="math-block-header text-blue-600">
              <Filter size={14} />Selected DPS
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
            Generated Question Preview
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
                <div className="rounded-2xl border border-blue-100 bg-blue-50/80 px-5 py-4 text-slate-900 shadow-sm dark:border-cyan-400/20 dark:bg-cyan-400/10 dark:text-cyan-50">
                  {previewSections.length > 1 && (
                    <p className="math-block-header text-blue-600 dark:text-cyan-200">
                      <Hash size={14} />Section {SectionIndex + 1}
                    </p>
                  )}
                  <h3 className="mt-1 text-xl font-black">{Section.title}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-600 dark:text-cyan-100/80">
                    {Section.questions.length} questions
                  </p>
                </div>

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
  // DPS questions are typed free-text answers now, not MCQ picks -- see
  // OPEN_ISSUES.md 2026-08-03e. The Learning Path Studio preview used to
  // always render the generator's MCQ options here regardless of the
  // "Show Answers" toggle -- that's stale; students never see options
  // anymore, so this preview shouldn't either. It now mirrors exactly
  // what a student sees (an answer box) and only reveals the correct
  // value when showCorrectAnswers is on.
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

        <div className="flex flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 dark:border-slate-700/70 dark:bg-slate-900/55 lg:self-center">
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            Student Answer Box
          </span>

          <div
            className={`w-full max-w-[220px] rounded-[18px] border-2 px-4 py-3 text-center text-2xl font-black transition-colors duration-200 ${
              showCorrectAnswers
                ? "math-mcq-correct-option border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-400/70 dark:bg-emerald-700/40 dark:text-emerald-50"
                : "border-slate-200 bg-white text-slate-300 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-600"
            }`}
          >
            {showCorrectAnswers ? FormatMcqOptionValue(question.correct_answer) : "?"}
          </div>

          {showCorrectAnswers ? (
            <span className="math-mcq-correct-pill rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black uppercase tracking-[0.16em] text-emerald-700 dark:bg-emerald-100/20 dark:text-emerald-50">
              Correct Answer
            </span>
          ) : (
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              Hidden -- toggle Show Answers to reveal
            </span>
          )}
        </div>
      </div>
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
function FormatMcqOptionValue(Value: unknown): string {
  const RawValue = String(Value ?? "").trim();

  if (!RawValue) return RawValue;

  const NumericValue = typeof Value === "number" ? Value : Number(RawValue);
  if (!Number.isFinite(NumericValue)) return RawValue;

  if (Number.isInteger(NumericValue)) return String(NumericValue);

  const PlainValue = NumericValue.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits: 20,
  });

  return PlainValue.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

