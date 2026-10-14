"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { approveReattemptsInBulk, getAdminAssignments } from "@/lib/api/admin";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApprovalAssignmentId,
  ApprovalKey,
  ApprovalStudentId,
  ReattemptApprovalQueue,
} from "@/components/common/ReattemptApprovalQueue";
import { AlertTriangle, BarChart3, CheckCircle2, ClipboardList, ClipboardPlus, Clock3, FolderOpen, Hourglass, Plus, Search, UsersRound } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { useUrlParamState, useUrlTabState } from "@/hooks/useUrlTabState";
import { useRouter } from "next/navigation";
import {
  MATHPATH_ACTIVITY_TIMESTAMP_KEYS,
  getFirstMathPathTimestamp,
  mathPathTimestampValue,
} from "@/lib/date";
import {
  AnyRow,
  buildStudents,
  currentWorkRows,
  isAwaitingApproval,
  studentCodeOf,
  formatAccuracyPercent,
  hierarchyAverageAccuracy,
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

function rowHasAccuracyValue(row: AnyRow) {
  const RawAccuracy = row.accuracy ?? row.accuracyPercentage ?? row.averageAccuracy;
  return RawAccuracy !== null && RawAccuracy !== undefined && RawAccuracy !== "" && !Number.isNaN(Number(RawAccuracy));
}

function rowAccuracyValue(row: AnyRow) {
  const RawAccuracy = row.accuracy ?? row.accuracyPercentage ?? row.averageAccuracy;
  const Parsed = Number(RawAccuracy);
  return Number.isFinite(Parsed) ? Parsed : 0;
}

function studentOverallAverageAccuracy(rows: AnyRow[]) {
  return hierarchyAverageAccuracy(rows);
}

function visibleStudentsAverageAccuracy(students: ReturnType<typeof buildStudents>): number | null {
  if (!students.length) return null;

  // studentOverallAverageAccuracy(...) is null for a student with no reviewed
  // accuracy yet. Reducing that unfiltered (`sum + null` coerces to `sum + 0`
  // in JS) while still dividing by the full student count recreates the
  // null-as-zero dilution bug this pass is closing everywhere else. Filter
  // nulls out first so a no-data student doesn't drag the team average down.
  const StudentAccuracyValues = students
    .map((student) => studentOverallAverageAccuracy(student.rows))
    .filter((value): value is number => typeof value === "number");

  if (!StudentAccuracyValues.length) return null;

  return Math.round(
    StudentAccuracyValues.reduce((sum, value) => sum + value, 0) / StudentAccuracyValues.length,
  );
}

export default function AdminPracticeAssignmentsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading practice assignments..." />}>
      <AdminPracticeAssignmentsContent />
    </Suspense>
  );
}

const PRACTICE_CONTROL_TABS = ["overview", "awaiting-approval"] as const;
type PracticeControlTab = (typeof PRACTICE_CONTROL_TABS)[number];

function AdminPracticeAssignmentsContent() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const router = useRouter();
  // 2026-10-14 (Shailesh): Overview | Awaiting Approval sub tabs; the tab and
  // every filter live in the page address, so a refresh reopens this view.
  const [activeTab, setActiveTab] = useUrlTabState<PracticeControlTab>("tab", PRACTICE_CONTROL_TABS, "overview");
  const [search, setSearch] = useUrlParamState("q", "");
  const [statusFilterRaw, setStatusFilterRaw] = useUrlParamState("status", "");
  const statusFilter = statusFilterRaw as StatusFilter;
  const setStatusFilter = (next: StatusFilter) => setStatusFilterRaw(next);
  const [teacherFilter, setTeacherFilter] = useUrlParamState("teacher", "");
  const [moduleFilter, setModuleFilter] = useUrlParamState("module", "");
  const [levelFilter, setLevelFilter] = useUrlParamState("level", "");
  const [approvalSearch, setApprovalSearch] = useUrlParamState("aq", "");
  const [approvalTeacher, setApprovalTeacher] = useUrlParamState("ateacher", "");
  const [approvalModule, setApprovalModule] = useUrlParamState("amodule", "");
  const [approvalLevel, setApprovalLevel] = useUrlParamState("alevel", "");
  const queryClient = useQueryClient();
  const [approvalBusy, setApprovalBusy] = useState<Set<string>>(new Set());
  const [approvalMessage, setApprovalMessage] = useState<{ tone: "green" | "red"; text: string } | null>(null);

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
  const assignedDps = uniqueAssignedConceptCount(filteredRows);
  const clearedDps = uniqueClearedConceptCount(filteredRows);
  const pendingDps = uniquePendingConceptCount(filteredRows);
  const reattemptNeeded = uniqueNeedsReattemptCount(filteredRows);
  // Every DPS that has used all its tries and waits for an admin, from the
  // same shared state as the cards and the teacher's Awaiting Approval tab.
  // The tab's number is all of them; the list below can be narrowed.
  const allAwaitingRows = useMemo(() => currentWorkRows(rows).filter((row) => row.isActive !== false && isAwaitingApproval(row)), [rows]);
  const approvalTeacherOptions = useMemo(() => uniqueTeacherOptions(allAwaitingRows), [allAwaitingRows]);
  const approvalModuleOptions = useMemo(() => uniqueModuleOptions(allAwaitingRows), [allAwaitingRows]);
  const approvalLevelOptions = useMemo(() => uniqueLevelOptions(allAwaitingRows, approvalModule), [allAwaitingRows, approvalModule]);
  const awaitingRows = useMemo(() => {
    const q = approvalSearch.trim().toLowerCase();
    return allAwaitingRows.filter(
      (row) =>
        (!approvalTeacher || approvalTeacher === "ALL" || rowTeacherKey(row) === approvalTeacher) &&
        (!approvalModule || approvalModule === "ALL" || rowModuleCode(row) === approvalModule) &&
        (!approvalLevel || approvalLevel === "ALL" || rowLevelCode(row) === approvalLevel) &&
        (!q || searchText(row).includes(q)),
    );
  }, [allAwaitingRows, approvalSearch, approvalTeacher, approvalModule, approvalLevel]);
  const approvalFiltered = Boolean(approvalSearch || (approvalTeacher && approvalTeacher !== "ALL") || (approvalModule && approvalModule !== "ALL") || (approvalLevel && approvalLevel !== "ALL"));
  const openStudentAtDps = (row: AnyRow) => {
    const params = new URLSearchParams();
    const dpsId = String(row.dpsId || row.dps_id || "");
    const assignmentId = String(row.assignmentId || "");
    const attemptId = String(row?.dpsChain?.awaitingApprovalAttemptId || row.attemptId || row.latestAttemptId || "");
    if (dpsId) params.set("dpsId", dpsId);
    if (assignmentId) params.set("assignmentId", assignmentId);
    if (attemptId) params.set("attemptId", attemptId);
    params.set("tab", "lesson-insights");
    router.push(`/admin/assignments/student/${encodeURIComponent(studentCodeOf(row))}?${params.toString()}`);
  };

  const approve = async (rowsToApprove: AnyRow[]) => {
    if (!rowsToApprove.length) return;
    const keys = new Set(rowsToApprove.map(ApprovalKey));
    setApprovalBusy(keys);
    setApprovalMessage(null);
    try {
      const result = await approveReattemptsInBulk(
        rowsToApprove.map((row) => ({ assignmentId: ApprovalAssignmentId(row), studentId: ApprovalStudentId(row) })),
      );
      const failedLines = result.results.filter((item) => !item.approved).map((item) => item.message).filter(Boolean);
      setApprovalMessage({
        tone: result.failed ? "red" : "green",
        text: result.message + (failedLines.length ? ` ${failedLines.join(" ")}` : ""),
      });
      await queryClient.invalidateQueries({ queryKey: ["admin-assignments"] });
    } catch (error) {
      setApprovalMessage({ tone: "red", text: apiErrorMessage(error) });
    } finally {
      setApprovalBusy(new Set());
    }
  };
  const averageAccuracyValue = visibleStudentsAverageAccuracy(students);

  if (!ready || query.isLoading)
    return <LoadingState label="Loading practice assignments..." />;
  if (query.isError)
    return <ErrorState message={apiErrorMessage(query.error)} />;

  return (
    <AppShell title="Practice Control">
      <section className="w-full space-y-6">
        <div className="math-hero">
          <div>
            <p className="math-block-header"><ClipboardPlus size={14} />Learning Operations</p>
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
              value={formatAccuracyPercent(averageAccuracyValue)}
              icon={<BarChart3 size={15} />}
              className="dark:border dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]"
            />
          </div>
        </div>

        {approvalMessage ? (
          <div
            role="status"
            className={`rounded-[20px] border px-4 py-3 text-sm font-bold ${approvalMessage.tone === "green" ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100" : "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"}`}
          >
            {approvalMessage.text}
          </div>
        ) : null}

        <div className="math-tab-strip" role="tablist" aria-label="Practice Control sections">
          <button
            type="button"
            role="tab"
            className={`math-role-tab math-admin-tab-force ${activeTab === "overview" ? "math-role-tab-active math-admin-tab-force-selected" : ""}`}
            aria-selected={activeTab === "overview"}
            data-active={activeTab === "overview" ? "true" : "false"}
            onClick={() => setActiveTab("overview")}
          >
            Overview
          </button>
          <button
            type="button"
            role="tab"
            className={`math-role-tab math-admin-tab-force ${activeTab === "awaiting-approval" ? "math-role-tab-active math-admin-tab-force-selected" : ""}`}
            aria-selected={activeTab === "awaiting-approval"}
            data-active={activeTab === "awaiting-approval" ? "true" : "false"}
            onClick={() => setActiveTab("awaiting-approval")}
          >
            Awaiting Approval ({allAwaitingRows.length})
          </button>
        </div>

        {activeTab === "awaiting-approval" ? (
          <>
            <div className="math-operation-panel">
              <div>
                <p className="math-block-header"><Hourglass size={14} />Re-Attempt Approvals</p>
                <h2 className="text-2xl font-black">Awaiting Approval</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">
                  {approvalFiltered
                    ? `Showing ${awaitingRows.length} of ${allAwaitingRows.length} DPS waiting for approval.`
                    : `${allAwaitingRows.length} DPS waiting for approval.`}
                </p>
              </div>
              <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_210px_180px_180px]">
                <div className="relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="math-input pl-11"
                    value={approvalSearch}
                    onChange={(e) => setApprovalSearch(e.target.value)}
                    placeholder="Search Students Or DPS"
                    aria-label="Search waiting re-attempts"
                  />
                </div>
                <select className="math-input" value={approvalTeacher} onChange={(e) => setApprovalTeacher(e.target.value)} title="Filter by teacher" aria-label="Filter waiting re-attempts by teacher">
                  <option value="" disabled>Choose Teacher</option>
                  <option value="ALL">All Teachers</option>
                  {approvalTeacherOptions.map(([teacherKey, teacherLabel]) => (
                    <option key={teacherKey} value={teacherKey}>{teacherLabel}</option>
                  ))}
                </select>
                <select
                  className="math-input"
                  value={approvalModule}
                  onChange={(e) => {
                    setApprovalModule(e.target.value);
                    setApprovalLevel("");
                  }}
                  title="Filter by module"
                  aria-label="Filter waiting re-attempts by module"
                >
                  <option value="" disabled>Choose Module</option>
                  <option value="ALL">All Modules</option>
                  {approvalModuleOptions.map((moduleCode) => (
                    <option key={moduleCode} value={moduleCode}>{moduleCode}</option>
                  ))}
                </select>
                <select className="math-input" value={approvalLevel} onChange={(e) => setApprovalLevel(e.target.value)} title="Filter by level" aria-label="Filter waiting re-attempts by level">
                  <option value="" disabled>Choose Level</option>
                  <option value="ALL">All Levels</option>
                  {approvalLevelOptions.map((levelCode) => (
                    <option key={levelCode} value={levelCode}>{levelCode}</option>
                  ))}
                </select>
              </div>
            </div>
            {awaitingRows.length || !approvalFiltered ? (
              <ReattemptApprovalQueue
                Rows={awaitingRows}
                Mode="admin"
                BusyKeys={approvalBusy}
                OnApprove={approve}
                OnOpenStudent={openStudentAtDps}
              />
            ) : (
              <EmptyState message="No waiting re-attempts match these filters." />
            )}
          </>
        ) : (
        <>
        <div className="math-operation-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="math-block-header"><FolderOpen size={14} />Practice Directory</p>
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
        </>
        )}
      </section>
    </AppShell>
  );
}
