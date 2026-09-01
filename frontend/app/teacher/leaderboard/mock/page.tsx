"use client";

import React, { useEffect, useRef, useState, Suspense } from "react";
import { Trophy, Users, AlertCircle, ChevronDown, Star } from "lucide-react";
import { AppShell } from "@/components/common/AppShell";
import { TeacherMockLeaderboardAPI } from "@/lib/api-teacher-leaderboard";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { useSearchParams } from "next/navigation";
import type {
  TeacherMockHierarchyResponse,
  TeacherLeaderboardResponse,
  TeacherLeaderboardEntry,
} from "@/lib/schemas/teacher-leaderboard";
import type { ModuleSchema, LevelSchema, ExamSchema } from "@/lib/schemas/leaderboard";
import { z } from "zod";
import { motion } from "framer-motion";
import { BadgeIconMap, getBadgeVisualConfig } from "@/lib/gamification/badgeVisuals";
import { PodiumHeroAnimation } from "@/app/student/competition/leaderboard/PodiumHeroAnimation";

// Small badge-chip cluster -- same convention as the student leaderboard
// pages (frontend/app/student/competition/leaderboard/page.tsx).
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

// ============================================================================
// AAA Parallax Podium Card with Glass Foil & Gyroscope Hover -- the exact
// same visual card the student DPS/Mock leaderboards use (2026-09-01), so a
// podium looks like the same podium everywhere it appears. Clicking a podium
// card launches the same hero cutscene the student leaderboard uses, via
// onActivateHero -> PodiumHeroAnimation below.
// ============================================================================
function PodiumCard({ entry, rank, isHighlighted, cardRef, onActivateHero }: { entry: TeacherLeaderboardEntry; rank: number; isHighlighted?: boolean; cardRef?: React.Ref<HTMLDivElement>; onActivateHero?: () => void }) {
  const [physics, setPhysics] = useState({ rx: 0, ry: 0, px: 0, py: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const tiltRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tiltRef.current) return;
    const rect = tiltRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const ry = ((x / rect.width) - 0.5) * 40;
    const rx = ((0.5 - (y / rect.height))) * 40;
    const px = ((x / rect.width) - 0.5) * -30;
    const py = ((y / rect.height) - 0.5) * -30;
    setPhysics({ rx, ry, px, py });
  };
  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    setPhysics({ rx: 0, ry: 0, px: 0, py: 0 });
  };
  const handlePodiumClick = () => {
    if (onActivateHero) onActivateHero();
  };

  const config = rank === 1
    ? {
        color: "yellow", shadow: "rgba(250,204,21,0.6)", gradient: "from-yellow-300 to-yellow-600",
        pedestalGradient: "from-yellow-500 via-yellow-400 to-yellow-200", label: "1st",
        height: "h-[220px] md:h-[260px]", avatarSize: "w-24 h-24 md:w-28 md:h-28",
        shape: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)", bloom: "rgba(250,204,21,0.8)", delay: 0.6, textColor: "text-yellow-400"
      }
    : rank === 2
    ? {
        color: "slate", shadow: "rgba(148,163,184,0.5)", gradient: "from-slate-200 to-slate-400",
        pedestalGradient: "from-slate-400 via-slate-300 to-slate-200", label: "2nd",
        height: "h-[150px] md:h-[180px]", avatarSize: "w-20 h-20 md:w-24 md:h-24",
        shape: "polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)", bloom: "rgba(148,163,184,0.6)", delay: 0.5, textColor: "text-slate-200"
      }
    : {
        color: "orange", shadow: "rgba(249,115,22,0.5)", gradient: "from-orange-300 to-orange-500",
        pedestalGradient: "from-orange-400 to-orange-200", label: "3rd",
        height: "h-[100px] md:h-[120px]", avatarSize: "w-16 h-16 md:w-20 md:h-20",
        shape: "polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)", bloom: "rgba(249,115,22,0.6)", delay: 0.4, textColor: "text-orange-400"
      };

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 150 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 150, damping: 20, delay: config.delay }}
      className={`flex flex-col items-center relative z-10 ${rank === 1 ? "order-2" : rank === 2 ? "order-1" : "order-3"} ${isHighlighted ? "ring-4 ring-[var(--mp-role-primary)] ring-offset-4 ring-offset-white dark:ring-offset-slate-950 rounded-3xl animate-pulse p-2" : ""}`}
      style={{ zIndex: rank === 1 ? 20 : rank === 2 ? 10 : 5 }}
    >
      <div
        ref={tiltRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handlePodiumClick}
        className="relative mb-5 cursor-pointer transform-gpu transition-transform duration-300 ease-out group"
        style={{ transform: `rotateX(${physics.rx}deg) rotateY(${physics.ry}deg) scale(${isHovered ? 1.08 : 1})` }}
      >
        {/* Massive Hover Bloom */}
        <div
          className="absolute inset-0 rounded-full blur-[30px] transition-all duration-500 z-0 pointer-events-none"
          style={{ backgroundColor: config.bloom, opacity: isHovered ? 1 : 0.2, transform: isHovered ? 'scale(1.8)' : 'scale(1.2)' }}
        />

        {/* 1st Place Crown */}
        {rank === 1 && (
          <div className="absolute -top-12 left-1/2 drop-shadow-[0_0_30px_rgba(250,204,21,1)] z-30 pointer-events-none"
               style={{ transform: `translateX(-50%) scale(${isHovered ? 1.3 : 1})` }}>
             <CrownIcon />
          </div>
        )}

        {/* 1st Place Apex Aura */}
        {rank === 1 && (
          <div className="absolute inset-0 z-[-1] pointer-events-none scale-[1.6] opacity-80 animate-[spin_20s_linear_infinite] flex items-center justify-center">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-[0_0_20px_rgba(250,204,21,0.8)] text-yellow-500/80 fill-current">
              <path d="M100 0 L105 45 L150 20 L130 60 L185 65 L145 90 L195 125 L145 130 L165 175 L120 150 L110 195 L90 155 L45 185 L65 145 L10 140 L50 115 L0 80 L50 75 L30 30 L75 55 Z" />
            </svg>
          </div>
        )}

        {/* Gyroscopic Avatar Rings */}
        <div className={`relative ${config.avatarSize} z-10 transition-transform duration-300 ease-out`}
             style={{ transform: isHovered ? `translateZ(60px) translateX(${physics.px}px) translateY(${physics.py}px)` : 'translateZ(0)' }}>
          <div className={`w-full h-full rounded-full border-[4px] border-white dark:border-slate-900 overflow-hidden bg-${config.color}-50 relative z-20 shadow-[0_0_40px_${config.shadow}]`}>
             {entry.photoUrl ? (
                <img src={entry.photoUrl} alt="avatar" className="w-full h-full object-cover" />
             ) : (
                <div className={`w-full h-full flex items-center justify-center font-black text-3xl text-${config.color}-600 bg-${config.color}-100`}>
                   {getInitials(entry.name)}
                </div>
             )}
          </div>
          <div className={`absolute inset-[-15%] rounded-full border-2 border-dashed border-${config.color}-400/50 z-10 transition-all duration-700 ${isHovered ? 'opacity-100 animate-[spin_4s_linear_infinite]' : 'opacity-0 scale-50'}`} style={{ transformStyle: 'preserve-3d', transform: 'rotateX(45deg)' }} />
          <div className={`absolute inset-[-25%] rounded-full border-2 border-solid border-${config.color}-300/30 z-10 transition-all duration-1000 ${isHovered ? 'opacity-100 animate-[spin_6s_linear_infinite_reverse]' : 'opacity-0 scale-50'}`} style={{ transformStyle: 'preserve-3d', transform: 'rotateY(45deg)' }} />
        </div>

        {/* Rank Label */}
        <div className={`absolute -bottom-4 -right-2 bg-gradient-to-br ${config.gradient} text-white text-[12px] md:text-sm font-black px-3 py-1.5 rounded-full border-2 border-white shadow-[0_10px_20px_rgba(0,0,0,0.3)] uppercase tracking-widest z-30 transition-transform duration-300`}
             style={{ transform: isHovered ? 'translateZ(80px) scale(1.1)' : 'translateZ(0)' }}>
           {config.label}
        </div>
      </div>

      <div className="text-center mb-3 relative z-30 drop-shadow-lg bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 w-56 md:w-64 mx-auto">
        <p className={`font-black text-sm md:text-base text-white truncate flex items-center justify-center gap-1.5 ${rank === 1 ? 'drop-shadow-[0_0_15px_rgba(250,204,21,1)]' : ''}`}>
          {entry.name}
          {entry.isOwnStudent && <Star size={12} className="text-[var(--mp-role-accent)] shrink-0" fill="currentColor" />}
        </p>
        <p className={`text-xs md:text-sm font-black ${config.textColor} mt-0.5 drop-shadow-md`}>{Math.round(entry.percentage)}%</p>
        {entry.topBadges && entry.topBadges.length > 0 && (
          <div className="mt-2 flex justify-center">
            <TopBadgeChips badges={entry.topBadges} size="sm" />
          </div>
        )}
      </div>

      {/* AAA Geometric Pedestal with Glass Foil Glare */}
      <motion.div
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 15, delay: config.delay }}
        className={`w-28 md:w-40 ${config.height} bg-gradient-to-t ${config.pedestalGradient} relative overflow-hidden flex items-end justify-center pb-2 md:pb-4 border-b-[8px] border-white/40 shadow-[inset_0_0_30px_rgba(255,255,255,0.5)] cursor-pointer group`}
        style={{ clipPath: config.shape, filter: `drop-shadow(0 -10px 40px ${config.shadow})`, transformOrigin: "bottom" }}
        onClick={handlePodiumClick}
      >
        <div className="absolute top-0 -left-[100%] w-1/2 h-[200%] bg-gradient-to-r from-transparent via-white/60 to-transparent skew-x-[-45deg] transition-all duration-700 ease-in-out group-hover:left-[200%] z-10" />
        <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-500 z-0" style={{ opacity: isHovered ? 0.5 : 0 }} />
        <span className={`text-7xl md:text-8xl font-black text-${config.color}-700/30 drop-shadow-md transition-all duration-500 z-20`}
              style={{ transform: isHovered ? 'scale(1.1) translateY(-10px)' : 'scale(1)', textShadow: isHovered ? `0 0 30px ${config.shadow}` : 'none' }}>
          {rank}
        </span>
      </motion.div>
    </motion.div>
  );
}

function CrownIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="#EAB308" xmlns="http://www.w3.org/2000/svg">
      <path d="M2 22H22V20H2V22ZM21.6 6.3L17.2 13.5L12.5 4.5C12.3 4.2 11.7 4.2 11.5 4.5L6.8 13.5L2.4 6.3C2.1 5.9 1.4 6 1.3 6.5L3 18H21L22.7 6.5C22.6 6 21.9 5.9 21.6 6.3Z" fill="currentColor"/>
    </svg>
  );
}

function TableRow({ row, isHighlighted, rowRef }: { row: TeacherLeaderboardEntry; isHighlighted: boolean; rowRef?: React.Ref<HTMLTableRowElement> }) {
  return (
    <tr
      ref={rowRef}
      className={`group transition-colors ${isHighlighted ? "bg-[var(--mp-role-primary)]/15 ring-2 ring-inset ring-[var(--mp-role-primary)] animate-pulse z-10 relative" : row.isOwnStudent ? "bg-[var(--mp-role-primary)]/5" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
    >
      <td className="px-6 py-4 font-black text-slate-500 dark:text-slate-400 group-hover:text-[var(--mp-role-primary)] transition-colors">#{row.rank}</td>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-[var(--mp-role-accent)] dark:bg-[var(--mp-role-primary)]/40 overflow-hidden flex-shrink-0 shadow-sm ring-1 ring-[var(--mp-role-primary)]/15">
            {row.photoUrl ? <img src={row.photoUrl} alt="avatar" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-black text-xs text-[var(--mp-role-primary)] dark:text-[var(--mp-role-accent)]">{getInitials(row.name)}</div>}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">{row.name}</p>
            {row.isOwnStudent && (
              <span className="inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide text-[var(--mp-role-primary)]">
                <Star size={10} fill="currentColor" /> Your Student
              </span>
            )}
          </div>
          {row.topBadges && row.topBadges.length > 0 && <TopBadgeChips badges={row.topBadges} size="xs" />}
        </div>
      </td>
      <td className="px-6 py-4 text-center font-black text-sm text-slate-800 dark:text-slate-100">{Math.round(row.accuracy)}%</td>
      <td className="px-6 py-4 text-right hidden sm:table-cell font-black text-sm text-slate-700 dark:text-slate-300">
        {Math.floor(row.timeTakenSeconds / 60)}m {row.timeTakenSeconds % 60}s
      </td>
    </tr>
  );
}

function TeacherMockLeaderboardPageInner() {
  useProtectedPage(["TEACHER"]);
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<z.infer<typeof ModuleSchema>[]>([]);
  const [levels, setLevels] = useState<z.infer<typeof LevelSchema>[]>([]);
  const [exams, setExams] = useState<z.infer<typeof ExamSchema>[]>([]);
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"CUMULATIVE" | "INDIVIDUAL">("CUMULATIVE");
  const [leaderboardData, setLeaderboardData] = useState<TeacherLeaderboardResponse | null>(null);

  const highlightStudentId = searchParams.get("highlightStudentId");
  const highlightRowRef = useRef<HTMLTableRowElement | null>(null);
  const highlightCardRef = useRef<HTMLDivElement | null>(null);
  const [activeHeroRank, setActiveHeroRank] = useState<1 | 2 | 3 | null>(null);

  useEffect(() => {
    async function loadHierarchy() {
      try {
        const data: TeacherMockHierarchyResponse = await TeacherMockLeaderboardAPI.getHierarchy();
        const fetchedModules = data.modules || [];
        const fetchedLevels = data.levels || [];
        const fetchedExams = data.exams || [];
        setModules(fetchedModules);
        setLevels(fetchedLevels);
        setExams(fetchedExams);

        const deepLinkViewMode = searchParams.get("viewMode");
        const deepLinkLevelId = searchParams.get("levelId");
        const deepLinkExamId = searchParams.get("examId");
        if (deepLinkViewMode === "CUMULATIVE" || deepLinkViewMode === "INDIVIDUAL") setViewMode(deepLinkViewMode);

        let targetModuleId: string | null = null;
        let targetLevelId: string | null = null;
        let targetExamId: string | null = null;

        if (deepLinkLevelId && fetchedLevels.some((l) => l.id === deepLinkLevelId)) {
          targetLevelId = deepLinkLevelId;
          targetModuleId = fetchedLevels.find((l) => l.id === deepLinkLevelId)?.moduleId || null;
        } else if (fetchedModules.length > 0) {
          targetModuleId = fetchedModules[0].id;
          const modLevels = fetchedLevels.filter((l) => l.moduleId === targetModuleId);
          if (modLevels.length > 0) targetLevelId = modLevels[0].id;
        }

        if (deepLinkExamId && fetchedExams.some((e) => e.id === deepLinkExamId)) {
          targetExamId = deepLinkExamId;
        } else if (targetLevelId) {
          const lvlExams = fetchedExams.filter((e) => e.levelId === targetLevelId);
          if (lvlExams.length > 0) targetExamId = lvlExams[0].id;
        }

        setSelectedModuleId(targetModuleId);
        setSelectedLevelId(targetLevelId);
        setSelectedExamId(targetExamId);
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
    const firstLevelId = modLevels.length > 0 ? modLevels[0].id : null;
    setSelectedLevelId(firstLevelId);
    const lvlExams = firstLevelId ? exams.filter((e) => e.levelId === firstLevelId) : [];
    setSelectedExamId(lvlExams.length > 0 ? lvlExams[0].id : null);
  };

  const handleLevelChange = (levelId: string) => {
    setSelectedLevelId(levelId);
    const lvlExams = exams.filter((e) => e.levelId === levelId);
    setSelectedExamId(lvlExams.length > 0 ? lvlExams[0].id : null);
  };

  useEffect(() => {
    if (viewMode === "CUMULATIVE" && !selectedLevelId) return;
    if (viewMode === "INDIVIDUAL" && (!selectedExamId || !selectedLevelId)) return;
    async function loadLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        const data =
          viewMode === "CUMULATIVE"
            ? await TeacherMockLeaderboardAPI.getCumulativeLeaderboard(selectedLevelId as string)
            : await TeacherMockLeaderboardAPI.getSpecificLeaderboard(selectedExamId as string, selectedLevelId as string);
        setLeaderboardData(data);
      } catch (err: any) {
        setError("Failed to load leaderboard. Our engineers have been notified.");
      } finally {
        setLoading(false);
      }
    }
    loadLeaderboard();
  }, [selectedLevelId, selectedExamId, viewMode]);

  useEffect(() => {
    if (!highlightStudentId) return;
    const target = highlightCardRef.current || highlightRowRef.current;
    if (target) target.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightStudentId, leaderboardData]);

  const availableLevels = levels.filter((l) => l.moduleId === selectedModuleId);
  const availableExams = exams.filter((e) => e.levelId === selectedLevelId);
  const leaderboard = leaderboardData?.leaderboard || [];
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  return (
    <AppShell title="Mock Leaderboard">
      <div className="math-role-teacher math-page space-y-6">
        <PodiumHeroAnimation
          rank={activeHeroRank}
          viewMode={viewMode}
          student={activeHeroRank ? top3[activeHeroRank - 1] : undefined}
          onComplete={() => setActiveHeroRank(null)}
        />
        <div className="math-card p-6 md:p-8 rounded-3xl">
          <div className="math-block-header mb-3"><Trophy size={16} className="text-yellow-500" /> Leaderboard</div>
          <h1 className="math-title mb-2">Mock Exam Leaderboard</h1>
          <p className="math-subtitle">See how your students rank in competition mock exams, across the whole class.</p>

          <div className="mt-6 flex flex-col xl:flex-row xl:items-center justify-between gap-6 border-t border-slate-100 dark:border-slate-800 pt-6">
            <div className="flex gap-3 w-fit">
              <button
                onClick={() => setViewMode("CUMULATIVE")}
                className={`px-5 py-2.5 rounded-xl font-black text-sm tracking-widest uppercase transition-all shadow-sm ${viewMode === "CUMULATIVE" ? "bg-[var(--mp-role-primary)] text-white shadow-lg shadow-[var(--mp-role-primary)]/30 ring-2 ring-[var(--mp-role-primary)] ring-offset-2 ring-offset-white dark:ring-offset-slate-950" : "bg-white dark:bg-slate-800 text-slate-500 hover:text-[var(--mp-role-primary)] hover:bg-[var(--mp-role-primary)]/5 dark:hover:bg-[var(--mp-role-primary)]/10"}`}
              >
                Overall Journey
              </button>
              <button
                onClick={() => setViewMode("INDIVIDUAL")}
                className={`px-5 py-2.5 rounded-xl font-black text-sm tracking-widest uppercase transition-all shadow-sm ${viewMode === "INDIVIDUAL" ? "bg-[var(--mp-role-primary)] text-white shadow-lg shadow-[var(--mp-role-primary)]/30 ring-2 ring-[var(--mp-role-primary)] ring-offset-2 ring-offset-white dark:ring-offset-slate-950" : "bg-white dark:bg-slate-800 text-slate-500 hover:text-[var(--mp-role-primary)] hover:bg-[var(--mp-role-primary)]/5 dark:hover:bg-[var(--mp-role-primary)]/10"}`}
              >
                Specific Exam
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 w-full xl:w-auto">
              <div className="relative min-w-[180px] flex-1 xl:flex-none">
                <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">Module</label>
                <div className="relative">
                  <select
                    value={selectedModuleId || ""}
                    onChange={(e) => handleModuleChange(e.target.value)}
                    className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-[var(--mp-role-primary)] focus:outline-none"
                  >
                    {modules.length > 0 ? modules.map((m) => <option key={m.id} value={m.id}>{m.name}</option>) : <option disabled value="">No modules available</option>}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="relative min-w-[180px] flex-1 xl:flex-none">
                <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">Level</label>
                <div className="relative">
                  <select
                    value={selectedLevelId || ""}
                    onChange={(e) => handleLevelChange(e.target.value)}
                    className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-[var(--mp-role-primary)] focus:outline-none"
                  >
                    {availableLevels.length > 0 ? availableLevels.map((l) => <option key={l.id} value={l.id}>{l.name}</option>) : <option disabled value="">No levels available</option>}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              {viewMode === "INDIVIDUAL" && (
                <div className="relative min-w-[220px] flex-1 xl:flex-none">
                  <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">Exam</label>
                  <div className="relative">
                    <select
                      value={selectedExamId || ""}
                      onChange={(e) => setSelectedExamId(e.target.value)}
                      className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-[var(--mp-role-primary)] focus:outline-none"
                    >
                      {availableExams.length > 0 ? availableExams.map((ex) => <option key={ex.id} value={ex.id}>{ex.title}</option>) : <option disabled value="">No exams available</option>}
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
            <p className="text-lg font-bold text-slate-500">No mock exam results recorded yet for this {viewMode === "CUMULATIVE" ? "level" : "exam"}</p>
          </div>
        )}

        {!loading && !error && leaderboard.length > 0 && (
          <>
            {top3.length > 0 && (
              <div className="math-card rounded-3xl p-8 pt-16 md:pt-20 flex items-end justify-center gap-2 md:gap-6 relative">
                {top3[1] && <PodiumCard entry={top3[1]} rank={2} isHighlighted={top3[1].studentId === highlightStudentId} cardRef={top3[1].studentId === highlightStudentId ? highlightCardRef : undefined} onActivateHero={() => setActiveHeroRank(2)} />}
                {top3[0] && <PodiumCard entry={top3[0]} rank={1} isHighlighted={top3[0].studentId === highlightStudentId} cardRef={top3[0].studentId === highlightStudentId ? highlightCardRef : undefined} onActivateHero={() => setActiveHeroRank(1)} />}
                {top3[2] && <PodiumCard entry={top3[2]} rank={3} isHighlighted={top3[2].studentId === highlightStudentId} cardRef={top3[2].studentId === highlightStudentId ? highlightCardRef : undefined} onActivateHero={() => setActiveHeroRank(3)} />}
              </div>
            )}

            <div className="math-card rounded-3xl overflow-hidden border border-slate-100 dark:border-slate-800">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-5">Rank</th>
                      <th className="px-6 py-5">Student</th>
                      <th className="px-6 py-5 text-center">{viewMode === "CUMULATIVE" ? "Avg Accuracy" : "Accuracy"}</th>
                      <th className="px-6 py-5 text-right hidden sm:table-cell">{viewMode === "CUMULATIVE" ? "Avg Time" : "Time Taken"}</th>
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

export default function TeacherMockLeaderboardPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading leaderboard..." />}>
      <TeacherMockLeaderboardPageInner />
    </Suspense>
  );
}
