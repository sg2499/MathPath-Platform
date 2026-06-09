"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  assignCompetitionMockExams,
  generateCompetitionMockDraft,
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
import { CheckCircle2, Eye, FilePenLine, Loader2, PlayCircle, Plus, Search, Send, ShieldCheck, Target, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";

const DefaultQuestionCount = 40;
const DefaultDurationMinutes = 20;

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
  const IsDraft = StatusValue === "DRAFT";
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${IsDraft ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200"}`}>
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
  const [QuestionCount, SetQuestionCount] = useState(String(DefaultQuestionCount));
  const [DurationMinutes, SetDurationMinutes] = useState(String(DefaultDurationMinutes));
  const [SelectedMockIds, SetSelectedMockIds] = useState<string[]>([]);
  const [SelectedStudentIds, SetSelectedStudentIds] = useState<string[]>([]);
  const [AssignToAll, SetAssignToAll] = useState(true);
  const [StudentSearch, SetStudentSearch] = useState("");
  const [AssignmentInstructions, SetAssignmentInstructions] = useState("");
  const [PreviewMockId, SetPreviewMockId] = useState<string | null>(null);
  const [LastMessage, SetLastMessage] = useState<string | null>(null);

  const ModulesQuery = useQuery({ queryKey: ["admin", "competition", "modules"], queryFn: getModules, enabled: Ready });
  const LevelsQuery = useQuery({ queryKey: ["admin", "competition", "levels", SelectedModuleId], queryFn: () => getLevels(SelectedModuleId), enabled: Ready && Boolean(SelectedModuleId) });
  const StudentsQuery = useQuery({ queryKey: ["admin", "competition", "students"], queryFn: getAdminStudents, enabled: Ready });
  const MocksQuery = useQuery({ queryKey: ["admin", "competition", "mocks", SelectedLevelId], queryFn: () => listCompetitionMockExams(SelectedLevelId || undefined), enabled: Ready });
  const PreviewQuery = useQuery({ queryKey: ["admin", "competition", "mock", PreviewMockId], queryFn: () => getCompetitionMockExam(PreviewMockId || ""), enabled: Ready && Boolean(PreviewMockId) });

  const Modules = ModulesQuery.data || [];
  const Levels = LevelsQuery.data || [];
  const Students = StudentsQuery.data || [];
  const MockExams = MocksQuery.data || [];

  const SelectedLevel = Levels.find((LevelValue) => LevelValue.levelId === SelectedLevelId) || null;
  const SelectedModule = Modules.find((ModuleValue) => ModuleValue.moduleId === SelectedModuleId) || null;

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
      totalQuestions: Number(QuestionCount) || DefaultQuestionCount,
      durationSeconds: (Number(DurationMinutes) || DefaultDurationMinutes) * 60,
      competitionScope: "GENERAL",
      difficultyBand: "COMPETITION",
    }),
    onSuccess: (ResultValue) => {
      SetLastMessage(`Draft mock generated: ${ResultValue.title}`);
      SetMockTitle("");
      SetPreviewMockId(ResultValue.mockExamId);
      SetSelectedMockIds((CurrentValue) => Array.from(new Set([ResultValue.mockExamId, ...CurrentValue])));
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

  function HandleModuleChange(ModuleId: string) {
    SetSelectedModuleId(ModuleId);
    SetSelectedLevelId("");
    SetSelectedMockIds([]);
    SetSelectedStudentIds([]);
    SetPreviewMockId(null);
  }

  function ToggleMock(MockId: string) {
    SetSelectedMockIds((CurrentValue) => CurrentValue.includes(MockId) ? CurrentValue.filter((Item) => Item !== MockId) : [...CurrentValue, MockId]);
  }

  function ToggleStudent(StudentId: string) {
    SetSelectedStudentIds((CurrentValue) => CurrentValue.includes(StudentId) ? CurrentValue.filter((Item) => Item !== StudentId) : [...CurrentValue, StudentId]);
  }

  const CanGenerate = Boolean(SelectedLevelId) && !GenerateMutation.isPending;
  const CanAssign = Boolean(SelectedLevelId) && SelectedMockIds.length > 0 && (AssignToAll || SelectedStudentIds.length > 0) && !AssignMutation.isPending;

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

        {(ModulesQuery.error || LevelsQuery.error || StudentsQuery.error || MocksQuery.error || GenerateMutation.error || AssignMutation.error) && (
          <ErrorState message={apiErrorMessage(ModulesQuery.error || LevelsQuery.error || StudentsQuery.error || MocksQuery.error || GenerateMutation.error || AssignMutation.error)} />
        )}

        {LastMessage && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {LastMessage}
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          <FeatureCard icon={<FilePenLine size={18} />} title="Generate Draft Mocks" description="Create varied competition-style mock papers from the selected level syllabus." />
          <FeatureCard icon={<Target size={18} />} title="Assign By Level" description="Assign multiple mock exams to all active students in a level or selected students only." />
          <FeatureCard icon={<ShieldCheck size={18} />} title="Independent Workflow" description="No DPS, Assessment, readiness, progression, or report workflow is changed." />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1fr_1.15fr]">
          <div className="space-y-6">
            <div className="math-card p-5">
              <SectionTitle kicker="Step 1" title="Select Module And Level" description="Mock papers and assignments are controlled at level scope." />
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
                  <select value={SelectedLevelId} onChange={(EventValue) => { SetSelectedLevelId(EventValue.target.value); SetSelectedMockIds([]); SetSelectedStudentIds([]); SetPreviewMockId(null); }} disabled={!SelectedModuleId || LevelsQuery.isLoading} className="math-input">
                    <option value="">Select level</option>
                    {Levels.map((LevelValue: LevelItem) => <option key={LevelValue.levelId} value={LevelValue.levelId}>{LevelValue.levelCode} · {LevelValue.levelName}</option>)}
                  </select>
                </label>
              </div>
              {SelectedModule && SelectedLevel && <p className="mt-4 text-sm font-bold text-slate-500 dark:text-slate-400">Selected scope: {SelectedModule.moduleCode} · {SelectedLevel.levelCode}</p>}
            </div>

            <div className="math-card p-5">
              <SectionTitle kicker="Step 2" title="Generate Draft Mock Paper" description="Create a fresh mock version with varied question combinations for the selected level." />
              <div className="mt-5 grid gap-4">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Mock Title
                  <input value={MockTitle} onChange={(EventValue) => SetMockTitle(EventValue.target.value)} placeholder="Example: MM-L1 State Championship Mock 1" className="math-input" />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Total Questions
                    <input value={QuestionCount} onChange={(EventValue) => SetQuestionCount(EventValue.target.value)} type="number" min={10} max={100} className="math-input" />
                  </label>
                  <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                    Duration Minutes
                    <input value={DurationMinutes} onChange={(EventValue) => SetDurationMinutes(EventValue.target.value)} type="number" min={5} max={120} className="math-input" />
                  </label>
                </div>
                <button disabled={!CanGenerate} onClick={() => GenerateMutation.mutate()} className="math-primary-btn inline-flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
                  {GenerateMutation.isPending ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
                  Generate Draft Mock
                </button>
              </div>
            </div>
          </div>

          <div className="math-card p-5">
            <SectionTitle kicker="Step 3" title="Mock Papers In Selected Level" description="Select one or multiple mock papers for assignment, or open a quick preview." />
            <div className="mt-5 space-y-3">
              {MocksQuery.isLoading && <LoadingState label="Loading mock papers..." />}
              {!MocksQuery.isLoading && MockExams.length === 0 && <EmptyState title="No mock papers yet" description="Generate the first draft mock for this level to begin assignment." />}
              {MockExams.map((MockValue: CompetitionMockExamSummary) => (
                <article key={MockValue.mockExamId} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                      <input type="checkbox" checked={SelectedMockIds.includes(MockValue.mockExamId)} onChange={() => ToggleMock(MockValue.mockExamId)} className="mt-1 h-4 w-4 accent-[var(--math-role-primary)]" />
                      <span className="min-w-0">
                        <span className="block text-sm font-black text-slate-950 dark:text-white">{MockValue.title}</span>
                        <span className="mt-1 block text-xs font-bold text-slate-500 dark:text-slate-400">{MockValue.mockCode} · {MockValue.totalQuestions} Questions · {FormatDuration(MockValue.durationSeconds)}</span>
                      </span>
                    </label>
                    <div className="flex items-center gap-2">
                      <StatusChip status={MockValue.status} />
                      <button onClick={() => SetPreviewMockId(MockValue.mockExamId)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:border-[var(--math-role-primary)] hover:text-[var(--math-role-primary)] dark:border-slate-700 dark:text-slate-200">
                        <Eye size={14} className="mr-1 inline" /> Preview
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr]">
          <div className="math-card p-5">
            <SectionTitle kicker="Step 4" title="Assign Mock Exams" description="Admin can assign selected mocks directly, without involving the teacher." />
            <div className="mt-5 space-y-5">
              <label className="flex cursor-pointer items-center gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-black text-slate-700 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-200">
                <input type="checkbox" checked={AssignToAll} onChange={(EventValue) => SetAssignToAll(EventValue.target.checked)} className="h-4 w-4 accent-[var(--math-role-primary)]" />
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
                        <input type="checkbox" checked={SelectedStudentIds.includes(StudentValue.studentId)} onChange={() => ToggleStudent(StudentValue.studentId)} className="h-4 w-4 accent-[var(--math-role-primary)]" />
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

              <button disabled={!CanAssign} onClick={() => AssignMutation.mutate()} className="math-primary-btn inline-flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50">
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

          <div className="math-card p-5">
            <SectionTitle kicker="Preview" title="Selected Mock Snapshot" description="Quickly check sections and sample questions before assigning." />
            <div className="mt-5">
              {PreviewQuery.isLoading && <LoadingState label="Loading mock preview..." />}
              {!PreviewMockId && <EmptyState title="No preview selected" description="Click Preview on any mock paper to inspect its generated questions." />}
              {PreviewQuery.data && <MockPreview exam={PreviewQuery.data} />}
            </div>
          </div>
        </div>
      </section>
    </AppShell>
  );
}

function MockPreview({ exam }: { exam: CompetitionMockExamDetail }) {
  const SectionNames = Array.from(new Map((exam.questions || []).map((QuestionValue) => [QuestionValue.sectionNumber, QuestionValue.sectionTitle])).entries());
  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50">
        <h3 className="text-base font-black text-slate-950 dark:text-white">{exam.title}</h3>
        <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">{exam.totalQuestions} Questions · {FormatDuration(exam.durationSeconds)} · {exam.totalMarks} Marks</p>
      </div>
      <div className="space-y-2">
        {SectionNames.slice(0, 8).map(([SectionNumber, SectionTitleValue]) => (
          <div key={SectionNumber} className="rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-700 ring-1 ring-slate-200 dark:bg-slate-950/50 dark:text-slate-200 dark:ring-slate-800">
            Section {SectionNumber} - {SectionTitleValue}
          </div>
        ))}
        {SectionNames.length > 8 && <p className="text-xs font-bold text-slate-500">+ {SectionNames.length - 8} more section(s)</p>}
      </div>
      <div className="space-y-2">
        {(exam.questions || []).slice(0, 5).map((QuestionValue) => (
          <div key={QuestionValue.mockQuestionId} className="rounded-2xl border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950/50">
            <p className="font-black text-slate-950 dark:text-white">Q{QuestionValue.questionNumber}. {QuestionValue.questionText || QuestionValue.conceptTag}</p>
            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">Answer: {QuestionValue.correctAnswer}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <article className="math-card p-5">
      <div className="flex items-center gap-3 text-[var(--math-role-primary)]">
        {icon}
        <h2 className="text-base font-black text-slate-950 dark:text-white">{title}</h2>
      </div>
      <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{description}</p>
    </article>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950/50">
      <div className="flex items-center gap-2 text-[var(--math-role-primary)]">{icon}<span className="text-xs font-black uppercase tracking-[0.2em]">{label}</span></div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
