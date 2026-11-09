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
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, CheckCircle2, Eye, FilePenLine, FilePlus, Loader2, PackageOpen, Plus, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Target, Trash2, UserCheck, UsersRound } from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useUrlTabState } from "@/hooks/useUrlTabState";
import type { ReactNode } from "react";

const DefaultQuestionCount = 40;
const MmDefaultQuestionCount = 100;
const ImDefaultQuestionCount = 100;
const PmDefaultQuestionCount = 60;
const BmDefaultQuestionCount = 60;
const YlmDefaultQuestionCount = 60;
const DefaultDurationMinutes = 20;
const MmDefaultDurationMinutes = 60;
const ImDefaultDurationMinutes = 30;
const PmDefaultDurationMinutes = 30;
const BmDefaultDurationMinutes = 30;
const YlmDefaultDurationMinutes = 30;

// 2026-07-19 (Shailesh, repo cleanup): only modules with a real,
// admin-curated competition-mock section structure (*_COMPETITION_LEVEL_REGISTRY
// on the backend) belong here. Any other module -- YLM today -- silently fell
// through to a generic, unlocked per-DPS structure with none of that section
// design, which reads as a real gap rather than an intentional mock format.
// Gated out of Create Mock here until it's actually built; existing
// Manage/Assign flows for already-created mocks are untouched.
// 2026-08-04: PM-L1 added (PM_COMPETITION_LEVEL_REGISTRY, 2 sections --
// Addition/Subtraction, flat 1 mark/question, same as MM).
// 2026-08-07: BM added (BM_COMPETITION_LEVEL_REGISTRY, 6 sections --
// Add/Less Abacus, Add/Less Visual, Multiplication, Division, BODMAS,
// Concept Drill weighted 5 marks/question). This Set is a frontend-only
// allow-list, separate from the backend's SECTION_WISE_ASSESSMENT_MODULES /
// _SECTION_WISE_REGISTRIES (assessment_blueprint_service.py) -- building a
// module's real engine + backend registry does NOT make it selectable here
// automatically; this Set must be updated too, every time.
// 2026-08-11: YLM added (YLM_COMPETITION_LEVEL_REGISTRY, 3 sections --
// Addition, Subtraction, Add/Less -- flat 1 mark/question, same as
// MM/PM-L1). 2026-08-12: YLM collapsed from 3 levels down to a single
// YLM-L1 level covering all 32 lessons, matching the BM/MM
// one-level-per-module pattern -- the 3 sections now pool from the whole
// level instead of being split per old level boundary.
const CompetitionMockSupportedModuleCodes = new Set(["MM", "IM", "PM", "BM", "YLM"]);

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

function SectionTitle({ kicker, title, description, icon }: { kicker: string; title: string; description: string; icon?: ReactNode }) {
  return (
    <div>
      <p className="math-block-header">{icon}{kicker}</p>
      <h2 className="text-xl font-black text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{description}</p>
    </div>
  );
}

const STUDIO_TABS = ["CREATE", "MANAGE"] as const;

export default function AdminCompetitionMockStudioPage() {
  return (
    <Suspense fallback={null}>
      <AdminCompetitionMockStudioPageContent />
    </Suspense>
  );
}

function AdminCompetitionMockStudioPageContent() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();

  const [SelectedModuleId, SetSelectedModuleId] = useState("");
  const [SelectedLevelId, SetSelectedLevelId] = useState("");
  const [MockTitle, SetMockTitle] = useState("");
  const [MockCode, SetMockCode] = useState("");
  const [QuestionCount, SetQuestionCount] = useState(String(DefaultQuestionCount));
  // Admin-chosen total marks for a weighted level (Concept Drill/Skill
  // Stacker present) -- 10-100 inclusive, default 100. Irrelevant for a
  // flat level, which uses QuestionCount directly (1 mark/question, so
  // "Total Questions" already IS the marks total there).
  const [MarksTargetInput, SetMarksTargetInput] = useState("100");
  const [DurationMinutes, SetDurationMinutes] = useState(String(DefaultDurationMinutes));
  const [SelectedMockIds, SetSelectedMockIds] = useState<string[]>([]);
  const [SelectedStudentIds, SetSelectedStudentIds] = useState<string[]>([]);
  const [AssignToAll, SetAssignToAll] = useState(true);
  const [StudentSearch, SetStudentSearch] = useState("");
  const [AssignmentInstructions, SetAssignmentInstructions] = useState("");
  const [DeleteMockId, SetDeleteMockId] = useState<string | null>(null);
  const [ArchiveMockId, SetArchiveMockId] = useState<string | null>(null);
  // 2026-10-14: the tab lives in the page address, so a refresh keeps it.
  const [ActiveStudioTab, SetActiveStudioTab] = useUrlTabState<"CREATE" | "MANAGE">("tab", STUDIO_TABS, "CREATE");
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
  // 2026-11-09 (Shailesh: per-section marks for mocks, same freedom as the
  // Assessment Studio): one row per section -- questions, whole marks each,
  // and whether it is in the paper. Rows start from the server's starting
  // layout and follow it (e.g. when Total Marks changes) until the admin
  // edits a row; after that they stay exactly as the admin set them.
  const [SectionRows, SetSectionRows] = useState<Record<string, { count: string; marks: string; included: boolean }>>({});
  const [RowsTouched, SetRowsTouched] = useState(false);
  const [LastMessage, SetLastMessage] = useState<string | null>(null);

  const ModulesQuery = useQuery({ queryKey: ["admin", "competition", "modules"], queryFn: getModules, enabled: Ready });
  const Modules = ModulesQuery.data || [];
  const LevelsQuery = useQuery({ queryKey: ["admin", "competition", "levels", SelectedModuleId], queryFn: () => getLevels(SelectedModuleId), enabled: Ready && Boolean(SelectedModuleId) });
  const StudentsQuery = useQuery({ queryKey: ["admin", "competition", "students"], queryFn: getAdminStudents, enabled: Ready });
  const MocksQuery = useQuery({ queryKey: ["admin", "competition", "mocks", ManageLevelFilterId], queryFn: () => listCompetitionMockExams(ManageLevelFilterId || undefined), enabled: Ready });
  // 2026-09-03 (Shailesh, live report -- screenshot showed a flat-mode "0
  // Selected" badge for IM-L2, a level whose own registry data DOES have a
  // weighted Skill Stacker/Concept Drill section): switching SelectedLevelId
  // changes this query's key, and without placeholderData that means `data`
  // (and therefore HasWeightedSection/LiveSections below) drops to
  // empty/false for one render on every level change, no matter the new
  // level's actual shape -- purely a query-key reset artifact, not a real
  // section-plan mismatch. keepPreviousData keeps rendering the outgoing
  // level's section plan until the new one actually arrives, so the panel
  // never flashes an incorrect "flat level" state for a weighted level (or
  // vice versa).
  const SectionPlanQuery = useQuery({ queryKey: ["admin", "competition", "section-plan", SelectedLevelId, QuestionCount, MarksTargetInput], queryFn: () => getCompetitionMockSectionPlan(SelectedLevelId, Number(QuestionCount) || DefaultQuestionCount, Math.max(10, Math.min(100, Math.floor(Number(MarksTargetInput) || 0))) || 100), enabled: Ready && Boolean(SelectedLevelId), placeholderData: keepPreviousData });
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
  // 2026-11-02 (Shailesh): Manage Mocks lists mock papers only -- never an
  // Annual Competition paper, official or practice. The server already
  // leaves them out (backend/app/services/mock_paper_scope.py); this second
  // check keeps the screen right even if one were ever sent.
  const MockExams = (MocksQuery.data || []).filter((Exam) => !String((Exam as { competitionScope?: string | null }).competitionScope || "").toUpperCase().startsWith("ANNUAL"));
  const SectionPlan = SectionPlanQuery.data || null;

  // Switching level starts the new level's rows fresh from its own
  // starting layout.
  useEffect(() => {
    SetSectionRows({});
    SetRowsTouched(false);
  }, [SectionPlan?.levelId]);

  const SelectedLevel = Levels.find((LevelValue) => LevelValue.levelId === SelectedLevelId) || null;
  const SelectedModule = Modules.find((ModuleValue) => ModuleValue.moduleId === SelectedModuleId) || null;
  const IsSelectedMasterModule = Boolean(SelectedModule && (SelectedModule.moduleCode?.toUpperCase() === "MM" || SelectedModule.moduleName?.toLowerCase().includes("master module")));
  const IsSelectedIntermediateModule = Boolean(SelectedModule && (SelectedModule.moduleCode?.toUpperCase() === "IM" || SelectedModule.moduleName?.toLowerCase().includes("intermediate module")));
  const IsSelectedPreparatoryModule = Boolean(SelectedModule && (SelectedModule.moduleCode?.toUpperCase() === "PM" || SelectedModule.moduleName?.toLowerCase().includes("preparatory module")));
  const IsSelectedBridgeModule = Boolean(SelectedModule && (SelectedModule.moduleCode?.toUpperCase() === "BM" || SelectedModule.moduleName?.toLowerCase().includes("bridge module")));
  const IsSelectedYoungLearnersModule = Boolean(SelectedModule && (SelectedModule.moduleCode?.toUpperCase() === "YLM" || SelectedModule.moduleName?.toLowerCase().includes("young learners module")));

  useEffect(() => {
    if (IsSelectedMasterModule) {
      SetQuestionCount((CurrentValue) => CurrentValue === String(DefaultQuestionCount) ? String(MmDefaultQuestionCount) : CurrentValue);
      SetDurationMinutes((CurrentValue) => CurrentValue === String(DefaultDurationMinutes) ? String(MmDefaultDurationMinutes) : CurrentValue);
      return;
    }
    if (IsSelectedIntermediateModule) {
      SetQuestionCount((CurrentValue) => CurrentValue === String(DefaultQuestionCount) ? String(ImDefaultQuestionCount) : CurrentValue);
      SetDurationMinutes((CurrentValue) => CurrentValue === String(DefaultDurationMinutes) ? String(ImDefaultDurationMinutes) : CurrentValue);
      return;
    }
    if (IsSelectedPreparatoryModule) {
      SetQuestionCount((CurrentValue) => CurrentValue === String(DefaultQuestionCount) ? String(PmDefaultQuestionCount) : CurrentValue);
      SetDurationMinutes((CurrentValue) => CurrentValue === String(DefaultDurationMinutes) ? String(PmDefaultDurationMinutes) : CurrentValue);
      return;
    }
    if (IsSelectedBridgeModule) {
      SetQuestionCount((CurrentValue) => CurrentValue === String(DefaultQuestionCount) ? String(BmDefaultQuestionCount) : CurrentValue);
      SetDurationMinutes((CurrentValue) => CurrentValue === String(DefaultDurationMinutes) ? String(BmDefaultDurationMinutes) : CurrentValue);
      return;
    }
    if (IsSelectedYoungLearnersModule) {
      SetQuestionCount((CurrentValue) => CurrentValue === String(DefaultQuestionCount) ? String(YlmDefaultQuestionCount) : CurrentValue);
      SetDurationMinutes((CurrentValue) => CurrentValue === String(DefaultDurationMinutes) ? String(YlmDefaultDurationMinutes) : CurrentValue);
    }
  }, [IsSelectedMasterModule, IsSelectedIntermediateModule, IsSelectedPreparatoryModule, IsSelectedBridgeModule, IsSelectedYoungLearnersModule]);


  // A level "has a weighted section" when it starts with a section worth
  // more than 1 mark (Skill Stacker / Concept Drill). That only decides
  // which Total Marks box backs the field (the 100-mark default vs the
  // module's 1-mark default question count); every section's marks are
  // editable either way.
  const HasWeightedSection = (SectionPlan?.sections || []).some((SectionValue) => SectionValue.isWeighted);
  const MockMarksTarget = Math.max(10, Math.min(100, Math.floor(Number(MarksTargetInput) || 0))) || 100;
  const TargetInputValue = HasWeightedSection ? MarksTargetInput : QuestionCount;
  const TargetNumber = Number(TargetInputValue);
  const TargetValid = Number.isInteger(TargetNumber) && TargetNumber >= 10 && TargetNumber <= 100;
  const TargetMarks = TargetValid ? TargetNumber : 0;

  // Rows follow the server's starting layout until the admin edits one.
  useEffect(() => {
    if (RowsTouched || !SectionPlan?.sections?.length) return;
    const Next: Record<string, { count: string; marks: string; included: boolean }> = {};
    SectionPlan.sections.forEach((SectionValue) => {
      const Included = SectionValue.included ?? SectionValue.questionCount > 0;
      Next[SectionValue.sectionKey] = {
        count: String(Included ? SectionValue.questionCount : 0),
        marks: String(SectionValue.defaultMarksPerQuestion ?? Math.max(1, Math.round(SectionValue.marksPerQuestion || 1))),
        included: Included,
      };
    });
    SetSectionRows(Next);
  }, [SectionPlan, RowsTouched]);

  const LiveSections = useMemo(() => {
    let DenseNumber = 0;
    return (SectionPlan?.sections || []).map((SectionValue) => {
      const Row = SectionRows[SectionValue.sectionKey] || { count: String(SectionValue.questionCount), marks: String(SectionValue.defaultMarksPerQuestion ?? 1), included: true };
      const Count = Number(Row.count);
      const Marks = Number(Row.marks);
      const CountValid = Number.isInteger(Count) && Count >= 1;
      const MarksValid = Number.isInteger(Marks) && Marks >= 1 && Marks <= 100;
      const LiveCount = Row.included && CountValid ? Count : 0;
      const LiveNumber = Row.included ? (DenseNumber += 1) : null;
      return {
        ...SectionValue,
        row: Row,
        liveCount: LiveCount,
        liveMarks: MarksValid ? Marks : 0,
        liveNumber: LiveNumber,
        rowValid: !Row.included || (CountValid && MarksValid),
        sectionMarks: Row.included && CountValid && MarksValid ? Count * Marks : 0,
      };
    });
  }, [SectionPlan, SectionRows]);

  const IncludedSections = LiveSections.filter((SectionValue) => SectionValue.row.included);
  const LeftOutSections = LiveSections.filter((SectionValue) => !SectionValue.row.included);
  const SectionCountTotal = IncludedSections.reduce((Total, SectionValue) => Total + SectionValue.liveCount, 0);
  const TotalMarks = IncludedSections.reduce((Total, SectionValue) => Total + SectionValue.sectionMarks, 0);
  const RowsValid = LiveSections.length > 0 && IncludedSections.length > 0 && LiveSections.every((SectionValue) => SectionValue.rowValid);
  const MarksMismatch = !TargetValid || TotalMarks !== TargetMarks;
  const QuestionCountValid = SectionCountTotal >= 10 && SectionCountTotal <= 100;
  const AllocationValid = RowsValid && !MarksMismatch && QuestionCountValid;
  const AllocationMessage = !TargetValid
    ? "Total Marks must be a whole number from 10 to 100."
    : !RowsValid
      ? "Every included section needs at least 1 question and whole marks from 1 to 100."
      : TotalMarks !== TargetMarks
        ? `Sections add up to ${TotalMarks} marks, ${Math.abs(TotalMarks - TargetMarks)} ${TotalMarks > TargetMarks ? "over" : "short of"} ${TargetMarks}. Change a section's questions or marks each, or use Auto Balance.`
        : SectionCountTotal < 10
          ? `A mock needs at least 10 questions (${SectionCountTotal} now). Lower some marks each or include another section.`
          : SectionCountTotal > 100
            ? `A mock can have at most 100 questions (${SectionCountTotal} now). Raise some marks each or lower questions.`
            : `${SectionCountTotal} questions, exactly ${TargetMarks} marks. Ready to generate.`;

  function EditSectionRow(SectionKey: string, Change: Partial<{ count: string; marks: string; included: boolean }>) {
    SetRowsTouched(true);
    SetSectionRows((CurrentValue) => {
      const Current = CurrentValue[SectionKey] || { count: "1", marks: "1", included: true };
      return { ...CurrentValue, [SectionKey]: { ...Current, ...Change } };
    });
  }

  // Leave a section out, or bring it back (at least one always stays in).
  function ToggleSectionIncluded(SectionKey: string) {
    const Row = SectionRows[SectionKey];
    if (!Row) return;
    if (Row.included && IncludedSections.length <= 1) return;
    if (Row.included) {
      EditSectionRow(SectionKey, { included: false, count: "0" });
    } else {
      const Count = Number(Row.count);
      EditSectionRow(SectionKey, { included: true, count: String(Number.isInteger(Count) && Count >= 1 ? Count : 1) });
    }
  }

  // Auto Balance (same rule as the Assessment Studio): the included sections
  // at the most common marks value share whatever marks the other included
  // sections leave, as evenly as whole questions allow; sections at other
  // marks keep their question count (at least 1).
  function AutoBalanceSections() {
    if (!TargetValid) return;
    const Included = LiveSections.filter((SectionValue) => SectionValue.row.included);
    if (!Included.length) return;
    const MarksOf = (SectionValue: (typeof Included)[number]) => SectionValue.liveMarks || 1;
    const Frequency = new Map<number, number>();
    Included.forEach((SectionValue) => Frequency.set(MarksOf(SectionValue), (Frequency.get(MarksOf(SectionValue)) || 0) + 1));
    const FillMarks = [...Frequency.entries()].sort((A, B) => B[1] - A[1] || A[0] - B[0])[0][0];
    const Fillers = Included.filter((SectionValue) => MarksOf(SectionValue) === FillMarks);
    const Fixed = Included.filter((SectionValue) => MarksOf(SectionValue) !== FillMarks);
    const FixedMarks = Fixed.reduce((Total, SectionValue) => Total + Math.max(1, SectionValue.liveCount) * MarksOf(SectionValue), 0);
    const FillQuestions = Math.max(Fillers.length, Math.floor(Math.max(0, TargetMarks - FixedMarks) / FillMarks));
    const Base = Math.floor(FillQuestions / Fillers.length);
    let Extra = FillQuestions - Base * Fillers.length;
    SetRowsTouched(true);
    SetSectionRows((CurrentValue) => {
      const Next = { ...CurrentValue };
      Fillers.forEach((SectionValue) => {
        const Add = Extra > 0 ? 1 : 0;
        Extra -= Add;
        Next[SectionValue.sectionKey] = { ...Next[SectionValue.sectionKey], count: String(Math.max(1, Base + Add)), marks: String(MarksOf(SectionValue)) };
      });
      Fixed.forEach((SectionValue) => {
        Next[SectionValue.sectionKey] = { ...Next[SectionValue.sectionKey], count: String(Math.max(1, SectionValue.liveCount)), marks: String(MarksOf(SectionValue)) };
      });
      return Next;
    });
  }

  function ResetSectionRows() {
    SetSectionRows({});
    SetRowsTouched(false);
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
      && !StudentValue.isDemo // demo accounts are left out (2026-10-14)
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
      // The "Total Marks" field (QuestionCount for a flat level, where it's
      // 1:1 with questions) is the real target the admin set; it must win
      // outright, not just when the section boxes happen to sum to zero.
      // LiveSections/SectionCountTotal always redistributes to equal this
      // same target anyway (see LiveSections above), so in practice the two
      // only differ transiently before a re-render -- but QuestionCount is
      // the source of truth, never the box sum.
      totalQuestions: SectionCountTotal,
      totalMarks: TargetMarks,
      durationSeconds: (Number(DurationMinutes) || DefaultDurationMinutes) * 60,
      competitionScope: "GENERAL",
      difficultyBand: "COMPETITION",
      // 2026-11-09: the whole section table; the server checks it adds up.
      sectionPlan: LiveSections.map((SectionValue) => ({
        sectionKey: SectionValue.sectionKey,
        questionCount: SectionValue.row.included ? SectionValue.liveCount : 0,
        marksPerQuestion: SectionValue.liveMarks,
      })),
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

  // 2026-09-03 (Shailesh, live report: "i still see this error, wtf bor?") --
  // GenerateMutation.error was never cleared once a generate attempt failed,
  // so its COMPETITION_MOCK_MARKS_INVALID banner (baked with THAT attempt's
  // marks numbers, e.g. "balance to 10") kept showing indefinitely even
  // after the admin picked a different level, retyped Total Marks, edited a
  // section count, or changed the duration -- the banner's numbers then no
  // longer matched anything on screen. Reset the mutation the instant any
  // input that feeds a future generate attempt changes, so a stale error can
  // never outlive the form state that produced it.
  useEffect(() => {
    GenerateMutation.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [SelectedLevelId, MockMarksTarget, QuestionCount, SectionRows, DurationMinutes]);

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
      SetLastMessage(`Assigned ${ResultValue.mockExamCount} ${ResultValue.mockExamCount === 1 ? "mock exam" : "mock exams"} to ${ResultValue.studentCount} ${ResultValue.studentCount === 1 ? "student" : "students"}. Created: ${ResultValue.createdAssignmentCount}. Updated: ${ResultValue.updatedExistingAssignmentCount}.`);
      QueryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
    },
  });



  const ArchiveMutation = useMutation({
    mutationFn: (MockExamId: string) => archiveCompetitionMockExam(MockExamId),
    onSuccess: (ResultValue) => {
      SetLastMessage(ResultValue.message || "Mock exam archived.");
      SetSelectedMockIds((CurrentValue) => CurrentValue.filter((MockId) => MockId !== ArchiveMockId));
      SetArchiveMockId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
    },
  });

  const DeleteMutation = useMutation({
    mutationFn: (MockExamId: string) => deleteCompetitionMockExam(MockExamId),
    onSuccess: (ResultValue) => {
      SetLastMessage(ResultValue.message || "Mock exam deleted.");
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
    SetSectionRows({});
    SetRowsTouched(false);
  }

  function ToggleMock(MockId: string) {
    SetSelectedMockIds((CurrentValue) => CurrentValue.includes(MockId) ? CurrentValue.filter((Item) => Item !== MockId) : [...CurrentValue, MockId]);
  }

  function ToggleStudent(StudentId: string) {
    SetSelectedStudentIds((CurrentValue) => CurrentValue.includes(StudentId) ? CurrentValue.filter((Item) => Item !== StudentId) : [...CurrentValue, StudentId]);
  }

  const CanGenerate = Boolean(SelectedLevelId) && AllocationValid && !GenerateMutation.isPending;
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
  if (ModulesQuery.isLoading) return <AppShell title="Mock Studio"><LoadingState label="Loading Mock Studio..." /></AppShell>;

  return (
    <AppShell title="Mock Studio">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-block-header"><PackageOpen size={14} />Mock Studio</p>
          <h1 className="math-title">Mock Studio</h1>
          <p className="mt-3 max-w-none text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            Create draft mock papers and assign one or multiple mocks directly to students by level. This remains independent from DPS Practice, Assessments, readiness, and progression.
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
                <SectionTitle icon={<FilePlus size={14} />} kicker="Create Mock" title="Select Module And Level" description="Mock papers are generated at level scope, independent from DPS practice and assessment structures." />
                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Module
                    <select value={SelectedModuleId} onChange={(EventValue) => HandleModuleChange(EventValue.target.value)} className="math-input">
                      <option value="">Select Module</option>
                      {Modules
                        .filter((ModuleValue: ModuleItem) => CompetitionMockSupportedModuleCodes.has(ModuleValue.moduleCode))
                        .map((ModuleValue: ModuleItem) => <option key={ModuleValue.moduleId} value={ModuleValue.moduleId}>{ModuleValue.moduleCode} · {ModuleValue.moduleName}</option>)}
                    </select>
                    <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Only modules with a mock section design are selectable here.</span>
                  </label>
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Level
                    <select value={SelectedLevelId} onChange={(EventValue) => { SetSelectedLevelId(EventValue.target.value); SetSelectedMockIds([]); SetSelectedStudentIds([]); SetDeleteMockId(null); SetArchiveMockId(null); SetSectionRows({}); SetRowsTouched(false); }} disabled={!SelectedModuleId || LevelsQuery.isLoading} className="math-input">
                      <option value="">Select Level</option>
                      {Levels.map((LevelValue: LevelItem) => <option key={LevelValue.levelId} value={LevelValue.levelId}>{LevelValue.levelCode} · {LevelValue.levelName}</option>)}
                    </select>
                  </label>
                </div>
                {SelectedModule && SelectedLevel && <p className="mt-4 text-sm font-bold text-slate-500 dark:text-slate-400">Selected scope: {SelectedModule.moduleCode} · {SelectedLevel.levelCode}</p>}
              </div>

              <div className="math-card p-5">
                <SectionTitle icon={<FilePlus size={14} />} kicker="Create Mock" title="Build Mock Paper" description="Create a fresh mock version with varied question combinations for the selected level." />
                <div className="mt-5 grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-[1.35fr_0.65fr]">
                    <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                      Mock Title
                      <input value={MockTitle} onChange={(EventValue) => SetMockTitle(EventValue.target.value)} placeholder="Example: MM-L1 Mock 1" className="math-input" />
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
                      Total Marks
                      {HasWeightedSection ? (
                        <input value={MarksTargetInput} onChange={(EventValue) => SetMarksTargetInput(EventValue.target.value)} type="number" min={10} max={100} className="math-input" />
                      ) : (
                        <input value={QuestionCount} onChange={(EventValue) => SetQuestionCount(EventValue.target.value)} type="number" min={10} max={100} className="math-input" />
                      )}
                      <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">
                        From 10 to 100. Set each section&apos;s questions and marks each below; the sections must add up to exactly this many marks.
                      </span>
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

                  <div data-mock-allocation className="rounded-[28px] border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="math-block-header"><SlidersHorizontal size={14} />Section Allocation</p>
                        <p className="mt-1 text-sm font-bold text-slate-500 dark:text-slate-400">Choose the sections, how many questions each has and how many marks each question is worth.</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span data-mock-total className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-black ${AllocationValid ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200" : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"}`}>
                          {`${SectionCountTotal} Questions \u00b7 ${TotalMarks}/${TargetMarks || "?"} Marks`}
                        </span>
                        <button type="button" className={AdminRowActionButtonClass} disabled={!LiveSections.length || !TargetValid} onClick={AutoBalanceSections} title="Fill the included sections so the mock adds up to Total Marks with the marks you set">Auto Balance</button>
                        <button type="button" className={AdminRowActionButtonClass} disabled={!LiveSections.length || !RowsTouched} onClick={ResetSectionRows} title="Go back to the starting layout for this level">Reset</button>
                      </div>
                    </div>

                    {SelectedLevelId && LiveSections.length ? (
                      <p data-mock-allocation-status className={`mt-3 rounded-2xl px-4 py-2.5 text-sm font-bold ${AllocationValid ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200" : "bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:text-rose-200"}`}>{AllocationMessage}</p>
                    ) : null}

                    <div className="mt-4 space-y-2">
                      {SectionPlanQuery.isLoading && <LoadingState label="Loading section plan..." />}
                      {!SelectedLevelId && <p className="text-sm font-bold text-slate-500 dark:text-slate-400">Select a level to load section allocation.</p>}
                      {LiveSections.length ? (
                        <div className="hidden grid-cols-[minmax(0,1fr)_64px_96px_96px_64px] gap-3 px-4 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 sm:grid">
                          <span>Section</span><span>Include</span><span>Questions</span><span>Marks Each</span><span>Marks</span>
                        </div>
                      ) : null}
                      {LiveSections.map((SectionValue) => {
                        const Included = SectionValue.row.included;
                        const LastIncluded = Included && IncludedSections.length <= 1;
                        const BareTitle = String(SectionValue.sectionTitle || "").replace(/^\s*Section\s+\d+\s*-\s*/i, "") || SectionValue.sectionTitle;
                        return (
                          <div key={SectionValue.sectionKey} data-mock-section={SectionValue.sectionKey} className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_64px_96px_96px_64px] sm:items-center ${Included ? (SectionValue.rowValid ? "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950/50" : "border-rose-300 bg-white dark:border-rose-800 dark:bg-slate-950/50") : "border-slate-200 bg-slate-100/70 dark:border-slate-800 dark:bg-slate-900/30"}`}>
                            <div className="min-w-0">
                              <p className={`truncate text-sm font-black ${Included ? "text-slate-950 dark:text-white" : "text-slate-400 line-through dark:text-slate-600"}`} title={SectionValue.sectionTitle}>{BareTitle}</p>
                              <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                                {Included ? `Students see Section ${SectionValue.liveNumber}` : "Left out of this mock"}
                              </p>
                            </div>
                            <div className="flex items-center justify-end sm:justify-start">
                              <button
                                type="button"
                                role="switch"
                                aria-checked={Included}
                                aria-label={`Include ${BareTitle}`}
                                disabled={LastIncluded}
                                title={LastIncluded ? "At least one section must stay in the mock" : Included ? "Leave this section out" : "Put this section back in"}
                                onClick={() => ToggleSectionIncluded(SectionValue.sectionKey)}
                                className={`relative h-7 w-12 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${Included ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"}`}
                              >
                                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${Included ? "left-6" : "left-1"}`} />
                              </button>
                            </div>
                            <div className="col-span-2 grid grid-cols-3 gap-3 sm:contents">
                              <span className="flex min-w-0 flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 sm:hidden">Questions</span>
                                <input
                                  value={Included ? SectionValue.row.count : "0"}
                                  onChange={(EventValue) => EditSectionRow(SectionValue.sectionKey, { count: EventValue.target.value })}
                                  type="number"
                                  min={1}
                                  max={100}
                                  step={1}
                                  inputMode="numeric"
                                  disabled={!Included}
                                  className="math-input text-center font-black"
                                  aria-label={`${BareTitle} questions`}
                                />
                              </span>
                              <span className="flex min-w-0 flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 sm:hidden">Marks Each</span>
                                <input
                                  value={SectionValue.row.marks}
                                  onChange={(EventValue) => EditSectionRow(SectionValue.sectionKey, { marks: EventValue.target.value })}
                                  type="number"
                                  min={1}
                                  max={100}
                                  step={1}
                                  inputMode="numeric"
                                  disabled={!Included}
                                  className="math-input text-center font-black"
                                  aria-label={`${BareTitle} marks for each question`}
                                />
                              </span>
                              <span className="flex min-w-0 flex-col gap-1">
                                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500 sm:hidden">Marks</span>
                                <span data-mock-section-marks className="flex h-11 items-center justify-center text-sm font-black text-slate-700 sm:justify-start dark:text-slate-200">{SectionValue.sectionMarks}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                      {LeftOutSections.length ? (
                        <p data-mock-left-out className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                          {LeftOutSections.length === 1 ? "1 section is" : `${LeftOutSections.length} sections are`} left out of this mock ({LeftOutSections.map((SectionValue) => String(SectionValue.sectionTitle || "").replace(/^\s*Section\s+\d+\s*-\s*/i, "")).join(", ")}). Students only see the included sections, numbered 1, 2, 3 in order.
                        </p>
                      ) : null}
                    </div>
                  </div>

                </div>
              </div>
          </div>
        )}

        {ActiveStudioTab === "MANAGE" && (
          <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
              <div className="math-card p-5">
                <SectionTitle icon={<Settings2 size={14} />} kicker="Manage Mocks" title="Mock Paper Library" description="View, preview, assign, archive, or delete mock papers from one focused control panel." />

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
                <SectionTitle icon={<UserCheck size={14} />} kicker="Assign" title="Assign Selected Mock Exams" description="Admin can assign selected mocks directly, without involving the teacher." />
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
                    Assign the selected mock exams to all active students in this level
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
                    <textarea value={AssignmentInstructions} onChange={(EventValue) => SetAssignmentInstructions(EventValue.target.value)} rows={3} placeholder="Example: Complete this mock in one sitting without taking breaks." className="math-input min-h-24" />
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
                  <p className="math-block-header text-amber-600 dark:text-amber-300"><Archive size={14} />Archive Mock Exam</p>
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
                  <p className="math-block-header text-rose-600 dark:text-rose-300"><Trash2 size={14} />Delete Mock Exam</p>
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
      <div className="math-role-text flex items-center gap-2">{icon}<span className="text-xs font-black uppercase tracking-[0.2em]">{label}</span></div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
