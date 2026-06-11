"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { QuestionNavigator } from "@/components/student/QuestionNavigator";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  archiveCompetitionMockExam,
  deleteCompetitionMockExam,
  getCompetitionMockExam,
  type CompetitionMockExamDetail,
  type CompetitionMockQuestion,
} from "@/lib/api/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, ArrowLeft, CheckCircle2, Clock, Eye, FileText, Layers3, ShieldCheck, Target, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";

function formatDuration(secondsValue: number | null | undefined) {
  const safeSeconds = Math.max(0, Number(secondsValue || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  if (minutes && seconds) return `${minutes} Min ${seconds} Secs`;
  if (minutes) return `${minutes} Min${minutes === 1 ? "" : "s"}`;
  return `${seconds} Secs`;
}

function statusTone(status: string) {
  const text = String(status || "DRAFT").toUpperCase();
  if (text === "ARCHIVED") return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300";
  if (text === "DRAFT") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200";
  return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200";
}

function normalisePreviewOperands(operands: unknown[] | null | undefined): Array<number | string> {
  return (operands || []).map((operandValue) => {
    if (typeof operandValue === "number" || typeof operandValue === "string") return operandValue;
    if (operandValue === null || operandValue === undefined) return "";
    return String(operandValue);
  });
}


function isMasterModuleMock(moduleCode: string | null | undefined) {
  return String(moduleCode || "").trim().toUpperCase().includes("MM");
}

function questionSearchText(question: CompetitionMockQuestion) {
  return [
    question.sectionTitle,
    question.conceptTag,
    question.conceptFamily,
    question.displayType,
    question.questionText,
  ].filter(Boolean).join(" ").toLowerCase();
}

function isMmExpressionQuestion(question: CompetitionMockQuestion, mock: CompetitionMockExamDetail) {
  if (!isMasterModuleMock(mock.moduleCode)) return false;
  const text = questionSearchText(question);
  return Number(question.sectionNumber) === 8 || text.includes("bodmas") || text.includes("percentage") || text.includes("percent");
}

function isMmFinancialQuestion(question: CompetitionMockQuestion, mock: CompetitionMockExamDetail) {
  if (!isMasterModuleMock(mock.moduleCode)) return false;
  const text = questionSearchText(question);
  return Number(question.sectionNumber) === 9 || text.includes("profit") || text.includes("loss") || text.includes("interest") || text.includes("selling price") || text.includes("cost price");
}

function isMmPositionalQuestion(question: CompetitionMockQuestion, mock: CompetitionMockExamDetail) {
  if (!isMasterModuleMock(mock.moduleCode)) return false;
  const text = questionSearchText(question);
  return Number(question.sectionNumber) === 5 || text.includes("position") || text.includes("placement");
}

function hasMultiplicationPlacementShape(question: CompetitionMockQuestion) {
  const text = questionSearchText(question);
  const operators = (question.operators || []).map((operator) => String(operator || "").toLowerCase());
  const operands = normalisePreviewOperands(question.operands);

  return (
    text.includes("decimal multiplication answer position") ||
    text.includes("answer position") ||
    /[×x*]/.test(String(question.questionText || "")) ||
    operators.some((operator) => operator === "×" || operator === "x" || operator === "*") ||
    (operands.length >= 2 && text.includes("multiplication"))
  );
}

function hasWriteNumberPositionShape(question: CompetitionMockQuestion) {
  const text = questionSearchText(question);
  return text.includes("write") && text.includes("given position");
}


function getCleanMmSectionName(question: CompetitionMockQuestion): string {
  const sectionNumber = Number(question.sectionNumber || 0);
  const rawTitle = String(question.sectionTitle || question.conceptTag || "").trim();
  if (!rawTitle) return sectionNumber ? `Section ${sectionNumber}` : "Section";
  const prefixPattern = new RegExp(`^section\\s*${sectionNumber}\\s*[-–—:]\\s*`, "i");
  const cleanTitle = rawTitle.replace(prefixPattern, "").trim();
  return cleanTitle || rawTitle;
}

function getMmQuestionConceptDisplayTitle(question: CompetitionMockQuestion, mock: CompetitionMockExamDetail) {
  if (!isMasterModuleMock(mock.moduleCode)) return question.conceptTag || question.conceptFamily || "Concept";
  if (Number(question.sectionNumber) === 5 || isMmPositionalQuestion(question, mock)) {
    if (hasWriteNumberPositionShape(question)) return "Write Number From Given Position";
    if (hasMultiplicationPlacementShape(question)) return "Decimal Multiplication Answer Position";
    return "Find Position of the First Natural Number";
  }
  return question.conceptTag || question.conceptFamily || "Concept";
}

function getMmPositionalPromptTitle(question: CompetitionMockQuestion) {
  if (hasWriteNumberPositionShape(question)) return null;
  if (hasMultiplicationPlacementShape(question)) return "DECIMAL MULTIPLICATION ANSWER POSITION";
  return "FIND POSITION OF FIRST NATURAL NUMBER";
}

function getMockDisplayType(question: CompetitionMockQuestion, mock: CompetitionMockExamDetail) {
  if (isMmFinancialQuestion(question, mock)) return "FINANCIAL_TABLE";
  if (isMmExpressionQuestion(question, mock)) return "EXPRESSION_WORKSHEET";
  return question.displayType;
}

function formatMockValue(value: number | string) {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toFixed(8))).replace(/\.0+$/, "");
  }
  return String(value);
}

function buildMockExpression(operands: Array<number | string>, operators: string[]) {
  if (!operands.length) return "?";
  return operands.map((operand, index) => {
    const value = formatMockValue(operand);
    if (index === 0) return value;
    const operator = String(operators[index] || operators[index - 1] || "+").trim();
    if (operator === "+%") return `+ ${value}%`;
    if (operator === "-%") return `− ${value}%`;
    if (operator === "×%") return `× ${value}%`;
    if (operator === "%") return `% ${value}`;
    return `${operator || "+"} ${value}`;
  }).join(" ");
}

function renderExpressionParts(expression: string) {
  return expression.split(/([?？])/g).map((part, index) => (
    part === "?" || part === "？"
      ? <span key={`mock-question-mark-${index}`} className="text-blue-700 dark:text-cyan-300">?</span>
      : <span key={`mock-expression-part-${index}`}>{part}</span>
  ));
}

function MockQuestionRenderer({ question, mock, compact = false }: { question: CompetitionMockQuestion; mock: CompetitionMockExamDetail; compact?: boolean }) {
  const operands = normalisePreviewOperands(question.operands);
  const operators = question.operators || [];
  const positionalPromptTitle = isMmPositionalQuestion(question, mock) ? getMmPositionalPromptTitle(question) : null;

  const renderedQuestion = isMmExpressionQuestion(question, mock) ? (() => {
    const expression = question.questionText?.trim() || buildMockExpression(operands, operators);
    const hasPrompt = /[?？]/.test(expression);
    return (
      <div className="mx-auto flex w-full justify-center rounded-[20px] bg-white px-4 py-4 text-slate-950 shadow-inner ring-1 ring-slate-100 dark:bg-slate-950/70 dark:text-white dark:ring-slate-700 sm:px-6">
        <div className={`${compact ? "text-[18px] sm:text-[22px]" : "text-[24px] sm:text-[30px]"} max-w-full whitespace-normal break-words text-center font-mono font-black leading-snug tracking-tight`}>
          {renderExpressionParts(expression)}
          {!hasPrompt ? <span className="ml-2 text-blue-700 dark:text-cyan-300">= ?</span> : null}
        </div>
      </div>
    );
  })() : (
    <MathQuestionDisplay
      operands={operands}
      operators={operators}
      displayType={getMockDisplayType(question, mock)}
      questionText={question.questionText}
    />
  );

  if (!positionalPromptTitle) return renderedQuestion;

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-[22px] border border-slate-200 bg-white text-center shadow-inner dark:border-slate-700 dark:bg-slate-950/70">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-700 dark:text-slate-200">{positionalPromptTitle}</p>
      </div>
      <div className="px-4 py-5">{renderedQuestion}</div>
    </div>
  );
}

function groupQuestionsBySection(questions: CompetitionMockQuestion[]) {
  const sectionMap = new Map<number, { sectionNumber: number; sectionTitle: string; questions: CompetitionMockQuestion[] }>();
  questions.forEach((question) => {
    const sectionNumber = Number(question.sectionNumber || 1);
    const existingSection = sectionMap.get(sectionNumber);
    if (existingSection) {
      existingSection.questions.push(question);
      return;
    }
    sectionMap.set(sectionNumber, {
      sectionNumber,
      sectionTitle: question.sectionTitle || question.conceptTag || `Section ${sectionNumber}`,
      questions: [question],
    });
  });
  return Array.from(sectionMap.values()).sort((left, right) => left.sectionNumber - right.sectionNumber);
}

export default function AdminCompetitionMockDetailPage() {
  const ready = useProtectedPage(["ADMIN", "SUPER_ADMIN"]);
  const params = useParams<{ mockId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"OVERVIEW" | "PREVIEW" | "COVERAGE">("OVERVIEW");
  const [showAnswers, setShowAnswers] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const mockQuery = useQuery({
    queryKey: ["admin", "competition", "mock-detail", params.mockId],
    queryFn: () => getCompetitionMockExam(params.mockId),
    enabled: ready && Boolean(params.mockId),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveCompetitionMockExam(params.mockId),
    onSuccess: () => {
      setArchiveOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "competition", "mock-detail", params.mockId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteCompetitionMockExam(params.mockId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "competition"] });
      router.push("/admin/competition/mock-studio?tab=manage");
    },
  });

  if (!ready) return null;

  const mock = mockQuery.data || null;
  const isArchived = String(mock?.status || "").toUpperCase() === "ARCHIVED";

  return (
    <AppShell title="Competition Mock Details">
      <section className="space-y-3">
        {mockQuery.isLoading ? <LoadingState label="Loading competition mock details..." /> : null}
        {mockQuery.error ? <ErrorState message={apiErrorMessage(mockQuery.error)} /> : null}
        {!mockQuery.isLoading && !mockQuery.error && !mock ? <EmptyState title="Mock not found" description="The selected competition mock could not be loaded." /> : null}

        {mock ? (
          <>
            <section className="math-admin-studio-detail-hero relative overflow-hidden rounded-[28px] border p-3 shadow-[0_16px_42px_rgba(15,23,42,0.07)] sm:p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                  <button type="button" onClick={() => router.push("/admin/competition/mock-studio?tab=manage")} className="math-role-action-button h-9 px-3 text-xs">
                    <ArrowLeft size={14} /> Back To Mock Studio
                  </button>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide ${statusTone(mock.status)}`}>{mock.status}</span>
                    <span className="math-admin-studio-chip rounded-full px-2.5 py-0.5 text-[10px] font-black">{mock.moduleCode || "-"} · {mock.levelCode || "-"}</span>
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-black text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">COMPETITION</span>
                  </div>
                  <p className="math-kicker mt-2 text-[10px]">Mock Details</p>
                  <h1 className="mt-0.5 max-w-4xl truncate text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">{mock.title}</h1>
                  <p className="mt-1 max-w-3xl text-sm font-bold leading-5 text-slate-700 dark:text-slate-200">Full-page competition mock preview with section coverage and generated question details.</p>
                </div>
                <div className="flex flex-wrap gap-2 xl:justify-end">
                  <button type="button" className="math-role-action-button min-h-9 px-4 py-2 text-[13px]" onClick={() => setShowAnswers((current) => !current)}>
                    <Eye size={15} />{showAnswers ? "Hide Answers" : "Show Answers"}
                  </button>
                  {!isArchived ? (
                    <button type="button" className="math-role-action-button min-h-9 px-4 py-2 text-[13px]" onClick={() => setArchiveOpen(true)}>
                      <Archive size={15} />Archive
                    </button>
                  ) : null}
                  <button type="button" className="inline-flex min-h-9 items-center justify-center gap-2 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-2 text-[13px] font-black text-rose-700 shadow-sm shadow-rose-900/10 transition hover:-translate-y-0.5 hover:border-rose-600 hover:bg-rose-600 hover:text-white hover:shadow-lg hover:shadow-rose-900/20 dark:border-rose-700/70 dark:bg-rose-950/30 dark:text-rose-200 dark:hover:border-rose-600 dark:hover:bg-rose-700 dark:hover:text-white" onClick={() => setDeleteOpen(true)}>
                    <Trash2 size={15} />Delete
                  </button>
                </div>
              </div>
            </section>

            <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <DetailMetric icon={<Target size={16} />} label="Questions" value={mock.totalQuestions} helper="Mock Length" />
              <DetailMetric icon={<ShieldCheck size={16} />} label="Total Marks" value={mock.totalMarks} helper="Competition Total" />
              <DetailMetric icon={<FileText size={16} />} label="Marks/Question" value={mock.marksPerQuestion || "Auto"} helper="Configured Marking" />
              <DetailMetric icon={<Clock size={16} />} label="Duration" value={formatDuration(mock.durationSeconds)} helper="Competition Time" />
            </section>

            {(archiveMutation.error || deleteMutation.error) ? <ErrorState message={apiErrorMessage(archiveMutation.error || deleteMutation.error)} /> : null}

            <section className="rounded-[24px] border border-white/70 bg-white/90 p-2.5 shadow-md dark:border-slate-800 dark:bg-slate-950/80">
              <div className="flex flex-wrap gap-2">
                {[
                  { key: "OVERVIEW", label: "Overview" },
                  { key: "PREVIEW", label: "Question Preview" },
                  { key: "COVERAGE", label: "Coverage Check" },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`math-role-tab-button math-admin-tab-force ${activeTab === tab.key ? "is-active math-admin-tab-force-selected" : ""}`}
                    onClick={() => setActiveTab(tab.key as "OVERVIEW" | "PREVIEW" | "COVERAGE")}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </section>

            {activeTab === "OVERVIEW" ? <MockOverviewTab mock={mock} /> : null}
            {activeTab === "PREVIEW" ? <MockQuestionPreviewTab mock={mock} showAnswers={showAnswers} /> : null}
            {activeTab === "COVERAGE" ? <MockCoverageTab mock={mock} showAnswers={showAnswers} /> : null}

            {archiveOpen ? <ArchiveDialog busy={archiveMutation.isPending} onCancel={() => setArchiveOpen(false)} onConfirm={() => archiveMutation.mutate()} /> : null}
            {deleteOpen ? <DeleteDialog busy={deleteMutation.isPending} onCancel={() => setDeleteOpen(false)} onConfirm={() => deleteMutation.mutate()} /> : null}
          </>
        ) : null}
      </section>
    </AppShell>
  );
}

function MockOverviewTab({ mock }: { mock: CompetitionMockExamDetail }) {
  const sections = groupQuestionsBySection(mock.questions || []);
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950/80 sm:p-5">
      <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
        <div className="rounded-[26px] border border-slate-200 p-5 dark:border-slate-800">
          <p className="math-kicker text-[10px]">Instructions</p>
          <h3 className="mt-2 text-xl font-black text-slate-950 dark:text-white">Student Instructions</h3>
          <p className="mt-3 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">{mock.instructions || "Complete the mock under competition timing without taking breaks."}</p>
          <div className="mt-4 rounded-[22px] bg-slate-50 p-4 text-sm font-bold leading-6 text-slate-700 dark:bg-slate-900/50 dark:text-slate-200">
            Questions are generated from the selected level syllabus and split into competition sections.
          </div>
        </div>

        <div className="overflow-hidden rounded-[26px] border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-5 py-3 dark:bg-slate-900">
            <div>
              <p className="math-kicker text-[10px]">Section Matrix</p>
              <h3 className="text-xl font-black text-slate-950 dark:text-white">Section-Wise Questions</h3>
            </div>
            <span className="rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">{sections.length} Sections</span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sections.map((section) => (
              <div key={section.sectionNumber} className="grid gap-3 px-5 py-3 sm:grid-cols-[96px_1fr_120px_90px] sm:items-center">
                <span className="rounded-2xl math-admin-studio-chip px-3 py-2 text-center text-xs font-black">S{section.sectionNumber}</span>
                <p className="truncate font-black text-slate-950 dark:text-white">{section.sectionTitle}</p>
                <p className="text-sm font-black text-slate-700 dark:text-slate-200">{section.questions.length} Questions</p>
                <p className="text-sm font-black text-slate-500">{mock.totalQuestions ? ((section.questions.length / mock.totalQuestions) * 100).toFixed(1) : "0"}%</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MockQuestionPreviewTab({ mock, showAnswers }: { mock: CompetitionMockExamDetail; showAnswers: boolean }) {
  const questions = useMemo(() => [...(mock.questions || [])].sort((left, right) => left.questionNumber - right.questionNumber), [mock.questions]);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => { setCurrentIndex(0); }, [mock.mockExamId]);

  const currentQuestion = questions[currentIndex];
  if (!questions.length || !currentQuestion) return <EmptyState title="No questions generated" description="This mock does not have generated questions yet." />;

  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950/80 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="math-kicker">Question Preview</p>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">Generated Mock Paper</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">Review the generated questions in the same clean full-page format used for assessment review.</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black uppercase tracking-wide ${statusTone(mock.status)}`}>{mock.status}</span>
            <span className="math-admin-studio-chip rounded-full px-3 py-1 text-xs font-black">Code: {mock.mockCode}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div className="math-card overflow-hidden p-4 sm:p-5">
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-slate-700/60 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="math-kicker text-[10px]">Mock Preview</p>
              <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white">Question {currentQuestion.questionNumber} of {questions.length}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">Section {currentQuestion.sectionNumber}</span>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${isMasterModuleMock(mock.moduleCode) ? "math-admin-studio-chip" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{getCleanMmSectionName(currentQuestion)}</span>
              </div>
            </div>

            {showAnswers ? (
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 size={16} /> Answer: {currentQuestion.correctAnswer}
              </div>
            ) : (
              <div className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600 dark:bg-slate-800 dark:text-slate-200">
                <Eye size={16} /> Answer Hidden
              </div>
            )}
          </div>

          <div className={`mt-5 grid gap-5 ${isMmExpressionQuestion(currentQuestion, mock) || isMmFinancialQuestion(currentQuestion, mock) ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,360px)_1fr] xl:items-center"}`}>
            <div className={`${isMmExpressionQuestion(currentQuestion, mock) || isMmFinancialQuestion(currentQuestion, mock) ? "w-full" : ""} rounded-[26px] bg-slate-50/90 p-4 dark:bg-slate-900/70 sm:p-5`}>
              <MockQuestionRenderer question={currentQuestion} mock={mock} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(currentQuestion.options || []).map((option) => {
                const isCorrect = Boolean(showAnswers && option.isCorrect);
                return (
                  <div key={option.optionId || `${currentQuestion.mockQuestionId}-${option.label}`} className={`flex min-h-[58px] items-center gap-3 rounded-[20px] border px-4 py-3 text-left transition duration-200 ${isCorrect ? "border-emerald-300 bg-emerald-50 text-emerald-900 shadow-lg shadow-emerald-100/70 dark:border-emerald-500/50 dark:bg-emerald-950/30 dark:text-emerald-100 dark:shadow-none" : "border-slate-200 bg-white/90 text-slate-800 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-100"}`}>
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl font-black ${isCorrect ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}>{option.label}</span>
                    <span className="text-base font-semibold">{option.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="math-card p-4">
          <QuestionNavigator
            totalQuestions={questions.length}
            currentQuestionNumber={currentQuestion.questionNumber}
            answeredQuestionNumbers={[]}
            onSelectQuestion={(questionNumber) => {
              const targetIndex = questions.findIndex((question) => question.questionNumber === questionNumber);
              if (targetIndex >= 0) setCurrentIndex(targetIndex);
            }}
          />
          <div className="mt-4 flex flex-wrap justify-between gap-3">
            <button className="math-role-action-button px-4 py-2 text-xs" disabled={currentIndex === 0} onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}>Previous</button>
            <button className="math-role-action-button px-4 py-2 text-xs" disabled={currentIndex >= questions.length - 1} onClick={() => setCurrentIndex((value) => Math.min(questions.length - 1, value + 1))}>Next</button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MockCoverageTab({ mock, showAnswers }: { mock: CompetitionMockExamDetail; showAnswers: boolean }) {
  const sections = groupQuestionsBySection(mock.questions || []);
  return (
    <section className="rounded-[32px] border border-white/70 bg-white/90 p-4 shadow-xl dark:border-slate-800 dark:bg-slate-950/80 sm:p-5">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="math-kicker">Coverage Check</p>
          <h2 className="text-2xl font-black text-slate-950 dark:text-white">Section And Concept Coverage</h2>
          <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">Verify competition section coverage and generated question allocation before assigning.</p>
        </div>
        <span className="w-fit rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">Admin Metadata</span>
      </div>

      <div className="mt-4 max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        {sections.map((section) => (
          <div key={section.sectionNumber} className="overflow-hidden rounded-[26px] border border-slate-200 dark:border-slate-800">
            <div className="flex flex-col gap-2 bg-slate-50 px-5 py-4 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="math-kicker text-[10px]">Section {section.sectionNumber}</p>
                <h3 className="text-lg font-black text-slate-950 dark:text-white">{section.sectionTitle}</h3>
              </div>
              <span className="rounded-full math-admin-studio-chip px-3 py-1 text-xs font-black">{section.questions.length} Questions</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {section.questions.map((question) => (
                <div key={question.mockQuestionId} className="grid gap-3 px-5 py-3 text-sm lg:grid-cols-[80px_1fr_180px_120px] lg:items-center">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-center text-xs font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">Q{question.questionNumber}</span>
                  <p className="font-black text-slate-950 dark:text-white">{question.questionText || normalisePreviewOperands(question.operands).join(" ")}</p>
                  <p className="text-xs font-black uppercase tracking-[0.12em] math-role-text">{getMmQuestionConceptDisplayTitle(question, mock)}</p>
                  {showAnswers ? <p className="text-xs font-black text-emerald-700">Answer: {question.correctAnswer}</p> : <p className="text-xs font-black text-slate-400">Answer Hidden</p>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ArchiveDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[32px] border border-amber-100 bg-white p-6 shadow-2xl dark:border-amber-900/60 dark:bg-slate-950">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-amber-50 p-3 text-amber-600 dark:bg-amber-950/40 dark:text-amber-300"><Archive size={22} /></div>
          <div>
            <p className="math-kicker text-[10px] text-amber-600 dark:text-amber-300">Archive Mock</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Archive this mock?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">This keeps the mock history available but removes it from normal assignment selection.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="math-button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-amber-600 bg-amber-600 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={onConfirm} disabled={busy}><Archive size={17} />Archive Mock</button>
        </div>
      </div>
    </div>
  );
}

function DeleteDialog({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-[32px] border border-red-100 bg-white p-6 shadow-2xl dark:border-red-900/60 dark:bg-slate-950">
        <div className="flex items-start gap-4">
          <div className="rounded-2xl bg-red-50 p-3 text-red-600 dark:bg-red-950/40 dark:text-red-300"><AlertTriangle size={22} /></div>
          <div>
            <p className="math-kicker text-[10px] text-red-600 dark:text-red-300">Delete Mock</p>
            <h3 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">Delete this mock permanently?</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600 dark:text-slate-300">This removes the mock, questions, options, assignments, attempts, answers, and result summaries linked to this mock. This action cannot be undone.</p>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="math-button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-600 bg-red-600 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60" onClick={onConfirm} disabled={busy}><Trash2 size={17} />Delete Permanently</button>
        </div>
      </div>
    </div>
  );
}

function DetailMetric({ icon, label, value, helper }: { icon: ReactNode; label: string; value: string | number; helper: string }) {
  return (
    <div className="group relative overflow-hidden rounded-[22px] border border-white/70 bg-white/88 p-3 shadow-md transition hover:-translate-y-0.5 hover:shadow-xl dark:border-blue-300/20 dark:bg-slate-950/55 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_18px_40px_rgba(2,6,23,0.28)]">
      <div className="pointer-events-none absolute -right-10 -top-10 h-24 w-24 rounded-full math-admin-studio-card-glow blur-2xl transition" />
      <div className="relative z-10 flex items-start justify-between gap-3">
        <div className="math-icon-shell inline-flex h-9 w-9 items-center justify-center rounded-2xl border shadow-sm">{icon}</div>
        <p className="text-xl font-black text-slate-950 dark:text-white">{value}</p>
      </div>
      <p className="relative z-10 mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="relative z-10 mt-0.5 text-[11px] font-semibold text-slate-500">{helper}</p>
    </div>
  );
}

