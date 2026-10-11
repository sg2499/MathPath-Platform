"use client";

// The review shown once a paper is submitted -- practice sheets, mocks, level
// assessments and the Annual Competition, for the student, the teacher and the
// admin alike (2026-10-11, Shailesh). Two tabs:
//
//   Answer Sheet -- one block per section. A block opens to that section's
//                   questions, one block at a time, so a 100-question paper
//                   is never one endless page.
//   Scorecard    -- a section-wise table (questions, attempted, correct,
//                   marks, accuracy) with a total row, then Strengths and
//                   Weak Areas. Clicking a section opens it in the Answer
//                   Sheet.
//
// Every result page turns its own review rows into ReviewQuestion (see the
// To*ReviewQuestions helpers at the bottom), so all of them look and behave
// the same. The score, counts and time stay in each page's own summary cards
// above the tabs; nothing here repeats them.

import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { formatAnswerValue } from "@/lib/utils";
import { ChevronDown, ClipboardList, Layers3, ListChecks, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

export type ReviewViewer = "STUDENT" | "TEACHER" | "ADMIN";

export type ReviewQuestion = {
  key: string;
  questionNumber: number;
  displayType?: string | null;
  questionText?: string | null;
  operands: Array<number | string>;
  operators: string[];
  studentAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean;
  isUnanswered: boolean;
  marks: number;
  marksAwarded: number;
  sectionNumber: number | null;
  sectionTitle: string | null;
  // "Abacus" / "Visual" where a section has a method (Annual Competition).
  sectionMode?: string | null;
};

type SectionSummary = {
  key: string;
  sectionNumber: number | null;
  title: string;
  mode: string | null;
  questions: ReviewQuestion[];
  total: number;
  attempted: number;
  correct: number;
  wrong: number;
  unanswered: number;
  marks: number;
  maxMarks: number;
  // Marks per question when every question in the section is worth the same
  // and that is not 1 (Concept Drill / Skill Stacker: 5 each).
  weightLabel: string | null;
  // correct / attempted, or null when nothing was attempted -- the same
  // definition of accuracy the rest of the platform uses.
  accuracy: number | null;
};

type ReviewTab = "answers" | "scorecard";

const SECTION_PREFIX_RE = /^\s*Section\s+\d+\s*[-:–—]\s*/i;

function CleanTitle(Title: string | null | undefined): string {
  return String(Title || "").replace(SECTION_PREFIX_RE, "").trim();
}

function FormatNumber(Value: number): string {
  if (!Number.isFinite(Value)) return "0";
  return Number.isInteger(Value) ? String(Value) : Value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function AccuracyTone(Accuracy: number | null): "good" | "fair" | "low" | "none" {
  if (Accuracy == null) return "none";
  if (Accuracy >= 80) return "good";
  if (Accuracy >= 50) return "fair";
  return "low";
}

const TONE_CLASS: Record<ReturnType<typeof AccuracyTone>, string> = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200",
  fair: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
  low: "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-400/30 dark:bg-rose-400/10 dark:text-rose-200",
  none: "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
};

function AccuracyPill({ Accuracy }: { Accuracy: number | null }) {
  const Tone = AccuracyTone(Accuracy);
  return (
    <span className={`inline-flex min-w-[4.25rem] shrink-0 justify-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-black tabular-nums ${TONE_CLASS[Tone]}`}>
      {Accuracy == null ? "Not Tried" : `${Math.round(Accuracy)}%`}
    </span>
  );
}

export type ReviewSectionInfo = { sectionNumber: number | null; title: string | null; mode?: string | null };

function SectionKey(SectionNumber: number | null, Title: string): string {
  return `${SectionNumber ?? "x"}|${Title}`;
}

function BuildSections(Questions: ReviewQuestion[], Known: ReviewSectionInfo[] = []): SectionSummary[] {
  const Sections: SectionSummary[] = [];
  const ByKey = new Map<string, SectionSummary>();
  const Blank = (SectionNumber: number | null, Title: string, Mode: string | null): SectionSummary => ({
    key: SectionKey(SectionNumber, Title),
    sectionNumber: SectionNumber,
    title: Title,
    mode: Mode,
    questions: [],
    total: 0,
    attempted: 0,
    correct: 0,
    wrong: 0,
    unanswered: 0,
    marks: 0,
    maxMarks: 0,
    weightLabel: null,
    accuracy: null,
  });
  // Sections the paper has, even one with no questions (Annual Competition).
  for (const Info of Known) {
    const Section = Blank(Info.sectionNumber, CleanTitle(Info.title), Info.mode || null);
    if (!ByKey.has(Section.key)) {
      ByKey.set(Section.key, Section);
      Sections.push(Section);
    }
  }
  const Ordered = [...Questions].sort((A, B) => {
    const SA = A.sectionNumber ?? Number.MAX_SAFE_INTEGER;
    const SB = B.sectionNumber ?? Number.MAX_SAFE_INTEGER;
    return SA !== SB ? SA - SB : A.questionNumber - B.questionNumber;
  });
  for (const Question of Ordered) {
    const Title = CleanTitle(Question.sectionTitle);
    const Key = SectionKey(Question.sectionNumber, Title);
    let Section = ByKey.get(Key);
    if (!Section) {
      Section = Blank(Question.sectionNumber, Title, Question.sectionMode || null);
      ByKey.set(Key, Section);
      Sections.push(Section);
    }
    Section.questions.push(Question);
  }
  Sections.sort((A, B) => (A.sectionNumber ?? Number.MAX_SAFE_INTEGER) - (B.sectionNumber ?? Number.MAX_SAFE_INTEGER));
  const Single = Sections.length === 1;
  for (const Section of Sections) {
    Section.total = Section.questions.length;
    Section.correct = Section.questions.filter((Question) => Question.isCorrect).length;
    Section.unanswered = Section.questions.filter((Question) => Question.isUnanswered).length;
    Section.attempted = Section.total - Section.unanswered;
    Section.wrong = Section.attempted - Section.correct;
    Section.marks = Section.questions.reduce((Sum, Question) => Sum + (Question.marksAwarded || 0), 0);
    Section.maxMarks = Section.questions.reduce((Sum, Question) => Sum + (Question.marks || 0), 0);
    const Weights = new Set(Section.questions.map((Question) => Question.marks));
    const OnlyWeight = Weights.size === 1 ? [...Weights][0] : null;
    Section.weightLabel = OnlyWeight != null && OnlyWeight !== 1 ? `${FormatNumber(OnlyWeight)} marks each` : null;
    Section.accuracy = Section.attempted > 0 ? (Section.correct / Section.attempted) * 100 : null;
    if (!Section.title) Section.title = Single ? "All Questions" : `Section ${Section.sectionNumber ?? ""}`.trim();
  }
  return Sections;
}

export function ResultReviewTabs({
  Questions,
  Sections: KnownSections,
  Viewer,
  Heading,
  FocusRequest,
  ScorecardContent,
}: {
  Questions: ReviewQuestion[];
  // The paper's sections when known, so a section with no questions still
  // shows (Annual Competition). Otherwise sections come from the questions.
  Sections?: ReviewSectionInfo[];
  Viewer: ReviewViewer;
  // Read by screen readers as the review's name.
  Heading?: string;
  // Asks the review to open one section in the Answer Sheet -- e.g. a mock
  // result's "focus on BODMAS" button. A new Nonce repeats the request.
  FocusRequest?: { Title: string; Nonce: number } | null;
  // A page's own Scorecard in place of the shared one. The Annual
  // Competition keeps its plain marks scorecard: no strengths or weak areas
  // (that is what mock insights are for), and no accuracy for students.
  ScorecardContent?: React.ReactNode;
}) {
  // Pages build their rows inline, so the input is compared by content
  // (question keys and answers) rather than by array identity.
  const Signature = useMemo(
    () =>
      Questions.map((Question) => `${Question.key}:${Question.isCorrect ? 1 : 0}:${Question.studentAnswer ?? ""}`).join("|") +
      "#" +
      (KnownSections || []).map((Info) => `${Info.sectionNumber}:${Info.title}`).join("|"),
    [Questions, KnownSections]
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const Sections = useMemo(() => BuildSections(Questions, KnownSections), [Signature]);
  const [Tab, SetTab] = useState<ReviewTab>("answers");
  const [OpenKey, SetOpenKey] = useState<string | null>(null);
  const BlockRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const ChosenRef = useRef(false);

  // A paper with one section opens straight away: there is nothing to choose.
  // Once the viewer has opened or closed a block themselves, that stands.
  const OnlyKey = Sections.length === 1 ? Sections[0].key : null;
  useEffect(() => {
    if (OnlyKey && !ChosenRef.current) SetOpenKey(OnlyKey);
  }, [OnlyKey]);

  function ScrollToSection(Key: string) {
    // After React has drawn the opened block (and the Answer Sheet tab).
    window.setTimeout(() => {
      BlockRefs.current[Key]?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  function OpenSection(Key: string) {
    ChosenRef.current = true;
    SetOpenKey(Key);
    SetTab("answers");
    ScrollToSection(Key);
  }

  useEffect(() => {
    if (!FocusRequest) return;
    const Wanted = CleanTitle(FocusRequest.Title).toLowerCase();
    const Match =
      Sections.find((Section) => Section.title.toLowerCase() === Wanted) ||
      Sections.find((Section) => Section.title.toLowerCase().includes(Wanted) || Wanted.includes(Section.title.toLowerCase()));
    if (Match) OpenSection(Match.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [FocusRequest?.Nonce]);

  function ToggleSection(Key: string) {
    ChosenRef.current = true;
    const Opening = OpenKey !== Key;
    SetOpenKey(Opening ? Key : null);
    if (Opening) ScrollToSection(Key);
  }

  if (!Sections.length) {
    return (
      <section className="math-card p-5 text-sm font-bold text-slate-600 dark:text-slate-300">
        No question review is available for this attempt.
      </section>
    );
  }

  return (
    <section className="grid gap-4" aria-label={Heading || "Answer review"}>
      <div className="math-card flex flex-col gap-3 p-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Result review" className="flex flex-wrap gap-2">
          <TabButton Active={Tab === "answers"} OnClick={() => SetTab("answers")} Icon={<ClipboardList size={15} />} Label="Answer Sheet" />
          <TabButton Active={Tab === "scorecard"} OnClick={() => SetTab("scorecard")} Icon={<ListChecks size={15} />} Label="Scorecard" />
        </div>
        <p className="px-3 pb-1 text-xs font-bold text-slate-500 dark:text-slate-400 sm:pb-0">
          {Sections.length > 1 ? `${Sections.length} sections, ${Questions.length} questions` : `${Questions.length} questions`}
        </p>
      </div>

      {Tab === "answers" ? (
        <div className="grid gap-3">
          {Sections.map((Section) => (
            <SectionBlock
              key={Section.key}
              Section={Section}
              Open={OpenKey === Section.key}
              Single={Sections.length === 1}
              Viewer={Viewer}
              OnToggle={() => ToggleSection(Section.key)}
              BlockRef={(Element) => {
                BlockRefs.current[Section.key] = Element;
              }}
            />
          ))}
        </div>
      ) : (
        ScorecardContent ?? <Scorecard Sections={Sections} OnOpenSection={OpenSection} />
      )}
    </section>
  );
}

function TabButton({ Active, OnClick, Icon, Label }: { Active: boolean; OnClick: () => void; Icon: React.ReactNode; Label: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={Active}
      onClick={OnClick}
      className={`${Active ? "math-role-tab math-role-tab-active" : "math-role-tab"} inline-flex items-center gap-2`}
    >
      {Icon}
      {Label}
    </button>
  );
}

// ---------- Answer Sheet ----------

function CountChip({ Value, Label, Tone }: { Value: number; Label: string; Tone: "good" | "low" | "none" }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-black tabular-nums ${TONE_CLASS[Tone]}`}>
      {Value} {Label}
    </span>
  );
}

function SectionBlock({
  Section,
  Open,
  Single,
  Viewer,
  OnToggle,
  BlockRef,
}: {
  Section: SectionSummary;
  Open: boolean;
  Single: boolean;
  Viewer: ReviewViewer;
  OnToggle: () => void;
  BlockRef: (Element: HTMLDivElement | null) => void;
}) {
  const PanelId = `review-section-${Section.key.replace(/[^a-zA-Z0-9]/g, "-")}`;
  return (
    <div ref={BlockRef} className="math-card scroll-mt-28 overflow-hidden p-0">
      <button
        type="button"
        onClick={OnToggle}
        aria-expanded={Open}
        aria-controls={PanelId}
        className="grid w-full gap-3 p-4 text-left transition hover:bg-[var(--mp-role-softer)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--mp-role-primary)] sm:p-5"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
            <Layers3 size={18} />
          </span>
          <div className="min-w-0 flex-1">
            {!Single && Section.sectionNumber != null ? (
              <p className="text-xs font-black text-slate-500 dark:text-slate-400">Section {Section.sectionNumber}</p>
            ) : null}
            <h3 className="text-lg font-black leading-snug text-slate-950 dark:text-white" style={{ textWrap: "balance" }}>
              {Section.title}
              {Section.mode ? <span className="font-bold text-slate-500 dark:text-slate-400"> · {Section.mode}</span> : null}
            </h3>
          </div>
          {/* Laptops and tablets: the counts sit on the same line. */}
          <div className="hidden items-center gap-2 md:flex">
            <CountChip Value={Section.correct} Label="Correct" Tone="good" />
            <CountChip Value={Section.wrong} Label="Wrong" Tone="low" />
            <CountChip Value={Section.unanswered} Label="Unanswered" Tone="none" />
          </div>
          <span className="shrink-0 text-sm font-black tabular-nums text-slate-900 dark:text-white">
            {FormatNumber(Section.marks)} / {FormatNumber(Section.maxMarks)}
          </span>
          <ChevronDown size={18} className={`shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${Open ? "rotate-180" : ""}`} />
        </div>
        {/* Phones: the counts go on a line under the name. */}
        <div className="flex flex-wrap items-center gap-2 pl-[3.25rem] md:hidden">
          <CountChip Value={Section.correct} Label="Correct" Tone="good" />
          <CountChip Value={Section.wrong} Label="Wrong" Tone="low" />
          <CountChip Value={Section.unanswered} Label="Unanswered" Tone="none" />
        </div>
      </button>
      {Open ? (
        Section.questions.length ? (
          <div id={PanelId} className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/30 sm:p-4 xl:grid-cols-2">
            {Section.questions.map((Question) => (
              <QuestionCard key={Question.key} Question={Question} Viewer={Viewer} />
            ))}
          </div>
        ) : (
          <p id={PanelId} className="border-t border-slate-100 px-5 py-4 text-sm font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300">
            This section has no questions.
          </p>
        )
      ) : null}
    </div>
  );
}

function QuestionCard({ Question, Viewer }: { Question: ReviewQuestion; Viewer: ReviewViewer }) {
  const State = Question.isCorrect ? "correct" : Question.isUnanswered ? "unanswered" : "wrong";
  const Badge =
    State === "correct"
      ? TONE_CLASS.good
      : State === "wrong"
        ? TONE_CLASS.low
        : TONE_CLASS.none;
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-[22px] border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/80">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-base font-black text-slate-950 dark:text-white">Question {Question.questionNumber}</h4>
        <div className="flex items-center gap-2">
          {Question.marks !== 1 ? (
            <span className="text-xs font-bold tabular-nums text-slate-500 dark:text-slate-400">
              {FormatNumber(Question.marksAwarded)}/{FormatNumber(Question.marks)} marks
            </span>
          ) : null}
          <span className={`rounded-full border px-2.5 py-0.5 text-xs font-black ${Badge}`}>
            {State === "correct" ? "Correct" : State === "wrong" ? "Wrong" : "Unanswered"}
          </span>
        </div>
      </div>
      <div className="flex min-h-[96px] flex-1 items-center justify-center overflow-x-auto rounded-[18px] bg-slate-50 p-3 dark:bg-slate-950/60">
        <MathQuestionDisplay
          operands={Question.operands as number[]}
          operators={Question.operators}
          displayType={Question.displayType ?? undefined}
          questionText={Question.questionText ?? undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <AnswerBox
          Title={Viewer === "STUDENT" ? "Your Answer" : "Student's Answer"}
          Tone={State === "correct" ? "good" : State === "wrong" ? "low" : "none"}
          Value={Question.studentAnswer != null && Question.studentAnswer !== "" ? formatAnswerValue(Question.studentAnswer) : "Not Answered"}
        />
        <AnswerBox
          Title="Correct Answer"
          Tone="good"
          Value={Question.correctAnswer != null && Question.correctAnswer !== "" ? formatAnswerValue(Question.correctAnswer) : "Not Available"}
        />
      </div>
    </article>
  );
}

function AnswerBox({ Title, Tone, Value }: { Title: string; Tone: "good" | "low" | "none"; Value: string }) {
  return (
    <div className={`min-w-0 rounded-[16px] border px-3 py-2.5 ${TONE_CLASS[Tone]}`}>
      <p className="text-[11px] font-black opacity-80">{Title}</p>
      <p className="mt-0.5 break-words text-base font-black tabular-nums sm:text-lg">{Value}</p>
    </div>
  );
}

// ---------- Scorecard ----------

function Scorecard({ Sections, OnOpenSection }: { Sections: SectionSummary[]; OnOpenSection: (Key: string) => void }) {
  const Totals = Sections.reduce(
    (Sum, Section) => ({
      total: Sum.total + Section.total,
      attempted: Sum.attempted + Section.attempted,
      correct: Sum.correct + Section.correct,
      marks: Sum.marks + Section.marks,
      maxMarks: Sum.maxMarks + Section.maxMarks,
    }),
    { total: 0, attempted: 0, correct: 0, marks: 0, maxMarks: 0 }
  );
  const TotalAccuracy = Totals.attempted > 0 ? (Totals.correct / Totals.attempted) * 100 : null;

  // Strengths: the best sections at 80% and above. Weak Areas: the weakest
  // below 60%, or not attempted at all. At most three each, so a long paper
  // still reads at a glance. With a single section there is nothing to
  // compare, so the two lists are left out.
  const Tried = Sections.filter((Section) => Section.accuracy != null);
  const Strengths = [...Tried].filter((Section) => (Section.accuracy as number) >= 80).sort((A, B) => (B.accuracy as number) - (A.accuracy as number)).slice(0, 3);
  const Weak = [
    ...Sections.filter((Section) => Section.accuracy == null && Section.total > 0),
    ...[...Tried].filter((Section) => (Section.accuracy as number) < 60).sort((A, B) => (A.accuracy as number) - (B.accuracy as number)),
  ].slice(0, 3);

  return (
    <div className="grid gap-4">
      <div className="math-card overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
            <ListChecks size={17} />
          </span>
          <div>
            <h3 className="text-lg font-black text-slate-950 dark:text-white">Section-Wise Marks</h3>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Accuracy is correct answers out of the questions attempted. Select a section to see its questions.</p>
          </div>
        </div>

        {/* Tablets and laptops: one table, numbers right-aligned in fixed columns. */}
        <div className="hidden sm:block">
          <table className="w-full table-fixed border-collapse text-sm">
            <colgroup>
              <col />
              <col className="w-[6.25rem] lg:w-[7.5rem]" />
              <col className="w-[6.5rem] lg:w-[7.5rem]" />
              <col className="w-[5.25rem] lg:w-[6.5rem]" />
              <col className="w-[6.5rem] lg:w-[7.5rem]" />
              <col className="w-[7.75rem] lg:w-[8.5rem]" />
            </colgroup>
            <thead>
              <tr className="bg-[#f6f8fb] text-xs font-black text-slate-600 dark:bg-[#131c2e] dark:text-slate-300">
                <th scope="col" className="whitespace-nowrap px-5 py-3 text-left">Section</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right lg:px-4">Questions</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right lg:px-4">Attempted</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right lg:px-4">Correct</th>
                <th scope="col" className="whitespace-nowrap px-3 py-3 text-right lg:px-4">Marks</th>
                <th scope="col" className="whitespace-nowrap px-4 py-3 text-right lg:px-5">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {Sections.map((Section) => (
                <tr
                  key={Section.key}
                  tabIndex={0}
                  onClick={() => OnOpenSection(Section.key)}
                  onKeyDown={(Event) => {
                    if (Event.key === "Enter" || Event.key === " ") {
                      Event.preventDefault();
                      OnOpenSection(Section.key);
                    }
                  }}
                  className="cursor-pointer border-t border-slate-100 align-middle transition hover:bg-[var(--mp-role-softer)] focus:outline-none focus-visible:bg-[var(--mp-role-softer)] dark:border-slate-800"
                >
                  <td className="px-5 py-3.5">
                    <p className="break-words font-black leading-snug text-slate-900 dark:text-white">
                      {Section.sectionNumber != null && Sections.length > 1 ? `${Section.sectionNumber}. ` : ""}
                      {Section.title}
                    </p>
                    {Section.weightLabel || Section.mode ? (
                      <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {[Section.mode, Section.weightLabel].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3.5 text-right lg:px-4 font-bold tabular-nums text-slate-700 dark:text-slate-200">{Section.total}</td>
                  <td className="px-3 py-3.5 text-right lg:px-4 font-bold tabular-nums text-slate-700 dark:text-slate-200">{Section.attempted}</td>
                  <td className="px-3 py-3.5 text-right lg:px-4 font-bold tabular-nums text-slate-700 dark:text-slate-200">{Section.correct}</td>
                  <td className="px-3 py-3.5 text-right lg:px-4 font-black tabular-nums text-slate-950 dark:text-white">
                    {FormatNumber(Section.marks)}<span className="font-bold text-slate-400 dark:text-slate-500"> / {FormatNumber(Section.maxMarks)}</span>
                  </td>
                  <td className="px-4 py-3.5 text-right lg:px-5"><AccuracyPill Accuracy={Section.accuracy} /></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-[#f6f8fb] dark:border-slate-600 dark:bg-[#131c2e]">
                <td className="px-5 py-3.5 text-left font-black text-slate-950 dark:text-white">Total</td>
                <td className="px-3 py-3.5 text-right lg:px-4 font-black tabular-nums text-slate-950 dark:text-white">{Totals.total}</td>
                <td className="px-3 py-3.5 text-right lg:px-4 font-black tabular-nums text-slate-950 dark:text-white">{Totals.attempted}</td>
                <td className="px-3 py-3.5 text-right lg:px-4 font-black tabular-nums text-slate-950 dark:text-white">{Totals.correct}</td>
                <td className="px-3 py-3.5 text-right lg:px-4 font-black tabular-nums text-slate-950 dark:text-white">
                  {FormatNumber(Totals.marks)}<span className="font-bold text-slate-400 dark:text-slate-500"> / {FormatNumber(Totals.maxMarks)}</span>
                </td>
                <td className="px-4 py-3.5 text-right lg:px-5"><AccuracyPill Accuracy={TotalAccuracy} /></td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Phones: one card per section, label and value in two columns. */}
        <div className="grid gap-2 p-3 sm:hidden">
          {Sections.map((Section) => (
            <button
              key={Section.key}
              type="button"
              onClick={() => OnOpenSection(Section.key)}
              className="rounded-[18px] border border-slate-200 bg-white p-3.5 text-left transition active:scale-[0.99] dark:border-slate-700 dark:bg-slate-900/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black leading-snug text-slate-900 dark:text-white">
                    {Section.sectionNumber != null && Sections.length > 1 ? `${Section.sectionNumber}. ` : ""}
                    {Section.title}
                  </p>
                  {Section.weightLabel || Section.mode ? (
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{[Section.mode, Section.weightLabel].filter(Boolean).join(" · ")}</p>
                  ) : null}
                </div>
                <AccuracyPill Accuracy={Section.accuracy} />
              </div>
              <MobileFigures Total={Section.total} Attempted={Section.attempted} Correct={Section.correct} Marks={Section.marks} MaxMarks={Section.maxMarks} />
            </button>
          ))}
          <div className="rounded-[18px] border-2 border-slate-300 bg-slate-50 p-3.5 dark:border-slate-600 dark:bg-slate-900/60">
            <div className="flex items-center justify-between gap-3">
              <p className="font-black text-slate-950 dark:text-white">Total</p>
              <AccuracyPill Accuracy={TotalAccuracy} />
            </div>
            <MobileFigures Total={Totals.total} Attempted={Totals.attempted} Correct={Totals.correct} Marks={Totals.marks} MaxMarks={Totals.maxMarks} />
          </div>
        </div>
      </div>

      {Sections.length > 1 ? (
        <div className="grid min-w-0 gap-4 md:grid-cols-2">
          <InsightList
            Title="Strengths"
            Icon={<TrendingUp size={16} />}
            Sections={Strengths}
            Empty="No section reached 80% accuracy this time."
            OnOpenSection={OnOpenSection}
          />
          <InsightList
            Title="Weak Areas"
            Icon={<TrendingDown size={16} />}
            Sections={Weak}
            Empty="No section fell below 60% accuracy."
            OnOpenSection={OnOpenSection}
          />
        </div>
      ) : null}
    </div>
  );
}

function MobileFigures({ Total, Attempted, Correct, Marks, MaxMarks }: { Total: number; Attempted: number; Correct: number; Marks: number; MaxMarks: number }) {
  const Item = (Label: string, Value: React.ReactNode) => (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs font-bold text-slate-500 dark:text-slate-400">{Label}</dt>
      <dd className="font-black tabular-nums text-slate-900 dark:text-white">{Value}</dd>
    </div>
  );
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
      {Item("Questions", Total)}
      {Item("Attempted", Attempted)}
      {Item("Correct", Correct)}
      {Item("Marks", `${FormatNumber(Marks)} / ${FormatNumber(MaxMarks)}`)}
    </dl>
  );
}

function InsightList({
  Title,
  Icon,
  Sections,
  Empty,
  OnOpenSection,
}: {
  Title: string;
  Icon: React.ReactNode;
  Sections: SectionSummary[];
  Empty: string;
  OnOpenSection: (Key: string) => void;
}) {
  return (
    <article className="math-card flex min-w-0 flex-col gap-3 p-5">
      <div className="flex items-center gap-2 text-slate-950 dark:text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">{Icon}</span>
        <h3 className="text-base font-black">{Title}</h3>
      </div>
      {Sections.length === 0 ? (
        <p className="flex items-center gap-2 rounded-[16px] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
          <Sparkles size={14} className="shrink-0" /> {Empty}
        </p>
      ) : (
        <ul className="grid min-w-0 gap-2">
          {Sections.map((Section) => (
            <li key={Section.key} className="min-w-0">
              <button
                type="button"
                onClick={() => OnOpenSection(Section.key)}
                className="flex w-full items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-white px-4 py-2.5 text-left transition hover:border-[var(--mp-role-primary)] hover:bg-[var(--mp-role-softer)] dark:border-slate-700 dark:bg-slate-900/80"
              >
                <span className="min-w-0 break-words text-sm font-black leading-snug text-slate-900 dark:text-white">
                  {Section.sectionNumber != null ? `${Section.sectionNumber}. ` : ""}
                  {Section.title}
                </span>
                <AccuracyPill Accuracy={Section.accuracy} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

// ---------- Turning each flow's review rows into ReviewQuestion ----------

type Loose = Record<string, any>;

function TextOrNull(Value: unknown): string | null {
  if (Value === undefined || Value === null) return null;
  const Text = String(Value).trim();
  return Text ? Text : null;
}

function OptionText(Option: Loose | null | undefined): string | null {
  if (!Option) return null;
  const Label = TextOrNull(Option.label);
  const Value = TextOrNull(Option.value);
  if (Label && Value) return `${Label}. ${formatAnswerValue(Value)}`;
  return Value || Label;
}

function NumberOrNull(Value: unknown): number | null {
  const NumberValue = Number(Value);
  return Value === null || Value === undefined || Value === "" || !Number.isFinite(NumberValue) ? null : NumberValue;
}

// Practice sheets (attempt_service.result_payload).
export function ToPracticeReviewQuestions(Rows: Loose[] | null | undefined): ReviewQuestion[] {
  return (Rows || []).map((Row) => {
    const StudentAnswer = TextOrNull(Row.studentAnswer);
    const Marks = NumberOrNull(Row.marks) ?? 1;
    return {
      key: String(Row.questionId ?? Row.questionNumber),
      questionNumber: Number(Row.questionNumber),
      displayType: Row.displayType ?? Row.display_type ?? null,
      questionText: Row.questionText ?? Row.question_text ?? null,
      operands: Row.operands || [],
      operators: Row.operators || [],
      studentAnswer: StudentAnswer,
      correctAnswer: TextOrNull(Row.correctAnswer),
      isCorrect: Boolean(Row.isCorrect),
      isUnanswered: Row.isUnanswered ?? !StudentAnswer,
      marks: Marks,
      marksAwarded: NumberOrNull(Row.marksAwarded) ?? (Row.isCorrect ? Marks : 0),
      sectionNumber: NumberOrNull(Row.sectionNumber),
      sectionTitle: TextOrNull(Row.sectionTitle),
    };
  });
}

// Level assessments (assessment_engine_service.AssessmentResultPayload).
// Typed since 2026-10-11; a multiple-choice attempt from before shows its
// option letter and value.
export function ToAssessmentReviewQuestions(Rows: Loose[] | null | undefined): ReviewQuestion[] {
  return (Rows || []).map((Row) => {
    const UsesOption = Row.answerMode === "OPTION" || (!Row.answerMode && (Row.selectedOption || Row.correctOption));
    const StudentAnswer = UsesOption && Row.selectedOption ? OptionText(Row.selectedOption) : TextOrNull(Row.selectedAnswer);
    const CorrectAnswer = UsesOption && Row.correctOption ? OptionText(Row.correctOption) : TextOrNull(Row.correctAnswer) ?? OptionText(Row.correctOption);
    const Marks = NumberOrNull(Row.marks) ?? 1;
    return {
      key: String(Row.questionId ?? Row.questionNumber),
      questionNumber: Number(Row.questionNumber),
      displayType: Row.displayType ?? null,
      questionText: Row.questionText ?? null,
      operands: Row.operands || [],
      operators: Row.operators || [],
      studentAnswer: StudentAnswer,
      correctAnswer: CorrectAnswer,
      isCorrect: Boolean(Row.isCorrect),
      isUnanswered: Row.isUnanswered ?? !StudentAnswer,
      marks: Marks,
      marksAwarded: NumberOrNull(Row.marksAwarded) ?? (Row.isCorrect ? Marks : 0),
      sectionNumber: NumberOrNull(Row.sectionNumber),
      sectionTitle: TextOrNull(Row.sectionTitle),
    };
  });
}

// Competition mocks (multiple choice; competition_mock_attempt_service).
export function ToMockReviewQuestions(Rows: Loose[] | null | undefined): ReviewQuestion[] {
  return (Rows || []).map((Row) => {
    const StudentAnswer = OptionText(Row.selectedOption);
    const Marks = NumberOrNull(Row.marks) ?? 1;
    return {
      key: String(Row.questionId ?? Row.questionNumber),
      questionNumber: Number(Row.questionNumber),
      displayType: Row.displayType ?? null,
      questionText: Row.questionText ?? null,
      operands: Row.operands || [],
      operators: Row.operators || [],
      studentAnswer: StudentAnswer,
      correctAnswer: OptionText(Row.correctOption),
      isCorrect: Boolean(Row.isCorrect),
      isUnanswered: Row.isUnanswered ?? !StudentAnswer,
      marks: Marks,
      marksAwarded: NumberOrNull(Row.marksAwarded) ?? (Row.isCorrect ? Marks : 0),
      sectionNumber: NumberOrNull(Row.sectionNumber),
      sectionTitle: TextOrNull(Row.sectionTitle ?? Row.concept),
    };
  });
}

// Annual Competition (sections of questions; one mark each).
export function ToAnnualReviewQuestions(Sections: Loose[] | null | undefined): ReviewQuestion[] {
  const Out: ReviewQuestion[] = [];
  for (const Section of Sections || []) {
    const Mode = TextOrNull(Section.mode);
    const ModeLabel = Mode ? (Mode === Mode.toUpperCase() ? Mode.charAt(0) + Mode.slice(1).toLowerCase() : Mode) : null;
    for (const Row of Section.questions || []) {
      const StudentAnswer = TextOrNull(Row.studentAnswer);
      Out.push({
        key: String(Row.questionId ?? `${Section.sectionNumber}-${Row.questionNumber}`),
        questionNumber: Number(Row.questionNumber),
        displayType: Row.displayType ?? null,
        questionText: Row.questionText ?? null,
        operands: Row.operands || [],
        operators: Row.operators || [],
        studentAnswer: StudentAnswer,
        correctAnswer: TextOrNull(Row.correctAnswer),
        isCorrect: Boolean(Row.isCorrect),
        isUnanswered: Row.isUnanswered ?? !StudentAnswer,
        marks: 1,
        marksAwarded: Row.isCorrect ? 1 : 0,
        sectionNumber: NumberOrNull(Section.sectionNumber),
        sectionTitle: TextOrNull(Section.sectionTitle),
        sectionMode: ModeLabel,
      });
    }
  }
  return Out;
}

// The Annual Competition paper's own section list, so a section with no
// questions still has its block and its scorecard row.
export function ToAnnualReviewSections(Sections: Loose[] | null | undefined): ReviewSectionInfo[] {
  return (Sections || []).map((Section) => {
    const Mode = TextOrNull(Section.mode);
    return {
      sectionNumber: NumberOrNull(Section.sectionNumber),
      title: TextOrNull(Section.sectionTitle),
      mode: Mode ? (Mode === Mode.toUpperCase() ? Mode.charAt(0) + Mode.slice(1).toLowerCase() : Mode) : null,
    };
  });
}
