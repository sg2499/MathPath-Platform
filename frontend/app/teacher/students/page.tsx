"use client";

import { AppShell } from "@/components/common/AppShell";
import { SortableHeader } from "@/components/common/SortableHeader";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import { BenchmarkBadge, BenchmarkAlert } from "@/components/common/BenchmarkBadge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import { getTeacherAssignmentTracker, getTeacherStudents, type TeacherStudent } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CheckCircle2,
  Search,
  Target,
  TrendingUp,
  UsersRound,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type TeacherStudentSortKey = "studentCode" | "studentName" | "className" | "level" | "status" | "assigned" | "completed" | "pending" | "accuracy" | "latest" | "attention";

type SortDirection = "asc" | "desc";

function AccuracyToneClass(Value: number) {
  if (Value > 70) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (Value >= 60) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-rose-200 bg-rose-50 text-rose-700";
}

function normalizeSortValue(value: unknown): string | number {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return value;
  const text = String(value).trim();
  const date = Date.parse(text);
  if (text && !Number.isNaN(date) && /\d{4}|\d{1,2}\/\d{1,2}/.test(text)) return date;
  return text.toLowerCase();
}

function compareSortValues(a: unknown, b: unknown) {
  const av = normalizeSortValue(a);
  const bv = normalizeSortValue(b);
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
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

function trackerLevelCode(row: Record<string, any>) {
  return String(row.levelCode || row.levelId || row.level || "Level");
}

function trackerHierarchyAverageAccuracy(rows: Record<string, any>[]): number | null {
  const AttemptRows = rows.flatMap(trackerAttemptRows);
  const LevelCodes = Array.from(new Set(AttemptRows.map(trackerLevelCode).filter(Boolean))).sort((First, Second) =>
    First.localeCompare(Second, undefined, { numeric: true }),
  );

  const LevelAverages = LevelCodes
    .map((LevelCode) => {
      const LevelRows = AttemptRows.filter((Row) => trackerLevelCode(Row) === LevelCode);
      const AccuracyValues = LevelRows
        .filter((Row) => trackerCompleted(Row) && trackerHasAccuracyValue(Row))
        .map(trackerScopedAccuracy);

      if (!AccuracyValues.length) return null;

      return Math.round(AccuracyValues.reduce((Sum, Value) => Sum + Value, 0) / AccuracyValues.length);
    })
    .filter((Value): Value is number => Value !== null);

  // A student with zero completed, scored attempts has no real accuracy to
  // report. Returning 0 here (as this used to) is indistinguishable from a
  // genuine 0% score once it flows into StudentRow's `metric?.averageAccuracy
  // ?? student.averageAccuracy` and the team-average reducer in
  // TeacherStudentsPage -- it silently reintroduces the exact null-as-zero
  // dilution bug those call sites already guard against, because this fake 0
  // wins before their null checks ever run. Return null so "no data" stays
  // "no data" all the way up.
  if (!LevelAverages.length) return null;

  return Math.round(LevelAverages.reduce((Sum, Value) => Sum + Value, 0) / LevelAverages.length);
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

function trackerCleared(row: Record<string, any>) {
  const status = normalizeTrackerStatus(row.status ?? row.attemptStatus ?? row.benchmarkStatus);
  if (status.includes("CLEARED")) return true;
  if (status.includes("NEEDSREATTEMPT") || status.includes("BELOWBENCHMARK") || status.includes("REATTEMPTAVAILABLE")) return false;
  return trackerCompleted(row) && trackerAccuracy(row) >= 70;
}

function trackerNeedsReattempt(row: Record<string, any>) {
  const status = normalizeTrackerStatus(row.status ?? row.attemptStatus ?? row.benchmarkStatus);
  if (trackerCleared(row)) return false;
  return (
    status.includes("NEEDSREATTEMPT") ||
    status.includes("BELOWBENCHMARK") ||
    status.includes("REATTEMPTAVAILABLE") ||
    (trackerCompleted(row) && trackerAccuracy(row) < 70)
  );
}

function trackerAttemptRows(row: Record<string, any>) {
  const history = Array.isArray(row.attemptHistory) ? row.attemptHistory : [];
  if (!history.length) return [row];
  return history.map((attemptRow: Record<string, any>) => ({ ...row, ...attemptRow }));
}

function trackerWorkKey(row: Record<string, any>) {
  return String(
    [
      row.moduleCode || row.moduleId || "module",
      row.levelCode || row.levelId || "level",
      row.lessonId || row.lessonNumber || row.lessonTitle || "lesson",
      row.dpsId || row.dpsNumber || row.dpsTitle || row.title || "work",
    ].join("::"),
  );
}

function buildCurrentNeedsReattemptStudents(rows: Record<string, any>[]) {
  const workMap = new Map<string, Record<string, any>[]>();

  rows.forEach((row) => {
    const studentCode = String(row.studentCode || "");
    if (!studentCode) return;
    const key = `${studentCode}::${trackerWorkKey(row)}`;
    if (!workMap.has(key)) workMap.set(key, []);
    workMap.get(key)!.push(...trackerAttemptRows(row));
  });

  const studentCodes = new Set<string>();
  workMap.forEach((attemptRows) => {
    const cleared = attemptRows.some(trackerCleared);
    const needsReattempt = attemptRows.some(trackerNeedsReattempt);
    if (!cleared && needsReattempt) {
      const studentCode = String(attemptRows[0]?.studentCode || "");
      if (studentCode) studentCodes.add(studentCode);
    }
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

function buildStudentPracticeMetrics(rows: Record<string, any>[]) {
  const ConceptMap = new Map<string, Record<string, any>[]>();

  rows.forEach((Row) => {
    const StudentCode = String(Row.studentCode || "");
    if (!StudentCode) return;
    const Key = `${StudentCode}::${trackerWorkKey(Row)}`;
    if (!ConceptMap.has(Key)) ConceptMap.set(Key, []);
    ConceptMap.get(Key)!.push(...trackerAttemptRows(Row));
  });

  const Metrics = new Map<string, StudentPracticeMetric>();
  const StudentRows = new Map<string, Record<string, any>[]>();

  rows.forEach((Row) => {
    const StudentCode = String(Row.studentCode || "");
    if (!StudentCode) return;
    const ExistingRows = StudentRows.get(StudentCode) || [];
    ExistingRows.push(Row);
    StudentRows.set(StudentCode, ExistingRows);
  });

  ConceptMap.forEach((AttemptRows) => {
    const StudentCode = String(AttemptRows[0]?.studentCode || "");
    if (!StudentCode) return;
    const Metric = Metrics.get(StudentCode) || {
      assigned: 0,
      cleared: 0,
      pending: 0,
      needsReattempt: 0,
      averageAccuracy: null,
    };

    const Cleared = AttemptRows.some(trackerCleared);
    const Pending = AttemptRows.some((AttemptRow) => !trackerCompleted(AttemptRow));
    const NeedsReattempt = !Cleared && AttemptRows.some(trackerNeedsReattempt);
    Metric.assigned += 1;
    if (Cleared) Metric.cleared += 1;
    if (Pending) Metric.pending += 1;
    if (NeedsReattempt) Metric.needsReattempt += 1;

    Metrics.set(StudentCode, Metric);
  });

  StudentRows.forEach((Rows, StudentCode) => {
    const Metric = Metrics.get(StudentCode) || {
      assigned: 0,
      cleared: 0,
      pending: 0,
      needsReattempt: 0,
      averageAccuracy: null,
    };

    Metric.averageAccuracy = trackerHierarchyAverageAccuracy(Rows);
    Metrics.set(StudentCode, Metric);
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
  const [sortKey, setSortKey] = usePersistentUiState<TeacherStudentSortKey>(CreatePersistedUiStateKey(TeacherStudentsStateKey, "sort-key"), "studentCode");
  const [sortDirection, setSortDirection] = usePersistentUiState<SortDirection>(CreatePersistedUiStateKey(TeacherStudentsStateKey, "sort-direction"), "asc");
  const query = useQuery({ queryKey: ["teacher-students"], queryFn: getTeacherStudents, enabled: ready });
  const trackerQuery = useQuery({ queryKey: ["teacher-assignment-tracker-current-state"], queryFn: getTeacherAssignmentTracker, enabled: ready });

  const students = query.data ?? [];
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filteredRows = students.filter((student) => {
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

    return filteredRows.slice().sort((a, b) => {
      const valueFor = (student: TeacherStudent) => {
        if (sortKey === "studentCode") return student.studentCode;
        if (sortKey === "studentName") return student.studentName;
        if (sortKey === "className") return `${student.className || ""} ${student.section || ""}`;
        if (sortKey === "level") return student.currentLevelCode;
        if (sortKey === "status") return student.status;
        if (sortKey === "assigned") return studentMetricValue(studentPracticeMetrics, student, "assigned", student.assignedAssignments ?? 0);
        if (sortKey === "completed") return studentMetricValue(studentPracticeMetrics, student, "cleared", student.completedAssignments ?? student.completedAttempts ?? 0);
        if (sortKey === "pending") return studentMetricValue(studentPracticeMetrics, student, "pending", (student.pendingAssignments ?? 0) + (student.inProgressAssignments ?? 0));
        if (sortKey === "latest") return student.latestActivityAt || "";
        if (sortKey === "accuracy") return studentPracticeMetrics.get(student.studentCode)?.averageAccuracy ?? student.averageAccuracy ?? student.latestAccuracy ?? 0;
        return attentionLabel(effectiveAttention(student, currentNeedsReattemptStudentCodes));
      };
      const result = compareSortValues(valueFor(a), valueFor(b));
      return sortDirection === "asc" ? result : -result;
    });
  }, [students, search, moduleFilter, levelFilter, sortKey, sortDirection, currentNeedsReattemptStudentCodes, studentPracticeMetrics]);


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
      assigned,
      completed,
      pending,
      avgAccuracy,
    };
  }, [filtered, studentPracticeMetrics]);

  function toggleSort(key: TeacherStudentSortKey) {
    if (sortKey === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  if (!ready) return null;

  return (
    <AppShell title="My Students">
      <section className="math-hero">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="math-kicker">Teacher Students</p>
            <h1 className="math-title">My Students</h1>
            <p className="math-subtitle">
              Monitor assigned learners through completion, pending work, average accuracy, and follow-up priority.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <Metric label="Students" value={summary.students} icon={<UsersRound size={18} />} />
            <Metric label="Assigned" value={summary.assigned} icon={<Target size={18} />} />
            <Metric label="Pending" value={summary.pending} icon={<XCircle size={18} />} />
            <Metric label="Average Accuracy" value={summary.avgAccuracy === null ? "-" : `${summary.avgAccuracy}%`} icon={<TrendingUp size={18} />} />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="math-kicker">Student Overview</p>
            <h2 className="text-2xl font-black text-slate-950">Learning Progress Snapshot</h2>
            <p className="mt-1 text-sm text-slate-600">
              Focus on pending work, completion, average accuracy, and latest activity.
            </p>
          </div>
          <div className="grid w-full gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px] xl:max-w-3xl">
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
          </div>
        </div>
      </section>

      <section className="mt-6">
        {currentNeedsReattemptStudentCodes.size > 0 ? (
          <div className="mb-5"><BenchmarkAlert show message="Caution: One or more students currently need re-attempt support. Please review them closely and provide corrective support." /></div>
        ) : null}
        {query.isLoading ? <LoadingState label="Loading students..." /> : null}
        {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

        {!query.isLoading && !query.error && !filtered.length ? (
          <EmptyState message="No assigned students found." />
        ) : null}

        {filtered.length ? (
          <div className="math-table math-teacher-students-directory-table">
            <table>
              <thead>
                <tr>
                  <th><SortableHeader active={sortKey === "studentName"} direction={sortDirection} onClick={() => toggleSort("studentName")}>Student</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "level"} direction={sortDirection} onClick={() => toggleSort("level")}>Level</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "assigned"} direction={sortDirection} onClick={() => toggleSort("assigned")}>Assigned</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "completed"} direction={sortDirection} onClick={() => toggleSort("completed")}>Cleared</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "pending"} direction={sortDirection} onClick={() => toggleSort("pending")}>Pending</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "accuracy"} direction={sortDirection} onClick={() => toggleSort("accuracy")}>Average Accuracy</SortableHeader></th>
                  <th><SortableHeader active={sortKey === "latest"} direction={sortDirection} onClick={() => toggleSort("latest")}>Latest Activity</SortableHeader></th>
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
      <td>
        <div className="flex items-center gap-3">
          <ProfileAvatar
            name={student.studentName}
            imageUrl={student.photoUrl}
            role="STUDENT"
            className="math-record-avatar-student h-11 w-11 text-xs"
          />
          <div>
            <p className="font-black text-slate-950 dark:text-white">{student.studentName}</p>
            <p className="mt-0.5 text-xs font-black uppercase tracking-[0.12em] text-[#7a1f58] dark:text-rose-100">{student.studentCode}</p>
          </div>
        </div>
      </td>
      <td>
        <p className="font-black text-slate-900 dark:text-white">{student.currentLevelCode || "-"}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Class {student.className || "-"} {student.section || ""}
        </p>
      </td>
      <td>
        <span className="math-badge border-blue-200 bg-blue-50 text-blue-700">
          {assigned}
        </span>
      </td>
      <td>
        <span className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700">
          <CheckCircle2 size={14} />
          {cleared}
        </span>
      </td>
      <td>
        <span className="math-badge border-amber-200 bg-amber-50 text-amber-700">
          {pending}
        </span>
      </td>
      <td>
        <span className={`math-badge ${typeof averageAccuracy === "number" ? AccuracyToneClass(averageAccuracy) : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          {typeof averageAccuracy === "number" ? `${Math.round(averageAccuracy)}%` : "—"}
        </span>
        <p className="mt-1 text-xs text-slate-500">Across completed attempts</p>
      </td>
      <td>
        <div className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
          <Activity size={15} />
          {formatMathPathDateTime(student.latestActivityAt)}
        </div>
      </td>
      <td>
        <span className={`math-badge ${attentionTone(attention)}`}>
          {attentionLabel(attention)}
        </span>
      </td>
    </tr>
  );
}

function Metric({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="math-teacher-light-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-[24px] border border-rose-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-rose-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      {icon && (
        <div className="math-teacher-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
          {icon}
        </div>
      )}
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-300">
        {label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white">
        {value}
      </p>
    </div>
  );
}
