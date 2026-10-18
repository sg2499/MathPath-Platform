"use client";

// 2026-10-18 (Birthdays): the pieces of the staff Birthdays page, shared by
// the admin page (Part 2) and the teacher page (Part 4).

import { AlertTriangle, Cake, CheckCheck, ChevronLeft, ChevronRight, Clock3, PencilLine, Send, XCircle } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/common/EmptyState";
import { ProfileAvatar } from "@/components/common/ProfileAvatar";
import type { BirthdayEntry, BirthdayStatus, MissingDobStudent } from "@/lib/api/birthday";
import { Plural } from "@/lib/plural";

// ---------- dates (all "YYYY-MM-DD", India dates from the server) -----------

export function DayOf(Iso: string): Date {
  const [Year, Month, Day] = Iso.split("-").map(Number);
  return new Date(Year, Month - 1, Day);
}

export function IsoOf(Value: Date): string {
  const Month = String(Value.getMonth() + 1).padStart(2, "0");
  const Day = String(Value.getDate()).padStart(2, "0");
  return `${Value.getFullYear()}-${Month}-${Day}`;
}

export function AddDays(Iso: string, Days: number): string {
  const Value = DayOf(Iso);
  Value.setDate(Value.getDate() + Days);
  return IsoOf(Value);
}

export function DayLabel(Iso: string, Today: string, Long = false): string {
  const Value = DayOf(Iso);
  const Named = Value.toLocaleDateString("en-IN", Long ? { weekday: "long", day: "numeric", month: "long" } : { weekday: "short", day: "numeric", month: "short" });
  if (Iso === Today) return `Today · ${Named}`;
  if (Iso === AddDays(Today, 1)) return `Tomorrow · ${Named}`;
  return Named;
}

export function MonthLabel(Month: string): string {
  return DayOf(`${Month}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function ShiftMonth(Month: string, By: number): string {
  const Value = DayOf(`${Month}-01`);
  Value.setMonth(Value.getMonth() + By);
  return IsoOf(Value).slice(0, 7);
}

// ---------- small pieces -------------------------------------------------------

const STATUS: Record<BirthdayStatus, { label: string; tone: string; icon: ReactNode }> = {
  SEEN: { label: "Seen", tone: "ad-bday-status is-seen", icon: <CheckCheck size={13} /> },
  SENT: { label: "Sent", tone: "ad-bday-status is-sent", icon: <Send size={13} /> },
  WAITING: { label: "Sending Soon", tone: "ad-bday-status is-waiting", icon: <Clock3 size={13} /> },
  SCHEDULED: { label: "Scheduled", tone: "ad-bday-status is-scheduled", icon: <Clock3 size={13} /> },
  NOT_SENT: { label: "Not Sent", tone: "ad-bday-status is-missed", icon: <XCircle size={13} /> },
};

export function SendTimeLabel(Time: string): string {
  const [Hour, Minute] = Time.split(":").map(Number);
  if (Number.isNaN(Hour)) return Time;
  return `${((Hour + 11) % 12) + 1}:${String(Minute || 0).padStart(2, "0")} ${Hour < 12 ? "AM" : "PM"}`;
}

export function StatusChip({ entry, sendTime }: { entry: BirthdayEntry; sendTime: string }) {
  const Item = STATUS[entry.status];
  const Label = entry.status === "SCHEDULED" && entry.isToday ? `Sends At ${SendTimeLabel(sendTime)}` : Item.label;
  return (
    <span className={Item.tone} title={entry.status === "NOT_SENT" ? "No wish went out that day (the server was not running at the time)." : undefined}>
      {Item.icon}
      {Label}
    </span>
  );
}

export function PersonCell({ person, href }: { person: { name: string; studentCode: string; photoUrl: string | null; isDemo?: boolean }; href?: string }) {
  const Name = href ? (
    <Link href={href} className="ad-bday-name hover:underline">{person.name}</Link>
  ) : (
    <span className="ad-bday-name">{person.name}</span>
  );
  return (
    <span className="flex min-w-0 items-center gap-3">
      <ProfileAvatar name={person.name} imageUrl={person.photoUrl} role="STUDENT" className="h-10 w-10 text-xs" />
      <span className="min-w-0">
        <span className="block truncate">{Name}</span>
        <span className="ad-bday-code">{person.studentCode}{person.isDemo ? " · Demo" : ""}</span>
      </span>
    </span>
  );
}

function Facts({ entry, hideTeacher = false }: { entry: BirthdayEntry; hideTeacher?: boolean }) {
  const Parts = [entry.levelCode, hideTeacher ? null : entry.teacherName, entry.centreName].filter(Boolean);
  return Parts.length ? <span className="ad-bday-facts">{Parts.join(" · ")}</span> : null;
}

// ---------- Today ----------------------------------------------------------------

export function TodayPanel({
  entries,
  today,
  sendTime,
  next,
  profileHref,
  hideTeacher = false,
}: {
  entries: BirthdayEntry[];
  today: string;
  sendTime: string;
  next: BirthdayEntry[];
  profileHref: (Entry: BirthdayEntry) => string | undefined;
  hideTeacher?: boolean;
}) {
  return (
    <section className="math-card p-5 sm:p-6">
      <div className="mp-headbar">
        <div className="mp-headbar-head min-w-0">
          <p className="math-block-header"><Cake size={14} />Today</p>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">{DayLabel(today, "", true)}</h2>
        </div>
        <p className="mp-headbar-desc text-sm leading-6 text-slate-600 dark:text-slate-300">
          Each student gets their birthday wish in the app at {SendTimeLabel(sendTime)} India time, and sees a birthday card when they open their dashboard.
        </p>
      </div>
      {entries.length ? (
        <ul className="ad-bday-today mt-5">
          {entries.map((Entry) => (
            <li key={Entry.studentId} className="ad-bday-today-card">
              <div className="flex min-w-0 items-start justify-between gap-3">
                <PersonCell person={Entry} href={profileHref(Entry)} />
                <span className="ad-bday-turns">Turns {Entry.age}</span>
              </div>
              <Facts entry={Entry} hideTeacher={hideTeacher} />
              {Entry.wish ? <p className="ad-bday-wish">“{Entry.wish}”</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip entry={Entry} sendTime={sendTime} />
                {Entry.seenAt ? <span className="ad-bday-when">Opened {TimeOf(Entry.seenAt)}</span> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5"><EmptyState title="No Birthdays Today" message={next.length
              ? `The next is ${DayLabel(next[0].date, today)}: ${next.filter((Entry) => Entry.date === next[0].date).map((Entry) => Entry.name).join(", ")}.`
              : "Nobody has a birthday in the next 30 days."} /></div>
      )}
    </section>
  );
}

// ---------- Coming up (grouped by day) --------------------------------------------

export function UpcomingList({
  entries,
  today,
  sendTime,
  profileHref,
  emptyText,
  hideTeacher = false,
}: {
  entries: BirthdayEntry[];
  today: string;
  sendTime: string;
  profileHref: (Entry: BirthdayEntry) => string | undefined;
  emptyText: string;
  hideTeacher?: boolean;
}) {
  if (!entries.length) {
    return (
      <EmptyState title="No Birthdays In This Range" message={emptyText} />
    );
  }
  const Days: { date: string; rows: BirthdayEntry[] }[] = [];
  for (const Entry of entries) {
    const Last = Days[Days.length - 1];
    if (Last && Last.date === Entry.date) Last.rows.push(Entry);
    else Days.push({ date: Entry.date, rows: [Entry] });
  }
  return (
    <div className="grid gap-6">
      {Days.map((Group) => (
        <div key={Group.date} className="grid gap-3">
          <h3 className="ad-bday-day">
            {DayLabel(Group.date, today)}
            <span className="ad-bday-day-count">{Plural(Group.rows.length, "Birthday")}</span>
          </h3>
          <div className="overflow-x-auto">
            <table className="ad-cards te-cards w-full table-fixed text-left text-sm">
              {/* the same columns on every day, so the days line up */}
              <colgroup>
                <col className={hideTeacher ? "w-[40%]" : "w-[34%]"} />
                <col className={hideTeacher ? "w-[10%]" : "w-[8%]"} />
                <col className={hideTeacher ? "w-[15%]" : "w-[11%]"} />
                {hideTeacher ? null : <col className="w-[19%]" />}
                <col className={hideTeacher ? "w-[17%]" : "w-[13%]"} />
                <col className={hideTeacher ? "w-[18%]" : "w-[15%]"} />
              </colgroup>
              <thead>
                <tr>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Turns</th>
                  <th className="px-3 py-2">Level</th>
                  {hideTeacher ? null : <th className="px-3 py-2">Teacher</th>}
                  <th className="px-3 py-2">Centre</th>
                  <th className="px-3 py-2">Wish</th>
                </tr>
              </thead>
              <tbody>
                {Group.rows.map((Entry) => (
                  <tr key={`${Entry.studentId}-${Entry.date}`} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="ad-card-title te-card-title px-3 py-3"><PersonCell person={Entry} href={profileHref(Entry)} /></td>
                    <td data-label="Turns" className="px-3 py-3 font-black tabular-nums">{Entry.age}</td>
                    <td data-label="Level" className="px-3 py-3 font-bold">{Entry.levelCode ?? "—"}</td>
                    {hideTeacher ? null : <td data-label="Teacher" className="px-3 py-3 font-semibold">{Entry.teacherName ?? "—"}</td>}
                    <td data-label="Centre" className="px-3 py-3 font-semibold">{Entry.centreName ?? "—"}</td>
                    <td data-label="Wish" className="px-3 py-3"><StatusChip entry={Entry} sendTime={sendTime} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Month -------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function MonthGrid({
  month,
  entries,
  today,
  picked,
  onPick,
  onShift,
}: {
  month: string;
  entries: BirthdayEntry[];
  today: string;
  picked: string | null;
  onPick: (Iso: string) => void;
  onShift: (By: number) => void;
}) {
  const First = DayOf(`${month}-01`);
  const Lead = (First.getDay() + 6) % 7; // Monday first
  const DaysInMonth = new Date(First.getFullYear(), First.getMonth() + 1, 0).getDate();
  const ByDay = new Map<string, BirthdayEntry[]>();
  for (const Entry of entries) ByDay.set(Entry.date, [...(ByDay.get(Entry.date) ?? []), Entry]);
  const Cells: (string | null)[] = [...Array(Lead).fill(null), ...Array.from({ length: DaysInMonth }, (_, Index) => `${month}-${String(Index + 1).padStart(2, "0")}`)];
  while (Cells.length % 7) Cells.push(null);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="ad-bday-month">{MonthLabel(month)}<span className="ad-bday-day-count">{Plural(entries.length, "Birthday")}</span></h3>
        <div className="flex items-center gap-2">
          <button type="button" className="math-role-action-button h-10 w-10 justify-center px-0" onClick={() => onShift(-1)} aria-label="Previous month"><ChevronLeft size={18} /></button>
          <button type="button" className="math-role-action-button h-10 px-4" onClick={() => onShift(0)}>This Month</button>
          <button type="button" className="math-role-action-button h-10 w-10 justify-center px-0" onClick={() => onShift(1)} aria-label="Next month"><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className="ad-bday-grid" role="grid" aria-label={`Birthdays in ${MonthLabel(month)}`}>
        {WEEKDAYS.map((Name) => <div key={Name} className="ad-bday-weekday" role="columnheader">{Name}</div>)}
        {Cells.map((Iso, Index) => {
          if (!Iso) return <div key={`blank-${Index}`} className="ad-bday-cell is-blank" aria-hidden="true" />;
          const People = ByDay.get(Iso) ?? [];
          const Classes = ["ad-bday-cell", People.length ? "has-people" : "", Iso === today ? "is-today" : "", Iso === picked ? "is-picked" : ""].join(" ");
          return (
            <button
              key={Iso}
              type="button"
              role="gridcell"
              className={Classes}
              onClick={() => onPick(Iso)}
              disabled={!People.length}
              aria-label={`${DayOf(Iso).toLocaleDateString("en-IN", { day: "numeric", month: "long" })}: ${People.length ? Plural(People.length, "birthday") : "no birthdays"}`}
              aria-pressed={Iso === picked}
            >
              <span className="ad-bday-date">{Number(Iso.slice(8))}</span>
              {People.length ? (
                <>
                  <span className="ad-bday-cell-names">
                    {People.slice(0, 2).map((Person) => <span key={Person.studentId}>{Person.name.split(" ")[0]}</span>)}
                    {People.length > 2 ? <span className="ad-bday-more">+{People.length - 2} More</span> : null}
                  </span>
                  <span className="ad-bday-cell-count">{People.length}</span>
                </>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Missing date of birth ---------------------------------------------------

const PROBLEM: Record<MissingDobStudent["problem"], string> = {
  MISSING: "No Date Of Birth",
  UNREADABLE: "Can't Be Read",
  UNLIKELY: "Looks Wrong",
};

export function MissingList({ students, fixHref }: { students: MissingDobStudent[]; fixHref?: (Student: MissingDobStudent) => string }) {
  if (!students.length) {
    return (
      <EmptyState title="Every Date Of Birth Is In Order" message={'Every active student has a date of birth that can be read, so nobody will miss their birthday.'} />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="ad-cards te-cards w-full text-left text-sm">
        <thead>
          <tr>
            <th className="px-3 py-2">Student</th>
            <th className="px-3 py-2">Teacher</th>
            <th className="px-3 py-2">Level</th>
            <th className="px-3 py-2">On Record</th>
            <th className="px-3 py-2">Problem</th>
            {fixHref ? <th className="px-3 py-2"><span className="sr-only">Fix</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {students.map((Student) => (
            <tr key={Student.studentId} className="border-t border-slate-100 dark:border-slate-800">
              <td className="ad-card-title te-card-title px-3 py-3"><PersonCell person={Student} /></td>
              <td data-label="Teacher" className="px-3 py-3 font-semibold">{Student.teacherName ?? "—"}</td>
              <td data-label="Level" className="px-3 py-3 font-bold">{Student.levelCode ?? "—"}</td>
              <td data-label="On Record" className="px-3 py-3 font-semibold tabular-nums">{Student.dob ?? "—"}</td>
              <td data-label="Problem" className="px-3 py-3">
                <span className="ad-bday-status is-missed"><AlertTriangle size={13} />{PROBLEM[Student.problem]}</span>
              </td>
              {fixHref ? (
                <td className="ad-card-wide te-card-wide px-3 py-3 text-right">
                  <Link href={fixHref(Student)} className="math-role-action-button h-9 px-3 text-xs"><PencilLine size={13} />Fix Date Of Birth</Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Sent log (admin, Part 3) -------------------------------------------------

export function TimeOf(Iso: string | null) {
  return Iso ? new Date(Iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).replace(/\b(am|pm)\b/, (Part) => Part.toUpperCase()) : null;
}

export function SentList({ entries, sendTime, profileHref }: { entries: BirthdayEntry[]; sendTime: string; profileHref: (Entry: BirthdayEntry) => string | undefined }) {
  if (!entries.length) return <EmptyState title="Nothing Sent This Month Yet" message="Wishes appear here from each student's birthday onwards." />;
  return (
    <div className="overflow-x-auto">
      <table className="ad-cards te-cards w-full table-fixed text-left text-sm">
        <colgroup>
          <col className="w-[12%]" />
          <col className="w-[26%]" />
          <col className="w-[7%]" />
          <col className="w-[37%]" />
          <col className="w-[18%]" />
        </colgroup>
        <thead>
          <tr>
            <th className="px-3 py-2">Date</th>
            <th className="px-3 py-2">Student</th>
            <th className="px-3 py-2">Turns</th>
            <th className="px-3 py-2">Wish</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((Entry) => (
            <tr key={`${Entry.studentId}-${Entry.date}`} className="border-t border-slate-100 align-top dark:border-slate-800">
              <td data-label="Date" className="px-3 py-3 font-bold tabular-nums">{DayOf(Entry.date).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</td>
              <td className="ad-card-title te-card-title px-3 py-3"><PersonCell person={Entry} href={profileHref(Entry)} /></td>
              <td data-label="Turns" className="px-3 py-3 font-black tabular-nums">{Entry.age}</td>
              <td data-label="Wish" className="ad-card-wide te-card-wide px-3 py-3 font-semibold leading-6">{Entry.wish ?? "—"}</td>
              <td data-label="Status" className="px-3 py-3">
                <span className="grid justify-items-start gap-1">
                  <StatusChip entry={Entry} sendTime={sendTime} />
                  {Entry.sentAt ? <span className="ad-bday-when">Sent {TimeOf(Entry.sentAt)}</span> : null}
                  {Entry.seenAt ? <span className="ad-bday-when">Opened {TimeOf(Entry.seenAt)}</span> : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
