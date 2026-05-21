"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  getTeacherAssignAssessmentOptions,
  teacherAssignAssessment,
  type TeacherAssignableAssessmentStudent,
  type TeacherAvailableAssessment,
} from "@/lib/api/teacher";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, GraduationCap, RotateCcw, Search, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

function Metric({ label, value, helper, icon }: { label: string; value: string | number; helper?: string; icon?: ReactNode }) {
  return (
    <div className="rounded-[22px] border border-white/70 bg-white/75 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-700 dark:text-slate-200">{label}</p>
          <p className="mt-1.5 text-3xl font-black leading-none text-slate-950 dark:text-white">{value}</p>
          {helper ? <p className="mt-2 text-xs font-extrabold text-slate-600 dark:text-slate-300">{helper}</p> : null}
        </div>
        {icon ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[var(--mp-role-soft)] text-[var(--mp-role-readable)] dark:bg-[var(--mp-role-softer)]">{icon}</span> : null}
      </div>
    </div>
  );
}

function StudentStatusPill({ Student }: { Student: TeacherAssignableAssessmentStudent }) {
  if (Student.approvedReattemptAccess) {
    return <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-black text-purple-700">Re-Attempt Approved</span>;
  }
  if (Student.testingOverrideApplied) {
    return <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">Controlled Access</span>;
  }
  if (Student.readinessBypassApplied) {
    return <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-black text-orange-700">Workflow Verification</span>;
  }
  if (Student.canAssign) {
    return <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Ready</span>;
  }
  if (Student.alreadyAssigned) {
    return <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">Assigned</span>;
  }
  return <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-black text-rose-700">Not Ready</span>;
}

function ReadinessGateBanner({ Summary }: { Summary: NonNullable<Awaited<ReturnType<typeof getTeacherAssignAssessmentOptions>>["summary"]> }) {
  if (Summary.readinessBypassEnabled) {
    return (
      <div className="rounded-[24px] border border-amber-200 bg-amber-50/90 p-4 text-sm font-extrabold text-amber-900 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
        <div className="flex gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-black">Assessment Workflow Verification Enabled</p>
            <p className="mt-1 text-xs font-bold">Assessment assignment is open for demo verification across the selected learner group.</p>
          </div>
        </div>
      </div>
    );
  }

  if (Summary.testingOverrideEnabled) {
    return (
      <div className="rounded-[24px] border border-blue-200 bg-blue-50/90 p-4 text-sm font-extrabold text-blue-900 shadow-sm dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-100">
        <div className="flex gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-black">Assessment Readiness Checks Active</p>
            <p className="mt-1 text-xs font-bold">Ready students and learners with controlled access can be assigned. {Summary.strictBlockedStudents || 0} learner(s) are awaiting readiness in the current scope.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[24px] border border-emerald-200 bg-emerald-50/90 p-4 text-sm font-extrabold text-emerald-900 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
      <div className="flex gap-3">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <p>Assessment readiness checks are active. Students become assignable after meeting the required readiness criteria.</p>
      </div>
    </div>
  );
}

function AssessmentOptionCard({ Assessment, Selected, OnSelect }: { Assessment: TeacherAvailableAssessment; Selected: boolean; OnSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={OnSelect}
      aria-pressed={Selected}
      className={`group relative w-full overflow-hidden rounded-[26px] border p-4 text-left transition duration-200 ${
        Selected
          ? "border-[color:var(--mp-role-border-strong)] bg-[color-mix(in_srgb,var(--mp-role-softer)_88%,white)] shadow-xl shadow-[color-mix(in_srgb,var(--mp-role-shadow)_34%,transparent)] ring-2 ring-[color:var(--mp-role-border-strong)] dark:bg-[color-mix(in_srgb,var(--mp-role-dark)_30%,rgba(15,23,42,0.92))]"
          : "border-slate-200 bg-white hover:border-[color:var(--mp-role-border-strong)] hover:bg-[color-mix(in_srgb,var(--mp-role-softer)_70%,white)] hover:shadow-lg hover:shadow-[color-mix(in_srgb,var(--mp-role-shadow)_18%,transparent)] dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-[color-mix(in_srgb,var(--mp-role-dark)_24%,rgba(15,23,42,0.95))]"
      }`}
    >
      <span
        className={`pointer-events-none absolute inset-y-0 left-0 w-1.5 transition ${
          Selected ? "bg-[var(--mp-role-primary)]" : "bg-transparent group-hover:bg-[var(--mp-role-primary)]/50"
        }`}
      />
      <div className="flex flex-wrap items-start justify-between gap-3 pl-1">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-950 dark:text-white">{Assessment.title}</p>
            {Selected ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--mp-role-border-strong)] bg-[var(--mp-role-soft)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mp-role-readable)]">
                <CheckCircle2 size={13} /> Selected
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
            {Assessment.moduleCode} · {Assessment.levelCode}
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Live</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 pl-1 text-xs font-black text-slate-600 dark:text-slate-300">
        <span>{Assessment.questionCount || Assessment.totalQuestions} Questions</span>
        <span>{Assessment.totalMarks} Marks</span>
        <span>{Assessment.durationMinutes} Min</span>
      </div>
    </button>
  );
}

export default function TeacherAssignAssessmentPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const QueryClient = useQueryClient();
  const [SearchText, SetSearchText] = useState("");
  const [ModuleFilter, SetModuleFilter] = useState("");
  const [LevelFilter, SetLevelFilter] = useState("");
  const [SelectedAssessmentVersionId, SetSelectedAssessmentVersionId] = useState("");
  const [SelectedStudentIds, SetSelectedStudentIds] = useState<string[]>([]);
  const [Instructions, SetInstructions] = useState("Complete the assessment carefully before submitting.");

  const OptionsQuery = useQuery({
    queryKey: ["teacher-assign-assessment-options"],
    queryFn: () => getTeacherAssignAssessmentOptions(),
    enabled: Ready,
  });

  const AssignMutation = useMutation({
    mutationFn: () =>
      teacherAssignAssessment({
        assessmentVersionId: SelectedAssessmentVersionId,
        studentIds: SelectedStudentIds,
        instructions: Instructions.trim() || undefined,
      }),
    onSuccess: () => {
      SetSelectedStudentIds([]);
      QueryClient.invalidateQueries({ queryKey: ["teacher-assign-assessment-options"] });
      QueryClient.invalidateQueries({ queryKey: ["teacher-assessments"] });
    },
  });

  const Data = OptionsQuery.data;
  const Students = Data?.students ?? [];
  const Assessments = Data?.availableAssessments ?? [];

  const Modules = useMemo(() => {
    const ModuleMap = new globalThis.Map<string, string>();
    Students.forEach((Student) => {
      if (Student.moduleId) ModuleMap.set(Student.moduleId, `${Student.moduleCode || "Module"} · ${Student.moduleName || "Module"}`);
    });
    Assessments.forEach((Assessment) => {
      if (Assessment.moduleId) ModuleMap.set(Assessment.moduleId, `${Assessment.moduleCode || "Module"} · ${Assessment.moduleName || "Module"}`);
    });
    return Array.from(ModuleMap.entries()).map(([Value, Label]) => ({ Value, Label }));
  }, [Students, Assessments]);

  const Levels = useMemo(() => {
    const LevelMap = new globalThis.Map<string, string>();
    Students.forEach((Student) => {
      if (Student.levelId && (!ModuleFilter || Student.moduleId === ModuleFilter)) LevelMap.set(Student.levelId, `${Student.moduleCode || "Module"} · ${Student.levelCode || "Level"}`);
    });
    return Array.from(LevelMap.entries()).map(([Value, Label]) => ({ Value, Label }));
  }, [Students, ModuleFilter]);

  const FilteredStudents = useMemo(() => {
    const Query = SearchText.trim().toLowerCase();
    return Students.filter((Student) => {
      const MatchesSearch = !Query || `${Student.studentName} ${Student.studentCode} ${Student.levelCode || ""}`.toLowerCase().includes(Query);
      const MatchesModule = !ModuleFilter || Student.moduleId === ModuleFilter;
      const MatchesLevel = !LevelFilter || Student.levelId === LevelFilter;
      return MatchesSearch && MatchesModule && MatchesLevel;
    });
  }, [Students, SearchText, ModuleFilter, LevelFilter]);

  const FilteredAssessments = useMemo(() => {
    return Assessments.filter((Assessment) => {
      const MatchesModule = !ModuleFilter || Assessment.moduleId === ModuleFilter;
      const MatchesLevel = !LevelFilter || Assessment.levelId === LevelFilter;
      return MatchesModule && MatchesLevel;
    });
  }, [Assessments, ModuleFilter, LevelFilter]);

  useEffect(() => {
    if (!FilteredAssessments.length) {
      if (SelectedAssessmentVersionId) {
        SetSelectedAssessmentVersionId("");
        SetSelectedStudentIds([]);
      }
      return;
    }

    const CurrentAssessmentStillVisible = FilteredAssessments.some(
      (Assessment) => Assessment.assessmentVersionId === SelectedAssessmentVersionId
    );

    if (!SelectedAssessmentVersionId || !CurrentAssessmentStillVisible) {
      const FirstAssessment = FilteredAssessments[0];
      SetSelectedAssessmentVersionId(FirstAssessment.assessmentVersionId);
      SetModuleFilter(FirstAssessment.moduleId || "");
      SetLevelFilter(FirstAssessment.levelId || "");
      SetSelectedStudentIds([]);
    }
  }, [FilteredAssessments, SelectedAssessmentVersionId]);

  const SelectedAssessment = Assessments.find((Assessment) => Assessment.assessmentVersionId === SelectedAssessmentVersionId) ?? null;
  const AssignableStudents = useMemo(() => {
    return FilteredStudents.filter((Student) => {
      const LevelMatches = !SelectedAssessment || Student.levelId === SelectedAssessment.levelId;
      const DifferentVersionRequired = Boolean(Student.requiresReattempt && SelectedAssessment && Student.sourceAssessmentVersionId === SelectedAssessment.assessmentVersionId);
      return Boolean(Student.canAssign && LevelMatches && !DifferentVersionRequired);
    });
  }, [FilteredStudents, SelectedAssessment]);

  useEffect(() => {
    const AssignableIds = new Set(AssignableStudents.map((Student) => Student.studentId));
    SetSelectedStudentIds((Current) => {
      const Next = Current.filter((StudentId) => AssignableIds.has(StudentId));
      return Next.length === Current.length ? Current : Next;
    });
  }, [AssignableStudents]);

  function ToggleStudent(StudentId: string) {
    SetSelectedStudentIds((Current) =>
      Current.includes(StudentId) ? Current.filter((Item) => Item !== StudentId) : [...Current, StudentId]
    );
  }

  function SelectAllAssignable() {
    SetSelectedStudentIds(AssignableStudents.map((Student) => Student.studentId));
  }

  if (!Ready || OptionsQuery.isLoading) return <LoadingState label="Loading assessment assignment workspace..." />;
  if (OptionsQuery.isError) return <ErrorState message={apiErrorMessage(OptionsQuery.error)} />;

  return (
    <AppShell title="Assign Assessment">
      <section className="w-full space-y-6">
        <div className="math-hero">
          <div>
            <p className="math-kicker">Assessment Assignment</p>
            <h1 className="math-title">Assign Assessment</h1>
            <p className="math-subtitle">Assign live level assessments to students who have met readiness requirements.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Students" value={Data?.summary.students ?? 0} helper="Teacher Roster" icon={<UsersRound size={17} />} />
            <Metric label="Live Assessments" value={Data?.summary.availableAssessments ?? 0} helper="Open For Assignment" icon={<GraduationCap size={17} />} />
            <Metric label="Eligible Students" value={Data?.summary.assignableStudents ?? 0} helper={Data?.summary.strictReadinessMode ? "Ready / Override" : "Testing Scope"} icon={<UserCheck size={17} />} />
            <Metric label="Assigned Assessments" value={Data?.summary.alreadyAssigned ?? 0} helper="Original Assignments" icon={<ShieldCheck size={17} />} />
            <Metric label="Re-Attempt Needed" value={Data?.summary.reattemptNeeded ?? 0} helper="Below Benchmark" icon={<RotateCcw size={17} />} />
          </div>
        </div>

        {Data?.summary ? <ReadinessGateBanner Summary={Data.summary} /> : null}

        <div className="grid gap-5 xl:grid-cols-[390px_1fr]">
          <aside className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--mp-role-soft)] text-[var(--mp-role-readable)]"><GraduationCap size={20} /></span>
              <div>
                <p className="math-kicker">Assessment Selection</p>
                <h2 className="text-xl font-black text-slate-950 dark:text-white">Live Assessments</h2>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {FilteredAssessments.length ? FilteredAssessments.map((Assessment) => (
                <AssessmentOptionCard
                  key={Assessment.assessmentVersionId}
                  Assessment={Assessment}
                  Selected={Assessment.assessmentVersionId === SelectedAssessmentVersionId}
                  OnSelect={() => {
                    SetSelectedAssessmentVersionId(Assessment.assessmentVersionId);
                    SetModuleFilter(Assessment.moduleId || "");
                    SetLevelFilter(Assessment.levelId || "");
                    SetSelectedStudentIds([]);
                  }}
                />
              )) : <EmptyState message="No live assessments match the selected module and level." />}
            </div>
          </aside>

          <main className="space-y-5">
            <div className="rounded-[28px] border border-white/70 bg-white/90 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950/80">
              <div className="grid gap-3 lg:grid-cols-[1fr_240px_240px]">
                <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className="math-input pl-11" value={SearchText} onChange={(Event) => SetSearchText(Event.target.value)} placeholder="Search Students" />
                </div>
                <select className="math-input" value={ModuleFilter || "__CHOOSE__"} onChange={(Event) => { const NextValue = Event.target.value === "ALL" || Event.target.value === "__CHOOSE__" ? "" : Event.target.value; SetModuleFilter(NextValue); SetLevelFilter(""); SetSelectedStudentIds([]); }} title="Choose Module" aria-label="Choose Module">
                  <option value="__CHOOSE__" disabled>Choose Module</option>
                  <option value="ALL">All Modules</option>
                  {Modules.map((Module) => <option key={Module.Value} value={Module.Value}>{Module.Label}</option>)}
                </select>
                <select className="math-input" value={LevelFilter || "__CHOOSE__"} onChange={(Event) => { SetLevelFilter(Event.target.value === "ALL" || Event.target.value === "__CHOOSE__" ? "" : Event.target.value); SetSelectedStudentIds([]); }} title="Choose Level" aria-label="Choose Level">
                  <option value="__CHOOSE__" disabled>Choose Level</option>
                  <option value="ALL">All Levels</option>
                  {Levels.map((Level) => <option key={Level.Value} value={Level.Value}>{Level.Label}</option>)}
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-[22px] border border-white/70 bg-white/85 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">Readiness Gate</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{Data?.summary.assignmentGateLabel || "Readiness Gate"}</p>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/85 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">Ready Students</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{Data?.summary.readyStudents ?? 0}</p>
              </div>
              <div className="rounded-[22px] border border-white/70 bg-white/85 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/75">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">Blocked Students</p>
                <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{Data?.summary.strictReadinessMode ? (Data?.summary.strictBlockedStudents ?? 0) : 0}</p>
              </div>
            </div>

            <div className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-xl dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="math-kicker">Eligible Students</p>
                  <h2 className="text-2xl font-black text-slate-950 dark:text-white">Assignment Queue</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{Data?.summary.readinessBypassEnabled ? "Workflow verification allows matching students from the selected assessment level to be assigned." : Data?.summary.testingOverrideEnabled ? "Ready students and learners with controlled access from the selected assessment level can be assigned." : "Only ready students from the selected assessment level can be assigned."}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="math-role-action-button px-4 py-2" onClick={SelectAllAssignable} disabled={!SelectedAssessment || !AssignableStudents.length}>
                    <UsersRound size={16} /> Select Eligible
                  </button>
                  <button type="button" className="math-button-primary px-4 py-2" onClick={() => AssignMutation.mutate()} disabled={!SelectedAssessmentVersionId || !SelectedStudentIds.length || AssignMutation.isPending}>
                    <UserCheck size={16} /> Assign Assessment
                  </button>
                </div>
              </div>

              {AssignMutation.isSuccess ? (
                <div className="mt-4 rounded-[22px] bg-emerald-50 p-4 text-sm font-black text-emerald-800">
                  {AssignMutation.data.message}
                </div>
              ) : null}
              {AssignMutation.isError ? <div className="mt-4"><ErrorState message={apiErrorMessage(AssignMutation.error)} /></div> : null}

              <div className="mt-5 rounded-[24px] bg-slate-50 p-4 dark:bg-slate-900/70">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-600 dark:text-slate-300">Assessment Instructions</p>
                <textarea className="math-input mt-3 min-h-[88px]" value={Instructions} onChange={(Event) => SetInstructions(Event.target.value)} placeholder="Assessment instructions" />
              </div>

              <div className="mt-5 space-y-3">
                {FilteredStudents.length ? FilteredStudents.map((Student) => {
                  const LevelMatches = !SelectedAssessment || Student.levelId === SelectedAssessment.levelId;
                  const DifferentVersionRequired = Boolean(Student.requiresReattempt && SelectedAssessment && Student.sourceAssessmentVersionId === SelectedAssessment.assessmentVersionId);
                  const CanSelect = Boolean(Student.canAssign && LevelMatches && SelectedAssessment && !DifferentVersionRequired);
                  const BlockReason = DifferentVersionRequired ? "Different Version Required." : Student.assignmentBlockReason;
                  const Checked = SelectedStudentIds.includes(Student.studentId);
                  return (
                    <label key={Student.studentId} className={`flex flex-col gap-3 rounded-[24px] border p-4 transition lg:flex-row lg:items-center lg:justify-between ${Checked ? "border-[color:var(--mp-role-border-strong)] bg-[color-mix(in_srgb,var(--mp-role-softer)_76%,white)] shadow-md shadow-[color-mix(in_srgb,var(--mp-role-shadow)_18%,transparent)]" : CanSelect ? "border-slate-200 bg-white hover:border-[color:var(--mp-role-border)] hover:bg-[color-mix(in_srgb,var(--mp-role-softer)_58%,white)] dark:border-slate-800 dark:bg-slate-950" : "border-slate-100 bg-slate-50 opacity-80 dark:border-slate-800 dark:bg-slate-900"}`}>
                      <div className="flex items-start gap-3">
                        <input type="checkbox" className="mt-1 h-5 w-5 rounded border-slate-300" checked={Checked} disabled={!CanSelect} onChange={() => ToggleStudent(Student.studentId)} />
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-black text-slate-950 dark:text-white">{Student.studentName}</p>
                            <StudentStatusPill Student={Student} />
                          </div>
                          <p className="mt-1 text-xs font-bold text-slate-500">{Student.studentCode} · {Student.moduleCode || "Module"} · {Student.levelCode || "Level"}</p>
                          <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">{Student.canAssign ? (Student.approvedReattemptAccess ? "Admin-approved re-attempt access is available." : Student.testingOverrideApplied ? "Eligible through controlled assessment access." : Student.readinessBypassApplied ? "Assessment workflow verification is currently enabled." : "Ready for original assessment assignment.") : BlockReason}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs font-black text-slate-600 dark:text-slate-300">
                        <span className="rounded-2xl bg-slate-100 px-3 py-2 dark:bg-slate-800">Required {Student.requiredDpsCount}</span>
                        <span className="rounded-2xl bg-emerald-50 px-3 py-2 text-emerald-700">Cleared {Student.passedDpsCount}</span>
                        <span className="rounded-2xl bg-amber-50 px-3 py-2 text-amber-700">Pending {Student.missingDpsCount}</span>
                      </div>
                    </label>
                  );
                }) : <EmptyState message="Adjust search, module, or level filters to review assignment eligibility." />}
              </div>
            </div>

            <div className="rounded-[28px] border border-blue-100 bg-blue-50/80 p-4 text-sm font-bold text-blue-800 dark:border-blue-900/50 dark:bg-blue-950/30 dark:text-blue-200">
              <div className="flex gap-3">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                <p>Original assessment assignment is allowed only once per level. Re-attempts require Admin approval and a different live assessment version.</p>
              </div>
            </div>
          </main>
        </div>
      </section>
    </AppShell>
  );
}
