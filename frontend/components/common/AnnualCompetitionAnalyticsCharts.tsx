"use client";

// Analytics Visualization feature, package 2 (Shailesh, 2026-09-22): shared
// chart primitives for the new admin-only "Visualization" sub-tab of
// Practice Reports (see annual-studio/page.tsx's own PracticeReportsSubTabList
// comment for why this is a 3rd Reports sub-tab, not a top-level tab like
// Leaderboard). Every chart here is deliberately built on data the backend
// ALREADY computes for the Student/Level Reports tabs (annual_competition_
// practice_report_service.py) plus one new cross-level Overview endpoint
// (GetAnnualCompetitionPracticeReportOverview) -- nothing here captures new
// data, it only presents existing aggregates visually instead of as tables.
//
// Visual language deliberately matches this platform's existing premium
// surfaces (PracticeLeaderboardPodium.tsx, globals.css's .math-card/.math-metric
// glassmorphism, the blue/cyan/purple gradient family used everywhere else)
// rather than recharts' own default look -- every chart is wrapped in
// AnalyticsChartCard below and themed via CHART_PALETTE, never left at
// library defaults.

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
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
  AnnualCompetitionPracticeReportLevelComparison,
  AnnualCompetitionPracticeReportOverviewRow,
  AnnualCompetitionPracticeReportSectionRow,
  AnnualCompetitionPracticeReportStudentRow,
  AnnualCompetitionPracticeReportSummary,
  AnnualCompetitionPracticeReportTrendRow,
} from "@/lib/api/admin";
import {
  BarChart3 as BarChartIcon,
  Clock,
  PieChart as PieChartIcon,
  Target,
  TrendingUp as TrendingUpIcon,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// ---------------------------------------------------------------------------
// Shared theme -- one palette, reused across every chart in this file so the
// whole Visualization tab reads as one designed surface, not seven
// independently-styled widgets.
// ---------------------------------------------------------------------------

export const CHART_PALETTE = {
  Primary: "#2563eb", // blue -- platform primary accent
  Cyan: "#06b6d4",
  Purple: "#7c3aed",
  Amber: "#f59e0b", // gold, matches PracticeLeaderboardPodium's rank-1 tone
  Emerald: "#10b981", // strong performance
  Rose: "#f43f5e", // weak performance / needs attention
  Slate: "#94a3b8", // neutral / no-data
} as const;

// Section/level performance color, shared by every chart that colors a bar
// or point by how well students are doing (accuracy or percentage, 0-100) --
// one rule everywhere rather than a different threshold per chart.
function ToneForPercentage(Value: number | null | undefined): string {
  if (Value == null) return CHART_PALETTE.Slate;
  if (Value >= 80) return CHART_PALETTE.Emerald;
  if (Value >= 60) return CHART_PALETTE.Primary;
  if (Value >= 40) return CHART_PALETTE.Amber;
  return CHART_PALETTE.Rose;
}

// Reads the platform's own dark-mode signal (AppShell.tsx toggles a `dark`
// class on <html>, see its applyTheme()) -- kept live via a MutationObserver
// so a chart already on screen re-themes the instant the admin flips the
// theme switch, without needing a reload. Deliberately not a new theme
// context/provider -- this is the only place in the app that needs the
// current theme as a plain JS value (for recharts' stroke/fill props, which
// cannot take Tailwind classes), so a small local hook is proportionate.
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

function FormatPercent(Value: number | null): string {
  return Value == null ? "-" : `${Math.round(Value)}%`;
}

function FormatSecondsAsMinSec(Value: number | null): string {
  if (Value == null) return "-";
  const Total = Math.max(0, Math.round(Value));
  const Minutes = Math.floor(Total / 60);
  const Seconds = Total % 60;
  return `${Minutes}:${String(Seconds).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// AnalyticsChartCard -- the one glass-card wrapper every chart below renders
// inside, matching .math-card's own visual language (rounded-[36px],
// backdrop-blur, border) rather than reusing the raw .math-card class
// directly, since that class is tuned for text/table content padding, not a
// fixed-height chart canvas.
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
        <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-500 dark:text-slate-400">{Description}</p>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

// Shared glass tooltip -- replaces recharts' plain default tooltip box
// everywhere in this file so hovering any chart matches the rest of the
// platform's frosted-glass surfaces instead of looking like a stock chart.
// recharts own generic Tooltip content-prop type differs across minor
// versions; active/payload/label's actual runtime shape is stable, so this
// custom renderer takes its props loosely rather than fighting that generic.
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
  return IsDark ? "#94a3b8" : "#64748b";
}

function GridColor(IsDark: boolean) {
  return IsDark ? "rgba(148, 163, 184, 0.14)" : "rgba(100, 116, 139, 0.14)";
}

// ---------------------------------------------------------------------------
// 1. Overview -- cross-level comparison (GetAnnualCompetitionPracticeReportOverview)
// ---------------------------------------------------------------------------

export function LevelComparisonChart({ Rows }: { Rows: AnnualCompetitionPracticeReportOverviewRow[] }) {
  const IsDark = useIsDarkMode();
  const HasAnyData = Rows.some((Row) => Row.attemptsCount > 0);
  const ChartRows = Rows.map((Row) => ({
    LevelCode: Row.competitionLevelCode,
    LevelLabel: FormatCompetitionLevelLabel(Row.competitionLevelCode),
    AvgPercentage: Row.avgPercentage ?? 0,
    HasData: Row.attemptsCount > 0,
    AttemptsCount: Row.attemptsCount,
    StudentsWithAttemptsCount: Row.studentsWithAttemptsCount,
    AvgTimeTakenSeconds: Row.avgTimeTakenSeconds,
  }));

  return (
    <AnalyticsChartCard
      Icon={TrendingUpIcon}
      Kicker="Overview"
      Title="Average Score by Level"
      Description="Every level's average practice score, rebased onto that level's own question count so levels of different sizes are directly comparable. Bars with no data yet still appear, flat, so no level silently disappears from the picture."
    >
      {!HasAnyData ? (
        <EmptyState title="No practice activity yet" description="Scores will appear here as soon as any student completes a practice paper." />
      ) : (
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={ChartRows} margin={{ top: 8, right: 12, left: -12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} vertical={false} />
            <XAxis
              dataKey="LevelLabel"
              tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }}
              angle={-35}
              textAnchor="end"
              interval={0}
              height={64}
              axisLine={{ stroke: GridColor(IsDark) }}
              tickLine={false}
            />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(Value) => `${Value}%`}
              tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
              content={(Props: any) => (
                <GlassTooltip
                  {...Props}
                  Formatter={(Row: Record<string, unknown>) => (
                    <div className="space-y-1 text-slate-700 dark:text-slate-200">
                      {Row.HasData ? (
                        <>
                          <p>Avg Score: <span className="text-[color:var(--mp-role-primary)]">{FormatPercent(Row.AvgPercentage as number)}</span></p>
                          <p>Attempts: {String(Row.AttemptsCount)}</p>
                          <p>Students: {String(Row.StudentsWithAttemptsCount)}</p>
                          <p>Avg Time: {FormatSecondsAsMinSec(Row.AvgTimeTakenSeconds as number | null)}</p>
                        </>
                      ) : (
                        <p className="text-slate-400">No practice attempts yet</p>
                      )}
                    </div>
                  )}
                />
              )}
            />
            <Bar dataKey="AvgPercentage" radius={[10, 10, 0, 0]} maxBarSize={46}>
              {ChartRows.map((Row) => (
                <Cell key={Row.LevelCode} fill={Row.HasData ? ToneForPercentage(Row.AvgPercentage) : GridColor(IsDark)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// 2. Level-scoped -- section difficulty (perSection, from the Level report)
// ---------------------------------------------------------------------------

export function SectionDifficultyChart({ Sections }: { Sections: AnnualCompetitionPracticeReportSectionRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Sections]
    .sort((A, B) => A.sectionNumber - B.sectionNumber)
    .map((Section) => ({
      SectionNumber: Section.sectionNumber,
      SectionLabel: Section.sectionTitle || `Section ${Section.sectionNumber}`,
      AvgAccuracyPercentage: Section.avgAccuracyPercentage,
      AvgTimeTakenSeconds: Section.avgTimeTakenSeconds,
      AttemptsCount: Section.attemptsCount,
    }));

  return (
    <AnalyticsChartCard
      Icon={Target}
      Kicker="Level Analysis"
      Title="Section-Wise Difficulty"
      Description="Average accuracy per section across every student who has practiced this level -- the lowest bar is the section this cohort finds hardest right now."
    >
      {ChartRows.length === 0 ? (
        <EmptyState title="No section data yet" description="Complete at least one practice attempt at this level to see a section breakdown." />
      ) : (
        <ResponsiveContainer width="100%" height={Math.max(240, ChartRows.length * 56)}>
          <BarChart data={ChartRows} layout="vertical" margin={{ top: 8, right: 28, left: 0, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, 100]}
              tickFormatter={(Value) => `${Value}%`}
              tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="SectionLabel"
              tick={{ fill: AxisTickColor(IsDark), fontSize: 12, fontWeight: 800 }}
              axisLine={false}
              tickLine={false}
              width={150}
            />
            <Tooltip
              cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
              content={(Props: any) => (
                <GlassTooltip
                  {...Props}
                  Formatter={(Row: Record<string, unknown>) => (
                    <div className="space-y-1 text-slate-700 dark:text-slate-200">
                      <p>Avg Accuracy: <span className="text-[color:var(--mp-role-primary)]">{FormatPercent(Row.AvgAccuracyPercentage as number | null)}</span></p>
                      <p>Avg Time: {FormatSecondsAsMinSec(Row.AvgTimeTakenSeconds as number | null)}</p>
                      <p>Attempts: {String(Row.AttemptsCount)}</p>
                    </div>
                  )}
                />
              )}
            />
            <Bar dataKey="AvgAccuracyPercentage" radius={[0, 10, 10, 0]} maxBarSize={30}>
              {ChartRows.map((Row) => (
                <Cell key={Row.SectionNumber} fill={ToneForPercentage(Row.AvgAccuracyPercentage)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// 3. Level-scoped -- score distribution (perStudent, from the Level report)
// ---------------------------------------------------------------------------

const DISTRIBUTION_BUCKETS = [
  { Label: "0-20%", Min: 0, Max: 20 },
  { Label: "20-40%", Min: 20, Max: 40 },
  { Label: "40-60%", Min: 40, Max: 60 },
  { Label: "60-80%", Min: 60, Max: 80 },
  { Label: "80-100%", Min: 80, Max: 101 },
];

export function ScoreDistributionChart({ Students }: { Students: AnnualCompetitionPracticeReportStudentRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = DISTRIBUTION_BUCKETS.map((Bucket) => ({
    Label: Bucket.Label,
    Count: Students.filter((Row) => Row.avgPercentage != null && Row.avgPercentage >= Bucket.Min && Row.avgPercentage < Bucket.Max).length,
    Midpoint: (Bucket.Min + Math.min(Bucket.Max, 100)) / 2,
  }));

  return (
    <AnalyticsChartCard
      Icon={BarChartIcon}
      Kicker="Level Analysis"
      Title="Score Distribution"
      Description="How many students land in each score band -- a tall bar on the right means most of the cohort is scoring well; a spread-out shape flags a level where performance varies widely."
    >
      {Students.length === 0 ? (
        <EmptyState title="No students yet" description="This chart fills in once students start completing practice papers at this level." />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={ChartRows} margin={{ top: 8, right: 12, left: -12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} vertical={false} />
            <XAxis dataKey="Label" tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: GridColor(IsDark) }} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} width={36} />
            <Tooltip
              cursor={{ fill: IsDark ? "rgba(148,163,184,0.08)" : "rgba(37,99,235,0.06)" }}
              content={(Props: any) => (
                <GlassTooltip
                  {...Props}
                  Formatter={(Row: Record<string, unknown>) => (
                    <p className="text-slate-700 dark:text-slate-200">
                      {String(Row.Count)} student{Row.Count === 1 ? "" : "s"}
                    </p>
                  )}
                />
              )}
            />
            <Bar dataKey="Count" radius={[10, 10, 0, 0]} maxBarSize={64}>
              {ChartRows.map((Row) => (
                <Cell key={Row.Label} fill={ToneForPercentage(Row.Midpoint)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// 4. Level-scoped -- time vs score (perStudent, from the Level report)
// ---------------------------------------------------------------------------

export function TimeVsScoreScatterChart({ Students }: { Students: AnnualCompetitionPracticeReportStudentRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = Students.filter((Row) => Row.avgTimeTakenSeconds != null && Row.avgPercentage != null).map((Row) => ({
    StudentName: Row.studentName || Row.studentCode || Row.studentId,
    AvgTimeTakenMinutes: (Row.avgTimeTakenSeconds || 0) / 60,
    AvgTimeTakenSeconds: Row.avgTimeTakenSeconds,
    AvgPercentage: Row.avgPercentage,
  }));

  return (
    <AnalyticsChartCard
      Icon={Clock}
      Kicker="Level Analysis"
      Title="Speed vs. Accuracy"
      Description="Every student plotted by average time taken against average score -- the top-left corner is the sweet spot (fast and accurate); the bottom-right flags students spending long but still scoring low."
    >
      {ChartRows.length === 0 ? (
        <EmptyState title="No timed attempts yet" description="This chart needs at least one completed practice attempt with a recorded time." />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <ScatterChart margin={{ top: 8, right: 20, left: -6, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} />
            <XAxis
              type="number"
              dataKey="AvgTimeTakenMinutes"
              name="Avg Time"
              unit=" min"
              tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }}
              axisLine={{ stroke: GridColor(IsDark) }}
              tickLine={false}
            />
            <YAxis
              type="number"
              dataKey="AvgPercentage"
              name="Avg Score"
              domain={[0, 100]}
              tickFormatter={(Value) => `${Value}%`}
              tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
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
            <Scatter data={ChartRows} fill={CHART_PALETTE.Purple} fillOpacity={0.75} />
          </ScatterChart>
        </ResponsiveContainer>
      )}
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// 5. Student-scoped -- trend across attempts (trend, from the Student report)
// ---------------------------------------------------------------------------

export function StudentTrendChart({ Trend }: { Trend: AnnualCompetitionPracticeReportTrendRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Trend]
    .sort((A, B) => (A.computedAt || "").localeCompare(B.computedAt || ""))
    .map((Row, Index) => ({
      AttemptLabel: `#${Index + 1}`,
      Percentage: Row.percentage,
      AccuracyPercentage: Row.accuracyPercentage,
      ComputedAt: Row.computedAt,
    }));

  return (
    <AnalyticsChartCard
      Icon={TrendingUpIcon}
      Kicker="Student Analysis"
      Title="Score &amp; Accuracy Trend"
      Description="This student's score and accuracy across every practice attempt at this level, in the order they were completed -- a rising line is real improvement over time."
    >
      {ChartRows.length < 2 ? (
        <EmptyState title="Not enough attempts yet" description="A trend needs at least 2 completed attempts at this level to show a line." />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={ChartRows} margin={{ top: 8, right: 16, left: -12, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 6" stroke={GridColor(IsDark)} vertical={false} />
            <XAxis dataKey="AttemptLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} axisLine={{ stroke: GridColor(IsDark) }} tickLine={false} />
            <YAxis
              domain={[0, 100]}
              tickFormatter={(Value) => `${Value}%`}
              tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={(Props: any) => (
                <GlassTooltip
                  {...Props}
                  Formatter={(Row: Record<string, unknown>) => (
                    <div className="space-y-1 text-slate-700 dark:text-slate-200">
                      <p>Score: <span style={{ color: CHART_PALETTE.Primary }}>{FormatPercent(Row.Percentage as number | null)}</span></p>
                      <p>Accuracy: <span style={{ color: CHART_PALETTE.Cyan }}>{FormatPercent(Row.AccuracyPercentage as number | null)}</span></p>
                    </div>
                  )}
                />
              )}
            />
            <Line type="monotone" dataKey="Percentage" name="Score" stroke={CHART_PALETTE.Primary} strokeWidth={3} dot={{ r: 4, fill: CHART_PALETTE.Primary }} activeDot={{ r: 6 }} />
            <Line type="monotone" dataKey="AccuracyPercentage" name="Accuracy" stroke={CHART_PALETTE.Cyan} strokeWidth={3} strokeDasharray="6 4" dot={{ r: 4, fill: CHART_PALETTE.Cyan }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// 6. Student-scoped -- section radar (perSection, from the Student report)
// ---------------------------------------------------------------------------

export function StudentSectionRadarChart({ Sections }: { Sections: AnnualCompetitionPracticeReportSectionRow[] }) {
  const IsDark = useIsDarkMode();
  const ChartRows = [...Sections]
    .sort((A, B) => A.sectionNumber - B.sectionNumber)
    .map((Section) => ({
      SectionLabel: Section.sectionTitle || `Section ${Section.sectionNumber}`,
      AvgAccuracyPercentage: Section.avgAccuracyPercentage ?? 0,
    }));

  return (
    <AnalyticsChartCard
      Icon={PieChartIcon}
      Kicker="Student Analysis"
      Title="Section Strengths"
      Description="This student's own average accuracy per section at this level -- a lopsided shape points to exactly which section needs more practice."
    >
      {ChartRows.length < 3 ? (
        <EmptyState title="Not enough sections yet" description="A radar view needs at least 3 sections of data to be readable." />
      ) : (
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={ChartRows} margin={{ top: 8, right: 24, left: 24, bottom: 8 }}>
            <PolarGrid stroke={GridColor(IsDark)} />
            <PolarAngleAxis dataKey="SectionLabel" tick={{ fill: AxisTickColor(IsDark), fontSize: 11, fontWeight: 700 }} />
            <PolarRadiusAxis domain={[0, 100]} tick={{ fill: AxisTickColor(IsDark), fontSize: 10 }} tickFormatter={(Value) => `${Value}%`} />
            <Tooltip
              content={(Props: any) => (
                <GlassTooltip
                  {...Props}
                  Formatter={(Row: Record<string, unknown>) => <p className="text-slate-700 dark:text-slate-200">Accuracy: {FormatPercent(Row.AvgAccuracyPercentage as number | null)}</p>}
                />
              )}
            />
            <Radar name="Accuracy" dataKey="AvgAccuracyPercentage" stroke={CHART_PALETTE.Purple} fill={CHART_PALETTE.Purple} fillOpacity={0.35} strokeWidth={2} />
          </RadarChart>
        </ResponsiveContainer>
      )}
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// 7. Student-scoped -- vs cohort (summary + levelComparison, from the Student report)
// ---------------------------------------------------------------------------

export function StudentVsCohortChart({
  Summary,
  LevelComparison,
}: {
  Summary: AnnualCompetitionPracticeReportSummary;
  LevelComparison: AnnualCompetitionPracticeReportLevelComparison | null;
}) {
  const IsDark = useIsDarkMode();
  if (!LevelComparison) {
    return (
      <AnalyticsChartCard
        Icon={Users}
        Kicker="Student Analysis"
        Title="You vs. Cohort Average"
        Description="How this student's own average compares to every other student who has practiced this level."
      >
        <EmptyState title="No cohort data yet" description="This appears once other students have also practiced this level." />
      </AnalyticsChartCard>
    );
  }

  const ChartRows = [
    { Metric: "Avg Score", You: Summary.avgPercentage ?? 0, Cohort: LevelComparison.cohortAvgPercentage ?? 0 },
    { Metric: "Accuracy", You: Summary.avgAccuracyPercentage ?? 0, Cohort: LevelComparison.cohortAvgAccuracyPercentage ?? 0 },
  ];

  return (
    <AnalyticsChartCard
      Icon={Users}
      Kicker="Student Analysis"
      Title="You vs. Cohort Average"
      Description={`Compared against ${LevelComparison.cohortStudentsCount} other student${LevelComparison.cohortStudentsCount === 1 ? "" : "s"} who has practiced this level (${LevelComparison.cohortAttemptsCount} total attempts).`}
    >
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={ChartRows} margin={{ top: 8, right: 12, left: -12, bottom: 8 }} barGap={6}>
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
                    <p>You: <span style={{ color: CHART_PALETTE.Primary }}>{FormatPercent(Row.You as number)}</span></p>
                    <p>Cohort: <span style={{ color: CHART_PALETTE.Slate }}>{FormatPercent(Row.Cohort as number)}</span></p>
                  </div>
                )}
              />
            )}
          />
          <Bar dataKey="You" name="This Student" fill={CHART_PALETTE.Primary} radius={[10, 10, 0, 0]} maxBarSize={54} />
          <Bar dataKey="Cohort" name="Cohort Average" fill={CHART_PALETTE.Slate} radius={[10, 10, 0, 0]} maxBarSize={54} />
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_PALETTE.Primary }} />This Student</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_PALETTE.Slate }} />Cohort Average</span>
      </div>
    </AnalyticsChartCard>
  );
}
