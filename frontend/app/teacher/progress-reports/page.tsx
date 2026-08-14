"use client";

import { AppShell } from "@/components/common/AppShell";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { NotificationTargetBanner } from "@/components/common/NotificationTargetBanner";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import {
  downloadTeacherParentReportDelivery,
  getTeacherParentReportDeliveries,
  type TeacherParentReportDelivery,
} from "@/lib/api/teacher";
import { formatMathPathDateTime } from "@/lib/date";
import { CreatePersistedUiStateKey, usePersistentUiState } from "@/lib/persistedUiState";
import { CompareStudentCodes } from "@/lib/studentSort";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileBarChart,
  Search,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

const ProgressReportsStateKey = CreatePersistedUiStateKey("teacher", "progress-reports");

function triggerBlobDownload(BlobValue: Blob, FileName: string) {
  const Url = window.URL.createObjectURL(BlobValue);
  const Anchor = document.createElement("a");
  Anchor.href = Url;
  Anchor.download = FileName;
  document.body.appendChild(Anchor);
  Anchor.click();
  Anchor.remove();
  window.URL.revokeObjectURL(Url);
}

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
    <div className="math-teacher-light-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl rounded-[24px] border border-rose-200/70 bg-white/85 p-4 shadow-sm ring-1 ring-rose-100/80 dark:border-white/10 dark:bg-slate-950/75 dark:ring-white/10">
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      {Icon && (
        <div className="math-teacher-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
          {Icon}
        </div>
      )}
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-700 transition-colors duration-300 group-hover:text-[var(--mp-role-primary)] dark:text-slate-300">
        {Label}
      </p>
      <p className="relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--mp-role-primary)] dark:text-white">
        {Value}
      </p>
    </div>
  );
}

type ProgressReportStudentGroup = {
  StudentKey: string;
  StudentName: string;
  StudentCode: string;
  Items: TeacherParentReportDelivery[];
};

function BuildProgressReportStudentGroups(
  Items: TeacherParentReportDelivery[],
): ProgressReportStudentGroup[] {
  const StudentMap = new Map<string, ProgressReportStudentGroup>();

  Items.forEach((Item) => {
    const StudentKey = String(Item.studentId || Item.studentCode || Item.studentName || "Student");
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
        const FirstTime = First.publishedToTeacherAt ? new Date(First.publishedToTeacherAt).getTime() : 0;
        const SecondTime = Second.publishedToTeacherAt ? new Date(Second.publishedToTeacherAt).getTime() : 0;
        return SecondTime - FirstTime;
      }),
    }))
    .sort((First, Second) => CompareStudentCodes(First.StudentCode, Second.StudentCode));
}

function ProgressReportRecordTable({
  Items,
  HighlightId,
  DownloadingId,
  OnDownload,
}: {
  Items: TeacherParentReportDelivery[];
  HighlightId: string;
  DownloadingId: string | null;
  OnDownload: (Item: TeacherParentReportDelivery) => void;
}) {
  return (
    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="w-full overflow-x-auto">
        <div className="min-w-[700px] xl:min-w-0">
          <div className="math-teacher-promotion-history-table-header grid grid-cols-[.7fr_.7fr_1.3fr_1fr_.9fr] items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 text-xs font-black uppercase tracking-[0.14em] text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
            <div>Module</div>
            <div>Level</div>
            <div>Assessment</div>
            <div>Published Date</div>
            <div>Download</div>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {Items.map((Item) => {
              const IsHighlighted = Boolean(HighlightId) && Item.id === HighlightId;
              const IsDownloading = DownloadingId === Item.id;
              return (
                <div
                  key={Item.id}
                  data-notification-target={IsHighlighted ? "progress-report-row" : undefined}
                  className={`grid grid-cols-[.7fr_.7fr_1.3fr_1fr_.9fr] items-center gap-3 px-4 py-4 transition hover:bg-[color:var(--mp-role-softer)] dark:hover:bg-slate-900/70 ${IsHighlighted ? "bg-teal-50 ring-2 ring-inset ring-teal-300 dark:bg-teal-950/30 dark:ring-teal-500/50" : ""}`}
                >
                  <div className="flex min-w-0 items-center">
                    <Chip Tone="blue">{Item.moduleCode || "—"}</Chip>
                  </div>
                  <div className="flex min-w-0 items-center">
                    <Chip Tone="purple">{Item.levelCode || "—"}</Chip>
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                      {Item.assessmentTitle || Item.levelLabel || "Assessment"}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
                      {Item.moduleLabel}
                    </p>
                  </div>
                  <div className="text-sm font-bold text-slate-600 dark:text-slate-300">
                    {Item.publishedToTeacherAt ? formatMathPathDateTime(Item.publishedToTeacherAt) : "—"}
                  </div>
                  <div>
                    <button
                      type="button"
                      className="math-role-action-button math-role-row-action"
                      onClick={() => OnDownload(Item)}
                      disabled={IsDownloading}
                    >
                      <Download size={14} />
                      {IsDownloading ? "Downloading" : "Download"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressReportsAccordion({
  Items,
  HighlightId,
  HighlightStudentKey,
  DownloadingId,
  OnDownload,
}: {
  Items: TeacherParentReportDelivery[];
  HighlightId: string;
  HighlightStudentKey: string;
  DownloadingId: string | null;
  OnDownload: (Item: TeacherParentReportDelivery) => void;
}) {
  const [ExpandedStudents, SetExpandedStudents] = usePersistentUiState<Record<string, boolean>>(
    CreatePersistedUiStateKey(ProgressReportsStateKey, "expanded-students"),
    {},
  );
  const StudentGroups = BuildProgressReportStudentGroups(Items);

  useEffect(() => {
    if (!HighlightStudentKey) return;
    SetExpandedStudents((Current) => ({ ...Current, [HighlightStudentKey]: true }));
  }, [HighlightStudentKey, SetExpandedStudents]);

  useEffect(() => {
    if (!HighlightId) return;
    const TimeoutId = window.setTimeout(() => {
      document
        .querySelector("[data-notification-target='progress-report-row']")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => window.clearTimeout(TimeoutId);
  }, [HighlightId]);

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
              title={IsExpanded ? "Hide Progress Reports" : "Show Progress Reports"}
              aria-label={IsExpanded ? "Hide Progress Reports" : "Show Progress Reports"}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--mp-role-softer)] text-[color:var(--mp-role-readable)] ring-1 ring-[color:var(--mp-role-border)]">
                  {IsExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950 dark:text-white">
                    {Group.StudentName}
                  </p>
                  <p className="mt-0.5 text-xs font-black uppercase tracking-[0.12em] text-[#7a1f58] dark:text-rose-100">
                    {Group.StudentCode}
                  </p>
                </div>
              </div>
              <Chip Tone="purple">
                {Group.Items.length} Report{Group.Items.length === 1 ? "" : "s"}
              </Chip>
            </button>
            {IsExpanded ? (
              <div className="border-t border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/40">
                <ProgressReportRecordTable
                  Items={Group.Items}
                  HighlightId={HighlightId}
                  DownloadingId={DownloadingId}
                  OnDownload={OnDownload}
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function TeacherProgressReportsPage() {
  const Ready = useProtectedPage(["TEACHER"]);
  const SearchParams = useSearchParams();
  const [SearchValue, SetSearchValue] = usePersistentUiState(CreatePersistedUiStateKey(ProgressReportsStateKey, "search"), "");
  const [ModuleFilter, SetModuleFilter] = usePersistentUiState(CreatePersistedUiStateKey(ProgressReportsStateKey, "module-filter"), "");
  const [LevelFilter, SetLevelFilter] = usePersistentUiState(CreatePersistedUiStateKey(ProgressReportsStateKey, "level-filter"), "");
  const [DismissedTarget, SetDismissedTarget] = useState(false);
  const [DownloadingId, SetDownloadingId] = useState<string | null>(null);

  const ReportsQuery = useQuery({
    queryKey: ["teacher-progress-reports"],
    queryFn: () => getTeacherParentReportDeliveries(),
    enabled: Ready,
  });

  const Items = ReportsQuery.data?.logs ?? [];

  const DownloadMutation = useMutation({
    mutationFn: async (Item: TeacherParentReportDelivery) => {
      SetDownloadingId(Item.id);
      return {
        BlobValue: await downloadTeacherParentReportDelivery(Item.id),
        FileName: Item.fileName || `${Item.studentName || "Student"}-Progress-Report.pdf`,
      };
    },
    onSuccess: ({ BlobValue, FileName }) => triggerBlobDownload(BlobValue, FileName),
    onError: (Error) => window.alert(apiErrorMessage(Error)),
    onSettled: () => SetDownloadingId(null),
  });

  const NotificationTarget = useMemo(() => {
    const ReportDeliveryId = SearchParams.get("reportDeliveryId") || "";
    const HighlightId = SearchParams.get("highlightId") || "";
    return {
      ReportDeliveryId,
      HighlightId,
      StudentCode: SearchParams.get("studentCode") || "",
      HasTarget: Boolean(ReportDeliveryId || HighlightId || SearchParams.get("studentCode")),
    };
  }, [SearchParams]);

  const MatchedItem = useMemo(() => {
    if (!NotificationTarget.HasTarget || !Items.length) return null;
    return (
      Items.find((Item) => {
        const DeliveryMatch = NotificationTarget.ReportDeliveryId && Item.id === NotificationTarget.ReportDeliveryId;
        const HighlightMatch = NotificationTarget.HighlightId && Item.id === NotificationTarget.HighlightId;
        const ContextMatch = NotificationTarget.StudentCode && Item.studentCode === NotificationTarget.StudentCode;
        return DeliveryMatch || HighlightMatch || ContextMatch;
      }) || null
    );
  }, [Items, NotificationTarget]);

  const ModuleOptions = useMemo(() => {
    const ModuleMap = new Map<string, string>();
    Items.forEach((Item) => {
      const Code = String(Item.moduleCode || "Module");
      const Label = Item.moduleLabel && Item.moduleLabel !== Code ? Item.moduleLabel : Code;
      if (!ModuleMap.has(Code)) ModuleMap.set(Code, Label);
    });
    return Array.from(ModuleMap.entries()).sort((First, Second) =>
      First[1].localeCompare(Second[1], undefined, { numeric: true }),
    );
  }, [Items]);

  const LevelOptions = useMemo(() => {
    const SourceItems =
      ModuleFilter && ModuleFilter !== "ALL"
        ? Items.filter((Item) => String(Item.moduleCode || "Module") === ModuleFilter)
        : Items;
    return Array.from(new Set(SourceItems.map((Item) => String(Item.levelCode || "Level")).filter(Boolean))).sort(
      (First, Second) => First.localeCompare(Second, undefined, { numeric: true }),
    );
  }, [Items, ModuleFilter]);

  const FilteredItems = useMemo(() => {
    const Query = SearchValue.trim().toLowerCase();
    return Items.filter((Item) => {
      const MatchesSearch =
        !Query ||
        [Item.studentName, Item.studentCode, Item.assessmentTitle, Item.moduleCode, Item.moduleLabel, Item.levelCode, Item.levelLabel]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(Query);
      const MatchesModule = !ModuleFilter || ModuleFilter === "ALL" || String(Item.moduleCode || "Module") === ModuleFilter;
      const MatchesLevel = !LevelFilter || LevelFilter === "ALL" || String(Item.levelCode || "Level") === LevelFilter;
      return MatchesSearch && MatchesModule && MatchesLevel;
    });
  }, [Items, SearchValue, ModuleFilter, LevelFilter]);

  const StudentCount = useMemo(() => BuildProgressReportStudentGroups(Items).length, [Items]);

  if (!Ready) return null;

  return (
    <AppShell title="Progress Reports">
      <section className="mx-auto max-w-[1680px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="math-hero p-6">
          <p className="math-block-header">
            <FileBarChart size={14} />
            Parent Progress Reports
          </p>
          <h1 className="math-title mt-3 text-4xl font-black tracking-tight text-slate-950 dark:text-white">
            Progress Reports
          </h1>
          <p className="math-subtitle">
            Review and download the parent progress reports the admin has published for your assigned students.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric Label="Students With Reports" Value={StudentCount} Icon={<FileBarChart size={15} />} />
            <Metric Label="Total Reports" Value={Items.length} Icon={<FileBarChart size={15} />} />
          </div>
        </div>

        <div className="rounded-[28px] bg-white/90 p-5 shadow-sm dark:bg-slate-950/80">
          <div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]">
            <div className="relative">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                className="math-input pl-11"
                value={SearchValue}
                onChange={(Event) => SetSearchValue(Event.target.value)}
                placeholder="Search Progress Reports"
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

        {NotificationTarget.HasTarget && !DismissedTarget ? (
          <NotificationTargetBanner
            tone="teal"
            label="Parent Report"
            title="Progress Report Published"
            description={`${NotificationTarget.StudentCode || "A student's"} progress report is highlighted below.`}
            actionLabel="View Report"
            onAction={() => {
              document
                .querySelector("[data-notification-target='progress-report-row']")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            onDismiss={() => SetDismissedTarget(true)}
          />
        ) : null}

        {ReportsQuery.isLoading ? (
          <LoadingState label="Loading progress reports..." />
        ) : ReportsQuery.isError ? (
          <ErrorState message={apiErrorMessage(ReportsQuery.error)} />
        ) : FilteredItems.length ? (
          <ProgressReportsAccordion
            Items={FilteredItems}
            HighlightId={MatchedItem?.id || ""}
            HighlightStudentKey={
              MatchedItem ? String(MatchedItem.studentId || MatchedItem.studentCode || MatchedItem.studentName || "Student") : ""
            }
            DownloadingId={DownloadingId}
            OnDownload={(Item) => DownloadMutation.mutate(Item)}
          />
        ) : (
          <EmptyState message="No published progress reports match the selected filters." />
        )}
      </section>
    </AppShell>
  );
}
