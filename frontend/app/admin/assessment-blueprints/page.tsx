
"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import {
  archiveAdminAssessmentBlueprint,
  createAdminAssessmentBlueprint,
  deleteAdminAssessmentBlueprint,
  generateAdminAssessmentPreview,
  getAdminAssessmentBlueprints,
  getAdminGeneratedAssessment,
  getLessons,
  getLevels,
  getModules,
  makeAdminAssessmentVersionAvailable,
  pauseAdminAssessmentVersion,
  publishAdminAssessmentBlueprint,
  updateAdminAssessmentBlueprint,
  type AssessmentBlueprint,
  type AssessmentGeneratedVersion,
} from "@/lib/api/admin";
import type { LessonItem } from "@/types/curriculum";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArrowLeft,
  AlertTriangle,
  BadgeCheck,
  Calculator,
  BookOpenCheck,
  CheckCircle2,
  Clock,
  Eye,
  FilePenLine,
  Gauge,
  Layers3,
  RefreshCw,
  Minus,
  PauseCircle,
  PlayCircle,
  Rocket,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

type BlueprintStatusFilter = "" | "ALL" | "DRAFT" | "PUBLISHED" | "ARCHIVED";

type LessonDistributionState = {
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  questionCount: number;
};

function secondsFromMinutes(value: number) {
  return Math.max(60, Math.round(value * 60));
}

function distributeEvenly(lessons: LessonItem[], totalQuestions: number): LessonDistributionState[] {
  if (!lessons.length) return [];
  const safeTotal = Math.max(lessons.length, Number(totalQuestions || lessons.length));
  const base = Math.floor(safeTotal / lessons.length);
  let remainder = safeTotal % lessons.length;
  return lessons.map((lesson) => {
    const extra = remainder > 0 ? 1 : 0;
    remainder -= extra;
    return {
      lessonId: lesson.lessonId,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.lessonTitle,
      questionCount: Math.max(1, base + extra),
    };
  });
}

function sumDistribution(distribution: LessonDistributionState[]) {
  return distribution.reduce((sum, item) => sum + Number(item.questionCount || 0), 0);
}

function marksPerQuestion(totalQuestions: number) {
  return totalQuestions ? "Auto-Balanced" : "-";
}

function statusTone(status: string) {
  const text = String(status || "").toUpperCase();
  if (text === "PUBLISHED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (text === "ARCHIVED") return "border-slate-200 bg-slate-50 text-slate-600";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function statusIcon(status: string) {
  const text = String(status || "").toUpperCase();
  if (text === "PUBLISHED") return <BadgeCheck size={14} />;
  if (text === "ARCHIVED") return <Archive size={14} />;
  return <FilePenLine size={14} />;
}

function differenceCopy(difference: number) {
  if (difference === 0) return "Perfect match. Ready to save or publish.";
  if (difference > 0) return `Reduce ${difference} question${difference === 1 ? "" : "s"} to match the total.`;
  return `Add ${Math.abs(difference)} question${Math.abs(difference) === 1 ? "" : "s"} to match the total.`;
}

export default function AdminAssessmentBlueprintBuilderPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const queryClient = useQueryClient();

  const AssessmentStudioStateKey = CreatePersistedUiStateKey("admin", "assessment-studio");
  const [search, setSearch] = usePersistentUiState(CreatePersistedUiStateKey(AssessmentStudioStateKey, "search"), "");
  const [statusFilter, setStatusFilter] = usePersistentUiState<BlueprintStatusFilter>(CreatePersistedUiStateKey(AssessmentStudioStateKey, "status-filter"), "");
  const [manageModuleFilter, setManageModuleFilter] = usePersistentUiState(CreatePersistedUiStateKey(AssessmentStudioStateKey, "module-filter"), "");
  const [manageLevelFilter, setManageLevelFilter] = usePersistentUiState(CreatePersistedUiStateKey(AssessmentStudioStateKey, "level-filter"), "");
  const [selectedBlueprint, setSelectedBlueprint] = useState<AssessmentBlueprint | null>(null);
  const [editingBlueprint, setEditingBlueprint] = useState<AssessmentBlueprint | null>(null);
  const [pendingDeleteBlueprint, setPendingDeleteBlueprint] = useState<AssessmentBlueprint | null>(null);
  const [activeTab, setActiveTab] = usePersistentUiState<"CREATE" | "MANAGE">(CreatePersistedUiStateKey(AssessmentStudioStateKey, "active-tab"), (() => {
    if (typeof window === "undefined") return "CREATE";
    return new URLSearchParams(window.location.search).get("tab") === "manage" ? "MANAGE" : "CREATE";
  })());


  function ChangeBlueprintTab(NextTab: "CREATE" | "MANAGE") {
    setActiveTab(NextTab);
    if (typeof window === "undefined") return;
    const NextUrl = new URL(window.location.href);
    if (NextTab === "CREATE") NextUrl.searchParams.delete("tab");
    else NextUrl.searchParams.set("tab", "manage");
    window.history.replaceState(null, "", `${NextUrl.pathname}${NextUrl.search}${NextUrl.hash}`);
  }

  const [title, setTitle] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [levelId, setLevelId] = useState("");
  const [totalQuestions, setTotalQuestions] = useState(40);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [instructions, setInstructions] = useState("Answer all questions carefully. Review your work before submitting.");
  const [distribution, setDistribution] = useState<LessonDistributionState[]>([]);

  const modulesQuery = useQuery({ queryKey: ["admin-modules"], queryFn: getModules, enabled: ready });
  const levelsQuery = useQuery({ queryKey: ["admin-levels", moduleId], queryFn: () => getLevels(moduleId), enabled: ready && Boolean(moduleId) });
  const lessonsQuery = useQuery({ queryKey: ["admin-lessons", levelId], queryFn: () => getLessons(levelId), enabled: ready && Boolean(levelId) });
  const blueprintsQuery = useQuery({
    queryKey: ["admin-assessment-blueprints", statusFilter],
    queryFn: () => getAdminAssessmentBlueprints({ includeArchived: statusFilter === "ARCHIVED" || statusFilter === "ALL" || !statusFilter, status: !statusFilter || statusFilter === "ALL" ? undefined : statusFilter }),
    enabled: ready,
  });

  const modules = modulesQuery.data ?? [];
  const levels = levelsQuery.data ?? [];
  const lessons = lessonsQuery.data ?? [];
  const blueprints = blueprintsQuery.data?.items ?? [];

  useEffect(() => { setLevelId(""); setDistribution([]); }, [moduleId]);
  useEffect(() => { setManageLevelFilter(""); }, [manageModuleFilter]);
  useEffect(() => {
    if (!lessons.length) { setDistribution([]); return; }
    setDistribution(distributeEvenly(lessons, totalQuestions));
  }, [levelId, lessons.length]);

  const selectedModule = modules.find((item) => item.moduleId === moduleId);
  const selectedLevel = levels.find((item) => item.levelId === levelId);
  const distributionTotal = sumDistribution(distribution);
  const distributionDifference = distributionTotal - totalQuestions;
  const validDistribution = distribution.length > 0 && distributionTotal === totalQuestions && distribution.every((item) => item.questionCount > 0);
  const canCreate = Boolean(title.trim() && moduleId && levelId && totalQuestions > 0 && durationMinutes > 0 && validDistribution);

  const manageModuleOptions = useMemo(() => {
    const ModuleMap = new Map<string, string>();
    blueprints.forEach((Item) => {
      const Key = String(Item.moduleCode || Item.moduleId || "");
      if (!Key) return;
      const Label = Item.moduleName ? `${Key} · ${Item.moduleName}` : Key;
      if (!ModuleMap.has(Key)) ModuleMap.set(Key, Label);
    });
    return Array.from(ModuleMap.entries()).sort((First, Second) => First[1].localeCompare(Second[1], undefined, { numeric: true }));
  }, [blueprints]);

  const manageLevelOptions = useMemo(() => {
    const LevelMap = new Map<string, string>();
    blueprints
      .filter((Item) => !manageModuleFilter || manageModuleFilter === "ALL" || String(Item.moduleCode || Item.moduleId || "") === manageModuleFilter)
      .forEach((Item) => {
        const Key = String(Item.levelCode || Item.levelId || "");
        if (!Key) return;
        const Label = Item.levelName ? `${Key} · ${Item.levelName}` : Key;
        if (!LevelMap.has(Key)) LevelMap.set(Key, Label);
      });
    return Array.from(LevelMap.entries()).sort((First, Second) => First[1].localeCompare(Second[1], undefined, { numeric: true }));
  }, [blueprints, manageModuleFilter]);

  const filteredBlueprints = useMemo(() => {
    const q = search.trim().toLowerCase();
    return blueprints.filter((item) =>
      (!manageModuleFilter || manageModuleFilter === "ALL" || String(item.moduleCode || item.moduleId || "") === manageModuleFilter) &&
      (!manageLevelFilter || manageLevelFilter === "ALL" || String(item.levelCode || item.levelId || "") === manageLevelFilter) &&
      (!q || [item.title, item.moduleCode, item.moduleName, item.levelCode, item.levelName, item.status, item.createdByName].filter(Boolean).join(" ").toLowerCase().includes(q)),
    );
  }, [blueprints, search, manageModuleFilter, manageLevelFilter]);

  const createMutation = useMutation({
    mutationFn: (status: "DRAFT" | "PUBLISHED") => createAdminAssessmentBlueprint({
      title: title.trim(), moduleId, levelId, totalQuestions, durationSeconds: secondsFromMinutes(60), instructions, status,
      lessonDistribution: distribution.map((item) => ({ lessonId: item.lessonId, questionCount: Number(item.questionCount), conceptRules: {} })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-assessment-blueprints"] });
      setTitle("");
      setInstructions("Answer all questions carefully. Review your work before submitting.");
      if (lessons.length) setDistribution(distributeEvenly(lessons, totalQuestions));
    },
  });
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingBlueprint) throw new Error("No assessment selected for editing.");
      return updateAdminAssessmentBlueprint(editingBlueprint.id, {
        title: title.trim(),
        totalQuestions,
        durationSeconds: secondsFromMinutes(60),
        instructions,
        lessonDistribution: distribution.map((item) => ({ lessonId: item.lessonId, questionCount: Number(item.questionCount), conceptRules: {} })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-assessment-blueprints"] });
      setEditingBlueprint(null);
    },
  });

  const publishMutation = useMutation({ mutationFn: publishAdminAssessmentBlueprint, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-assessment-blueprints"] }) });
  const listAvailabilityMutation = useMutation({
    mutationFn: ({ BlueprintId, VersionId, IsLive }: { BlueprintId: string; VersionId: string; IsLive: boolean }) =>
      IsLive ? makeAdminAssessmentVersionAvailable(BlueprintId, VersionId) : pauseAdminAssessmentVersion(BlueprintId, VersionId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-assessment-blueprints"] }),
  });
  const archiveMutation = useMutation({ mutationFn: archiveAdminAssessmentBlueprint, onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-assessment-blueprints"] }) });
  const deleteMutation = useMutation({
    mutationFn: deleteAdminAssessmentBlueprint,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-assessment-blueprints"] });
      setPendingDeleteBlueprint(null);
      if (selectedBlueprint && pendingDeleteBlueprint && selectedBlueprint.id === pendingDeleteBlueprint.id) setSelectedBlueprint(null);
    },
  });

  function beginEditBlueprint(item: AssessmentBlueprint) {
    if (item.status !== "DRAFT") return;
    setEditingBlueprint(item);
    ChangeBlueprintTab("CREATE");
    setTitle(item.title || "");
    setModuleId(item.moduleId || "");
    setLevelId(item.levelId || "");
    setTotalQuestions(Number(item.totalQuestions || 40));
    setDurationMinutes(60);
    setInstructions(item.instructions || "");
    setDistribution((item.lessonDistribution || []).map((lesson) => ({
      lessonId: lesson.lessonId,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.lessonTitle,
      questionCount: lesson.questionCount,
    })));
  }

  function cancelEditBlueprint() {
    setEditingBlueprint(null);
    setTitle("");
    setInstructions("Answer all questions carefully. Review your work before submitting.");
    if (lessons.length) setDistribution(distributeEvenly(lessons, totalQuestions));
  }

  function updateDistribution(lessonId: string, value: number) {
    setDistribution((current) => current.map((item) => item.lessonId === lessonId ? { ...item, questionCount: Math.max(1, Number(value || 1)) } : item));
  }

  if (!ready) return null;

  if (selectedBlueprint) {
    return (
      <AppShell>
        <AssessmentDetailsWorkspace
          item={selectedBlueprint}
          onBack={() => setSelectedBlueprint(null)}
          onRefreshBlueprints={() => queryClient.invalidateQueries({ queryKey: ["admin-assessment-blueprints"] })}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="math-hero math-admin-studio-hero">
        <div className="math-admin-studio-glow" />
        <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="math-admin-studio-pill">
              <Sparkles size={13} /> Assessment Studio
            </div>
            <h1 className="mt-4 max-w-4xl text-4xl font-black tracking-tight text-slate-950 dark:text-white sm:text-5xl">Assessment Studio</h1>
            <p className="mt-3 max-w-3xl text-base font-semibold leading-7 text-slate-600 dark:text-slate-300">Build, validate, publish, and manage level-wide assessments from one focused workspace.</p>
          </div>
        </div>
      </section>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StudioMetric icon={<FilePenLine size={17} />} label="Assessments" value={blueprintsQuery.data?.total ?? 0} helper="Saved Structures" />
        <StudioMetric icon={<ShieldCheck size={17} />} label="Total Marks" value="100" helper="Fixed Convention" />
        <StudioMetric icon={<Target size={17} />} label="Benchmark" value="70%" helper="Minimum Pass Mark" />
        <StudioMetric icon={<Clock size={17} />} label="Duration" value="60 Mins" helper="Fixed Assessment Time" />
        <StudioMetric icon={<Layers3 size={17} />} label="Coverage" value="All Lessons" helper="Level-Wide Coverage" />
      </section>

      <section className="mt-5 rounded-[32px] border border-white/70 bg-white/88 p-4 shadow-lg dark:border-slate-800 dark:bg-slate-950/80 sm:p-5">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${activeTab === "CREATE" ? "is-active math-admin-tab-force-selected" : ""}`}
            aria-selected={activeTab === "CREATE"}
            data-active={activeTab === "CREATE" ? "true" : "false"}
            onClick={() => ChangeBlueprintTab("CREATE")}
          >
            Create Assessment
          </button>
          <button
            type="button"
            className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${activeTab === "MANAGE" ? "is-active math-admin-tab-force-selected" : ""}`}
            aria-selected={activeTab === "MANAGE"}
            data-active={activeTab === "MANAGE" ? "true" : "false"}
            onClick={() => ChangeBlueprintTab("MANAGE")}
          >
            Manage Assessments
          </button>
        </div>
      </section>

      {activeTab === "CREATE" ? (
        <section className="mt-5 rounded-[36px] border border-white/70 bg-white/90 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div><p className="math-kicker">Create Assessment</p><h2 className="text-3xl font-black text-slate-950 dark:text-white">Build Assessment Structure</h2><p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">Complete the setup, review the distribution matrix, then save as draft or publish.</p></div>
            <div className={`rounded-[24px] border px-5 py-4 ${validDistribution ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><p className={`text-xs font-black uppercase tracking-[0.14em] ${validDistribution ? "text-emerald-700" : "text-amber-700"}`}>{validDistribution ? "Ready To Publish" : "Distribution Pending"}</p><p className={`mt-1 text-sm font-black ${validDistribution ? "text-emerald-800" : "text-amber-800"}`}>{distributionTotal} / {totalQuestions} questions</p></div>
          </div>
          <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.4fr)]">
            <div className="rounded-[30px] border border-slate-200 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/40">
              <p className="math-kicker text-[10px]">Step 1</p><h3 className="text-xl font-black text-slate-950 dark:text-white">Assessment Details</h3>
              <div className="mt-5 space-y-4">
                <Field label="Assessment Title"><input className="math-input" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: YLM Level 1 Assessment Set A" /></Field>
                <Field label="Module"><select className="math-select" value={moduleId} onChange={(event) => setModuleId(event.target.value)}><option value="">Select Module</option>{modules.map((module) => <option key={module.moduleId} value={module.moduleId}>{module.moduleCode} - {module.moduleName}</option>)}</select></Field>
                <Field label="Level"><select className="math-select" value={levelId} onChange={(event) => setLevelId(event.target.value)} disabled={!moduleId || levelsQuery.isLoading}><option value="">Select Level</option>{levels.map((level) => <option key={level.levelId} value={level.levelId}>{level.levelCode} - {level.levelName}</option>)}</select></Field>
                <div className="grid gap-3 sm:grid-cols-2"><Field label="Total Questions"><input className="math-input" type="number" min={lessons.length || 1} value={totalQuestions} onChange={(event) => setTotalQuestions(Math.max(1, Number(event.target.value || 1)))} /></Field><Field label="Duration Minutes"><input className="math-input bg-slate-50 text-slate-700" type="number" min={60} value={60} readOnly aria-readonly="true" /></Field></div>
                <Field label="Instructions"><textarea className="math-input min-h-[124px]" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Instructions shown to students before assessment." /></Field>
              </div>
            </div>
            <div className="rounded-[30px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="math-kicker text-[10px]">Step 2</p><h3 className="text-xl font-black text-slate-950 dark:text-white">Distribution Matrix</h3><p className="mt-1 text-sm font-semibold text-slate-500">One clean matrix for every active lesson in the selected level.</p></div><div className="flex flex-wrap gap-2"><button type="button" className="math-button-secondary px-3 py-2" disabled={!lessons.length} onClick={() => setDistribution(distributeEvenly(lessons, totalQuestions))}><Zap size={15} />Auto Balance</button><button type="button" className="math-button-secondary px-3 py-2" disabled={!lessons.length} onClick={() => setDistribution((current) => current.map((item) => ({ ...item, questionCount: 1 })))}><Minus size={15} />Clear</button></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-4"><Info label="Module" value={selectedModule?.moduleCode || "-"} /><Info label="Level" value={selectedLevel?.levelCode || "-"} /><Info label="Lessons" value={lessons.length || "-"} /><Info label="Marks/Question" value={marksPerQuestion(totalQuestions) || "-"} /></div>
              <div className={`mt-5 rounded-[24px] border p-4 ${validDistribution ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className={`text-xs font-black uppercase tracking-[0.14em] ${validDistribution ? "text-emerald-700" : "text-amber-700"}`}>Validation</p><p className={`mt-1 text-sm font-black ${validDistribution ? "text-emerald-800" : "text-amber-800"}`}>{differenceCopy(distributionDifference)}</p></div><div className={`rounded-2xl px-4 py-2 text-sm font-black ${validDistribution ? "bg-white text-emerald-700" : "bg-white text-amber-700"}`}>Difference: {distributionDifference > 0 ? "+" : ""}{distributionDifference}</div></div></div>
              <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-800"><div className="grid grid-cols-[70px_1fr_130px_110px_120px] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900"><div>Lesson</div><div>Topic</div><div>Questions</div><div>Weight</div><div>Status</div></div><div className="max-h-[430px] overflow-y-auto bg-white dark:bg-slate-950">{lessonsQuery.isLoading ? <LoadingState label="Loading lessons..." /> : null}{!levelId ? <div className="p-6 text-sm font-semibold text-slate-500">Select a module and level to load the distribution matrix.</div> : null}{levelId && !lessonsQuery.isLoading && !lessons.length ? <div className="p-6 text-sm font-semibold text-slate-500">No active lessons found for this level.</div> : null}{distribution.map((item) => { const weight = totalQuestions ? ((item.questionCount / totalQuestions) * 100).toFixed(1) : "0"; return <div key={item.lessonId} className="grid grid-cols-[70px_1fr_130px_110px_120px] gap-3 border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800"><div className="flex items-center"><span className="math-admin-studio-chip rounded-2xl px-3 py-2 text-xs font-black">L{item.lessonNumber}</span></div><div className="min-w-0"><p className="truncate font-black text-slate-950 dark:text-white">{item.lessonTitle}</p><p className="mt-1 text-xs font-semibold text-slate-500">Full-level coverage required</p></div><input className="math-input h-11" type="number" min={1} value={item.questionCount} onChange={(event) => updateDistribution(item.lessonId, Number(event.target.value))} /><div className="flex items-center font-black text-slate-700 dark:text-slate-200">{weight}%</div><div className="flex items-center"><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Included</span></div></div>; })}</div></div>
              {createMutation.error ? <div className="mt-4"><ErrorState message={apiErrorMessage(createMutation.error)} /></div> : null}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">{editingBlueprint ? <button type="button" className="math-button-secondary" onClick={cancelEditBlueprint} disabled={updateMutation.isPending}>Cancel Edit</button> : null}<button type="button" className="math-button-secondary" disabled={!canCreate || createMutation.isPending || updateMutation.isPending} title={!canCreate ? differenceCopy(distributionDifference) : editingBlueprint ? "Save assessment changes" : "Save as draft"} onClick={() => editingBlueprint ? updateMutation.mutate() : createMutation.mutate("DRAFT")}><Save size={17} />{editingBlueprint ? "Save Changes" : "Save Draft"}</button>{!editingBlueprint ? <button type="button" className="math-button-primary" disabled={!canCreate || createMutation.isPending} title={!canCreate ? differenceCopy(distributionDifference) : "Create and publish"} onClick={() => createMutation.mutate("PUBLISHED")}><Rocket size={17} />Create & Publish</button> : null}</div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "MANAGE" ? (
        <section className="mt-5 rounded-[36px] border border-white/70 bg-white/90 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div><p className="math-kicker">Manage Assessments</p><h2 className="text-3xl font-black text-slate-950 dark:text-white">Assessment Library</h2><p className="mt-2 max-w-3xl text-sm font-semibold text-slate-500">Review draft, published, and archived assessment structures from one focused control panel.</p></div><div className="grid gap-3 sm:grid-cols-3"><MiniCount label="Draft" value={blueprints.filter((item) => item.status === "DRAFT").length} /><MiniCount label="Published" value={blueprints.filter((item) => item.status === "PUBLISHED").length} /><MiniCount label="Archived" value={blueprints.filter((item) => item.status === "ARCHIVED").length} /></div></div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_220px_220px_190px]"><div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} /><input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Manage Assessments" /></div><select className="math-select" value={manageModuleFilter} onChange={(event) => setManageModuleFilter(event.target.value)} title="Filter by module" aria-label="Filter by module"><option value="" disabled>Choose Module</option><option value="ALL">All Modules</option>{manageModuleOptions.map(([ModuleKey, ModuleLabel]) => <option key={ModuleKey} value={ModuleKey}>{ModuleLabel}</option>)}</select><select className="math-select" value={manageLevelFilter} onChange={(event) => setManageLevelFilter(event.target.value)} title="Filter by level" aria-label="Filter by level"><option value="" disabled>Choose Level</option><option value="ALL">All Levels</option>{manageLevelOptions.map(([LevelKey, LevelLabel]) => <option key={LevelKey} value={LevelKey}>{LevelLabel}</option>)}</select><select className="math-select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as BlueprintStatusFilter)}><option value="" disabled>Choose Status</option><option value="ALL">All Statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option><option value="ARCHIVED">Archived</option></select></div>
          <div className="mt-6">{blueprintsQuery.isLoading ? <LoadingState label="Loading assessments..." /> : null}{blueprintsQuery.error ? <ErrorState message={apiErrorMessage(blueprintsQuery.error)} /> : null}{!blueprintsQuery.isLoading && !blueprintsQuery.error && !filteredBlueprints.length ? <EmptyState message="Create your first 100-mark level assessment." /> : null}<div className="grid gap-5 xl:grid-cols-2">{filteredBlueprints.map((item) => <AssessmentCard key={item.id} item={item} onView={() => setSelectedBlueprint(item)} onEdit={() => beginEditBlueprint(item)} onPublish={() => publishMutation.mutate(item.id)} onToggleLive={(IsLive) => item.latestPublishedVersionId ? listAvailabilityMutation.mutate({ BlueprintId: item.id, VersionId: item.latestPublishedVersionId, IsLive }) : undefined} onArchive={() => archiveMutation.mutate(item.id)} onDelete={() => setPendingDeleteBlueprint(item)} busy={publishMutation.isPending || listAvailabilityMutation.isPending || archiveMutation.isPending || deleteMutation.isPending} />)}</div></div>
        </section>
      ) : null}
      {pendingDeleteBlueprint ? (
        <DeleteAssessmentDialog
          item={pendingDeleteBlueprint}
          busy={deleteMutation.isPending}
          error={deleteMutation.error ? apiErrorMessage(deleteMutation.error) : null}
          onCancel={() => setPendingDeleteBlueprint(null)}
          onConfirm={() => deleteMutation.mutate(pendingDeleteBlueprint.id)}
        />
      ) : null}
    </AppShell>
  );
}

function IconAction({ label, tooltip, children, onClick, disabled, danger }: { label: string; tooltip: string; children: ReactNode; onClick?: () => void; disabled?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={danger
        ? "inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-sm font-black text-red-700 shadow-sm transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        : "math-role-action-button h-10 w-10 px-0 text-sm"
      }
      onClick={onClick}
      disabled={disabled}
      title={`${label} — ${tooltip}`}
      aria-label={`${label}. ${tooltip}`}
    >
      {children}
    </button>
  );
}

function AssessmentCard({ item, onView, onEdit, onPublish, onToggleLive, onArchive, onDelete, busy }: { item: AssessmentBlueprint; onView: () => void; onEdit: () => void; onPublish: () => void; onToggleLive: (IsLive: boolean) => void; onArchive: () => void; onDelete: () => void; busy: boolean }) {
  const HasPublishedVersion = Boolean(item.latestPublishedVersionId);
  const IsLive = Boolean(item.latestPublishedVersionIsLive);
  return (
    <article className="group relative overflow-hidden rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-2xl dark:border-slate-800 dark:bg-slate-950">
      <div className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full math-admin-studio-card-glow blur-3xl transition" />
      <div className="relative z-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${statusTone(item.status)}`}>{statusIcon(item.status)}{item.status}</span>
              {item.status === "PUBLISHED" ? <span className={`rounded-full px-3 py-1 text-xs font-black ${IsLive ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{IsLive ? "LIVE" : "PAUSED"}</span> : null}
              <span className="math-admin-studio-chip rounded-full px-3 py-1 text-xs font-black">{item.moduleCode} · {item.levelCode}</span>
            </div>
            <h3 className="mt-3 text-xl font-black text-slate-950 dark:text-white">{item.title}</h3>
            <p className="mt-2 text-sm font-semibold text-slate-500">{item.levelName}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button type="button" className="math-role-action-button px-4 py-2 text-sm" onClick={onView} title="View Assessment" aria-label="View Assessment"><Eye size={15} />View</button>
            <div className="flex items-center gap-1.5 rounded-[22px] border border-slate-200 bg-slate-50 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
              {item.status === "DRAFT" ? <IconAction label="Edit Draft" tooltip="Edit this draft assessment." onClick={onEdit} disabled={busy}><FilePenLine size={16} /></IconAction> : <IconAction label="Edit Locked" tooltip={item.status === "PUBLISHED" ? "Published assessments are locked. Create a revised draft to edit." : "Archived assessments cannot be edited."} disabled><FilePenLine size={16} /></IconAction>}
              {item.status === "DRAFT" ? <IconAction label="Publish" tooltip="Publish a locked generated assessment version." onClick={onPublish} disabled={busy}><Rocket size={16} /></IconAction> : null}
              {item.status === "PUBLISHED" && HasPublishedVersion ? (
                IsLive ? <IconAction label="Pause Assignment" tooltip="Hide this assessment from teacher assignment." onClick={() => onToggleLive(false)} disabled={busy}><PauseCircle size={17} /></IconAction> : <IconAction label="Make Live" tooltip="Allow teachers to assign this assessment." onClick={() => onToggleLive(true)} disabled={busy}><PlayCircle size={17} /></IconAction>
              ) : null}
              {item.status !== "ARCHIVED" ? <IconAction label="Archive" tooltip="Move this assessment out of active use." onClick={onArchive} disabled={busy}><Archive size={16} /></IconAction> : null}
              <IconAction label="Delete" tooltip="Delete this assessment when dependency rules allow." onClick={onDelete} disabled={busy} danger><Trash2 size={16} /></IconAction>
            </div>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4"><Info label="Questions" value={item.totalQuestions} /><Info label="Marks" value={item.totalMarks} /><Info label="Marks/Question" value="Auto-Balanced" /><Info label="Duration" value="60 Mins" /></div>
        <div className="mt-5 rounded-[24px] bg-slate-50 p-4 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-slate-600"><BookOpenCheck size={16} /><p className="text-xs font-black uppercase tracking-[0.12em]">Distribution Preview</p></div><p className="text-xs font-black text-slate-500">{item.lessonDistribution.length} lessons</p></div>
          <div className="mt-3 flex flex-wrap gap-2">{item.lessonDistribution.slice(0, 10).map((lesson) => <span key={lesson.lessonId} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 shadow-sm dark:bg-slate-950 dark:text-slate-200">L{lesson.lessonNumber}: {lesson.questionCount}</span>)}{item.lessonDistribution.length > 10 ? <span className="math-admin-studio-chip rounded-full px-3 py-1 text-xs font-black">+{item.lessonDistribution.length - 10} more</span> : null}</div>
        </div>
      </div>
    </article>
  );
}

function AssessmentDetailsWorkspace({ item, onBack, onRefreshBlueprints }: { item: AssessmentBlueprint; onBack: () => void; onRefreshBlueprints: () => void }) {
  const queryClient = useQueryClient();
  const PreviewStateKey = CreatePersistedUiStateKey("admin", "assessment-studio", "blueprint-preview", item.id || item.title);
  const [showAnswers, setShowAnswers] = usePersistentUiState(CreatePersistedUiStateKey(PreviewStateKey, "show-answers"), true);
  const [ActiveDetailTab, SetActiveDetailTab] = usePersistentUiState<"OVERVIEW" | "PREVIEW" | "COVERAGE">(CreatePersistedUiStateKey(PreviewStateKey, "active-detail-tab"), "OVERVIEW");

  const generatedQuery = useQuery({
    queryKey: ["admin-generated-assessment", item.id, showAnswers],
    queryFn: () => getAdminGeneratedAssessment(item.id, showAnswers),
  });
  const generatedAssessment = generatedQuery.data?.assessment ?? null;
  const generateMutation = useMutation({
    mutationFn: () => generateAdminAssessmentPreview(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-generated-assessment", item.id] });
      onRefreshBlueprints();
    },
  });
  const publishMutation = useMutation({
    mutationFn: () => publishAdminAssessmentBlueprint(item.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-generated-assessment", item.id] });
      onRefreshBlueprints();
    },
  });
  const availabilityMutation = useMutation({
    mutationFn: ({ VersionId, IsAvailable }: { VersionId: string; IsAvailable: boolean }) =>
      IsAvailable ? makeAdminAssessmentVersionAvailable(item.id, VersionId) : pauseAdminAssessmentVersion(item.id, VersionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-generated-assessment", item.id] });
      onRefreshBlueprints();
    },
  });

  const DetailTabs: Array<{ Key: "OVERVIEW" | "PREVIEW" | "COVERAGE"; Label: string }> = [
    { Key: "OVERVIEW", Label: "Overview" },
    { Key: "PREVIEW", Label: "Question Preview" },
    { Key: "COVERAGE", Label: "Coverage Check" },
  ];

  return (
    <div className="space-y-3">
      <section className="math-admin-studio-detail-hero relative overflow-hidden rounded-[28px] border p-3 shadow-[0_16px_42px_rgba(15,23,42,0.07)] sm:p-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <button type="button" onClick={onBack} className="math-role-action-button h-9 px-3 text-xs">
              <ArrowLeft size={14} /> Back To Assessment Studio
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusTone(item.status)}`}>{statusIcon(item.status)}{item.status}</span>
              <span className="math-admin-studio-chip rounded-full px-2.5 py-0.5 text-[10px] font-black">{item.moduleCode} · {item.levelCode}</span>
              {generatedAssessment?.status === "PUBLISHED" ? <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${generatedAssessment.isActive ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{generatedAssessment.isActive ? "LIVE" : "PAUSED"}</span> : null}
            </div>
            <p className="math-kicker mt-2 text-[10px]">Assessment Details</p>
            <h1 className="mt-0.5 max-w-4xl truncate text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{item.title}</h1>
            <p className="mt-1 max-w-3xl text-sm font-bold leading-5 text-slate-700 dark:text-slate-200">Full-level assessment generated from the selected lesson distribution and concept rules.</p>
          </div>
          <div className="flex flex-wrap gap-2 xl:justify-end">
            <button type="button" className="math-role-action-button min-h-9 px-4 py-2 text-[13px]" onClick={() => setShowAnswers((current) => !current)}>
              <Eye size={15} />{showAnswers ? "Hide Answers" : "Show Answers"}
            </button>
            {item.status !== "ARCHIVED" ? (
              <button type="button" className="math-role-action-button min-h-9 px-4 py-2 text-[13px]" onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || publishMutation.isPending}>
                <RefreshCw size={15} />Generate Preview
              </button>
            ) : null}
            {item.status === "DRAFT" ? (
              <button type="button" className="math-button-primary min-h-9 px-4 py-2 text-[13px] font-black" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending || generateMutation.isPending}>
                <Rocket size={15} />Publish Locked Version
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        <DetailMetric icon={<Target size={16} />} label="Questions" value={item.totalQuestions} helper="Assessment Length" />
        <DetailMetric icon={<ShieldCheck size={16} />} label="Total Marks" value={item.totalMarks} helper="Fixed Total" />
        <DetailMetric icon={<Calculator size={16} />} label="Marks/Question" value="Auto-Balanced" helper="Exact 100-Mark Total" />
        <DetailMetric icon={<Clock size={16} />} label="Duration" value="60 Mins" helper="Fixed Assessment Time" />
        <DetailMetric icon={<Gauge size={16} />} label="Generated" value={generatedAssessment?.questionCount ?? 0} helper="Preview Set" />
      </section>

      {(generateMutation.error || publishMutation.error || availabilityMutation.error) ? <ErrorState message={apiErrorMessage(generateMutation.error || publishMutation.error || availabilityMutation.error)} /> : null}

      <section className="rounded-[24px] border border-white/70 bg-white/90 p-2.5 shadow-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="flex flex-wrap gap-2">
          {DetailTabs.map((Tab) => (
            <button
              key={Tab.Key}
              type="button"
              className={`math-role-tab-button math-admin-tab-force ${ActiveDetailTab === Tab.Key ? "is-active math-admin-tab-force-selected" : ""}`}
              onClick={() => SetActiveDetailTab(Tab.Key)}
            >
              {Tab.Label}
            </button>
          ))}
        </div>
      </section>

      {ActiveDetailTab === "OVERVIEW" ? <AssessmentOverviewTab item={item} /> : null}
      {ActiveDetailTab === "PREVIEW" ? (
        <QuestionPreviewTab
          item={item}
          assessment={generatedAssessment}
          showAnswers={showAnswers}
          isLoading={generatedQuery.isLoading}
          error={generatedQuery.error}
        />
      ) : null}
      {ActiveDetailTab === "COVERAGE" ? (
        <CoverageCheckTab
          assessment={generatedAssessment}
          showAnswers={showAnswers}
          isLoading={generatedQuery.isLoading}
          error={generatedQuery.error}
        />
      ) : null}
    </div>
  );
}

function AssessmentOverviewTab({ item }: { item: AssessmentBlueprint }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950/80 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="rounded-[26px] border border-slate-200 p-5 dark:border-slate-800">
          <p className="math-kicker text-[10px]">Instructions</p>
          <h3 className="mt-2 text-xl font-black text-slate-950 dark:text-white">Student Instructions</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{item.instructions || "Answer all questions carefully before submitting."}</p>
          <div className="mt-4 rounded-[22px] bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
            Questions are generated from the lesson-wise distribution and the concept rules mapped to this level.
          </div>
        </div>

        <div className="overflow-hidden rounded-[26px] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-5 py-3 dark:bg-slate-900">
            <div>
              <p className="math-kicker text-[10px]">Distribution Matrix</p>
              <h3 className="text-xl font-black text-slate-950 dark:text-white">Lesson-Wise Questions</h3>
            </div>
            <span className="rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">{item.lessonDistribution.length} Lessons</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {item.lessonDistribution.map((lesson) => (
              <div key={lesson.lessonId} className="grid gap-3 px-5 py-3 sm:grid-cols-[72px_1fr_120px_90px] sm:items-center">
                <span className="rounded-2xl math-admin-studio-chip px-3 py-2 text-center text-xs font-black">L{lesson.lessonNumber}</span>
                <p className="truncate font-black text-slate-950 dark:text-white">{lesson.lessonTitle}</p>
                <p className="text-sm font-black text-slate-700 dark:text-slate-200">{lesson.questionCount} Questions</p>
                <p className="text-sm font-black text-slate-500">{item.totalQuestions ? ((lesson.questionCount / item.totalQuestions) * 100).toFixed(1) : "0"}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function QuestionPreviewTab({ item, assessment, showAnswers, isLoading, error }: { item: AssessmentBlueprint; assessment: AssessmentGeneratedVersion | null; showAnswers: boolean; isLoading: boolean; error: unknown }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950/80 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="math-kicker">Question Preview</p>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">Generated Question Paper</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">Review the generated questions in the same vertical format students use during assessment.</p>
        </div>
      </div>

      <div className="mt-4">
        {isLoading ? <LoadingState label="Loading generated assessment..." /> : null}
        {error ? <ErrorState message={apiErrorMessage(error)} /> : null}
        {!isLoading && !error && !assessment ? (
          <EmptyState message="Generate Preview to create the assessment question set." />
        ) : null}
        {assessment ? <GeneratedQuestionPreview item={item} assessment={assessment} showAnswers={showAnswers} /> : null}
      </div>
    </section>
  );
}

function GeneratedQuestionPreview({ item, assessment, showAnswers }: { item: AssessmentBlueprint; assessment: AssessmentGeneratedVersion; showAnswers: boolean }) {
  const Questions = useMemo(
    () => [...assessment.questions].sort((A, B) => A.questionNumber - B.questionNumber),
    [assessment.questions]
  );
  const [CurrentIndex, SetCurrentIndex] = useState(0);

  useEffect(() => {
    SetCurrentIndex(0);
  }, [assessment.id]);

  const CurrentQuestion = Questions[CurrentIndex];
  const CurrentLessonGroup = CurrentQuestion
    ? assessment.lessonGroups.find((Group) => Group.lessonId === CurrentQuestion.lessonId)
    : null;

  if (!Questions.length || !CurrentQuestion) {
    return <EmptyState message="Generate Preview to create the assessment question set." />;
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Info label="Status" value={assessment.status} />
        <Info label="Questions" value={`${assessment.questionCount}/${assessment.totalQuestions}`} />
        <Info label="Generated By" value={assessment.generatedByName || "Admin"} />
        <Info label="Mode" value="Assessment" />
      </div>

      <div className="math-card overflow-hidden p-4 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="math-kicker text-[10px]">Assessment Preview</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">
              Question {CurrentQuestion.questionNumber} of {Questions.length}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">
                Lesson {CurrentQuestion.lessonNumber ?? CurrentLessonGroup?.lessonNumber ?? "-"}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {CurrentQuestion.lessonTitle || CurrentLessonGroup?.lessonTitle || item.levelName}
              </span>
              <span className="math-admin-studio-chip rounded-full px-3 py-1 text-xs font-black">
                {CurrentQuestion.conceptTag || "Concept Rule"}
              </span>
              <span className="rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">
                {CurrentQuestion.difficulty || "Mixed"}
              </span>
            </div>
          </div>

          {showAnswers ? (
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
              <CheckCircle2 size={16} /> Answer: {CurrentQuestion.correctAnswer}
            </div>
          ) : (
            <div className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600 dark:bg-slate-800 dark:text-slate-200">
              <Eye size={16} /> Answer Hidden
            </div>
          )}
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,360px)_1fr] xl:items-center">
          <div className="rounded-[26px] bg-slate-50/90 p-4 dark:bg-slate-900/70 sm:p-5">
            <MathQuestionDisplay operands={CurrentQuestion.operands} operators={CurrentQuestion.operators} displayType={(CurrentQuestion as any).displayType ?? (CurrentQuestion as any).display_type} questionText={(CurrentQuestion as any).questionText ?? (CurrentQuestion as any).question_text} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {CurrentQuestion.options.map((Option) => {
              const IsCorrect = Boolean(showAnswers && Option.isCorrect);
              return (
                <div
                  key={Option.id}
                  className={`flex min-h-[58px] items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition duration-200 ${
                    IsCorrect
                      ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-lg shadow-emerald-100/70 dark:border-emerald-500/50 dark:bg-emerald-950/30 dark:text-emerald-100 dark:shadow-none"
                      : "border-slate-200 bg-white/90 text-slate-800 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl font-black ${
                      IsCorrect ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {Option.label}
                  </span>
                  <span className="text-base font-semibold">{Option.value}</span>
                </div>
              );
            })}
          </div>
        </div>

        {showAnswers && CurrentQuestion.explanation ? (
          <div className="mt-4 rounded-[22px] bg-emerald-50 p-4 text-sm font-semibold leading-6 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
            {CurrentQuestion.explanation}
          </div>
        ) : null}
      </div>

      <div className="math-card p-4">
        <QuestionNavigator
          totalQuestions={Questions.length}
          currentQuestionNumber={CurrentQuestion.questionNumber}
          answeredQuestionNumbers={[]}
          onSelectQuestion={(QuestionNumber) => {
            const TargetIndex = Questions.findIndex((Question) => Question.questionNumber === QuestionNumber);
            if (TargetIndex >= 0) SetCurrentIndex(TargetIndex);
          }}
        />

        <div className="mt-4 flex flex-wrap justify-between gap-3">
          <button
            className="math-role-action-button px-4 py-2 text-xs"
            disabled={CurrentIndex === 0}
            onClick={() => SetCurrentIndex((Value) => Math.max(0, Value - 1))}
          >
            Previous
          </button>

          <button
            className="math-role-action-button px-4 py-2 text-xs"
            disabled={CurrentIndex >= Questions.length - 1}
            onClick={() => SetCurrentIndex((Value) => Math.min(Questions.length - 1, Value + 1))}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

function CoverageCheckTab({ assessment, showAnswers, isLoading, error }: { assessment: AssessmentGeneratedVersion | null; showAnswers: boolean; isLoading: boolean; error: unknown }) {
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950/80 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="math-kicker">Coverage Check</p>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">Lesson And Concept Coverage</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">Verify lesson coverage, concept coverage, and generated question allocation before publishing.</p>
        </div>
        <span className="w-fit rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">Admin Metadata</span>
      </div>

      <div className="mt-4">
        {isLoading ? <LoadingState label="Loading coverage check..." /> : null}
        {error ? <ErrorState message={apiErrorMessage(error)} /> : null}
        {!isLoading && !error && !assessment ? <EmptyState message="Generate Preview to review lesson and concept coverage." /> : null}
        {assessment ? <AssessmentCoverageCheck assessment={assessment} showAnswers={showAnswers} /> : null}
      </div>
    </section>
  );
}

function AssessmentCoverageCheck({ assessment, showAnswers }: { assessment: AssessmentGeneratedVersion; showAnswers: boolean }) {
  return (
    <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
      {assessment.lessonGroups.map((Group) => (
        <div key={Group.lessonId} className="overflow-hidden rounded-[26px] border border-slate-200 dark:border-slate-800">
          <div className="flex flex-col gap-2 bg-slate-50 px-5 py-4 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="math-kicker text-[10px]">Lesson {Group.lessonNumber}</p>
              <h3 className="text-lg font-black text-slate-950 dark:text-white">{Group.lessonTitle}</h3>
            </div>
            <span className="rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">{Group.questionCount} Questions</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Group.questions.map((Question) => (
              <div key={Question.id} className="grid gap-3 px-5 py-3 text-sm lg:grid-cols-[80px_1fr_180px_120px] lg:items-center">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-center text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">Q{Question.questionNumber}</span>
                <p className="font-black text-slate-950 dark:text-white">{(Question as any).questionText || Question.operands.join(" ")}</p>
                <p className="text-xs font-black uppercase tracking-[0.12em] math-role-text">{Question.conceptTag || "Concept Rule"}</p>
                {showAnswers ? <p className="text-xs font-black text-emerald-700">Answer: {Question.correctAnswer}</p> : <p className="text-xs font-black text-slate-400">Answer Hidden</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DeleteAssessmentDialog({ item, busy, error, onCancel, onConfirm }: { item: AssessmentBlueprint; busy: boolean; error: string | null; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[32px] border border-red-100 bg-white p-6 shadow-2xl dark:border-red-900/60 dark:bg-slate-950">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-red-50 p-3 text-red-600 dark:bg-red-950/40 dark:text-red-300"><AlertTriangle size={22} /></div>
          <div>
            <p className="math-kicker text-[10px] text-red-600 dark:text-red-300">Delete Assessment</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Delete this assessment?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">This will permanently remove <span className="font-black text-slate-950 dark:text-white">{item.title}</span> from Assessment Studio. This action cannot be undone.</p>
          </div>
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">{error}</div> : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="math-button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-600 bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={onConfirm} disabled={busy}><Trash2 size={17} />Delete Assessment</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-2 block text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>{children}</label>; }
function DetailMetric({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <div className="group relative overflow-hidden rounded-[22px] border border-white/70 bg-white/88 p-3 shadow-md transition hover:-translate-y-0.5 hover:shadow-xl dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full math-admin-studio-card-glow blur-2xl transition" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="math-icon-shell inline-flex h-9 w-9 items-center justify-center rounded-2xl border shadow-sm">
          {icon}
        </div>
        <p className="text-xl font-black text-slate-950 dark:text-white">{value}</p>
      </div>
      <p className="relative z-10 mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="relative z-10 mt-0.5 text-xs font-semibold text-slate-500">{helper}</p>
    </div>
  );
}
function StudioMetric({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <div className="group relative overflow-hidden rounded-[20px] border border-white/70 bg-white/88 p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]">
      <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full math-admin-studio-card-glow blur-2xl transition" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="math-icon-shell inline-flex h-8 w-8 items-center justify-center rounded-xl border shadow-sm">
          {icon}
        </div>
        <p className="text-2xl font-black text-slate-950 dark:text-white">{value}</p>
      </div>
      <p className="relative z-10 mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-700 dark:text-slate-200">{label}</p>
      <p className="relative z-10 mt-0.5 text-xs font-bold text-slate-600 dark:text-slate-300">{helper}</p>
    </div>
  );
}
function HeroStat({ label, value }: { label: string; value: string | number }) { return <div className="rounded-[22px] bg-slate-50 p-4 dark:bg-slate-900"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p></div>; }
function CommandStat({ icon, label, value, helper }: { icon: React.ReactNode; label: string; value: string | number; helper: string }) { return <div className="rounded-[28px] border border-white/70 bg-white/85 p-5 shadow-lg dark:border-slate-800 dark:bg-slate-950/80"><div className="math-role-text">{icon}</div><p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p><p className="mt-1 text-xs font-semibold text-slate-500">{helper}</p></div>; }
function MiniCount({ label, value }: { label: string; value: string | number }) { return <div className="min-w-[120px] rounded-2xl bg-slate-50 px-4 py-3 text-center dark:bg-slate-900"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-950 dark:text-white">{value}</p></div>; }
function Info({ label, value }: { label: string; value: string | number }) { return <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900"><p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p><p className="mt-2 text-lg font-black text-slate-950 dark:text-white">{value}</p></div>; }
