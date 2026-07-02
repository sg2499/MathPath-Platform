"use client";

import React, { useState, useEffect } from "react";
import { Award, Clock, Star, Trophy, Users, AlertCircle, ChevronDown, ArrowLeft } from "lucide-react";
import { LeaderboardAPI } from "@/lib/api-leaderboard";
import { LoadingState } from "@/components/common/LoadingState";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { triggerMythic, triggerSurge, triggerBlaze } from "@/lib/utils/particles";
import type { 
  HierarchyResponse, 
  LeaderboardResponse, 
  ModuleSchema, 
  LevelSchema, 
  ExamSchema 
} from "@/lib/schemas/leaderboard";
import { z } from "zod";
import { PodiumHeroAnimation } from "./PodiumHeroAnimation";

// --- COUNT UP HOOK ---
function useCountUp(end: number, duration: number = 2) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      // easeOutExpo
      const easeProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(easeProgress * end));
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, [end, duration]);
  return count;
}

function getInitials(name: string) {
  if (!name) return "";
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length > 1) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

export default function MockLeaderboardPage() {
const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Hierarchy Data
  const [modules, setModules] = useState<z.infer<typeof ModuleSchema>[]>([]);
  const [levels, setLevels] = useState<z.infer<typeof LevelSchema>[]>([]);
  const [exams, setExams] = useState<z.infer<typeof ExamSchema>[]>([]);
  
  // Selections
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(null);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [selectedExamId, setSelectedExamId] = useState<string | null>(null);
  
  // View Mode
  const [viewMode, setViewMode] = useState<"CUMULATIVE" | "INDIVIDUAL">("CUMULATIVE");
  
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardResponse | null>(null);
  
  const [activeHeroRank, setActiveHeroRank] = useState<1 | 2 | 3 | null>(null);

  // Load Hierarchy on mount
  useEffect(() => {
    async function loadHierarchy() {
      try {
        const data = await LeaderboardAPI.getHierarchy();
        const fetchedModules = data.modules || [];
        const fetchedLevels = data.levels || [];
        const fetchedExams = data.exams || [];
        setModules(fetchedModules);
        setLevels(fetchedLevels);
        setExams(fetchedExams);
        
        let targetModuleId = null;
        let targetLevelId = null;
        let targetExamId = null;

        if (data.currentModuleId) {
            targetModuleId = data.currentModuleId;
        } else if (fetchedModules.length > 0) {
            targetModuleId = fetchedModules[0].id;
        }

        if (data.currentLevelId) {
            targetLevelId = data.currentLevelId;
        } else if (targetModuleId) {
            const modLevels = fetchedLevels.filter(l => l.moduleId === targetModuleId);
            if (modLevels.length > 0) targetLevelId = modLevels[0].id;
        }

        if (targetLevelId) {
            const lvlExams = fetchedExams.filter(e => e.levelId === targetLevelId);
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
  }, []);

  const handleModuleChange = (moduleId: string) => {
      setSelectedModuleId(moduleId);
      const modLevels = levels.filter(l => l.moduleId === moduleId);
      if (modLevels.length > 0) {
          const firstLevelId = modLevels[0].id;
          setSelectedLevelId(firstLevelId);
          const lvlExams = exams.filter(e => e.levelId === firstLevelId);
          setSelectedExamId(lvlExams.length > 0 ? lvlExams[0].id : null);
      } else {
          setSelectedLevelId(null);
          setSelectedExamId(null);
      }
  };

  const handleLevelChange = (levelId: string) => {
      setSelectedLevelId(levelId);
      const lvlExams = exams.filter(e => e.levelId === levelId);
      setSelectedExamId(lvlExams.length > 0 ? lvlExams[0].id : null);
  };

  // Load leaderboard data when filters change
  useEffect(() => {
    if (!selectedLevelId) return;
    if (viewMode === "INDIVIDUAL" && !selectedExamId) return;

    async function loadLeaderboard() {
      setLoading(true);
      setError(null);
      try {
        const data = viewMode === "CUMULATIVE" 
            ? await LeaderboardAPI.getCumulativeLeaderboard(selectedLevelId as string)
            : await LeaderboardAPI.getSpecificLeaderboard(selectedExamId as string);
            
        setLeaderboardData(data);
      } catch (err: any) {
        console.error("Leaderboard fetch error:", err);
        setError("Failed to load leaderboard. Our engineers have been notified.");
      } finally {
        setLoading(false);
      }
    }
    loadLeaderboard();
  }, [selectedLevelId, selectedExamId, viewMode]);

  if (loading && !leaderboardData && modules.length === 0) return <LoadingState />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 dark:text-white">Data Error</h2>
        <p className="text-slate-500 mt-2">{error}</p>
      </div>
    );
  }

  const { leaderboard = [], currentStudentRank, totalParticipants } = leaderboardData || {};
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);
  
  const availableLevels = levels.filter(l => l.moduleId === selectedModuleId);
  const availableExams = exams.filter(e => e.levelId === selectedLevelId);

  return (
    <div className="math-role-student math-page w-full min-h-screen bg-[#F8FAFC] dark:bg-[#060913] overflow-hidden relative transition-colors duration-500">
      
      {/* 1. Infinite 3D Grid with Radial Depth */}
      <div className="absolute inset-0 z-0 opacity-[0.15] dark:opacity-[0.1] pointer-events-none" 
           style={{ 
             backgroundImage: 'linear-gradient(to right, #64748b 1px, transparent 1px), linear-gradient(to bottom, #64748b 1px, transparent 1px)', 
             backgroundSize: '3rem 3rem',
             maskImage: 'radial-gradient(circle at 50% 60%, black 20%, transparent 80%)',
             WebkitMaskImage: 'radial-gradient(circle at 50% 60%, black 20%, transparent 80%)'
           }} 
      />
      
      {/* 2. Frosted Aurora Gradients (Framing the edges, leaving the center clear) */}
      <div className={`absolute top-[-10%] left-[-10%] w-[50%] h-[70%] blur-[150px] rounded-full pointer-events-none z-0 transition-colors duration-1000 ${viewMode === 'CUMULATIVE' ? 'bg-blue-500/10 dark:bg-blue-600/20' : 'bg-orange-500/10 dark:bg-orange-600/20'}`} />
      <div className={`absolute bottom-[-10%] right-[-10%] w-[50%] h-[70%] blur-[150px] rounded-full pointer-events-none z-0 transition-colors duration-1000 ${viewMode === 'CUMULATIVE' ? 'bg-indigo-500/10 dark:bg-indigo-600/20' : 'bg-fuchsia-500/10 dark:bg-fuchsia-600/20'}`} />
      
      {/* 3. Deep Contrast Backdrop for the podium to make the Gold/Bronze glows POP absolutely perfectly */}
      <div className="absolute top-[60%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-slate-900/5 dark:bg-black/60 blur-[100px] pointer-events-none rounded-[100%] z-0" />

      {/* 4. Volumetric Spotlight from above */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-gradient-to-b from-white/60 dark:from-white/5 to-transparent blur-[50px] pointer-events-none z-0" />

      <div className="relative z-10 w-full max-w-[1720px] mx-auto p-4 md:p-6 lg:p-8 space-y-8">
        <PodiumHeroAnimation rank={activeHeroRank} onComplete={() => setActiveHeroRank(null)} />
        
        {/* AAA Header Block */}
        <div className="math-card p-6 md:p-8 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
          
          <button 
            onClick={() => router.back()}
            className="math-role-action-button absolute top-6 right-6 px-4 py-2 text-sm inline-flex items-center gap-2 shadow-sm hover:shadow z-20"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>

          <div className="relative z-10 pr-24">
            <div className="math-block-header mb-3"><Trophy size={16} className="text-yellow-500" /> Leaderboard</div>
            <h1 className="math-title mb-2">Mock Exam Leaderboard</h1>
            <p className="math-subtitle">
              See how you stack up against other students in your level. Compete for the top spot!
            </p>
          </div>
          
          <div className="mt-8 flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative z-10 border-t border-slate-100 dark:border-slate-800 pt-6">
            <div className="flex gap-3 w-fit">
              <button
                onClick={() => setViewMode("CUMULATIVE")}
                className={`px-5 py-2.5 rounded-xl font-black text-sm tracking-widest uppercase transition-all shadow-sm ${viewMode === "CUMULATIVE" ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30 ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-slate-950" : "bg-white dark:bg-slate-800 text-slate-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"}`}
              >
                Overall Journey
              </button>
              <button
                onClick={() => setViewMode("INDIVIDUAL")}
                className={`px-5 py-2.5 rounded-xl font-black text-sm tracking-widest uppercase transition-all shadow-sm ${viewMode === "INDIVIDUAL" ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30 ring-2 ring-orange-500 ring-offset-2 dark:ring-offset-slate-950" : "bg-white dark:bg-slate-800 text-slate-500 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-500/10"}`}
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
                    className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-0 transition"
                  >
                    {modules.length > 0 ? (
                      modules.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))
                    ) : (
                      <option disabled value="">No modules available</option>
                    )}
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
                    className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-0 transition"
                  >
                    {availableLevels.length > 0 ? (
                      availableLevels.map(l => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))
                    ) : (
                      <option disabled value="">No levels available</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className={`relative min-w-[200px] flex-1 xl:flex-none transition-all duration-300 ${viewMode === "CUMULATIVE" ? "opacity-50 pointer-events-none grayscale" : "opacity-100"}`}>
                <label className="block text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-widest mb-1.5">Mock Exam</label>
                <div className="relative">
                  <select
                    value={selectedExamId || ""}
                    onChange={(e) => setSelectedExamId(e.target.value)}
                    disabled={viewMode === "CUMULATIVE"}
                    className="w-full appearance-none bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 pr-10 font-bold text-sm text-slate-800 dark:text-slate-200 focus:border-indigo-500 focus:outline-none focus:ring-0 transition disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {availableExams.length > 0 ? (
                      availableExams.map(e => (
                        <option key={e.id} value={e.id}>{e.title}</option>
                      ))
                    ) : (
                      <option disabled value="">No exams available</option>
                    )}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {loading && <div className="animate-pulse h-96 bg-slate-100 rounded-3xl" />}

        {!loading && leaderboard.length === 0 && (
          <div className="text-center p-12 bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-100 dark:border-slate-800">
            <Users className="h-12 w-12 text-slate-300 mx-auto mb-4" />
            <p className="text-lg font-bold text-slate-500">No participants yet</p>
          </div>
        )}

        {!loading && leaderboard.length > 0 && (
          <>
            {/* AAA Podium */}
            <div className="pt-32 pb-16 flex items-end justify-center gap-4 md:gap-12 relative mt-16">
              <div className="absolute bottom-5 left-1/2 -translate-x-1/2 w-[100%] max-w-5xl h-16 bg-gradient-to-t from-slate-900/10 dark:from-black/80 to-transparent blur-[10px] pointer-events-none rounded-[100%]" />
              
              {/* Silver (Rank 2) */}
              {top3[1] && <PodiumCard student={top3[1]} rank={2} onActivateHero={() => setActiveHeroRank(2)} />}
              {/* Gold (Rank 1) */}
              {top3[0] && <PodiumCard student={top3[0]} rank={1} onActivateHero={() => setActiveHeroRank(1)} />}
              {/* Bronze (Rank 3) */}
              {top3[2] && <PodiumCard student={top3[2]} rank={3} onActivateHero={() => setActiveHeroRank(3)} />}
            </div>

            {/* AAA High-Velocity List for 4-10 */}
            {rest.length > 0 && (
              <div className="math-card rounded-3xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-8 border border-slate-100 dark:border-slate-800 relative isolation-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50/80 dark:bg-slate-800/80 text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <tr>
                      <th className="px-6 py-5">Rank</th>
                      <th className="px-6 py-5">Student</th>
                      <th className="px-6 py-5 text-center">{viewMode === "CUMULATIVE" ? "Avg Score" : "Score"}</th>
                      <th className="px-6 py-5 text-center">{viewMode === "CUMULATIVE" ? "Avg Accuracy" : "Accuracy"}</th>
                      <th className="px-6 py-5 text-right hidden sm:table-cell">{viewMode === "CUMULATIVE" ? "Avg Time" : "Time"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                    <AnimatePresence>
                      {rest.map((r: any, idx: number) => (
                        <TableRow key={r.rank} row={r} delay={idx * 0.1} />
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}

            {/* Current Student Pinned (if outside top 10) */}
            {currentStudentRank && currentStudentRank > 10 && (
              <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
                className="sticky bottom-4 bg-indigo-600 text-white p-4 rounded-2xl shadow-xl flex items-center justify-between z-30"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-black text-xl">
                    #{currentStudentRank}
                  </div>
                  <div>
                    <p className="font-bold">Your Current Rank</p>
                    <p className="text-indigo-200 text-sm">Keep practicing to reach the Top 10!</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-xl">{Math.round(leaderboardData?.currentStudentEntry?.percentage || 0)}%</p>
                </div>
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// AAA Parallax Podium Card
// ============================================================================
function PodiumCard({ student, rank, onActivateHero }: { student: any, rank: number, onActivateHero?: () => void }) {
  const [physics, setPhysics] = useState({ rx: 0, ry: 0, px: 0, py: 0, opacity: 0 });
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Rotate (Max 20deg)
    const ry = ((x / rect.width) - 0.5) * 40; 
    const rx = ((0.5 - (y / rect.height))) * 40; 
    
    // Parallax (Max 15px opposite direction)
    const px = ((x / rect.width) - 0.5) * -30;
    const py = ((y / rect.height) - 0.5) * -30;
    
    setPhysics({ rx, ry, px, py, opacity: 1 });
  };

  const handleMouseLeave = () => {
    setPhysics({ rx: 0, ry: 0, px: 0, py: 0, opacity: 0 });
  };

  const handlePodiumClick = () => {
    if (rank === 1) triggerMythic();
    else if (rank === 2) triggerSurge();
    else if (rank === 3) triggerBlaze();
    
    if (onActivateHero) {
      onActivateHero();
    }
  };

  // Configure colors and geometries based on rank
  const config = rank === 1 
    ? {
        color: "yellow",
        shadow: "rgba(250,204,21,0.6)",
        gradient: "from-yellow-300 to-yellow-600",
        pedestalGradient: "from-yellow-500 via-yellow-400 to-yellow-200",
        label: "1st",
        height: "h-[300px]",
        avatarSize: "w-28 h-28 md:w-36 md:h-36",
        translateY: "translate-y-0",
        shape: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)", // Trapezoid Pedestal
        bloom: "rgba(250,204,21,0.6)",
        delay: 0.6
      }
    : rank === 2 
    ? {
        color: "slate",
        shadow: "rgba(148,163,184,0.5)",
        gradient: "from-slate-200 to-slate-400",
        pedestalGradient: "from-slate-300 to-slate-100",
        label: "2nd",
        height: "h-[220px]",
        avatarSize: "w-20 h-20 md:w-28 md:h-28",
        translateY: "translate-y-12",
        shape: "polygon(15% 0%, 85% 0%, 100% 100%, 0% 100%)",
        bloom: "rgba(148,163,184,0.4)",
        delay: 0.5
      }
    : {
        color: "orange",
        shadow: "rgba(249,115,22,0.5)",
        gradient: "from-orange-300 to-orange-500",
        pedestalGradient: "from-orange-400 to-orange-200",
        label: "3rd",
        height: "h-[140px]",
        avatarSize: "w-16 h-16 md:w-24 md:h-24",
        translateY: "translate-y-24",
        shape: "polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)",
        bloom: "rgba(249,115,22,0.4)",
        delay: 0.4
      };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 100 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20, delay: config.delay }}
      className={`flex flex-col items-center relative z-10 [perspective:1000px] ${config.translateY}`}
      style={{ zIndex: rank === 1 ? 20 : 10 }}
    >
      <div 
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handlePodiumClick}
        className="relative mb-6 cursor-pointer transform-gpu transition-transform duration-200 ease-out group"
        style={{
          transform: `rotateX(${physics.rx}deg) rotateY(${physics.ry}deg) scale(${physics.opacity > 0 ? 1.05 : 1})`,
        }}
      >
        {/* Massive Hover Bloom */}
        <div 
          className="absolute inset-0 rounded-full blur-[25px] transition-all duration-300 z-0 pointer-events-none"
          style={{ 
            backgroundColor: config.bloom,
            opacity: physics.opacity > 0 ? 1 : 0.4,
            transform: physics.opacity > 0 ? 'scale(1.5)' : 'scale(1.2)'
          }}
        />

        {/* 1st Place Crown */}
        {rank === 1 && (
          <div 
             className="absolute -top-12 left-1/2 drop-shadow-[0_0_20px_rgba(250,204,21,1)] z-20 transition-transform duration-500 pointer-events-none"
             style={{ 
               transform: `translateX(-50%) translateY(${Math.sin(Date.now() / 500) * 5}px) scale(${physics.opacity > 0 ? 1.2 : 1})`,
             }}
          >
             <CrownIcon />
          </div>
        )}

        {/* 1st Place Apex Aura */}
        {rank === 1 && (
          <div className="absolute inset-0 z-0 pointer-events-none scale-[2.5] opacity-60 animate-[spin_20s_linear_infinite]">
            <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-xl text-yellow-500/30 fill-current">
              <path d="M100 0 L105 45 L150 20 L130 60 L185 65 L145 90 L195 125 L145 130 L165 175 L120 150 L110 195 L90 155 L45 185 L65 145 L10 140 L50 115 L0 80 L50 75 L30 30 L75 55 Z" />
            </svg>
          </div>
        )}

        {/* Parallax Avatar Ring */}
        <div 
          className={`relative ${config.avatarSize} p-[4px] rounded-full bg-gradient-to-b ${config.gradient} shadow-[0_0_30px_${config.shadow}] z-10 transition-transform duration-200 ease-out`}
          style={{ transform: physics.opacity > 0 ? `translateZ(40px) translateX(${physics.px}px) translateY(${physics.py}px)` : 'translateZ(0)' }}
        >
          <div className={`w-full h-full rounded-full border-[3px] border-white dark:border-slate-900 overflow-hidden bg-${config.color}-50 relative`}>
             {student.photoUrl ? (
                <img src={student.photoUrl} alt="avatar" className="w-full h-full object-cover" />
             ) : (
                <div className={`w-full h-full flex items-center justify-center font-black text-2xl text-${config.color}-600 bg-${config.color}-100`}>
                   {getInitials(student.name)}
                </div>
             )}
          </div>
        </div>

        {/* Rank Label */}
        <div 
          className={`absolute -bottom-3 -right-2 bg-gradient-to-br ${config.gradient} text-white text-[10px] md:text-xs font-black px-2.5 md:px-3 py-1 md:py-1.5 rounded-full border-2 border-white shadow-lg uppercase tracking-wider z-20 transition-transform duration-200`}
          style={{ transform: physics.opacity > 0 ? 'translateZ(60px)' : 'translateZ(0)' }}
        >
           {config.label}
        </div>
      </div>

      <div className="text-center mb-5 relative z-20 drop-shadow-md">
        <p className={`font-black text-sm md:text-lg text-slate-800 dark:text-white max-w-[120px] md:max-w-[150px] leading-tight break-words ${rank === 1 ? 'drop-shadow-[0_0_10px_rgba(255,255,255,1)]' : ''}`}>{student.name}</p>
        <p className={`text-sm md:text-base font-black text-${config.color}-500 mt-1 drop-shadow-sm`}>{Math.round(student.percentage)}%</p>
      </div>

      {/* AAA Geometric Pedestal */}
      <motion.div 
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: "100%", opacity: 1 }}
        transition={{ type: "spring", stiffness: 100, damping: 15, delay: config.delay }}
        className={`w-32 md:w-44 ${config.height} bg-gradient-to-t ${config.pedestalGradient} relative overflow-hidden flex items-end justify-center pb-6 md:pb-8 border-b-[6px] border-white/30 shadow-[inset_0_0_20px_rgba(255,255,255,0.4)] cursor-pointer`}
        style={{ 
           clipPath: config.shape,
           filter: `drop-shadow(0 -10px 30px ${config.shadow})` 
        }}
        onClick={handlePodiumClick}
      >
        {/* Animated Internal Energy */}
        <div className="absolute inset-0 bg-white/20 opacity-0 transition-opacity duration-500" style={{ opacity: physics.opacity > 0 ? 0.4 : 0 }} />
        <div className="absolute bottom-0 left-0 w-full h-[200%] bg-gradient-to-t from-transparent via-white/30 to-transparent translate-y-[100%] transition-transform duration-1000" style={{ transform: physics.opacity > 0 ? 'translateY(-100%)' : 'translateY(100%)' }} />
        
        <span className={`text-7xl md:text-8xl font-black text-${config.color}-600/30 drop-shadow-sm transition-transform duration-300`} style={{ transform: physics.opacity > 0 ? 'scale(1.1) translateY(-10px)' : 'scale(1)' }}>{rank}</span>
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

// ============================================================================
// AAA Table Row (Staggered Entry & CountUp)
// ============================================================================
function TableRow({ row: r, delay }: { row: any; delay: number }) {
  const animatedScore = useCountUp(Math.round(r.score));
  const animatedAccuracy = useCountUp(Math.round(r.accuracy ?? r.percentage));
  
  return (
    <motion.tr 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.4, ease: "easeOut" }}
      className={`group transition-all duration-300 hover:bg-white dark:hover:bg-slate-800 hover:shadow-2xl hover:shadow-indigo-500/10 hover:scale-[1.01] hover:z-20 relative cursor-default overflow-hidden ${r.isCurrent ? 'bg-indigo-50/80 dark:bg-indigo-900/40 ring-2 ring-inset ring-indigo-500 z-10' : 'bg-transparent'}`}
    >
      <td className="px-6 py-5 font-black text-slate-400 group-hover:text-indigo-500 transition-colors text-base group-hover:drop-shadow-[0_0_8px_rgba(99,102,241,0.5)]">
        {/* AAA Sweep Effect */}
        <div className="absolute inset-0 w-full h-full pointer-events-none overflow-hidden z-0">
          <div className="absolute top-0 -left-[100%] w-1/2 h-full bg-gradient-to-r from-transparent via-indigo-500/10 to-transparent skew-x-[-30deg] group-hover:animate-[shimmer_1s_ease-out]" />
        </div>
        <span className="relative z-10">#{r.rank}</span>
      </td>
      <td className="px-6 py-5 flex items-center gap-4 relative z-10">
        <div className={`w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 overflow-hidden flex-shrink-0 shadow-sm transition-transform duration-300 group-hover:scale-110 ${r.isCurrent ? 'ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-900' : ''}`}>
          {r.photoUrl ? (
            <img src={r.photoUrl} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-sm font-black text-indigo-600 dark:text-indigo-400">{getInitials(r.name)}</div>
          )}
        </div>
        <span className={`font-bold text-base transition-colors duration-300 ${r.isCurrent ? 'text-indigo-600 dark:text-indigo-400 group-hover:text-indigo-700' : 'text-slate-800 dark:text-slate-200 group-hover:text-indigo-600'}`}>
          {r.name} {r.isCurrent && <span className="ml-3 text-[10px] bg-indigo-600 text-white font-black px-2.5 py-1 rounded-full uppercase tracking-widest shadow-md shadow-indigo-500/30 animate-[pulse_2s_infinite]">You</span>}
        </span>
      </td>
      <td className="px-6 py-5 text-center font-black text-slate-700 dark:text-slate-300 text-base relative z-10 transition-transform duration-300 group-hover:scale-110">
        {animatedScore}
      </td>
      <td className="px-6 py-5 text-center font-black text-slate-700 dark:text-slate-300 text-base relative z-10 transition-transform duration-300 group-hover:scale-110">
        {animatedAccuracy}%
      </td>
      <td className="px-6 py-5 text-right font-black text-slate-700 dark:text-slate-300 hidden sm:table-cell text-base relative z-10 transition-transform duration-300 group-hover:scale-105">
        {Math.floor(r.timeTakenSeconds / 60)}m {r.timeTakenSeconds % 60}s
      </td>
    </motion.tr>
  );
}