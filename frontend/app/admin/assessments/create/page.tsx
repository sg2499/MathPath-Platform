"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  createAssessment,
  getAdminStudents,
  getDpsByLesson,
  getLessons,
  getLevels,
  getModules,
} from "@/lib/api/admin";
import type { DpsItem, LessonItem, LevelItem, ModuleItem } from "@/types/curriculum";
import type { AdminStudent } from "@/types/student";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  GraduationCap,
  Layers3,
  LockKeyhole,
  Send,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type AssignToType = "LEVEL" | "STUDENT" | "BATCH";

export default function CreateAssessmentPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const router = useRouter();

  const [selectedModuleId, setSelectedModuleId] = useState("");
  const [selectedLevelId, setSelectedLevelId] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState("");
  const [selectedDpsId, setSelectedDpsId] = useState("");
  const [assignedToType, setAssignedToType] = useState<AssignToType>("LEVEL");
  const [assignedToId, setAssignedToId] = useState("");
  const [title, setTitle] = useState("YLM Formal Assessment");

  const modulesQuery = useQuery({ queryKey: ["admin-assessment-modules"], queryFn: getModules, enabled: ready });
  const levelsQuery = useQuery({ queryKey: ["admin-assessment-levels", selectedModuleId], queryFn: () => getLevels(selectedModuleId), enabled: ready && Boolean(selectedModuleId) });
  const lessonsQuery = useQuery({ queryKey: ["admin-assessment-lessons", selectedLevelId], queryFn: () => getLessons(selectedLevelId), enabled: ready && Boolean(selectedLevelId) });
  const dpsQuery = useQuery({ queryKey: ["admin-assessment-dps", selectedLessonId], queryFn: () => getDpsByLesson(selectedLessonId), enabled: ready && Boolean(selectedLessonId) });
  const studentsQuery = useQuery({ queryKey: ["admin-assessment-students"], queryFn: getAdminStudents, enabled: ready });

  const selectedModule = useMemo(() => modulesQuery.data?.find((item) => item.moduleId === selectedModuleId), [modulesQuery.data, selectedModuleId]);
  const selectedLevel = useMemo(() => levelsQuery.data?.find((item) => item.levelId === selectedLevelId), [levelsQuery.data, selectedLevelId]);
  const selectedLesson = useMemo(() => lessonsQuery.data?.find((item) => item.lessonId === selectedLessonId), [lessonsQuery.data, selectedLessonId]);
  const selectedDps = useMemo(() => dpsQuery.data?.find((item) => item.dpsId === selectedDpsId), [dpsQuery.data, selectedDpsId]);

  const eligibleStudents = useMemo(() => {
    const rows = studentsQuery.data ?? [];
    if (!selectedLevelId) return rows;
    return rows.filter((student: AdminStudent) => student.currentLevelId === selectedLevelId);
  }, [studentsQuery.data, selectedLevelId]);

  const selectedStudent = useMemo(() => eligibleStudents.find((student) => student.studentId === assignedToId), [eligibleStudents, assignedToId]);

  useEffect(() => {
    if (!modulesQuery.data?.length || selectedModuleId) return;
    const ylmModule = modulesQuery.data.find((item) => item.moduleCode === "YLM") || modulesQuery.data[0];
    setSelectedModuleId(ylmModule.moduleId);
  }, [modulesQuery.data, selectedModuleId]);

  useEffect(() => {
    setSelectedLevelId("");
    setSelectedLessonId("");
    setSelectedDpsId("");
    setAssignedToId("");
  }, [selectedModuleId]);

  useEffect(() => {
    if (!levelsQuery.data?.length || selectedLevelId) return;
    const firstLevel = levelsQuery.data[0];
    setSelectedLevelId(firstLevel.levelId);
    if (assignedToType === "LEVEL") setAssignedToId(firstLevel.levelId);
  }, [levelsQuery.data, selectedLevelId, assignedToType]);

  useEffect(() => {
    setSelectedLessonId("");
    setSelectedDpsId("");
    if (assignedToType === "LEVEL") setAssignedToId(selectedLevelId);
    if (assignedToType === "STUDENT") setAssignedToId("");
  }, [selectedLevelId, assignedToType]);

  useEffect(() => {
    if (!lessonsQuery.data?.length || selectedLessonId) return;
    setSelectedLessonId(lessonsQuery.data[0].lessonId);
  }, [lessonsQuery.data, selectedLessonId]);

  useEffect(() => setSelectedDpsId(""), [selectedLessonId]);

  useEffect(() => {
    if (!dpsQuery.data?.length || selectedDpsId) return;
    const sorted = dpsQuery.data.slice().sort((a, b) => Number(a.dpsNumber || 0) - Number(b.dpsNumber || 0));
    setSelectedDpsId(sorted[0].dpsId);
  }, [dpsQuery.data, selectedDpsId]);

  useEffect(() => {
    if (!selectedDps || !selectedLesson) return;
    setTitle(`YLM Lesson ${selectedLesson.lessonNumber} - DPS ${selectedDps.dpsNumber} Assessment`);
  }, [selectedDps, selectedLesson]);

  function handleAssignToTypeChange(value: AssignToType) {
    setAssignedToType(value);
    if (value === "LEVEL") setAssignedToId(selectedLevelId);
    else setAssignedToId("");
  }

  const mutation = useMutation({
    mutationFn: () =>
      createAssessment({
        assignmentType: "ASSESSMENT",
        dpsId: selectedDpsId,
        assignedToType,
        assignedToId,
        title,
        instructions: "This is a formal assessment. Re-Attempt requires admin approval.",
        allowReattempt: false,
      }),
    onSuccess: () => router.push("/admin/assessments"),
  });

  const isLoading = modulesQuery.isLoading || levelsQuery.isLoading || lessonsQuery.isLoading || dpsQuery.isLoading || studentsQuery.isLoading;
  const error = modulesQuery.error || levelsQuery.error || lessonsQuery.error || dpsQuery.error || studentsQuery.error || mutation.error;
  const canCreate = Boolean(selectedModuleId && selectedLevelId && selectedLessonId && selectedDpsId && assignedToType && assignedToId && title.trim()) && !mutation.isPending;

  if (!ready) return null;

  return (
    <AppShell title="Create Assessment">
      <div className="space-y-8">
        <section className="math-hero math-slide-up">
          <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="math-kicker">Assessment builder</p>
              <h1 className="math-title">Create Formal Assessment</h1>
              <p className="math-subtitle">
                Select a DPS and target. Students receive one normal attempt; extra attempts require admin approval.
              </p>
            </div>
            <button className="math-button-secondary" type="button" onClick={() => router.push("/admin/assessments")}>
              <ArrowLeft size={17} /> Back to Assessments
            </button>
          </div>
        </section>

        {isLoading ? <LoadingState label="Loading assessment builder..." /> : null}
        {error ? <ErrorState message={apiErrorMessage(error)} /> : null}

        <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_430px]">
          <section className="math-card p-6 sm:p-8">
            <div className="mb-7 flex items-start gap-4">
              <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                <GraduationCap size={25} />
              </div>
              <div>
                <p className="math-kicker">Step 1</p>
                <h2 className="text-3xl font-black text-slate-950 dark:text-white">Assessment Setup</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
                  Formal assessments are separate from daily practice sheets.
                </p>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <SelectField label="Module" value={selectedModuleId} onChange={setSelectedModuleId} disabled={mutation.isPending} options={(modulesQuery.data ?? []).map((moduleItem: ModuleItem) => ({ value: moduleItem.moduleId, label: `${moduleItem.moduleCode} - ${moduleItem.moduleName}` }))} />
              <SelectField label="Level" value={selectedLevelId} onChange={setSelectedLevelId} disabled={!selectedModuleId || mutation.isPending} options={(levelsQuery.data ?? []).map((level: LevelItem) => ({ value: level.levelId, label: `${level.levelCode} - ${level.levelName}` }))} />
              <SelectField label="Lesson" value={selectedLessonId} onChange={setSelectedLessonId} disabled={!selectedLevelId || mutation.isPending} options={(lessonsQuery.data ?? []).map((lesson: LessonItem) => ({ value: lesson.lessonId, label: `Lesson ${lesson.lessonNumber} - ${lesson.lessonTitle}` }))} />
              <SelectField label="DPS" value={selectedDpsId} onChange={setSelectedDpsId} disabled={!selectedLessonId || mutation.isPending} options={(dpsQuery.data ?? []).slice().sort((a, b) => Number(a.dpsNumber || 0) - Number(b.dpsNumber || 0)).map((dps: DpsItem) => ({ value: dps.dpsId, label: `DPS ${dps.dpsNumber} - ${dps.dpsTitle}` }))} />

              <div>
                <label className="math-label">Assign To Type</label>
                <select className="math-select mt-2" value={assignedToType} onChange={(e) => handleAssignToTypeChange(e.target.value as AssignToType)} disabled={mutation.isPending}>
                  <option value="LEVEL">Level</option>
                  <option value="STUDENT">Student</option>
                  <option value="BATCH">Batch</option>
                </select>
              </div>

              {assignedToType === "LEVEL" ? (
                <Field label="Assigned Level" value={selectedLevel ? `${selectedLevel.levelCode} - ${selectedLevel.levelName}` : ""} onChange={() => undefined} disabled helperText="Auto-filled from the selected level." />
              ) : assignedToType === "STUDENT" ? (
                <SelectField
                  label="Assigned Student"
                  value={assignedToId}
                  onChange={setAssignedToId}
                  disabled={!selectedLevelId || mutation.isPending}
                  options={eligibleStudents.map((student: AdminStudent) => ({
                    value: student.studentId,
                    label: `${student.studentName} (${student.studentCode})`,
                  }))}
                  helperText={eligibleStudents.length ? "Only students mapped to the selected level are shown." : "No students are currently mapped to this level."}
                />
              ) : (
                <Field label="Assigned Batch ID" value={assignedToId} onChange={setAssignedToId} disabled={mutation.isPending} helperText="Batch assessment is retained for future expansion." />
              )}

              <div className="lg:col-span-2">
                <Field label="Assessment Title" value={title} onChange={setTitle} disabled={mutation.isPending} />
              </div>
            </div>
          </section>

          <aside className="space-y-5">
            <section className="math-card p-6">
              <div className="flex items-start gap-4">
                <div className="rounded-2xl bg-violet-50 p-3 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                  <LockKeyhole size={22} />
                </div>
                <div>
                  <p className="math-kicker">Rules</p>
                  <h2 className="text-2xl font-black text-slate-950 dark:text-white">Controlled Re-Attempts</h2>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    Teachers cannot reopen assessments. Admin can unlock the same assessment when remediation is needed.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <SummaryItem icon={<Layers3 size={18} />} label="Module" value={selectedModule ? `${selectedModule.moduleCode} - ${selectedModule.moduleName}` : "Not selected"} />
                <SummaryItem icon={<GraduationCap size={18} />} label="Level" value={selectedLevel ? `${selectedLevel.levelCode} - ${selectedLevel.levelName}` : "Not selected"} />
                <SummaryItem icon={<BookOpen size={18} />} label="Lesson" value={selectedLesson ? `Lesson ${selectedLesson.lessonNumber} - ${selectedLesson.lessonTitle}` : "Not selected"} />
                <SummaryItem icon={<ClipboardCheck size={18} />} label="DPS" value={selectedDps ? `DPS ${selectedDps.dpsNumber} - ${selectedDps.dpsTitle}` : "Not selected"} />
                <SummaryItem
                  icon={assignedToType === "STUDENT" ? <UserRound size={18} /> : <UsersRound size={18} />}
                  label="Assigned To"
                  value={assignedToType === "STUDENT" ? (selectedStudent ? <>{selectedStudent.studentName} <span className="text-xs font-black uppercase tracking-[0.12em] text-[#2563eb] dark:text-cyan-100">({selectedStudent.studentCode})</span></> : "Select student") : assignedToType === "LEVEL" ? (selectedLevel ? `${selectedLevel.levelCode} - Full Level` : "Selected level") : "Batch"}
                />
              </div>

              <button className="math-button-primary mt-6 w-full" onClick={() => mutation.mutate()} disabled={!canCreate} type="button">
                <Send size={18} /> {mutation.isPending ? "Creating..." : "Create Assessment"}
              </button>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function SelectField({ label, value, onChange, options, disabled = false, helperText }: { label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[]; disabled?: boolean; helperText?: string }) {
  return (
    <div>
      <label className="math-label">{label}</label>
      <select className="math-select mt-2 disabled:bg-slate-50 disabled:text-slate-400 dark:disabled:bg-slate-900" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">Select {label}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {helperText ? <p className="math-helper">{helperText}</p> : null}
    </div>
  );
}

function Field({ label, value, onChange, disabled = false, helperText }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean; helperText?: string }) {
  return (
    <div>
      <label className="math-label">{label}</label>
      <input className="math-input mt-2 disabled:bg-slate-50 disabled:text-slate-400 dark:disabled:bg-slate-900" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      {helperText ? <p className="math-helper">{helperText}</p> : null}
    </div>
  );
}

function SummaryItem({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-xl bg-violet-50 p-2 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">{icon}</div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-sm font-black text-slate-950 dark:text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}
