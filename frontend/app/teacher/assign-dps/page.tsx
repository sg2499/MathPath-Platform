"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { getTeacherAvailableDps, getTeacherStudents, teacherAssignAllSheetsForLesson, teacherAssignDps, teacherScheduleDpsForLesson } from "@/lib/api/teacher";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CheckCircle2, ClipboardPlus, Layers, Send, UserCheck, Users, X } from "lucide-react";
import { useMemo, useState } from "react";


function getTeacherAssignErrorMessage(error: unknown) {
  const anyError = error as {
    response?: {
      status?: number;
      data?: {
        message?: string;
        detail?: string;
        error?: string;
        code?: string;
      };
    };
    message?: string;
  };

  const status = anyError?.response?.status;
  const code = anyError?.response?.data?.code;
  const backendMessage =
    anyError?.response?.data?.message ||
    anyError?.response?.data?.detail ||
    anyError?.response?.data?.error ||
    "";

  if (status === 403 && code === "DPS_NOT_PUBLISHED") {
    return {
      title: "DPS Not Published",
      message:
        "This DPS has not been published by Admin yet. Teachers can assign only published practice content.",
      guidance:
        "Ask Admin to publish the DPS from Learning Path Studio before assigning it to students.",
    };
  }

  if (status === 409 || code === "DUPLICATE_ASSIGNMENT_BLOCKED") {
    return {
      title: "Re-Attempt Approval Required",
      message:
        "This DPS has already been assigned. Teachers cannot assign the same practice sheet again. Admin must Allow Re-Attempt.",
      guidance:
        "Once approved, the same assignment reopens automatically in the student dashboard.",
    };
  }

  return {
    title: "Something went wrong",
    message: backendMessage || apiErrorMessage(error),
    guidance: "",
  };
}

function TeacherAssignError({ error }: { error: unknown }) {
  const info = getTeacherAssignErrorMessage(error);

  return (
    <div className="mb-5 rounded-[28px] border border-rose-200 bg-rose-50 p-5 text-rose-900 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-600">
        {info.title}
      </p>
      <p className="mt-2 text-sm font-bold leading-6">{info.message}</p>
      {info.guidance ? (
        <p className="mt-3 rounded-2xl bg-white/70 p-4 text-sm font-semibold leading-6 text-slate-700">
          {info.guidance}
        </p>
      ) : null}
    </div>
  );
}


// Local calendar date (not UTC) as "YYYY-MM-DD" -- toISOString() would
// shift across a timezone boundary and can land on the wrong day.
function FormatDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Default prefill for the weekly scheduler: the next `count` weekdays
// starting today (inclusive), skipping Saturday/Sunday -- matches the
// program's Mon-Fri practice rhythm. Every date stays individually
// editable afterward, so this is only ever a starting point.
function NextWeekdaySequence(count: number, startFrom: Date = new Date()): string[] {
  const dates: string[] = [];
  const cursor = new Date(startFrom.getFullYear(), startFrom.getMonth(), startFrom.getDate());
  while (dates.length < count) {
    const day = cursor.getDay(); // 0=Sun ... 6=Sat
    if (day !== 0 && day !== 6) {
      dates.push(FormatDateYYYYMMDD(cursor));
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

// Parses a "YYYY-MM-DD" string as a local date (not UTC) to check whether
// it lands on a Saturday or Sunday -- used only for the soft, non-blocking
// warning shown next to a date picker; the backend makes the same check
// (in IST) and returns it as a warning too, never a hard block.
function IsWeekendDateStr(dateStr: string): boolean {
  if (!dateStr) return false;
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) return false;
  const weekday = new Date(year, month - 1, day).getDay();
  return weekday === 0 || weekday === 6;
}

export default function TeacherAssignDpsPage() {
  const ready = useProtectedPage(["TEACHER"]);
  const AssignDpsStateKey = CreatePersistedUiStateKey("teacher", "assign-dps");
  const [levelId, setLevelId] = usePersistentUiState(CreatePersistedUiStateKey(AssignDpsStateKey, "level-id"), "");
  const [lessonId, setLessonId] = usePersistentUiState(CreatePersistedUiStateKey(AssignDpsStateKey, "lesson-id"), "");
  const [dpsId, setDpsId] = usePersistentUiState(CreatePersistedUiStateKey(AssignDpsStateKey, "dps-id"), "");
  const [selectedStudentIds, setSelectedStudentIds] = usePersistentUiState<string[]>(CreatePersistedUiStateKey(AssignDpsStateKey, "selected-students"), []);
  const [message, setMessage] = useState("");
  const [assignMode, setAssignMode] = usePersistentUiState<"selected" | "all">(CreatePersistedUiStateKey(AssignDpsStateKey, "assign-mode"), "selected");
  const [showAssignAllConfirm, setShowAssignAllConfirm] = useState(false);
  const [showAssignAllSheetsConfirm, setShowAssignAllSheetsConfirm] = useState(false);
  const [showScheduleConfirm, setShowScheduleConfirm] = useState(false);
  const [scheduleDates, setScheduleDates] = useState<Record<string, string>>({});

  const studentsQuery = useQuery({ queryKey: ["teacher-students"], queryFn: getTeacherStudents, enabled: ready });
  const dpsQuery = useQuery({ queryKey: ["teacher-available-dps"], queryFn: getTeacherAvailableDps, enabled: ready });

  const levels = dpsQuery.data?.levels ?? [];
  const dpsRows = dpsQuery.data?.dps ?? [];
  const students = studentsQuery.data ?? [];

  const dpsForLevel = useMemo(
    () =>
      dpsRows
        .filter((dps) => !levelId || levelId === "ALL" || dps.levelId === levelId)
        .slice()
        .sort((a, b) => {
          const levelCompare = String(a.levelCode || "").localeCompare(String(b.levelCode || ""));
          if (levelCompare !== 0) return levelCompare;
          const lessonCompare = Number(a.lessonNumber || 0) - Number(b.lessonNumber || 0);
          if (lessonCompare !== 0) return lessonCompare;
          return Number(a.dpsNumber || 0) - Number(b.dpsNumber || 0);
        }),
    [dpsRows, levelId]
  );

  // Distinct lessons available under the selected level, in the same order
  // as dpsForLevel (level, then lesson number).
  const lessonsForLevel = useMemo(() => {
    const seen = new Map<string, { lessonId: string; lessonNumber: number; lessonTitle: string; levelId: string; levelCode: string }>();
    for (const dps of dpsForLevel) {
      if (!seen.has(dps.lessonId)) {
        seen.set(dps.lessonId, {
          lessonId: dps.lessonId,
          lessonNumber: dps.lessonNumber,
          lessonTitle: dps.lessonTitle,
          levelId: dps.levelId,
          levelCode: dps.levelCode,
        });
      }
    }
    return Array.from(seen.values());
  }, [dpsForLevel]);

  const selectedLesson = lessonsForLevel.find((lesson) => lesson.lessonId === lessonId);

  // Every DPS the teacher can see here is already Admin-published (that's
  // what /teacher/available-dps returns), so once a lesson is chosen this is
  // exactly the set of sheets "Assign All Sheets" will touch -- no separate
  // unpublished-count tracking needed on this side.
  const dpsForLesson = useMemo(
    () => (lessonId ? dpsForLevel.filter((dps) => dps.lessonId === lessonId) : []),
    [dpsForLevel, lessonId]
  );

  const selectedDps = dpsForLesson.find((dps) => dps.dpsId === dpsId);

  // Bulk mode: a lesson is chosen but no specific sheet is -- eligibility
  // still needs a level to check students against, which the lesson alone
  // already pins down (every sheet in a lesson shares the same level).
  const activeLevelId = selectedDps?.levelId ?? selectedLesson?.levelId;
  const eligibleStudents = students.filter((student) => activeLevelId && student.currentLevelId === activeLevelId && student.isActive);
  const eligibleStudentIds = useMemo(() => eligibleStudents.map((student) => student.studentId), [eligibleStudents]);

  const mutation = useMutation({
    mutationFn: (payload: { studentIds: string[]; mode: "selected" | "all" }) => teacherAssignDps({
      dpsId,
      studentIds: payload.studentIds,
      title: selectedDps ? `${selectedDps.levelCode} Lesson ${selectedDps.lessonNumber} - DPS ${selectedDps.dpsNumber} Practice` : undefined,
      instructions: "Complete this practice within the given time.",
    }),
    onSuccess: (data) => {
      setMessage(data.message);
      setSelectedStudentIds([]);
      setAssignMode("selected");
      setShowAssignAllConfirm(false);
    },
  });

  const bulkLessonMutation = useMutation({
    mutationFn: () => teacherAssignAllSheetsForLesson({
      lessonId,
      studentIds: selectedStudentIds,
      instructions: "Complete this practice within the given time.",
    }),
    onSuccess: (data) => {
      setMessage(data.message);
      setSelectedStudentIds([]);
      setShowAssignAllSheetsConfirm(false);
    },
  });

  const scheduleMutation = useMutation({
    mutationFn: () => teacherScheduleDpsForLesson({
      lessonId,
      studentIds: selectedStudentIds,
      scheduleItems: dpsForLesson.map((dps) => ({ dpsId: dps.dpsId, date: scheduleDates[dps.dpsId] || "" })),
      instructions: "Complete this practice within the given time.",
    }),
    onSuccess: (data) => {
      setMessage(data.warnings?.length ? `${data.message} ${data.warnings.join(" ")}` : data.message);
      setSelectedStudentIds([]);
      setShowScheduleConfirm(false);
    },
  });

  if (!ready) return null;

  const loading = studentsQuery.isLoading || dpsQuery.isLoading;
  const error = studentsQuery.error || dpsQuery.error || mutation.error || bulkLessonMutation.error || scheduleMutation.error;

  const allEligibleSelected = eligibleStudentIds.length > 0 && eligibleStudentIds.every((id) => selectedStudentIds.includes(id));

  function toggleStudent(studentId: string) {
    setSelectedStudentIds((prev) => prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]);
  }

  function toggleSelectAllStudents() {
    setSelectedStudentIds(allEligibleSelected ? [] : eligibleStudentIds);
  }

  function assignSelectedStudents() {
    setAssignMode("selected");
    mutation.mutate({ studentIds: selectedStudentIds, mode: "selected" });
  }

  function openAssignAllConfirmation() {
    if (!eligibleStudentIds.length || !selectedDps || mutation.isPending) return;
    setShowAssignAllConfirm(true);
  }

  function confirmAssignAllEligibleStudents() {
    if (!eligibleStudentIds.length || !selectedDps) return;
    setAssignMode("all");
    mutation.mutate({ studentIds: eligibleStudentIds, mode: "all" });
  }

  function openAssignAllSheetsConfirmation() {
    if (!selectedStudentIds.length || !selectedLesson || dpsId || bulkLessonMutation.isPending) return;
    setShowAssignAllSheetsConfirm(true);
  }

  function confirmAssignAllSheets() {
    if (!selectedStudentIds.length || !selectedLesson || dpsId) return;
    bulkLessonMutation.mutate();
  }

  function openScheduleConfirmation() {
    if (!selectedStudentIds.length || !selectedLesson || dpsId || !dpsForLesson.length || scheduleMutation.isPending) return;
    // Seed defaults for any sheet that doesn't already have a date picked
    // (e.g. first time opening this lesson's scheduler) -- preserves
    // whatever the teacher already edited if they close and reopen without
    // changing lesson.
    setScheduleDates((prev) => {
      const defaults = NextWeekdaySequence(dpsForLesson.length);
      const next = { ...prev };
      dpsForLesson.forEach((dps, index) => {
        if (!next[dps.dpsId]) next[dps.dpsId] = defaults[index];
      });
      return next;
    });
    setShowScheduleConfirm(true);
  }

  function confirmSchedule() {
    if (!selectedStudentIds.length || !selectedLesson || dpsId) return;
    if (dpsForLesson.some((dps) => !scheduleDates[dps.dpsId])) return;
    scheduleMutation.mutate();
  }

  return (
    <AppShell title="Assign DPS">
      <section className="math-hero">
        <div className="relative z-10">
          <p className="math-block-header">
            <ClipboardPlus size={14} />
            Teacher assignment
          </p>
          <h1 className="math-title">Assign Practice</h1>
          <p className="math-subtitle">Choose Admin-published DPS sheets for levels where your students are enrolled.</p>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="min-w-0">
            <label className="math-label">Level</label>
            <select
              className="math-select mt-2 truncate"
              value={levelId}
              onChange={(e) => { setLevelId(e.target.value); setLessonId(""); setDpsId(""); setSelectedStudentIds([]); }}
            >
              <option value="" disabled>Choose Level</option>
              <option value="ALL">All Levels</option>
              {levels.map((level) => <option key={level.levelId} value={level.levelId}>{level.levelCode} - {level.levelName} ({level.studentCount} students)</option>)}
            </select>
          </div>
          <div className="min-w-0">
            <label className="math-label">Lesson</label>
            <select
              className="math-select mt-2 truncate"
              value={lessonId}
              disabled={!levelId}
              onChange={(e) => { setLessonId(e.target.value); setDpsId(""); setSelectedStudentIds([]); }}
            >
              <option value="" disabled>{levelId ? "Choose Lesson" : "Choose Level First"}</option>
              {lessonsForLevel.map((lesson) => (
                <option key={lesson.lessonId} value={lesson.lessonId}>
                  {lesson.levelCode} · Lesson {lesson.lessonNumber}: {lesson.lessonTitle}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label className="math-label">DPS Sheet</label>
            <select
              className="math-select mt-2 truncate"
              value={dpsId}
              disabled={!lessonId}
              onChange={(e) => { setDpsId(e.target.value); setSelectedStudentIds([]); }}
            >
              <option value="">{lessonId ? "All Sheets In This Lesson" : "Choose Lesson First"}</option>
              {dpsForLesson.map((dps) => (
                <option key={dps.dpsId} value={dps.dpsId}>
                  DPS {dps.dpsNumber}: {dps.dpsTitle}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <div className="mt-6">
        {loading ? <LoadingState label="Loading assignable DPS..." /> : null}
        {error ? <TeacherAssignError error={error} /> : null}
        {message ? <div className="mb-5 rounded-[24px] border border-emerald-200 bg-emerald-50 p-4 font-black text-emerald-700">{message}</div> : null}

        {!loading && !dpsForLevel.length ? (
          <EmptyState message="No published DPS is available for this level yet. Please ask Admin to publish practice content from Learning Path Studio." />
        ) : null}

        {!loading && dpsForLevel.length > 0 && !selectedLesson ? (
          <EmptyState message="Select a lesson to see eligible students -- then either assign one sheet or all sheets in that lesson at once." />
        ) : null}

        {selectedLesson ? (
          <section className="math-card p-5 sm:p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="math-block-header">
                  <UserCheck size={14} />
                  Eligible students
                </p>
                <h2 className="text-2xl font-black text-slate-950">
                  {selectedDps ? selectedDps.dpsTitle : `Lesson ${selectedLesson.lessonNumber}: ${selectedLesson.lessonTitle}`}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedDps
                    ? `Only students in ${selectedDps.levelCode} can be selected.`
                    : `All ${dpsForLesson.length} sheet(s) in this lesson -- only students in ${selectedLesson.levelCode} can be selected.`}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:w-auto">
                <button
                  type="button"
                  className="math-button-secondary w-full justify-center whitespace-nowrap"
                  disabled={!eligibleStudentIds.length}
                  onClick={toggleSelectAllStudents}
                >
                  <Users size={18} />
                  {allEligibleSelected ? "Deselect All" : "Select All Students"}
                </button>
                <button
                  type="button"
                  className="math-button-secondary w-full justify-center whitespace-nowrap"
                  disabled={!selectedDps || !eligibleStudentIds.length || mutation.isPending}
                  title={!selectedDps ? "Choose a specific DPS sheet to use this." : undefined}
                  onClick={openAssignAllConfirmation}
                >
                  <ClipboardPlus size={18} />
                  {mutation.isPending && assignMode === "all" ? "Assigning All..." : "Assign All Eligible"}
                </button>
                <button
                  type="button"
                  className="math-button-secondary w-full justify-center whitespace-nowrap"
                  disabled={Boolean(selectedDps) || !selectedStudentIds.length || dpsForLesson.length < 2 || bulkLessonMutation.isPending}
                  title={
                    selectedDps
                      ? "Clear the DPS Sheet selection (choose \"All Sheets In This Lesson\") to use this."
                      : dpsForLesson.length < 2
                        ? "Only one published sheet in this lesson right now."
                        : `Assign all ${dpsForLesson.length} published sheets in Lesson ${selectedLesson.lessonNumber} to the selected student(s).`
                  }
                  onClick={openAssignAllSheetsConfirmation}
                >
                  <Layers size={18} />
                  {bulkLessonMutation.isPending ? "Assigning Sheets..." : "Assign All Sheets"}
                </button>
                <button
                  type="button"
                  className="math-button-primary w-full justify-center whitespace-nowrap"
                  disabled={!selectedDps || !selectedStudentIds.length || mutation.isPending}
                  title={!selectedDps ? "Choose a specific DPS sheet to use this." : undefined}
                  onClick={assignSelectedStudents}
                >
                  <Send size={18} /> {mutation.isPending && assignMode === "selected" ? "Assigning..." : `Assign to ${selectedStudentIds.length} Student(s)`}
                </button>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                className="math-button-secondary w-full justify-center gap-2 whitespace-nowrap"
                disabled={!selectedStudentIds.length || Boolean(dpsId) || !dpsForLesson.length || scheduleMutation.isPending}
                title={
                  dpsId
                    ? "Clear the DPS Sheet selection (choose \"All Sheets In This Lesson\") to use this."
                    : `Schedule ${dpsForLesson.length} sheet(s) across Mon-Fri for the selected student(s).`
                }
                onClick={openScheduleConfirmation}
              >
                <CalendarDays size={18} />
                {scheduleMutation.isPending ? "Scheduling..." : "Schedule Across The Week (Mon-Fri)"}
              </button>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {eligibleStudents.map((student) => (
                <label key={student.studentId} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-slate-200 bg-white/80 p-4 transition hover:border-blue-300 hover:bg-blue-50">
                  <input type="checkbox" checked={selectedStudentIds.includes(student.studentId)} onChange={() => toggleStudent(student.studentId)} />
                  <div>
                    <p className="font-black text-slate-950">{student.studentName}</p>
                    <p className="text-sm text-slate-500"><span className="text-xs font-black uppercase tracking-[0.12em] text-[#7a1f58] dark:text-rose-100">{student.studentCode}</span> · Class {student.className || "-"} {student.section || ""}</p>
                  </div>
                </label>
              ))}
            </div>

            {!eligibleStudents.length ? <p className="mt-5 text-sm font-bold text-slate-500">No eligible active students for this DPS level.</p> : null}
          </section>
        ) : null}
      </div>

      {showAssignAllConfirm && selectedDps ? (
        <div className="fixed inset-x-0 bottom-0 top-[92px] z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-xl rounded-[32px] border border-[color:var(--mp-role-border)] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--mp-role-soft)] text-[color:var(--mp-role-readable)]">
                  <ClipboardPlus size={22} />
                </div>
                <div>
                  <p className="math-block-header">
                    <CheckCircle2 size={14} />
                    Confirm Assignment
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Assign DPS to eligible students?</h2>
                </div>
              </div>
              <button
                type="button"
                className="math-role-action-button h-11 w-11 justify-center rounded-2xl p-0"
                onClick={() => setShowAssignAllConfirm(false)}
                aria-label="Close confirmation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">DPS Sheet</p>
                <p className="mt-1 text-base font-black text-slate-950 dark:text-white">{selectedDps.dpsTitle}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-950">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Level</p>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{selectedDps.levelCode}</p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-950">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Eligible Students</p>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{eligibleStudentIds.length}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-3 rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm font-bold leading-6">
                This will assign the selected DPS to every eligible active student in this level. Students will see the sheet in their Practice tab immediately.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="math-button-secondary"
                onClick={() => setShowAssignAllConfirm(false)}
                disabled={mutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="math-button-primary"
                onClick={confirmAssignAllEligibleStudents}
                disabled={mutation.isPending}
              >
                <ClipboardPlus size={18} />
                {mutation.isPending && assignMode === "all" ? "Assigning..." : "Confirm Assignment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignAllSheetsConfirm && selectedLesson ? (
        <div className="fixed inset-x-0 bottom-0 top-[92px] z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-xl rounded-[32px] border border-[color:var(--mp-role-border)] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--mp-role-soft)] text-[color:var(--mp-role-readable)]">
                  <Layers size={22} />
                </div>
                <div>
                  <p className="math-block-header">
                    <CheckCircle2 size={14} />
                    Confirm Bulk Assignment
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Assign all sheets in this lesson?</h2>
                </div>
              </div>
              <button
                type="button"
                className="math-role-action-button h-11 w-11 justify-center rounded-2xl p-0"
                onClick={() => setShowAssignAllSheetsConfirm(false)}
                aria-label="Close confirmation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Lesson</p>
                <p className="mt-1 text-base font-black text-slate-950 dark:text-white">
                  {selectedLesson.levelCode} · Lesson {selectedLesson.lessonNumber} - {selectedLesson.lessonTitle}
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-950">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Sheets To Assign</p>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{dpsForLesson.length}</p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-950">
                  <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Selected Students</p>
                  <p className="mt-1 text-lg font-black text-slate-950 dark:text-white">{selectedStudentIds.length}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 flex gap-3 rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm font-bold leading-6">
                This will assign every published practice sheet in this lesson to the selected student(s) in one go.
                Any sheet a student already has (or has completed) is skipped automatically, same as assigning one sheet at a time.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="math-button-secondary"
                onClick={() => setShowAssignAllSheetsConfirm(false)}
                disabled={bulkLessonMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="math-button-primary"
                onClick={confirmAssignAllSheets}
                disabled={bulkLessonMutation.isPending}
              >
                <Layers size={18} />
                {bulkLessonMutation.isPending ? "Assigning..." : "Confirm Assignment"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showScheduleConfirm && selectedLesson ? (
        <div className="fixed inset-x-0 bottom-0 top-[92px] z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-8 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-xl rounded-[32px] border border-[color:var(--mp-role-border)] bg-white p-6 shadow-[0_30px_90px_rgba(15,23,42,0.28)] dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--mp-role-soft)] text-[color:var(--mp-role-readable)]">
                  <CalendarDays size={22} />
                </div>
                <div>
                  <p className="math-block-header">
                    <CalendarDays size={14} />
                    Schedule The Week
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Pick a date for each sheet</h2>
                </div>
              </div>
              <button
                type="button"
                className="math-role-action-button h-11 w-11 justify-center rounded-2xl p-0"
                onClick={() => setShowScheduleConfirm(false)}
                aria-label="Close confirmation"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 space-y-3 rounded-[24px] border border-slate-200 bg-slate-50/80 p-5 dark:border-slate-800 dark:bg-slate-900/70">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Lesson</p>
                <p className="mt-1 text-base font-black text-slate-950 dark:text-white">
                  {selectedLesson.levelCode} · Lesson {selectedLesson.lessonNumber} - {selectedLesson.lessonTitle}
                </p>
              </div>
              <div className="space-y-2">
                {dpsForLesson.map((dps) => {
                  const dateValue = scheduleDates[dps.dpsId] || "";
                  const isWeekend = IsWeekendDateStr(dateValue);
                  return (
                    <div key={dps.dpsId} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-950">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="min-w-0 truncate text-sm font-black text-slate-950 dark:text-white">
                          DPS {dps.dpsNumber}: {dps.dpsTitle}
                        </p>
                        <input
                          type="date"
                          className="math-select w-full sm:w-auto"
                          value={dateValue}
                          onChange={(e) => setScheduleDates((prev) => ({ ...prev, [dps.dpsId]: e.target.value }))}
                        />
                      </div>
                      {isWeekend ? (
                        <p className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-700">
                          <AlertTriangle size={14} className="shrink-0" />
                          This date falls on a weekend -- practice sheets are usually scheduled Mon-Fri.
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-5 flex gap-3 rounded-[22px] border border-amber-200 bg-amber-50 p-4 text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <p className="text-sm font-bold leading-6">
                Each sheet unlocks for the selected student(s) at the start of its date (IST) and stays visible after that -- earlier sheets remain available once later ones unlock too. Weekend dates are allowed but will show a warning above.
              </p>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="math-button-secondary"
                onClick={() => setShowScheduleConfirm(false)}
                disabled={scheduleMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="math-button-primary"
                onClick={confirmSchedule}
                disabled={scheduleMutation.isPending || dpsForLesson.some((dps) => !scheduleDates[dps.dpsId])}
              >
                <CalendarDays size={18} />
                {scheduleMutation.isPending ? "Scheduling..." : "Confirm Schedule"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
