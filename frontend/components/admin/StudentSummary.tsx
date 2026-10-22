"use client";

// Performance Reports > Student History > Summary (2026-10-21, Part 4): one
// student's report at a glance -- who they are and where, how recently and
// how regularly they practise, accuracy week by week, strengths and weak
// spots, the journey so far, competition headlines, and the Parent Report
// (generated in Assessment Control, its one home).

import { EmptyState } from "@/components/common/EmptyState";
import { LoadingState } from "@/components/common/LoadingState";
import { StatePill } from "@/components/common/DetailWorkspaceViews";
import { InlineError } from "@/components/payments/PaymentsUi";
import { useIsDarkMode } from "@/components/payments/panels/OverviewPanel";
import { getAdminStudentInsights, type StudentConcept, type StudentInsights } from "@/lib/api/admin";
import { formatMathPathDate } from "@/lib/date";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CalendarClock,
  FileText,
  Flame,
  Flag,
  GraduationCap,
  Milestone,
  Swords,
  Target,
  ThumbsUp,
  TrendingDown,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const SERIES = { A: { light: "#2563eb", dark: "#3987e5" }, B: { light: "#f59e0b", dark: "#d97706" } };
const TIMELINE_FIRST = 8;

const Count = (Value: number | null | undefined) => (Value === null || Value === undefined ? "—" : Value.toLocaleString("en-IN"));
const Short = (Value: string) => formatMathPathDate(Value).replace(/ \d{4}$/, "");

function SinceText(Days: number | null) {
  if (Days === null) return "No practice yet";
  if (Days === 0) return "Today";
  if (Days === 1) return "Yesterday";
  return `${Days} days ago`;
}

export function ParentReportHref(Insights: StudentInsights) {
  const Params = new URLSearchParams({ tab: "parent-reports", subTab: "generate", studentCode: Insights.student.studentCode });
  if (Insights.parentReport.levelCode) Params.set("levelCode", Insights.parentReport.levelCode);
  if (Insights.parentReport.moduleCode) Params.set("moduleCode", Insights.parentReport.moduleCode);
  return `/admin/assessments?${Params.toString()}`;
}

function Stat({ icon, label, value, note }: { icon: ReactNode; label: string; value: string; note?: string }) {
  return (
    <div className="pr-ss-stat">
      <span className="math-teacher-icon-chip">{icon}</span>
      <div className="min-w-0">
        <p className="pr-ss-stat-label">{label}</p>
        <p className="pr-ss-stat-value">{value}</p>
        {note ? <p className="pr-ss-stat-note">{note}</p> : null}
      </div>
    </div>
  );
}

function Weighted(Weeks: StudentInsights["trend"]) {
  const Attempts = Weeks.reduce((Sum, Week) => Sum + (Week.practiceAccuracy === null ? 0 : Week.attempts), 0);
  if (!Attempts) return null;
  return Math.round(Weeks.reduce((Sum, Week) => Sum + (Week.practiceAccuracy === null ? 0 : Week.practiceAccuracy * Week.attempts), 0) / Attempts);
}

function Header({ Data }: { Data: StudentInsights }) {
  const Student = Data.student;
  const Summary = Data.summary as Record<string, number | boolean | null>;
  // the tiles above already show the level, DPS and assessment counts
  const Recent = Weighted(Data.trend.slice(-4));
  const Before = Weighted(Data.trend.slice(-8, -4));
  const Change = Recent !== null && Before !== null ? Recent - Before : null;
  return (
    <section className="math-card pr-ss-head p-4 sm:p-5">
      <div className="pr-ss-who">
        <span className="pr-ss-avatar" aria-hidden="true"><UserRound size={22} /></span>
        <div className="min-w-0">
          <h2 className="pr-ss-name">{Student.studentName || "—"}</h2>
          <p className="pr-ss-meta">
            <span className="pr-code">{Student.studentCode}</span>
            <span>{Student.teacherName ? `Teacher: ${Student.teacherName}` : "No Teacher Assigned"}</span>
            <span>{Student.currentLevelCode ? `On ${Student.currentLevelCode}${Student.currentLevelName ? ` · ${Student.currentLevelName}` : ""}` : "No Current Level"}</span>
          </p>
        </div>
        <div className="pr-ss-actions">
          {Data.parentReport.available ? (
            <Link href={ParentReportHref(Data)} className="math-button-primary pr-ss-parent">
              <FileText size={16} />
              {`Parent Report · ${Data.parentReport.levelCode}`}
            </Link>
          ) : (
            <div className="pr-ss-parent-off">
              <button type="button" className="math-button-secondary" disabled aria-describedby="pr-ss-parent-why">
                <FileText size={16} />
                Parent Report
              </button>
              <p id="pr-ss-parent-why" className="pr-ss-stat-note">Available once a level assessment is cleared.</p>
            </div>
          )}
        </div>
      </div>
      <div className="pr-ss-stats">
        <Stat icon={<CalendarClock size={16} />} label="Last Active" value={SinceText(Data.profile.daysSinceActive)} note={Data.profile.lastActive ? formatMathPathDate(Data.profile.lastActive) : undefined} />
        <Stat icon={<Flame size={16} />} label="Practice Streak" value={`${Data.profile.streakDays} ${Data.profile.streakDays === 1 ? "Day" : "Days"}`} note={`${Data.profile.activeDaysLast30} active ${Data.profile.activeDaysLast30 === 1 ? "day" : "days"} in the last 30`} />
        <Stat icon={<Activity size={16} />} label="Practice Days" value={Count(Data.profile.practiceDays)} note="All time" />
        <Stat
          icon={<Target size={16} />}
          label="Recent Accuracy"
          value={Recent === null ? "—" : `${Recent}%`}
          note={Recent === null ? "No practice in the last 4 weeks" : Change === null ? "Last 4 weeks" : Change === 0 ? "Last 4 weeks · no change" : `Last 4 weeks · ${Change > 0 ? "up" : "down"} ${Math.abs(Change)} ${Math.abs(Change) === 1 ? "point" : "points"}`}
        />
      </div>
      {Summary.promotionReady === true ? (
        <p className="pr-ss-ready">
          <StatePill tone="purple">Ready To Promote</StatePill>
          <span>Level assessment cleared. Promote from Assessment Control.</span>
          <Link href={`/admin/assessments/student/${encodeURIComponent(Student.studentCode)}`} className="pr-ss-link">Open<ArrowRight size={14} /></Link>
        </p>
      ) : null}
    </section>
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

function TrendTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number | null; color: string; payload: { attempts: number; assessments: number } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const Point = payload[0].payload;
  return (
    <div className="pr-ov-tip">
      <p className="pr-ov-tip-title">{label}</p>
      {payload.map((Item) => (
        <p key={Item.name} className="pr-ov-tip-row">
          <span className="pr-ov-tip-dot" style={{ background: Item.color }} />
          {`${Item.name}: ${Item.value === null || Item.value === undefined ? "—" : `${Item.value}%`}`}
        </p>
      ))}
      <p className="pr-ov-tip-row">{`${Point.attempts} practice · ${Point.assessments} assessment`}</p>
    </div>
  );
}

function Trend({ Data }: { Data: StudentInsights }) {
  const Dark = useIsDarkMode();
  const Animate = !useReducedMotion();
  const Axis = Dark ? "#cbd5e1" : "#475569";
  const Grid = Dark ? "rgba(148, 163, 184, 0.14)" : "rgba(100, 116, 139, 0.14)";
  const A = Dark ? SERIES.A.dark : SERIES.A.light;
  const B = Dark ? SERIES.B.dark : SERIES.B.light;
  const Points = Data.trend.map((Week) => ({ ...Week, label: Short(Week.from) }));
  const HasAny = Points.some((Week) => Week.attempts || Week.assessments);
  return (
    <section className="math-card min-w-0 p-4 sm:p-5">
      <p className="math-block-header"><Activity size={14} />Accuracy Week By Week</p>
      <h3 className="pr-ov-section-title">The Last 12 Weeks</h3>
      {HasAny ? (
        <div className="pr-ov-chart" role="img" aria-label={`Practice and assessment accuracy, week by week, with the ${Data.rules.benchmark}% benchmark`}>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={Points} margin={{ top: 8, right: 20, bottom: 4, left: 4 }}>
              <CartesianGrid stroke={Grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: Axis, fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} interval="preserveStartEnd" padding={{ left: 16, right: 16 }} />
              <YAxis domain={[0, 100]} ticks={[0, 25, 50, 70, 100]} tick={{ fill: Axis, fontSize: 11, fontWeight: 700 }} tickLine={false} axisLine={false} width={46} unit="%" />
              <Tooltip content={<TrendTip />} />
              <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700 }} />
              <ReferenceLine y={Data.rules.benchmark} stroke={Axis} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="practiceAccuracy" name="Practice" stroke={A} strokeWidth={3} dot={{ r: 3 }} connectNulls isAnimationActive={Animate} />
              <Line type="monotone" dataKey="assessmentAccuracy" name="Assessment" stroke={B} strokeWidth={0} dot={{ r: 5, strokeWidth: 2 }} activeDot={{ r: 6 }} isAnimationActive={Animate} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState title="No Practice In 12 Weeks" message="Accuracy shows here once this student submits practice." />
      )}
    </section>
  );
}

function ConceptList({ Items, Tone }: { Items: StudentConcept[]; Tone: "good" | "bad" }) {
  return (
    <ul className="pr-ss-concepts">
      {Items.map((Item) => (
        <li key={Item.concept} className="pr-ss-concept">
          <div className="pr-ss-concept-top">
            <span className="pr-name">{Item.concept}</span>
            <span className="pr-score-accuracy" data-met={Tone === "good" ? "true" : "false"}>{`${Item.accuracy}%`}</span>
          </div>
          <span className="pr-ov-bar pr-ss-concept-bar" data-tone={Tone} aria-hidden="true"><span style={{ width: `${Math.max(3, Item.accuracy)}%` }} /></span>
          <span className="pr-sub">{`${Item.correct} of ${Item.questions} questions right`}</span>
        </li>
      ))}
    </ul>
  );
}

function Concepts({ Data }: { Data: StudentInsights }) {
  const { strengths, weakSpots, minQuestions, strongFrom } = Data.concepts;
  return (
    <section className="pr-ss-pair">
      <div className="math-card min-w-0 p-4 sm:p-5">
        <p className="math-block-header"><ThumbsUp size={14} />Strengths</p>
        <h3 className="pr-ov-section-title">Doing Well At</h3>
        {strengths.length ? <ConceptList Items={strengths} Tone="good" /> : <p className="pr-ov-section-text">{`No concept at ${strongFrom}% or more yet (counted after ${minQuestions} questions).`}</p>}
      </div>
      <div className="math-card min-w-0 p-4 sm:p-5">
        <p className="math-block-header"><TrendingDown size={14} />Weak Spots</p>
        <h3 className="pr-ov-section-title">Needs More Practice</h3>
        {weakSpots.length ? <ConceptList Items={weakSpots} Tone="bad" /> : <p className="pr-ov-section-text">{`No concept below ${Data.rules.benchmark}% (counted after ${minQuestions} questions).`}</p>}
      </div>
    </section>
  );
}

const EVENT_ICON = { STARTED: <Flag size={14} />, ASSESSMENT: <GraduationCap size={14} />, PROMOTED: <Milestone size={14} /> };

function Timeline({ Data, OnAssessments }: { Data: StudentInsights; OnAssessments: () => void }) {
  const [All, SetAll] = useState(false);
  const Items = All ? Data.timeline : Data.timeline.slice(0, TIMELINE_FIRST);
  return (
    <section className="math-card min-w-0 p-4 sm:p-5">
      <p className="math-block-header"><Milestone size={14} />Journey</p>
      <h3 className="pr-ov-section-title">Levels, Assessments And Promotions</h3>
      {!Data.timeline.length ? (
        <p className="pr-ov-section-text">Nothing yet in this module.</p>
      ) : (
        <>
          <ol className="pr-ss-timeline">
            {Items.map((Event, Index) => (
              <li key={`${Event.kind}-${Event.at}-${Index}`} className="pr-ss-event" data-tone={Event.tone}>
                <span className="pr-ss-event-dot" aria-hidden="true">{EVENT_ICON[Event.kind]}</span>
                <div className="min-w-0">
                  <p className="pr-ss-event-when">{formatMathPathDate(Event.at)}</p>
                  <p className="pr-name">{Event.title}</p>
                  {Event.detail ? <p className="pr-sub">{Event.detail}</p> : null}
                  {Event.kind === "ASSESSMENT" ? (
                    <button type="button" className="pr-ss-link" onClick={OnAssessments}>Assessment History<ArrowRight size={14} /></button>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          {Data.timeline.length > TIMELINE_FIRST ? (
            <button type="button" className="math-button-secondary mt-3" onClick={() => SetAll(!All)}>{All ? "Show Fewer" : `Show All ${Data.timeline.length}`}</button>
          ) : null}
        </>
      )}
    </section>
  );
}

function Competition({ Data }: { Data: StudentInsights }) {
  const Comp = Data.competition;
  const Code = encodeURIComponent(Data.student.studentId);
  return (
    <section className="math-card min-w-0 p-4 sm:p-5">
      <p className="math-block-header"><Swords size={14} />Competition</p>
      <h3 className="pr-ov-section-title">Mocks And Annual Competition</h3>
      <p className="pr-ov-section-text">Headlines only; the full reports are in Competition.</p>
      {!Comp ? null : (
        <div className="pr-ss-comp">
          <div className="pr-ss-comp-box">
            <p className="pr-ss-stat-label">Mock Exams</p>
            <p className="pr-ss-stat-value">{`${Count(Comp.mocksTaken)} Taken`}</p>
            <p className="pr-sub">{Comp.mocksTaken ? `Best ${Comp.mockBest}% · Latest ${Comp.mockLatest}%` : "No mock taken yet"}</p>
            {Comp.mockLatestTitle ? <p className="pr-sub">{`${Comp.mockLatestTitle}${Comp.mockLatestAt ? `, ${formatMathPathDate(Comp.mockLatestAt)}` : ""}`}</p> : null}
            <div className="pr-ss-comp-links">
              {Comp.mockLatestAttemptId ? <Link className="pr-ss-link" href={`/admin/competition/mock-result/${Comp.mockLatestAttemptId}`}>Latest Result<ArrowRight size={14} /></Link> : null}
              <Link className="pr-ss-link" href={`/admin/competition/mock-tracker?studentId=${Code}`}>Mock Tracker<ArrowRight size={14} /></Link>
            </div>
          </div>
          <div className="pr-ss-comp-box">
            <p className="pr-ss-stat-label">Annual Competition</p>
            <p className="pr-ss-stat-value">{`${Count(Comp.annualPapers)} ${Comp.annualPapers === 1 ? "Paper" : "Papers"}`}</p>
            <p className="pr-sub">{Comp.annualPapers ? `${Comp.annualOfficial} official · Latest ${Comp.annualLatest}%${Comp.annualLatestRank ? ` · Rank ${Comp.annualLatestRank}` : ""}` : "No paper taken yet"}</p>
            {Comp.annualLatestEvent ? <p className="pr-sub">{Comp.annualLatestEvent}{Comp.annualLatestReleased ? "" : " · result not released"}</p> : null}
            <div className="pr-ss-comp-links">
              {Comp.annualLatestAttemptId ? <Link className="pr-ss-link" href={`/admin/competition/annual-result/${Comp.annualLatestAttemptId}`}>Latest Result<ArrowRight size={14} /></Link> : null}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export function StudentSummary({ StudentId, ModuleId, OnAssessments }: { StudentId: string; ModuleId?: string; OnAssessments: () => void }) {
  const Query = useQuery({
    queryKey: ["admin-student-insights", StudentId, ModuleId || ""],
    queryFn: () => getAdminStudentInsights({ studentId: StudentId, moduleId: ModuleId }),
    enabled: Boolean(StudentId),
    placeholderData: (Previous) => (Previous && Previous.student.studentId === StudentId ? Previous : undefined),
  });
  if (Query.error) return <InlineError error={Query.error} />;
  if (!Query.data) return Query.isLoading ? <LoadingState message="Loading the summary..." /> : null;
  const Data = Query.data;
  return (
    <div className="space-y-5" aria-busy={Query.isFetching || undefined}>
      <Header Data={Data} />
      <div className="pr-ss-pair">
        <Trend Data={Data} />
        <Competition Data={Data} />
      </div>
      <Concepts Data={Data} />
      <Timeline Data={Data} OnAssessments={OnAssessments} />
    </div>
  );
}
