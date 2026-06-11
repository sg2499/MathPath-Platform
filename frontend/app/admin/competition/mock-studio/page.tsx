"use client";

import { AppShell } from "@/components/common/AppShell";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  archiveCompetitionMockExam,
  assignCompetitionMockExams,
  deleteCompetitionMockExam,
  generateCompetitionMockDraft,
  getCompetitionMockSectionPlan,
  getAdminStudents,
  getCompetitionMockExam,
  getLevels,
  getModules,
  listCompetitionMockExams,
  type CompetitionMockExamDetail,
  type CompetitionMockExamSummary,
} from "@/lib/api/admin";
import type { LevelItem, ModuleItem } from "@/types/curriculum";
import type { AdminStudent } from "@/types/student";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, CheckCircle2, Eye, FilePenLine, Loader2, Plus, Search, Send, ShieldCheck, Target, Trash2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const DefaultQuestionCount = 40;
const MmDefaultQuestionCount = 50;
const DefaultDurationMinutes = 20;
const MmDefaultDurationMinutes = 30;

const AdminRowActionButtonClass = "inline-flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] shadow-sm transition hover:-translate-y-px hover:border-[color:var(--mp-role-border-strong)] hover:bg-[color:var(--mp-role-soft)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mp-role-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm dark:bg-slate-950/60 dark:text-blue-100 dark:hover:bg-[color:var(--mp-role-soft)]";

function FormatDuration(SecondsValue: number | null | undefined) {
  const SafeSeconds = Math.max(0, Number(SecondsValue || 0));
  const Minutes = Math.floor(SafeSeconds / 60);
  const Seconds = SafeSeconds % 60;
  if (Minutes && Seconds) return `${Minutes} Min ${Seconds} Secs`;
  if (Minutes) return `${Minutes} Min${Minutes === 1 ? "" : "s"}`;
  return `${Seconds} Secs`;
}

function StatusChip({ status }: { status: string }) {
  const StatusValue = String(status || "DRAFT").toUpperCase();
  const ChipClass = StatusValue === "ARCHIVED"
    ? "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
    : StatusValue === "DRAFT"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
      : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${ChipClass}`}>
      {StatusValue}
    </span>
  );
}

function SectionTitle({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return (
    <div>
      <p className="math-kicker">{kicker}</p>
      <h2 className="text-xl font-black text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{description}</p>
    </div>
  );
}

export default function AdminCompetitionMockStudioPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();

  const [SelectedModuleId, SetSelectedModuleId] = useState("");
  const [SelectedLevelId, SetSelectedLevelId] = useState("");
  const [MockTitle, SetMockTitle] = useState("");
  const [MockCode, SetMockCode] = useState("");
  const [QuestionCount, SetQuestionCount] = useState(String(DefaultQuestionCount));
  const [DurationMinutes, SetDurationMinutes] = useState(String(DefaultDurationMinutes));
  const [SelectedMockIds, SetSelectedMockIds] = useState<string[]>([]);
  const [SelectedStudentIds, SetSelectedStudentIds] = useState<string[]>([]);
  const [AssignToAll, SetAssignToAll] = useState(true);
  const [StudentSearch, SetStudentSearch] = useState("");
  const [AssignmentInstructions, SetAssignmentInstructions] = useState("");
  const [PreviewMockId, SetPreviewMockId] = useState<string | null>(null);
  const [DeleteMockId, SetDeleteMockId] = useState<string | null>(null);
  const [ArchiveMockId, SetArchiveMockId] = useState<string | null>(null);
  const [ActiveStudioTab, SetActiveStudioTab] = useState<"CREATE" | "MANAGE">("CREATE");
  const [ManageSearch, SetManageSearch] = useState("");
  const [ManageStatusFilter, SetManageStatusFilter] = useState("ALL");
  const [SectionCounts, SetSectionCounts] = useState<Record<string, string>>({});
  const [LastMessage, SetLastMessage] = useState<string | null>(null);

  const ModulesQuery = useQuery({ queryKey: ["admin", "competition", "modules"], queryFn: getModules, enabled: Ready });
  const LevelsQuery = useQuery({ queryKey: ["admin", "competition", "levels", SelectedModuleId], queryFn: () => getLevels(SelectedModuleId), enabled: Ready && Boolean(SelectedModuleId) });
  const StudentsQuery = useQuery({ queryKey: ["admin", "competition", "students"], queryFn: getAdminStudents, enabled: Ready });
  const MocksQuery = useQuery({ queryKey: ["admin", "competition", "mocks", SelectedLevelId], queryFn: () => listCompetitionMockExams(SelectedLevelId || undefined), enabled: Ready });
  const SectionPlanQuery = useQuery({ queryKey: ["admin", "competition", "section-plan", SelectedLevelId, QuestionCount], queryFn: () => getCompetitionMockSectionPlan(SelectedLevelId, Number(QuestionCount) || DefaultQuestionCount), enabled: Ready && Boolean(SelectedLevelId) });
  const PreviewQuery = useQuery({ queryKey: ["admin", "competition", "mock", PreviewMockId], queryFn: () => getCompetitionMockExam(PreviewMockId || ""), enabled: Ready && Boolean(PreviewMockId) });

  const Modules = ModulesQuery.data || [];
  const Levels = LevelsQuery.data || [];
  const Students = StudentsQuery.data || [];
  const MockExams = MocksQuery.data || [];
  const SectionPlan = SectionPlanQuery.data || null;

  useEffect(() => {
    if (!SectionPlan?.sections?.length) {
      SetSectionCounts({});
      return;
    }
    SetSectionCounts((CurrentValue) => {
      const NextValue: Record<string, string> = {};
      SectionPlan.sections.forEach((SectionValue) => {
        NextValue[SectionValue.sectionKey] = CurrentValue[SectionValue.sectionKey] ?? String(SectionValue.questionCount || 0);
      });
      return NextValue;
    });
  }, [SectionPlan]);

  const SelectedLevel = Levels.find((LevelValue) => LevelValue.levelId === SelectedLevelId) || null;
  const SelectedModule = Modules.find((ModuleValue) => ModuleValue.moduleId === SelectedModuleId) || null;
  const IsSelectedMasterModule = Boolean(SelectedModule && (SelectedModule.moduleCode?.toUpperCase() === "MM" || SelectedModule.moduleName?.toLowerCase().includes("master module")));

  useEffect(() => {
    if (!IsSelectedMasterModule) return;
    SetQuestionCount((CurrentValue) => CurrentValue === String(DefaultQuestionCount) ? String(MmDefaultQuestionCount) : CurrentValue);
    SetDurationMinutes((CurrentValue) => CurrentValue === String(DefaultDurationMinutes) ? String(MmDefaultDurationMinutes) : CurrentValue);
  }, [IsSelectedMasterModule]);


  const CleanSectionCounts = useMemo(() => {
    const Counts: Record<string, number> = {};
    Object.entries(SectionCounts).forEach(([Key, Value]) => {
      const CountValue = Math.max(0, Math.floor(Number(Value) || 0));
      if (CountValue > 0) Counts[Key] = CountValue;
    });
    return Counts;
  }, [SectionCounts]);

  const SectionCountTotal = useMemo(() => Object.values(CleanSectionCounts).reduce((Total, Value) => Total + Value, 0), [CleanSectionCounts]);

  function UpdateSectionCount(SectionKey: string, Value: string) {
    SetSectionCounts((CurrentValue) => ({ ...CurrentValue, [SectionKey]: Value }));
  }

  const LevelStudents = useMemo(() => {
    const SearchValue = StudentSearch.trim().toLowerCase();
    return Students.filter((StudentValue) => StudentValue.isActive && (!SelectedLevelId || StudentValue.currentLevelId === SelectedLevelId)).filter((StudentValue) => {
      if (!SearchValue) return true;
      return `${StudentValue.studentCode} ${StudentValue.studentName} ${StudentValue.currentLevelCode || ""}`.toLowerCase().includes(SearchValue);
    });
  }, [Students, SelectedLevelId, StudentSearch]);

  const GenerateMutation = useMutation({
    mutationFn: () => generateCompetitionMockDraft({
      levelId: SelectedLevelId,
      title: MockTitle.trim() || undefined,
      mockCode: MockCode.trim() || undefined,
      totalQuestions: SectionCountTotal || Number(QuestionCount) || DefaultQuestionCount,
      durationSeconds: (Number(DurationMinutes) || DefaultDurationMinutes) * 60,
      competitionScope: "GENERAL",
      difficultyBand: "COMPETITION",
      sectionCounts: CleanSectionCounts,
    }),
    onSuccess: (ResultValue) => {
      SetLastMessage(`Draft mock generated: ${ResultValue.title}`);
      SetMockTitle("");
      SetMockCode("");
      SetSelectedMockIds((CurrentValue) => Array.from(new Set([ResultValue.mockExamId, ...CurrentValue])));
      SetActiveStudioTab("MANAGE");
      QueryClient.invalidateQueries({ queryKey: ["admin", "competition", "mocks"] });
    },
  });

  const AssignMutation = useMutation({
    mutationFn: () => assignCompetitionMockExams({
      levelId: SelectedLevelId,
      mockExamIds: SelectedMockIds,
      assignToAllInLevel: AssignToAll,
      studentIds: AssignToAll ? [] : SelectedStudentIds,
      maxAttempts: 1,
      instructions: AssignmentInstructions.trim() || null,
    }),
    onSuccess: (ResultValue) => {
      SetLastMessage(`Assigned ${ResultValue.mockExamCount} mock exam(s) to ${ResultValue.studentCount} student(s). Created: ${ResultValue.createdAssignmentCount}. Updated: ${ResultValue.updatedExistingAssignmentCount}.`);
      QueryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
    },
  });



  const ArchiveMutation = useMutation({
    mutationFn: (MockExamId: string) => archiveCompetitionMockExam(MockExamId),
    onSuccess: (ResultValue) => {
      SetLastMessage(ResultValue.message || "Competition mock exam archived.");
      SetSelectedMockIds((CurrentValue) => CurrentValue.filter((MockId) => MockId !== ArchiveMockId));
      if (PreviewMockId === ArchiveMockId) SetPreviewMockId(null);
      SetArchiveMockId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
    },
  });

  const DeleteMutation = useMutation({
    mutationFn: (MockExamId: string) => deleteCompetitionMockExam(MockExamId),
    onSuccess: (ResultValue) => {
      SetLastMessage(ResultValue.message || "Competition mock exam deleted.");
      SetSelectedMockIds((CurrentValue) => CurrentValue.filter((MockId) => MockId !== DeleteMockId));
      if (PreviewMockId === DeleteMockId) SetPreviewMockId(null);
      SetDeleteMockId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
    },
  });

  function HandleModuleChange(ModuleId: string) {
    SetSelectedModuleId(ModuleId);
    SetSelectedLevelId("");
    SetSelectedMockIds([]);
    SetSelectedStudentIds([]);
    SetPreviewMockId(null);
    SetDeleteMockId(null);
    SetArchiveMockId(null);
    SetSectionCounts({});
  }

  function ToggleMock(MockId: string) {
    SetSelectedMockIds((CurrentValue) => CurrentValue.includes(MockId) ? CurrentValue.filter((Item) => Item !== MockId) : [...CurrentValue, MockId]);
  }

  function ToggleStudent(StudentId: string) {
    SetSelectedStudentIds((CurrentValue) => CurrentValue.includes(StudentId) ? CurrentValue.filter((Item) => Item !== StudentId) : [...CurrentValue, StudentId]);
  }

  const CanGenerate = Boolean(SelectedLevelId) && SectionCountTotal >= 10 && !GenerateMutation.isPending;
  const CanAssign = Boolean(SelectedLevelId) && SelectedMockIds.length > 0 && (AssignToAll || SelectedStudentIds.length > 0) && !AssignMutation.isPending;

  const FilteredMockExams = useMemo(() => {
    const SearchValue = ManageSearch.trim().toLowerCase();
    return MockExams.filter((MockValue) => {
      const StatusValue = String(MockValue.status || "DRAFT").toUpperCase();
      if (ManageStatusFilter !== "ALL" && StatusValue !== ManageStatusFilter) return false;
      if (!SearchValue) return true;
      return `${MockValue.title} ${MockValue.mockCode} ${MockValue.levelCode || ""}`.toLowerCase().includes(SearchValue);
    });
  }, [MockExams, ManageSearch, ManageStatusFilter]);

  if (!Ready) return null;
  if (ModulesQuery.isLoading) return <AppShell title="Competition Mock Studio"><LoadingState label="Loading Competition Mock Studio..." /></AppShell>;

  return (
    <AppShell title="Competition Mock Studio">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Competition Mock Studio</h1>
          <p className="mt-3 max-w-4xl text-sm font-semibold text-slate-600 dark:text-slate-300">
            Create draft championship-style mock papers and assign one or multiple mocks directly to students by level. This remains independent from DPS Practice, Assessments, readiness, and progression.
          </p>
        </div>

        {(ModulesQuery.error || LevelsQuery.error || StudentsQuery.error || MocksQuery.error || PreviewQuery.error || SectionPlanQuery.error || GenerateMutation.error || AssignMutation.error || DeleteMutation.error || ArchiveMutation.error) && (
          <ErrorState message={apiErrorMessage(ModulesQuery.error || LevelsQuery.error || StudentsQuery.error || MocksQuery.error || PreviewQuery.error || SectionPlanQuery.error || GenerateMutation.error || AssignMutation.error || DeleteMutation.error || ArchiveMutation.error)} />
        )}

        {LastMessage && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {LastMessage}
          </div>
        )}

        <div className="math-card p-3">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => SetActiveStudioTab("CREATE")}
              aria-selected={ActiveStudioTab === "CREATE"}
              data-active={ActiveStudioTab === "CREATE" ? "true" : "false"}
              className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${ActiveStudioTab === "CREATE" ? "is-active math-admin-tab-force-selected" : ""}`}
            >
              <Plus size={16} />
              Create Mock
            </button>
            <button
              type="button"
              onClick={() => SetActiveStudioTab("MANAGE")}
              aria-selected={ActiveStudioTab === "MANAGE"}
              data-active={ActiveStudioTab === "MANAGE" ? "true" : "false"}
              className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${ActiveStudioTab === "MANAGE" ? "is-active math-admin-tab-force-selected" : ""}`}
            >
              <Target size={16} />
              Manage Mocks
            </button>
          </div>
        </div>

        {ActiveStudioTab === "CREATE" && (
          <div className="space-y-6">
              <div className="math-card p-5">
                <SectionTitle kicker="Create Mock" title="Select Module And Level" description="Mock papers are generated at level scope, independent from DPS practice and assessment structures." />
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Module
                    <select value={SelectedModuleId} onChange={(EventValue) => HandleModuleChange(EventValue.target.value)} className="math-input">
                      <option value="">Select module</option>
                      {Modules.map((ModuleValue: ModuleItem) => <option key={ModuleValue.moduleId} value={ModuleValue.moduleId}>{ModuleValue.moduleCode} · {ModuleValue.moduleName}</option>)}
                    </select>
                  </label>
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Level
                    <select value={SelectedLevelId} onChange={(EventValue) => { SetSelectedLevelId(EventValue.target.value); SetSelectedMockIds([]); SetSelectedStudentIds([]); SetPreviewMockId(null); SetDeleteMockId(null); SetArchiveMockId(null); SetSectionCounts({}); }} disabled={!SelectedModuleId || LevelsQuery.isLoading} className="math-input">
                      <option value="">Select level</option>
                      {Levels.map((LevelValue: LevelItem) => <option key={LevelValue.levelId} value={LevelValue.levelId}>{LevelValue.levelCode} · {LevelValue.levelName}</option>)}
                    </select>
                  </label>
                </div>
                {SelectedModule && SelectedLevel && <p className="mt-4 text-sm font-bold text-slate-500 dark:text-slate-400">Selected scope: {SelectedModule.moduleCode} · {SelectedLevel.levelCode}</p>}
              </div>

              <div className="math-card p-5">
                <SectionTitle kicker="Create Mock" title="Build Mock Paper" description="Create a fresh mock version with varied question combinations for the selected level." />
                <div className="mt-5 grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-[1.35fr_0.65fr]">
                    <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                      Mock Title
                      <input value={MockTitle} onChange={(EventValue) => SetMockTitle(EventValue.target.value)} placeholder="Example: MM-L1 State Championship Mock 1" className="math-input" />
                    </label>
                    <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                      Mock Code
                      <input
                        value={MockCode}
                        onChange={(EventValue) => SetMockCode(EventValue.target.value.toUpperCase().replace(/\s+/g, "-"))}
                        placeholder="Example: MM-JUN26-01"
                        maxLength={25}
                        className="math-input"
                      />
                    </label>
                  </div>
                  <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Mock Code is optional. Use A-Z, 0-9, hyphen, or underscore. If left blank, the system will create one automatically.</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                      Total Questions
                      <input value={QuestionCount} onChange={(EventValue) => SetQuestionCount(EventValue.target.value)} type="number" min={10} max={150} className="math-input" />
                    </label>
                    <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                      Duration Minutes
                      <input value={DurationMinutes} onChange={(EventValue) => SetDurationMinutes(EventValue.target.value)} type="number" min={5} max={120} className="math-input" />
                    </label>
                  </div>

                  <div className="rounded-[24px] border border-[color:var(--mp-role-border)] bg-[var(--mp-role-soft)]/60 p-3 shadow-sm dark:bg-slate-950/40">
                    <button
                      type="button"
                      disabled={!CanGenerate}
                      onClick={() => GenerateMutation.mutate()}
                      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black shadow-lg transition ${CanGenerate ? "border-[color:var(--mp-role-border-strong)] bg-[image:var(--mp-role-action-bg)] text-white shadow-blue-900/20 hover:-translate-y-0.5 hover:shadow-xl" : "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500 shadow-none dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400"}`}
                    >
                      {GenerateMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                      Generate Draft Mock
                    </button>
                  </div>

                  <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--mp-role-primary)]">Section Allocation</p>
                        <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Balance question count per competition section before generating.</p>
                      </div>
                      <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-black ${SectionCountTotal >= 10 ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"}`}>
                        {SectionCountTotal} Selected
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {SectionPlanQuery.isLoading && <LoadingState label="Loading section plan..." />}
                      {!SelectedLevelId && <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Select a level to load section allocation.</p>}
                      {SectionPlan?.sections?.map((SectionValue) => (
                        <div key={SectionValue.sectionKey} className="grid gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50 sm:grid-cols-[1fr_110px] sm:items-center">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-950 dark:text-white">{SectionValue.sectionTitle}</p>
                            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Section {SectionValue.sectionNumber}</p>
                          </div>
                          <input
                            value={SectionCounts[SectionValue.sectionKey] ?? String(SectionValue.questionCount || 0)}
                            onChange={(EventValue) => UpdateSectionCount(SectionValue.sectionKey, EventValue.target.value)}
                            type="number"
                            min={0}
                            max={150}
                            className="math-input text-center font-black"
                            aria-label={`${SectionValue.sectionTitle} question count`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              </div>
          </div>
        )}

        {ActiveStudioTab === "MANAGE" && (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
              <div className="math-card p-5">
                <SectionTitle kicker="Manage Mocks" title="Mock Paper Library" description="View, preview, assign, archive, or delete competition mock papers from one focused control panel." />

                <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_190px_190px]">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={ManageSearch} onChange={(EventValue) => SetManageSearch(EventValue.target.value)} placeholder="Search mocks by title, code, or level" className="math-input pl-10" />
                  </div>
                  <select value={ManageStatusFilter} onChange={(EventValue) => SetManageStatusFilter(EventValue.target.value)} className="math-input">
                    <option value="ALL">All Statuses</option>
                    <option value="DRAFT">Draft</option>
                    <option value="ASSIGNED">Assigned</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                  <select value={SelectedLevelId} onChange={(EventValue) => { SetSelectedLevelId(EventValue.target.value); SetSelectedMockIds([]); SetSelectedStudentIds([]); SetPreviewMockId(null); }} disabled={!SelectedModuleId || LevelsQuery.isLoading} className="math-input">
                    <option value="">All Levels</option>
                    {Levels.map((LevelValue: LevelItem) => <option key={LevelValue.levelId} value={LevelValue.levelId}>{LevelValue.levelCode}</option>)}
                  </select>
                </div>

                <div className="mt-5 space-y-3">
                  {MocksQuery.isLoading && <LoadingState label="Loading mock papers..." />}
                  {!MocksQuery.isLoading && FilteredMockExams.length === 0 && <EmptyState title="No mock papers found" description="Create a draft mock or adjust the search/filter values." />}
                  {FilteredMockExams.map((MockValue: CompetitionMockExamSummary) => {
                    const IsArchived = String(MockValue.status || "").toUpperCase() === "ARCHIVED";
                    return (
                      <article key={MockValue.mockExamId} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <label className={`flex min-w-0 flex-1 items-start gap-3 ${IsArchived ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
                            <input type="checkbox" disabled={IsArchived} checked={SelectedMockIds.includes(MockValue.mockExamId)} onChange={() => ToggleMock(MockValue.mockExamId)} className="mt-1 h-4 w-4 accent-[var(--mp-role-primary)]" />
                            <span className="min-w-0">
                              <span className="block text-sm font-black text-slate-950 dark:text-white">{MockValue.title}</span>
                              <span className="mt-1 block text-xs font-bold text-slate-500 dark:text-slate-400">{MockValue.mockCode} · {MockValue.levelCode || "-"} · {MockValue.totalQuestions} Questions · {FormatDuration(MockValue.durationSeconds)}</span>
                            </span>
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusChip status={MockValue.status} />
                            <Link href={`/admin/competition/mock-studio/${MockValue.mockExamId}`} className={AdminRowActionButtonClass}>
                              <Eye size={14} className="mr-1 inline" /> View
                            </Link>
                            <button disabled={IsArchived} onClick={() => ToggleMock(MockValue.mockExamId)} className={AdminRowActionButtonClass}>
                              <Send size={14} className="mr-1 inline" /> Assign
                            </button>
                            <button disabled={IsArchived} onClick={() => SetArchiveMockId(MockValue.mockExamId)} className={AdminRowActionButtonClass}>
                              <Archive size={14} className="mr-1 inline" /> Archive
                            </button>
                            <button onClick={() => SetDeleteMockId(MockValue.mockExamId)} className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-600 hover:text-white dark:border-rose-900/60 dark:text-rose-200 dark:hover:bg-rose-700">
                              <Trash2 size={14} className="mr-1 inline" /> Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>

              <div className="math-card p-5">
                <SectionTitle kicker="Assign" title="Assign Selected Mock Exams" description="Admin can assign selected mocks directly, without involving the teacher." />
                <div className="mt-5 space-y-5">
                  <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                    <input type="checkbox" checked={AssignToAll} onChange={(EventValue) => SetAssignToAll(EventValue.target.checked)} className="h-4 w-4 accent-[var(--mp-role-primary)]" />
                    Assign selected mock exam(s) to all active students in this level
                  </label>

                  {!AssignToAll && (
                    <div className="space-y-3">
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input value={StudentSearch} onChange={(EventValue) => SetStudentSearch(EventValue.target.value)} placeholder="Search student by name or code" className="math-input pl-10" />
                      </div>
                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                        {LevelStudents.map((StudentValue: AdminStudent) => (
                          <label key={StudentValue.studentId} className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-200">
                            <span>
                              <span className="font-black text-slate-950 dark:text-white">{StudentValue.studentCode}</span> · {StudentValue.studentName}
                            </span>
                            <input type="checkbox" checked={SelectedStudentIds.includes(StudentValue.studentId)} onChange={() => ToggleStudent(StudentValue.studentId)} className="h-4 w-4 accent-[var(--mp-role-primary)]" />
                          </label>
                        ))}
                        {LevelStudents.length === 0 && <EmptyState title="No students found" description="No active students match the selected level/search." />}
                      </div>
                    </div>
                  )}

                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Optional Instructions
                    <textarea value={AssignmentInstructions} onChange={(EventValue) => SetAssignmentInstructions(EventValue.target.value)} rows={3} placeholder="Example: Complete this mock under competition timing without taking breaks." className="math-input min-h-24" />
                  </label>

                  <button
                    type="button"
                    disabled={!CanAssign}
                    onClick={() => AssignMutation.mutate()}
                    className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border px-5 py-3 text-sm font-black shadow-lg transition ${CanAssign ? "border-[color:var(--mp-role-border-strong)] bg-[image:var(--mp-role-action-bg)] text-white shadow-blue-900/20 hover:-translate-y-0.5 hover:shadow-xl" : "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-500 shadow-none dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-400"}`}
                  >
                    {AssignMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    Assign Selected Mock Exams
                  </button>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <MetricCard icon={<FilePenLine size={16} />} label="Selected Mocks" value={SelectedMockIds.length} />
                    <MetricCard icon={<UsersRound size={16} />} label="Level Students" value={LevelStudents.length} />
                    <MetricCard icon={<CheckCircle2 size={16} />} label="Selected Students" value={AssignToAll ? LevelStudents.length : SelectedStudentIds.length} />
                  </div>
                </div>
              </div>
          </div>
        )}

        {ArchiveMockId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-[2rem] border border-amber-200 bg-white p-6 shadow-2xl dark:border-amber-900/60 dark:bg-slate-950">
              <div className="flex items-start gap-4">
                <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200">
                  <Archive size={22} />
                </div>
                <div>
                  <p className="math-kicker text-amber-600 dark:text-amber-300">Archive Mock Exam</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Archive this mock?</h2>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-600 dark:text-slate-300">
                    This keeps the mock and its history available for management, but removes it from normal assignment selection. Permanent delete remains available separately.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => SetArchiveMockId(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                  Cancel
                </button>
                <button type="button" disabled={ArchiveMutation.isPending} onClick={() => ArchiveMutation.mutate(ArchiveMockId)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-amber-900/20 hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {ArchiveMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Archive size={18} />}
                  Archive Mock
                </button>
              </div>
            </div>
          </div>
        )}

        {DeleteMockId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-8 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-[2rem] border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/60 dark:bg-slate-950">
              <div className="flex items-start gap-4">
                <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                  <AlertTriangle size={22} />
                </div>
                <div>
                  <p className="math-kicker text-rose-600 dark:text-rose-300">Delete Mock Exam</p>
                  <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Permanently delete this mock?</h2>
                  <p className="mt-3 text-sm font-bold leading-6 text-slate-600 dark:text-slate-300">
                    This will permanently delete the mock paper, questions, options, assignments, attempts, answers, and result summaries linked to this mock. This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => SetDeleteMockId(null)} className="rounded-2xl border border-slate-200 px-5 py-3 text-sm font-black text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                  Cancel
                </button>
                <button type="button" disabled={DeleteMutation.isPending} onClick={() => DeleteMutation.mutate(DeleteMockId)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-900/20 hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                  {DeleteMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  Delete Permanently
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </AppShell>
  );
}

function NormalisePreviewOperands(Operands: unknown[] | null | undefined): Array<number | string> {
  return (Operands || []).map((OperandValue) => {
    if (typeof OperandValue === "number" || typeof OperandValue === "string") return OperandValue;
    if (OperandValue === null || OperandValue === undefined) return "";
    return String(OperandValue);
  });
}


function IsMasterModuleMock(ModuleCode: string | null | undefined) {
  return String(ModuleCode || "").trim().toUpperCase().includes("MM");
}

function QuestionSearchText(QuestionValue: CompetitionMockExamDetail["questions"][number]) {
  return [
    QuestionValue.sectionTitle,
    QuestionValue.conceptTag,
    QuestionValue.conceptFamily,
    QuestionValue.displayType,
    QuestionValue.questionText,
  ].filter(Boolean).join(" ").toLowerCase();
}

function IsMmExpressionQuestion(QuestionValue: CompetitionMockExamDetail["questions"][number], ExamValue: CompetitionMockExamDetail) {
  if (!IsMasterModuleMock(ExamValue.moduleCode)) return false;
  const TextValue = QuestionSearchText(QuestionValue);
  return Number(QuestionValue.sectionNumber) === 8 || TextValue.includes("bodmas") || TextValue.includes("percentage") || TextValue.includes("percent");
}

function IsMmFinancialQuestion(QuestionValue: CompetitionMockExamDetail["questions"][number], ExamValue: CompetitionMockExamDetail) {
  if (!IsMasterModuleMock(ExamValue.moduleCode)) return false;
  const TextValue = QuestionSearchText(QuestionValue);
  return Number(QuestionValue.sectionNumber) === 9 || TextValue.includes("profit") || TextValue.includes("loss") || TextValue.includes("interest") || TextValue.includes("selling price") || TextValue.includes("cost price");
}

function IsMmPositionalQuestion(QuestionValue: CompetitionMockExamDetail["questions"][number], ExamValue: CompetitionMockExamDetail) {
  if (!IsMasterModuleMock(ExamValue.moduleCode)) return false;
  const TextValue = QuestionSearchText(QuestionValue);
  return Number(QuestionValue.sectionNumber) === 5 || TextValue.includes("position") || TextValue.includes("placement");
}

function HasMultiplicationPlacementShape(QuestionValue: CompetitionMockExamDetail["questions"][number]) {
  const TextValue = QuestionSearchText(QuestionValue);
  const Operators = (QuestionValue.operators || []).map((OperatorValue) => String(OperatorValue || "").toLowerCase());
  const Operands = NormalisePreviewOperands(QuestionValue.operands);

  return (
    TextValue.includes("decimal multiplication answer position") ||
    TextValue.includes("answer position") ||
    /[×x*]/.test(String(QuestionValue.questionText || "")) ||
    Operators.some((OperatorValue) => OperatorValue === "×" || OperatorValue === "x" || OperatorValue === "*") ||
    (Operands.length >= 2 && TextValue.includes("multiplication"))
  );
}

function HasWriteNumberPositionShape(QuestionValue: CompetitionMockExamDetail["questions"][number]) {
  const TextValue = QuestionSearchText(QuestionValue);
  return TextValue.includes("write") && TextValue.includes("given position");
}


function GetCleanMmSectionName(QuestionValue: CompetitionMockExamDetail["questions"][number]): string {
  const SectionNumber = Number(QuestionValue.sectionNumber || 0);
  const RawTitle = String(QuestionValue.sectionTitle || QuestionValue.conceptTag || "").trim();
  if (!RawTitle) return SectionNumber ? `Section ${SectionNumber}` : "Section";
  const PrefixPattern = new RegExp(`^section\\s*${SectionNumber}\\s*[-–—:]\\s*`, "i");
  const CleanTitle = RawTitle.replace(PrefixPattern, "").trim();
  return CleanTitle || RawTitle;
}

function GetMmQuestionConceptDisplayTitle(QuestionValue: CompetitionMockExamDetail["questions"][number], ExamValue: CompetitionMockExamDetail) {
  if (!IsMasterModuleMock(ExamValue.moduleCode)) return QuestionValue.conceptTag || QuestionValue.conceptFamily || "Concept";
  if (Number(QuestionValue.sectionNumber) === 5 || IsMmPositionalQuestion(QuestionValue, ExamValue)) {
    if (HasWriteNumberPositionShape(QuestionValue)) return "Write Number From Given Position";
    if (HasMultiplicationPlacementShape(QuestionValue)) return "Decimal Multiplication Answer Position";
    return "Find Position of the First Natural Number";
  }
  return QuestionValue.conceptTag || QuestionValue.conceptFamily || "Concept";
}

function GetMmPositionalPromptTitle(QuestionValue: CompetitionMockExamDetail["questions"][number]) {
  if (HasWriteNumberPositionShape(QuestionValue)) return null;
  if (HasMultiplicationPlacementShape(QuestionValue)) return "DECIMAL MULTIPLICATION ANSWER POSITION";
  return "FIND POSITION OF FIRST NATURAL NUMBER";
}

function GetMockDisplayType(QuestionValue: CompetitionMockExamDetail["questions"][number], ExamValue: CompetitionMockExamDetail) {
  if (IsMmFinancialQuestion(QuestionValue, ExamValue)) return "FINANCIAL_TABLE";
  if (IsMmExpressionQuestion(QuestionValue, ExamValue)) return "EXPRESSION_WORKSHEET";
  return QuestionValue.displayType;
}

function FormatMockExpressionValue(Value: number | string) {
  if (typeof Value === "number") {
    if (Number.isInteger(Value)) return String(Value);
    return String(Number(Value.toFixed(8))).replace(/\.0+$/, "");
  }
  return String(Value);
}

function BuildMockExpression(Operands: Array<number | string>, Operators: string[]) {
  if (!Operands.length) return "?";
  return Operands.map((OperandValue, IndexValue) => {
    const ValueText = FormatMockExpressionValue(OperandValue);
    if (IndexValue === 0) return ValueText;
    const OperatorText = String(Operators[IndexValue] || Operators[IndexValue - 1] || "+").trim();
    if (OperatorText === "+%") return `+ ${ValueText}%`;
    if (OperatorText === "-%") return `− ${ValueText}%`;
    if (OperatorText === "×%") return `× ${ValueText}%`;
    if (OperatorText === "%") return `% ${ValueText}`;
    return `${OperatorText || "+"} ${ValueText}`;
  }).join(" ");
}

function RenderMockExpressionParts(ExpressionValue: string) {
  return ExpressionValue.split(/([?？])/g).map((PartValue, IndexValue) => (
    PartValue === "?" || PartValue === "？"
      ? <span key={`mock-question-mark-${IndexValue}`} className="text-blue-700 dark:text-cyan-300">?</span>
      : <span key={`mock-expression-part-${IndexValue}`}>{PartValue}</span>
  ));
}

function MockQuestionRenderer({ question, exam, compact = false }: { question: CompetitionMockExamDetail["questions"][number]; exam: CompetitionMockExamDetail; compact?: boolean }) {
  const Operands = NormalisePreviewOperands(question.operands);
  const Operators = question.operators || [];
  const PositionalPromptTitle = IsMmPositionalQuestion(question, exam) ? GetMmPositionalPromptTitle(question) : null;

  const RenderedQuestion = IsMmExpressionQuestion(question, exam) ? (() => {
    const ExpressionValue = question.questionText?.trim() || BuildMockExpression(Operands, Operators);
    const HasPrompt = /[?？]/.test(ExpressionValue);
    return (
      <div className="mx-auto flex w-full justify-center rounded-[20px] bg-white px-4 py-4 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-6">
        <div className={`${compact ? "text-[16px] sm:text-[20px]" : "text-[24px] sm:text-[30px]"} max-w-full whitespace-normal break-words text-center font-mono font-black leading-snug tracking-tight`}>
          {RenderMockExpressionParts(ExpressionValue)}
          {!HasPrompt ? <span className="ml-2 text-blue-700 dark:text-cyan-300">= ?</span> : null}
        </div>
      </div>
    );
  })() : (
    <MathQuestionDisplay
      operands={Operands}
      operators={Operators}
      displayType={GetMockDisplayType(question, exam)}
      questionText={question.questionText}
    />
  );

  if (!PositionalPromptTitle) return RenderedQuestion;

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-[22px] border border-slate-200 bg-white text-center shadow-inner dark:border-slate-700 dark:bg-slate-950/70">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">{PositionalPromptTitle}</p>
      </div>
      <div className="px-4 py-5">{RenderedQuestion}</div>
    </div>
  );
}

function GroupMockQuestionsBySection(Questions: CompetitionMockExamDetail["questions"]) {
  const SectionMap = new Map<number, { sectionNumber: number; sectionTitle: string; questions: CompetitionMockExamDetail["questions"] }>();

  Questions.forEach((QuestionValue) => {
    const SectionNumber = Number(QuestionValue.sectionNumber || 1);
    const ExistingSection = SectionMap.get(SectionNumber);
    if (ExistingSection) {
      ExistingSection.questions.push(QuestionValue);
      return;
    }

    SectionMap.set(SectionNumber, {
      sectionNumber: SectionNumber,
      sectionTitle: QuestionValue.sectionTitle || QuestionValue.conceptTag || `Section ${SectionNumber}`,
      questions: [QuestionValue],
    });
  });

  return Array.from(SectionMap.values()).sort((LeftValue, RightValue) => LeftValue.sectionNumber - RightValue.sectionNumber);
}

function MockPreview({ exam }: { exam: CompetitionMockExamDetail }) {
  const Sections = GroupMockQuestionsBySection(exam.questions || []);

  return (
    <div className="space-y-5">
      <div className="rounded-[28px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/50 to-indigo-50 p-5 shadow-sm dark:border-slate-800 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">{exam.title}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">
              {exam.totalQuestions} Questions · {FormatDuration(exam.durationSeconds)} · {exam.totalMarks} Marks
            </p>
          </div>
          <div className="inline-flex w-fit rounded-full border border-blue-100 bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-200">
            Section-Locked Preview
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {Sections.map((SectionValue) => {
          const SampleQuestions = SectionValue.questions.slice(0, 2);
          return (
            <section key={SectionValue.sectionNumber} className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
              <div className="flex flex-col gap-2 bg-slate-50 px-5 py-4 dark:bg-slate-900/60 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-blue-700 dark:text-cyan-300">Section {SectionValue.sectionNumber}</p>
                  <h4 className="mt-1 text-base font-black text-slate-950 dark:text-white">{SectionValue.sectionTitle}</h4>
                </div>
                <span className="inline-flex w-fit rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">
                  {SectionValue.questions.length} Questions
                </span>
              </div>

              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {SampleQuestions.map((QuestionValue) => (
                  <article key={QuestionValue.mockQuestionId} className={`grid gap-4 px-5 py-4 ${IsMmExpressionQuestion(QuestionValue, exam) || IsMmFinancialQuestion(QuestionValue, exam) ? "xl:grid-cols-1" : "xl:grid-cols-[280px_1fr] xl:items-center"}`}>
                    <div className="rounded-[22px] border border-blue-100 bg-slate-50 px-4 py-5 dark:border-slate-800 dark:bg-slate-900/40">
                      <MockQuestionRenderer question={QuestionValue} exam={exam} compact />
                    </div>

                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">Section {QuestionValue.sectionNumber}</span>
                        <span className={`rounded-full px-3 py-1 text-xs font-black ${IsMasterModuleMock(exam.moduleCode) ? "math-admin-studio-chip" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{GetCleanMmSectionName(QuestionValue)}</span>
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">Answer: {QuestionValue.correctAnswer}</span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {(QuestionValue.options || []).map((OptionValue) => (
                          <div
                            key={OptionValue.optionId || `${QuestionValue.mockQuestionId}-${OptionValue.label}`}
                            className={`flex min-h-[44px] items-center gap-3 rounded-2xl border px-3 py-2 text-sm font-black ${OptionValue.isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200" : "border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200"}`}
                          >
                            <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-black ${OptionValue.isCorrect ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>
                              {OptionValue.label}
                            </span>
                            <span className="break-words">{OptionValue.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {SectionValue.questions.length > SampleQuestions.length ? (
                <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-xs font-black text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                  Showing {SampleQuestions.length} clean samples from this section. Open the full-page View for all {SectionValue.questions.length} questions.
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex items-center gap-2 text-[var(--mp-role-primary)]">{icon}<span className="text-xs font-black uppercase tracking-[0.2em]">{label}</span></div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
