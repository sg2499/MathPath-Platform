"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { ANNUAL_COMPETITION_LEVEL_CODES } from "@/lib/api/admin";
import {
  getTeacherAnnualCompetitionEvents,
  getTeacherAnnualCompetitionLive,
  getTeacherAnnualCompetitionPracticeResults,
  getTeacherAnnualCompetitionResults,
  type TeacherAnnualCompetitionLiveRow,
  type TeacherAnnualCompetitionPracticeRosterStudent,
  type TeacherAnnualCompetitionResultRow,
} from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import { Activity, CalendarClock, ChevronDown, ChevronRight, Medal, Repeat, RefreshCcw, Search, Trophy } from "lucide-react";
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

// 2026-09-14 (Shailesh, Official/Practice restructure): "it should also
// have the proper separation that is it should have 2 tabs just like the
// student login which will say official and practice. under the official
// tab it should have the sub tabs Live Status and Results ... and the
// second sub tab should be Practice under which the teacher should see the
// same grouped student table." Mirrors the student page's top-level
// Official/Practice split (app/student/competition/annual/page.tsx) exactly
// -- same plain-text .math-role-tab convention, no icons -- with LIVE/
// RESULTS demoted to sub-tabs of Official (unchanged content, just nested
// one level down) and PRACTICE promoted to its own top-level tab instead of
// sitting flat alongside them.
//
// Practice results are always a separately-scoped surface, never mixed
// into the OFFICIAL Results tab (see ListAnnualCompetitionPracticeResultsForRoster's
// own docstring on the backend, and Phase B's original "practice results
// get their own, separately-scoped admin surface" comment this whole
// feature has followed on the admin and student sides alike). It is fully
// independent of SelectedEventId/Events -- practice is never scoped to any
// event, so this tab works even before Admin has created a single OFFICIAL
// event, and its own level-code filter is gated on nothing but the tab
// being active.
const TopTabList = ["OFFICIAL", "PRACTICE"] as const;
type TopTabKey = (typeof TopTabList)[number];

const OfficialSubTabList = ["LIVE", "RESULTS"] as const;
type OfficialSubTabKey = (typeof OfficialSubTabList)[number];

export default function TeacherAnnualCompetitionMonitorPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const [SelectedEventId, SetSelectedEventId] = useState<string>("");
  const [TopTab, SetTopTab] = useState<TopTabKey>("OFFICIAL");
  const [ActiveTab, SetActiveTab] = useState<OfficialSubTabKey>("LIVE");
  const [PracticeLevelFilter, SetPracticeLevelFilter] = useState<string>("ALL");
  const [PracticeSearchText, SetPracticeSearchText] = useState("");
  const [ExpandedPracticeStudents, SetExpandedPracticeStudents] = useState<Set<string>>(new Set());

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
    enabled: Ready && Boolean(SelectedEventId) && TopTab === "OFFICIAL" && ActiveTab === "LIVE",
    refetchInterval: TopTab === "OFFICIAL" && ActiveTab === "LIVE" ? 15000 : false,
  });

  const ResultsQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "results", SelectedEventId],
    queryFn: () => getTeacherAnnualCompetitionResults(SelectedEventId),
    enabled: Ready && Boolean(SelectedEventId) && TopTab === "OFFICIAL" && ActiveTab === "RESULTS",
  });

  // Fully independent of SelectedEventId/Events -- practice is never scoped
  // to any event, so this tab works even before Admin has created a single
  // OFFICIAL event.
  const PracticeQuery = useQuery({
    queryKey: ["teacher", "annual-competition", "practice-results", PracticeLevelFilter],
    queryFn: () => getTeacherAnnualCompetitionPracticeResults(PracticeLevelFilter === "ALL" ? undefined : PracticeLevelFilter),
    enabled: Ready && TopTab === "PRACTICE",
  });

  // 2026-09-14 (Shailesh): same student-grouped view as the admin Practice
  // Results tab (admin/competition/annual-studio/page.tsx) -- "the teacher
  // should see the same grouped student table with all their practice
  // attempts in one place along with the search bar and module-level
  // filters." Level filtering happens server-side (PracticeLevelFilter,
  // above); search is client-side across the already-fetched page, same as
  // admin's. The backend now does the student-grouping itself
  // (ListAnnualCompetitionPracticeResultsForRoster returns students[].
  // papers[] directly, every paper ascending by paperOrdinal, pending AND
  // submitted together) -- no client-side re-grouping needed anymore.
  const GroupedPracticeResults = (() => {
    const Term = PracticeSearchText.trim().toLowerCase();
    const Students = PracticeQuery.data?.students || [];
    const Filtered = !Term
      ? Students
      : Students.filter((StudentGroup) => {
          const Haystack = [
            StudentGroup.studentName,
            StudentGroup.studentCode,
            ...StudentGroup.papers.map((Paper) => Paper.competitionLevelCode),
            ...StudentGroup.papers.map((Paper) => Paper.paperLabel),
          ]
            .join(" ")
            .toLowerCase();
          return Haystack.includes(Term);
        });
    return [...Filtered].sort((Left, Right) =>
      (Left.studentName || Left.studentCode || "").localeCompare(Right.studentName || Right.studentCode || "")
    );
  })();
  function TogglePracticeStudentExpanded(Key: string) {
    SetExpandedPracticeStudents((Prev) => {
      const Next = new Set(Prev);
      if (Next.has(Key)) Next.delete(Key);
      else Next.add(Key);
      return Next;
    });
  }

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

        {/* Top-level Official/Practice split -- mirrors the student page's
            own .math-role-tab convention exactly (plain text, no icon). */}
        <div className="math-card p-2">
          <div className="flex flex-wrap gap-2">
            {TopTabList.map((Tab) => (
              <button
                key={Tab}
                type="button"
                onClick={() => SetTopTab(Tab)}
                aria-selected={TopTab === Tab}
                className={TopTab === Tab ? "math-role-tab math-role-tab-active" : "math-role-tab"}
              >
                {Tab === "OFFICIAL" ? "Official" : "Practice"}
              </button>
            ))}
          </div>
        </div>

        <div className="math-card p-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            {TopTab === "PRACTICE" ? (
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-2 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm dark:bg-slate-950/40 dark:text-slate-200">
                  <Search size={16} className="text-[color:var(--mp-role-primary)]" />
                  <input
                    value={PracticeSearchText}
                    onChange={(EventValue) => SetPracticeSearchText(EventValue.target.value)}
                    placeholder="Search student name or code"
                    className="w-64 bg-transparent outline-none placeholder:text-slate-400"
                  />
                </label>
                {/* 2026-09-14 (Shailesh): "pls remove the level filter text
                    from top of the level filter dropdown as it is self
                    explanatory" -- select kept, "Level" label text dropped
                    (aria-label preserves accessibility). */}
                <select
                  aria-label="Filter by level"
                  value={PracticeLevelFilter}
                  onChange={(EventValue) => SetPracticeLevelFilter(EventValue.target.value)}
                  className="math-input min-w-[200px]"
                >
                  <option value="ALL">All Levels</option>
                  {ANNUAL_COMPETITION_LEVEL_CODES.map((LevelCode) => (
                    <option key={LevelCode} value={LevelCode}>{LevelCode}</option>
                  ))}
                </select>
              </div>
            ) : Events.length > 0 ? (
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
            ) : (
              <span />
            )}
            {TopTab === "OFFICIAL" ? (
              <div className="flex flex-wrap gap-3">
                {OfficialSubTabList.map((Tab) => (
                  <button
                    key={Tab}
                    type="button"
                    onClick={() => SetActiveTab(Tab)}
                    aria-selected={ActiveTab === Tab}
                    className={`math-role-tab-button rounded-2xl px-4 py-2 text-sm font-black transition ${ActiveTab === Tab ? "is-active" : ""}`}
                  >
                    {Tab === "LIVE" ? "Live Status" : "Results"}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {TopTab === "OFFICIAL" && (ActiveTab === "LIVE" || ActiveTab === "RESULTS") && (
          EventsQuery.isLoading ? (
            <LoadingState label="Loading Annual Competition events..." />
          ) : EventsQuery.error ? (
            <ErrorState message={apiErrorMessage(EventsQuery.error)} />
          ) : Events.length === 0 ? (
            <div className="math-card p-6">
              <EmptyState title="No Annual Competition events yet" description="Once Admin schedules an event, it will appear here." />
            </div>
          ) : (
            <>
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
                    <table className="w-full min-w-[760px] text-left text-sm font-bold">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
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
                    <table className="w-full min-w-[680px] text-left text-sm font-bold">
                      <thead>
                        <tr className="text-xs uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">
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
            </>
          )
        )}

        {TopTab === "PRACTICE" && (
              <div className="math-card p-5">
                <p className="math-block-header"><Repeat size={14} />Practice</p>
                <p className="mt-2 text-xs font-bold text-slate-500 dark:text-slate-400">
                  Every practice paper your students have completed -- not tied to any Annual Competition event, results
                  are visible to them the instant they're scored (no release gate, unlike Official). Not ranked --
                  practice papers are for building confidence and speed, never for competing against classmates.
                </p>

                {PracticeQuery.data ? (
                  <div className="mt-4 flex flex-wrap gap-4 text-xs font-black text-slate-600 dark:text-slate-300">
                    <span>{PracticeQuery.data.totalStudents} student{PracticeQuery.data.totalStudents === 1 ? "" : "s"}</span>
                    <span>
                      {PracticeQuery.data.students.reduce((Sum, StudentGroup) => Sum + StudentGroup.papers.length, 0)} total practice papers
                    </span>
                  </div>
                ) : null}

                {PracticeQuery.isLoading ? (
                  <div className="mt-4"><LoadingState label="Loading practice results..." /></div>
                ) : PracticeQuery.error ? (
                  <div className="mt-4"><ErrorState message={apiErrorMessage(PracticeQuery.error)} /></div>
                ) : GroupedPracticeResults.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {/* 2026-09-14 (Shailesh): "the teacher should see the same
                        grouped student table with all their practice attempts
                        in one place" -- same collapsible-by-student pattern as
                        the admin Practice Results tab
                        (admin/competition/annual-studio/page.tsx), just
                        without the View-attempt link (teacher's Annual
                        Competition monitor is review-only, same as every
                        other table on this page). */}
                    {GroupedPracticeResults.map((StudentGroup: TeacherAnnualCompetitionPracticeRosterStudent) => {
                      const StudentOpen = ExpandedPracticeStudents.has(StudentGroup.studentId);
                      const PendingCount = StudentGroup.papers.filter((Paper) => Paper.status === "NOT_STARTED").length;
                      return (
                        <div key={StudentGroup.studentId} className="overflow-hidden rounded-3xl border border-[color:var(--mp-role-border)] bg-white shadow-sm dark:bg-slate-950/35">
                          <button
                            type="button"
                            onClick={() => TogglePracticeStudentExpanded(StudentGroup.studentId)}
                            className="flex w-full flex-col gap-3 bg-slate-50/60 px-4 py-4 text-left transition hover:bg-slate-100/70 sm:flex-row sm:items-center sm:justify-between dark:bg-white/5 dark:hover:bg-white/10"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-[color:var(--mp-role-border)] bg-white text-[color:var(--mp-role-primary)] shadow-sm dark:bg-slate-950/50">
                                {StudentOpen ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                              </span>
                              <div className="min-w-0">
                                <h3 className="truncate text-base font-black text-slate-950 dark:text-white">
                                  {StudentGroup.studentName || StudentGroup.studentCode || StudentGroup.studentId}
                                </h3>
                                {StudentGroup.studentCode ? (
                                  <p className="mt-1 text-xs font-black uppercase tracking-[0.12em] text-[color:var(--mp-role-primary)]">{StudentGroup.studentCode}</p>
                                ) : null}
                              </div>
                            </div>
                            <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                              {StudentGroup.papers.length} Paper{StudentGroup.papers.length === 1 ? "" : "s"}
                              {PendingCount > 0 ? ` (${PendingCount} pending)` : ""}
                            </span>
                          </button>

                          {StudentOpen ? (
                            <div className="border-t border-[color:var(--mp-role-border)] p-3">
                              <div className="overflow-hidden rounded-2xl border border-[color:var(--mp-role-border)] bg-white shadow-sm dark:bg-slate-950/35">
                                <div className="grid grid-cols-[1.2fr_0.7fr_0.8fr_0.8fr_0.9fr_1fr] gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
                                  <span>Paper Name</span>
                                  <span>Level</span>
                                  <span>Accuracy</span>
                                  <span>Score</span>
                                  <span>Time Taken</span>
                                  <span>Completed</span>
                                </div>
                                <div className="divide-y divide-slate-100 dark:divide-white/10">
                                  {StudentGroup.papers.map((Paper) => {
                                    const IsPending = Paper.status === "NOT_STARTED" || !Paper.result;
                                    return (
                                      <div
                                        key={Paper.levelPaperId}
                                        className="grid grid-cols-[1.2fr_0.7fr_0.8fr_0.8fr_0.9fr_1fr] items-center gap-3 px-5 py-4 text-sm font-bold text-slate-800 transition hover:bg-slate-50/50 dark:text-slate-100 dark:hover:bg-slate-800/40"
                                      >
                                        <div className="font-black text-slate-950 dark:text-white">{Paper.paperLabel}</div>
                                        <div>{Paper.competitionLevelCode}</div>
                                        <div>{IsPending ? "-" : `${Paper.result!.accuracyPercentage}%`}</div>
                                        <div>{IsPending ? "-" : `${Paper.result!.score}/${Paper.result!.maxScore}`}</div>
                                        <div>{IsPending ? "-" : FormatSecondsAsMinSec(Paper.result!.timeTakenSeconds)}</div>
                                        <div>{IsPending ? "Pending" : FormatEventDate(Paper.result!.computedAt)}</div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4">
                    <EmptyState title="No practice activity yet" description="Practice results appear here automatically once a student finishes a practice paper." />
                  </div>
                )}
              </div>
        )}
      </section>
    </AppShell>
  );
}
