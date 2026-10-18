"use client";

// 2026-10-18 (Birthdays, Part 4): a teacher's own students' birthdays.
// The server limits everything here to this teacher's students; there is
// no wish management and no date-of-birth fixing (that is the admin's).

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CalendarRange, Cake, PartyPopper, Search, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { AddDays, MonthGrid, TodayPanel, UpcomingList } from "@/components/birthdays/BirthdayViews";
import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getTeacherBirthdays, type BirthdayEntry, type BirthdayRange } from "@/lib/api/birthday";

type Tab = "upcoming" | "month";
const TABS: Tab[] = ["upcoming", "month"];
const SPANS = [7, 30, 90] as const;

function Metric({ label, value, icon }: { label: string; value: number | string; icon: ReactNode }) {
  return (
    <div className="math-teacher-light-metric-card relative overflow-hidden rounded-[22px] border p-4">
      <div className="math-teacher-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10">{label}</p>
      <p className="relative z-10">{value}</p>
    </div>
  );
}

const profileHref = (Entry: { studentCode: string }) => `/teacher/assignment-tracker/student/${encodeURIComponent(Entry.studentCode)}`;

function ShiftMonthFrom(Month: string, By: number) {
  const [Year, MonthNumber] = Month.split("-").map(Number);
  const Value = new Date(Year, MonthNumber - 1 + By, 1);
  return `${Value.getFullYear()}-${String(Value.getMonth() + 1).padStart(2, "0")}`;
}

function TeacherBirthdaysPage() {
  const ready = useProtectedPage(["TEACHER"]);
  const Params = useSearchParams();
  const [TabValue, SetTab] = useState<Tab>(() => (TABS.includes((Params.get("tab") ?? "") as Tab) ? (Params.get("tab") as Tab) : "upcoming"));
  const [Span, SetSpan] = useState<(typeof SPANS)[number]>(30);
  const [Month, SetMonth] = useState<string | null>(null);
  const [Picked, SetPicked] = useState<string | null>(null);
  const [LevelId, SetLevelId] = useState("ALL");
  const [Q, SetQ] = useState("");

  const Base = useQuery({ queryKey: ["teacher", "birthdays", "base"], queryFn: () => getTeacherBirthdays({ days: 30 }), enabled: ready, staleTime: 60_000 });
  const Today = Base.data?.today ?? "";
  const ThisMonth = Today.slice(0, 7);
  const ShownMonth = Month ?? ThisMonth;
  const Range: BirthdayRange = TabValue === "month" ? { month: ShownMonth } : { start: Today ? AddDays(Today, 1) : undefined, days: Span };
  const Filters = { levelId: LevelId, q: Q };
  const Listing = useQuery({
    queryKey: ["teacher", "birthdays", "list", Range, Filters],
    queryFn: () => getTeacherBirthdays(Range, Filters),
    enabled: ready && Boolean(Today),
    staleTime: 60_000,
    placeholderData: (Previous) => Previous,
  });

  const TodayEntries = useMemo(() => (Base.data?.entries ?? []).filter((Entry) => Entry.isToday), [Base.data]);
  const NextEntries = useMemo(() => (Base.data?.entries ?? []).filter((Entry) => !Entry.isToday), [Base.data]);
  const PickedEntries: BirthdayEntry[] = useMemo(() => (Listing.data?.entries ?? []).filter((Entry) => Entry.date === Picked), [Listing.data, Picked]);
  const Counts = Base.data?.counts;
  const Filtered = Boolean(Q.trim()) || LevelId !== "ALL";

  if (!ready) return null;
  return (
    <AppShell title="Birthdays">
      <section className="math-hero math-slide-up">
        <div className="te-hero-stack relative z-10">
          <div>
            <p className="math-block-header"><Cake size={14} />My Students</p>
            <h1 className="math-title">Birthdays</h1>
            <p className="math-subtitle">
              Your students&apos; birthdays: who celebrates today and in the weeks ahead. Each student gets a birthday wish from you and everyone at MathPath in the app.
            </p>
          </div>
          <div className="te-hero-tiles te-hero-tiles-3">
            <Metric label="Today" value={Counts ? Counts.today : "—"} icon={<PartyPopper size={18} />} />
            <Metric label="Next 7 Days" value={Counts ? Counts.thisWeek : "—"} icon={<CalendarRange size={18} />} />
            <Metric label="This Month" value={Counts ? Counts.thisMonth : "—"} icon={<CalendarDays size={18} />} />
          </div>
        </div>
      </section>

      {Base.isLoading ? <div className="mt-6"><LoadingState label="Loading birthdays" /></div> : null}
      {Base.error ? <div className="mt-6"><ErrorState message={apiErrorMessage(Base.error)} /></div> : null}

      {Base.data ? (
        <>
          <div className="mt-6">
            <TodayPanel entries={TodayEntries} today={Today} sendTime={Base.data.sendTime} next={NextEntries} profileHref={profileHref} hideTeacher />
          </div>

          <section className="mt-6 math-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div role="tablist" aria-label="Birthday views" className="flex min-w-0 flex-wrap gap-2">
                {([["upcoming", "Coming Up", <Sparkles key="i" size={16} />], ["month", "Month", <CalendarDays key="i" size={16} />]] as [Tab, string, ReactNode][]).map(([Key, Label, Icon]) => (
                  <button
                    key={Key}
                    type="button"
                    role="tab"
                    aria-selected={TabValue === Key}
                    onClick={() => { SetTab(Key); SetPicked(null); }}
                    data-active={TabValue === Key ? "true" : "false"}
                    className={`math-role-tab-button math-teacher-tab-force inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-black transition ${TabValue === Key ? "is-active math-teacher-tab-force-selected" : ""}`}
                  >
                    {Icon}{Label}
                  </button>
                ))}
              </div>
              <div className="grid w-full gap-3 sm:grid-cols-[minmax(0,1fr)_200px]">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="math-input pl-11" value={Q} onChange={(Event) => SetQ(Event.target.value)} placeholder="Search by name or student ID" aria-label="Search students" />
                </div>
                <select className="math-select" value={LevelId} onChange={(Event) => SetLevelId(Event.target.value)} aria-label="Filter by level">
                  <option value="ALL">All Levels</option>
                  {(Base.data.filters?.levels ?? []).map((Level) => <option key={Level.id} value={Level.id}>{Level.code}</option>)}
                </select>
              </div>
              {TabValue === "upcoming" ? (
                <div className="flex flex-wrap gap-2" role="group" aria-label="How far ahead">
                  {SPANS.map((Days) => (
                    <button key={Days} type="button" aria-pressed={Span === Days} onClick={() => SetSpan(Days)} className={`ad-bday-span ${Span === Days ? "is-on" : ""}`}>
                      Next {Days} Days
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-6">
              {Listing.isLoading ? <LoadingState label="Loading birthdays" /> : Listing.error ? <ErrorState message={apiErrorMessage(Listing.error)} /> : TabValue === "upcoming" ? (
                <UpcomingList
                  entries={Listing.data?.entries ?? []}
                  today={Today}
                  sendTime={Base.data.sendTime}
                  profileHref={profileHref}
                  hideTeacher
                  emptyText={Filtered ? "No birthdays match these filters in this range." : `None of your students has a birthday in the next ${Span} days.`}
                />
              ) : (
                <div className="grid gap-6">
                  <MonthGrid
                    month={ShownMonth}
                    entries={Listing.data?.entries ?? []}
                    today={Today}
                    picked={Picked}
                    onPick={(Iso) => SetPicked(Picked === Iso ? null : Iso)}
                    onShift={(By) => { SetMonth(By === 0 ? null : ShiftMonthFrom(ShownMonth, By)); SetPicked(null); }}
                  />
                  {Picked ? (
                    <UpcomingList entries={PickedEntries} today={Today} sendTime={Base.data.sendTime} profileHref={profileHref} emptyText="" hideTeacher />
                  ) : (
                    <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Choose a day to see who celebrates.</p>
                  )}
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </AppShell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <TeacherBirthdaysPage />
    </Suspense>
  );
}
