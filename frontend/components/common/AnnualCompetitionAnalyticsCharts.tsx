"use client";

// Analytics Visualization feature, package 3 (Shailesh, 2026-09-22 redesign):
// shared chart primitives for the admin-only "Visualization" sub-tab of
// Practice Reports. Redesigned per Shailesh's own review of package 2:
// (1) Overview / Level Analysis / Student Analysis are now three separate
// scopes, each with its OWN chart-type picker rather than everything
// stacked on one page; (2) every chart color comes from a palette actually
// run through the dataviz skill's validate_palette.js -- see the comment
// above SERIES_COLOR/STATUS_COLOR below for the exact validation results,
// replacing package 2's eyeballed rose/emerald/amber scheme (which FAILED
// the CVD-separation check between rose and emerald); (3) every chart has
// real axis titles, a real <Legend/> when it has 2+ series, and direct
// value labels on every bar; (4) the Bloomers/Beginners level-code labels
// and long section titles no longer crop -- short axis-only labels are
// used on ticks, with the full name always still shown in the tooltip.
//
// Every metric here is still built on data the backend already computes
// for the Student/Level/Overview report endpoints (annual_competition_
// practice_report_service.py) -- nothing new was added to the backend for
// this round, this is a presentation-layer redesign only.

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { EmptyState } from "@/components/common/EmptyState";
import { FormatCompetitionLevelLabel } from "@/lib/api/admin";
import type {
  AnnualCompetitionPracticeReportForLevel,
  AnnualCompetitionPracticeReportForStudent,
  AnnualCompetitionPracticeReportLevelComparison,
  AnnualCompetitionPracticeReportOverviewRow,
  AnnualCompetitionPracticeReportSectionRow,
  AnnualCompetitionPracticeReportStudentRow,
  AnnualCompetitionPracticeReportSummary,
  AnnualCompetitionPracticeReportTrendRow,
} from "@/lib/api/admin";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3 as BarChartIcon,
  CheckCircle2,
  Clock,
  PieChart as PieChartIcon,
  Target,
  TrendingUp as TrendingUpIcon,
  Users,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Palette -- validated with the dataviz skill's scripts/validate_palette.js,
// not eyeballed. Two roles only, because no chart in this file ever needs
// more than 2 simultaneous named series:
//
// SERIES_COLOR (categorical identity -- "Score" vs "Accuracy", "This
// Student" vs "Cohort Average", "Avg Time Taken" vs "Time Limit"): blue +
// amber. Validated candidates: blue+cyan FAILED the dark-mode lightness
// band: blue+purple FAILED CVD separation (Delta E 0.4, essentially
// indistinguishable to a deutan viewer) in light mode. blue+amber PASSED
// every gate in both light and dark mode (worst-case normal-vision Delta E
// 31.8-43.8, well clear of the 15 floor) -- the one WARN (amber sits below
// 3:1 contrast on a light surface) is mitigated exactly as the skill
// requires: every chart using it ships a visible <Legend/> and direct
// value labels, never color alone.
//
// STATUS_COLOR (performance severity -- coloring a single bar by how good
// that one value is): adopted VERBATIM from the dataviz skill's own fixed
// status palette (good/warning/serious/critical), not invented locally --
// the skill is explicit that status colors are "never themed" and are
// deliberately distinct from any categorical slot so they can never be
// mistaken for a series. Two of the four (warning, serious) sit below 3:1
// contrast on a light surface "by design" per the skill; the mitigation is
// the same everywhere it's used here: a StatusLegend key plus a direct
// value label on every bar, never color carrying the meaning alone.
const SERIES_COLOR = {
  A: { Light: "#2563eb", Dark: "#3987e5" },
  B: { Light: "#f59e0b", Dark: "#d97706" },
} as const;

const STATUS_COLOR = {
  Good: "#0ca30c",
  Warning: "#fab219",
  Serious: "#ec835a",
  Critical: "#d03b3b",
  NoData: "#94a3b8",
} as const;

function SeriesColor(Slot: "A" | "B", IsDark: boolean): string {
  return IsDark ? SERIES_COLOR[Slot].Dark : SERIES_COLOR[Slot].Light;
}

// One severity ladder, reused everywhere a percentage (0-100) is colored by
// how good it is: Score/Accuracy/Completion-rate bars and Section
// Difficulty/Depth bars all share this exact banding so the same color
// always means the same thing across every chart in this tab.
function StatusForPercentage(Value: number | null | undefined): { Color: string; Label: string } {
  if (Value == null) return { Color: STATUS_COLOR.NoData, Label: "No data" };
  if (Value >= 75) return { Color: STATUS_COLOR.Good, Label: "Good" };
  if (Value >= 50) return { Color: STATUS_COLOR.Warning, Label: "Fair" };
  if (Value >= 30) return { Color: STATUS_COLOR.Serious, Label: "Weak" };
  return { Color: STATUS_COLOR.Critical, Label: "Critical" };
}

const STATUS_LEGEND_ITEMS = [
  { Label: "Good (75%+)", Color: STATUS_COLOR.Good },
  { Label: "Fair (50-74%)", Color: STATUS_COLOR.Warning },
  { Label: "Weak (30-49%)", Color: STATUS_COLOR.Serious },
  { Label: "Critical (below 30%)", Color: STATUS_COLOR.Critical },
];

// The one place every status-colored chart's key/legend renders -- so
// "what does this color mean" is answered identically everywhere in this
// tab, per the dataviz skill's requirement that a status color never
// carries meaning by hue alone.
function StatusLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
      {STATUS_LEGEND_ITEMS.map((Item) => (
        <span key={Item.Label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: Item.Color }} />
          {Item.Label}
        </span>
      ))}
    </div>
  );
}

// Reads the platform's own dark-mode signal (AppShell.tsx toggles a `dark`
// class on <html>) -- kept live via a MutationObserver so a chart already
// on screen re-themes instantly when the admin flips the theme switch.
function useIsDarkMode(): boolean {
  const [IsDark, SetIsDark] = useState(false);
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const Read = () => SetIsDark(document.documentElement.classList.contains("dark"));
    Read();
    const Observer = new MutationObserver(Read);
    Observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => Observer.disconnect();
  }, []);
  return IsDark;
}

function FormatPercent(Value: number | null | undefined): string {
  return Value == null ? "-" : `${Math.round(Value)}%`;
}

function FormatSecondsAsMinSec(Value: number | null | undefined): string {
  if (Value == null) return "-";
  const Total = Math.max(0, Math.round(Value));
  const Minutes = Math.floor(Total / 60);
  const Seconds = Total % 60;
  return `${Minutes}:${String(Seconds).padStart(2, "0")}`;
}

function FormatCount(Value: number | null | undefined): string {
  return Value == null ? "0" : String(Value);
}

// Short, non-cropping level label for chart TICKS only -- the full
// canonical name (FormatCompetitionLevelLabel, e.g. "Bloomers (Below 8
// Years)") is the correct display everywhere else in the app and is still
// what every tooltip in this file shows; it is simply too long for a
// rotated/horizontal axis tick across 12 levels, which is what was
// cropping under the bars. Every level except these two already renders
// short (e.g. "MM-1", "PM-L2"), so only these two need a shorter tick form.
const SHORT_LEVEL_AXIS_LABEL: Record<string, string> = {
  "YLM-L0": "Bloomers",
  "YLM-L1": "Beginners",
};

function ShortLevelAxisLabel(LevelCode: string): string {
  return SHORT_LEVEL_AXIS_LABEL[LevelCode] || FormatCompetitionLevelLabel(LevelCode);
}

// Same idea for section titles -- "Decimal Add/Less (Visual)" was cropping
// against the y-axis category width. Strips the trailing "(...)" qualifier
// for the tick only (the full title, qualifier included, is always what
// the tooltip shows) and falls back to a hard truncate for anything still
// too long.
function ShortSectionAxisLabel(Title: string): string {
  const Stripped = Title.replace(/\s*\([^)]*\)\s*$/, "").trim() || Title;
  return Stripped.length > 20 ? `${Stripped.slice(0, 19)}…` : Stripped;
}

// ---------------------------------------------------------------------------
// AnalyticsChartCard -- the one glass-card wrapper every chart renders
// inside, matching this platform's existing glassmorphism (rounded-[32px],
// backdrop-blur, border) rather than reusing .math-card directly, which is
// tuned for text/table padding, not a fixed-height chart canvas.
// ---------------------------------------------------------------------------

function AnalyticsChartCard({
  Icon,
  Kicker,
  Title,
  Description,
  children,
}: {
  Icon: LucideIcon;
  Kicker: string;
  Title: string;
  Description: string;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-white/70 bg-white/85 p-5 shadow-lg backdrop-blur-2xl transition duration-300 dark:border-slate-800 dark:bg-slate-950/80 sm:p-6">
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(circle at 92% 0%, rgba(6, 182, 212, 0.12), transparent 32%), radial-gradient(circle at 4% 100%, rgba(124, 58, 237, 0.10), transparent 30%)",
        }}
      />
      <div className="relative">
        <p className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[color:var(--mp-role-primary)]">
          <Icon size={14} />
          {Kicker}
        </p>
        <h3 className="mt-1 text-lg font-black text-slate-950 dark:text-white">{Title}</h3>
        <p className="mt-1.5 text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">{Description}</p>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

// Shared glass tooltip -- replaces recharts' plain default tooltip box so
// hovering any chart matches the rest of the platform's frosted-glass
// surfaces. recharts' own generic Tooltip content-prop type differs across
// minor versions; active/payload/label's actual runtime shape is stable,
// so this custom renderer takes its props loosely rather than fighting
// that generic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function GlassTooltip(RawProps: any) {
  const { active, payload, label, Formatter } = RawProps as {
    active?: boolean;
    payload?: Array<{ payload?: Record<string, unknown> }>;
    label?: string | number;
    Formatter?: (Payload: Record<string, unknown>) => ReactNode;
  };
  if (!active || !payload || payload.length === 0) return null;
  const Row = payload[0]?.payload || {};
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-xs font-bold shadow-2xl backdrop-blur-2xl dark:border-slate-700 dark:bg-slate-950/95">
      {label != null && <p className="mb-1 text-[11px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>}
      {Formatter ? Formatter(Row) : null}
    </div>
  );
}

function AxisTickColor(IsDark: boolean) {
  return IsDark ? "#cbd5e1" : "#475569";
}

function AxisTitleColor(IsDark: boolean) {
  return IsDark ? "#94a3b8" : "#64748b";
}

function GridColor(IsDark: boolean) {
  return IsDark ? "rgba(148, 163, 184, 0.14)" : "rgba(100, 116, 139, 0.14)";
}

function BarValueLabel(IsDark: boolean) {
  return { fill: IsDark ? "#e2e8f0" : "#1e293b", fontSize: 11, fontWeight: 800 };
}

// ---------------------------------------------------------------------------
// Direct value-label helpers -- every bar chart in this file labels its own
// bars directly (never "a number on every point" for lines/scatter, which
// the dataviz skill reserves labels-off for; bars with <= 12 categories are
// exactly the case where a direct label helps a non-technical viewer read
// the chart without hovering). Two variants: vertical bars (label above)
// and horizontal bars (label to the right).
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TopValueLabelContent(IsDark: boolean, Formatter: (Value: number) => string, ShouldShow?: (Index: number) => boolean) {
  return (Props: any) => {
    const { x, y, width, value, index } = Props;
    if (ShouldShow && !ShouldShow(index)) return null;
    if (value == null) return null;
    return (
      <text x={x + width / 2} y={y - 8} textAnchor="middle" fontSize={11} fontWeight={800} fill={BarValueLabel(IsDark).fill}>
        {Formatter(value)}
      </text>
    );
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RightValueLabelContent(IsDark: boolean, Formatter: (Value: number) => string, ShouldShow?: (Index: number) => boolean) {
  return (Props: any) => {
    const { x, y, width, height, value, index } = Props;
    if (ShouldShow && !ShouldShow(index)) return null;
    if (value == null) return null;
    return (
      <text x={x + width + 8} y={y + height / 2} dy={4} textAnchor="start" fontSize={11} fontWeight={800} fill={BarValueLabel(IsDark).fill}>
        {Formatter(value)}
      </text>
    );
  };
}

const LegendLabelStyle = (IsDark: boolean) => ({ color: AxisTitleColor(IsDark), fontSize: 12, fontWeight: 800 });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function RenderLegendLabel(IsDark: boolean) {
  return (Value: string) => <span style={LegendLabelStyle(IsDark)}>{Value}</span>;
}

// ---------------------------------------------------------------------------
// OVERVIEW -- one generic metric bar chart, parametrized by which of the six
// per-level metrics is selected (see OVERVIEW_CHART_META below). Every
// metric comes straight off AnnualCompetitionPracticeReportOverviewRow --
// nothing computed here that the backend doesn't already return, except
// completion rate (a simple ratio of two counts already on the row).
// ---------------------------------------------------------------------------

type OverviewMetricConfig = {
  Extract: (Row: AnnualCompetitionPracticeReportOverviewRow) => number | null;
  IsPercentage: boolean;
  AxisTitle: string;
  ValueFormatter: (Value: number) => string;
  UseStatusColor: boolean;
};

function OverviewMetricConfigFor(MetricKey: OverviewChartKey): OverviewMetricConfig {
  switch (MetricKey) {
    case "SCORE":
      return { Extract: (Row) => Row.avgPercentage, IsPercentage: true, AxisTitle: "Average Score (%)", ValueFormatter: (Value) => FormatPercent(Value), UseStatusColor: true };
    case "ACCURACY":
      return { Extract: (Row) => Row.avgAccuracyPercentage, IsPercentage: true, AxisTitle: "Average Accuracy (%)", ValueFormatter: (Value) => FormatPercent(Value), UseStatusColor: true };
    case "TIME":
      return {
        Extract: (Row) => (Row.avgTimeTakenSeconds != null ? Row.avgTimeTakenSeconds / 60 : null),
        IsPercentage: false,
        AxisTitle: "Average Time Taken (minutes)",
        ValueFormatter: (Value) => `${Value.toFixed(1)}m`,
        UseStatusColor: false,
      };
    case "ATTEMPTS":
      return { Extract: (Row) => Row.attemptsCount, IsPercentage: false, AxisTitle: "Practice Attempts Recorded", ValueFormatter: (Value) => String(Math.round(Value)), UseStatusColor: false };
    case "REACH":
      return { Extract: (Row) => Row.studentsWithAttemptsCount, IsPercentage: false, AxisTitle: "Students Who Have Practiced", ValueFormatter: (Value) => String(Math.round(Value)), UseStatusColor: false };
    case "COMPLETION":
      return {
        Extract: (Row) => (Row.papersAssignedCount > 0 ? (Row.papersCompletedCount / Row.papersAssignedCount) * 100 : null),
        IsPercentage: true,
        AxisTitle: "Papers Completed (%)",
        ValueFormatter: (Value) => FormatPercent(Value),
        UseStatusColor: true,
      };
    default:
      return { Extract: () => null, IsPercentage: true, AxisTitle: "", ValueFormatter: (Value) => String(Value), UseStatusColor: false };
  }
}

function LevelMetricBarChartBody({ Rows, MetricKey }: { Rows: AnnualCompetitionPracticeReportOverviewRow[]; MetricKey: OverviewChartKey }) {
  const IsDark = useIsDarkMode();
  const Config = OverviewMetricConfigFor(MetricKey);
  const HasAnyData = Rows.some((Row) => Row.attemptsCount > 0);

  const ChartRows = Rows.map((Row) => ({
    LevelCode: Row.competitionLevelCode,
    LevelLabel: ShortLevelAxisLabel(Row.competitionLevelCode),
    FullLevelLabel: FormatCompetitionLevelLabel(Row.competitionLevelCode),
    Value: Config.Extract(Row) ?? 0,
    HasData: Row.attemptsCount > 0,
    AttemptsCount: Row.attemptsCount,
    StudentsWithAttemptsCount: Row.studentsWithAttemptsCount,
    AvgTimeTakenSeconds: Row.avgTimeTakenSeconds,
  }));

  if (!HasAnyData) {
    return <EmptyState title="No practice activity yet" description="This chart fills in as soon as any student completes a practice paper." />;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={340}>
        <BarChart data={ChartRows} margin={{ top: 24, right: 16, left: 8, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} vertical={false} />
          <XAxis dataKey="LevelLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 700 }} axisLine={{ stroke: GridColor(IsDark) }} tickLine={false}>
            <Label value="Competition Level" position="insideBottom" offset={-16} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
          </XAxis>
          <YAxis
            domain={Config.IsPercentage ? [0, 100] : [0, "auto"]}
            tickFormatter={(Value) => (Config.IsPercentage ? `${Value}%` : String(Value))}
            tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            width={48}
          >
            <Label value={Config.AxisTitle} angle={-90} position="insideLeft" style={{ textAnchor: "middle" }} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
          </YAxis>
          <Tooltip
            cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
            content={(Props: any) => (
              <GlassTooltip
                {...Props}
                Formatter={(Row: Record<string, unknown>) => (
                  <div className="space-y-1 text-slate-700 dark:text-slate-200">
                    <p className="text-slate-950 dark:text-white">{String(Row.FullLevelLabel)}</p>
                    {Row.HasData ? (
                      <>
                        <p>{Config.AxisTitle}: <span style={{ color: SeriesColor("A", IsDark) }}>{Config.ValueFormatter(Row.Value as number)}</span></p>
                        <p>Attempts: {String(Row.AttemptsCount)}</p>
                        <p>Students: {String(Row.StudentsWithAttemptsCount)}</p>
                      </>
                    ) : (
                      <p className="text-slate-400">No practice attempts yet</p>
                    )}
                  </div>
                )}
              />
            )}
          />
          <Bar dataKey="Value" radius={[10, 10, 0, 0]} maxBarSize={46}>
            {ChartRows.map((Row) => (
              <Cell key={Row.LevelCode} fill={!Row.HasData ? STATUS_COLOR.NoData : Config.UseStatusColor ? StatusForPercentage(Row.Value).Color : SeriesColor("A", IsDark)} />
            ))}
            <LabelList dataKey="Value" content={TopValueLabelContent(IsDark, Config.ValueFormatter, (Index) => ChartRows[Index]?.HasData ?? false)} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {Config.UseStatusColor && <StatusLegend />}
    </>
  );
}

// ---------------------------------------------------------------------------
// LEVEL ANALYSIS chart bodies
// ---------------------------------------------------------------------------

function SectionDifficultyChartBody({ Sections }: { Sections: AnnualCompetitionPracticeReportSectionRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Sections]
    .sort((A, B) => A.sectionNumber - B.sectionNumber)
    .map((Section) => ({
      SectionNumber: Section.sectionNumber,
      SectionLabel: ShortSectionAxisLabel(Section.sectionTitle || `Section ${Section.sectionNumber}`),
      FullSectionLabel: Section.sectionTitle || `Section ${Section.sectionNumber}`,
      AvgAccuracyPercentage: Section.avgAccuracyPercentage,
      AvgTimeTakenSeconds: Section.avgTimeTakenSeconds,
      AttemptsCount: Section.attemptsCount,
    }));

  if (ChartRows.length === 0) {
    return <EmptyState title="No section data yet" description="Complete at least one practice attempt at this level to see a section breakdown." />;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(260, ChartRows.length * 58)}>
        <BarChart data={ChartRows} layout="vertical" margin={{ top: 8, right: 56, left: 0, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(Value) => `${Value}%`} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false}>
            <Label value="Average Accuracy (%)" position="insideBottom" offset={-16} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
          </XAxis>
          <YAxis type="category" dataKey="SectionLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 800 }} axisLine={false} tickLine={false} width={150} />
          <Tooltip
            cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
            content={(Props: any) => (
              <GlassTooltip
                {...Props}
                Formatter={(Row: Record<string, unknown>) => (
                  <div className="space-y-1 text-slate-700 dark:text-slate-200">
                    <p className="text-slate-950 dark:text-white">{String(Row.FullSectionLabel)}</p>
                    <p>Avg Accuracy: {FormatPercent(Row.AvgAccuracyPercentage as number | null)}</p>
                    <p>Avg Time: {FormatSecondsAsMinSec(Row.AvgTimeTakenSeconds as number | null)}</p>
                    <p>Attempts: {String(Row.AttemptsCount)}</p>
                  </div>
                )}
              />
            )}
          />
          <Bar dataKey="AvgAccuracyPercentage" radius={[0, 8, 8, 0]} maxBarSize={28}>
            {ChartRows.map((Row) => (
              <Cell key={Row.SectionNumber} fill={StatusForPercentage(Row.AvgAccuracyPercentage).Color} />
            ))}
            <LabelList dataKey="AvgAccuracyPercentage" content={RightValueLabelContent(IsDark, (Value) => FormatPercent(Value))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <StatusLegend />
    </>
  );
}

function SectionTimeUsageChartBody({ Sections }: { Sections: AnnualCompetitionPracticeReportSectionRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Sections]
    .sort((A, B) => A.sectionNumber - B.sectionNumber)
    .map((Section) => ({
      SectionNumber: Section.sectionNumber,
      SectionLabel: ShortSectionAxisLabel(Section.sectionTitle || `Section ${Section.sectionNumber}`),
      FullSectionLabel: Section.sectionTitle || `Section ${Section.sectionNumber}`,
      AvgTimeTakenMinutes: Section.avgTimeTakenSeconds != null ? Section.avgTimeTakenSeconds / 60 : null,
      TimeLimitMinutes: Section.timeLimitSeconds != null ? Section.timeLimitSeconds / 60 : null,
      AvgTimeTakenSeconds: Section.avgTimeTakenSeconds,
      TimeLimitSeconds: Section.timeLimitSeconds,
    }));

  if (ChartRows.length === 0) {
    return <EmptyState title="No section timing data yet" description="This chart needs at least one completed attempt with recorded section times." />;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(260, ChartRows.length * 64)}>
      <BarChart data={ChartRows} layout="vertical" margin={{ top: 8, right: 56, left: 0, bottom: 28 }} barGap={4}>
        <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} horizontal={false} />
        <XAxis type="number" tickFormatter={(Value) => `${Value}m`} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false}>
          <Label value="Minutes" position="insideBottom" offset={-16} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </XAxis>
        <YAxis type="category" dataKey="SectionLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 800 }} axisLine={false} tickLine={false} width={150} />
        <Tooltip
          cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
          content={(Props: any) => (
            <GlassTooltip
              {...Props}
              Formatter={(Row: Record<string, unknown>) => (
                <div className="space-y-1 text-slate-700 dark:text-slate-200">
                  <p className="text-slate-950 dark:text-white">{String(Row.FullSectionLabel)}</p>
                  <p>Avg Time Taken: <span style={{ color: SeriesColor("A", IsDark) }}>{FormatSecondsAsMinSec(Row.AvgTimeTakenSeconds as number | null)}</span></p>
                  <p>Time Limit: <span style={{ color: SeriesColor("B", IsDark) }}>{FormatSecondsAsMinSec(Row.TimeLimitSeconds as number | null)}</span></p>
                </div>
              )}
            />
          )}
        />
        <Legend verticalAlign="top" align="right" height={28} formatter={RenderLegendLabel(IsDark)} />
        <Bar dataKey="AvgTimeTakenMinutes" name="Avg Time Taken" fill={SeriesColor("A", IsDark)} radius={[0, 8, 8, 0]} maxBarSize={16}>
          <LabelList dataKey="AvgTimeTakenMinutes" content={RightValueLabelContent(IsDark, (Value) => `${Value.toFixed(1)}m`)} />
        </Bar>
        <Bar dataKey="TimeLimitMinutes" name="Time Limit" fill={SeriesColor("B", IsDark)} radius={[0, 8, 8, 0]} maxBarSize={16}>
          <LabelList dataKey="TimeLimitMinutes" content={RightValueLabelContent(IsDark, (Value) => `${Value.toFixed(1)}m`)} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function SectionCompletionDepthChartBody({ Sections }: { Sections: AnnualCompetitionPracticeReportSectionRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Sections]
    .sort((A, B) => A.sectionNumber - B.sectionNumber)
    .map((Section) => {
      const DepthPercentage =
        Section.avgTotalQuestions && Section.avgTotalQuestions > 0 && Section.avgAttemptedCount != null
          ? (Section.avgAttemptedCount / Section.avgTotalQuestions) * 100
          : null;
      return {
        SectionNumber: Section.sectionNumber,
        SectionLabel: ShortSectionAxisLabel(Section.sectionTitle || `Section ${Section.sectionNumber}`),
        FullSectionLabel: Section.sectionTitle || `Section ${Section.sectionNumber}`,
        DepthPercentage,
        AvgAttemptedCount: Section.avgAttemptedCount,
        AvgTotalQuestions: Section.avgTotalQuestions,
      };
    });

  if (ChartRows.length === 0) {
    return <EmptyState title="No section data yet" description="Complete at least one practice attempt at this level to see this chart." />;
  }

  return (
    <>
      <ResponsiveContainer width="100%" height={Math.max(260, ChartRows.length * 58)}>
        <BarChart data={ChartRows} layout="vertical" margin={{ top: 8, right: 56, left: 0, bottom: 28 }}>
          <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(Value) => `${Value}%`} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false}>
            <Label value="Share of Section Attempted" position="insideBottom" offset={-16} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
          </XAxis>
          <YAxis type="category" dataKey="SectionLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 800 }} axisLine={false} tickLine={false} width={150} />
          <Tooltip
            cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
            content={(Props: any) => (
              <GlassTooltip
                {...Props}
                Formatter={(Row: Record<string, unknown>) => (
                  <div className="space-y-1 text-slate-700 dark:text-slate-200">
                    <p className="text-slate-950 dark:text-white">{String(Row.FullSectionLabel)}</p>
                    <p>Attempted: {FormatPercent(Row.DepthPercentage as number | null)} ({String(Row.AvgAttemptedCount)} of {String(Row.AvgTotalQuestions)} questions)</p>
                  </div>
                )}
              />
            )}
          />
          <Bar dataKey="DepthPercentage" radius={[0, 8, 8, 0]} maxBarSize={28}>
            {ChartRows.map((Row) => (
              <Cell key={Row.SectionNumber} fill={StatusForPercentage(Row.DepthPercentage).Color} />
            ))}
            <LabelList dataKey="DepthPercentage" content={RightValueLabelContent(IsDark, (Value) => FormatPercent(Value))} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <StatusLegend />
    </>
  );
}

const DISTRIBUTION_BUCKETS = [
  { Label: "0-20%", Min: 0, Max: 20 },
  { Label: "20-40%", Min: 20, Max: 40 },
  { Label: "40-60%", Min: 40, Max: 60 },
  { Label: "60-80%", Min: 60, Max: 80 },
  { Label: "80-100%", Min: 80, Max: 101 },
];

function ScoreDistributionChartBody({ Students }: { Students: AnnualCompetitionPracticeReportStudentRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = DISTRIBUTION_BUCKETS.map((Bucket) => ({
    Label: Bucket.Label,
    Count: Students.filter((Row) => Row.avgPercentage != null && Row.avgPercentage >= Bucket.Min && Row.avgPercentage < Bucket.Max).length,
    Midpoint: (Bucket.Min + Math.min(Bucket.Max, 100)) / 2,
  }));

  if (Students.length === 0) {
    return <EmptyState title="No students yet" description="This chart fills in once students start completing practice papers at this level." />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={ChartRows} margin={{ top: 24, right: 12, left: 8, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} vertical={false} />
        <XAxis dataKey="Label" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 700 }} axisLine={{ stroke: GridColor(IsDark) }} tickLine={false}>
          <Label value="Score Band" position="insideBottom" offset={-16} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </XAxis>
        <YAxis allowDecimals={false} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={40}>
          <Label value="Number of Students" angle={-90} position="insideLeft" style={{ textAnchor: "middle" }} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </YAxis>
        <Tooltip
          cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
          content={(Props: any) => (
            <GlassTooltip {...Props} Formatter={(Row: Record<string, unknown>) => <p className="text-slate-700 dark:text-slate-200">{String(Row.Count)} student{Row.Count === 1 ? "" : "s"}</p>} />
          )}
        />
        <Bar dataKey="Count" radius={[10, 10, 0, 0]} maxBarSize={64}>
          {ChartRows.map((Row) => (
            <Cell key={Row.Label} fill={StatusForPercentage(Row.Midpoint).Color} />
          ))}
          <LabelList dataKey="Count" content={TopValueLabelContent(IsDark, (Value) => String(Value))} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function TimeVsScoreScatterChartBody({ Students }: { Students: AnnualCompetitionPracticeReportStudentRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = Students.filter((Row) => Row.avgTimeTakenSeconds != null && Row.avgPercentage != null).map((Row) => ({
    StudentName: Row.studentName || Row.studentCode || Row.studentId,
    AvgTimeTakenMinutes: (Row.avgTimeTakenSeconds || 0) / 60,
    AvgTimeTakenSeconds: Row.avgTimeTakenSeconds,
    AvgPercentage: Row.avgPercentage,
  }));

  if (ChartRows.length === 0) {
    return <EmptyState title="No timed attempts yet" description="This chart needs at least one completed practice attempt with a recorded time." />;
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <ScatterChart margin={{ top: 24, right: 20, left: 8, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} />
        <XAxis type="number" dataKey="AvgTimeTakenMinutes" name="Avg Time" unit=" min" tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: GridColor(IsDark) }} tickLine={false}>
          <Label value="Average Time Taken (minutes)" position="insideBottom" offset={-16} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </XAxis>
        <YAxis type="number" dataKey="AvgPercentage" name="Avg Score" domain={[0, 100]} tickFormatter={(Value) => `${Value}%`} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={44}>
          <Label value="Average Score (%)" angle={-90} position="insideLeft" style={{ textAnchor: "middle" }} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </YAxis>
        <ZAxis range={[90, 90]} />
        <Tooltip
          cursor={{ strokeDasharray: "4 4", stroke: GridColor(IsDark) }}
          content={(Props: any) => (
            <GlassTooltip
              {...Props}
              Formatter={(Row: Record<string, unknown>) => (
                <div className="space-y-1 text-slate-700 dark:text-slate-200">
                  <p className="text-slate-950 dark:text-white">{String(Row.StudentName)}</p>
                  <p>Avg Score: {FormatPercent(Row.AvgPercentage as number | null)}</p>
                  <p>Avg Time: {FormatSecondsAsMinSec(Row.AvgTimeTakenSeconds as number | null)}</p>
                </div>
              )}
            />
          )}
        />
        <Scatter data={ChartRows} fill={SeriesColor("A", IsDark)} fillOpacity={0.75} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}

function CompletionRateDonutChartBody({ Completed, Assigned }: { Completed: number; Assigned: number }) {
  const IsDark = useIsDarkMode();
  if (Assigned <= 0) {
    return <EmptyState title="No papers assigned yet" description="This appears once at least one practice paper has been assigned at this level." />;
  }
  const Remaining = Math.max(0, Assigned - Completed);
  const PercentComplete = Math.round((Completed / Assigned) * 100);
  const TrackColor = IsDark ? "#1e293b" : "#e2e8f0";
  const Data = [
    { Name: "Completed", Value: Completed },
    { Name: "Not Yet Completed", Value: Remaining },
  ];

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie data={Data} dataKey="Value" nameKey="Name" innerRadius={78} outerRadius={108} startAngle={90} endAngle={-270} stroke="none">
              <Cell fill={SeriesColor("A", IsDark)} />
              <Cell fill={TrackColor} />
            </Pie>
            <Tooltip
              content={(Props: any) => (
                <GlassTooltip
                  {...Props}
                  Formatter={(Row: Record<string, unknown>) => (
                    <p className="text-slate-700 dark:text-slate-200">
                      {String(Row.Name)}: {String(Row.Value)} paper{Row.Value === 1 ? "" : "s"}
                    </p>
                  )}
                />
              )}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-slate-950 dark:text-white">{PercentComplete}%</span>
          <span className="text-xs font-bold text-slate-500 dark:text-slate-400">Completed</span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SeriesColor("A", IsDark) }} />Completed ({Completed})</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TrackColor }} />Not Yet Completed ({Remaining})</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STUDENT ANALYSIS chart bodies
// ---------------------------------------------------------------------------

function StudentTrendChartBody({ Trend }: { Trend: AnnualCompetitionPracticeReportTrendRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Trend]
    .sort((A, B) => (A.computedAt || "").localeCompare(B.computedAt || ""))
    .map((Row, Index) => ({
      AttemptLabel: `#${Index + 1}`,
      Percentage: Row.percentage,
      AccuracyPercentage: Row.accuracyPercentage,
    }));

  if (ChartRows.length < 2) {
    return <EmptyState title="Not enough attempts yet" description="A trend needs at least 2 completed attempts at this level to show a line." />;
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={ChartRows} margin={{ top: 24, right: 16, left: 8, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} vertical={false} />
        <XAxis dataKey="AttemptLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 700 }} axisLine={{ stroke: GridColor(IsDark) }} tickLine={false}>
          <Label value="Attempt Number" position="insideBottom" offset={-16} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </XAxis>
        <YAxis domain={[0, 100]} tickFormatter={(Value) => `${Value}%`} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={40}>
          <Label value="Percent" angle={-90} position="insideLeft" style={{ textAnchor: "middle" }} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </YAxis>
        <Tooltip
          content={(Props: any) => (
            <GlassTooltip
              {...Props}
              Formatter={(Row: Record<string, unknown>) => (
                <div className="space-y-1 text-slate-700 dark:text-slate-200">
                  <p>Score: <span style={{ color: SeriesColor("A", IsDark) }}>{FormatPercent(Row.Percentage as number | null)}</span></p>
                  <p>Accuracy: <span style={{ color: SeriesColor("B", IsDark) }}>{FormatPercent(Row.AccuracyPercentage as number | null)}</span></p>
                </div>
              )}
            />
          )}
        />
        <Legend verticalAlign="top" align="right" height={28} formatter={RenderLegendLabel(IsDark)} />
        <Line type="monotone" dataKey="Percentage" name="Score" stroke={SeriesColor("A", IsDark)} strokeWidth={3} dot={{ r: 4, fill: SeriesColor("A", IsDark) }} activeDot={{ r: 6 }} />
        <Line type="monotone" dataKey="AccuracyPercentage" name="Accuracy" stroke={SeriesColor("B", IsDark)} strokeWidth={3} strokeDasharray="6 4" dot={{ r: 4, fill: SeriesColor("B", IsDark) }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TimePerAttemptTrendChartBody({ Trend }: { Trend: AnnualCompetitionPracticeReportTrendRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Trend]
    .sort((A, B) => (A.computedAt || "").localeCompare(B.computedAt || ""))
    .map((Row, Index) => ({
      AttemptLabel: `#${Index + 1}`,
      TimeTakenMinutes: Row.timeTakenSeconds != null ? Row.timeTakenSeconds / 60 : null,
      TimeTakenSeconds: Row.timeTakenSeconds,
    }));

  if (ChartRows.length < 2) {
    return <EmptyState title="Not enough attempts yet" description="A trend needs at least 2 completed attempts at this level to show a line." />;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={ChartRows} margin={{ top: 24, right: 16, left: 8, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} vertical={false} />
        <XAxis dataKey="AttemptLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 700 }} axisLine={{ stroke: GridColor(IsDark) }} tickLine={false}>
          <Label value="Attempt Number" position="insideBottom" offset={-16} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </XAxis>
        <YAxis tickFormatter={(Value) => `${Value}m`} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={44}>
          <Label value="Time Taken (minutes)" angle={-90} position="insideLeft" style={{ textAnchor: "middle" }} fill={AxisTitleColor(IsDark)} fontSize={12} fontWeight={800} />
        </YAxis>
        <Tooltip
          content={(Props: any) => (
            <GlassTooltip
              {...Props}
              Formatter={(Row: Record<string, unknown>) => (
                <p className="text-slate-700 dark:text-slate-200">
                  Time Taken: <span style={{ color: SeriesColor("A", IsDark) }}>{FormatSecondsAsMinSec(Row.TimeTakenSeconds as number | null)}</span>
                </p>
              )}
            />
          )}
        />
        <Line type="monotone" dataKey="TimeTakenMinutes" name="Time Taken" stroke={SeriesColor("A", IsDark)} strokeWidth={3} dot={{ r: 4, fill: SeriesColor("A", IsDark) }} activeDot={{ r: 6 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function StudentSectionRadarChartBody({ Sections }: { Sections: AnnualCompetitionPracticeReportSectionRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Sections]
    .sort((A, B) => A.sectionNumber - B.sectionNumber)
    .map((Section) => ({
      SectionLabel: ShortSectionAxisLabel(Section.sectionTitle || `Section ${Section.sectionNumber}`),
      FullSectionLabel: Section.sectionTitle || `Section ${Section.sectionNumber}`,
      AvgAccuracyPercentage: Section.avgAccuracyPercentage ?? 0,
    }));

  if (ChartRows.length < 3) {
    return <EmptyState title="Not enough sections yet" description="A radar view needs at least 3 sections of data to be readable." />;
  }

  return (
    <ResponsiveContainer width="100%" height={340}>
      <RadarChart data={ChartRows} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
        <PolarGrid stroke={GridColor(IsDark)} />
        <PolarAngleAxis dataKey="SectionLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} />
        <PolarRadiusAxis domain={[0, 100]} tick={{ fill: AxisTickColor(IsDark), fontSize: 10 }} tickFormatter={(Value) => `${Value}%`} />
        <Tooltip
          content={(Props: any) => (
            <GlassTooltip
              {...Props}
              Formatter={(Row: Record<string, unknown>) => (
                <div className="space-y-1 text-slate-700 dark:text-slate-200">
                  <p className="text-slate-950 dark:text-white">{String(Row.FullSectionLabel)}</p>
                  <p>Accuracy: {FormatPercent(Row.AvgAccuracyPercentage as number | null)}</p>
                </div>
              )}
            />
          )}
        />
        <Radar name="Accuracy" dataKey="AvgAccuracyPercentage" stroke={SeriesColor("A", IsDark)} fill={SeriesColor("A", IsDark)} fillOpacity={0.35} strokeWidth={2} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// Two small multiples (never one dual-axis chart) -- Score/Accuracy share a
// 0-100% axis and Avg Time gets its own minutes axis below, per the dataviz
// skill's "one axis" rule: two measures of different scale never share a
// y-axis, even on a single nominal x-axis.
function StudentVsCohortChartBody({
  Summary,
  LevelComparison,
}: {
  Summary: AnnualCompetitionPracticeReportSummary;
  LevelComparison: AnnualCompetitionPracticeReportLevelComparison | null;
}) {
  const IsDark = useIsDarkMode();
  if (!LevelComparison) {
    return <EmptyState title="No cohort data yet" description="This appears once other students have also practiced this level." />;
  }

  const PercentRows = [
    { Metric: "Avg Score", You: Summary.avgPercentage ?? 0, Cohort: LevelComparison.cohortAvgPercentage ?? 0 },
    { Metric: "Accuracy", You: Summary.avgAccuracyPercentage ?? 0, Cohort: LevelComparison.cohortAvgAccuracyPercentage ?? 0 },
  ];
  const TimeRows = [
    { Metric: "Avg Time", You: (Summary.avgTimeTakenSeconds ?? 0) / 60, Cohort: (LevelComparison.cohortAvgTimeTakenSeconds ?? 0) / 60 },
  ];

  return (
    <div className="space-y-8">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Compared against {LevelComparison.cohortStudentsCount} other student{LevelComparison.cohortStudentsCount === 1 ? "" : "s"} who has practiced this level ({LevelComparison.cohortAttemptsCount} total attempts)
      </p>
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Score &amp; Accuracy</p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={PercentRows} margin={{ top: 24, right: 12, left: 8, bottom: 8 }} barGap={6}>
            <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} vertical={false} />
            <XAxis dataKey="Metric" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 800 }} axisLine={{ stroke: GridColor(IsDark) }} tickLine={false} />
            <YAxis domain={[0, 100]} tickFormatter={(Value) => `${Value}%`} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={40} />
            <Tooltip
              cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
              content={(Props: any) => (
                <GlassTooltip
                  {...Props}
                  Formatter={(Row: Record<string, unknown>) => (
                    <div className="space-y-1 text-slate-700 dark:text-slate-200">
                      <p>You: <span style={{ color: SeriesColor("A", IsDark) }}>{FormatPercent(Row.You as number)}</span></p>
                      <p>Cohort: <span style={{ color: SeriesColor("B", IsDark) }}>{FormatPercent(Row.Cohort as number)}</span></p>
                    </div>
                  )}
                />
              )}
            />
            <Legend verticalAlign="top" align="right" height={28} formatter={RenderLegendLabel(IsDark)} />
            <Bar dataKey="You" name="This Student" fill={SeriesColor("A", IsDark)} radius={[10, 10, 0, 0]} maxBarSize={54}>
              <LabelList dataKey="You" content={TopValueLabelContent(IsDark, (Value) => FormatPercent(Value))} />
            </Bar>
            <Bar dataKey="Cohort" name="Cohort Average" fill={SeriesColor("B", IsDark)} radius={[10, 10, 0, 0]} maxBarSize={54}>
              <LabelList dataKey="Cohort" content={TopValueLabelContent(IsDark, (Value) => FormatPercent(Value))} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">Average Time Taken</p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={TimeRows} layout="vertical" margin={{ top: 8, right: 56, left: 8, bottom: 8 }} barGap={4}>
            <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} horizontal={false} />
            <XAxis type="number" tickFormatter={(Value) => `${Value}m`} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="Metric" tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 800 }} axisLine={false} tickLine={false} width={80} />
            <Tooltip
              cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
              content={(Props: any) => (
                <GlassTooltip
                  {...Props}
                  Formatter={(Row: Record<string, unknown>) => (
                    <div className="space-y-1 text-slate-700 dark:text-slate-200">
                      <p>You: <span style={{ color: SeriesColor("A", IsDark) }}>{FormatSecondsAsMinSec((Row.You as number) * 60)}</span></p>
                      <p>Cohort: <span style={{ color: SeriesColor("B", IsDark) }}>{FormatSecondsAsMinSec((Row.Cohort as number) * 60)}</span></p>
                    </div>
                  )}
                />
              )}
            />
            <Legend verticalAlign="top" align="right" height={28} formatter={RenderLegendLabel(IsDark)} />
            <Bar dataKey="You" name="This Student" fill={SeriesColor("A", IsDark)} radius={[0, 8, 8, 0]} maxBarSize={22}>
              <LabelList dataKey="You" content={RightValueLabelContent(IsDark, (Value) => `${Value.toFixed(1)}m`)} />
            </Bar>
            <Bar dataKey="Cohort" name="Cohort Average" fill={SeriesColor("B", IsDark)} radius={[0, 8, 8, 0]} maxBarSize={22}>
              <LabelList dataKey="Cohort" content={RightValueLabelContent(IsDark, (Value) => `${Value.toFixed(1)}m`)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart-type menus -- one per scope, each entry driving both the pill
// picker's label (page.tsx renders *_CHART_OPTIONS) and the chart card's
// own icon/title/description (single source of truth, so the pill label and
// the card heading can never drift apart).
// ---------------------------------------------------------------------------

export type OverviewChartKey = "SCORE" | "ACCURACY" | "TIME" | "ATTEMPTS" | "REACH" | "COMPLETION";
export type LevelChartKey = "SECTION_DIFFICULTY" | "SECTION_TIME" | "SECTION_DEPTH" | "SCORE_DISTRIBUTION" | "SPEED_VS_ACCURACY" | "COMPLETION_RATE";
export type StudentChartKey = "TREND" | "TIME_TREND" | "SECTION_RADAR" | "SECTION_TIME" | "VS_COHORT";

type ChartMeta = { Icon: LucideIcon; PillLabel: string; Title: string; Description: string };

const OVERVIEW_CHART_META: Record<OverviewChartKey, ChartMeta> = {
  SCORE: {
    Icon: TrendingUpIcon,
    PillLabel: "Avg Score",
    Title: "Average Score by Level",
    Description: "Every level's average practice score, rebased onto that level's own question count so levels of different sizes are directly comparable.",
  },
  ACCURACY: {
    Icon: Target,
    PillLabel: "Avg Accuracy",
    Title: "Average Accuracy by Level",
    Description: "How often students answer correctly out of what they actually attempted, per level -- a level can have a lower score but higher accuracy if students attempt fewer questions carefully.",
  },
  TIME: {
    Icon: Clock,
    PillLabel: "Avg Time",
    Title: "Average Time Taken by Level",
    Description: "How long students spend on a practice paper at each level, on average -- helps spot a level whose paper may be running long or short against its time limits.",
  },
  ATTEMPTS: {
    Icon: BarChartIcon,
    PillLabel: "Attempts",
    Title: "Practice Attempts by Level",
    Description: "Total completed practice attempts recorded at each level -- a raw volume/engagement view, independent of how well students scored.",
  },
  REACH: {
    Icon: Users,
    PillLabel: "Students Reached",
    Title: "Students Reached by Level",
    Description: "How many distinct students have practiced at each level at least once -- shows reach, not performance.",
  },
  COMPLETION: {
    Icon: CheckCircle2,
    PillLabel: "Completion Rate",
    Title: "Completion Rate by Level",
    Description: "Of every practice paper assigned at each level, the share that has actually been completed by the student it was assigned to.",
  },
};

const LEVEL_CHART_META: Record<LevelChartKey, ChartMeta> = {
  SECTION_DIFFICULTY: {
    Icon: Target,
    PillLabel: "Section Difficulty",
    Title: "Section-Wise Difficulty",
    Description: "Average accuracy per section across every student who has practiced this level -- the lowest bar is the section this cohort finds hardest right now.",
  },
  SECTION_TIME: {
    Icon: Clock,
    PillLabel: "Section Time Usage",
    Title: "Section Time Usage",
    Description: "How long students actually spend on each section versus its time limit -- a section running well under its limit may be too easy or too short; one running over may need a longer limit.",
  },
  SECTION_DEPTH: {
    Icon: Activity,
    PillLabel: "Section Completion Depth",
    Title: "Section Completion Depth",
    Description: "How much of each section students actually attempt, on average, out of the questions available -- a low bar means students are leaving that section unfinished, not just answering it wrong.",
  },
  SCORE_DISTRIBUTION: {
    Icon: BarChartIcon,
    PillLabel: "Score Distribution",
    Title: "Score Distribution",
    Description: "How many students land in each score band -- a tall bar on the right means most of the cohort is scoring well; a spread-out shape flags a level where performance varies widely.",
  },
  SPEED_VS_ACCURACY: {
    Icon: TrendingUpIcon,
    PillLabel: "Speed vs. Accuracy",
    Title: "Speed vs. Accuracy",
    Description: "Every student plotted by average time taken against average score -- the top-left corner is the sweet spot (fast and accurate); the bottom-right flags students spending long but still scoring low.",
  },
  COMPLETION_RATE: {
    Icon: PieChartIcon,
    PillLabel: "Completion Rate",
    Title: "Completion Rate",
    Description: "Of every practice paper assigned at this level, the share that has actually been completed so far.",
  },
};

const STUDENT_CHART_META: Record<StudentChartKey, ChartMeta> = {
  TREND: {
    Icon: TrendingUpIcon,
    PillLabel: "Score & Accuracy Trend",
    Title: "Score & Accuracy Trend",
    Description: "This student's score and accuracy across every practice attempt at this level, in the order they were completed -- a rising line is real improvement over time.",
  },
  TIME_TREND: {
    Icon: Clock,
    PillLabel: "Time per Attempt",
    Title: "Time per Attempt",
    Description: "How long this student takes on each attempt at this level, over time -- a falling line means they're getting faster, not just more accurate.",
  },
  SECTION_RADAR: {
    Icon: PieChartIcon,
    PillLabel: "Section Strengths",
    Title: "Section Strengths",
    Description: "This student's own average accuracy per section at this level -- a lopsided shape points to exactly which section needs more practice.",
  },
  SECTION_TIME: {
    Icon: Activity,
    PillLabel: "Section Time Usage",
    Title: "Section Time Usage",
    Description: "How long this student spends on each section versus its time limit -- shows whether they're rushing through a section or spending long on it.",
  },
  VS_COHORT: {
    Icon: Users,
    PillLabel: "You vs. Cohort Average",
    Title: "You vs. Cohort Average",
    Description: "How this student's own averages compare to every other student who has practiced this level.",
  },
};

export const OVERVIEW_CHART_OPTIONS: { Key: OverviewChartKey; Label: string }[] = (
  Object.keys(OVERVIEW_CHART_META) as OverviewChartKey[]
).map((Key) => ({ Key, Label: OVERVIEW_CHART_META[Key].PillLabel }));

export const LEVEL_CHART_OPTIONS: { Key: LevelChartKey; Label: string }[] = (
  Object.keys(LEVEL_CHART_META) as LevelChartKey[]
).map((Key) => ({ Key, Label: LEVEL_CHART_META[Key].PillLabel }));

export const STUDENT_CHART_OPTIONS: { Key: StudentChartKey; Label: string }[] = (
  Object.keys(STUDENT_CHART_META) as StudentChartKey[]
).map((Key) => ({ Key, Label: STUDENT_CHART_META[Key].PillLabel }));

// ---------------------------------------------------------------------------
// Panel dispatchers -- the only exports page.tsx wires up directly. Each
// owns its scope's AnalyticsChartCard wrapper (icon/title/description come
// from the *_CHART_META above) and switches on the selected chart key to
// render the right body.
// ---------------------------------------------------------------------------

export function OverviewChartPanel({ ChartKey, Rows }: { ChartKey: OverviewChartKey; Rows: AnnualCompetitionPracticeReportOverviewRow[] }) {
  const Meta = OVERVIEW_CHART_META[ChartKey];
  return (
    <AnalyticsChartCard Icon={Meta.Icon} Kicker="Overview" Title={Meta.Title} Description={Meta.Description}>
      <LevelMetricBarChartBody Rows={Rows} MetricKey={ChartKey} />
    </AnalyticsChartCard>
  );
}

export function LevelChartPanel({ ChartKey, Report }: { ChartKey: LevelChartKey; Report: AnnualCompetitionPracticeReportForLevel }) {
  const Meta = LEVEL_CHART_META[ChartKey];
  return (
    <AnalyticsChartCard Icon={Meta.Icon} Kicker="Level Analysis" Title={Meta.Title} Description={Meta.Description}>
      {ChartKey === "SECTION_DIFFICULTY" && <SectionDifficultyChartBody Sections={Report.perSection} />}
      {ChartKey === "SECTION_TIME" && <SectionTimeUsageChartBody Sections={Report.perSection} />}
      {ChartKey === "SECTION_DEPTH" && <SectionCompletionDepthChartBody Sections={Report.perSection} />}
      {ChartKey === "SCORE_DISTRIBUTION" && <ScoreDistributionChartBody Students={Report.perStudent} />}
      {ChartKey === "SPEED_VS_ACCURACY" && <TimeVsScoreScatterChartBody Students={Report.perStudent} />}
      {ChartKey === "COMPLETION_RATE" && (
        <CompletionRateDonutChartBody Completed={Report.summary.papersCompletedCount} Assigned={Report.summary.papersAssignedCount} />
      )}
    </AnalyticsChartCard>
  );
}

export function StudentChartPanel({ ChartKey, Report }: { ChartKey: StudentChartKey; Report: AnnualCompetitionPracticeReportForStudent }) {
  const Meta = STUDENT_CHART_META[ChartKey];
  return (
    <AnalyticsChartCard Icon={Meta.Icon} Kicker="Student Analysis" Title={Meta.Title} Description={Meta.Description}>
      {ChartKey === "TREND" && <StudentTrendChartBody Trend={Report.trend} />}
      {ChartKey === "TIME_TREND" && <TimePerAttemptTrendChartBody Trend={Report.trend} />}
      {ChartKey === "SECTION_RADAR" && <StudentSectionRadarChartBody Sections={Report.perSection} />}
      {ChartKey === "SECTION_TIME" && <SectionTimeUsageChartBody Sections={Report.perSection} />}
      {ChartKey === "VS_COHORT" && <StudentVsCohortChartBody Summary={Report.summary} LevelComparison={Report.levelComparison} />}
    </AnalyticsChartCard>
  );
}
