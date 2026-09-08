"use client";

import { AppShell } from "@/components/common/AppShell";
import Link from "next/link";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  createAnnualCompetitionEvent,
  deleteAnnualCompetitionEvent,
  listAnnualCompetitionEvents,
  updateAnnualCompetitionEvent,
  type AnnualCompetitionEvent,
} from "@/lib/api/admin";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, CheckCircle2, PlusCircle, Pencil, Trash2, Trophy, X } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";

function SectionTitle({ kicker, title, description, icon }: { kicker: string; title: string; description: string; icon?: ReactNode }) {
  return (
    <div>
      <p className="math-block-header">{icon}{kicker}</p>
      <h2 className="text-xl font-black text-slate-950 dark:text-white">{title}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{description}</p>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const StatusValue = String(status || "DRAFT").toUpperCase();
  const ChipClass =
    StatusValue === "COMPLETED"
      ? "bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300"
      : StatusValue === "DRAFT"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
        : StatusValue === "LIVE"
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200"
          : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200";
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${ChipClass}`}>{StatusValue}</span>;
}

function FormatEventDate(Value: string | null) {
  if (!Value) return "Not set";
  try {
    return new Date(Value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return Value;
  }
}

// Mirrors the identically-named helper on the per-event detail page
// ([eventId]/page.tsx) -- converts an ISO string into the value a
// datetime-local input expects, so the edit form can be pre-filled with
// the event's current dates.
function ToLocalInputValue(IsoValue: string | null): string {
  if (!IsoValue) return "";
  const D = new Date(IsoValue);
  if (Number.isNaN(D.getTime())) return "";
  const Pad = (N: number) => String(N).padStart(2, "0");
  return `${D.getFullYear()}-${Pad(D.getMonth() + 1)}-${Pad(D.getDate())}T${Pad(D.getHours())}:${Pad(D.getMinutes())}`;
}

export default function AdminAnnualCompetitionStudioPage() {
  const Ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const QueryClient = useQueryClient();

  const [EventName, SetEventName] = useState("");
  const [CompetitionDateInput, SetCompetitionDateInput] = useState("");
  const [ResultsReleaseInput, SetResultsReleaseInput] = useState("");
  const [LastMessage, SetLastMessage] = useState<string | null>(null);

  const EventsQuery = useQuery({
    queryKey: ["admin", "annual-competition", "events"],
    queryFn: listAnnualCompetitionEvents,
    enabled: Ready,
    placeholderData: keepPreviousData,
  });
  const Events = EventsQuery.data || [];

  const CreateMutation = useMutation({
    mutationFn: () =>
      createAnnualCompetitionEvent({
        name: EventName.trim(),
        competitionDate: new Date(CompetitionDateInput).toISOString(),
        resultsReleaseAt: ResultsReleaseInput ? new Date(ResultsReleaseInput).toISOString() : null,
      }),
    onSuccess: (Created) => {
      SetLastMessage(`"${Created.name}" created.`);
      SetEventName("");
      SetCompetitionDateInput("");
      SetResultsReleaseInput("");
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
  });

  const CanCreate = EventName.trim().length > 0 && Boolean(CompetitionDateInput);

  // --- Event edit form state -- an event's own row switches into this
  // inline form when EditingEventId matches it; the Create form above is
  // untouched. Deliberately scoped to Name/Competition Date/Results Release
  // Date only (what Shailesh asked for -- "edit the dates and everything
  // else related to an event") and not Status: the per-event detail page
  // already has dedicated DRAFT/SCHEDULED/LIVE/COMPLETED buttons for that,
  // so duplicating a status control here would just be a second place for
  // it to go stale against.
  const [EditingEventId, SetEditingEventId] = useState<string | null>(null);
  const [EditEventName, SetEditEventName] = useState("");
  const [EditCompetitionDateInput, SetEditCompetitionDateInput] = useState("");
  const [EditResultsReleaseInput, SetEditResultsReleaseInput] = useState("");

  const StartEditingEvent = (EventItem: AnnualCompetitionEvent) => {
    SetEditingEventId(EventItem.eventId);
    SetEditEventName(EventItem.name);
    SetEditCompetitionDateInput(ToLocalInputValue(EventItem.competitionDate));
    SetEditResultsReleaseInput(ToLocalInputValue(EventItem.resultsReleaseAt));
  };

  const CancelEditingEvent = () => SetEditingEventId(null);

  const UpdateEventMutation = useMutation({
    mutationFn: (EventId: string) =>
      updateAnnualCompetitionEvent(EventId, {
        name: EditEventName.trim(),
        competitionDate: new Date(EditCompetitionDateInput).toISOString(),
        ...(EditResultsReleaseInput
          ? { resultsReleaseAt: new Date(EditResultsReleaseInput).toISOString() }
          : { clearResultsReleaseAt: true }),
      }),
    onSuccess: (Updated) => {
      SetLastMessage(`"${Updated.name}" updated.`);
      SetEditingEventId(null);
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
  });

  // Hard delete (CompetitionEvent has no isActive flag to soft-delete with,
  // unlike slots) -- the backend rejects this once the event has a real
  // attempt or a locked results-release date, so this is only ever
  // reachable for a still-rough-draft event. Confirmed before deleting,
  // same as this page's other consequential actions.
  const DeleteEventMutation = useMutation({
    mutationFn: (EventId: string) => deleteAnnualCompetitionEvent(EventId),
    onSuccess: () => {
      SetLastMessage("Event deleted.");
      QueryClient.invalidateQueries({ queryKey: ["admin", "annual-competition", "events"] });
    },
  });

  if (!Ready) return null;
  if (EventsQuery.isLoading) {
    return (
      <AppShell title="Annual Competition Studio">
        <LoadingState label="Loading Annual Competition Studio..." />
      </AppShell>
    );
  }

  return (
    <AppShell title="Annual Competition Studio">
      <section className="space-y-6">
        <div className="math-card p-6">
          <p className="math-block-header"><Trophy size={14} />Annual Competition</p>
          <h1 className="math-title">Annual Competition Studio</h1>
          <p className="mt-3 max-w-none text-sm font-semibold leading-relaxed text-slate-600 dark:text-slate-300">
            Stand up the real, scheduled Annual Competition event end to end -- slots, each level&apos;s official
            paper, and student assignments -- fully separate from Competition Mock practice. Nothing here affects
            practice mocks; a locked official paper is enforced by the same guard that protects real attempts.
          </p>
        </div>

        {(EventsQuery.error || CreateMutation.error || DeleteEventMutation.error) && (
          <ErrorState message={apiErrorMessage(EventsQuery.error || CreateMutation.error || DeleteEventMutation.error)} />
        )}

        {LastMessage && (
          <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200">
            {LastMessage}
          </div>
        )}

        <div className="math-card p-5">
          <SectionTitle
            icon={<PlusCircle size={14} />}
            kicker="New Event"
            title="Create Annual Competition Event"
            description="One event per real competition date. Results Release Date can be left blank until MathPath confirms it -- setting it later locks every linked level paper."
          />
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200 sm:col-span-2">
              Event Name
              <input
                value={EventName}
                onChange={(EventValue) => SetEventName(EventValue.target.value)}
                placeholder="Example: MathPath Annual Competition 2026"
                className="math-input"
              />
            </label>
            <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
              Competition Date &amp; Time
              <input
                type="datetime-local"
                value={CompetitionDateInput}
                onChange={(EventValue) => SetCompetitionDateInput(EventValue.target.value)}
                className="math-input"
              />
            </label>
            <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
              Results Release Date &amp; Time (optional)
              <input
                type="datetime-local"
                value={ResultsReleaseInput}
                onChange={(EventValue) => SetResultsReleaseInput(EventValue.target.value)}
                className="math-input"
              />
              <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">
                Formal Results &amp; Prize Distribution date, once confirmed. Leave blank for now.
              </span>
            </label>
          </div>
          <div className="mt-5">
            <button
              type="button"
              disabled={!CanCreate || CreateMutation.isPending}
              onClick={() => CreateMutation.mutate()}
              className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
            >
              <PlusCircle size={16} />
              {CreateMutation.isPending ? "Creating..." : "Create Event"}
            </button>
          </div>
        </div>

        <div className="math-card p-5">
          <SectionTitle icon={<CalendarClock size={14} />} kicker="Events" title="Annual Competition Events" description="Open an event to manage its slots, official papers, and assignments." />
          {Events.length === 0 ? (
            <div className="mt-5">
              <EmptyState title="No Annual Competition events yet" description="Create the first one above." />
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {Events.map((EventItem: AnnualCompetitionEvent) =>
                EditingEventId === EventItem.eventId ? (
                  <div key={EventItem.eventId} className="rounded-2xl border border-[color:var(--mp-role-border-strong)] bg-white p-4 dark:bg-slate-950/40">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200 sm:col-span-2">
                        Event Name
                        <input value={EditEventName} onChange={(EventValue) => SetEditEventName(EventValue.target.value)} className="math-input" />
                      </label>
                      <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                        Competition Date &amp; Time
                        <input
                          type="datetime-local"
                          value={EditCompetitionDateInput}
                          onChange={(EventValue) => SetEditCompetitionDateInput(EventValue.target.value)}
                          className="math-input"
                        />
                      </label>
                      <label className="space-y-2 text-sm font-black text-slate-700 dark:text-slate-200">
                        Results Release Date &amp; Time (optional)
                        <input
                          type="datetime-local"
                          value={EditResultsReleaseInput}
                          onChange={(EventValue) => SetEditResultsReleaseInput(EventValue.target.value)}
                          className="math-input"
                        />
                        <span className="block text-xs font-bold text-slate-400 dark:text-slate-500">Leave blank to keep it unset.</span>
                      </label>
                    </div>
                    {UpdateEventMutation.isError && (
                      <p className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-300">{apiErrorMessage(UpdateEventMutation.error)}</p>
                    )}
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={!EditEventName.trim() || !EditCompetitionDateInput || UpdateEventMutation.isPending}
                        onClick={() => UpdateEventMutation.mutate(EventItem.eventId)}
                        className="inline-flex items-center gap-2 rounded-full bg-[image:var(--mp-role-action-bg)] px-5 py-2.5 text-sm font-black text-white shadow-md transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CheckCircle2 size={16} />
                        {UpdateEventMutation.isPending ? "Saving..." : "Save Changes"}
                      </button>
                      <button
                        type="button"
                        onClick={CancelEditingEvent}
                        className="inline-flex items-center gap-2 rounded-full border border-[color:var(--mp-role-border)] bg-white px-5 py-2.5 text-sm font-black text-slate-600 transition hover:-translate-y-px dark:bg-slate-950/40 dark:text-slate-300"
                      >
                        <X size={16} />
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={EventItem.eventId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--mp-role-border)] bg-white px-5 py-4 shadow-sm transition hover:-translate-y-px hover:shadow-md dark:bg-slate-950/40"
                  >
                    <Link href={`/admin/competition/annual-studio/${EventItem.eventId}`} className="min-w-0 flex-1">
                      <p className="text-base font-black text-slate-950 dark:text-white">{EventItem.name}</p>
                      <p className="mt-1 text-xs font-bold text-slate-500 dark:text-slate-400">
                        {FormatEventDate(EventItem.competitionDate)}
                      </p>
                    </Link>
                    <div className="flex items-center gap-3">
                      <StatusChip status={EventItem.status} />
                      <button
                        type="button"
                        title="Edit event"
                        aria-label="Edit event"
                        onClick={(ClickEvent) => {
                          ClickEvent.preventDefault();
                          StartEditingEvent(EventItem);
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[color:var(--mp-role-border)] text-slate-500 transition hover:-translate-y-px hover:border-[color:var(--mp-role-border-strong)] hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button"
                        title="Delete event"
                        aria-label="Delete event"
                        disabled={DeleteEventMutation.isPending}
                        onClick={(ClickEvent) => {
                          ClickEvent.preventDefault();
                          if (
                            window.confirm(
                              `Delete "${EventItem.name}"? This removes the event and all of its slots, papers, and assignments. It can only be deleted while no student has a real attempt yet and results haven't been released. This can't be undone.`
                            )
                          ) {
                            DeleteEventMutation.mutate(EventItem.eventId);
                          }
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-rose-300 text-rose-600 transition hover:-translate-y-px hover:border-rose-600 hover:bg-rose-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-700/70 dark:text-rose-300"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </section>
    </AppShell>
  );
}
