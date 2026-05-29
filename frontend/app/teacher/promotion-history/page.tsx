"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { apiErrorMessage } from "@/lib/api";
import {
  getTeacherStudentLevelPromotions,
  type TeacherStudentLevelPromotion,
} from "@/lib/api/teacher";
import { formatMathPathDateTime } from "@/lib/date";
import { CompareStudentCodes } from "@/lib/studentSort";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  Search,
  ShieldCheck,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

type PromotionHistoryStudentGroup = {
  StudentKey: string;
  StudentName: string;
  StudentCode: string;
  Items: TeacherStudentLevelPromotion[];
};

function Chip({
  children,
  Tone = "slate",
}: {
  children: ReactNode;
  Tone?: "blue" | "green" | "amber" | "red" | "slate" | "purple";
}) {
  const ToneClass = {
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    red: "border-rose-200 bg-rose-50 text-rose-700",
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    purple: "border-violet-200 bg-violet-50 text-violet-700",
  }[Tone];

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${ToneClass}`}
    >
      {children}
    </span>
  );
}

function Metric({
  Label,
  Value,
  Icon,
}: {
  Label: string;
  Value: string | number;
  Icon: ReactNode;
}) {
  return (
    <div className="rounded-[22px] border border-white/70 bg-white/75 p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950/70">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-slate-800 dark:text-slate-100">
            {Label}
          </p>
          <p className="mt-2 text-3xl font-black leading-none text-slate-950 dark:text-white">
            {Value}
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--mp-role-softer)] text-[color:var(--mp-role-readable)] ring-1 ring-[color:var(--mp-role-border)]">
          {Icon}
        </span>
      </div>
    </div>
  );
}

function CleanNumber(Value: unknown) {
  const NumberValue = Number(Value);
  if (!Number.isFinite(NumberValue)) return "0";
  return String(Math.round(NumberValue));
}

function BuildPromotionHistoryStudentGroups(
  Items: TeacherStudentLevelPromotion[],
): PromotionHistoryStudentGroup[] {
  const StudentMap = new Map<string, PromotionHistoryStudentGroup>();

  Items.forEach((Item) => {
    const StudentKey = String(
      Item.studentId || Item.studentCode || Item.studentName || "Student",
    );
    if (!StudentMap.has(StudentKey)) {
      StudentMap.set(StudentKey, {
        StudentKey,
        StudentName: String(Item.studentName || "Student"),
        StudentCode: String(Item.studentCode || "—"),
        Items: [],
      });
    }
    StudentMap.get(StudentKey)!.Items.push(Item);
  });

  return Array.from(StudentMap.values())
    .map((Group) => ({
      ...Group,
      Items: [...Group.Items].sort((First, Second) => {
        const FirstTime = First.promotedAt
          ? new Date(First.promotedAt).getTime()
          : 0;
        const SecondTime = Second.promotedAt
          ? new Date(Second.promotedAt).getTime()
          : 0;
        return SecondTime - FirstTime;
      }),
    }))
    .sort((First, Second) =>
      CompareStudentCodes(First.StudentCode, Second.StudentCode),
    );
}

function PromotionHistoryRecordTable({
  Items,
}: {
  Items: TeacherStudentLevelPromotion[];
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="math-teacher-promotion-history-table-header grid grid-cols-[.82fr_.82fr_1.18fr_.66fr_.66fr_1fr_.9fr] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
        <div>From Level</div>
        <div>To Level</div>
        <div>Assessment</div>
        <div>Score</div>
        <div>Percentage</div>
        <div>Promoted Date</div>
        <div>Promoted By</div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {Items.map((Item) => {
          const Percentage = Number(Item.percentage);
          return (
            <div
              key={Item.promotionId}
              className="grid grid-cols-[.82fr_.82fr_1.18fr_.66fr_.66fr_1fr_.9fr] items-center gap-3 px-4 py-4 transition hover:bg-[color:var(--mp-role-softer)] dark:hover:bg-slate-900/70"
            >
              <div className="flex min-w-0 items-center">
                <Chip Tone="slate">{Item.fromLevelCode || "—"}</Chip>
              </div>
              <div className="flex min-w-0 items-center">
                <Chip Tone="purple">{Item.toLevelCode || "—"}</Chip>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                  {Item.assessmentTitle || "Assessment"}
                </p>
              </div>
              <div className="min-w-0">
                <Chip Tone="green">
                  {CleanNumber(Item.score)} / {CleanNumber(Item.maxScore ?? 100)}
                </Chip>
              </div>
              <div className="min-w-0">
                <Chip
                  Tone={
                    Number.isFinite(Percentage) && Percentage >= 70
                      ? "green"
                      : "slate"
                  }
                >
                  {Number.isFinite(Percentage)
                    ? `${CleanNumber(Percentage)}%`
                    : "—"}
                </Chip>
              </div>
              <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {Item.promotedAt
                  ? formatMathPathDateTime(Item.promotedAt)
                  : "—"}
              </div>
              <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                {Item.promotedByName || "Admin"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PromotionHistoryTable({
  Items,
}: {
  Items: TeacherStudentLevelPromotion[];
}) {
  const PromotionHistoryStateKey = CreatePersistedUiStateKey("teacher", "promotion-history");
  const [ExpandedStudents, SetExpandedStudents] = usePersistentUiState<
    Record<string, boolean>
  >(CreatePersistedUiStateKey(PromotionHistoryStateKey, "expanded-students"), {});
  const StudentGroups = BuildPromotionHistoryStudentGroups(Items);

  const ToggleStudent = (StudentKey: string) => {
    SetExpandedStudents((Current) => ({
      ...Current,
      [StudentKey]: !Current[StudentKey],
    }));
  };

  return (
    <div className="space-y-4">
      {StudentGroups.map((Group) => {
        const IsExpanded = Boolean(ExpandedStudents[Group.StudentKey]);
        return (
          <div
            key={Group.StudentKey}
            className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
          >
            <button
              type="button"
              onClick={() => ToggleStudent(Group.StudentKey)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[color:var(--mp-role-softer)] dark:hover:bg-slate-900/70"
              title={
                IsExpanded
                  ? "Hide Promotion Records"
                  : "Show Promotion Records"
              }
              aria-label={
                IsExpanded
                  ? "Hide Promotion Records"
                  : "Show Promotion Records"
              }
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--mp-role-softer)] text-[color:var(--mp-role-readable)] ring-1 ring-[color:var(--mp-role-border)]">
                  {IsExpanded ? (
                    <ChevronDown size={18} />
                  ) : (
                    <ChevronRight size={18} />
                  )}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                    {Group.StudentName}
                  </p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {Group.StudentCode}
                  </p>
                </div>
              </div>
              <Chip Tone="purple">
                {Group.Items.length} Promotion
                {Group.Items.length === 1 ? "" : "s"}
              </Chip>
            </button>
            {IsExpanded ? (
              <div className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <PromotionHistoryRecordTable Items={Group.Items} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function TeacherPromotionHistoryPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const [SearchValue, SetSearchValue] = usePersistentUiState(CreatePersistedUiStateKey(PromotionHistoryStateKey, "search"), "");
  const [ModuleFilter, SetModuleFilter] = usePersistentUiState(CreatePersistedUiStateKey(PromotionHistoryStateKey, "module-filter"), "");
  const [LevelFilter, SetLevelFilter] = usePersistentUiState(CreatePersistedUiStateKey(PromotionHistoryStateKey, "level-filter"), "");

  const PromotionHistoryQuery = useQuery({
    queryKey: ["teacher-student-level-promotions"],
    queryFn: getTeacherStudentLevelPromotions,
    enabled: Ready,
  });

  const PromotionItems = PromotionHistoryQuery.data?.items ?? [];
  const PromotionStudentCount = useMemo(
    () => BuildPromotionHistoryStudentGroups(PromotionItems).length,
    [PromotionItems],
  );

  const ModuleOptions = useMemo(() => {
    const ModuleMap = new Map<string, string>();
    PromotionItems.forEach((Item) => {
      const Code = String(Item.fromModuleCode || Item.toModuleCode || "Module");
      const Name = String(Item.fromModuleName || Item.toModuleName || "");
      const Label = Name && Name !== Code ? `${Code} · ${Name}` : Code;
      if (!ModuleMap.has(Code)) ModuleMap.set(Code, Label);
    });
    return Array.from(ModuleMap.entries()).sort((First, Second) =>
      First[1].localeCompare(Second[1], undefined, { numeric: true }),
    );
  }, [PromotionItems]);

  const LevelOptions = useMemo(() => {
    const SourceItems =
      ModuleFilter && ModuleFilter !== "ALL"
        ? PromotionItems.filter(
            (Item) =>
              String(Item.fromModuleCode || Item.toModuleCode || "Module") ===
              ModuleFilter,
          )
        : PromotionItems;
    return Array.from(
      new Set(
        SourceItems.map((Item) => String(Item.fromLevelCode || "Level")).filter(
          Boolean,
        ),
      ),
    ).sort((First, Second) =>
      First.localeCompare(Second, undefined, { numeric: true }),
    );
  }, [PromotionItems, ModuleFilter]);

  const FilteredPromotionItems = useMemo(() => {
    const Query = SearchValue.trim().toLowerCase();
    return PromotionItems.filter((Item) => {
      const MatchesSearch =
        !Query ||
        [
          Item.studentName,
          Item.studentCode,
          Item.assessmentTitle,
          Item.fromModuleCode,
          Item.fromLevelCode,
          Item.toModuleCode,
          Item.toLevelCode,
          Item.promotedByName,
          Item.statusLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(Query);
      const MatchesModule =
        !ModuleFilter ||
        ModuleFilter === "ALL" ||
        String(Item.fromModuleCode || Item.toModuleCode || "Module") ===
          ModuleFilter;
      const MatchesLevel =
        !LevelFilter ||
        LevelFilter === "ALL" ||
        String(Item.fromLevelCode || "Level") === LevelFilter;
      return MatchesSearch && MatchesModule && MatchesLevel;
    });
  }, [PromotionItems, SearchValue, ModuleFilter, LevelFilter]);

  if (!Ready) return null;

  return (
    <AppShell title="Promotion History">
      <section className="mx-auto max-w-[1680px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="math-hero p-6">
          <p className="math-kicker">Progression Tracking</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-white">
            Promotion History
          </h1>
          <p className="mt-3 max-w-3xl text-base font-semibold text-slate-600 dark:text-slate-300">
            Review completed level promotions for your assigned students without
            changing admin-controlled progression records.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              Label="Promoted Students"
              Value={PromotionStudentCount}
              Icon={<ShieldCheck size={15} />}
            />
          </div>
        </div>

        <div className="rounded-[28px] bg-white/90 p-5 shadow-sm dark:bg-slate-950/80">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
            <div className="relative">
              <Search
                size={18}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                className="math-input pl-11"
                value={SearchValue}
                onChange={(Event) => SetSearchValue(Event.target.value)}
                placeholder="Search Promotion History"
              />
            </div>
            <select
              className="math-input"
              value={ModuleFilter}
              onChange={(Event) => {
                SetModuleFilter(Event.target.value);
                SetLevelFilter("");
              }}
              title="Choose Module"
              aria-label="Choose Module"
            >
              <option value="" disabled>
                Choose Module
              </option>
              <option value="ALL">All Modules</option>
              {ModuleOptions.map(([Value, Label]) => (
                <option key={Value} value={Value}>
                  {Label}
                </option>
              ))}
            </select>
            <select
              className="math-input"
              value={LevelFilter}
              onChange={(Event) => SetLevelFilter(Event.target.value)}
              title="Choose Level"
              aria-label="Choose Level"
            >
              <option value="" disabled>
                Choose Level
              </option>
              <option value="ALL">All Levels</option>
              {LevelOptions.map((Value) => (
                <option key={Value} value={Value}>
                  {Value}
                </option>
              ))}
            </select>
          </div>
        </div>

        {PromotionHistoryQuery.isLoading ? (
          <LoadingState label="Loading promotion history..." />
        ) : PromotionHistoryQuery.isError ? (
          <ErrorState message={apiErrorMessage(PromotionHistoryQuery.error)} />
        ) : FilteredPromotionItems.length ? (
          <PromotionHistoryTable Items={FilteredPromotionItems} />
        ) : (
          <EmptyState message="No promotion history records match the selected filters." />
        )}
      </section>
    </AppShell>
  );
}
