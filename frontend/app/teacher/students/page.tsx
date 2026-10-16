"use client";

import { DemoTag } from "@/components/common/DemoAccounts";
import { AppShell } from "@/components/common/AppShell";
import { SortableHeader } from "@/components/common/SortableHeader";
import { SortByDropdown } from "@/components/common/SortByDropdown";
import { compareSortValues, useSortableTable, type SortFieldOption } from "@/lib/sortable";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { BenchmarkBadge, BenchmarkAlert } from "@/components/common/BenchmarkBadge";
import { LessonProgressBadge } from "@/components/common/LessonProgressBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTimeCompact } from "@/lib/date";
import { getTeacherAssignmentTracker, getTeacherStudents, type TeacherStudent } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  LayoutGrid,
  Search,
  Target,
  TrendingUp,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  uniqueAssignedConceptCount,
  uniqueClearedConceptCount,
  uniqueNeedsReattemptCount,
  uniquePendingConceptCount,
} from "@/components/common/DetailWorkspaceViews";
import { useRouter } from "next/navigation";

// 2026-09-02 -- "latest" (Latest Activity) removed: the Students tab already
// showed both Latest Activity and Last Seen side by side, which was
// redundant (both derived from the same underlying attempt/session
// activity) and was one of the table's widest columns. Dropping it frees
// real width for the no-scroll/no-wrap layout below without losing any
// information the teacher didn't already have via Last Seen.
type TeacherStudentSortKey = "studentCode" | "studentName" | "level" | "status" | "assigned" | "completed" | "pending" | "accuracy" | "lastSeen" | "attention";

const TEACHER_STUDENT_SORT_FIELDS: SortFieldOption<TeacherStudentSortKey>[] = [
  { key: "studentName", label: "Student Name" },
  { key: "studentCode", label: "Student Code" },
  { key: "level", label: "Level" },
  { key: "status", label: "Status" },
  { key: "assigned", label: "Assigned" },
  { key: "completed", label: "Cleared" },
  { key: "pending", label: "Pending" },
  { key: "accuracy", label: "Average Accuracy" },
  { key: "lastSeen", label: "Last Seen" },
  { key: "attention", label: "Attention" },
];

function AccuracyToneClass(Value: number) {
  if (Value > 70) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (Value >= 60) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}




function attentionTone(attention?: string | null) {
  if (attention === "ON_TRACK") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (attention === "BELOW_BENCHMARK") return "border-rose-200 bg-rose-50 text-rose-700";
  if (attention === "NEEDS_PRACTICE") return "border-amber-200 bg-amber-50 text-amber-700";
  if (attention === "NEEDS_FOLLOW_UP") return "border-rose-200 bg-rose-50 text-rose-700";
  if (attention === "NO_ATTEMPT_YET") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function attentionLabel(attention?: string | null) {
  if (attention === "ON_TRACK") return "On Track";
  if (attention === "BELOW_BENCHMARK") return "Needs Re-Attempt";
  if (attention === "NEEDS_PRACTICE") return "Needs Practice";
  if (attention === "NEEDS_FOLLOW_UP") return "Needs Follow-up";
  if (attention === "NO_ATTEMPT_YET") return "No Attempt Yet";
  if (attention === "NO_ASSIGNMENT") return "No Assignment";
  return "Review";
}

function normalizeTrackerStatus(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z]/g, "");
}

function trackerAccuracy(row: Record<string, any>) {
  const value = row.accuracy ?? row.accuracyPercentage ?? row.latestAccuracy ?? row.bestAccuracy ?? 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function trackerAccuracyRawValue(row: Record<string, any>) {
  return row.accuracy ?? row.accuracyPercentage ?? row.averageAccuracy;
}

function trackerHasAccuracyValue(row: Record<string, any>) {
  const RawValue = trackerAccuracyRawValue(row);
  return RawValue !== null && RawValue !== undefined && RawValue !== "" && !Number.isNaN(Number(RawValue));
}

function trackerScopedAccuracy(row: Record<string, any>) {
  const NumericValue = Number(trackerAccuracyRawValue(row));
  return Number.isFinite(NumericValue) ? NumericValue : 0;
}

// Rule A (2026-10-14): every submitted try counts once, across every level
// (was the average of per-level averages). Null, never 0, when the student
// has no completed, scored try -- a fake 0 would drag the team average down.
function trackerHierarchyAverageAccuracy(rows: Record<string, any>[]): number | null {
  const AccuracyValues = rows
    .flatMap(trackerAttemptRows)
    .filter((Row) => trackerCompleted(Row) && trackerHasAccuracyValue(Row))
    .map(trackerScopedAccuracy);
  if (!AccuracyValues.length) return null;
  return Math.round(AccuracyValues.reduce((Sum, Value) => Sum + Value, 0) / AccuracyValues.length);
}

function trackerCompleted(row: Record<string, any>) {
  const status = normalizeTrackerStatus(row.status ?? row.attemptStatus ?? row.benchmarkStatus);
  return (
    status.includes("SUBMITTED") ||
    status.includes("COMPLETED") ||
    status.includes("CLEARED") ||
    status.includes("AUTOSUBMITTED") ||
    status.includes("NEEDSREATTEMPT") ||
    status.includes("BELOWBENCHMARK") ||
    Boolean(row.completedAt || row.submittedAt || row.completedDate || row.latestCompletedAt)
  );
}

function trackerAttemptRows(row: Record<string, any>) {
  const history = Array.isArray(row.attemptHistory) ? row.attemptHistory : [];
  if (!history.length) return [row];
  return history.map((attemptRow: Record<string, any>) => ({ ...row, ...attemptRow }));
}

// 2026-10-14 (Shailesh: the numbers must agree on every page): a student
// needs a re-attempt when any of their DPS does, by the same shared DPS state
// the Practice Tracker counts with.
function buildCurrentNeedsReattemptStudents(rows: Record<string, any>[]) {
  const studentCodes = new Set<string>();
  const byStudent = new Map<string, Record<string, any>[]>();
  rows.forEach((row) => {
    const studentCode = String(row.studentCode || "");
    if (!studentCode) return;
    byStudent.set(studentCode, [...(byStudent.get(studentCode) || []), row]);
  });
  byStudent.forEach((studentRows, studentCode) => {
    if (uniqueNeedsReattemptCount(studentRows) > 0) studentCodes.add(studentCode);
  });
  return studentCodes;
}


type StudentPracticeMetric = {
  assigned: number;
  cleared: number;
  pending: number;
  needsReattempt: number;
  averageAccuracy: number | null;
};

// Assigned / Cleared / Pending / Needs Re-Attempt per student, counted
// exactly as the Practice Tracker and its student page count them (each DPS
// once, by its shared state), so this list and those pages always agree.
function buildStudentPracticeMetrics(rows: Record<string, any>[]) {
  const StudentRows = new Map<string, Record<string, any>[]>();
  rows.forEach((Row) => {
    const StudentCode = String(Row.studentCode || "");
    if (!StudentCode) return;
    StudentRows.set(StudentCode, [...(StudentRows.get(StudentCode) || []), Row]);
  });
  const Metrics = new Map<string, StudentPracticeMetric>();
  StudentRows.forEach((Rows, StudentCode) => {
    Metrics.set(StudentCode, {
      assigned: uniqueAssignedConceptCount(Rows),
      cleared: uniqueClearedConceptCount(Rows),
      pending: uniquePendingConceptCount(Rows),
      needsReattempt: uniqueNeedsReattemptCount(Rows),
      averageAccuracy: trackerHierarchyAverageAccuracy(Rows),
    });
  });
  return Metrics;
}

function studentMetricValue(
  Metrics: Map<string, StudentPracticeMetric>,
  Student: TeacherStudent,
  Field: keyof StudentPracticeMetric,
  Fallback: number = 0,
): number {
  const Metric = Metrics.get(Student.studentCode);
  const Value = Metric?.[Field];
  return typeof Value === "number" && Number.isFinite(Value) ? Value : Fallback;
}

function effectiveAttention(student: TeacherStudent, currentNeedsReattemptStudentCodes: Set<string>) {
  const pending = (student.pendingAssignments ?? 0) + (student.inProgressAssignments ?? 0);
  if (currentNeedsReattemptStudentCodes.has(student.studentCode)) return "BELOW_BENCHMARK";
  if (pending > 0) return "NEEDS_FOLLOW_UP";
  if ((student.assignedAssignments ?? 0) <= 0) return "NO_ASSIGNMENT";
  return "ON_TRACK";
}


export default function TeacherStudentsPage() {
  const ready = useProtectedPage(["TEACHER"]);
  const TeacherStudentsStateKey = CreatePersistedUiStateKey("teacher", "students");
  const [search, setSearch] = usePersistentUiState(CreatePersistedUiStateKey(TeacherStudentsStateKey, "search"), "");
  const [moduleFilter, setModuleFilter] = usePersistentUiState(CreatePersistedUiStateKey(TeacherStudentsStateKey, "module-filter"), "");
  const [levelFilter, setLevelFilter] = usePersistentUiState(CreatePersistedUiStateKey(TeacherStudentsStateKey, "level-filter"), "");
  const router = useRouter();
  const query = useQuery({ queryKey: ["teacher-students"], queryFn: getTeacherStudents, enabled: ready });
  const trackerQuery = useQuery({ queryKey: ["teacher-assignment-tracker-current-state"], queryFn: getTeacherAssignmentTracker, enabled: ready });

  const students = query.data ?? [];
  // 2026-10-14: the per-student numbers come from the tracker. Until it has
  // loaded, the page used to show the raw assignment counts from the student
  // list (every try's assignment, e.g. Assigned 942 / Pending 286 live) and
  // then jump to the real numbers (679 / 220). Wait for both instead; if the
  // tracker fails, fall back to the student-list numbers as before.
  const isLoadingNumbers = query.isLoading || trackerQuery.isLoading;
  const trackerRows = useMemo(
    () => (trackerQuery.data?.rows ?? []) as Record<string, any>[],
    [trackerQuery.data],
  );
  const scopedTrackerRows = useMemo(() => {
    return trackerRows.filter((Row) => {
      const RowModuleCode = String(Row.moduleCode || Row.moduleId || "");
      const RowLevelCode = String(Row.levelCode || Row.levelId || Row.level || "");

      return (
        (!moduleFilter || moduleFilter === "ALL" || RowModuleCode === moduleFilter) &&
        (!levelFilter || levelFilter === "ALL" || RowLevelCode === levelFilter)
      );
    });
  }, [trackerRows, moduleFilter, levelFilter]);

  const currentNeedsReattemptStudentCodes = useMemo(
    () => buildCurrentNeedsReattemptStudents(scopedTrackerRows),
    [scopedTrackerRows],
  );
  const studentPracticeMetrics = useMemo(
    () => buildStudentPracticeMetrics(scopedTrackerRows),
    [scopedTrackerRows],
  );

  const moduleOptions = useMemo(() => {
    const Options = new Map<string, string>();
    students.forEach((Student) => {
      const Code = Student.currentModuleCode || "";
      if (!Code) return;
      Options.set(Code, Code);
    });
    return Array.from(Options.entries()).sort((First, Second) =>
      First[0].localeCompare(Second[0], undefined, { numeric: true, sensitivity: "base" }),
    );
  }, [students]);

  const levelOptions = useMemo(() => {
    const Options = new Map<string, string>();
    students.forEach((Student) => {
      if (moduleFilter && moduleFilter !== "ALL" && Student.currentModuleCode !== moduleFilter) return;
      const Code = Student.currentLevelCode || "";
      if (!Code) return;
      Options.set(Code, Code);
    });
    return Array.from(Options.entries()).sort((First, Second) =>
      First[0].localeCompare(Second[0], undefined, { numeric: true, sensitivity: "base" }),
    );
  }, [students, moduleFilter]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return students.filter((student) => {
      const moduleOk = !moduleFilter || moduleFilter === "ALL" || student.currentModuleCode === moduleFilter;
      const levelOk = !levelFilter || levelFilter === "ALL" || student.currentLevelCode === levelFilter;
      const searchOk =
        !q ||
        [
          student.studentName,
          student.studentCode,
          student.className,
          student.section,
          student.currentModuleCode,
          student.currentLevelCode,
          student.status,
          attentionLabel(effectiveAttention(student, currentNeedsReattemptStudentCodes)),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      return moduleOk && levelOk && searchOk;
    });
  }, [students, search, moduleFilter, levelFilter, currentNeedsReattemptStudentCodes]);

  const {
    sortKey,
    sortDirection,
    sortedRows: filtered,
    toggleSort,
    setSort: setSortState,
  } = useSortableTable<TeacherStudent, TeacherStudentSortKey>({
    rows: filteredRows,
    valueFor: (student, key) => {
      if (key === "studentCode") return student.studentCode;
      if (key === "studentName") return student.studentName;
      if (key === "level") return student.currentLevelCode;
      if (key === "status") return student.status;
      if (key === "assigned") return studentMetricValue(studentPracticeMetrics, student, "assigned", student.assignedAssignments ?? 0);
      if (key === "completed") return studentMetricValue(studentPracticeMetrics, student, "cleared", student.completedAssignments ?? student.completedAttempts ?? 0);
      if (key === "pending") return studentMetricValue(studentPracticeMetrics, student, "pending", (student.pendingAssignments ?? 0) + (student.inProgressAssignments ?? 0));
      if (key === "lastSeen") return student.lastActiveAt || "";
      if (key === "accuracy") return studentPracticeMetrics.get(student.studentCode)?.averageAccuracy ?? student.averageAccuracy ?? student.latestAccuracy ?? 0;
      return attentionLabel(effectiveAttention(student, currentNeedsReattemptStudentCodes));
    },
    naturalOrder: (rows) => rows.slice().sort((a, b) => compareSortValues(a.studentCode, b.studentCode)),
    storageKey: CreatePersistedUiStateKey(TeacherStudentsStateKey, "sort-state"),
  });


  const summary = useMemo(() => {
    const VisibleStudents = filtered;
    const assigned = VisibleStudents.reduce((sum, s) => sum + studentMetricValue(studentPracticeMetrics, s, "assigned", s.assignedAssignments ?? 0), 0);
    const completed = VisibleStudents.reduce((sum, s) => sum + studentMetricValue(studentPracticeMetrics, s, "cleared", s.completedAssignments ?? 0), 0);
    const pending = VisibleStudents.reduce((sum, s) => sum + studentMetricValue(studentPracticeMetrics, s, "pending", (s.pendingAssignments ?? 0) + (s.inProgressAssignments ?? 0)), 0);
    const accuracyValues = VisibleStudents.map((Student) => {
      const MetricAccuracy = studentPracticeMetrics.get(Student.studentCode)?.averageAccuracy;
      if (typeof MetricAccuracy === "number" && Number.isFinite(MetricAccuracy)) return MetricAccuracy;
      // Student.averageAccuracy is `null` (not 0) from the backend when a
      // student has zero completed attempts. Number(null) evaluates to 0 in
      // JavaScript, not NaN -- calling Number() first before checking for
      // null/undefined let every no-data student's absence of a score slip
      // through as a fake real 0, silently recreating the exact dilution bug
      // this fix was meant to close. Guard against null/undefined explicitly
      // before the numeric conversion.
      if (Student.averageAccuracy === null || Student.averageAccuracy === undefined) return null;
      const FallbackAccuracy = Number(Student.averageAccuracy);
      return Number.isFinite(FallbackAccuracy) ? FallbackAccuracy : null;
    }).filter((value): value is number => value !== null);
    const avgAccuracy = accuracyValues.length
      ? Math.round(accuracyValues.reduce((a, b) => a + b, 0) / accuracyValues.length)
      : null;

    return {
      students: VisibleStudents.length,
      inactive: VisibleStudents.filter((Student) => Student.isActive === false).length,
      assigned,
      completed,
      pending,
      avgAccuracy,
    };
  }, [filtered, studentPracticeMetrics]);


  if (!ready) return null;

  return (
    <AppShell title="My Students">
      <section className="math-hero">
        <div className="te-hero-stack relative z-10">
          <div>
            <p className="math-block-header">
              <UsersRound size={14} />
              Teacher Students
            </p>
            <h1 className="math-title">My Students</h1>
            <p className="math-subtitle">
              Monitor assigned learners through completion, pending work, average accuracy, and follow-up priority.
            </p>
          </div>

          <div className="te-hero-tiles">
            <Metric
              label="Students"
              value={isLoadingNumbers ? "…" : summary.students}
              helper={!isLoadingNumbers && summary.inactive ? `${summary.inactive} inactive` : undefined}
              icon={<UsersRound size={18} />}
            />
            <Metric label="Assigned" value={isLoadingNumbers ? "…" : summary.assigned} icon={<Target size={18} />} />
            <Metric label="Pending" value={isLoadingNumbers ? "…" : summary.pending} icon={<XCircle size={18} />} />
            <Metric label="Average Accuracy" value={isLoadingNumbers ? "…" : summary.avgAccuracy === null ? "—" : `${summary.avgAccuracy}%`} icon={<TrendingUp size={18} />} />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <div>
            <p className="math-block-header">
              <LayoutGrid size={14} />
              Student Overview
            </p>
            <h2 className="text-2xl font-black text-slate-950 dark:text-white">Learning Progress Snapshot</h2>
            <p className="mt-1 text-sm text-slate-600">
              Focus on pending work, completion, average accuracy, and last seen.
            </p>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px] xl:grid-cols-[minmax(320px,1fr)_220px_220px_260px]">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                className="math-input pl-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Students"
              />
            </div>
            <select
              className="math-input"
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setLevelFilter("");
              }}
            >
              <option value="">Choose Module</option>
              <option value="ALL">All Modules</option>
              {moduleOptions.map(([Code, Label]) => (
                <option key={Code} value={Code}>
                  {Label}
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            >
              <option value="">Choose Level</option>
              <option value="ALL">All Levels</option>
              {levelOptions.map(([Code, Label]) => (
                <option key={Code} value={Code}>
                  {Label}
                </option>
              ))}
            </select>
            <SortByDropdown
              fields={TEACHER_STUDENT_SORT_FIELDS}
              sortKey={sortKey}
              direction={sortDirection}
              onChange={setSortState}
            />
          </div>
        </div>
      </section>

      <section className="mt-6">
        {!isLoadingNumbers && currentNeedsReattemptStudentCodes.size > 0 ? (
          <div className="mb-5"><BenchmarkAlert show message="Caution: One or more students currently need re-attempt support. Please review them closely and provide corrective support." /></div>
        ) : null}
        {isLoadingNumbers ? <LoadingState label="Loading students..." /> : null}
        {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

        {!isLoadingNumbers && !query.error && !filtered.length ? (
          <EmptyState message="No assigned students found." />
        ) : null}

        {!isLoadingNumbers && filtered.length ? (
          <div className="math-table math-teacher-students-directory-table">
            <table className="te-cards">
              <thead>
                <tr>
                  <th><SortableHeader active={sortKey === "studentName"} direction={sortDirection} onClick={() => toggleSort("studentName")}>Student</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "level"} direction={sortDirection} onClick={() => toggleSort("level")}>Level</SortableHeader></th>
                  <th>Lesson</th>
                  <th><SortableHeader active={sortKey === "assigned"} direction={sortDirection} onClick={() => toggleSort("assigned")}>Assigned</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "completed"} direction={sortDirection} onClick={() => toggleSort("completed")}>Cleared</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "pending"} direction={sortDirection} onClick={() => toggleSort("pending")}>Pending</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "accuracy"} direction={sortDirection} onClick={() => toggleSort("accuracy")}>Avg Accuracy</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "lastSeen"} direction={sortDirection} onClick={() => toggleSort("lastSeen")}>Last Seen</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "attention"} direction={sortDirection} onClick={() => toggleSort("attention")}>Attention</SortableHeader></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((student) => (
                  <StudentRow key={student.studentId} student={student} metric={studentPracticeMetrics.get(student.studentCode)} attention={effectiveAttention(student, currentNeedsReattemptStudentCodes)} onOpen={() => router.push(`/teacher/assignment-tracker/student/${student.studentCode}?targetAction=lesson-insights-student-review`)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function StudentRow({ student, metric, attention, onOpen }: { student: TeacherStudent; metric?: StudentPracticeMetric; attention: string; onOpen: () => void }) {
  const assigned = metric?.assigned ?? student.assignedAssignments ?? 0;
  const cleared = metric?.cleared ?? student.completedAssignments ?? 0;
  const pending = metric?.pending ?? (student.pendingAssignments ?? 0) + (student.inProgressAssignments ?? 0);
  const averageAccuracy = metric?.averageAccuracy ?? student.averageAccuracy;

  return (
    <tr
      className="cursor-pointer transition hover:bg-[color:var(--mp-role-soft)] focus-within:bg-[color:var(--mp-role-soft)]"
      tabIndex={0}
      role="button"
      aria-label={`Open practice review for ${student.studentName}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <td className="te-card-title">
        <div className="flex items-center gap-3">
          <ProfileAvatar
            name={student.studentName}
            imageUrl={student.photoUrl}
            role="STUDENT"
            className="math-record-avatar-student h-11 w-11 text-xs"
          />
          <div className="min-w-0">
            <p className="te-name">
              {student.studentName}
              {student.isActive === false ? <span className="te-tag" title="This account is switched off: the student cannot sign in.">Inactive</span> : null}
              <DemoTag studentId={student.studentId} studentCode={student.studentCode} />
            </p>
            <p className="te-code">{student.studentCode}</p>
          </div>
        </div>
      </td>
      <td data-label="Level">
        <p className="font-black text-slate-900 dark:text-white">{student.currentLevelCode || "—"}</p>
      </td>
      <td data-label="Lesson">
        <LessonProgressBadge
          currentLessonNumber={student.currentLessonNumber}
          clearedInCurrentLesson={student.clearedInCurrentLesson}
          totalInCurrentLesson={student.totalInCurrentLesson}
          levelComplete={student.levelComplete}
          previousLessonNumber={student.previousLessonNumber}
          currentLessonStatus={student.currentLessonStatus}
          isNewToLevel={student.isNewToLevel}
        />
      </td>
      <td data-label="Assigned">
        <span className="math-badge border-blue-200 bg-blue-50 text-blue-700">
          {assigned}
        </span>
      </td>
      <td data-label="Cleared">
        <span className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700">
          <CheckCircle2 size={14} />
          {cleared}
        </span>
      </td>
      <td data-label="Pending">
        <span className="math-badge border-amber-200 bg-amber-50 text-amber-700">
          {pending}
        </span>
      </td>
      <td data-label="Avg Accuracy">
        <span className={`math-badge whitespace-nowrap ${typeof averageAccuracy === "number" ? AccuracyToneClass(averageAccuracy) : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          {typeof averageAccuracy === "number" ? `${Math.round(averageAccuracy)}%` : "—"}
        </span>
      </td>
      <td data-label="Last Seen" className="whitespace-nowrap text-sm font-bold text-slate-600 dark:text-slate-300">
        {student.lastActiveAt ? KeepTogether(formatMathPathDateTimeCompact(student.lastActiveAt)) : "Never"}
      </td>
      <td data-label="Attention">
        <span className={`math-badge ${attentionTone(attention)}`}>
          {attentionLabel(attention)}
        </span>
      </td>
    </tr>
  );
}

// "6 Oct, 2:09 AM" may take two lines in a narrow column; it breaks only
// after the comma, never inside "6 Oct" or "2:09 AM".
function KeepTogether(Value: string) {
  return Value.replace(/ (AM|PM)$/, "\u00a0$1").replace(/^(\d+) /, "$1\u00a0");
}

function Metric({ label, value, icon, helper }: { label: string; value: number | string; icon: React.ReactNode; helper?: string }) {
  return (
    <div className="math-teacher-light-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-[24px] border border-rose-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-rose-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      {icon && (
        <div className="math-teacher-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
          {icon}
        </div>
      )}
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700 transition-colors duration-300 group-hover:text-[var(--mp-role-primary)] dark:text-slate-300">
        {label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--mp-role-primary)] dark:text-white">
        {value}
      </p>
      {helper ? <p className="relative z-10 text-xs font-bold text-slate-600 dark:text-slate-300">{helper}</p> : null}
    </div>
  );
}
