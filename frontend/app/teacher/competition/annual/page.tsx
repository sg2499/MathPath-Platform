"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  getTeacherAnnualCompetitionEvents,
  getTeacherAnnualCompetitionLive,
  getTeacherAnnualCompetitionPracticeResults,
  getTeacherAnnualCompetitionResults,
  type TeacherAnnualCompetitionLiveRow,
  type TeacherAnnualCompetitionPracticeResultRow,
  type TeacherAnnualCompetitionResultRow,
} from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarClock, Medal, Repeat, RefreshCcw, Trophy } from "lucide-react";
import { useEffect, useState } from "react";

// Read-only by design -- Teacher: monitor/review only, no assign/rank/
// release path exists here (pkg-07 checklist item 3, same convention as
// this repo's existing Competition Mock Tracker for teachers).

function FormatEventDate(Value: string | null) {
  if (!Value) return "Not set";
  try {
    return new Date(Value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return Value;
  }
}

function FormatSecondsAsMinSec(Value: number | null): string {
  if (Value == null) return "-";
  const Total = Math.max(0, Math.round(Value));
  const Minutes = Math.floor(Total / 60);
  const Seconds = Total % 60;
  return `${Minutes}:${String(Seconds).padStart(2, "0")}`;
}

const LiveStatusTone: Record<TeacherAnnualCompetitionLiveRow["liveStatus"], string> = {
  NOT_STARTED: "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-200",
  STUCK: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200",
  SUBMITTED: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
  FINALIZED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
};

function LiveStatusChip({ status }: { status: TeacherAnnualCompetitionLiveRow["liveStatus"] }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${LiveStatusTone[status]}`}>{status.replace("_", " ")}</span>;
}

// Phase H: PRACTICE added as its own tab -- practice results are always a
// separately-scoped surface, never mixed into the OFFICIAL Results tab
// (see ListAnnualCompetitionPracticeResultsForRoster's own docstring on the
// backend, and Phase B's original "practice results get their own,
// separately-scoped admin surface" comment this whole feature has followed
// on the admin and student sides alike).
const TabList = ["LIVE", "RESULTS", "PRACTICE"] as const;
type TabKey = (typeof TabList)[number];

export default function TeacherAnnualCompetitionMonitorPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const [SelectedEventId, SetSelectedEventId] = useState<string>("");
  const [ActiveTab, SetActiveTab] = useState<TabKey>("LIVE");

  const EventsQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "events"],
    queryFn: getTeacherAnnualCompetitionEvents,
    enabled: Ready,
  });
  const Events = EventsQuery.data || [];

  useEffect(() => {
    if (!SelectedEventId && Events.length > 0) {
      SetSelectedEventId(Events[0].eventId);
    }
  }, [Events, SelectedEventId]);

  const LiveQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "live", SelectedEventId],
    queryFn: () => getTeacherAnnualCompetitionLive(SelectedEventId),
    enabled: Ready && Boolean(SelectedEventId) && ActiveTab === "LIVE",
    refetchInterval: ActiveTab === "LIVE" ? 15000 : false,
  });

  const ResultsQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "results", SelectedEventId],
    queryFn: () => getTeacherAnnualCompetitionResults(SelectedEventId),
    enabled: Ready && Boolean(SelectedEventId) && ActiveTab === "RESULTS",
  });

  const PracticeQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "practice-results", SelectedEventId],
    queryFn: () => getTeacherAnnualCompetitionPracticeResults(SelectedEventId),
    enabled: Ready && Boolean(SelectedEventId) && ActiveTab === "PRACTICE",
  });

  if (!Ready) return null;

  return (
    <AppShell title="Annual Competition Monitor">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-block-header"><Trophy size={14} />Annual Competition</p>
          <h1 className="math-title">Annual Competition Monitor</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
            Monitor your students during the event and review their results once released. Review only -- assigning
            students, scheduling slots, and releasing results all stay Admin-controlled.
          </p>
        </div>

        {EventsQuery.isLoading ? (
          <LoadingState label="Loading Annual Competition events..." />
        ) : EventsQuery.error ? (
          <ErrorState message={apiErrorMessage(EventsQuery.error)} />
        ) : Events.length === 0 ? (
          <div className="math-card p-6">
            <EmptyState title="No Annual Competition events yet" description="Once Admin schedules an event, it will appear here." />
          </div>
        ) : (
          <>
            <div className="math-card p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                  Event
                  <select value={SelectedEventId} onChange={(EventValue) => SetSelectedEventId(EventValue.target.value)} className="math-input min-w-[280px]">
                    {Events.map((EventItem) => (
                      <option key={EventItem.eventId} value={EventItem.eventId}>
                        {EventItem.name} -- {FormatEventDate(EventItem.competitionDate)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-wrap gap-3">
                  {TabList.map((Tab) => (
                    <button
                      key={Tab}
                      type="button"
                      onClick={() => SetActiveTab(Tab)}
                      aria-selected={ActiveTab === Tab}
                      className={`math-role-tab-button rounded-2xl px-4 py-2 text-sm font-black transition ${ActiveTab === Tab ? "is-active" : ""}`}
                    >
                      {Tab === "LIVE" ? "Live Status" : Tab === "RESULTS" ? "Results" : "Practice"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {ActiveTab === "LIVE" && (
              <div className="math-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="math-block-header"><Activity size={14} />Live Status</p>
                  <button
                    type="button"
                    disabled={LiveQuery.isFetching}
                    onClick={() => LiveQuery.refetch()}
                    className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-4 py-2 text-xs font-black text-[color:var(--mp-role-primary)] transition hover:-translate-y-px dark:bg-slate-950/60"
                  >
                    <RefreshCcw size={14} />
                    {LiveQuery.isFetching ? "Refreshing..." : "Refresh Now"}
                  </button>
                </div>

                {LiveQuery.data && (
                  <div className="mt-4 flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                    <span>{LiveQuery.data.summary.totalCount} total</span>
                    <span className="text-slate-500">{LiveQuery.data.summary.notStartedCount} not started</span>
                    <span className="text-blue-600 dark:text-blue-300">{LiveQuery.data.summary.inProgressCount} in progress</span>
                    <span className="text-rose-600 dark:text-rose-300">{LiveQuery.data.summary.stuckCount} stuck</span>
                    <span className="text-emerald-600 dark:text-emerald-300">{LiveQuery.data.summary.finalizedCount} finalized</span>
                  </div>
                )}

                {LiveQuery.isLoading ? (
                  <div className="mt-4"><LoadingState label="Loading live status..." /></div>
                ) : LiveQuery.error ? (
                  <div className="mt-4"><ErrorState message={apiErrorMessage(LiveQuery.error)} /></div>
                ) : LiveQuery.data && LiveQuery.data.rows.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-xs font-bold">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400">
                          <th className="px-2 py-1.5">Student</th>
                          <th className="px-2 py-1.5">Level</th>
                          <th className="px-2 py-1.5">Slot</th>
                          <th className="px-2 py-1.5">Status</th>
                          <th className="px-2 py-1.5">Section</th>
                          <th className="px-2 py-1.5">Remaining</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LiveQuery.data.rows.map((Row: TeacherAnnualCompetitionLiveRow) => (
                          <tr key={Row.assignmentId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2">{Row.assignedLevelCode}</td>
                            <td className="px-2 py-2">{Row.slot?.slotLabel || Row.slot?.mode || "--"}</td>
                            <td className="px-2 py-2"><LiveStatusChip status={Row.liveStatus} /></td>
                            <td className="px-2 py-2">{Row.currentSectionNumber ?? "--"}</td>
                            <td className="px-2 py-2">{FormatSecondsAsMinSec(Row.remainingSecondsAtLastHeartbeat)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState title="No students of yours are assigned" description="Nothing to monitor for this event yet." />
                  </div>
                )}
              </div>
            )}

            {ActiveTab === "RESULTS" && (
              <div className="math-card p-5">
                <p className="math-block-header"><Medal size={14} />Results</p>
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  Kept hidden here too until Admin releases them -- exactly the same lock-down students and parents see.
                </p>

                {ResultsQuery.isLoading ? (
                  <div className="mt-4"><LoadingState label="Loading results..." /></div>
                ) : ResultsQuery.error ? (
                  <div className="mt-4"><ErrorState message={apiErrorMessage(ResultsQuery.error)} /></div>
                ) : ResultsQuery.data && ResultsQuery.data.rows.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-xs font-bold">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400">
                          <th className="px-2 py-1.5">Student</th>
                          <th className="px-2 py-1.5">Level</th>
                          <th className="px-2 py-1.5">Rank</th>
                          <th className="px-2 py-1.5">Accuracy</th>
                          <th className="px-2 py-1.5">Score</th>
                          <th className="px-2 py-1.5">Time Taken</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ResultsQuery.data.rows.map((Row: TeacherAnnualCompetitionResultRow) => (
                          <tr key={Row.assignmentId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2">{Row.assignedLevelCode}</td>
                            {Row.released && Row.result ? (
                              <>
                                <td className="px-2 py-2">{Row.result.rank ?? "--"}</td>
                                <td className="px-2 py-2">{Row.result.accuracyPercentage}%</td>
                                <td className="px-2 py-2">{Row.result.score}/{Row.result.maxScore}</td>
                                <td className="px-2 py-2">{FormatSecondsAsMinSec(Row.result.timeTakenSeconds)}</td>
                              </>
                            ) : (
                              <td className="px-2 py-2 text-slate-400" colSpan={4}>Not released yet</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState title="No students of yours are assigned" description="Nothing to review for this event yet." />
                  </div>
                )}
              </div>
            )}

            {ActiveTab === "PRACTICE" && (
              <div className="math-card p-5">
                <p className="math-block-header"><Repeat size={14} />Practice</p>
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  Every practice paper your students have completed for this event -- results are visible to them the
                  instant they're scored (no release gate, unlike Official). Not ranked -- practice papers are for
                  building confidence and speed, never for competing against classmates.
                </p>

                {PracticeQuery.data ? (
                  <div className="mt-4 flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                    <span>{PracticeQuery.data.totalResults} total attempts scored</span>
                  </div>
                ) : null}

                {PracticeQuery.isLoading ? (
                  <div className="mt-4"><LoadingState label="Loading practice results..." /></div>
                ) : PracticeQuery.error ? (
                  <div className="mt-4"><ErrorState message={apiErrorMessage(PracticeQuery.error)} /></div>
                ) : PracticeQuery.data && PracticeQuery.data.rows.length > 0 ? (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[680px] text-left text-xs font-bold">
                      <thead>
                        <tr className="text-slate-500 dark:text-slate-400">
                          <th className="px-2 py-1.5">Student</th>
                          <th className="px-2 py-1.5">Level</th>
                          <th className="px-2 py-1.5">Accuracy</th>
                          <th className="px-2 py-1.5">Score</th>
                          <th className="px-2 py-1.5">Time Taken</th>
                          <th className="px-2 py-1.5">Completed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {PracticeQuery.data.rows.map((Row: TeacherAnnualCompetitionPracticeResultRow) => (
                          <tr key={Row.attemptId} className="border-t border-[color:var(--mp-role-border)]">
                            <td className="px-2 py-2 text-slate-800 dark:text-slate-100">{Row.studentName || Row.studentCode || Row.studentId}</td>
                            <td className="px-2 py-2">{Row.competitionLevelCode}</td>
                            <td className="px-2 py-2">{Row.accuracyPercentage}%</td>
                            <td className="px-2 py-2">{Row.score}/{Row.maxScore}</td>
                            <td className="px-2 py-2">{FormatSecondsAsMinSec(Row.timeTakenSeconds)}</td>
                            <td className="px-2 py-2">{FormatEventDate(Row.computedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState title="No practice activity yet" description="Practice results appear here automatically once a student finishes a practice paper." />
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>
    </AppShell>
  );
}
