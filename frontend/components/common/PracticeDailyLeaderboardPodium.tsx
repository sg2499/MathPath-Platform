import type { ComponentType } from "react";
import { Trophy, Medal, Award, Users, FileCheck2, Repeat } from "lucide-react";
import { EmptyState } from "@/components/common/EmptyState";

// Daily Practice Leaderboard feature (Shailesh, 2026-09-28): sibling of
// PracticeLeaderboardPodium (the cumulative/all-time leaderboard), not a
// mode flag bolted onto it -- the row shape is genuinely different here.
// There is no "avg" anything in daily mode (a single day isn't an average,
// confirmed with Shailesh), and each row is one student's single BEST
// attempt of the selected day: score, accuracyPercentage and
// timeTakenSeconds all come from that same winning attempt together, never
// mixed from different attempts. papersToday (this student's attempt count
// for the day) rides along so a multi-attempt day stays visible instead of
// silently collapsing into one number with no context. Shared between the
// admin and teacher pages for the same reason PracticeLeaderboardPodium is
// -- the visual must be pixel-identical across both roles, so one component
// is the guarantee instead of something to keep in sync by hand.
//
// Row shape is a structural subset of both AnnualCompetitionPracticeDailyLeaderboardRow
// (lib/api/admin.ts) and TeacherAnnualCompetitionPracticeDailyLeaderboardRow
// (lib/api/teacher.ts) -- TypeScript's structural typing means neither type
// needs to change to satisfy this prop type.
export type PracticeDailyLeaderboardRow = {
  rank: number;
  studentId: string;
  studentName: string | null;
  studentCode: string | null;
  score: number | null;
  maxScore: number | null;
  accuracyPercentage: number | null;
  timeTakenSeconds: number | null;
  papersToday: number;
};

export type PracticeDailyLeaderboardSummary = {
  studentsWithAttemptsCount: number;
  attemptsCount: number;
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

function DisplayName(Row: PracticeDailyLeaderboardRow): string {
  return Row.studentName || Row.studentCode || Row.studentId;
}

// Same gold/silver/bronze tone convention as PracticeLeaderboardPodium,
// duplicated rather than imported so this component has no dependency on
// that one -- the two are siblings, not a base/variant pair.
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

function PodiumCard({ Row }: { Row: PracticeDailyLeaderboardRow }) {
  const Tone = PODIUM_TONE[Row.rank] || PODIUM_TONE[3];
  const IconComponent = Row.rank === 1 ? Trophy : Medal;
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
      {/* One score figure, not the two-column Avg/Highest split the
          cumulative podium uses -- in daily mode this IS already the day's
          best (that's what "best attempt of the day" means), so a second
          "Highest Score" figure next to it would just repeat the same
          number under a different label. */}
      <p className="mt-3 text-2xl font-black text-slate-950 dark:text-white">
        {Row.score == null ? "-" : `${Row.score}/${Row.maxScore ?? "-"}`}
      </p>
      <div className="mt-2 flex items-center justify-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
        <span>{FormatPercent(Row.accuracyPercentage)} Accuracy</span>
        <span>&middot;</span>
        <span>{FormatSecondsAsMinSec(Row.timeTakenSeconds)}</span>
      </div>
      {Row.papersToday > 1 ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-500 dark:bg-white/10 dark:text-slate-300">
          <Repeat size={11} /> Best of {Row.papersToday} papers today
        </p>
      ) : null}
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

export function PracticeDailyLeaderboardPodium({
  Summary,
  Rows,
  EmptyDescription,
}: {
  Summary: PracticeDailyLeaderboardSummary;
  Rows: PracticeDailyLeaderboardRow[];
  EmptyDescription: string;
}) {
  if (Rows.length === 0) {
    return <EmptyState title="No attempts on this day" description={EmptyDescription} />;
  }

  const TopThree = Rows.filter((Row) => Row.rank <= 3);
  const PodiumOrder = [2, 1, 3].map((Rank) => TopThree.find((Row) => Row.rank === Rank)).filter(
    (Row): Row is PracticeDailyLeaderboardRow => Boolean(Row)
  );
  const RestRows = Rows.filter((Row) => Row.rank > 3);
  // "Highest score day-wise" (Shailesh's own ask) surfaces directly as its
  // own stat tile, not just buried in the ranked list below -- Rows[0] is
  // guaranteed to be the day's top score since Rows arrives server-sorted
  // (score descending) and this component never re-sorts it.
  const TopScoreRow = Rows[0];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile Icon={Users} Label="Students" Value={String(Summary.studentsWithAttemptsCount)} />
        <StatTile Icon={FileCheck2} Label="Attempts Today" Value={String(Summary.attemptsCount)} />
        <StatTile
          Icon={Trophy}
          Label="Highest Score Today"
          Value={TopScoreRow.score == null ? "-" : `${TopScoreRow.score}/${TopScoreRow.maxScore ?? "-"}`}
        />
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
          <div className="grid grid-cols-[0.5fr_1.3fr_0.85fr_0.85fr_0.85fr_0.9fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
            <span>Rank</span>
            <span>Student</span>
            <span>Accuracy</span>
            <span>Score</span>
            <span>Time Taken</span>
            <span>Papers Today</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {RestRows.map((Row) => (
              <div
                key={Row.studentId}
                className="grid grid-cols-[0.5fr_1.3fr_0.85fr_0.85fr_0.85fr_0.9fr] items-center gap-3 px-5 py-3 text-sm font-bold text-slate-800 dark:text-slate-100"
              >
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
                <div>{FormatPercent(Row.accuracyPercentage)}</div>
                <div>{Row.score == null ? "-" : `${Row.score}/${Row.maxScore ?? "-"}`}</div>
                <div>{FormatSecondsAsMinSec(Row.timeTakenSeconds)}</div>
                <div>{Row.papersToday}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
