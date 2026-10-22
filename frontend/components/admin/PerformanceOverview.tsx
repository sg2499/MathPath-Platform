"use client";

// Performance Reports > Overview (2026-10-21, Part 2): the chosen period
// (7, 30 or 90 days) against the period before it, week by week (day by day
// for 7 days), each level's students, and a Needs Attention list whose rows
// open the right page. Every DPS count is the server's shared DPS state, the
// same as the rest of Performance Reports and the trackers.

import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatePill } from "@/components/common/DetailWorkspaceViews";
import { InlineError } from "@/components/payments/PaymentsUi";
import { useIsDarkMode } from "@/components/payments/panels/OverviewPanel";
import {
  getAdminPerformanceOverview,
  type OverviewAttentionItem,
  type OverviewAttentionKind,
  type OverviewPeriod,
  type OverviewTile,
  type PerformanceOverview as OverviewData,
} from "@/lib/api/admin";
import { formatMathPathDate } from "@/lib/date";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock3,
  GraduationCap,
  Medal,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export const OVERVIEW_PERIODS: readonly OverviewPeriod[] = ["7d", "30d", "90d"] as const;
const PERIOD_LABEL: Record<OverviewPeriod, string> = { "7d": "7 Days", "30d": "30 Days", "90d": "90 Days" };

// the app's validated chart palette (AnnualCompetitionAnalyticsCharts.tsx)
const SERIES = { A: { light: "#2563eb", dark: "#3987e5" }, B: { light: "#f59e0b", dark: "#d97706" } };

type Direction = "up" | "down";

function Delta({ tile, unit, better = "up", kind = "count" }: { tile: OverviewTile; unit?: string; better?: Direction; kind?: "count" | "points" }) {
  if (tile.value === null || tile.value === undefined) return <span className="pr-ov-delta" data-tone="flat">No activity in this period</span>;
  if (tile.previous === null || tile.previous === undefined || tile.change === null) return <span className="pr-ov-delta" data-tone="flat">Nothing to compare with</span>;
  const Change = Number(tile.change);
  if (Change === 0) return <span className="pr-ov-delta" data-tone="flat">Same as the period before</span>;
  const Up = Change > 0;
  const Good = (better === "up") === Up;
  const Size = kind === "points" ? `${Math.abs(Change)} ${Math.abs(Change) === 1 ? "point" : "points"}` : `${Math.abs(Change).toLocaleString("en-IN")}${unit ? ` ${unit}` : ""}`;
  return (
    <span className="pr-ov-delta" data-tone={Good ? "good" : "bad"}>
      {`${Up ? "▲" : "▼"} ${Size} ${Up ? "more" : "less"} than before`}
    </span>
  );
}

function Tile({ icon, label, value, note, children }: { icon: ReactNode; label: string; value: string; note?: string; children?: ReactNode }) {
  return (
    <div className="pr-ov-tile">
      <div className="pr-ov-tile-head">
        <span className="math-teacher-icon-chip">{icon}</span>
        <p className="pr-ov-tile-label">{label}</p>
      </div>
      <p className="pr-ov-tile-value">{value}</p>
      {note ? <p className="pr-ov-tile-note">{note}</p> : null}
      {children}
    </div>
  );
}

function Minutes(Value: number | null) {
  if (Value === null || Value === undefined) return "—";
  if (Value < 60) return `${Value} Min`;
  const Hours = Math.floor(Value / 60);
  const Rest = Value % 60;
  return Rest ? `${Hours} H ${Rest} Min` : `${Hours} H`;
}

function Percent(Value: number | null) {
  return Value === null || Value === undefined ? "—" : `${Value}%`;
}

function Count(Value: number | null) {
  return Value === null || Value === undefined ? "—" : Value.toLocaleString("en-IN");
}

const KIND_META: Record<OverviewAttentionKind, { label: string; tone: "red" | "amber" | "purple" | "slate" | "green"; action: string }> = {
  APPROVAL: { label: "Waiting For Approval", tone: "red", action: "Review" },
  STUCK: { label: "3+ Tries", tone: "amber", action: "Open DPS" },
  READY: { label: "Ready To Promote", tone: "purple", action: "Open" },
  FALLING: { label: "Accuracy Falling", tone: "amber", action: "Open" },
  INACTIVE: { label: "Idle", tone: "slate", action: "Open" },
};
const KIND_ORDER: OverviewAttentionKind[] = ["APPROVAL", "STUCK", "READY", "FALLING", "INACTIVE"];

function AttentionHref(Item: OverviewAttentionItem) {
  const Code = encodeURIComponent(Item.studentCode || "");
  if (Item.kind === "APPROVAL") return "/admin/assignments?tab=awaiting-approval";
  if (Item.kind === "READY") return `/admin/assessments/student/${Code}`;
  if (Item.kind === "STUCK" && Item.dpsId) {
    const Params = new URLSearchParams({ tab: "lesson-insights", dpsId: Item.dpsId });
    if (Item.assignmentId) Params.set("assignmentId", Item.assignmentId);
    if (Item.attemptId) Params.set("attemptId", Item.attemptId);
    return `/admin/assignments/student/${Code}?${Params.toString()}`;
  }
  return `/admin/assignments/student/${Code}`;
}

function Where(Item: OverviewAttentionItem) {
  const Parts = [Item.levelCode, Item.lessonNumber ? `Lesson ${Item.lessonNumber}` : null, Item.dpsNumber ? `DPS ${Item.dpsNumber}` : null].filter(Boolean);
  return Parts.join(" · ");
}

const ATTENTION_PAGE = 20;

function NeedsAttention({ Data }: { Data: OverviewData }) {
  const [Kind, SetKind] = useState<OverviewAttentionKind | "ALL">("ALL");
  const [Page, SetPage] = useState(0);
  const Items = useMemo(() => (Kind === "ALL" ? Data.attention : Data.attention.filter((Item) => Item.kind === Kind)), [Data.attention, Kind]);
  const Pages = Math.max(1, Math.ceil(Items.length / ATTENTION_PAGE));
  const Safe = Math.min(Page, Pages - 1);
  const Shown = Items.slice(Safe * ATTENTION_PAGE, (Safe + 1) * ATTENTION_PAGE);
  const Rules = Data.rules;
  return (
    <section className="math-card p-4 sm:p-5">
      <div className="pr-ov-section-head">
        <div className="min-w-0">
          <p className="math-block-header"><AlertTriangle size={14} />Needs Attention</p>
          <h2 className="pr-ov-section-title">Students To Follow Up</h2>
          <p className="pr-ov-section-text">
            {`Waiting for a re-attempt approval, ${Rules.stuckTries} or more tries on one DPS without clearing it, ready to promote, accuracy down ${Rules.fallingPoints} points or more on the week before, or no practice for ${Rules.inactiveDays} days while practice is waiting.`}
          </p>
        </div>
      </div>
      <div role="tablist" aria-label="Needs Attention" className="pr-ov-kinds">
        {(["ALL", ...KIND_ORDER] as const).map((Key) => {
          const Total = Key === "ALL" ? Data.attentionTotal : Data.attentionCounts[Key] ?? 0;
          const Active = Kind === Key;
          return (
            <button
              key={Key}
              type="button"
              role="tab"
              aria-selected={Active}
              onClick={() => { SetKind(Key); SetPage(0); }}
              className={`math-role-tab-button math-admin-tab-force inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-black transition ${Active ? "is-active math-admin-tab-force-selected" : ""}`}
            >
              {Key === "ALL" ? "All" : KIND_META[Key].label}
              <span className="tabular-nums opacity-80">{Total.toLocaleString("en-IN")}</span>
            </button>
          );
        })}
      </div>
      {!Items.length ? (
        <p className="pr-ov-allclear">
          <CheckCircle2 size={16} className="shrink-0" />
          {Kind === "ALL" ? "Nobody needs following up in this scope." : `Nobody in "${KIND_META[Kind].label}" in this scope.`}
        </p>
      ) : (
        <>
          <ul className="pr-ov-attention">
            {Shown.map((Item, Index) => (
              <li key={`${Item.kind}-${Item.studentId}-${Item.dpsId || ""}-${Index}`} className="pr-ov-attention-row">
                <span className="pr-ov-attention-kind"><StatePill tone={KIND_META[Item.kind].tone}>{Item.label}</StatePill></span>
                <span className="pr-ov-attention-who">
                  <span className="pr-name">{Item.studentName || "—"}</span>
                  <span className="pr-code">{[Item.studentCode, Item.teacherName].filter(Boolean).join(" · ") || "—"}</span>
                </span>
                <span className="pr-ov-attention-what">
                  {Where(Item) ? <span className="pr-name">{Where(Item)}</span> : null}
                  <span className="pr-sub">{Item.detail}</span>
                </span>
                <Link href={AttentionHref(Item)} className="math-role-action-button math-history-review-button pr-ov-attention-go">
                  <span>{KIND_META[Item.kind].action}</span>
                  <ArrowRight size={14} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="pr-ov-attention-foot">
            <p className="pr-attempts-count">
              {`Showing ${(Safe * ATTENTION_PAGE + 1).toLocaleString("en-IN")}–${Math.min(Items.length, (Safe + 1) * ATTENTION_PAGE).toLocaleString("en-IN")} of ${Items.length.toLocaleString("en-IN")}`}
              {Data.attentionTotal > Data.attention.length && Kind === "ALL" ? ` (the first ${Data.attention.length} of ${Data.attentionTotal})` : ""}
            </p>
            {Pages > 1 ? (
              <div className="pr-pager">
                <button type="button" className="math-button-secondary" disabled={Safe === 0} onClick={() => SetPage(Safe - 1)}>Previous</button>
                <span className="pr-pager-text">{`Page ${Safe + 1} Of ${Pages}`}</span>
                <button type="button" className="math-button-secondary" disabled={Safe >= Pages - 1} onClick={() => SetPage(Safe + 1)}>Next</button>
              </div>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}

function ChartTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number | null; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pr-ov-tip">
      <p className="pr-ov-tip-title">{label}</p>
      {payload.map((Item) => (
        <p key={Item.name} className="pr-ov-tip-row">
          <span className="pr-ov-tip-dot" style={{ background: Item.color }} />
          {`${Item.name}: ${Item.value === null || Item.value === undefined ? "—" : Item.value.toLocaleString("en-IN")}${Item.name === "Average Accuracy" && Item.value !== null ? "%" : ""}`}
        </p>
      ))}
    </div>
  );
}

function useReducedMotion() {
  const [Reduced, SetReduced] = useState(false);
  useEffect(() => {
    const Query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const Update = () => SetReduced(Query.matches);
    Update();
    Query.addEventListener("change", Update);
    return () => Query.removeEventListener("change", Update);
  }, []);
  return Reduced;
}

function Charts({ Data }: { Data: OverviewData }) {
  const Dark = useIsDarkMode();
  const Animate = !useReducedMotion();
  const Axis = Dark ? "#cbd5e1" : "#475569";
  const Grid = Dark ? "rgba(148, 163, 184, 0.14)" : "rgba(100, 116, 139, 0.14)";
  const A = Dark ? SERIES.A.dark : SERIES.A.light;
  const B = Dark ? SERIES.B.dark : SERIES.B.light;
  const Points = Data.series.map((Point) => {
    const From = formatMathPathDate(Point.from).replace(/ \d{4}$/, "");
    const LastDay = new Date(new Date(Point.to).getTime() - 1).toISOString();
    const To = formatMathPathDate(LastDay).replace(/ \d{4}$/, "");
    return { ...Point, label: Data.seriesStep === "day" ? From : From === To ? From : `${From} – ${To}` };
  });
  const HasAny = Points.some((Point) => Point.attempts > 0);
  const Step = Data.seriesStep === "day" ? "Day By Day" : "Week By Week";
  return (
    <section className="pr-ov-charts">
      <div className="math-card min-w-0 p-4 sm:p-5">
        <p className="math-block-header"><Activity size={14} />Practice {Step}</p>
        <h2 className="pr-ov-section-title">Attempts And DPS Cleared</h2>
        {HasAny ? (
          <div className="pr-ov-chart" role="img" aria-label={`Practice attempts and DPS cleared, ${Step.toLowerCase()}`}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={Points} margin={{ top: 8, right: 20, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={Grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: Axis, fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} interval="preserveStartEnd" padding={{ left: 12, right: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: Axis, fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} width={36} />
                <Tooltip content={<ChartTip />} cursor={{ fill: Grid }} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
                <Bar dataKey="attempts" name="Attempts" fill={A} radius={[6, 6, 0, 0]} isAnimationActive={Animate} />
                <Bar dataKey="dpsCleared" name="DPS Cleared" fill={B} radius={[6, 6, 0, 0]} isAnimationActive={Animate} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="No Practice In This Period" message="Nothing was submitted in this period and scope." />
        )}
      </div>
      <div className="math-card min-w-0 p-4 sm:p-5">
        <p className="math-block-header"><Target size={14} />Accuracy {Step}</p>
        <h2 className="pr-ov-section-title">Average Accuracy</h2>
        {HasAny ? (
          <div className="pr-ov-chart" role="img" aria-label={`Average accuracy, ${Step.toLowerCase()}, with the ${Data.rules.benchmark}% benchmark`}>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={Points} margin={{ top: 8, right: 20, bottom: 4, left: 4 }}>
                <CartesianGrid stroke={Grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fill: Axis, fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} interval="preserveStartEnd" padding={{ left: 52, right: 52 }} />
                <YAxis domain={[0, 100]} ticks={[0, 25, 50, 70, 100]} tick={{ fill: Axis, fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} width={46} unit="%" />
                <Tooltip content={<ChartTip />} />
                <ReferenceLine y={Data.rules.benchmark} stroke={Axis} strokeDasharray="4 4" label={{ value: `Benchmark ${Data.rules.benchmark}%`, position: "insideTopRight", fill: Axis, fontSize: 11, fontWeight: 700 }} />
                <Line type="monotone" dataKey="averageAccuracy" name="Average Accuracy" stroke={A} strokeWidth={3} dot={{ r: 3 }} connectNulls isAnimationActive={Animate} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState title="No Practice In This Period" message="Accuracy shows once practice is submitted." />
        )}
      </div>
    </section>
  );
}

function Levels({ Data }: { Data: OverviewData }) {
  const Most = Math.max(1, ...Data.levels.map((Row) => Row.onLevel));
  return (
    <section className="math-card p-4 sm:p-5">
      <p className="math-block-header"><GraduationCap size={14} />Levels</p>
      <h2 className="pr-ov-section-title">Students On Each Level</h2>
      <p className="pr-ov-section-text">On the level now, ready to promote now, and promoted out of it in this period.</p>
      {!Data.levels.length ? (
        <EmptyState title="No Students In Scope" message="No active student is on a level in this scope." />
      ) : (
        <div className="math-table pr-ov-levels">
          <table className="ad-cards">
            <thead>
              <tr>
                <th><span className="math-table-header-label">Level</span></th>
                <th><span className="math-table-header-label">On The Level</span></th>
                <th className="pr-center"><span className="math-table-header-label">Ready To Promote</span></th>
                <th className="pr-center"><span className="math-table-header-label">Promoted In Period</span></th>
              </tr>
            </thead>
            <tbody>
              {Data.levels.map((Row) => (
                <tr key={Row.levelId}>
                  <td className="ad-card-title">
                    <p className="pr-name">{Row.levelCode}</p>
                    <p className="pr-sub">{Row.levelName}</p>
                  </td>
                  <td data-label="On The Level">
                    <span className="pr-ov-bar"><span style={{ width: `${Math.max(4, (Row.onLevel / Most) * 100)}%` }} /></span>
                    <span className="pr-ov-bar-value">{Row.onLevel.toLocaleString("en-IN")}</span>
                  </td>
                  <td className="pr-center" data-label="Ready To Promote">{Row.readyToPromote ? <StatePill tone="purple">{String(Row.readyToPromote)}</StatePill> : <span className="pr-muted">0</span>}</td>
                  <td className="pr-center" data-label="Promoted In Period">{Row.promotedOut ? <StatePill tone="green">{String(Row.promotedOut)}</StatePill> : <span className="pr-muted">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function PerformanceOverview({
  Period,
  OnPeriod,
  TeacherId,
  ModuleId,
  LevelId,
  Enabled,
}: {
  Period: OverviewPeriod;
  OnPeriod: (Next: OverviewPeriod) => void;
  TeacherId?: string;
  ModuleId?: string;
  LevelId?: string;
  Enabled: boolean;
}) {
  const Query = useQuery({
    queryKey: ["admin-performance-overview", Period, TeacherId || "", ModuleId || "", LevelId || ""],
    queryFn: () => getAdminPerformanceOverview({ period: Period, teacherId: TeacherId, moduleId: ModuleId, levelId: LevelId }),
    enabled: Enabled,
    placeholderData: (Previous) => Previous,
  });
  const Data = Query.data;
  const Days = PERIOD_LABEL[Period];
  return (
    <div className="space-y-5">
      <section className="math-card pr-ov-period p-4 sm:p-5">
        <div className="min-w-0">
          <p className="math-block-header"><BarChart3 size={14} />Period</p>
          <h2 className="pr-ov-section-title">{`Last ${Days}`}</h2>
          <p className="pr-ov-section-text">
            {Data
              ? `${formatMathPathDate(Data.period.from)} to today, against the ${Days.toLowerCase()} before (${formatMathPathDate(Data.period.previousFrom)} to ${formatMathPathDate(new Date(new Date(Data.period.previousTo).getTime() - 1).toISOString())}). ${Data.studentsInScope.toLocaleString("en-IN")} active students in this scope.`
              : `Against the ${Days.toLowerCase()} before.`}
          </p>
        </div>
        <div role="group" aria-label="Period" className="pr-ov-period-group">
          {OVERVIEW_PERIODS.map((Value) => (
            <button
              key={Value}
              type="button"
              aria-pressed={Period === Value}
              onClick={() => OnPeriod(Value)}
              className={`math-role-tab-button math-admin-tab-force rounded-2xl px-4 py-2 text-sm font-black transition ${Period === Value ? "is-active math-admin-tab-force-selected" : ""}`}
            >
              {PERIOD_LABEL[Value]}
            </button>
          ))}
        </div>
      </section>

      {Query.error ? <InlineError error={Query.error} /> : null}
      {!Data ? (
        Query.isLoading ? <LoadingState message="Loading the overview..." /> : null
      ) : (
        <>
          <section className="pr-ov-tiles" aria-busy={Query.isFetching || undefined}>
            <Tile icon={<Users size={16} />} label="Active Students" value={Count(Data.tiles.activeStudents.value)} note={`Practised in this period, of ${Data.studentsInScope.toLocaleString("en-IN")}`}>
              <Delta tile={Data.tiles.activeStudents} />
            </Tile>
            <Tile icon={<Trophy size={16} />} label="DPS Cleared" value={Count(Data.tiles.dpsCleared.value)} note="Cleared for the first time in this period">
              <Delta tile={Data.tiles.dpsCleared} />
            </Tile>
            <Tile icon={<Sparkles size={16} />} label="First-Try Clear Rate" value={Percent(Data.tiles.firstTryClearRate.value)} note="DPS cleared on the first attempt">
              <Delta tile={Data.tiles.firstTryClearRate} kind="points" />
            </Tile>
            <Tile icon={<Target size={16} />} label="Average Accuracy" value={Percent(Data.tiles.averageAccuracy.value)} note="Every practice attempt submitted">
              <Delta tile={Data.tiles.averageAccuracy} kind="points" />
            </Tile>
            <Tile icon={<Clock3 size={16} />} label="Practice Time" value={Minutes(Data.tiles.practiceMinutes.value)} note={`${Count(Data.tiles.attempts.value)} attempts`}>
              <Delta tile={Data.tiles.practiceMinutes} unit="min" />
            </Tile>
            <Tile icon={<AlertTriangle size={16} />} label="Re-Attempt Backlog" value={Count(Data.tiles.reattemptBacklog.value)} note="DPS needing a re-attempt right now">
              <span className="pr-ov-delta" data-tone="flat">Right now, not for the period</span>
            </Tile>
            <Tile icon={<GraduationCap size={16} />} label="Assessment Pass Rate" value={Percent(Data.tiles.assessmentPassRate.value)} note={`${Count(Data.tiles.assessmentPassRate.passed ?? 0)} of ${Count(Data.tiles.assessmentPassRate.taken ?? 0)} passed`}>
              <Delta tile={Data.tiles.assessmentPassRate} kind="points" />
            </Tile>
            <Tile icon={<Medal size={16} />} label="Promotions" value={Count(Data.tiles.promotions.value)} note="Students moved up a level">
              <Delta tile={Data.tiles.promotions} />
            </Tile>
            <Tile icon={<Swords size={16} />} label="Mocks Taken" value={Count(Data.tiles.mocksTaken.value)} note={`By ${Count(Data.tiles.mocksTaken.students ?? 0)} students · details in Competition`}>
              <Delta tile={Data.tiles.mocksTaken} />
            </Tile>
            <Tile icon={<Trophy size={16} />} label="Annual Competition" value={Count(Data.tiles.annualAttempts.value)} note={`Papers by ${Count(Data.tiles.annualAttempts.students ?? 0)} students · ${Count(Data.tiles.annualAttempts.official ?? 0)} official`}>
              <Delta tile={Data.tiles.annualAttempts} />
            </Tile>
          </section>
          <Charts Data={Data} />
          <Levels Data={Data} />
          <NeedsAttention Data={Data} />
        </>
      )}
    </div>
  );
}
