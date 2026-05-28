"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getAdminAssignments } from "@/lib/api/admin";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, Clock3, Plus, Search, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  getFirstMathPathTimestamp,
  mathPathTimestampValue,
} from "@/lib/date";
import {
  AnyRow,
  averageAccuracy,
  buildStudents,
  isBelowBenchmark,
  isCompleted,
  Metric,
  searchText,
  StudentSummaryTable,
  uniqueAssignedConceptCount,
  uniqueClearedConceptCount,
  uniquePendingConceptCount,
  uniqueNeedsReattemptCount,
} from "@/components/common/DetailWorkspaceViews";

type StatusFilter = "" | "ALL" | "ACTIVE" | "INACTIVE";

function rowModuleCode(row: AnyRow) {
  return String(row.moduleCode || row.moduleId || "Module");
}

function rowLevelCode(row: AnyRow) {
  return String(row.levelCode || row.levelId || "Level");
}

function rowTeacherKey(row: AnyRow) {
  return String(
    row.targetTeacherCode ||
      row.assignedTeacherCode ||
      row.teacherCode ||
      row.targetTeacherId ||
      row.assignedTeacherId ||
      row.teacherId ||
      row.targetTeacherName ||
      row.assignedTeacherName ||
      row.teacherName ||
      row.teacher ||
      "Unassigned",
  );
}

function rowTeacherLabel(row: AnyRow) {
  const TeacherName = String(
    row.targetTeacherName ||
      row.assignedTeacherName ||
      row.teacherName ||
      row.teacher ||
      "Unassigned",
  );
  const TeacherCode = String(
    row.targetTeacherCode ||
      row.assignedTeacherCode ||
      row.teacherCode ||
      row.teacherId ||
      "",
  );
  return TeacherCode && TeacherName !== TeacherCode
    ? `${TeacherName} (${TeacherCode})`
    : TeacherName;
}

function uniqueModuleOptions(rows: AnyRow[]) {
  return Array.from(new Set(rows.map(rowModuleCode).filter(Boolean))).sort(
    (first, second) =>
      first.localeCompare(second, undefined, { numeric: true }),
  );
}

function uniqueLevelOptions(rows: AnyRow[], moduleFilter = "") {
  const SourceRows =
    !moduleFilter || moduleFilter === "ALL"
      ? rows
      : rows.filter((row) => rowModuleCode(row) === moduleFilter);
  return Array.from(new Set(SourceRows.map(rowLevelCode).filter(Boolean))).sort(
    (first, second) =>
      first.localeCompare(second, undefined, { numeric: true }),
  );
}

function uniqueTeacherOptions(rows: AnyRow[]) {
  const TeacherMap = new Map<string, string>();
  rows.forEach((row) => {
    const Key = rowTeacherKey(row);
    if (!TeacherMap.has(Key)) TeacherMap.set(Key, rowTeacherLabel(row));
  });
  return Array.from(TeacherMap.entries()).sort((first, second) =>
    first[1].localeCompare(second[1]),
  );
}

function matchesStatus(row: AnyRow, filter: StatusFilter) {
  if (!filter || filter === "ALL") return true;
  if (filter === "ACTIVE") return row.isActive !== false;
  return row.isActive === false;
}

function attemptNumber(row: AnyRow) {
  const Raw =
    row.attemptNumber ??
    row.reattemptNumber ??
    row.retryNumber ??
    String(row.attemptLabel || row.attempt || "").match(/\d+/)?.[0];
  const Parsed = Number(Raw);
  return Number.isFinite(Parsed) ? Parsed : 0;
}

function rowTimeValue(row: AnyRow) {
  const Raw = getFirstMathPathTimestamp(row, MATHPATH_ACTIVITY_TIMESTAMP_KEYS);
  return Raw ? mathPathTimestampValue(Raw) : 0;
}

function workUnitMetricKey(row: AnyRow) {
  return String(
    [
      row.studentCode || row.studentId || row.targetStudentCode || row.targetStudentId || "student",
      row.moduleCode || row.moduleId || "module",
      row.levelCode || row.levelId || "level",
      row.lessonId || row.lessonNumber || row.lessonTitle || "lesson",
      row.dpsId || row.dpsNumber || row.dpsTitle || row.title || "work",
    ].join("::"),
  );
}

function rowsWithAttemptHistory(rows: AnyRow[]) {
  return rows.flatMap((row) => {
    const History = Array.isArray(row.attemptHistory) ? row.attemptHistory : [];
    if (!History.length) return [row];

    return History.map((AttemptRow: AnyRow, Index: number) => ({
      ...row,
      ...AttemptRow,
      attemptNumber:
        AttemptRow.attemptNumber ??
        AttemptRow.reattemptNumber ??
        AttemptRow.retryNumber ??
        Index + 1,
      attemptSequence: AttemptRow.attemptSequence ?? Index + 1,
      isReattempt: Boolean(AttemptRow.isReattempt ?? Index > 0),
      parentAssignmentId: row.assignmentId ?? row.id,
    }));
  });
}

function latestWorkRows(rows: AnyRow[]) {
  const CurrentRows = new Map<string, AnyRow>();

  rowsWithAttemptHistory(rows).forEach((row, index) => {
    const Key = workUnitMetricKey(row);
    const Existing = CurrentRows.get(Key);

    if (!Existing) {
      CurrentRows.set(Key, row);
      return;
    }

    const ExistingAttempt = attemptNumber(Existing);
    const RowAttempt = attemptNumber(row);
    const ExistingTime = rowTimeValue(Existing);
    const RowTime = rowTimeValue(row);

    if (
      RowAttempt > ExistingAttempt ||
      (RowAttempt === ExistingAttempt && RowTime >= ExistingTime) ||
      (RowAttempt === ExistingAttempt && RowTime === ExistingTime && index >= 0)
    ) {
      CurrentRows.set(Key, row);
    }
  });

  return Array.from(CurrentRows.values());
}

export default function AdminPracticeAssignmentsPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [teacherFilter, setTeacherFilter] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [levelFilter, setLevelFilter] = useState("");

  const query = useQuery({
    queryKey: ["admin-assignments"],
    queryFn: getAdminAssignments,
    enabled: ready,
  });
  const rows: AnyRow[] = query.data ?? [];

  const teacherOptions = useMemo(() => uniqueTeacherOptions(rows), [rows]);
  const moduleOptions = useMemo(() => uniqueModuleOptions(rows), [rows]);
  const levelOptions = useMemo(
    () => uniqueLevelOptions(rows, moduleFilter),
    [rows, moduleFilter],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (row) =>
        matchesStatus(row, statusFilter) &&
        (!teacherFilter ||
          teacherFilter === "ALL" ||
          rowTeacherKey(row) === teacherFilter) &&
        (!moduleFilter ||
          moduleFilter === "ALL" ||
          rowModuleCode(row) === moduleFilter) &&
        (!levelFilter ||
          levelFilter === "ALL" ||
          rowLevelCode(row) === levelFilter) &&
        (!q || searchText(row).includes(q)),
    );
  }, [rows, search, statusFilter, teacherFilter, moduleFilter, levelFilter]);

  const students = useMemo(() => buildStudents(filteredRows), [filteredRows]);
  const currentRows = useMemo(
    () => latestWorkRows(filteredRows),
    [filteredRows],
  );
  const assignedDps = uniqueAssignedConceptCount(filteredRows);
  const clearedDps = uniqueClearedConceptCount(filteredRows);
  const pendingDps = uniquePendingConceptCount(filteredRows);
  const reattemptNeeded = uniqueNeedsReattemptCount(filteredRows);
  const averageAccuracyValue = averageAccuracy(currentRows);

  if (!ready || query.isLoading)
    return <LoadingState label="Loading practice assignments..." />;
  if (query.isError)
    return <ErrorState message={apiErrorMessage(query.error)} />;

  return (
    <AppShell title="Practice Control">
      <section className="w-full space-y-6">
        <div className="math-hero">
          <div>
            <p className="math-kicker">Learning Operations</p>
            <h1 className="math-title">Practice Control</h1>
            <p className="math-subtitle">
              Manage practice assignment, completion, and student action needs.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric
              label="Students"
              value={students.length}
              icon={<UsersRound size={15} />}
              className="dark:border dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]"
            />
            <Metric
              label="Assigned DPS"
              value={assignedDps}
              icon={<ClipboardList size={15} />}
              className="dark:border dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]"
            />
            <Metric
              label="Cleared DPS"
              value={clearedDps}
              icon={<CheckCircle2 size={15} />}
              className="dark:border dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]"
            />
            <Metric
              label="Pending DPS"
              value={pendingDps}
              icon={<Clock3 size={15} />}
              className="dark:border dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]"
            />
            <Metric
              label="Re-Attempt Needed"
              value={reattemptNeeded}
              icon={<AlertTriangle size={15} />}
              className="dark:border dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]"
            />
            <Metric
              label="Average Accuracy"
              value={`${averageAccuracyValue}%`}
              icon={<BarChart3 size={15} />}
              className="dark:border dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]"
            />
          </div>
        </div>

        <div className="math-operation-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="math-kicker">Practice Directory</p>
              <h2 className="text-2xl font-black">Practice Overview</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">
                Review student-wise practice control status.
              </p>
            </div>
            <button
              className="math-button-primary"
              onClick={() => router.push("/admin/curriculum")}
              title="Publish DPS"
              aria-label="Publish DPS"
            >
              <Plus size={16} /> Publish DPS
            </button>
          </div>
          <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_210px_180px_180px_180px]">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="math-input pl-11"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search Assignments"
              />
            </div>
            <select
              className="math-input"
              value={teacherFilter}
              onChange={(e) => setTeacherFilter(e.target.value)}
              title="Filter by teacher"
              aria-label="Filter by teacher"
            >
              <option value="" disabled>
                Choose Teacher
              </option>
              <option value="ALL">All Teachers</option>
              {teacherOptions.map(([teacherKey, teacherLabel]) => (
                <option key={teacherKey} value={teacherKey}>
                  {teacherLabel}
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setLevelFilter("");
              }}
              title="Filter by module"
              aria-label="Filter by module"
            >
              <option value="" disabled>
                Choose Module
              </option>
              <option value="ALL">All Modules</option>
              {moduleOptions.map((moduleCode) => (
                <option key={moduleCode} value={moduleCode}>
                  {moduleCode}
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              title="Filter by level"
              aria-label="Filter by level"
            >
              <option value="" disabled>
                Choose Level
              </option>
              <option value="ALL">All Levels</option>
              {levelOptions.map((levelCode) => (
                <option key={levelCode} value={levelCode}>
                  {levelCode}
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              title="Filter by status"
              aria-label="Filter by status"
            >
              <option value="" disabled>
                Choose Status
              </option>
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Archived</option>
            </select>
          </div>
        </div>

        <div>
          {students.length ? (
            <StudentSummaryTable
              students={students}
              viewLabel="View Details"
              viewTooltip="Open student details"
              onOpen={(student) => {
                const Params = new URLSearchParams();
                if (moduleFilter && moduleFilter !== "ALL") {
                  Params.set("moduleCode", moduleFilter);
                }
                if (levelFilter && levelFilter !== "ALL") {
                  Params.set("levelCode", levelFilter);
                }
                const QueryString = Params.toString();
                router.push(
                  `/admin/assignments/student/${encodeURIComponent(student.studentCode)}${QueryString ? `?${QueryString}` : ""}`,
                );
              }}
            />
          ) : (
            <EmptyState message="Adjust the search or filters to find student records." />
          )}
        </div>
      </section>
    </AppShell>
  );
}
