"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { CompareStudentCodes } from "@/lib/studentSort";
import { apiErrorMessage } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import {
  createAdminAssessmentTestingOverride,
  deactivateAdminAssessmentTestingOverride,
  getAdminAssessmentEligibility,
  getAdminAssessmentTestingOverrides,
  getAdminTeachers,
  type AssessmentEligibilityRow,
  type AssessmentTestingOverride,
} from "@/lib/api/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GraduationCap,
  Maximize2,
  Minimize2,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState } from "react";

type Filter = "" | "ALL" | "READY" | "NOT_READY";
type ModuleFilter = "" | "ALL" | string;
type LevelFilter = "" | "ALL" | string;
type TeacherFilter = "" | "ALL" | string;

function statusTone(row: AssessmentEligibilityRow) {
  if (row.eligible) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (row.status === "NEEDS_DPS_REATTEMPT")
    return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function progressTone(row: AssessmentEligibilityRow) {
  if (row.eligible) return "bg-emerald-500";
  if (row.belowBenchmarkDpsCount) return "bg-rose-500";
  return "bg-amber-500";
}

function matchesFilter(row: AssessmentEligibilityRow, filter: Filter) {
  if (!filter || filter === "ALL") return true;
  if (filter === "READY") return row.eligible;
  return !row.eligible;
}

function studentKey(row: AssessmentEligibilityRow) {
  return `student:${row.studentId}`;
}

function moduleKey(row: AssessmentEligibilityRow) {
  return `module:${row.studentId}:${row.moduleId || row.moduleCode || "module"}`;
}

function moduleFilterValue(row: {
  moduleId?: string | number | null;
  moduleCode?: string | null;
}) {
  return String(row.moduleCode || row.moduleId || "Module");
}

function moduleFilterLabel(row: {
  moduleId?: string | number | null;
  moduleCode?: string | null;
  moduleName?: string | null;
}) {
  const ModuleCode = String(row.moduleCode || row.moduleId || "Module");
  return row.moduleName ? `${ModuleCode} · ${row.moduleName}` : ModuleCode;
}

function levelKey(row: AssessmentEligibilityRow) {
  return `level:${row.studentId}:${row.moduleId || row.moduleCode || "module"}:${row.levelId || row.levelCode || "level"}`;
}

function levelFilterValue(row: {
  levelId?: string | number | null;
  levelCode?: string | null;
}) {
  return String(row.levelCode || row.levelId || "Level");
}

function levelFilterLabel(row: {
  levelId?: string | number | null;
  levelCode?: string | null;
  levelName?: string | null;
}) {
  const LevelCode = String(row.levelCode || row.levelId || "Level");
  return row.levelName ? `${LevelCode} · ${row.levelName}` : LevelCode;
}

function teacherFilterValues(row: Record<string, unknown>) {
  return [
    row.teacherCode,
    row.assignedTeacherCode,
    row.teacherId,
    row.assignedTeacherId,
    row.teacherName,
    row.assignedTeacherName,
  ]
    .filter(Boolean)
    .map((Value) => String(Value));
}

function teacherOptionValue(Teacher: {
  teacherCode?: string | null;
  teacherId?: string | null;
  teacherName?: string | null;
}) {
  return String(
    Teacher.teacherCode || Teacher.teacherId || Teacher.teacherName || "",
  );
}

function teacherOptionLabel(Teacher: {
  teacherCode?: string | null;
  teacherName?: string | null;
}) {
  const TeacherName = String(Teacher.teacherName || "");
  const TeacherCode = String(Teacher.teacherCode || "");
  if (TeacherName && TeacherCode) return `${TeacherName} (${TeacherCode})`;
  return TeacherName || TeacherCode;
}

export default function AdminAssessmentReadinessPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("");
  const [moduleFilter, setModuleFilter] = useState<ModuleFilter>("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("");
  const [teacherFilter, setTeacherFilter] = useState<TeacherFilter>("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [overrideModal, setOverrideModal] = useState<
    | { mode: "ENABLE"; row: AssessmentEligibilityRow; override?: null }
    | { mode: "DISABLE"; row: AssessmentEligibilityRow; override: AssessmentTestingOverride }
    | null
  >(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideMessage, setOverrideMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["admin-assessment-eligibility"],
    queryFn: () => getAdminAssessmentEligibility(),
    enabled: ready,
  });

  const teachersQuery = useQuery({
    queryKey: ["admin-teachers-for-readiness"],
    queryFn: () => getAdminTeachers(),
    enabled: ready,
  });

  const overridesQuery = useQuery({
    queryKey: ["admin-assessment-testing-overrides"],
    queryFn: () => getAdminAssessmentTestingOverrides({ activeOnly: true }),
    enabled: ready,
  });

  const rows = query.data?.rows ?? [];
  const teachers = teachersQuery.data ?? [];
  const readinessGate = query.data?.readinessGate;
  const testingOverrideEnabled = Boolean(overridesQuery.data?.testingOverrideEnabled);
  const activeOverrides = overridesQuery.data?.overrides ?? [];

  const moduleOptions = useMemo(() => {
    const ModuleMap = new Map<string, string>();
    rows.forEach((row) =>
      ModuleMap.set(moduleFilterValue(row), moduleFilterLabel(row)),
    );
    return Array.from(ModuleMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [rows]);

  const levelOptions = useMemo(() => {
    const LevelMap = new Map<string, string>();
    rows
      .filter(
        (row) =>
          !moduleFilter ||
          moduleFilter === "ALL" ||
          moduleFilterValue(row) === moduleFilter,
      )
      .forEach((row) =>
        LevelMap.set(levelFilterValue(row), levelFilterLabel(row)),
      );
    return Array.from(LevelMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [rows, moduleFilter]);

  const teacherOptions = useMemo(() => {
    const TeacherMap = new Map<string, string>();
    teachers.forEach((Teacher) => {
      const Value = teacherOptionValue(Teacher);
      const Label = teacherOptionLabel(Teacher);
      if (Value && Label) TeacherMap.set(Value, Label);
    });
    return Array.from(TeacherMap.entries()).sort((a, b) =>
      a[1].localeCompare(b[1], undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
  }, [teachers]);

  const overrideByScope = useMemo(() => {
    const OverrideMap = new Map<string, AssessmentTestingOverride>();
    activeOverrides.forEach((OverrideValue) => {
      OverrideMap.set(
        testingOverrideKey({
          studentId: OverrideValue.studentId,
          moduleId: OverrideValue.moduleId,
          levelId: OverrideValue.levelId,
        }),
        OverrideValue,
      );
    });
    return OverrideMap;
  }, [activeOverrides]);

  const createOverrideMutation = useMutation({
    mutationFn: createAdminAssessmentTestingOverride,
    onSuccess: async (response) => {
      setOverrideMessage({ type: "success", text: response.message || "Testing override enabled." });
      setOverrideModal(null);
      setOverrideReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-assessment-testing-overrides"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-assessment-eligibility"] }),
      ]);
    },
    onError: (error) => {
      setOverrideMessage({ type: "error", text: apiErrorMessage(error) });
    },
  });

  const deactivateOverrideMutation = useMutation({
    mutationFn: ({ overrideId, reason }: { overrideId: string; reason?: string }) =>
      deactivateAdminAssessmentTestingOverride(overrideId, { reason }),
    onSuccess: async (response) => {
      setOverrideMessage({ type: "success", text: response.message || "Controlled assessment access disabled." });
      setOverrideModal(null);
      setOverrideReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["admin-assessment-testing-overrides"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-assessment-eligibility"] }),
      ]);
    },
    onError: (error) => {
      setOverrideMessage({ type: "error", text: apiErrorMessage(error) });
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((row) => matchesFilter(row, filter))
      .filter(
        (row) =>
          !teacherFilter ||
          teacherFilter === "ALL" ||
          teacherFilterValues(row as Record<string, unknown>).includes(
            teacherFilter,
          ),
      )
      .filter(
        (row) =>
          !moduleFilter ||
          moduleFilter === "ALL" ||
          moduleFilterValue(row) === moduleFilter,
      )
      .filter(
        (row) =>
          !levelFilter ||
          levelFilter === "ALL" ||
          levelFilterValue(row) === levelFilter,
      )
      .filter((row) => {
        if (!q) return true;
        return [
          row.studentName,
          row.studentCode,
          row.className,
          row.section,
          row.moduleCode,
          row.moduleName,
          row.levelCode,
          row.levelName,
          row.statusLabel,
          row.message,
          ...(row.lessons || []).map((lesson) => lesson.lessonTitle),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((FirstRow, SecondRow) =>
        CompareStudentCodes(FirstRow.studentCode, SecondRow.studentCode),
      );
  }, [rows, search, filter, moduleFilter, levelFilter, teacherFilter]);

  function setBranch(key: string, value: boolean) {
    setOpen((current) => ({ ...current, [key]: value }));
  }

  function toggle(key: string) {
    setOpen((current) => ({ ...current, [key]: !current[key] }));
  }

  function expandAll() {
    const next: Record<string, boolean> = {};
    filtered.forEach((row) => {
      next[studentKey(row)] = true;
      next[moduleKey(row)] = true;
      next[levelKey(row)] = true;
    });
    setOpen(next);
  }

  function collapseAll() {
    setOpen({});
  }

  function openEnableOverride(row: AssessmentEligibilityRow) {
    setOverrideMessage(null);
    setOverrideReason("Admin testing override for assessment cycle QA.");
    setOverrideModal({ mode: "ENABLE", row });
  }

  function openDisableOverride(row: AssessmentEligibilityRow, override: AssessmentTestingOverride) {
    setOverrideMessage(null);
    setOverrideReason("Testing override no longer required.");
    setOverrideModal({ mode: "DISABLE", row, override });
  }

  function submitOverrideModal() {
    if (!overrideModal) return;
    if (overrideModal.mode === "ENABLE") {
      createOverrideMutation.mutate({
        studentId: overrideModal.row.studentId,
        moduleId: overrideModal.row.moduleId,
        levelId: String(overrideModal.row.levelId || ""),
        reason: overrideReason,
      });
      return;
    }
    deactivateOverrideMutation.mutate({
      overrideId: overrideModal.override.id,
      reason: overrideReason,
    });
  }

  if (!ready) return null;

  return (
    <AppShell>
      <section className="math-hero">
        <div className="relative z-10">
          <p className="math-kicker">Assessment Readiness</p>
          <h1 className="math-title">Assessment Readiness</h1>
          <p className="math-subtitle">
            Review assessment eligibility by student, teacher, and level.
          </p>

          <div className="mt-7 grid gap-4 sm:grid-cols-4">
            <Metric
              label="Students Reviewed"
              value={query.data?.totalStudents ?? 0}
              icon={<GraduationCap size={18} />}
            />
            <Metric
              label="Ready"
              value={query.data?.readyCount ?? 0}
              icon={<ShieldCheck size={18} />}
            />
            <Metric
              label="Not Ready"
              value={query.data?.notReadyCount ?? 0}
              icon={<AlertTriangle size={18} />}
            />
            <Metric
              label="Benchmark"
              value="70%"
              icon={<CheckCircle2 size={18} />}
            />
          </div>

          {readinessGate ? (
            <div
              className={`mt-5 rounded-[28px] border p-4 shadow-sm ${
                readinessGate.temporaryBypassEnabled
                  ? "math-tone-warning border-amber-200 bg-amber-50/90"
                  : "math-tone-success border-emerald-200 bg-emerald-50/90"
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                      readinessGate.temporaryBypassEnabled
                        ? "bg-amber-100 text-amber-700"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    <ShieldCheck size={18} />
                  </span>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                      Assessment Readiness Status
                    </p>
                    <h2 className="mt-1 text-base font-black text-slate-950 dark:text-white">
                      {readinessGate.temporaryBypassEnabled ? "Readiness Bypass Active" : readinessGate.label}
                    </h2>
                    <p className="mt-1 max-w-4xl text-sm font-semibold leading-6 text-slate-600 dark:text-slate-200">
                      {readinessGate.temporaryBypassEnabled
                        ? "Assessment assignment is currently allowed for QA across eligible level matches until the owner explicitly restores strict readiness."
                        : readinessGate.assignmentImpactLabel}
                    </p>
                    <p className="mt-1 max-w-4xl text-xs font-bold leading-5 text-slate-500 dark:text-slate-300">
                      {readinessGate.temporaryBypassEnabled
                        ? "Working convention: keep the assessment readiness bypass ON until explicitly disabled."
                        : readinessGate.nextPhaseNote}
                    </p>
                  </div>
                </div>
                <div className="rounded-[22px] border border-white/70 bg-white/80 px-4 py-3 text-center shadow-sm dark:border-slate-700 dark:bg-slate-950/70">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 dark:text-slate-300">
                    Not Ready
                  </p>
                  <p className="mt-1 text-2xl font-black text-slate-950 dark:text-white">
                    {readinessGate.notReadyStudentsImpacted}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {overrideMessage ? (
        <div
          className={`mt-6 rounded-[24px] border px-5 py-4 text-sm font-bold ${
            overrideMessage.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {overrideMessage.text}
        </div>
      ) : null}

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="grid gap-3 xl:grid-cols-[1fr_180px_180px_180px_200px_auto_auto] xl:items-center">
          <div className="relative">
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              className="math-input pl-11"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search Assessment Readiness"
            />
          </div>
          <select
            className="math-select"
            value={teacherFilter}
            onChange={(event) => setTeacherFilter(event.target.value)}
          >
            <option value="" disabled>
              Choose Teacher
            </option>
            <option value="ALL">All Teachers</option>
            {teacherOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="math-select"
            value={moduleFilter}
            onChange={(event) => {
              setModuleFilter(event.target.value);
              setLevelFilter("");
            }}
          >
            <option value="" disabled>
              Choose Module
            </option>
            <option value="ALL">All Modules</option>
            {moduleOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="math-select"
            value={levelFilter}
            onChange={(event) => setLevelFilter(event.target.value)}
          >
            <option value="" disabled>
              Choose Level
            </option>
            <option value="ALL">All Levels</option>
            {levelOptions.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="math-select"
            value={filter}
            onChange={(event) => setFilter(event.target.value as Filter)}
          >
            <option value="" disabled>
              Choose Readiness Status
            </option>
            <option value="ALL">All Readiness Statuses</option>
            <option value="READY">Ready</option>
            <option value="NOT_READY">Not Ready</option>
          </select>
          <button
            type="button"
            className="math-role-action-button math-role-row-action math-readiness-control-button whitespace-nowrap"
            onClick={expandAll}
          >
            Expand All
          </button>
          <button
            type="button"
            className="math-role-action-button math-role-row-action math-readiness-control-button whitespace-nowrap"
            onClick={collapseAll}
          >
            Collapse All
          </button>
        </div>
      </section>

      <section className="mt-6">
        {query.isLoading ? (
          <LoadingState label="Checking assessment readiness..." />
        ) : null}
        {query.error ? (
          <ErrorState
            title="Unable to check readiness"
            message={apiErrorMessage(query.error)}
          />
        ) : null}
        {!query.isLoading && !query.error && !filtered.length ? (
          <EmptyState
            title="No readiness records found"
            message="Students with active levels will appear here."
          />
        ) : null}

        <div className="grid gap-5">
          {filtered.map((row) => {
            const skey = studentKey(row);
            const mkey = moduleKey(row);
            const lkey = levelKey(row);

            const activeOverride = overrideByScope.get(
              testingOverrideKey({
                studentId: row.studentId,
                moduleId: row.moduleId,
                levelId: row.levelId,
              }),
            );

            return (
              <NodeCard
                key={`${row.studentId}-${row.levelId}`}
                open={!!open[skey]}
                onToggle={() => toggle(skey)}
                onExpand={() => setBranch(skey, true)}
                onCollapse={() => setBranch(skey, false)}
                title={
                  <>
                    {row.studentName}{" "}
                    <span className="text-slate-400">({row.studentCode})</span>
                  </>
                }
                subtitle={undefined}
                chips={
                  <>
                    <Chip tone="blue">{row.requiredDpsCount} DPS</Chip>
                    <Chip tone={row.eligible ? "green" : "amber"}>
                      {row.statusLabel}
                    </Chip>
                    <Chip tone={row.belowBenchmarkDpsCount ? "red" : "green"}>
                      {row.progressPercentage}% progress
                    </Chip>
                    {activeOverride ? (
                      <Chip tone="purple">Controlled Access</Chip>
                    ) : null}
                  </>
                }
              >
                <NodeCard
                  open={!!open[mkey]}
                  onToggle={() => toggle(mkey)}
                  onExpand={() => setBranch(mkey, true)}
                  onCollapse={() => setBranch(mkey, false)}
                  title={row.moduleName || row.moduleCode || "Module"}
                  subtitle="Module"
                  compact
                >
                  <NodeCard
                    open={!!open[lkey]}
                    onToggle={() => toggle(lkey)}
                    onExpand={() => setBranch(lkey, true)}
                    onCollapse={() => setBranch(lkey, false)}
                    title={`${row.levelCode || "Level"}${row.levelName ? ` - ${row.levelName}` : ""}`}
                    subtitle="Level"
                    chips={
                      <>
                        <Chip tone="blue">
                          {row.completedDpsCount}/{row.requiredDpsCount} cleared
                        </Chip>
                        {row.missingDpsCount ? (
                          <Chip tone="amber">
                            {row.missingDpsCount} missing
                          </Chip>
                        ) : null}
                        {row.belowBenchmarkDpsCount ? (
                          <Chip tone="red">
                            Needs Re-Attempt: {row.belowBenchmarkDpsCount}
                          </Chip>
                        ) : null}
                        {activeOverride ? (
                          <Chip tone="purple">Controlled Access Enabled</Chip>
                        ) : null}
                      </>
                    }
                    compact
                  >
                    <ReadinessDetails
                      row={row}
                      testingOverrideEnabled={testingOverrideEnabled}
                      activeOverride={activeOverride}
                      onEnableOverride={() => openEnableOverride(row)}
                      onDisableOverride={() =>
                        activeOverride ? openDisableOverride(row, activeOverride) : undefined
                      }
                    />
                  </NodeCard>
                </NodeCard>
              </NodeCard>
            );
          })}
        </div>
      </section>

      {overrideModal ? (
        <TestingOverrideModal
          modal={overrideModal}
          reason={overrideReason}
          onReasonChange={setOverrideReason}
          onClose={() => {
            setOverrideModal(null);
            setOverrideReason("");
          }}
          onConfirm={submitOverrideModal}
          isSubmitting={
            createOverrideMutation.isPending || deactivateOverrideMutation.isPending
          }
        />
      ) : null}
    </AppShell>
  );
}

type SheetFilter = "ALL" | "PENDING" | "NEEDS_REATTEMPT" | "CLEARED";

type SheetRow = {
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  dpsId: string;
  dpsNumber: number | null;
  dpsTitle: string | null;
  status: string;
  isCompleted: boolean;
  isPassed: boolean;
  bestAccuracy: number | null;
  latestAccuracy: number | null;
  latestScore: number | null;
  latestMaxScore: number | null;
  latestSubmittedAt: string | null;
};

function allSheets(row: {
  lessons: Array<{
    lessonId: string;
    lessonNumber: number;
    lessonTitle: string;
    dps: Array<Record<string, any>>;
  }>;
}) {
  return row.lessons.flatMap((lesson) =>
    (lesson.dps || []).map((sheet) => ({
      lessonId: lesson.lessonId,
      lessonNumber: lesson.lessonNumber,
      lessonTitle: lesson.lessonTitle,
      dpsId: String(sheet.dpsId ?? ""),
      dpsNumber: typeof sheet.dpsNumber === "number" ? sheet.dpsNumber : null,
      dpsTitle: String(sheet.dpsTitle ?? "DPS"),
      status: String(sheet.status ?? ""),
      isCompleted: Boolean(sheet.isCompleted),
      isPassed: Boolean(sheet.isPassed),
      bestAccuracy:
        typeof sheet.bestAccuracy === "number" ? sheet.bestAccuracy : null,
      latestAccuracy:
        typeof sheet.latestAccuracy === "number" ? sheet.latestAccuracy : null,
      latestScore:
        typeof sheet.latestScore === "number" ? sheet.latestScore : null,
      latestMaxScore:
        typeof sheet.latestMaxScore === "number" ? sheet.latestMaxScore : null,
      latestSubmittedAt:
        typeof sheet.latestSubmittedAt === "string"
          ? sheet.latestSubmittedAt
          : null,
    })),
  );
}

function sheetCategory(sheet: SheetRow) {
  if (sheet.isPassed) return "CLEARED";
  if (sheet.isCompleted && !sheet.isPassed) return "NEEDS_REATTEMPT";
  return "PENDING";
}

function sheetStatusLabel(sheet: SheetRow) {
  const category = sheetCategory(sheet);
  if (category === "CLEARED") return "Cleared";
  if (category === "NEEDS_REATTEMPT") return "Needs Re-Attempt";
  return "Pending";
}

function sheetStatusClasses(sheet: SheetRow) {
  const category = sheetCategory(sheet);
  if (category === "CLEARED") return "bg-emerald-100 text-emerald-700";
  if (category === "NEEDS_REATTEMPT") return "bg-rose-100 text-rose-700";
  return "bg-amber-100 text-amber-700";
}

function sheetDot(sheet: SheetRow) {
  const category = sheetCategory(sheet);
  if (category === "CLEARED") return "bg-emerald-500";
  if (category === "NEEDS_REATTEMPT") return "bg-rose-500";
  return "bg-amber-500";
}

function sheetProgress(sheet: SheetRow) {
  if (sheet.isPassed) return 100;
  if (sheet.isCompleted && !sheet.isPassed)
    return Math.max(
      5,
      Math.round(sheet.bestAccuracy ?? sheet.latestAccuracy ?? 0),
    );
  return 0;
}

function dpsLabel(sheet: SheetRow) {
  return sheet.dpsNumber ? `DPS-${sheet.dpsNumber}` : "DPS";
}

function groupSheetsByLesson(sheets: SheetRow[]) {
  const map = new Map<
    string,
    {
      lessonId: string;
      lessonNumber: number;
      lessonTitle: string;
      sheets: SheetRow[];
    }
  >();
  sheets.forEach((sheet) => {
    const key = sheet.lessonId || `lesson-${sheet.lessonNumber}`;
    const existing = map.get(key);
    if (existing) {
      existing.sheets.push(sheet);
    } else {
      map.set(key, {
        lessonId: key,
        lessonNumber: sheet.lessonNumber,
        lessonTitle: sheet.lessonTitle,
        sheets: [sheet],
      });
    }
  });
  return Array.from(map.values()).sort(
    (a, b) => a.lessonNumber - b.lessonNumber,
  );
}

function filterSheets(sheets: SheetRow[], filter: SheetFilter) {
  if (filter === "ALL") return sheets;
  return sheets.filter((sheet) => sheetCategory(sheet) === filter);
}

function ReadinessDetails({
  row,
  testingOverrideEnabled,
  activeOverride,
  onEnableOverride,
  onDisableOverride,
}: {
  row: AssessmentEligibilityRow;
  testingOverrideEnabled: boolean;
  activeOverride?: AssessmentTestingOverride;
  onEnableOverride: () => void;
  onDisableOverride: () => void;
}) {
  const [showSheets, setShowSheets] = useState(false);
  const [sheetFilter, setSheetFilter] = useState<SheetFilter>("ALL");

  const sheets = allSheets(row);
  const pendingCount = sheets.filter(
    (sheet) => sheetCategory(sheet) === "PENDING",
  ).length;
  const needsReattemptCount = sheets.filter(
    (sheet) => sheetCategory(sheet) === "NEEDS_REATTEMPT",
  ).length;
  const clearedCount = sheets.filter(
    (sheet) => sheetCategory(sheet) === "CLEARED",
  ).length;
  const visibleSheets = filterSheets(sheets, sheetFilter);
  const grouped = groupSheetsByLesson(visibleSheets);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white/80 p-5 dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${statusTone(row)}`}
            >
              {row.statusLabel}
            </span>
          </div>
          <p className="mt-3 max-w-4xl text-sm font-semibold leading-6 text-slate-600">
            {row.message}
          </p>
        </div>
        <div className="min-w-[160px] rounded-[24px] bg-slate-50 p-4 text-center dark:bg-slate-900">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
            Progress
          </p>
          <p className="mt-2 text-4xl font-black text-slate-950 dark:text-white">
            {row.progressPercentage}%
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <Info label="Required DPS" value={row.requiredDpsCount} />
        <Info label="Cleared" value={row.completedDpsCount} />
        <Info label="Pending" value={pendingCount} />
        <Info label="Needs Re-Attempt" value={needsReattemptCount} />
      </div>

      <div className="mt-5 h-3 math-role-progress-track">
        <div
          className="h-full rounded-full math-role-progress-fill"
          style={{
            width: `${Math.min(100, Math.max(0, row.progressPercentage))}%`,
          }}
        />
      </div>

      <TestingOverridePanel
        row={row}
        testingOverrideEnabled={testingOverrideEnabled}
        activeOverride={activeOverride}
        onEnableOverride={onEnableOverride}
        onDisableOverride={onDisableOverride}
      />

      <section className="mt-5 rounded-[26px] border border-slate-200 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="math-kicker text-[10px]">Sheet Breakdown</p>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">
              DPS Clearance Tracker
            </h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              Review pending, cleared, and re-attempt sheets for this level.
            </p>
          </div>
          <button
            type="button"
            className="math-role-action-button math-role-row-action"
            onClick={() => setShowSheets((current) => !current)}
          >
            {showSheets ? "Hide Sheet Details" : "Show Sheet Details"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <SheetFilterChip
            active={sheetFilter === "ALL"}
            onClick={() => setSheetFilter("ALL")}
          >
            All Sheets{" "}
            <span className="ml-1 opacity-70">({sheets.length})</span>
          </SheetFilterChip>
          <SheetFilterChip
            active={sheetFilter === "PENDING"}
            onClick={() => setSheetFilter("PENDING")}
          >
            Pending <span className="ml-1 opacity-70">({pendingCount})</span>
          </SheetFilterChip>
          <SheetFilterChip
            active={sheetFilter === "NEEDS_REATTEMPT"}
            onClick={() => setSheetFilter("NEEDS_REATTEMPT")}
          >
            Needs Re-Attempt{" "}
            <span className="ml-1 opacity-70">({needsReattemptCount})</span>
          </SheetFilterChip>
          <SheetFilterChip
            active={sheetFilter === "CLEARED"}
            onClick={() => setSheetFilter("CLEARED")}
          >
            Cleared <span className="ml-1 opacity-70">({clearedCount})</span>
          </SheetFilterChip>
        </div>

        {showSheets ? (
          <div className="mt-4 overflow-hidden rounded-[22px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <div className="max-h-[460px] overflow-y-auto">
              {grouped.length ? (
                grouped.map((lesson) => (
                  <section
                    key={lesson.lessonId}
                    className="border-b border-slate-100 last:border-b-0 dark:border-slate-800"
                  >
                    <div className="sticky top-0 z-20 grid gap-3 border-b border-slate-100 bg-slate-50/95 px-4 py-3 backdrop-blur lg:grid-cols-[1fr_96px_160px_170px] lg:items-end dark:border-slate-800 dark:bg-slate-900/95">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600">
                          Lesson {lesson.lessonNumber}
                        </p>
                        <h4 className="text-sm font-black text-slate-950 dark:text-white">
                          {lesson.lessonTitle}
                        </h4>
                        <p className="mt-1 text-xs font-semibold text-slate-500">
                          {lesson.sheets.length} sheet
                          {lesson.sheets.length === 1 ? "" : "s"} in this view
                        </p>
                      </div>
                      <p className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 lg:block">
                        Score
                      </p>
                      <p className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 lg:block">
                        Status
                      </p>
                      <p className="hidden text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 lg:block">
                        Completion Date
                      </p>
                    </div>

                    {lesson.sheets.map((sheet) => (
                      <div
                        key={
                          sheet.dpsId || `${lesson.lessonId}-${sheet.dpsNumber}`
                        }
                        className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 lg:grid-cols-[1fr_96px_160px_170px] lg:items-center dark:border-slate-800"
                      >
                        <div className="min-w-0">
                          <div className="flex items-start gap-3">
                            <span
                              className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${sheetDot(sheet)}`}
                            />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                                {dpsLabel(sheet)}
                              </p>
                              {sheet.dpsTitle ? (
                                <p className="mt-1 truncate text-xs font-semibold text-slate-500">
                                  {sheet.dpsTitle}
                                </p>
                              ) : null}
                              <p className="mt-1 text-xs font-semibold text-slate-500">
                                Best:{" "}
                                {sheet.bestAccuracy !== null
                                  ? `${sheet.bestAccuracy}%`
                                  : "-"}{" "}
                                · Latest:{" "}
                                {sheet.latestAccuracy !== null
                                  ? `${sheet.latestAccuracy}%`
                                  : "-"}
                              </p>
                              <div className="mt-2 h-2 math-role-progress-track">
                                <div
                                  className="h-full rounded-full math-role-progress-fill"
                                  style={{ width: `${sheetProgress(sheet)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="text-sm font-black text-slate-950 dark:text-white">
                          {sheet.latestScore !== null &&
                          sheet.latestMaxScore !== null
                            ? `${sheet.latestScore} / ${sheet.latestMaxScore}`
                            : "- / -"}
                        </div>

                        <div>
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-3 py-1 text-xs font-black ${sheetStatusClasses(sheet)}`}
                          >
                            {sheetStatusLabel(sheet)}
                          </span>
                        </div>

                        <div className="text-xs font-bold text-slate-500">
                          {sheet.latestSubmittedAt
                            ? formatMathPathDateTime(sheet.latestSubmittedAt)
                            : "Not submitted yet"}
                        </div>
                      </div>
                    ))}
                  </section>
                ))
              ) : (
                <div className="p-6 text-sm font-semibold text-slate-500">
                  No sheets match this filter.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Info label="All Sheets" value={sheets.length} />
            <Info label="Pending" value={pendingCount} />
            <Info label="Needs Re-Attempt" value={needsReattemptCount} />
            <Info label="Cleared" value={clearedCount} />
          </div>
        )}
      </section>
    </div>
  );
}

function NodeCard({
  open,
  onToggle,
  onExpand,
  onCollapse,
  title,
  subtitle,
  chips,
  compact,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onExpand: () => void;
  onCollapse: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  chips?: React.ReactNode;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article
      className={`overflow-hidden rounded-[30px] border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800 dark:bg-slate-950/80 ${compact ? "mt-4" : ""}`}
    >
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-start gap-4 text-left"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200">
            {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-black leading-6 text-slate-950 dark:text-white">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 text-sm font-semibold text-slate-500">
                {subtitle}
              </p>
            ) : null}
            {chips ? (
              <div className="mt-3 flex flex-wrap gap-2">{chips}</div>
            ) : null}
          </div>
        </button>
        <BranchButtons onExpand={onExpand} onCollapse={onCollapse} />
      </div>
      {open ? (
        <div className="border-t border-slate-100 p-4 sm:p-5 dark:border-slate-800">
          {children}
        </div>
      ) : null}
    </article>
  );
}

function BranchButtons({
  onExpand,
  onCollapse,
}: {
  onExpand: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title="Expand this branch"
        aria-label="Expand this branch"
        className="math-readiness-branch-button"
        onClick={(event) => {
          event.stopPropagation();
          onExpand();
        }}
      >
        <Maximize2 size={15} strokeWidth={2.4} />
      </button>
      <button
        type="button"
        title="Collapse this branch"
        aria-label="Collapse this branch"
        className="math-readiness-branch-button"
        onClick={(event) => {
          event.stopPropagation();
          onCollapse();
        }}
      >
        <Minimize2 size={15} strokeWidth={2.4} />
      </button>
    </div>
  );
}

function Chip({
  tone,
  children,
}: {
  tone: "blue" | "green" | "amber" | "red" | "purple";
  children: React.ReactNode;
}) {
  const classes = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    purple: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black ${classes[tone]}`}
    >
      {children}
    </span>
  );
}

function SheetFilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`math-readiness-sheet-filter ${active ? "is-active border-blue-300 bg-gradient-to-r from-blue-700 via-blue-600 to-cyan-400 text-white shadow-[0_14px_30px_rgba(37,99,235,0.28)]" : ""}`}
      aria-pressed={active}
      aria-selected={active}
      data-active={active ? "true" : "false"}
      data-role-selected={active ? "true" : "false"}
      onClick={onClick}
    >
      {children}
    </button>
  );
}


function testingOverrideKey({
  studentId,
  moduleId,
  levelId,
}: {
  studentId?: string | null;
  moduleId?: string | null;
  levelId?: string | null;
}) {
  return `${studentId || "student"}:${moduleId || "module"}:${levelId || "level"}`;
}

function TestingOverridePanel({
  row,
  testingOverrideEnabled,
  activeOverride,
  onEnableOverride,
  onDisableOverride,
}: {
  row: AssessmentEligibilityRow;
  testingOverrideEnabled: boolean;
  activeOverride?: AssessmentTestingOverride;
  onEnableOverride: () => void;
  onDisableOverride: () => void;
}) {
  if (!testingOverrideEnabled) return null;

  if (activeOverride) {
    return (
      <section className="mt-5 rounded-[26px] border border-violet-200 bg-violet-50/80 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-700">
              Controlled Assessment Access
            </p>
            <h3 className="mt-1 text-base font-black text-slate-950">
              Controlled Access Enabled
            </h3>
            <p className="mt-1 max-w-4xl text-xs font-bold leading-5 text-slate-600">
              This learner currently has controlled access for assessment workflow verification.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip tone="purple">
                Approved By: {activeOverride.enabledBy || "Admin"}
              </Chip>
              {activeOverride.enabledAt ? (
                <Chip tone="blue">
                  {formatMathPathDateTime(activeOverride.enabledAt)}
                </Chip>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="math-button-secondary border-rose-200 text-rose-700 hover:bg-rose-50"
            onClick={(Event) => {
              Event.preventDefault();
              Event.stopPropagation();
              onDisableOverride();
            }}
          >
            Disable Override
          </button>
        </div>
      </section>
    );
  }

  if (row.eligible) {
    return null;
  }

  return (
    <section className="mt-5 rounded-[26px] border border-amber-200 bg-amber-50/80 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-700">
            Controlled Access
          </p>
          <h3 className="mt-1 text-base font-black text-slate-950">
            Controlled Access Available
          </h3>
          <p className="mt-1 max-w-4xl text-xs font-bold leading-5 text-slate-600">
            Admin can grant controlled assessment access for this student, module, and level during workflow verification.
          </p>
        </div>
        <button
          type="button"
          className="math-button-primary"
          onClick={(Event) => {
            Event.preventDefault();
            Event.stopPropagation();
            onEnableOverride();
          }}
        >
          Enable Controlled Access
        </button>
      </div>
    </section>
  );
}

function TestingOverrideModal({
  modal,
  reason,
  onReasonChange,
  onClose,
  onConfirm,
  isSubmitting,
}: {
  modal:
    | { mode: "ENABLE"; row: AssessmentEligibilityRow; override?: null }
    | { mode: "DISABLE"; row: AssessmentEligibilityRow; override: AssessmentTestingOverride };
  reason: string;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
}) {
  const isEnable = modal.mode === "ENABLE";
  const row = modal.row;

  return (
    <div className="fixed inset-x-0 bottom-0 top-[88px] z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[calc(100vh-120px)] w-full max-w-3xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
        <div className="flex shrink-0 flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="math-kicker text-[10px]">
              Assessment Readiness Access
            </p>
            <h2 className="text-2xl font-black text-slate-950">
              {isEnable ? "Enable Controlled Access?" : "Disable Controlled Access?"}
            </h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              {isEnable
                ? "This will allow assessment assignment for this student during workflow verification."
                : "This will remove controlled assessment access for this student, module, and level."}
            </p>
          </div>
          <button type="button" className="math-button-secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Info label="Student" value={`${row.studentName} (${row.studentCode})`} />
            <Info label="Module" value={row.moduleName || row.moduleCode || "Module"} />
            <Info label="Level" value={`${row.levelCode || "Level"}${row.levelName ? ` - ${row.levelName}` : ""}`} />
            <Info label="Readiness" value={row.statusLabel} />
          </div>

          <label className="block">
            <span className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">
              Admin Note
            </span>
            <textarea
              className="math-input mt-2 min-h-[120px] resize-none"
              value={reason}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder="Add a short reason for this testing override."
            />
          </label>

          <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-800">
            This is a testing-only control. It should not be used for live assessment operations unless explicitly approved by Admin leadership.
          </div>
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-3 border-t border-slate-100 bg-white p-5 sm:flex-row sm:justify-end">
          <button type="button" className="math-button-secondary" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="button"
            className={isEnable ? "math-button-primary" : "math-button-danger"}
            onClick={onConfirm}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? "Saving..."
              : isEnable
                ? "Enable Override"
                : "Disable Override"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-[24px] bg-white/75 p-4 shadow-sm dark:bg-slate-950/60">
      <div className="text-blue-600">{icon}</div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4 dark:bg-slate-900">
      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
        {value}
      </p>
    </div>
  );
}
