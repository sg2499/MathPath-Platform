"use client";

import React, { useEffect, useRef, useState } from "react";
import { Trophy, Users, AlertCircle, ChevronDown, Medal, Star } from "lucide-react";
import { AppShell } from "@/components/common/AppShell";
import { TeacherDpsLeaderboardAPI } from "@/lib/api-teacher-leaderboard";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useSearchParams } from "next/navigation";
import type {
  TeacherDpsHierarchyResponse,
  TeacherLeaderboardResponse,
  TeacherLeaderboardEntry,
} from "@/lib/schemas/teacher-leaderboard";
import type { ModuleSchema, LevelSchema } from "@/lib/schemas/leaderboard";
import { z } from "zod";
import { BadgeIconMap, getBadgeVisualConfig } from "@/lib/gamification/badgeVisuals";

// Small badge-chip cluster -- same convention as the student leaderboard
// pages (frontend/app/student/competition/dps-leaderboard/page.tsx) so a
// badge always looks the same everywhere it appears.
function TopBadgeChips({ badges, size = "sm" }: { badges?: any[]; size?: "sm" | "xs" }) {
  if (!badges || badges.length === 0) return null;
  const dim = size === "xs" ? "w-6 h-6" : "w-7 h-7";
  const iconDim = size === "xs" ? 12 : 14;
  return (
    <div className="flex items-center -space-x-2">
      {badges.map((b) => {
        const Icon = BadgeIconMap[b.iconName] || BadgeIconMap.Target;
        const config = getBadgeVisualConfig(b.code, b.tier);
        return (
          <div
            key={b.id}
            title={`${b.name} (${b.tier})`}
            className={`relative ${dim} rounded-full flex items-center justify-center border-2 border-white dark:border-slate-900 shadow-md shrink-0`}
            style={{ background: config.customBg || config.unlockedBg, boxShadow: `0 0 8px ${config.bloomColor}` }}
          >
            <Icon size={iconDim} style={{ color: config.iconColorHex || "#ffffff" }} />
          </div>
        );
      })}
    </div>
  );
}

function getInitials(name: string) {
  if (!name) return "";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.substring(0, 2).toUpperCase();
}

const MEDAL_STYLE: Record<number, { ring: string; bg: string; text: string; label: string }> = {
  1: { ring: "ring-yellow-400", bg: "from-yellow-300 to-yellow-500", text: "text-yellow-600", label: "1st" },
  2: { ring: "ring-slate-300", bg: "from-slate-200 to-slate-400", text: "text-slate-500", label: "2nd" },
  3: { ring: "ring-orange-300", bg: "from-orange-300 to-orange-500", text: "text-orange-600", label: "3rd" },
};

function PodiumCard({ entry, rank, isHighlighted, cardRef }: { entry: TeacherLeaderboardEntry; rank: number; isHighlighted?: boolean; cardRef?: React.Ref<HTMLDivElement> }) {
  const style = MEDAL_STYLE[rank];
  return (
    <div ref={cardRef} className={`flex flex-col items-center gap-3 rounded-2xl transition-all ${isHighlighted ? "ring-4 ring-emerald-400 ring-offset-4 ring-offset-white dark:ring-offset-slate-950 animate-pulse p-2" : ""} ${rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3"}`}>
      <div className={`relative w-20 h-20 md:w-24 md:h-24 rounded-full ring-4 ${style.ring} overflow-hidden shadow-lg bg-slate-100 dark:bg-slate-800`}>
        {entry.photoUrl ? (
          <img src={entry.photoUrl} alt="avatar" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center font-black text-2xl text-slate-500">{getInitials(entry.name)}</div>
        )}
        <div className={`absolute -bottom-2 left-1/2 -translate-x-1/2 bg-gradient-to-br ${style.bg} text-white text-xs font-black px-2.5 py-1 rounded-full border-2 border-white dark:border-slate-900 shadow`}>
          {style.label}
        </div>
      </div>
      <div className="text-center max-w-[150px]">
        <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate flex items-center justify-center gap-1">
          {entry.name}
          {entry.isOwnStudent && <Star size={12} className="text-emerald-500 shrink-0" fill="currentColor" />}
        </p>
        <p className={`text-sm font-black ${style.text}`}>{Math.round(entry.percentage)}%</p>
        {entry.topBadges && entry.topBadges.length > 0 && (
          <div className="mt-1 flex justify-center"><TopBadgeChips badges={entry.topBadges} size="xs" /></div>
        )}
      </div>
    </div>
  );
}

function TableRow({ row, isHighlighted, rowRef }: { row: TeacherLeaderboardEntry; isHighlighted: boolean; rowRef?: React.Ref<HTMLTableRowElement> }) {
  return (
    <tr
      ref={rowRef}
      className={`transition-colors ${isHighlighted ? "bg-emerald-100 dark:bg-emerald-900/50 animate-pulse" : row.isOwnStudent ? "bg-emerald-50/60 dark:bg-emerald-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
    >
      <td className="px-6 py-4 font-black text-slate-500 dark:text-slate-400">#{row.rank}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/40 overflow-hidden flex-shrink-0">
            {row.photoUrl ? <img src={row.photoUrl} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-bold text-xs text-emerald-700">{getInitials(row.name)}</div>}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{row.name}</p>
            {row.isOwnStudent && (
              <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                <Star size={10} fill="currentColor" /> Your Student
              </span>
            )}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-center font-semibold text-sm text-slate-600 dark:text-slate-300">{row.sheetsCompleted ?? "—"}</td>
      <td className="px-6 py-4 text-center font-black text-sm text-slate-800 dark:text-slate-100">{Math.round(row.accuracy)}%</td>
      <td className="px-6 py-4 text-right hidden sm:table-cell font-semibold text-sm text-slate-500 dark:text-slate-400">
        {Math.floor(row.timeTakenSeconds / 60)}m {row.timeTakenSeconds % 60}s
      </td>
    </tr>
  );
}

export default function TeacherDpsLeaderboardPage() {
  useProtectedPage(["TEACHER"]);
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<z.infer<typeof ModuleSchema>[]>([]);
  const [levels, setLevels] = useState<z.infer<typeof LevelSchema>[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"OVERALL" | "SPECIFIC">("OVERALL");
  const [leaderboardData, setLeaderboardData] = useState<TeacherLeaderboardResponse | null>(null);

  const highlightStudentId = searchParams.get("highlightStudentId");
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  const highlightCardRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    async function loadHierarchy() {
      try {
        const data: TeacherDpsHierarchyResponse = await TeacherDpsLeaderboardAPI.getHierarchy();
        const fetchedModules = data.modules || [];
        const fetchedLevels = data.levels || [];
        setModules(fetchedModules);
        setLevels(fetchedLevels);

        const deepLinkViewMode = searchParams.get("viewMode");
        const deepLinkModuleId = searchParams.get("moduleId");
        const deepLinkLevelId = searchParams.get("levelId");
        if (deepLinkViewMode === "OVERALL" || deepLinkViewMode === "SPECIFIC") setViewMode(deepLinkViewMode);

        let targetModuleId: string | null = null;
        let targetLevelId: string | null = null;

        if (deepLinkModuleId && fetchedModules.some((m) => m.id === deepLinkModuleId)) {
          targetModuleId = deepLinkModuleId;
        } else if (fetchedModules.length > 0) {
          targetModuleId = fetchedModules[0].id;
        }

        if (deepLinkLevelId && fetchedLevels.some((l) => l.id === deepLinkLevelId)) {
          targetLevelId = deepLinkLevelId;
          const owningModuleId = fetchedLevels.find((l) => l.id === deepLinkLevelId)?.moduleId;
          if (owningModuleId) targetModuleId = owningModuleId;
        } else if (targetModuleId) {
          const modLevels = fetchedLevels.filter((l) => l.moduleId === targetModuleId);
          if (modLevels.length > 0) targetLevelId = modLevels[0].id;
        }

        setSelectedModuleId(targetModuleId);
        setSelectedLevelId(targetLevelId);
      } catch (err: any) {
        setError(err.message || "Failed to load hierarchy");
      } finally {
        setLoading(false);
      }
    }
    loadHierarchy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleModuleChange = (moduleId: string) => {
    setSelectedModuleId(moduleId);
    const modLevels = levels.filter((l) => l.moduleId === moduleId);
    setSelectedLevelId(modLevels.length > 0 ? modLevels[0].id : null);
  };

  useEffect(() => {
    if (viewMode === "OVERALL" && !selectedModuleId) return;
    if (viewMode === "SPECIFIC" && !selectedLevelId) return;
    async function loadLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        const data =
          viewMode === "OVERALL"
            ? await TeacherDpsLeaderboardAPI.getOverallLeaderboard(selectedModuleId as string)
            : await TeacherDpsLeaderboardAPI.getSpecificLeaderboard(selectedLevelId as string);
        setLeaderboardData(data);
      } catch (err: any) {
        setError("Failed to load leaderboard. Our engineers have been notified.");
      } finally {
        setLoading(false);
      }
    }
    loadLeaderboard();
  }, [selectedModuleId, selectedLevelId, viewMode]);

  useEffect(() => {
    if (!highlightStudentId) return;
    const target = highlightCardRef.current || highlightRowRef.current;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightStudentId, leaderboardData]);

  const availableLevels = levels.filter((l) => l.moduleId === selectedModuleId);
  const leaderboard = leaderboardData?.leaderboard || [];
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <AppShell title="DPS Leaderboard">
      <div className="math-role-teacher math-page space-y-6">
        <div className="math-card p-6 md:p-8 rounded-3xl">
          <div className="math-block-header mb-3"><Trophy size={16} className="text-yellow-500" /> Leaderboard</div>
          <h1 className="math-title mb-2">DPS Leaderboard</h1>
          <p className="math-subtitle">See how your students rank on daily practice sheets, across the whole class.</p>

          <div className="mt-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-t border-slate-100 dark:border-slate-800 pt-6">
            <div className="flex gap-3 w-fit">
              <button
                onClick={() => setViewMode("OVERALL")}
                className={`px-5 py-2.5 rounded-xl font-black text-sm tracking-widest uppercase transition-all ${viewMode === "OVERALL" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" : "bg-white dark:bg-slate-800 text-slate-500 hover:text-emerald-500"}`}
              >
                Overall Journey
              </button>
              <button
                onClick={() => setViewMode("SPECIFIC")}
                className={`px-5 py-2.5 rounded-xl font-black text-sm tracking-widest uppercase transition-all ${viewMode === "SPECIFIC" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" : "bg-white dark:bg-slate-800 text-slate-500 hover:text-emerald-500"}`}
              >
                Specific Level
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
              <div className="relative min-w-[180px] flex-1 xl:flex-none">
                <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">Module</label>
                <div className="relative">
                  <select
                    value={selectedModuleId || ""}
                    onChange={(e) => handleModuleChange(e.target.value)}
                    className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none"
                  >
                    {modules.length > 0 ? modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>) : <option disabled value="">No modules available</option>}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {viewMode === "SPECIFIC" && (
                <div className="relative min-w-[180px] flex-1 xl:flex-none">
                  <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">Level</label>
                  <div className="relative">
                    <select
                      value={selectedLevelId || ""}
                      onChange={(e) => setSelectedLevelId(e.target.value)}
                      className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-emerald-500 focus:outline-none"
                    >
                      {availableLevels.length > 0 ? availableLevels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>) : <option disabled value="">No levels available</option>}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {loading && <LoadingState />}

        {!loading && error && (
          <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-3xl border-2 border-red-100 dark:border-red-900/40">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <p className="text-lg font-bold text-slate-500">{error}</p>
          </div>
        )}

        {!loading && !error && leaderboard.length === 0 && (
          <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-100 dark:border-slate-800">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-lg font-bold text-slate-500">No DPS attempts recorded yet for this {viewMode === "OVERALL" ? "module" : "level"}</p>
          </div>
        )}

        {!loading && !error && leaderboard.length > 0 && (
          <>
            {top3.length > 0 && (
              <div className="math-card rounded-3xl p-8 flex items-end justify-center gap-6">
                {top3[1] && <PodiumCard entry={top3[1]} rank={2} isHighlighted={top3[1].studentId === highlightStudentId} cardRef={top3[1].studentId === highlightStudentId ? highlightCardRef : undefined} />}
                {top3[0] && <PodiumCard entry={top3[0]} rank={1} isHighlighted={top3[0].studentId === highlightStudentId} cardRef={top3[0].studentId === highlightStudentId ? highlightCardRef : undefined} />}
                {top3[2] && <PodiumCard entry={top3[2]} rank={3} isHighlighted={top3[2].studentId === highlightStudentId} cardRef={top3[2].studentId === highlightStudentId ? highlightCardRef : undefined} />}
              </div>
            )}

            <div className="math-card rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-5">Rank</th>
                      <th className="px-6 py-5">Student</th>
                      <th className="px-6 py-5 text-center">Sheets</th>
                      <th className="px-6 py-5 text-center">Avg Accuracy</th>
                      <th className="px-6 py-5 text-right hidden sm:table-cell">Avg Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    {rest.map((row) => (
                      <TableRow
                        key={row.studentId}
                        row={row}
                        isHighlighted={row.studentId === highlightStudentId}
                        rowRef={row.studentId === highlightStudentId ? highlightRowRef : undefined}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
