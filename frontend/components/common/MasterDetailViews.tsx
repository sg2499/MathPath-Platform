"use client";

import { formatMathPathActivityDateTime, formatMathPathDateTime, getFirstMathPathTimestamp } from "@/lib/date";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  Eye,
  FileText,
  Layers3,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type AnyRow = Record<string, any>;

function AccuracyTone(Value: number | null): "green" | "amber" | "red" | "slate" {
  if (typeof Value !== "number" || !Number.isFinite(Value)) return "slate";
  if (Value > 70) return "green";
  if (Value >= 60) return "amber";
  return "red";
}
type StudentNode = {
  key: string;
  studentName: string;
  studentCode: string;
  classLabel?: string;
  rows: AnyRow[];
  modules: Map<string, any>;
};

type MasterDetailProps = {
  students: StudentNode[];
  mode: "admin-practice" | "admin-assessment" | "teacher-practice" | "teacher-results" | "teacher-assessment";
  title?: string;
  onView?: (row: AnyRow) => void;
  onArchive?: (row: AnyRow) => void;
  onRestore?: (row: AnyRow) => void;
  onDelete?: (row: AnyRow) => void;
  busyId?: string | null;
};

function numberValue(value: unknown, fallback = 0) {
  if (value === null || value === undefined || value === "" || Number.isNaN(Number(value))) return fallback;
  return Number(value);
}

function dateText(value: unknown) {
  return value ? formatMathPathDateTime(String(value)) : "—";
}

function rowDate(row: AnyRow, keys: string[]) {
  return dateText(getFirstMathPathTimestamp(row, keys));
}

function scoreText(row: AnyRow) {
  const score = row.score ?? row.totalScore ?? row.scoreObtained ?? row.marksObtained ?? row.correct ?? row.correctCount;
  const max = row.maxScore ?? row.totalMarks ?? row.totalQuestions ?? row.questionCount ?? 10;
  return score === null || score === undefined || score === "" ? "- / -" : `${score} / ${max}`;
}

function accuracy(row: AnyRow) {
  return numberValue(row.accuracy ?? row.accuracyPercentage ?? row.averageAccuracy, 0);
}

function averageAccuracy(rows: AnyRow[]): number | null {
  const values = rows.map(accuracy).filter((value) => value > 0);
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function isCompleted(row: AnyRow) {
  const status = String(row.status ?? "").toUpperCase();
  return status === "SUBMITTED" || status === "COMPLETED" || status === "AUTO_SUBMITTED" || Boolean(row.completedAttemptCount);
}

function isPending(row: AnyRow) {
  const status = String(row.status ?? "").toUpperCase();
  return status === "PENDING" || status === "NOT_STARTED" || status === "IN_PROGRESS" || !isCompleted(row);
}

function isBelowBenchmark(row: AnyRow) {
  return String(row.benchmarkStatus ?? "").toUpperCase().includes("BELOW") || accuracy(row) < 70 && isCompleted(row);
}

function needsReattempt(row: AnyRow) {
  const status = String(row.status ?? "").toUpperCase();
  return status.includes("REATTEMPT") || isBelowBenchmark(row);
}

function statusLabel(row: AnyRow) {
  const text = String(row.status ?? "").toUpperCase();
  if (text === "PENDING" || text === "NOT_STARTED" || !text) return "Pending";
  if (text === "IN_PROGRESS") return "Pending";
  if (text === "REATTEMPT_AVAILABLE") return "Needs Re-Attempt";
  if (text === "AUTO_SUBMITTED") return isBelowBenchmark(row) ? "Needs Re-Attempt" : "Cleared";
  if (text === "SUBMITTED" || text === "COMPLETED") return isBelowBenchmark(row) ? "Needs Re-Attempt" : "Cleared";
  if (row.isActive === false) return "Archived";
  if (row.isActive === true) return "Active";
  return row.status ? String(row.status).replaceAll("_", " ") : "Pending";
}

function statusTone(row: AnyRow): "slate" | "green" | "red" | "amber" | "blue" | "cyan" {
  if (row.isActive === false) return "slate";
  if (isBelowBenchmark(row)) return "red";
  if (needsReattempt(row)) return "amber";
  if (isCompleted(row)) return "green";
  if (isPending(row)) return "amber";
  return "blue";
}

function moduleLabel(row: AnyRow) {
  return `${row.moduleCode || "Module"}${row.moduleName ? ` · ${row.moduleName}` : ""}`;
}

function levelLabel(row: AnyRow) {
  return `${row.levelCode || "Level"}${row.levelName ? ` · ${row.levelName}` : ""}`;
}

function lessonLabel(row: AnyRow) {
  return `Lesson ${row.lessonNumber ?? "-"}${row.lessonTitle ? ` · ${row.lessonTitle}` : ""}`;
}

function dpsLabel(row: AnyRow) {
  return `${row.dpsNumber ? `DPS ${row.dpsNumber}` : row.assessmentTitle ? "Assessment" : "DPS"}${row.dpsTitle ? ` · ${row.dpsTitle}` : ""}`;
}

function assignmentTitle(row: AnyRow) {
  return row.assignmentTitle || row.assessmentTitle || row.title || row.dpsTitle || "Assigned Work";
}

function latestActivity(rows: AnyRow[]) {
  return formatMathPathActivityDateTime(rows);
}

function uniqueCount(rows: AnyRow[], keys: string[]) {
  const set = new Set<string>();
  rows.forEach((row) => {
    const value = keys.map((key) => row[key]).find(Boolean);
    if (value) set.add(String(value));
  });
  return set.size || rows.length;
}

function flattenStudent(student: StudentNode) {
  return student.rows ?? [];
}

function Chip({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" | "cyan" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
  };
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-black ${tones[tone]}`}>{children}</span>;
}

function Metric({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-[22px] bg-slate-50 p-4 dark:bg-slate-900/70">
      <div className="flex items-center gap-2 text-slate-500">
        {icon}
        <p className="text-[10px] font-black uppercase tracking-[0.16em]">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}

function studentStats(student: StudentNode) {
  const rows = flattenStudent(student);
  const completed = rows.filter(isCompleted).length;
  const pending = rows.filter(isPending).length;
  const below = rows.filter(isBelowBenchmark).length;
  const reattempt = rows.filter(needsReattempt).length;
  return {
    total: rows.length,
    completed,
    pending,
    below,
    reattempt,
    avg: averageAccuracy(rows),
    last: latestActivity(rows),
  };
}

export function MasterDetailStudentLayout({
  students,
  mode,
  onView,
  onArchive,
  onRestore,
  onDelete,
  busyId,
}: MasterDetailProps) {
  const [selected, setSelected] = useState<StudentNode | null>(null);
  const [drawerTab, setDrawerTab] = useState<"overview" | "lessons" | "attempts" | "actions">("overview");
  const pathname = usePathname();
  const studentCodeColor = pathname?.startsWith("/admin") ? "text-[#2563eb] dark:text-cyan-100" : "text-[#7a1f58] dark:text-rose-100";

  const labels = mode.includes("assessment")
    ? {
        total: "Assessment Records",
        detailTitle: "Assessment Detail Centre",
        viewLabel: "View Details",
        viewTip: mode.startsWith("teacher") ? "Review student assessment" : "Review full assessment record",
      }
    : {
        total: "Practice Records",
        detailTitle: "Practice Detail Centre",
        viewLabel: "View Details",
        viewTip: mode.startsWith("teacher") ? "Review student work" : "Review full practice record",
      };

  return (
    <>
      <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="grid grid-cols-[1.4fr_.65fr_.65fr_.65fr_.65fr_.75fr_150px] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
          <div>Student</div>
          <div>{labels.total}</div>
          <div>Cleared</div>
          <div>Pending</div>
          <div>Average Accuracy</div>
          <div>Last Activity</div>
          <div>Action</div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {students.map((student) => {
            const stats = studentStats(student);
            return (
              <div key={student.key} className="grid grid-cols-[1.4fr_.65fr_.65fr_.65fr_.65fr_.75fr_150px] items-center gap-3 px-5 py-4 transition hover:bg-blue-50/45 dark:hover:bg-slate-900/70">
                <div className="min-w-0">
                  <button
                    type="button"
                    className="truncate text-left text-base font-black text-slate-950 transition hover:text-blue-700 dark:text-white"
                    onClick={() => {
                      setSelected(student);
                      setDrawerTab("overview");
                    }}
                    title="Open student details"
                    aria-label="Open student details"
                  >
                    {student.studentName} <span className={`text-xs font-black uppercase tracking-[0.12em] ${studentCodeColor}`}>({student.studentCode})</span>
                  </button>
                  <p className="mt-1 text-sm font-semibold text-slate-500">{student.classLabel || "-"}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {stats.below ? <Chip tone="red">{stats.below} needs improvement</Chip> : <Chip tone="green">On Track</Chip>}
                    {stats.reattempt ? <Chip tone="amber">Re-Attempt: {stats.reattempt}</Chip> : null}
                  </div>
                </div>

                <div className="text-lg font-black">{stats.total}</div>
                <div><Chip tone="green">{stats.completed}</Chip></div>
                <div><Chip tone={stats.pending ? "amber" : "green"}>{stats.pending}</Chip></div>
                <div><Chip tone={AccuracyTone(stats.avg)}>{typeof stats.avg === "number" ? `${stats.avg}%` : "—"}</Chip></div>
                <div className="text-sm font-bold text-slate-600">{stats.last}</div>
                <div className="flex justify-start">
                  <StandardViewButton
                    label={labels.viewLabel}
                    tooltip={labels.viewTip}
                    onClick={() => {
                      setSelected(student);
                      setDrawerTab("overview");
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected ? (
        <StudentDetailDrawer
          student={selected}
          labels={labels}
          tab={drawerTab}
          setTab={setDrawerTab}
          onClose={() => setSelected(null)}
          mode={mode}
          onView={onView}
          onArchive={onArchive}
          onRestore={onRestore}
          onDelete={onDelete}
          busyId={busyId}
        />
      ) : null}
    </>
  );
}

function StudentDetailDrawer({
  student,
  labels,
  tab,
  setTab,
  onClose,
  mode,
  onView,
  onArchive,
  onRestore,
  onDelete,
  busyId,
}: {
  student: StudentNode;
  labels: { detailTitle: string; viewLabel: string; viewTip: string };
  tab: "overview" | "lessons" | "attempts" | "actions";
  setTab: (value: "overview" | "lessons" | "attempts" | "actions") => void;
  onClose: () => void;
  mode: MasterDetailProps["mode"];
  onView?: (row: AnyRow) => void;
  onArchive?: (row: AnyRow) => void;
  onRestore?: (row: AnyRow) => void;
  onDelete?: (row: AnyRow) => void;
  busyId?: string | null;
}) {
  const rows = flattenStudent(student);
  const stats = studentStats(student);
  const [, setFilterSearch] = useState("");
  const pathname = usePathname();
  const studentCodeColor = pathname?.startsWith("/admin") ? "text-[#2563eb] dark:text-cyan-100" : "text-[#7a1f58] dark:text-rose-100";

  const lessons = useMemo(() => {
    const map = new Map<string, AnyRow[]>();
    rows.forEach((row) => {
      const key = `${row.moduleCode || "Module"}|${row.levelCode || "Level"}|${row.lessonNumber || "-"}|${row.lessonTitle || "Lesson"}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    });
    return Array.from(map.entries()).map(([key, lessonRows]) => ({ key, rows: lessonRows, sample: lessonRows[0] }));
  }, [rows]);

  return (
    <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/25 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <div className="h-full w-full max-w-[1040px] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-br from-white to-blue-50 px-6 py-5 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">{labels.detailTitle}</p>
            <h2 className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{student.studentName}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Chip tone="blue">{student.studentCode}</Chip>
              <Chip>{student.classLabel || "Class -"}</Chip>
              <Chip tone={AccuracyTone(stats.avg)}>{typeof stats.avg === "number" ? `${stats.avg}% average` : "No data yet"}</Chip>
            </div>
          </div>

          <button className="math-button-secondary px-3" onClick={onClose} title="Close details" aria-label="Close details">
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-3 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <Metric label="Total" value={stats.total} icon={<Layers3 size={15} />} />
          <Metric label="Cleared" value={stats.completed} icon={<CheckCircle2 size={15} />} />
          <Metric label="Pending" value={stats.pending} icon={<Clock3 size={15} />} />
          <Metric label="Needs Re-Attempt" value={stats.reattempt} icon={<RotateCcw size={15} />} />
          <Metric label="Needs Re-Attempt" value={stats.below} icon={<AlertTriangle size={15} />} />
        </div>

        <div className="flex gap-2 border-b border-slate-100 px-6 py-3 dark:border-slate-800">
          {[
            ["overview", "Overview"],
            ["lessons", "Lessons"],
            ["attempts", "Sheets / Attempts"],
            ["actions", "Actions"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`rounded-2xl px-4 py-2 text-sm font-black transition ${
                tab === key ? "math-role-tab-button is-active" : "math-role-tab-button"
              }`}
              onClick={() => setTab(key as any)}
              title={`Open ${label}`}
              aria-label={`Open ${label}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="h-[calc(100%-256px)] overflow-y-auto p-6">
          {tab === "overview" ? (
            <div className="grid gap-4">
              <div className="rounded-[26px] border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-cyan-600">Focused summary</p>
                <h3 className="mt-2 text-xl font-black">Student learning snapshot</h3>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                  This drawer keeps the main page compact while preserving the full module, level, lesson, sheet, and attempt context for this student.
                </p>
              </div>
              <CompactRecordTable rows={rows.slice(0, 8)} onView={onView} viewLabel={labels.viewLabel} viewTip={labels.viewTip} />
            </div>
          ) : null}

          {tab === "lessons" ? (
            <div className="grid gap-3">
              {lessons.map((lesson) => {
                const lessonAvg = averageAccuracy(lesson.rows);
                const lessonCompleted = lesson.rows.filter(isCompleted).length;
                return (
                  <div key={lesson.key} className="rounded-[24px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600">{moduleLabel(lesson.sample)} · {levelLabel(lesson.sample)}</p>
                        <h4 className="mt-1 text-base font-black">{lessonLabel(lesson.sample)}</h4>
                      </div>
                      <div className="flex gap-2">
                        <Chip tone="blue">{lesson.rows.length} sheets</Chip>
                        <Chip tone="green">{lessonCompleted} completed</Chip>
                        <Chip tone={AccuracyTone(lessonAvg)}>{typeof lessonAvg === "number" ? `${lessonAvg}% avg` : "No data"}</Chip>
                      </div>
                    </div>
                    <div className="mt-4">
                      <CompactRecordTable rows={lesson.rows} onView={onView} viewLabel={labels.viewLabel} viewTip={labels.viewTip} dense />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}

          {tab === "attempts" ? <CompactRecordTable rows={rows} onView={onView} viewLabel={labels.viewLabel} viewTip={labels.viewTip} /> : null}

          {tab === "actions" ? (
            <div className="grid gap-3">
              {rows.map((row) => {
                const id = String(row.assignmentId || row.id || row.attemptId || row.assessmentAssignmentId || assignmentTitle(row));
                const archived = row.isActive === false;
                return (
                  <div key={id} className="flex items-center justify-between gap-4 rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
                    <div className="min-w-0">
                      <h4 className="truncate font-black">{assignmentTitle(row)}</h4>
                      <p className="mt-1 text-sm font-semibold text-slate-500">{dpsLabel(row)} · {statusLabel(row)}</p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {onView ? <StandardViewButton label={labels.viewLabel} tooltip={labels.viewTip} onClick={() => onView(row)} /> : null}
                      {onArchive && !archived ? (
                        <button className="math-button-secondary px-3 py-2" onClick={() => onArchive(row)} title="Archive record" aria-label="Archive record" disabled={busyId === id}>
                          <Archive size={15} /> Archive
                        </button>
                      ) : null}
                      {onRestore && archived ? (
                        <button className="math-button-secondary px-3 py-2" onClick={() => onRestore(row)} title="Restore record" aria-label="Restore record" disabled={busyId === id}>
                          <RotateCcw size={15} /> Restore
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button className="math-button-danger px-3 py-2" onClick={() => onDelete(row)} title="Delete record" aria-label="Delete record" disabled={busyId === id}>
                          <Trash2 size={15} /> Delete
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function CompactRecordTable({
  rows,
  onView,
  viewLabel,
  viewTip,
  dense = false,
}: {
  rows: AnyRow[];
  onView?: (row: AnyRow) => void;
  viewLabel: string;
  viewTip: string;
  dense?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="grid grid-cols-[1.25fr_.85fr_.75fr_.55fr_.6fr_.8fr_120px] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        <div>Lesson</div>
        <div>DPS</div>
        <div>Status</div>
        <div>Score</div>
        <div>Accuracy</div>
        <div>Cleared</div>
        <div>Review</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.map((row, index) => (
          <div key={`${row.assignmentId || row.attemptId || row.id || index}`} className={`grid grid-cols-[1.25fr_.85fr_.75fr_.55fr_.6fr_.8fr_120px] items-center gap-3 px-4 ${dense ? "py-3" : "py-4"}`}>
            <div className="min-w-0">
              <p className="truncate text-sm font-black">{assignmentTitle(row)}</p>
              <p className="mt-1 truncate text-xs font-semibold text-slate-500">{lessonLabel(row)}</p>
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{dpsLabel(row)}</p>
            </div>
            <div><Chip tone={statusTone(row)}>{statusLabel(row)}</Chip></div>
            <div className="text-sm font-black">{scoreText(row)}</div>
            <div><Chip tone={accuracy(row) >= 70 ? "green" : "red"}>{accuracy(row)}%</Chip></div>
            <div className="text-sm font-semibold text-slate-600">{rowDate(row, ["completedAt", "submittedAt", "attemptDate"])}</div>
            <div className="flex justify-start">
              {onView ? <StandardViewButton label={viewLabel} tooltip={viewTip} onClick={() => onView(row)} compact /> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StandardViewButton({
  label,
  tooltip,
  onClick,
  compact = false,
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      className={`math-role-action-button ${
        compact ? "px-3 py-2 text-xs" : "px-4 py-2.5 text-sm"
      }`}
      onClick={onClick}
      title={tooltip}
      aria-label={tooltip}
    >
      <Eye size={compact ? 14 : 16} />
      {label}
    </button>
  );
}

export function StudentProgressMasterDetail({
  modules,
  onViewResult,
}: {
  modules: any[];
  onViewResult: (row: AnyRow) => void;
}) {
  const [selectedModule, setSelectedModule] = useState<any | null>(null);
  const [tab, setTab] = useState<"overview" | "lessons" | "sheets" | "attempts">("overview");

  const allRows = useMemo(() => {
    const rows: AnyRow[] = [];
    modules.forEach((module) => rows.push(...(module.rows || [])));
    return rows;
  }, [modules]);

  return (
    <>
      <div className="grid gap-4">
        {modules.map((module) => {
          const avg = averageAccuracy(module.rows || []);
          const completed = (module.rows || []).filter(isCompleted).length;
          return (
            <button
              key={module.key}
              className="rounded-[28px] border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/35 hover:shadow-lg dark:border-slate-800 dark:bg-slate-950"
              onClick={() => {
                setSelectedModule(module);
                setTab("overview");
              }}
              title="Open module progress"
              aria-label="Open module progress"
            >
              <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">Module Progress</p>
              <h3 className="mt-2 text-xl font-black">{module.title}</h3>
              <div className="mt-4 grid grid-cols-4 gap-3">
                <Metric label="My Attempts" value={(module.rows || []).length} icon={<FileText size={15} />} />
                <Metric label="Cleared" value={completed} icon={<CheckCircle2 size={15} />} />
                <Metric label="Average" value={typeof avg === "number" ? `${avg}%` : "—"} icon={<TargetIcon />} />
                <Metric label="Last Activity" value={latestActivity(module.rows || [])} icon={<Clock3 size={15} />} />
              </div>
            </button>
          );
        })}
      </div>

      {selectedModule ? (
        <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/25 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="h-full w-full max-w-[980px] overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_100px_rgba(15,23,42,0.28)] dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-gradient-to-br from-white to-blue-50 px-6 py-5 dark:border-slate-800 dark:from-slate-950 dark:to-slate-900">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-cyan-600">My Progress Detail</p>
                <h2 className="mt-2 text-3xl font-black text-slate-950 dark:text-white">{selectedModule.title}</h2>
                <p className="mt-2 text-sm font-semibold text-slate-500">Review your level, lesson, sheet, and attempt progress without clutter.</p>
              </div>
              <button className="math-button-secondary px-3" onClick={() => setSelectedModule(null)} title="Close progress details" aria-label="Close progress details">
                <X size={18} />
              </button>
            </div>

            <div className="flex gap-2 border-b border-slate-100 px-6 py-3 dark:border-slate-800">
              {[
                ["overview", "Overview"],
                ["lessons", "Lessons"],
                ["sheets", "Sheets"],
                ["attempts", "Attempts"],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={`rounded-2xl px-4 py-2 text-sm font-black transition ${
                    tab === key ? "math-role-tab-button is-active" : "math-role-tab-button"
                  }`}
                  onClick={() => setTab(key as any)}
                  title={`Open ${label}`}
                  aria-label={`Open ${label}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="h-[calc(100%-150px)] overflow-y-auto p-6">
              {tab === "overview" ? (
                <div className="grid grid-cols-4 gap-3">
                  <Metric label="DPS Cleared" value={(selectedModule.rows || []).filter(isCompleted).length} icon={<CheckCircle2 size={15} />} />
                  <Metric label="My Attempts" value={(selectedModule.rows || []).length} icon={<FileText size={15} />} />
                  <Metric label="Average Accuracy" value={`${averageAccuracy(selectedModule.rows || [])}%`} icon={<TargetIcon />} />
                  <Metric label="Needs Re-Attempt" value={(selectedModule.rows || []).filter(needsReattempt).length} icon={<RotateCcw size={15} />} />
                </div>
              ) : null}

              {tab === "lessons" ? <StudentLessonList module={selectedModule} /> : null}
              {tab === "sheets" || tab === "attempts" ? (
                <CompactRecordTable rows={selectedModule.rows || []} onView={onViewResult} viewLabel="View Result" viewTip="View your result" />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function StudentLessonList({ module }: { module: any }) {
  const lessons = new Map<string, AnyRow[]>();
  (module.rows || []).forEach((row: AnyRow) => {
    const key = `${row.levelCode || "Level"}|${row.lessonNumber || "-"}|${row.lessonTitle || "Lesson"}`;
    if (!lessons.has(key)) lessons.set(key, []);
    lessons.get(key)!.push(row);
  });

  return (
    <div className="grid gap-3">
      {Array.from(lessons.entries()).map(([key, rows]) => (
        <div key={key} className="rounded-[24px] border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-600">{levelLabel(rows[0])}</p>
              <h4 className="mt-1 text-base font-black">{lessonLabel(rows[0])}</h4>
            </div>
            <div className="flex gap-2">
              <Chip tone="blue">{rows.length} sheet(s)</Chip>
              <Chip tone="green">{rows.filter(isCompleted).length} completed</Chip>
              <Chip tone={AccuracyTone(averageAccuracy(rows))}>{typeof averageAccuracy(rows) === "number" ? `${averageAccuracy(rows)}% avg` : "No data"}</Chip>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TargetIcon() {
  return <span className="inline-flex h-[15px] w-[15px] rounded-full border-2 border-blue-500" />;
}
