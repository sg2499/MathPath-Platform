import type { ComponentType } from "react";
import { Trophy, Medal, Award, Users, Target, Clock, FileCheck2 } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

// Annual Competition Practice Leaderboard (Shailesh, 2026-09-18): "this
// leaderboard is gonna be a bit different than the dps and mock
// leaderboards as here we do not need the animations and stuff but yes we
// do need the podium and the stats." Deliberately static -- no confetti, no
// entrance animation, no PodiumHeroAnimation reuse (that component is built
// for a one-time reveal moment, not a plain admin/teacher reporting screen
// someone re-opens constantly). One shared component for both the admin and
// teacher pages (unlike every other Practice Reports view in this feature,
// which is deliberately duplicated per role page) because the visual must
// be pixel-identical across both -- a shared component makes that a
// guarantee instead of something to keep in sync by hand across two
// 1000+ line files.
//
// Row shape is a structural subset of both AnnualCompetitionPracticeReportStudentRow
// (lib/api/admin.ts) and TeacherAnnualCompetitionPracticeReportStudentRow
// (lib/api/teacher.ts) -- both already carry every field below, including
// `rank`, added alongside this component (see
// annual_competition_practice_report_service.py's GetAnnualCompetitionPracticeReportForLevel).
// TypeScript's structural typing means neither admin.ts nor teacher.ts type
// needs to change to satisfy this prop type.
export type PracticeLeaderboardRow = {
  rank: number;
  studentId: string;
  studentName: string | null;
  studentCode: string | null;
  attemptsCount: number;
  avgScore: number | null;
  avgMaxScore: number | null;
  avgAccuracyPercentage: number | null;
  avgTimeTakenSeconds: number | null;
  papersAssignedCount: number;
  papersCompletedCount: number;
};

export type PracticeLeaderboardSummary = {
  studentsWithAttemptsCount: number;
  attemptsCount: number;
  avgAccuracyPercentage: number | null;
  avgTimeTakenSeconds: number | null;
  papersAssignedCount: number;
  papersCompletedCount: number;
};

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

function DisplayName(Row: PracticeLeaderboardRow): string {
  return Row.studentName || Row.studentCode || Row.studentId;
}

// Podium tint per rank -- gold/silver/bronze, matching what the icon next
// to each rank already signals rather than introducing a fourth unrelated
// color into the page. Deliberately muted (not neon) per Shailesh's "soothing
// to the eye" ask for this whole feature.
const PODIUM_TONE: Record<number, { Card: string; Icon: string; Ring: string }> = {
  1: {
    Card: "border-amber-300 bg-gradient-to-b from-amber-50 to-white dark:border-amber-700/60 dark:from-amber-950/30 dark:to-slate-950",
    Icon: "text-amber-500 dark:text-amber-300",
    Ring: "ring-2 ring-amber-300/70 dark:ring-amber-600/50",
  },
  2: {
    Card: "border-slate-300 bg-gradient-to-b from-slate-50 to-white dark:border-slate-600/60 dark:from-slate-900/40 dark:to-slate-950",
    Icon: "text-slate-400 dark:text-slate-300",
    Ring: "ring-2 ring-slate-300/70 dark:ring-slate-500/40",
  },
  3: {
    Card: "border-orange-300 bg-gradient-to-b from-orange-50 to-white dark:border-orange-800/60 dark:from-orange-950/30 dark:to-slate-950",
    Icon: "text-orange-500 dark:text-orange-300",
    Ring: "ring-2 ring-orange-300/70 dark:ring-orange-700/40",
  },
};

function PodiumCard({ Row }: { Row: PracticeLeaderboardRow }) {
  const Tone = PODIUM_TONE[Row.rank] || PODIUM_TONE[3];
  const IconComponent = Row.rank === 1 ? Trophy : Medal;
  // Rank 1 sits visually taller than 2/3 -- the one deliberate "podium"
  // shape cue, done with plain padding/margin, not a CSS/JS animation.
  const HeightClass = Row.rank === 1 ? "sm:-mt-4 sm:pb-7" : "sm:pb-5";
  return (
    <div
      className={`flex-1 rounded-2xl border p-5 text-center shadow-sm ${Tone.Card} ${Row.rank === 1 ? Tone.Ring : ""} ${HeightClass}`}
    >
      <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/70 shadow-sm dark:bg-white/10 ${Tone.Icon}`}>
        <IconComponent size={22} />
      </div>
      <p className="mt-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Rank {Row.rank}</p>
      <p className="mt-1 truncate text-base font-black text-slate-950 dark:text-white" title={DisplayName(Row)}>
        {DisplayName(Row)}
      </p>
      {Row.studentCode ? (
        <p className="text-[11px] font-black uppercase tracking-[0.1em] text-[color:var(--mp-role-primary)]">{Row.studentCode}</p>
      ) : null}
      {/* 2026-09-22 (Shailesh): avg score is the ranking key now, not avg
          accuracy -- so the podium's bold primary figure leads with score,
          and accuracy (still worth showing, just no longer what earned this
          rank) moves down into the secondary row alongside avg time. */}
      <p className="mt-3 text-2xl font-black text-slate-950 dark:text-white">
        {Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}
      </p>
      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Avg Score</p>
      {/* 2026-09-22 (Shailesh): "Accuracy" capitalized to match its own
          earlier display convention, and the bare time value now gets the
          same "<value> Avg Time" treatment as accuracy -- a lone "35:00"
          with no label read as ambiguous. */}
      <div className="mt-3 flex items-center justify-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
        <span>{FormatPercent(Row.avgAccuracyPercentage)} Accuracy</span>
        <span>&middot;</span>
        <span>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)} Avg Time</span>
      </div>
    </div>
  );
}

function StatTile({ Icon, Label, Value }: { Icon: ComponentType<{ size?: number | string }>; Label: string; Value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-3 shadow-sm dark:bg-slate-950/40">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--mp-role-primary)]/10 text-[color:var(--mp-role-primary)]">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">{Label}</p>
        <p className="text-lg font-black text-slate-950 dark:text-white">{Value}</p>
      </div>
    </div>
  );
}

export function PracticeLeaderboardPodium({
  Summary,
  Rows,
  EmptyDescription,
}: {
  Summary: PracticeLeaderboardSummary;
  Rows: PracticeLeaderboardRow[];
  EmptyDescription: string;
}) {
  if (Rows.length === 0) {
    return <EmptyState title="No leaderboard yet" description={EmptyDescription} />;
  }

  const TopThree = Rows.filter((Row) => Row.rank <= 3);
  // Podium visual order is 2nd-1st-3rd (classic podium shape), independent
  // of Rows' own rank-ascending order -- the table below stays rank-ascending.
  const PodiumOrder = [2, 1, 3].map((Rank) => TopThree.find((Row) => Row.rank === Rank)).filter(
    (Row): Row is PracticeLeaderboardRow => Boolean(Row)
  );
  // Table shows the REST of the field only (Shailesh, 2026-09-22, Practice
  // Leaderboard fix): the podium above already shows the top 3, so
  // repeating them in the table below was pure redundancy. Every row here
  // is guaranteed rank > 3, so the table no longer needs any top-three
  // styling/icon branch -- see the row render below.
  const RestRows = Rows.filter((Row) => Row.rank > 3);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile Icon={Users} Label="Students" Value={String(Summary.studentsWithAttemptsCount)} />
        <StatTile Icon={FileCheck2} Label="Attempts" Value={String(Summary.attemptsCount)} />
        <StatTile Icon={Target} Label="Avg Accuracy" Value={FormatPercent(Summary.avgAccuracyPercentage)} />
        <StatTile Icon={Clock} Label="Avg Time" Value={FormatSecondsAsMinSec(Summary.avgTimeTakenSeconds)} />
      </div>

      {PodiumOrder.length > 0 ? (
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          {PodiumOrder.map((Row) => (
            <PodiumCard key={Row.studentId} Row={Row} />
          ))}
        </div>
      ) : null}

      {RestRows.length > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)]">
          <div className="grid grid-cols-[0.5fr_1.4fr_0.9fr_0.9fr_0.9fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
            <span>Rank</span>
            <span>Student</span>
            <span>Avg Accuracy</span>
            <span>Avg Score</span>
            <span>Avg Time</span>
            <span>Papers</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {RestRows.map((Row) => (
              <div
                key={Row.studentId}
                className="grid grid-cols-[0.5fr_1.4fr_0.9fr_0.9fr_0.9fr_0.9fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
              >
                {/* 2026-09-22 (Shailesh): text-slate-300 was near-invisible
                    against the light-mode row background -- darkened for
                    real contrast in both themes while staying visually
                    subordinate to the bold rank number next to it. */}
                <div className="flex items-center gap-1.5 font-black text-slate-950 dark:text-white">
                  <Award size={12} className="text-slate-400 dark:text-slate-500" />
                  {Row.rank}
                </div>
                <div className="min-w-0">
                  <div className="truncate font-black text-slate-950 dark:text-white">{DisplayName(Row)}</div>
                  {Row.studentCode ? (
                    <div className="text-xs font-black uppercase tracking-[0.1em] text-[color:var(--mp-role-primary)]">{Row.studentCode}</div>
                  ) : null}
                </div>
                <div>{FormatPercent(Row.avgAccuracyPercentage)}</div>
                <div>{Row.avgScore == null ? "-" : `${Row.avgScore}/${Row.avgMaxScore ?? "-"}`}</div>
                <div>{FormatSecondsAsMinSec(Row.avgTimeTakenSeconds)}</div>
                <div>{Row.papersCompletedCount}/{Row.papersAssignedCount}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
