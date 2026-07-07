"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  MATHPATH_COMPLETION_TIMESTAMP_KEYS,
  formatMathPathDateTime,
  getFirstMathPathTimestamp,
} from "@/lib/date";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { AlertTriangle, BarChart3, ChevronDown, Clock3, GraduationCap, PlayCircle, Search, ShieldCheck, Sparkles, Trophy, Radio, Milestone } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

type AssessmentRow = Record<string, any>;

type LoadState = {
  loading: boolean;
  error: string | null;
  rows: AssessmentRow[];
};

function apiBaseUrl() {
  const RawBaseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").trim();
  const CleanBaseUrl = RawBaseUrl.replace(/\/+$/, "");
  return CleanBaseUrl.endsWith("/api") ? CleanBaseUrl : `${CleanBaseUrl}/api`;
}

function authToken() {
  if (typeof window === "undefined") return "";

  const RoleScopedToken =
    localStorage.getItem("mathpath_student_access_token") ||
    localStorage.getItem("mathpath_access_token") ||
    localStorage.getItem("mathpath_token") ||
    localStorage.getItem("access_token") ||
    localStorage.getItem("token") ||
    "";

  return RoleScopedToken;
}

async function fetchJson(url: string) {
  const token = authToken();
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Request failed with status code ${response.status}`);
  }

  return response.json();
}

function arrayFromPayload(payload: any): AssessmentRow[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.assessments)) return payload.assessments;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.assignments)) return payload.assignments;
  if (Array.isArray(payload?.activeAssessments)) return payload.activeAssessments;
  if (Array.isArray(payload?.activeAssignments)) {
    return payload.activeAssignments.filter((row: AssessmentRow) => isAssessment(row));
  }
  return [];
}

function isAssessment(row: AssessmentRow) {
  const haystack = [
    row.assignmentType,
    row.type,
    row.category,
    row.mode,
    row.title,
    row.assignmentTitle,
    row.assessmentTitle,
  ]
    .filter(Boolean)
    .join(" ")
    .toUpperCase();

  return haystack.includes("ASSESSMENT") || haystack.includes("EXAM") || haystack.includes("TEST");
}

async function loadStudentAssessments() {
  const base = apiBaseUrl();

  const candidateUrls = [
    `${base}/student/assessments`,
    `${base}/student/assessments/assigned`,
    `${base}/student/assignments?type=ASSESSMENT`,
    `${base}/student/dashboard`,
  ];

  const errors: string[] = [];

  for (const url of candidateUrls) {
    try {
      const payload = await fetchJson(url);
      const rows = arrayFromPayload(payload);
      return rows.filter((row) => {
        const hasExplicitAssessment = isAssessment(row);
        const hasAssessmentFields = row.assessmentId || row.assessmentTitle;
        return hasExplicitAssessment || hasAssessmentFields;
      });
    } catch (error: any) {
      errors.push(`${url}: ${error?.message || "failed"}`);
    }
  }

  // Route exists now even if the backend assessment endpoint is not yet enabled.
  // We return an empty list instead of throwing a route-level 404.
  if (errors.every((message) => message.includes("404"))) return [];

  throw new Error("Unable to load student assessments. Please refresh after signing in again, or ask Admin to verify assessment access.");
}

function normalizeStatus(status: unknown) {
  return String(status ?? "").toUpperCase();
}

function messageIndex(seed: unknown, count: number) {
  if (count <= 1) return 0;
  const text = String(seed || "MathPath Assessment");
  const total = Array.from(text).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return total % count;
}

function pickMessage(seed: unknown, messages: string[]) {
  return messages[messageIndex(seed, messages.length)] || messages[0];
}

function statusDisplay(status: unknown) {
  const text = normalizeStatus(status);
  if (text === "PENDING" || text === "NOT_STARTED" || !text) return "Pending";
  if (text === "IN_PROGRESS") return "Pending";
  if (text === "REATTEMPT_AVAILABLE" || text === "NEEDS_RE_ATTEMPT" || text === "NEEDS_REATTEMPT") return "Needs Re-Attempt";
  if (text === "AUTO_SUBMITTED" || text === "COMPLETED" || text === "CLEARED") return "Cleared";
  return String(status).replaceAll("_", " ");
}

function statusTone(status: unknown) {
  const text = normalizeStatus(status);
  if (text === "COMPLETED" || text === "CLEARED" || text === "AUTO_SUBMITTED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (text === "REATTEMPT_AVAILABLE" || text === "NEEDS_RE_ATTEMPT" || text === "NEEDS_REATTEMPT") return "border-rose-200 bg-rose-50 text-rose-700";
  if (text === "PENDING" || text === "NOT_STARTED" || text === "ASSIGNED" || text === "IN_PROGRESS" || !text) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function hasStartedPromotedLevel(row: AssessmentRow) {
  return Boolean((row as AssessmentRow & { hasStartedPromotedLevel?: boolean | null }).hasStartedPromotedLevel);
}

function progressionState(rows: AssessmentRow[]) {
  const promoted = rows.find((row) => (row.isPromoted || normalizeStatus(row.progressionStatus) === "PROMOTED") && !hasStartedPromotedLevel(row));
  if (promoted) {
    return {
      tone: "success" as const,
      label: "Promoted",
      title: "Your Next Level Is Ready",
      message: pickMessage(promoted?.attemptId || promoted?.assignmentId || promoted?.assessmentTitle, [
        "Amazing work! Your next learning path is open. Keep building speed, accuracy, and confidence.",
        "You have moved forward in your MathPath journey. Stay curious and enjoy the next challenge.",
        "Wonderful progress! Your steady practice helped you reach this milestone. Keep going with confidence.",
      ]),
    };
  }

  const available = rows.find((row) => row.isReadyForNextLevel || normalizeStatus(row.progressionStatus) === "READY_FOR_NEXT_LEVEL");
  if (available) {
    return {
      tone: "ready" as const,
      label: "Ready For Next Level",
      title: "You Are Ready For The Next Level",
      message: pickMessage(available?.attemptId || available?.assignmentId || available?.assessmentTitle, [
        "Fantastic progress! You cleared your assessment, and your next learning milestone is now within reach.",
        "Great work completing this level assessment. Your teacher/admin will guide the next step smoothly.",
        "You showed strong focus and steady effort. Keep your confidence high as you prepare for the next level.",
      ]),
    };
  }

  const needsReattempt = rows.find((row) => statusDisplay(row.status) === "Needs Re-Attempt");
  if (needsReattempt) {
    return {
      tone: "focus" as const,
      label: "Focused Practice",
      title: "You Are Getting Closer",
      message: pickMessage(needsReattempt?.attemptId || needsReattempt?.assignmentId || needsReattempt?.assessmentTitle, [
        "Every mistake is a clue. Review calmly, practise again, and your next attempt can be stronger.",
        "You are still building this skill. Step-by-step practice will help your confidence and accuracy grow.",
        "Stay steady. A little focused revision will help you move closer to clearing this level.",
      ]),
    };
  }

  return {
    tone: "steady" as const,
    label: "Learning Journey",
    title: "Keep Moving Step By Step",
    message: rows.length > 0
      ? pickMessage(rows[0]?.assessmentTitle || rows.length, [
        "Complete your assigned assessments with focus. Your progress will guide the next learning milestone.",
        "Take each assessment step calmly. Every attempt helps you understand your strengths better.",
        "Stay focused and keep learning. Your assessment journey will show when you are ready for the next step.",
      ])
      : "Assigned level assessments will appear here when your teacher/admin opens the next assessment step.",
  };
}

function progressionToneClass(tone: ReturnType<typeof progressionState>["tone"]) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "ready") return "border-violet-200 bg-violet-50 text-violet-700";
  if (tone === "focus") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

function value(row: AssessmentRow, keys: string[], fallback = "-") {
  for (const key of keys) {
    const item = row[key];
    if (item !== null && item !== undefined && item !== "") return item;
  }
  return fallback;
}

function assessmentTitle(row: AssessmentRow) {
  return value(row, ["assessmentTitle", "assignmentTitle", "title"], "Assessment");
}

function levelText(row: AssessmentRow) {
  const levelCode = value(row, ["levelCode"], "");
  const levelName = value(row, ["levelName"], "");
  return [levelCode, levelName].filter(Boolean).join(" - ") || "-";
}

function scopeText(row: AssessmentRow) {
  return [
    value(row, ["moduleName", "moduleCode"], ""),
    value(row, ["levelCode", "levelName"], ""),
  ]
    .filter(Boolean)
    .join(" • ");
}

function assessmentHref(row: AssessmentRow) {
  const status = normalizeStatus(row.status);
  const attemptId = value(row, ["attemptId"], "");
  if (["COMPLETED", "CLEARED", "NEEDS_RE_ATTEMPT", "REATTEMPT_AVAILABLE"].includes(status) && attemptId) {
    return `/student/assessment-result/${attemptId}`;
  }
  const id = value(row, ["assignmentId", "assessmentAssignmentId", "assessmentId", "id"], "");
  if (!id) return "/student/assessments";
  return `/student/assessment/${id}`;
}

function cleanNumber(valueInput: unknown) {
  const numberValue = Number(valueInput);
  if (!Number.isFinite(numberValue)) return "";
  return String(Math.round(numberValue));
}

function cappedScore(row: AssessmentRow) {
  const rawScore = Number(value(row, ["score", "totalScore", "scoreObtained", "marksObtained"], ""));
  const rawTotal = Number(value(row, ["totalMarks", "maxScore", "outOf"], "100"));
  if (!Number.isFinite(rawScore)) return null;
  if (Number.isFinite(rawTotal) && rawTotal > 0) return Math.min(Math.max(rawScore, 0), rawTotal);
  return Math.max(rawScore, 0);
}

function attemptLabel(row: AssessmentRow) {
  const direct = value(row, ["attemptLabel"], "");
  if (direct && direct !== "-") return String(direct);
  const typeText = String(value(row, ["attemptType", "assessmentAssignmentType"], "ORIGINAL")).toUpperCase();
  const numberValue = Number(value(row, ["attemptNumber", "currentAttemptNumber"], "1"));
  if (typeText === "RE_ATTEMPT" || numberValue > 1) return `Re-Attempt ${Math.max(1, Number.isFinite(numberValue) ? numberValue - 1 : 1)}`;
  return "Original";
}


function AttemptSortIndex(row: AssessmentRow) {
  const DirectAttempt = Number(value(row, ["attemptNumber", "currentAttemptNumber", "attemptSequence", "sequenceNumber"], ""));
  if (Number.isFinite(DirectAttempt) && DirectAttempt > 0) return DirectAttempt;

  const DirectLabel = String(value(row, ["attemptLabel"], "")).toUpperCase();
  const LabelMatch = DirectLabel.match(/RE[-\s]?ATTEMPT\s*(\d+)/);
  if (LabelMatch?.[1]) return Number(LabelMatch[1]) + 1;

  const TypeText = String(value(row, ["attemptType", "assessmentAssignmentType"], "ORIGINAL")).toUpperCase();
  if (TypeText.includes("RE_ATTEMPT") || TypeText.includes("REATTEMPT")) return 2;
  return 1;
}

function AttemptChronologyTimestamp(row: AssessmentRow) {
  const TimestampValue = getFirstMathPathTimestamp(row, [
    "assignedAt",
    "startedAt",
    "submittedAt",
    "completedAt",
    "createdAt",
  ]);
  if (!TimestampValue) return Number.MAX_SAFE_INTEGER;
  const ParsedTimestamp = new Date(TimestampValue).getTime();
  return Number.isFinite(ParsedTimestamp) ? ParsedTimestamp : Number.MAX_SAFE_INTEGER;
}

function SortAssessmentAttemptsAscending(rows: AssessmentRow[]) {
  return [...rows].sort((FirstRow, SecondRow) => {
    const AttemptDifference = AttemptSortIndex(FirstRow) - AttemptSortIndex(SecondRow);
    if (AttemptDifference !== 0) return AttemptDifference;

    const TimestampDifference = AttemptChronologyTimestamp(FirstRow) - AttemptChronologyTimestamp(SecondRow);
    if (TimestampDifference !== 0) return TimestampDifference;

    return assessmentTitle(FirstRow).localeCompare(assessmentTitle(SecondRow), undefined, { numeric: true });
  });
}


function CurrentAssessmentMetricRows(rows: AssessmentRow[]) {
  const LatestByLevel = new Map<string, AssessmentRow>();

  rows.forEach((row) => {
    const MetricKey = [
      value(row, ["moduleCode", "moduleId"], "Module"),
      value(row, ["levelCode", "levelId"], "Level"),
    ].join("|");
    const ExistingRow = LatestByLevel.get(MetricKey);
    if (!ExistingRow) {
      LatestByLevel.set(MetricKey, row);
      return;
    }

    const SortedRows = SortAssessmentAttemptsAscending([ExistingRow, row]);
    LatestByLevel.set(MetricKey, SortedRows[SortedRows.length - 1]);
  });

  return Array.from(LatestByLevel.values());
}

function AssessmentAverageAccuracyDisplay(rows: AssessmentRow[]) {
  const AccuracyValues = rows
    .map((row) => Number(value(row, ["accuracy", "accuracyPercentage", "percentage"], "")))
    .filter((Value) => Number.isFinite(Value))
    .map((Value) => Math.min(100, Math.max(0, Math.round(Value))));

  if (!AccuracyValues.length) return "0%";

  const Average = AccuracyValues.reduce((Total, Value) => Total + Value, 0) / AccuracyValues.length;
  return `${Math.round(Average)}%`;
}

function recordScore(row: AssessmentRow) {
  const score = cappedScore(row);
  const total = Number(value(row, ["totalMarks", "maxScore", "outOf"], "100"));
  return score !== null ? `${cleanNumber(score)} / ${cleanNumber(total) || "100"}` : "—";
}

function recordAccuracy(row: AssessmentRow) {
  const rawAccuracy = Number(value(row, ["accuracy", "accuracyPercentage", "percentage"], ""));
  if (!Number.isFinite(rawAccuracy)) return "—";
  return `${cleanNumber(Math.min(Math.max(rawAccuracy, 0), 100))}%`;
}


function PerformanceValueChip({ Value, Tone = "blue" }: { Value: string; Tone?: "blue" | "green" | "red" | "slate" }) {
  const ToneClasses = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  };
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-black ${ToneClasses[Tone]}`}>{Value}</span>;
}

function AccuracyTone(row: AssessmentRow): "green" | "red" | "slate" {
  const RawAccuracy = Number(value(row, ["accuracy", "accuracyPercentage", "percentage"], ""));
  if (!Number.isFinite(RawAccuracy)) return "slate";
  return RawAccuracy >= 70 ? "green" : "red";
}

function completionDate(row: AssessmentRow) {
  const item = getFirstMathPathTimestamp(row, MATHPATH_COMPLETION_TIMESTAMP_KEYS);
  return item ? formatMathPathDateTime(item) : "Pending";
}

function assignedDate(row: AssessmentRow) {
  const item = getFirstMathPathTimestamp(row, ["assignedAt", "createdAt"]);
  return item ? formatMathPathDateTime(item) : "—";
}

function deepParam(Params: { get(Name: string): string | null }, Names: string[]) {
  for (const Name of Names) {
    const Value = Params.get(Name);
    if (Value && Value.trim()) return Value.trim();
  }
  return "";
}

function normalizedText(Value: unknown) {
  return String(Value || "").trim().toLowerCase();
}

function isInternalDeepLinkValue(Value: unknown) {
  const Text = String(Value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(Text) || /^\d+$/.test(Text);
}

function visibleDeepParam(Params: { get(Name: string): string | null }, Names: string[]) {
  for (const Name of Names) {
    const Value = Params.get(Name);
    if (Value && Value.trim() && !isInternalDeepLinkValue(Value)) return Value.trim();
  }
  return "";
}

function studentAssessmentMatchesTarget(row: AssessmentRow, Target: { Module: string; Level: string; AssignmentId: string; AssessmentId: string; AttemptId: string; Highlight: string }) {
  const ModuleTarget = normalizedText(Target.Module);
  const LevelTarget = normalizedText(Target.Level);
  const AssignmentTarget = normalizedText(Target.AssignmentId || Target.AssessmentId);
  const AttemptTarget = normalizedText(Target.AttemptId || Target.Highlight);
  const ModuleMatches = !ModuleTarget || [value(row, ["moduleCode"], ""), value(row, ["moduleId"], "")].some((Value) => normalizedText(Value) === ModuleTarget);
  const LevelMatches = !LevelTarget || [value(row, ["levelCode"], ""), value(row, ["levelId"], "")].some((Value) => normalizedText(Value) === LevelTarget);
  const AssignmentMatches = !AssignmentTarget || [value(row, ["assignmentId"], ""), value(row, ["assessmentAssignmentId"], ""), value(row, ["assessmentId"], ""), value(row, ["id"], "")].some((Value) => normalizedText(Value) === AssignmentTarget);
  const AttemptMatches = !AttemptTarget || [value(row, ["attemptId"], ""), value(row, ["latestAttemptId"], ""), value(row, ["resultAttemptId"], ""), value(row, ["assignmentId"], ""), value(row, ["assessmentAssignmentId"], "")].some((Value) => normalizedText(Value) === AttemptTarget);
  return ModuleMatches && LevelMatches && AssignmentMatches && AttemptMatches;
}



export default function StudentAssessmentsPage() {
  return (
    <Suspense fallback={null}>
      <StudentAssessmentsPageContent />
    </Suspense>
  );
}

function StudentAssessmentsPageContent() {
  const ready = useProtectedPage(["STUDENT"]);
  const SearchParams = useSearchParams();
  const DeepLinkTarget = useMemo(() => ({
    Module: deepParam(SearchParams, ["moduleCode", "module", "moduleId"]),
    Level: deepParam(SearchParams, ["levelCode", "level", "levelId"]),
    AssignmentId: deepParam(SearchParams, ["assignmentId"]),
    AssessmentId: deepParam(SearchParams, ["assessmentId"]),
    AttemptId: deepParam(SearchParams, ["attemptId"]),
    Highlight: deepParam(SearchParams, ["highlight", "recordId"]),
  }), [SearchParams]);
  const StudentAssessmentsStateKey = CreatePersistedUiStateKey("student", "assessments");
  const [search, setSearch] = usePersistentUiState(CreatePersistedUiStateKey(StudentAssessmentsStateKey, "search"), "");
  const [moduleFilter, setModuleFilter] = usePersistentUiState(CreatePersistedUiStateKey(StudentAssessmentsStateKey, "module-filter"), "");
  const [levelFilter, setLevelFilter] = usePersistentUiState(CreatePersistedUiStateKey(StudentAssessmentsStateKey, "level-filter"), "");
  const [state, setState] = useState<LoadState>({ loading: true, error: null, rows: [] });
  const [openModules, setOpenModules] = usePersistentUiState<Record<string, boolean>>(CreatePersistedUiStateKey(StudentAssessmentsStateKey, "open-modules"), {});
  const [openLevels, setOpenLevels] = usePersistentUiState<Record<string, boolean>>(CreatePersistedUiStateKey(StudentAssessmentsStateKey, "open-levels"), {});

  useEffect(() => {
    if (!ready) return;

    let active = true;
    setState((current) => ({ ...current, loading: true, error: null }));

    loadStudentAssessments()
      .then((rows) => {
        if (!active) return;
        setState({ loading: false, error: null, rows });
      })
      .catch((error) => {
        if (!active) return;
        setState({ loading: false, error: error?.message || "Unable to load assessments.", rows: [] });
      });

    return () => {
      active = false;
    };
  }, [ready]);

  useEffect(() => {
    const HasTarget = Object.values(DeepLinkTarget).some(Boolean);
    if (!HasTarget) return;
    const ModuleFilterTarget = visibleDeepParam(SearchParams, ["moduleCode", "moduleName", "module"]);
    if (ModuleFilterTarget) setModuleFilter(ModuleFilterTarget);
    const LevelFilterTarget = visibleDeepParam(SearchParams, ["levelCode", "levelName", "level"]);
    if (LevelFilterTarget) setLevelFilter(LevelFilterTarget);
    const MatchingRow = state.rows.find((Row) => studentAssessmentMatchesTarget(Row, DeepLinkTarget));
    if (!MatchingRow) return;
    const ModuleKey = String(value(MatchingRow, ["moduleCode", "moduleId"], "Module"));
    const LevelKey = String(value(MatchingRow, ["levelCode", "levelId"], "Level"));
    setOpenModules((Current) => ({ ...Current, [ModuleKey]: true }));
    setOpenLevels((Current) => ({ ...Current, [`${ModuleKey}|${LevelKey}`]: true }));
    window.setTimeout(() => {
      const FocusId = value(MatchingRow, ["attemptId", "assignmentId", "assessmentAssignmentId", "assessmentId", "id"], "");
      if (FocusId) document.getElementById(`student-assessment-record-${FocusId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 250);
  }, [DeepLinkTarget, SearchParams, state.rows]);

  const moduleOptions = useMemo(() => {
    const map = new Map<string, string>();
    state.rows.forEach((row) => {
      const code = String(value(row, ["moduleCode", "moduleId"], ""));
      if (!code) return;
      const name = String(value(row, ["moduleName"], ""));
      map.set(code, name && name !== code ? `${code} · ${name}` : code);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [state.rows]);

  const levelOptions = useMemo(() => {
    const source = moduleFilter && moduleFilter !== "ALL" ? state.rows.filter((row) => String(value(row, ["moduleCode", "moduleId"], "")) === moduleFilter) : state.rows;
    const map = new Map<string, string>();
    source.forEach((row) => {
      const code = String(value(row, ["levelCode", "levelId"], ""));
      if (!code) return;
      const name = String(value(row, ["levelName"], ""));
      map.set(code, name && name !== code ? `${code} · ${name}` : code);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  }, [state.rows, moduleFilter]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return state.rows.filter((row) => {
      const matchesSearch = !q || [
        assessmentTitle(row),
        levelText(row),
        scopeText(row),
        statusDisplay(value(row, ["status"], "")),
        value(row, ["moduleName", "moduleCode"], ""),
        value(row, ["levelName", "levelCode"], ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
      const matchesModule = !moduleFilter || moduleFilter === "ALL" || String(value(row, ["moduleCode", "moduleId"], "")) === moduleFilter;
      const matchesLevel = !levelFilter || levelFilter === "ALL" || String(value(row, ["levelCode", "levelId"], "")) === levelFilter;
      return matchesSearch && matchesModule && matchesLevel;
    });
  }, [state.rows, search, moduleFilter, levelFilter]);

  const groupedRows = useMemo(() => {
    const moduleMap = new Map<string, { key: string; label: string; levels: Map<string, { key: string; label: string; rows: AssessmentRow[] }> }>();
    filteredRows.forEach((row) => {
      const moduleCode = String(value(row, ["moduleCode", "moduleId"], "Module"));
      const moduleName = String(value(row, ["moduleName"], ""));
      const moduleLabel = moduleName && moduleName !== moduleCode ? `${moduleName} · ${moduleCode}` : moduleCode;
      const levelCode = String(value(row, ["levelCode", "levelId"], "Level"));
      const levelName = String(value(row, ["levelName"], ""));
      const levelLabel = levelName && levelName !== levelCode ? `${levelCode} · ${levelName}` : levelCode;
      if (!moduleMap.has(moduleCode)) moduleMap.set(moduleCode, { key: moduleCode, label: moduleLabel, levels: new Map() });
      const moduleGroup = moduleMap.get(moduleCode)!;
      if (!moduleGroup.levels.has(levelCode)) moduleGroup.levels.set(levelCode, { key: levelCode, label: levelLabel, rows: [] });
      moduleGroup.levels.get(levelCode)!.rows.push(row);
    });
    return Array.from(moduleMap.values())
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
      .map((moduleGroup) => ({
        ...moduleGroup,
        levels: Array.from(moduleGroup.levels.values())
          .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }))
          .map((levelGroup) => ({
            ...levelGroup,
            rows: SortAssessmentAttemptsAscending(levelGroup.rows),
          })),
      }));
  }, [filteredRows]);

  const CurrentMetricRows = CurrentAssessmentMetricRows(state.rows);
  const clearedCount = CurrentMetricRows.filter((row) => statusDisplay(row.status) === "Cleared").length;
  const pendingCount = CurrentMetricRows.filter((row) => statusDisplay(row.status) === "Pending").length;
  const needsReattemptCount = CurrentMetricRows.filter((row) => statusDisplay(row.status) === "Needs Re-Attempt").length;
  const averageAccuracyValue = AssessmentAverageAccuracyDisplay(CurrentMetricRows);
  const ProgressionState = progressionState(state.rows);

  if (!ready) return null;

  return (
    <AppShell>
      <section className="math-hero relative overflow-hidden rounded-[36px] bg-gradient-to-r from-white/70 to-white/40 dark:from-slate-900/80 dark:to-slate-800/40 backdrop-blur-[32px] border border-white/40 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] p-8 xl:p-12 mb-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-indigo-300/10 blur-3xl" />
        <div className="relative z-10">
          <div className="math-block-header mb-2">
            <Radio size={14} />
            Live Assessments
          </div>
          <h1 className="math-title">Assessments</h1>
          <p className="math-subtitle">Open assigned level assessments and review your assessment status.</p>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Metric icon={<GraduationCap size={19} />} label="Assigned Assessments" value={state.rows.length} />
            <Metric icon={<ShieldCheck size={19} />} label="Cleared Assessments" value={clearedCount} />
            <Metric icon={<Clock3 size={19} />} label="Pending Assessments" value={pendingCount} />
            <Metric icon={<AlertTriangle size={19} />} label="Needs Re-Attempt" value={needsReattemptCount} />
            <Metric icon={<BarChart3 size={19} />} label="Average Accuracy" value={averageAccuracyValue} />
          </div>
        </div>
      </section>

      <section className="mt-6 math-card p-5 sm:p-6">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input className="math-input pl-11" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Assessments" />
          </div>
          <select className="math-input" value={moduleFilter || "__CHOOSE__"} onChange={(event) => { const next = event.target.value === "__CHOOSE__" ? "" : event.target.value; setModuleFilter(next); setLevelFilter(""); }} title="Choose Module" aria-label="Choose Module">
            <option value="__CHOOSE__" disabled>Choose Module</option>
            <option value="ALL">All Modules</option>
            {moduleOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <select className="math-input" value={levelFilter || "__CHOOSE__"} onChange={(event) => setLevelFilter(event.target.value === "__CHOOSE__" ? "" : event.target.value)} title="Choose Level" aria-label="Choose Level">
            <option value="__CHOOSE__" disabled>Choose Level</option>
            <option value="ALL">All Levels</option>
            {levelOptions.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </div>
      </section>

      {!state.loading && !state.error ? <StudentProgressionBanner State={ProgressionState} /> : null}

      <section className="mt-6">
        {state.loading ? <LoadingState label="Loading assessments..." /> : null}
        {state.error ? <ErrorState message={state.error} /> : null}

        {!state.loading && !state.error && !filteredRows.length ? (
          <EmptyState message="Assigned level assessments will appear here." />
        ) : null}

        <div className="grid gap-5">
          {groupedRows.map((moduleGroup) => {
            const isModuleOpen = openModules[moduleGroup.key] ?? false;
            const ModuleRows = moduleGroup.levels.flatMap((levelGroup) => levelGroup.rows);
            return (
              <section key={moduleGroup.key} className="math-card p-5 sm:p-6">
                <button type="button" className="mb-4 flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between" onClick={() => setOpenModules((Current) => ({ ...Current, [moduleGroup.key]: !(Current[moduleGroup.key] ?? false) }))} aria-expanded={isModuleOpen} title={isModuleOpen ? "Collapse assessment module" : "Expand assessment module"}>
                  <div>
                    <div className="math-block-header mb-2"><Radio size={14} /> Assessment Module</div>
                    <h2 className="text-2xl font-black text-slate-950 dark:text-white">{moduleGroup.label}</h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{moduleGroup.levels.length} Level(s)</span>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">{ModuleRows.filter((Row) => statusDisplay(Row.status).includes("Cleared")).length} Cleared</span>
                    <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300"><ChevronDown className={isModuleOpen ? "rotate-180 transition" : "transition"} size={18} /></span>
                  </div>
                </button>
                {isModuleOpen ? (
                  <div className="grid gap-4">
                    {moduleGroup.levels.map((levelGroup) => {
                      const LevelKey = `${moduleGroup.key}|${levelGroup.key}`;
                      const isLevelOpen = openLevels[LevelKey] ?? false;
                      return (
                        <div key={levelGroup.key} className="rounded-[26px] border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                          <button type="button" className="mb-4 flex w-full flex-col gap-2 text-left sm:flex-row sm:items-center sm:justify-between" onClick={() => setOpenLevels((Current) => ({ ...Current, [LevelKey]: !(Current[LevelKey] ?? false) }))} aria-expanded={isLevelOpen} title={isLevelOpen ? "Collapse level assessment" : "Expand level assessment"}>
                            <div>
                              <div className="math-block-header mb-2"><Radio size={14} /> Level Assessment</div>
                              <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">{levelGroup.label}</h3>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{levelGroup.rows.length} Assessment(s)</span>
                              <span className="rounded-2xl bg-slate-50 p-2 text-slate-600 shadow-sm dark:bg-slate-900 dark:text-slate-300"><ChevronDown className={isLevelOpen ? "rotate-180 transition" : "transition"} size={18} /></span>
                            </div>
                          </button>
                          {isLevelOpen ? (
                            <div className="overflow-hidden rounded-[22px] border border-slate-200 dark:border-slate-800">
                              <div className="w-full overflow-x-auto">
                                <div className="min-w-[850px] xl:min-w-0">
                                  <div className="math-student-assessments-table-header grid grid-cols-[1.08fr_.54fr_.68fr_.5fr_.5fr_.78fr_.78fr_164px] gap-3 bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 dark:bg-slate-900/70">
                                    <div>Assessment</div>
                                    <div className="text-center">Attempt</div>
                                    <div className="text-center">Status</div>
                                    <div className="text-center">Score</div>
                                    <div className="text-center">Accuracy</div>
                                    <div>Assigned Date</div>
                                    <div>Completion Date</div>
                                    <div className="text-right pr-2">Action</div>
                                  </div>
                                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {levelGroup.rows.map((row, index) => <StudentAssessmentRecordRow key={String(value(row, ["assignmentId", "assessmentAssignmentId", "assessmentId", "id"], String(index)))} row={row} FocusTarget={DeepLinkTarget} />)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function StudentProgressionBanner({ State }: { State: ReturnType<typeof progressionState> }) {
  const ToneClass = progressionToneClass(State.tone);
  return (
    <section className="relative mt-6 overflow-hidden rounded-[30px] border border-violet-100/80 bg-gradient-to-br from-white via-violet-50/90 to-cyan-50/85 p-[1px] shadow-[0_18px_55px_rgba(79,70,229,0.12)] backdrop-blur-xl dark:border-violet-400/20 dark:from-slate-950 dark:via-indigo-950/70 dark:to-cyan-950/50">
      <div className="pointer-events-none absolute -right-16 -top-20 h-44 w-44 rounded-full bg-violet-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 left-24 h-40 w-40 rounded-full bg-cyan-300/25 blur-3xl" />
      <div className="relative flex flex-col gap-4 rounded-[29px] bg-white/74 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6 dark:bg-slate-950/60">
        <div className="flex min-w-0 gap-4">
          <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-3xl border shadow-sm ${ToneClass}`}>
            <Trophy size={25} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="math-block-header"><Milestone size={14} /> Next Level Journey</div>
              <span className={`rounded-full border px-3.5 py-1.5 text-[11px] font-black shadow-sm ${ToneClass}`}>{State.label}</span>
            </div>
            <h2 className="mt-2.5 text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-[1.65rem]">{State.title}</h2>
            <p className="mt-2 max-w-4xl text-[0.95rem] leading-7 text-slate-650 dark:text-slate-200">{State.message}</p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-white/80 bg-white/90 px-3.5 py-2.5 text-xs font-black text-slate-800 shadow-sm dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-100">
          <Sparkles size={14} />
          Keep Going
        </span>
      </div>
    </section>
  );
}

function StudentAssessmentRecordRow({ row, FocusTarget }: { row: AssessmentRow; FocusTarget?: { Module: string; Level: string; AssignmentId: string; AssessmentId: string; AttemptId: string; Highlight: string } }) {
  const title = assessmentTitle(row);
  const status = statusDisplay(row.status);
  const href = assessmentHref(row);
  const actionLabel = ["COMPLETED", "CLEARED", "NEEDS_RE_ATTEMPT", "REATTEMPT_AVAILABLE"].includes(normalizeStatus(row.status)) ? "View Result" : normalizeStatus(row.status) === "IN_PROGRESS" ? "Resume Assessment" : "Start Assessment";
  const isPrimaryAssessmentAction = actionLabel !== "View Result";
  const FocusId = String(value(row, ["attemptId", "assignmentId", "assessmentAssignmentId", "assessmentId", "id"], ""));
  const IsFocused = FocusTarget ? studentAssessmentMatchesTarget(row, FocusTarget) : false;

  return (
    <div id={FocusId ? `student-assessment-record-${FocusId}` : undefined} className={`grid grid-cols-[1.08fr_.54fr_.68fr_.5fr_.5fr_.78fr_.78fr_164px] items-center gap-3 px-4 py-4 text-sm ${IsFocused ? "ring-2 ring-cyan-400 bg-cyan-50/70 dark:bg-cyan-950/20" : ""}`}>
      <div className="min-w-0">
        <p className="font-black text-slate-950 dark:text-white">{title}</p>
        <p className="mt-1 text-xs font-semibold text-slate-500">{scopeText(row) || "Level Assessment"}</p>
      </div>
      <div className="flex justify-center"><span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">{attemptLabel(row)}</span></div>
      <div className="flex justify-center"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${statusTone(row.status)}`}>{status}</span></div>
      <div className="flex justify-center"><PerformanceValueChip Value={recordScore(row)} Tone={recordScore(row) === "—" ? "slate" : "blue"} /></div>
      <div className="flex justify-center">
        <div className="flex items-center gap-1.5">
          {Number.isFinite(parseFloat(recordAccuracy(row))) && parseFloat(recordAccuracy(row)) >= 90 ? (
            <span title="Gold Badge (Excellent)" className="text-yellow-500 drop-shadow-sm">⭐</span>
          ) : Number.isFinite(parseFloat(recordAccuracy(row))) && parseFloat(recordAccuracy(row)) >= 75 ? (
            <span title="Silver Badge (Good)" className="text-slate-400 drop-shadow-sm">🥈</span>
          ) : null}
          <PerformanceValueChip Value={recordAccuracy(row)} Tone={AccuracyTone(row)} />
        </div>
      </div>
      <div className="text-xs font-bold text-slate-500">{assignedDate(row)}</div>
      <div className="text-xs font-bold text-slate-500">{completionDate(row)}</div>
      <div className="flex min-w-[156px] justify-end pr-1">
        <Link className={`${isPrimaryAssessmentAction ? "math-button-primary" : "math-role-action-button"} whitespace-nowrap px-3.5 py-2 text-xs`} href={href}>
          <PlayCircle size={15} /> {actionLabel}
        </Link>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-[24px] bg-white/75 p-4 shadow-sm dark:bg-slate-950/60" style={{ boxShadow: 'hover: 0 20px 40px rgba(0,0,0,0.1)' }}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      <div className="inline-flex relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md rounded-2xl bg-blue-50 p-2 text-blue-700 dark:bg-cyan-400/10 dark:text-cyan-300">{icon}</div>
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-800 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-100">{label}</p>
      <p className="relative z-10 mt-2 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white">{value}</p>
    </div>
  );
}
