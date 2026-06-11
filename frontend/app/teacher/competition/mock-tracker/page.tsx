"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherCompetitionMockTracker, type TeacherCompetitionTrackerRow } from "@/lib/api/teacher";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Clock3, Eye, Search, ShieldCheck, Target, Trophy, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

type StatusFilter = "ALL" | "COMPLETED" | "IN_PROGRESS" | "ASSIGNED";

function FormatDate(Value?: string | null) {
  if (!Value) return "-";
  const DateValue = new Date(Value);
  if (Number.isNaN(DateValue.getTime())) return "-";
  return DateValue.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function StatusLabel(Status?: string | null) {
  const Value = String(Status || "ASSIGNED").toUpperCase();
  if (Value === "COMPLETED") return "Completed";
  if (Value === "IN_PROGRESS") return "In Progress";
  return "Assigned";
}

function StatusClass(Status?: string | null) {
  const Value = String(Status || "ASSIGNED").toUpperCase();
  if (Value === "COMPLETED") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/70 dark:bg-emerald-950/30 dark:text-emerald-200";
  if (Value === "IN_PROGRESS") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200";
  return "border-[#7a1f58]/20 bg-[#7a1f58]/5 text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100";
}

function MetricCard({ Icon, Label, Value, Helper }: { Icon: typeof Trophy; Label: string; Value: string | number; Helper: string }) {
  return (
    <article className="math-card p-5">
      <div className="flex items-start justify-between gap-4">
        <span className="grid h-9 w-9 place-items-center rounded-2xl border border-[#7a1f58]/20 bg-[#7a1f58]/5 text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100">
          <Icon size={17} />
        </span>
        <strong className="text-3xl font-black text-slate-950 dark:text-white">{Value}</strong>
      </div>
      <p className="mt-4 text-[0.68rem] font-black uppercase tracking-[0.24em] text-[#7a1f58] dark:text-rose-100">{Label}</p>
      <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">{Helper}</p>
    </article>
  );
}

function SectionName(Item: { concept?: string; section?: string }) {
  return Item.section || Item.concept || "Competition Section";
}

function TeacherCompetitionMockTrackerContent() {
  useProtectedPage(["TEACHER"]);
  const [SearchText, SetSearchText] = useState("");
  const [Status, SetStatus] = useState<StatusFilter>("ALL");
  const [SelectedRow, SetSelectedRow] = useState<TeacherCompetitionTrackerRow | null>(null);

  const Query = useQuery({ queryKey: ["teacher", "competition", "mock-tracker"], queryFn: getTeacherCompetitionMockTracker });

  const Rows = Query.data?.rows || [];
  const FilteredRows = useMemo(() => {
    const Term = SearchText.trim().toLowerCase();
    return Rows.filter((Row) => {
      const RowStatus = String(Row.status || "ASSIGNED").toUpperCase();
      if (Status !== "ALL" && RowStatus !== Status) return false;
      if (!Term) return true;
      const Haystack = [
        Row.student.studentName,
        Row.student.studentCode,
        Row.mockExam.title,
        Row.mockExam.mockCode,
        Row.mockExam.levelCode,
        Row.mockExam.moduleCode,
      ].join(" ").toLowerCase();
      return Haystack.includes(Term);
    });
  }, [Rows, SearchText, Status]);

  const Summary = Query.data?.summary;

  return (
    <AppShell title="Competition Mock Tracker">
      <section className="space-y-6">
        <div className="math-card p-6 sm:p-8">
          <p className="math-kicker">Competition</p>
          <h1 className="math-title">Competition Mock Tracker</h1>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-700 dark:text-slate-200">
            Monitor Admin-assigned mock exams, student completion, scores, accuracy, timing, strengths, and weak areas. Teachers review only; assignment remains Admin-controlled.
          </p>
        </div>

        {Query.isLoading ? (
          <LoadingState label="Loading competition tracker" message="Fetching assigned mocks and student outcomes." />
        ) : Query.isError ? (
          <ErrorState title="Could not load competition tracker" message={apiErrorMessage(Query.error)} />
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
              <MetricCard Icon={UsersRound} Label="Assigned" Value={Summary?.assignedCount ?? 0} Helper="Teacher-visible mock assignments" />
              <MetricCard Icon={ShieldCheck} Label="Completed" Value={Summary?.completedCount ?? 0} Helper="Submitted mocks" />
              <MetricCard Icon={Clock3} Label="In Progress" Value={Summary?.inProgressCount ?? 0} Helper="Currently active attempts" />
              <MetricCard Icon={Trophy} Label="Avg Score" Value={`${Summary?.averageScore ?? 0}%`} Helper="Completed mocks" />
              <MetricCard Icon={BarChart3} Label="Avg Accuracy" Value={`${Summary?.averageAccuracy ?? 0}%`} Helper="Attempted answers" />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.3fr_0.9fr]">
              <article className="math-card p-5 sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="math-kicker">Monitor</p>
                    <h2 className="text-2xl font-black text-slate-950 dark:text-white">Student Mock Outcomes</h2>
                    <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Review completion status, score, accuracy, and time taken for your students.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-[1fr_180px] lg:w-[520px]">
                    <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200">
                      <Search size={16} className="text-[#7a1f58] dark:text-rose-100" />
                      <input
                        value={SearchText}
                        onChange={(Event) => SetSearchText(Event.target.value)}
                        placeholder="Search student, mock, code, or level"
                        className="w-full bg-transparent outline-none placeholder:text-slate-400"
                      />
                    </label>
                    <select
                      value={Status}
                      onChange={(Event) => SetStatus(Event.target.value as StatusFilter)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 shadow-sm outline-none transition hover:border-[#7a1f58] dark:border-white/10 dark:bg-slate-950/40 dark:text-slate-200"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="ASSIGNED">Assigned</option>
                      <option value="IN_PROGRESS">In Progress</option>
                      <option value="COMPLETED">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="mt-5 space-y-3">
                  {FilteredRows.length === 0 ? (
                    <EmptyState title="No competition mock records" message="Assigned competition mock outcomes for your students will appear here." />
                  ) : (
                    FilteredRows.map((Row) => (
                      <div key={Row.assignmentId} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-950/35">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.14em] ${StatusClass(Row.status)}`}>{StatusLabel(Row.status)}</span>
                              <span className="rounded-full border border-[#7a1f58]/20 bg-[#7a1f58]/5 px-3 py-1 text-[0.68rem] font-black uppercase tracking-[0.12em] text-[#7a1f58] dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-rose-100">{Row.mockExam.levelCode || "Level"}</span>
                            </div>
                            <h3 className="mt-3 truncate text-lg font-black text-slate-950 dark:text-white">{Row.mockExam.title}</h3>
                            <p className="mt-1 text-sm font-bold text-slate-700 dark:text-slate-200">
                              {Row.student.studentName} · {Row.student.studentCode} · {Row.mockExam.mockCode || "Mock"}
                            </p>
                            <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-300">Assigned {FormatDate(Row.assignedAt)}{Row.submittedAt ? ` · Submitted ${FormatDate(Row.submittedAt)}` : ""}</p>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-4 xl:min-w-[520px]">
                            <MiniMetric Label="Score" Value={Row.percentage != null ? `${Row.percentage}%` : "-"} />
                            <MiniMetric Label="Accuracy" Value={Row.accuracyPercentage != null ? `${Row.accuracyPercentage}%` : "-"} />
                            <MiniMetric Label="Time" Value={Row.timeTakenText || "-"} />
                            <button
                              type="button"
                              onClick={() => SetSelectedRow(Row)}
                              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#7a1f58]/25 bg-white px-4 py-3 text-sm font-black text-[#7a1f58] transition hover:border-[#7a1f58] hover:bg-[#7a1f58] hover:text-white dark:border-rose-300/30 dark:bg-slate-950/40 dark:text-rose-100 dark:hover:bg-rose-700"
                            >
                              <Eye size={15} /> Review
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>

              <article className="math-card p-5 sm:p-6">
                <p className="math-kicker">Review</p>
                <h2 className="text-2xl font-black text-slate-950 dark:text-white">Result Details</h2>
                {!SelectedRow ? (
                  <div className="mt-6 rounded-3xl border border-dashed border-[#7a1f58]/25 bg-[#7a1f58]/5 p-6 text-sm font-bold leading-6 text-slate-700 dark:border-rose-300/30 dark:bg-rose-400/10 dark:text-slate-200">
                    Select a completed or in-progress mock row to review score, timing, strengths, and weak areas. Teachers can monitor only; no assignment action is available here.
                  </div>
                ) : (
                  <div className="mt-5 space-y-4">
                    <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/35">
                      <p className="text-xs font-black uppercase tracking-[0.18em] text-[#7a1f58] dark:text-rose-100">{SelectedRow.student.studentCode}</p>
                      <h3 className="mt-1 text-xl font-black text-slate-950 dark:text-white">{SelectedRow.student.studentName}</h3>
                      <p className="mt-1 text-sm font-bold text-slate-600 dark:text-slate-300">{SelectedRow.mockExam.title}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <MiniMetric Label="Correct" Value={SelectedRow.correctCount ?? "-"} />
                      <MiniMetric Label="Unanswered" Value={SelectedRow.unansweredCount ?? "-"} />
                      <MiniMetric Label="Score" Value={SelectedRow.percentage != null ? `${SelectedRow.percentage}%` : "-"} />
                      <MiniMetric Label="Time" Value={SelectedRow.timeTakenText || "-"} />
                    </div>
                    <SectionList Title="Strengths" Items={SelectedRow.strengths} Empty="Strengths will appear after submission." />
                    <SectionList Title="Weak Areas" Items={SelectedRow.weakAreas} Empty="Weak areas will appear after submission." />
                    <SectionList Title="Section Performance" Items={SelectedRow.sectionPerformance} Empty="Section performance will appear after submission." />
                  </div>
                )}
              </article>
            </div>
          </>
        )}
      </section>
    </AppShell>
  );
}

function MiniMetric({ Label, Value }: { Label: string; Value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/10 dark:bg-white/5">
      <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-[#7a1f58] dark:text-rose-100">{Label}</p>
      <p className="mt-1 text-base font-black text-slate-950 dark:text-white">{Value}</p>
    </div>
  );
}

function SectionList({ Title, Items, Empty }: { Title: string; Items: Array<{ concept?: string; section?: string; correct: number; total: number; percentage: number }>; Empty: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-slate-950/35">
      <h3 className="text-sm font-black text-slate-950 dark:text-white">{Title}</h3>
      <div className="mt-3 space-y-2">
        {Items.length === 0 ? (
          <p className="text-sm font-bold text-slate-600 dark:text-slate-300">{Empty}</p>
        ) : (
          Items.slice(0, 8).map((Item, Index) => (
            <div key={`${Title}-${Index}`} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
              <span className="truncate">{SectionName(Item)}</span>
              <span className="shrink-0 font-black text-[#7a1f58] dark:text-rose-100">{Item.correct}/{Item.total} · {Item.percentage}%</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function TeacherCompetitionMockTrackerPage() {
  return <TeacherCompetitionMockTrackerContent />;
}
