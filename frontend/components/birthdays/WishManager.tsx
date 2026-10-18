"use client";

// 2026-10-18 (Birthdays, Part 3): the wish set, for admins. Every wish with
// who it is for and how often it has been used; add, edit and switch off.
// Editing a wish never changes a greeting a student has already read. The
// server refuses to leave any age group with fewer than 10 wishes.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PencilLine, Plus, Search } from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PaymentsDialog } from "@/components/payments/PaymentsUi";
import { apiErrorMessage } from "@/lib/api";
import { createBirthdayWish, getBirthdayWishes, updateBirthdayWish, type BirthdayWish, type WishBand, type WishStyle } from "@/lib/api/birthday";
import { Plural } from "@/lib/plural";

export const STYLE_LABELS: Record<WishStyle, string> = { WARM: "Warm", PLAYFUL: "Playful", PROUD: "Proud Of Their Progress", MATHS: "A Little Maths", SHORT: "Short" };
export const BAND_LABELS: Record<WishBand, string> = { ALL: "Any Age", YOUNG: "Ages 3–8", MIDDLE: "Ages 9–12", OLDER: "Ages 13+" };
const STYLES = Object.keys(STYLE_LABELS) as WishStyle[];
const BANDS = Object.keys(BAND_LABELS) as WishBand[];
const SAMPLES = [
  { name: "Aarav", age: 7, level: "MM-L1" },
  { name: "Diya", age: 11, level: "IM-L2" },
  { name: "Kabir", age: 14, level: "PM-L3" },
];

function Fill(Text: string, Sample: { name: string; age: number; level: string }) {
  return Text.replaceAll("{name}", Sample.name).replaceAll("{age}", String(Sample.age)).replaceAll("{level}", Sample.level);
}

/** What's wrong with a draft, checked as the admin types (the server checks again). */
function DraftProblem(Text: string): string | null {
  const Unknown = Array.from(new Set(Text.match(/\{[^{}]*\}/g) ?? [])).filter((Token) => !["{name}", "{age}", "{level}"].includes(Token));
  if (Unknown.length) return `${Unknown.join(", ")} isn't something the wish can fill in. Use the buttons to add a first name, new age or level.`;
  const Rest = Text.replace(/\{(name|age|level)\}/g, "");
  if (Rest.includes("{") || Rest.includes("}")) return "A curly bracket is left open. Use the buttons to add a first name, new age or level.";
  return null;
}

function Marked({ text }: { text: string }) {
  const Parts = text.split(/(\{name\}|\{age\}|\{level\})/g);
  return (
    <>
      {Parts.map((Part, Index) => (/^\{(name|age|level)\}$/.test(Part) ? <span key={Index} className="ad-bday-ph">{Part}</span> : <span key={Index}>{Part}</span>))}
    </>
  );
}

function UsedLine({ wish }: { wish: BirthdayWish }) {
  if (!wish.uses) return <span>Not used yet</span>;
  const Last = wish.lastUsed ? new Date(`${wish.lastUsed}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "";
  return <span>Used {wish.uses === 1 ? "once" : `${wish.uses} times`}{Last ? ` · last ${Last}` : ""}</span>;
}

type Draft = { id: string | null; text: string; style: WishStyle; ageBand: WishBand };

export function WishManager() {
  const Client = useQueryClient();
  const Query = useQuery({ queryKey: ["admin", "birthdays", "wishes"], queryFn: getBirthdayWishes, staleTime: 30_000 });
  const [StyleFilter, SetStyleFilter] = useState<WishStyle | "ALL">("ALL");
  const [BandFilter, SetBandFilter] = useState<WishBand | "ANY">("ANY");
  const [Search_, SetSearch] = useState("");
  const [ShowOff, SetShowOff] = useState(true);
  const [Editing, SetEditing] = useState<Draft | null>(null);
  const [RowError, SetRowError] = useState<{ id: string; message: string } | null>(null);
  const TextRef = useRef<HTMLTextAreaElement | null>(null);
  // where the cursor was in the wish, so Insert puts a name or age there
  const CaretRef = useRef<[number, number] | null>(null);
  // after an insert, put the cursor just after it (before the next key press)
  const PendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (PendingCaret.current === null || !TextRef.current) return;
    const At = PendingCaret.current;
    PendingCaret.current = null;
    TextRef.current.focus();
    TextRef.current.setSelectionRange(At, At);
  });

  const Save = useMutation({
    mutationFn: (Item: Draft) => (Item.id ? updateBirthdayWish(Item.id, { text: Item.text, style: Item.style, ageBand: Item.ageBand }) : createBirthdayWish({ text: Item.text, style: Item.style, ageBand: Item.ageBand })),
    onSuccess: (Data) => {
      Client.setQueryData(["admin", "birthdays", "wishes"], Data);
      SetEditing(null);
    },
  });
  const Toggle = useMutation({
    mutationFn: (Wish: BirthdayWish) => updateBirthdayWish(Wish.id, { isActive: !Wish.isActive }),
    onMutate: () => SetRowError(null),
    onSuccess: (Data) => Client.setQueryData(["admin", "birthdays", "wishes"], Data),
    onError: (Error, Wish) => SetRowError({ id: Wish.id, message: apiErrorMessage(Error).replace(/ \([A-Z_]+\)$/, "") }),
  });

  // A steady close handler: the dialog puts focus on its first control
  // whenever this changes, which would pull the cursor out of the wish
  // while typing.
  const SavePending = Save.isPending;
  const CloseEditor = useCallback(() => {
    if (!SavePending) SetEditing(null);
  }, [SavePending]);

  const Wishes = Query.data?.wishes ?? [];
  const Shown = useMemo(() => {
    const Term = Search_.trim().toLowerCase();
    return Wishes.filter((Wish) =>
      (StyleFilter === "ALL" || Wish.style === StyleFilter) &&
      (BandFilter === "ANY" || Wish.ageBand === BandFilter) &&
      (ShowOff || Wish.isActive) &&
      (!Term || Wish.text.toLowerCase().includes(Term)),
    );
  }, [Wishes, StyleFilter, BandFilter, ShowOff, Search_]);

  if (Query.isLoading) return <LoadingState label="Loading wishes" />;
  if (Query.error) return <ErrorState message={apiErrorMessage(Query.error)} />;
  const Data = Query.data!;
  const Problem = Editing ? DraftProblem(Editing.text) : null;
  const OnCount = Wishes.filter((Wish) => Wish.isActive).length;

  function Insert(Token: string) {
    if (!Editing) return;
    const Text = Editing.text;
    const [Start, End] = CaretRef.current ?? [Text.length, Text.length];
    const Before = Text.slice(0, Start);
    const Gap = Before && !/\s$/.test(Before) ? " " : "";
    const Next = Before + Gap + Token + Text.slice(End);
    const At = Start + Gap.length + Token.length;
    CaretRef.current = [At, At];
    PendingCaret.current = At;
    SetEditing({ ...Editing, text: Next });
  }

  const KeepCaret = (Box: HTMLTextAreaElement) => {
    CaretRef.current = [Box.selectionStart ?? Box.value.length, Box.selectionEnd ?? Box.value.length];
  };

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            {Plural(Wishes.length, "wish", "wishes")}, {OnCount} switched on. Ages 3–8 can get {Data.activeByAge.YOUNG}, ages 9–12 {Data.activeByAge.MIDDLE}, ages 13+ {Data.activeByAge.OLDER}.
          </p>
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            Each age group always keeps at least {Data.minimumPerAge}. Editing a wish doesn&apos;t change a greeting a student has already read.
          </p>
        </div>
        <button type="button" className="math-button-primary inline-flex items-center gap-2" onClick={() => { Save.reset(); CaretRef.current = null; SetEditing({ id: null, text: "", style: "WARM", ageBand: "ALL" }); }}>
          <Plus size={17} />Add A Wish
        </button>
      </div>

      <div className="grid w-full gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_170px_auto]">
        <div className="relative sm:col-span-2 xl:col-span-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="math-input pl-11" value={Search_} onChange={(Event) => SetSearch(Event.target.value)} placeholder="Search the wishes" aria-label="Search the wishes" />
        </div>
        <select className="math-select" value={StyleFilter} onChange={(Event) => SetStyleFilter(Event.target.value as WishStyle | "ALL")} aria-label="Filter by style">
          <option value="ALL">Every Style</option>
          {STYLES.map((Style) => <option key={Style} value={Style}>{STYLE_LABELS[Style]}</option>)}
        </select>
        <select className="math-select" value={BandFilter} onChange={(Event) => SetBandFilter(Event.target.value as WishBand | "ANY")} aria-label="Filter by age">
          <option value="ANY">Every Age</option>
          {BANDS.map((Band) => <option key={Band} value={Band}>{BAND_LABELS[Band]}</option>)}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
          <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={ShowOff} onChange={(Event) => SetShowOff(Event.target.checked)} />
          Show Switched Off
        </label>
      </div>

      {Shown.length ? (
        <ul className="ad-bday-wishes">
          {Shown.map((Wish) => (
            <li key={Wish.id} className={`ad-bday-wish-row ${Wish.isActive ? "" : "is-off"}`}>
              <div className="min-w-0">
                <p className="ad-bday-wish-text"><Marked text={Wish.text} /></p>
                <p className="ad-bday-wish-meta">
                  <span className="ad-bday-tag">{STYLE_LABELS[Wish.style]}</span>
                  <span className="ad-bday-tag">{BAND_LABELS[Wish.ageBand]}</span>
                  {Wish.needsLevel ? <span className="ad-bday-tag is-level">Uses Level</span> : null}
                  {!Wish.isStarter ? <span className="ad-bday-tag is-new">Added</span> : null}
                  <span className="ad-bday-used"><UsedLine wish={Wish} /></span>
                </p>
                {RowError?.id === Wish.id ? <p className="mt-2 text-sm font-bold text-rose-700 dark:text-rose-300">{RowError.message}</p> : null}
              </div>
              <div className="ad-bday-wish-actions">
                <button
                  type="button"
                  role="switch"
                  aria-checked={Wish.isActive}
                  aria-label={Wish.isActive ? "Switch this wish off" : "Switch this wish on"}
                  className={`ad-bday-switch ${Wish.isActive ? "is-on" : ""}`}
                  disabled={Toggle.isPending && Toggle.variables?.id === Wish.id}
                  onClick={() => Toggle.mutate(Wish)}
                >
                  <span />
                </button>
                <button type="button" className="math-role-action-button h-9 px-3 text-xs" onClick={() => { Save.reset(); CaretRef.current = null; SetEditing({ id: Wish.id, text: Wish.text, style: Wish.style, ageBand: Wish.ageBand }); }}>
                  <PencilLine size={13} />Edit
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">No wishes match these filters.</p>
      )}

      <PaymentsDialog
        open={Boolean(Editing)}
        wide
        kicker="Birthday Wish"
        title={Editing?.id ? "Edit Wish" : "Add A Wish"}
        onClose={CloseEditor}
        footer={
          <>
            <button type="button" className="math-button-secondary" onClick={() => SetEditing(null)} disabled={Save.isPending}>Cancel</button>
            <button type="button" className="math-button-primary inline-flex items-center gap-2" disabled={Save.isPending || !Editing?.text.trim() || Boolean(Problem)} onClick={() => Editing && Save.mutate(Editing)}>
              {Save.isPending ? <Loader2 size={16} className="animate-spin" /> : null}{Editing?.id ? "Save Wish" : "Add Wish"}
            </button>
          </>
        }
      >
        {Editing ? (
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-black text-slate-800 dark:text-slate-100">The Wish</span>
              <textarea
                ref={TextRef}
                id="birthday-wish-text"
                className="math-input min-h-[110px] resize-y leading-6"
                maxLength={280}
                value={Editing.text}
                onChange={(Event) => { KeepCaret(Event.target); SetEditing({ ...Editing, text: Event.target.value }); }}
                onSelect={(Event) => KeepCaret(Event.currentTarget)}
                onKeyUp={(Event) => KeepCaret(Event.currentTarget)}
                onClick={(Event) => KeepCaret(Event.currentTarget)}
                placeholder="For example: Wishing you a wonderful day, {name}!"
              />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-slate-600 dark:text-slate-300">Insert:</span>
                {["{name}", "{age}", "{level}"].map((Token) => (
                  <button
                    key={Token}
                    type="button"
                    className="inline-flex h-8 items-center rounded-full border border-slate-200 bg-white px-3 text-xs font-black text-blue-700 transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-300 dark:hover:bg-slate-800"
                    onMouseDown={(Event) => Event.preventDefault()}
                    onClick={() => Insert(Token)}
                  >
                    {Token === "{name}" ? "First Name" : Token === "{age}" ? "New Age" : "Level"}
                  </button>
                ))}
              </div>
              <span className="text-xs font-bold tabular-nums text-slate-500">{Editing.text.length} / 280</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-black text-slate-800 dark:text-slate-100">Style</span>
                <select className="math-select" value={Editing.style} onChange={(Event) => SetEditing({ ...Editing, style: Event.target.value as WishStyle })}>
                  {STYLES.map((Style) => <option key={Style} value={Style}>{STYLE_LABELS[Style]}</option>)}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-black text-slate-800 dark:text-slate-100">For</span>
                <select className="math-select" value={Editing.ageBand} onChange={(Event) => SetEditing({ ...Editing, ageBand: Event.target.value as WishBand })}>
                  {BANDS.map((Band) => <option key={Band} value={Band}>{BAND_LABELS[Band]}</option>)}
                </select>
              </label>
            </div>
            {Editing.text.includes("{level}") ? (
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">A wish that names the level only goes to students who have a current level.</p>
            ) : null}
            <div className="grid gap-2">
              <span className="text-sm font-black text-slate-800 dark:text-slate-100">How Students Will Read It</span>
              {Editing.text.trim() ? (
                <ul className="grid gap-2">
                  {SAMPLES.map((Sample) => (
                    <li key={Sample.name} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold leading-6 text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                      <span className="block text-xs font-black text-slate-500 dark:text-slate-400">{Sample.name}, turning {Sample.age}{Editing.text.includes("{level}") ? `, ${Sample.level}` : ""}</span>
                      {Fill(" ".concat(Editing.text).trim(), Sample)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm font-semibold text-slate-500">Write the wish to see it here.</p>
              )}
            </div>
            {Problem ? <p className="text-sm font-bold text-rose-700 dark:text-rose-300" role="alert">{Problem}</p> : null}
            {Save.error && !Problem ? <p className="text-sm font-bold text-rose-700 dark:text-rose-300" role="alert">{apiErrorMessage(Save.error).replace(/ \([A-Z_]+\)$/, "")}</p> : null}
          </div>
        ) : null}
      </PaymentsDialog>
    </div>
  );
}
