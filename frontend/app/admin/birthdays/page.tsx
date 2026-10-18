"use client";

// 2026-10-18 (Birthdays, Part 2): every active student's birthday, for
// admins. Today with each wish's status, the weeks ahead, a month view, and
// the students whose date of birth needs fixing. Demo accounts follow the
// Show Demo switch.

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarDays, CalendarRange, Cake, ChevronLeft, ChevronRight, Download, Loader2, MessageSquareHeart, PartyPopper, Search, Send, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Suspense, useMemo, useState } from "react";

import { MissingList, MonthGrid, MonthLabel, SentList, TodayPanel, UpcomingList, AddDays } from "@/components/birthdays/BirthdayViews";
import { WishManager } from "@/components/birthdays/WishManager";
import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { downloadAdminBirthdays, getAdminBirthdays, getAdminMissingDob, getBirthdaySent, type BirthdayEntry, type BirthdayFilters, type BirthdayRange } from "@/lib/api/birthday";
import { saveBlob } from "@/lib/api/payments";
import { Plural } from "@/lib/plural";

type Tab = "upcoming" | "month" | "sent" | "wishes" | "missing";
const TABS: Tab[] = ["upcoming", "month", "sent", "wishes", "missing"];
const SPANS = [7, 30, 90] as const;

function Metric({ label, value, icon, onClick }: { label: string; value: number | string; icon: ReactNode; onClick?: () => void }) {
  const Body = (
    <>
      <div className="math-teacher-icon-chip relative z-10">{icon}</div>
      <p className="relative z-10">{label}</p>
      <p className="relative z-10">{value}</p>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="math-teacher-light-metric-card ad-bday-tile relative overflow-hidden rounded-[22px] border p-4 text-left">{Body}</button>
  ) : (
    <div className="math-teacher-light-metric-card relative overflow-hidden rounded-[22px] border p-4">{Body}</div>
  );
}

const profileHref = (Entry: { studentCode: string }) => `/admin/students?student=${encodeURIComponent(Entry.studentCode)}`;

function BirthdaysPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const Params = useSearchParams();
  const [TabValue, SetTab] = useState<Tab>(() => (TABS.includes((Params.get("tab") ?? "") as Tab) ? (Params.get("tab") as Tab) : "upcoming"));
  const [Span, SetSpan] = useState<(typeof SPANS)[number]>(30);
  const [Month, SetMonth] = useState<string | null>(null);
  const [SentMonth, SetSentMonth] = useState<string | null>(null);
  const [Picked, SetPicked] = useState<string | null>(null);
  const [Filters, SetFilters] = useState<BirthdayFilters>({ teacherId: "ALL", levelId: "ALL", centreId: "ALL", q: "" });
  const [Exporting, SetExporting] = useState(false);
  const [ExportError, SetExportError] = useState<string | null>(null);

  // the hero and Today: everyone, the next 30 days
  const Base = useQuery({ queryKey: ["admin", "birthdays", "base"], queryFn: () => getAdminBirthdays({ days: 30 }), enabled: ready, staleTime: 60_000 });
  const Today = Base.data?.today ?? "";
  const ThisMonth = Today.slice(0, 7);
  const ShownMonth = Month ?? ThisMonth;

  const Range: BirthdayRange = TabValue === "month" ? { month: ShownMonth } : { start: Today ? AddDays(Today, 1) : undefined, days: Span };
  const Listing = useQuery({
    queryKey: ["admin", "birthdays", "list", Range, Filters],
    queryFn: () => getAdminBirthdays(Range, Filters),
    enabled: ready && Boolean(Today) && (TabValue === "upcoming" || TabValue === "month"),
    staleTime: 60_000,
    placeholderData: (Previous) => Previous,
  });
  const ShownSentMonth = SentMonth ?? ThisMonth;
  const Sent = useQuery({
    queryKey: ["admin", "birthdays", "sent", ShownSentMonth, Filters],
    queryFn: () => getBirthdaySent(ShownSentMonth, Filters),
    enabled: ready && Boolean(Today) && TabValue === "sent",
    staleTime: 30_000,
    placeholderData: (Previous) => Previous,
  });
  const Missing = useQuery({ queryKey: ["admin", "birthdays", "missing", Filters], queryFn: () => getAdminMissingDob(Filters), enabled: ready && TabValue === "missing", staleTime: 60_000 });

  const TodayEntries = useMemo(() => (Base.data?.entries ?? []).filter((Entry) => Entry.isToday), [Base.data]);
  const NextEntries = useMemo(() => (Base.data?.entries ?? []).filter((Entry) => !Entry.isToday), [Base.data]);
  const Options = Base.data?.filters;
  const Counts = Base.data?.counts;
  const PickedEntries: BirthdayEntry[] = useMemo(() => (Listing.data?.entries ?? []).filter((Entry) => Entry.date === Picked), [Listing.data, Picked]);
  const Filtered = Boolean(Filters.q?.trim()) || [Filters.teacherId, Filters.levelId, Filters.centreId].some((Value) => Value && Value !== "ALL");

  async function Export() {
    SetExporting(true);
    SetExportError(null);
    try {
      const Blob = await downloadAdminBirthdays(Range, Filters);
      const Name = TabValue === "month" ? `MathPath Birthdays ${ShownMonth}.xlsx` : `MathPath Birthdays Next ${Span} Days.xlsx`;
      saveBlob(Blob, Name);
    } catch (Error) {
      SetExportError(apiErrorMessage(Error));
    } finally {
      SetExporting(false);
    }
  }

  const Set = (Key: keyof BirthdayFilters) => (Value: string) => SetFilters((Current) => ({ ...Current, [Key]: Value }));

  if (!ready) return null;
  return (
    <AppShell title="Birthdays">
      <section className="math-hero math-slide-up">
        <div className="ad-hero-stack relative z-10">
          <div>
            <p className="math-block-header"><Cake size={14} />Student Birthdays</p>
            <h1 className="math-title">Birthdays</h1>
            <p className="math-subtitle">
              Every active student&apos;s birthday: who celebrates today, the weeks ahead, and whether each student&apos;s birthday wish has gone out.
            </p>
          </div>
          <div className="ad-hero-tiles">
            <Metric label="Today" value={Counts ? Counts.today : "—"} icon={<PartyPopper size={18} />} />
            <Metric label="Next 7 Days" value={Counts ? Counts.thisWeek : "—"} icon={<CalendarRange size={18} />} />
            <Metric label="This Month" value={Counts ? Counts.thisMonth : "—"} icon={<CalendarDays size={18} />} />
            <Metric label="Missing Date Of Birth" value={Counts ? Counts.missingDob : "—"} icon={<AlertTriangle size={18} />} onClick={() => SetTab("missing")} />
          </div>
        </div>
      </section>

      {Base.isLoading ? <div className="mt-6"><LoadingState label="Loading birthdays" /></div> : null}
      {Base.error ? <div className="mt-6"><ErrorState message={apiErrorMessage(Base.error)} /></div> : null}

      {Base.data ? (
        <>
          <div className="mt-6">
            <TodayPanel entries={TodayEntries} today={Today} sendTime={Base.data.sendTime} next={NextEntries} profileHref={profileHref} />
          </div>

          <section className="mt-6 math-card p-5 sm:p-6">
            <div className="flex flex-col gap-4">
              <div role="tablist" aria-label="Birthday views" className="flex min-w-0 flex-wrap gap-2">
                {([
                  ["upcoming", "Coming Up", <Sparkles key="i" size={16} />],
                  ["month", "Month", <CalendarDays key="i" size={16} />],
                  ["sent", "Sent", <Send key="i" size={16} />],
                  ["wishes", "Wishes", <MessageSquareHeart key="i" size={16} />],
                  ["missing", `Missing Date Of Birth${Counts ? ` (${Counts.missingDob})` : ""}`, <AlertTriangle key="i" size={16} />],
                ] as [Tab, string, ReactNode][]).map(([Key, Label, Icon]) => (
                  <button
                    key={Key}
                    type="button"
                    role="tab"
                    aria-selected={TabValue === Key}
                    onClick={() => { SetTab(Key); SetPicked(null); }}
                    className={`math-role-tab-button math-admin-tab-force inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-2xl px-4 py-2.5 text-sm font-black transition ${TabValue === Key ? "is-active math-admin-tab-force-selected" : ""}`}
                  >
                    {Icon}{Label}
                  </button>
                ))}
              </div>

              {TabValue !== "wishes" ? (
              <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_170px_170px]">
                <div className="relative sm:col-span-2 xl:col-span-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input className="math-input pl-11" value={Filters.q ?? ""} onChange={(Event) => Set("q")(Event.target.value)} placeholder="Search by name or student ID" aria-label="Search students" />
                </div>
                <select className="math-select" value={Filters.teacherId} onChange={(Event) => Set("teacherId")(Event.target.value)} aria-label="Filter by teacher">
                  <option value="ALL">All Teachers</option>
                  <option value="NONE">No Teacher</option>
                  {Options?.teachers.map((Teacher) => <option key={Teacher.id} value={Teacher.id}>{Teacher.name}</option>)}
                </select>
                <select className="math-select" value={Filters.levelId} onChange={(Event) => Set("levelId")(Event.target.value)} aria-label="Filter by level">
                  <option value="ALL">All Levels</option>
                  {Options?.levels.map((Level) => <option key={Level.id} value={Level.id}>{Level.code}</option>)}
                </select>
                <select className="math-select" value={Filters.centreId} onChange={(Event) => Set("centreId")(Event.target.value)} aria-label="Filter by centre">
                  <option value="ALL">All Centres</option>
                  <option value="NONE">No Centre</option>
                  {Options?.centres.map((Centre) => <option key={Centre.id} value={Centre.id}>{Centre.name}</option>)}
                </select>
              </div>
              ) : null}

              {TabValue === "upcoming" || TabValue === "month" ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {TabValue === "upcoming" ? (
                    <div className="flex flex-wrap gap-2" role="group" aria-label="How far ahead">
                      {SPANS.map((Days) => (
                        <button key={Days} type="button" aria-pressed={Span === Days} onClick={() => SetSpan(Days)} className={`ad-bday-span ${Span === Days ? "is-on" : ""}`}>
                          Next {Days} Days
                        </button>
                      ))}
                    </div>
                  ) : <span />}
                  <button type="button" className="math-button-secondary inline-flex items-center gap-2" onClick={Export} disabled={Exporting || !Listing.data?.entries.length}>
                    {Exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Excel
                  </button>
                </div>
              ) : null}
              {ExportError ? <ErrorState message={ExportError} /> : null}
            </div>

            <div className="mt-6">
              {TabValue === "wishes" ? (
                <WishManager />
              ) : TabValue === "sent" ? (
                <div className="grid gap-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="ad-bday-month">{MonthLabel(ShownSentMonth)}<span className="ad-bday-day-count">{Sent.data ? `${Sent.data.entries.length} so far` : ""}</span></h3>
                    <div className="flex items-center gap-2">
                      <button type="button" className="math-role-action-button h-10 w-10 justify-center px-0" onClick={() => SetSentMonth(ShiftMonthFrom(ShownSentMonth, -1))} aria-label="Previous month"><ChevronLeft size={18} /></button>
                      <button type="button" className="math-role-action-button h-10 px-4" onClick={() => SetSentMonth(null)}>This Month</button>
                      <button type="button" className="math-role-action-button h-10 w-10 justify-center px-0" onClick={() => SetSentMonth(ShiftMonthFrom(ShownSentMonth, 1))} disabled={ShownSentMonth >= ThisMonth} aria-label="Next month"><ChevronRight size={18} /></button>
                    </div>
                  </div>
                  <p className="text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                    Every birthday this month up to today: the wish each student got, when it went out and when they opened it. Not Sent means the server wasn&apos;t running that morning, so no wish went out.
                  </p>
                  {Sent.isLoading ? <LoadingState label="Loading" /> : Sent.error ? <ErrorState message={apiErrorMessage(Sent.error)} /> : (
                    <SentList entries={Sent.data?.entries ?? []} sendTime={Base.data.sendTime} profileHref={profileHref} />
                  )}
                </div>
              ) : TabValue === "missing" ? (
                Missing.isLoading ? <LoadingState label="Loading" /> : Missing.error ? <ErrorState message={apiErrorMessage(Missing.error)} /> : (
                  <>
                    <p className="mb-4 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">
                      {Missing.data?.length
                        ? `${Plural(Missing.data.length, "active student")} won't get a birthday wish until their date of birth is fixed. Dates are read as day, month and year (for example 16-11-2016 or 2016-11-16).`
                        : null}
                    </p>
                    <MissingList students={Missing.data ?? []} fixHref={(Student) => `/admin/students?student=${encodeURIComponent(Student.studentCode)}&edit=1`} />
                  </>
                )
              ) : Listing.isLoading ? <LoadingState label="Loading birthdays" /> : Listing.error ? <ErrorState message={apiErrorMessage(Listing.error)} /> : TabValue === "upcoming" ? (
                <UpcomingList
                  entries={Listing.data?.entries ?? []}
                  today={Today}
                  sendTime={Base.data.sendTime}
                  profileHref={profileHref}
                  emptyText={Filtered ? "No birthdays match these filters in this range." : `Nobody has a birthday in the next ${Span} days.`}
                />
              ) : (
                <div className="grid gap-6">
                  <MonthGrid
                    month={ShownMonth}
                    entries={Listing.data?.entries ?? []}
                    today={Today}
                    picked={Picked}
                    onPick={(Iso) => SetPicked(Picked === Iso ? null : Iso)}
                    onShift={(By) => { SetMonth(By === 0 ? null : (Current) => ShiftMonthFrom(Current ?? ThisMonth, By)); SetPicked(null); }}
                  />
                  {Picked ? (
                    <UpcomingList entries={PickedEntries} today={Today} sendTime={Base.data.sendTime} profileHref={profileHref} emptyText="" />
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

function ShiftMonthFrom(Month: string, By: number) {
  const [Year, MonthNumber] = Month.split("-").map(Number);
  const Value = new Date(Year, MonthNumber - 1 + By, 1);
  return `${Value.getFullYear()}-${String(Value.getMonth() + 1).padStart(2, "0")}`;
}

export default function AdminBirthdaysPage() {
  return (
    <Suspense fallback={null}>
      <BirthdaysPage />
    </Suspense>
  );
}
