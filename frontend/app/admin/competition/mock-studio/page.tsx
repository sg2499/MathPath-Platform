"use client";

import { AppShell } from "@/components/common/AppShell";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  archiveCompetitionMockExam,
  assignCompetitionMockExams,
  deleteCompetitionMockExam,
  generateCompetitionMockDraft,
  getCompetitionMockSectionPlan,
  getAdminStudents,
  getLevels,
  getModules,
  listCompetitionMockExams,
  type CompetitionMockExamSummary,
} from "@/lib/api/admin";
import type { LevelItem, ModuleItem } from "@/types/curriculum";
import type { AdminStudent } from "@/types/student";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, CheckCircle2, Eye, FilePenLine, Loader2, Plus, Search, Send, ShieldCheck, Target, Trash2, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const DefaultQuestionCount = 40;
const MmDefaultQuestionCount = 100;
const ImDefaultQuestionCount = 100;
const DefaultDurationMinutes = 20;
const MmDefaultDurationMinutes = 60;
const ImDefaultDurationMinutes = 30;

// 2026-07-19 (Shailesh, repo cleanup): only MM and IM have a real,
// admin-curated competition-mock section structure (MM_COMPETITION_LEVEL_REGISTRY /
// IM_COMPETITION_LEVEL_REGISTRY on the backend). Any other module -- YLM today --
// silently fell through to a generic, unlocked per-DPS structure with none of
// MM/IM's section design, which reads as a real gap rather than an intentional
// mock format. Gated out of Create Mock here until it's actually built; existing
// Manage/Assign flows for already-created mocks are untouched.
const CompetitionMockSupportedModuleCodes = new Set(["MM", "IM"]);

const AdminRowActionButtonClass = "inline-flex items-center justify-center gap-1.5 rounded-full border border-[color:var(--mp-role-border)] bg-white px-3 py-1.5 text-xs font-black text-[color:var(--mp-role-primary)] shadow-sm transition duration-200 hover:-translate-y-px hover:border-[color:var(--mp-role-border-strong)] hover:bg-[image:var(--mp-role-action-bg)] hover:text-white hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--mp-role-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:border-[color:var(--mp-role-border)] disabled:hover:bg-white disabled:hover:text-[color:var(--mp-role-primary)] disabled:hover:shadow-sm dark:bg-slate-950/60 dark:text-blue-100 dark:hover:border-[color:var(--mp-role-border-strong)] dark:hover:bg-[image:var(--mp-role-action-bg)] dark:hover:text-white dark:disabled:hover:bg-slate-950/60 dark:disabled:hover:text-blue-100";

function FormatDuration(SecondsValue: number | null | undefined) {
  const SafeSeconds = Math.max(0, Number(SecondsValue || 0));
  const Minutes = Math.floor(SafeSeconds / 60);
  const Seconds = SafeSeconds % 60;
  if (Minutes && Seconds) {
    return `${Minutes} Min${Minutes !== 1 ? "s" : ""} ${Seconds} Sec${Seconds !== 1 ? "s" : ""}`;
  }
  if (Minutes) {
    return `${Minutes} Min${Minutes !== 1 ? "s" : ""}`;
  }
  return `${Seconds} Sec${Seconds !== 1 ? "s" : ""}`;
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
  const [DeleteMockId, SetDeleteMockId] = useState<string | null>(null);
  const [ArchiveMockId, SetArchiveMockId] = useState<string | null>(null);
  const [ActiveStudioTab, SetActiveStudioTab] = useState<"CREATE" | "MANAGE">("CREATE");
  const [ManageSearch, SetManageSearch] = useState("");
  const [ManageStatusFilter, SetManageStatusFilter] = useState("ALL");
  // ManageLevelFilterId is deliberately independent from SelectedLevelId
  // (Create Mock's own level picker) -- 2026-07-19, Shailesh: they used to
  // share one state pair, which meant this "All Levels" filter was disabled
  // whenever Create Mock had no module chosen (the normal case on landing
  // directly on Manage Mocks), and picking a level here silently changed
  // Create Mock's selection too. See ManageLevelsQuery below for where its
  // options come from.
  const [ManageLevelFilterId, SetManageLevelFilterId] = useState("");
  const [SectionCounts, SetSectionCounts] = useState<Record<string, string>>({});
  const [LastMessage, SetLastMessage] = useState<string | null>(null);

  const ModulesQuery = useQuery({ queryKey: ["admin", "competition", "modules"], queryFn: getModules, enabled: Ready });
  const Modules = ModulesQuery.data || [];
  const LevelsQuery = useQuery({ queryKey: ["admin", "competition", "levels", SelectedModuleId], queryFn: () => getLevels(SelectedModuleId), enabled: Ready && Boolean(SelectedModuleId) });
  const StudentsQuery = useQuery({ queryKey: ["admin", "competition", "students"], queryFn: getAdminStudents, enabled: Ready });
  const MocksQuery = useQuery({ queryKey: ["admin", "competition", "mocks", ManageLevelFilterId], queryFn: () => listCompetitionMockExams(ManageLevelFilterId || undefined), enabled: Ready });
  const SectionPlanQuery = useQuery({ queryKey: ["admin", "competition", "section-plan", SelectedLevelId, QuestionCount], queryFn: () => getCompetitionMockSectionPlan(SelectedLevelId, Number(QuestionCount) || DefaultQuestionCount), enabled: Ready && Boolean(SelectedLevelId) });
  // Manage Mocks' level filter spans every competition-mock-supported module
  // at once (unlike Create Mock's Level select, which is scoped to whichever
  // single module is chosen there) -- so it fetches each supported module's
  // levels in parallel and flattens them into one "MM · L1 / IM · L4 ..." list.
  const SupportedModuleIdsKey = Modules.filter((ModuleValue: ModuleItem) => CompetitionMockSupportedModuleCodes.has(ModuleValue.moduleCode)).map((ModuleValue: ModuleItem) => ModuleValue.moduleId).join(",");
  const ManageLevelsQuery = useQuery({
    queryKey: ["admin", "competition", "manage-levels", SupportedModuleIdsKey],
    queryFn: async () => {
      const SupportedModules = Modules.filter((ModuleValue: ModuleItem) => CompetitionMockSupportedModuleCodes.has(ModuleValue.moduleCode));
      const LevelLists = await Promise.all(SupportedModules.map((ModuleValue: ModuleItem) => getLevels(ModuleValue.moduleId).then((LevelListValue) => LevelListValue.map((LevelValue) => ({ ...LevelValue, moduleCode: ModuleValue.moduleCode })))));
      return LevelLists.flat();
    },
    enabled: Ready && Modules.length > 0,
  });

  const Levels = LevelsQuery.data || [];
  const ManageLevels = ManageLevelsQuery.data || [];
  const Students = StudentsQuery.data || [];
  const MockExams = MocksQuery.data || [];
  const SectionPlan = SectionPlanQuery.data || null;

  // SectionCounts only ever holds keys the admin has actually edited (typing
  // a number, including 0 to omit a section) -- it is deliberately NOT
  // pre-seeded with every section's default value. A section absent from
  // this map is "floating": LiveSections (below) keeps it auto-split with
  // whatever total-questions budget is left after the admin's explicit
  // edits, live, as those edits change -- that's what makes the panel
  // renumber and redistribute in real time instead of only after a
  // round-trip. Switching level (or the section plan reloading for any
  // other reason, e.g. a totally different level's section list coming in)
  // clears every touch, since a fresh level's sections start with nothing
  // omitted.
  useEffect(() => {
    SetSectionCounts({});
  }, [SectionPlan?.levelId]);

  const SelectedLevel = Levels.find((LevelValue) => LevelValue.levelId === SelectedLevelId) || null;
  const SelectedModule = Modules.find((ModuleValue) => ModuleValue.moduleId === SelectedModuleId) || null;
  const IsSelectedMasterModule = Boolean(SelectedModule && (SelectedModule.moduleCode?.toUpperCase() === "MM" || SelectedModule.moduleName?.toLowerCase().includes("master module")));
  const IsSelectedIntermediateModule = Boolean(SelectedModule && (SelectedModule.moduleCode?.toUpperCase() === "IM" || SelectedModule.moduleName?.toLowerCase().includes("intermediate module")));

  useEffect(() => {
    if (IsSelectedMasterModule) {
      SetQuestionCount((CurrentValue) => CurrentValue === String(DefaultQuestionCount) ? String(MmDefaultQuestionCount) : CurrentValue);
      SetDurationMinutes((CurrentValue) => CurrentValue === String(DefaultDurationMinutes) ? String(MmDefaultDurationMinutes) : CurrentValue);
      return;
    }
    if (IsSelectedIntermediateModule) {
      SetQuestionCount((CurrentValue) => CurrentValue === String(DefaultQuestionCount) ? String(ImDefaultQuestionCount) : CurrentValue);
      SetDurationMinutes((CurrentValue) => CurrentValue === String(DefaultDurationMinutes) ? String(ImDefaultDurationMinutes) : CurrentValue);
    }
  }, [IsSelectedMasterModule, IsSelectedIntermediateModule]);


  // LiveSections mirrors the backend's _RedistributeSectionCounts +
  // _DenseSectionNumbering pair (competition_mock_generation_service.py) so
  // the admin sees the exact redistribution and renumbering that will
  // actually happen at generation time, live, with no round-trip:
  //   - a section is "touched" if the admin has typed something into its
  //     box (present in SectionCounts), including 0 to omit it -- touched
  //     positive values are always honored exactly, never silently shrunk.
  //   - every other section is "floating": the leftover budget
  //     (Target - PinnedSum) is split evenly across all floating sections,
  //     with the remainder handed out one-by-one in definition order --
  //     same rule the backend uses for its default (no-override) split.
  //   - liveNumber is assigned densely (1, 2, 3...) in definition order,
  //     skipping any section whose liveCount is 0, exactly matching
  //     _DenseSectionNumbering.
  const LiveSections = useMemo(() => {
    const Sections = SectionPlan?.sections || [];
    const Target = Math.max(0, Math.floor(Number(QuestionCount) || 0)) || DefaultQuestionCount;

    let PinnedSum = 0;
    let FloatingCount = 0;
    Sections.forEach((SectionValue) => {
      const Touched = SectionCounts[SectionValue.sectionKey];
      if (Touched !== undefined) {
        PinnedSum += Math.max(0, Math.floor(Number(Touched) || 0));
      } else {
        FloatingCount += 1;
      }
    });

    const FloatingBudget = Math.max(0, Target - PinnedSum);
    const FloatingBase = FloatingCount > 0 ? Math.floor(FloatingBudget / FloatingCount) : 0;
    const FloatingRemainder = FloatingCount > 0 ? FloatingBudget % FloatingCount : 0;

    let FloatingIndex = 0;
    let DenseNumber = 0;
    return Sections.map((SectionValue) => {
      const Touched = SectionCounts[SectionValue.sectionKey];
      let LiveCount: number;
      if (Touched !== undefined) {
        LiveCount = Math.max(0, Math.floor(Number(Touched) || 0));
      } else {
        LiveCount = FloatingBase + (FloatingIndex < FloatingRemainder ? 1 : 0);
        FloatingIndex += 1;
      }
      const LiveNumber = LiveCount > 0 ? (DenseNumber += 1) : null;
      return { ...SectionValue, liveCount: LiveCount, liveNumber: LiveNumber };
    });
  }, [SectionPlan, SectionCounts, QuestionCount]);

  const CleanSectionCounts = useMemo(() => {
    const Counts: Record<string, number> = {};
    LiveSections.forEach((SectionValue) => {
      if (SectionValue.liveCount > 0) Counts[SectionValue.sectionKey] = SectionValue.liveCount;
    });
    return Counts;
  }, [LiveSections]);

  const SectionCountTotal = useMemo(() => LiveSections.reduce((Total, SectionValue) => Total + SectionValue.liveCount, 0), [LiveSections]);

  function UpdateSectionCount(SectionKey: string, Value: string) {
    SetSectionCounts((CurrentValue) => ({ ...CurrentValue, [SectionKey]: Value }));
  }

  const SelectedMockExams = useMemo(
    () => MockExams.filter((MockValue) => SelectedMockIds.includes(MockValue.mockExamId)),
    [MockExams, SelectedMockIds],
  );

  const AssignmentScope = useMemo(() => {
    if (!SelectedMockExams.length) return null;
    const FirstMock = SelectedMockExams[0];
    const SameScope = SelectedMockExams.every((MockValue) => (
      MockValue.moduleId === FirstMock.moduleId && MockValue.levelId === FirstMock.levelId
    ));
    if (!SameScope) return null;
    return {
      moduleId: FirstMock.moduleId,
      moduleCode: FirstMock.moduleCode,
      levelId: FirstMock.levelId,
      levelCode: FirstMock.levelCode,
    };
  }, [SelectedMockExams]);

  const LevelStudents = useMemo(() => {
    const SearchValue = StudentSearch.trim().toLowerCase();
    return Students.filter((StudentValue) => (
      StudentValue.isActive
      && Boolean(AssignmentScope)
      && StudentValue.currentModuleId === AssignmentScope?.moduleId
      && StudentValue.currentLevelId === AssignmentScope?.levelId
    )).filter((StudentValue) => {
      if (!SearchValue) return true;
      return `${StudentValue.studentCode} ${StudentValue.studentName} ${StudentValue.currentModuleCode || ""} ${StudentValue.currentLevelCode || ""}`.toLowerCase().includes(SearchValue);
    });
  }, [Students, AssignmentScope, StudentSearch]);

  useEffect(() => {
    const EligibleStudentIds = new Set(LevelStudents.map((StudentValue) => StudentValue.studentId));
    SetSelectedStudentIds((CurrentValue) => CurrentValue.filter((StudentId) => EligibleStudentIds.has(StudentId)));
  }, [LevelStudents]);

  const GenerateMutation = useMutation({
    mutationFn: () => generateCompetitionMockDraft({
      levelId: SelectedLevelId,
      title: MockTitle.trim() || undefined,
      mockCode: MockCode.trim() || undefined,
      // The "Total Questions" field is the real target the admin set; it
      // must win outright, not just when the section boxes happen to sum
      // to zero. LiveSections/SectionCountTotal always redistributes to
      // equal this same target anyway (see LiveSections above), so in
      // practice the two only differ transiently before a re-render --
      // but QuestionCount is the source of truth, never the box sum.
      totalQuestions: Number(QuestionCount) || DefaultQuestionCount,
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
      levelId: AssignmentScope?.levelId || "",
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
      SetArchiveMockId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
    },
  });

  const DeleteMutation = useMutation({
    mutationFn: (MockExamId: string) => deleteCompetitionMockExam(MockExamId),
    onSuccess: (ResultValue) => {
      SetLastMessage(ResultValue.message || "Competition mock exam deleted.");
      SetSelectedMockIds((CurrentValue) => CurrentValue.filter((MockId) => MockId !== DeleteMockId));
      SetDeleteMockId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
    },
  });

  function HandleModuleChange(ModuleId: string) {
    SetSelectedModuleId(ModuleId);
    SetSelectedLevelId("");
    SetSelectedMockIds([]);
    SetSelectedStudentIds([]);
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
  const CanAssign = Boolean(AssignmentScope) && SelectedMockIds.length > 0 && (AssignToAll || SelectedStudentIds.length > 0) && !AssignMutation.isPending;

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
          <p className="mt-3 max-w-none text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            Create draft championship-style mock papers and assign one or multiple mocks directly to students by level. This remains independent from DPS Practice, Assessments, readiness, and progression.
          </p>
        </div>

        {(ModulesQuery.error || LevelsQuery.error || StudentsQuery.error || MocksQuery.error || ManageLevelsQuery.error || SectionPlanQuery.error || GenerateMutation.error || AssignMutation.error || DeleteMutation.error || ArchiveMutation.error) && (
          <ErrorState message={apiErrorMessage(ModulesQuery.error || LevelsQuery.error || StudentsQuery.error || MocksQuery.error || ManageLevelsQuery.error || SectionPlanQuery.error || GenerateMutation.error || AssignMutation.error || DeleteMutation.error || ArchiveMutation.error)} />
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
                      <option value="">Select Module</option>
                      {Modules
                        .filter((ModuleValue: ModuleItem) => CompetitionMockSupportedModuleCodes.has(ModuleValue.moduleCode))
                        .map((ModuleValue: ModuleItem) => <option key={ModuleValue.moduleId} value={ModuleValue.moduleId}>{ModuleValue.moduleCode} · {ModuleValue.moduleName}</option>)}
                    </select>
                    <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Only modules with a real competition-mock section design are selectable here.</span>
                  </label>
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Level
                    <select value={SelectedLevelId} onChange={(EventValue) => { SetSelectedLevelId(EventValue.target.value); SetSelectedMockIds([]); SetSelectedStudentIds([]); SetDeleteMockId(null); SetArchiveMockId(null); SetSectionCounts({}); }} disabled={!SelectedModuleId || LevelsQuery.isLoading} className="math-input">
                      <option value="">Select Level</option>
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
                      <input value={QuestionCount} onChange={(EventValue) => SetQuestionCount(EventValue.target.value)} type="number" min={10} max={300} className="math-input" />
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
                      {LiveSections.map((SectionValue) => {
                        const IsOmitted = SectionValue.liveCount === 0;
                        return (
                          <div key={SectionValue.sectionKey} className={`grid gap-3 rounded-2xl border px-4 py-3 sm:grid-cols-[1fr_110px] sm:items-center ${IsOmitted ? "border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/30" : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/50"}`}>
                            <div className="min-w-0">
                              <p className={`text-sm font-black ${IsOmitted ? "text-slate-400 line-through dark:text-slate-600" : "text-slate-950 dark:text-white"}`}>{SectionValue.sectionTitle}</p>
                              <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                                {IsOmitted ? "Omitted — questions redistributed to remaining sections" : `Section ${SectionValue.liveNumber}`}
                              </p>
                            </div>
                            <input
                              value={SectionCounts[SectionValue.sectionKey] ?? String(SectionValue.liveCount)}
                              onChange={(EventValue) => UpdateSectionCount(SectionValue.sectionKey, EventValue.target.value)}
                              type="number"
                              min={0}
                              max={300}
                              className="math-input text-center font-black"
                              aria-label={`${SectionValue.sectionTitle} question count`}
                            />
                          </div>
                        );
                      })}
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
                  <select value={ManageLevelFilterId} onChange={(EventValue) => { SetManageLevelFilterId(EventValue.target.value); SetSelectedMockIds([]); SetSelectedStudentIds([]); }} disabled={ManageLevelsQuery.isLoading} className="math-input">
                    <option value="">All Levels</option>
                    {ManageLevels.map((LevelValue) => <option key={LevelValue.levelId} value={LevelValue.levelId}>{LevelValue.moduleCode} · {LevelValue.levelCode}</option>)}
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
                  {SelectedMockIds.length > 0 && !AssignmentScope && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                      Select mock exams from one module and level at a time before assigning.
                    </div>
                  )}
                  {AssignmentScope && (
                    <p className="text-sm font-black text-slate-600 dark:text-slate-300">
                      Assignment scope: {AssignmentScope.moduleCode || "Module"} &middot; {AssignmentScope.levelCode || "Level"}
                    </p>
                  )}
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

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex items-center gap-2 text-[var(--mp-role-primary)]">{icon}<span className="text-xs font-black uppercase tracking-[0.2em]">{label}</span></div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
