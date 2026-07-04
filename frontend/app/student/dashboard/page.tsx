"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { api, apiErrorMessage } from "@/lib/api";
import { getStudentAssignments, getStudentAssessments } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, BookOpenCheck, GraduationCap, ShieldCheck, Trophy, Laptop, Award,
  Coins, Cpu, RadioTower, Lock, ChevronRight, CheckCircle, Target, Focus, Scan, Zap,
  FastForward, Rocket, Medal, Flag, Crown, Flame, Activity, Infinity as InfinityIcon, Clock, Sun,
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Star, Sparkles, Crosshair,
  Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library, Swords, ArrowRight
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import React, { useRef, useState, useEffect, useMemo } from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate, AnimatePresence } from "framer-motion";
import { GAMER_MOTIVATIONS } from "./quotes";

const IconMap: Record<string, any> = {
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal, Flag, Crown, Flame,
  Activity, Infinity: InfinityIcon, Clock, Sun, AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp,
  Trophy, Star, Sparkles, Crosshair, Aperture, Radar, Shield, Anchor, Mountain,
  Brain, Lightbulb, Library, Award
};

function useDarkMode() {
  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const checkDark = () => document.documentElement.classList.contains('dark');
    setIsDark(checkDark());
    const observer = new MutationObserver(() => setIsDark(checkDark()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);
  return isDark;
}



// --- PROCEDURAL GOD-TIER TEMPLATES ---
function generateGodTierStyle(index: number, isDark: boolean) {
  // Golden ratio hue shifting ensures every index gets a unique, pleasant color pair
  const hue1 = Math.floor((index * 137.5) % 360);
  const hue2 = Math.floor((hue1 + 45 + (index * 15) % 90) % 360);
  
  const fonts = ["font-serif", "font-sans", "font-mono"];
  const fontFamily = fonts[index % 3];

  return {
    bg: isDark ? `linear-gradient(135deg, hsla(${hue1}, 40%, 20%, 0.85), hsla(${hue2}, 40%, 14%, 0.9))`
               : `linear-gradient(135deg, hsla(${hue1}, 70%, 98%, 0.8), hsla(${hue2}, 70%, 94%, 0.9))`,
    orb1: `hsla(${hue1}, 80%, 50%, ${isDark ? 0.3 : 0.25})`,
    orb2: `hsla(${hue2}, 80%, 50%, ${isDark ? 0.3 : 0.25})`,
    fontFamily
  };
}

// --- 3D FRAMER MOTION TILT CARD ---
function TiltCard({ children, className, onClick }: { children: ReactNode, className?: string, onClick?: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 120, mass: 1 };
  const mouseXSpring = useSpring(x, springConfig);
  const mouseYSpring = useSpring(y, springConfig);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [4, -4]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-4, 4]);

  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], [0, 100]);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.1) 0%, transparent 60%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    x.set(mouseX / rect.width - 0.5);
    y.set(mouseY / rect.height - 0.5);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className={`relative transition-all duration-300 transform-gpu z-10 hover:z-20 ${className}`}
    >
      <motion.div 
        className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] mix-blend-overlay transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{ background: glareBackground }}
      />
      <div style={{ transform: "translateZ(10px)", transformStyle: "preserve-3d" }} className="h-full w-full">
         {children}
      </div>
    </motion.div>
  );
}

const QuickLinks = [
  { id: "practice", Label: "Practice", Route: "/student/practice" },
  { id: "assessments", Label: "Assessments", Route: "/student/assessments" },
  { id: "mock-exams", Label: "Mock Exams", Route: "/student/competition/mock-exams" },
  { id: "progress", Label: "Progress", Route: "/student/results" },
  { id: "leaderboard", Label: "Leaderboard", Route: "/student/competition/leaderboard" },
  { id: "achievements", Label: "Trophy Room", Route: "/student/achievements" },
];

export default function StudentDashboardPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Router = useRouter();
  const [isDark, setIsDark] = useState(true);
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteIsFlipped, setQuoteIsFlipped] = useState(false);
  const [intelIndex, setIntelIndex] = useState(0);

  const AssignmentQuery = useQuery({
    queryKey: ["student-assignments"],
    queryFn: getStudentAssignments,
    enabled: Ready,
  });

  const AssessmentQuery = useQuery({
    queryKey: ["student-assessments", "progression-dashboard"],
    queryFn: getStudentAssessments,
    enabled: Ready,
  });

  const AchievementQuery = useQuery({
    queryKey: ["student-achievements"],
    queryFn: async () => {
      const res = await api.get(`/student/achievements`);
      return res.data.achievements || [];
    },
    enabled: Ready,
  });

  // Timers
  useEffect(() => {
    const intelTimer = setInterval(() => {
      setIntelIndex((prev) => (prev + 1) % 4);
    }, 6000);
    return () => clearInterval(intelTimer);
  }, []);

  useEffect(() => {
    const quoteTimer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % GAMER_MOTIVATIONS.length);
    }, 8000);
    return () => clearInterval(quoteTimer);
  }, []);

  if (!Ready) return null;

  const Assignments = AssignmentQuery.data ?? [];
  const Assessments = AssessmentQuery.data ?? [];
  const Badges = AchievementQuery.data ?? [];

  // Mock XP Calculation Logic
  const completedAssignments = Assignments.filter((a: any) => a.status === 'COMPLETED').length;
  const completedAssessments = Assessments.filter((a: any) => a.status === 'COMPLETED' || a.status === 'PASSED').length;
  const totalXP = (completedAssignments * 50) + (completedAssessments * 150) + (Badges.length * 200);
  const currentLevel = Math.floor(totalXP / 1000) + 1;
  const xpIntoLevel = totalXP % 1000;
  const mathCoins = Math.floor(totalXP / 10);

  const recentBadge = Badges.length > 0 ? Badges[0] : null;
  const RecentBadgeIcon = recentBadge && IconMap[recentBadge.icon] ? IconMap[recentBadge.icon] : Medal;

  return (
    <AppShell>
      <main className="math-dashboard-page math-dashboard-student w-full space-y-5 relative z-10">
        
        {/* ROW 1: HERO & HUD - Premium Glassmorphism */}
        <section className="math-dashboard-hero math-dashboard-hero-student relative overflow-hidden rounded-[2rem] border border-white/40 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] p-6 sm:p-8 bg-white/30 dark:bg-slate-900/30 backdrop-blur-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between w-full">
            
            <div className="flex flex-col gap-3">
              <div className="math-block-header">
                <Laptop size={14} />
                MATHPATH LOBBY
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black tracking-[-0.03em] text-slate-950 dark:text-white drop-shadow-md leading-tight">
                My Learning Workspace
              </h1>
            </div>

            {/* RIGHT SIDE: Level & Coins */}
            <div className="flex flex-wrap gap-4 items-center shrink-0 relative z-20">
               {/* Level Chip */}
               <div className="group flex items-center gap-3 px-5 py-2.5 rounded-2xl border border-cyan-200/80 dark:border-cyan-500/20 bg-gradient-to-br from-white to-cyan-50/60 dark:from-slate-800/60 dark:to-slate-900/40 backdrop-blur-md shadow-sm hover:shadow-[0_10px_30px_rgba(56,189,248,0.3)] transition-all duration-500 hover:scale-105 hover:-translate-y-1 cursor-pointer overflow-hidden relative">
                 <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/0 via-cyan-400/10 to-cyan-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <span className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white relative z-10">Level {currentLevel}</span>
                 <div className="w-24 h-2 bg-slate-200/60 dark:bg-slate-700/60 rounded-full overflow-hidden shadow-inner relative z-10 group-hover:ring-2 group-hover:ring-cyan-400/50 transition-all duration-500">
                   <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${(xpIntoLevel / 1000) * 100}%` }}
                       transition={{ duration: 1.5, ease: "easeOut" }}
                       className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 absolute top-0 left-0" 
                   />
                   <div className="absolute top-0 left-0 h-full w-[200%] bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[mathShimmer_2s_infinite]" />
                 </div>
                 <span className="text-xs font-bold text-slate-600 dark:text-slate-300 relative z-10">{xpIntoLevel} / 1000 XP</span>
               </div>

               {/* Coins Chip */}
               <div className="group flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-orange-900/60 dark:to-orange-800/40 border border-orange-200/60 dark:border-orange-500/30 shadow-sm hover:shadow-[0_10px_30px_rgba(245,158,11,0.3)] transition-all duration-500 hover:scale-105 hover:-translate-y-1 cursor-pointer backdrop-blur-md overflow-hidden relative">
                 <div className="absolute inset-0 bg-gradient-to-r from-amber-500/0 via-amber-400/10 to-amber-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                 <div className="w-8 h-8 rounded-full bg-gradient-to-b from-orange-400 to-orange-600 flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.3),0_0_15px_rgba(249,115,22,0.4)]">
                    <Coins size={18} className="text-white drop-shadow-md" />
                 </div>
                 <span className="text-lg font-black text-orange-900 dark:text-orange-400 drop-shadow-sm">{mathCoins.toLocaleString()}</span>
               </div>
             </div>

          </div>
        </section>

        {AssignmentQuery.isLoading || AssessmentQuery.isLoading ? <LoadingState label="Syncing Lobby Data..." /> : null}
        {AssignmentQuery.error ? <ErrorState message={apiErrorMessage(AssignmentQuery.error)} /> : null}
        {AssessmentQuery.error ? <ErrorState message={apiErrorMessage(AssessmentQuery.error)} /> : null}

        {!AssignmentQuery.isLoading && !AssessmentQuery.isLoading && !AssignmentQuery.error && !AssessmentQuery.error ? (
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            
            {/* LEFT COLUMN: Intel Slider & Transmission Block */}
            <div className="lg:col-span-8 flex flex-col gap-5 h-full">
               
               {/* 1. The Intel Carousel */}
               <TiltCard className="group w-full h-[220px]">
                 <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-[24px] border border-white/50 dark:border-white/10 shadow-2xl bg-white/50 dark:bg-slate-900/50 backdrop-blur-3xl text-slate-900 dark:text-white transition-all duration-500">
                   <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02] dark:opacity-[0.05] mix-blend-overlay pointer-events-none" />
                   
                   {/* Holographic Grid */}
                   <div className="absolute inset-0 bg-[linear-gradient(rgba(37,99,235,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(37,99,235,0.05)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(129,140,248,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.05)_1px,transparent_1px)] bg-[size:32px_32px] pointer-events-none" />
                   
                   {/* Sweeping HUD Scanline */}
                   <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none overflow-hidden">
                     <motion.div 
                       animate={{ y: [-100, 300] }} 
                       transition={{ repeat: Number.POSITIVE_INFINITY, duration: 3, ease: "linear" }}
                       className="w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-400/50 to-transparent shadow-[0_0_10px_rgba(34,211,238,0.5)]" 
                     />
                   </div>
                   
                   <div className="px-6 sm:px-10 pt-5 flex items-center gap-2 z-20 shrink-0">
                     <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-[mathBlobPulse_2s_infinite] shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                     <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400 drop-shadow-sm">Live Intel Feed</span>
                   </div>

                   <AnimatePresence mode="wait">
                      {intelIndex === 0 && (
                         <motion.button 
                           key="slide-0"
                           onClick={() => Router.push("/student/achievements")}
                           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }}
                           className="relative z-10 w-full h-full px-6 sm:px-10 pb-5 pt-2 flex items-center justify-start gap-6 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-700 p-[3px] shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                               <div className="w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex items-center justify-center">
                                  <RecentBadgeIcon size={32} className="text-indigo-500 dark:text-indigo-400" />
                               </div>
                            </div>
                            <div>
                               <h2 className="text-xl sm:text-3xl font-black italic tracking-tight mb-2 text-indigo-600 dark:text-indigo-400">
                                  {recentBadge ? "LATEST UNLOCK" : "NO RECENT UNLOCKS"}
                               </h2>
                               <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium">
                                  {recentBadge ? `You acquired the ${recentBadge.name} badge. View Trophy Room.` : "Keep grinding practice sheets to unlock your first achievement."}
                               </p>
                               <span className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                                  View Achievements <ChevronRight size={14} />
                               </span>
                            </div>
                         </motion.button>
                      )}
                      
                      {intelIndex === 1 && (
                         <motion.button 
                           key="slide-1" 
                           onClick={() => Router.push("/student/practice")}
                           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }}
                           className="relative z-10 w-full h-full px-6 sm:px-10 pb-5 pt-2 flex items-center justify-start gap-6 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl border-2 border-dashed border-amber-500 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.2)]">
                               <Crosshair size={36} className="text-amber-500" />
                            </div>
                            <div>
                               <h2 className="text-xl sm:text-3xl font-black italic tracking-tight text-amber-600 dark:text-amber-500 mb-2">
                                  DAILY OBJECTIVE
                               </h2>
                               <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium">
                                  Complete your assigned <span className="font-bold text-amber-600 dark:text-amber-400">DPS Sheets</span> to build speed, accuracy, and earn MathCoins.
                               </p>
                               <span className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-600 dark:text-amber-500">
                                  Go to Practice <ChevronRight size={14} />
                               </span>
                            </div>
                         </motion.button>
                      )}

                      {intelIndex === 2 && (
                         <motion.button 
                           key="slide-2" 
                           onClick={() => Router.push("/student/competition/mock-exams")}
                           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }}
                           className="relative z-10 w-full h-full px-6 sm:px-10 pb-5 pt-2 flex items-center justify-start gap-6 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.3)]">
                               <Swords size={36} className="text-white" />
                            </div>
                            <div>
                               <h2 className="text-xl sm:text-3xl font-black tracking-tight mb-2 text-emerald-600 dark:text-emerald-400">
                                  MOCK READINESS
                               </h2>
                               <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium">
                                  Challenge yourself with the next Mock Exam to test your readiness and secure your rank.
                               </p>
                               <span className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500">
                                  View Mock Exams <ChevronRight size={14} />
                               </span>
                            </div>
                         </motion.button>
                      )}

                      {intelIndex === 3 && (
                         <motion.button 
                           key="slide-3" 
                           onClick={() => Router.push("/student/competition/leaderboard")}
                           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }}
                           className="relative z-10 w-full h-full px-6 sm:px-10 pb-5 pt-2 flex items-center justify-start gap-6 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-2xl bg-gradient-to-br from-rose-400 to-red-600 flex items-center justify-center shadow-[0_0_30px_rgba(244,63,94,0.3)]">
                               <Medal size={36} className="text-white" />
                            </div>
                            <div>
                               <h2 className="text-xl sm:text-3xl font-black tracking-tight mb-2 text-rose-600 dark:text-rose-400">
                                  LEADERBOARD RANKING
                               </h2>
                               <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 font-medium">
                                  Check the live competitive standings and see how you match up against the top scholars.
                               </p>
                               <span className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-rose-600 dark:text-rose-500">
                                  View Leaderboard <ChevronRight size={14} />
                               </span>
                            </div>
                         </motion.button>
                      )}
                   </AnimatePresence>

                   {/* Carousel Indicators (Clickable) */}
                   <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 z-20">
                      {[0, 1, 2, 3].map(i => (
                         <button 
                           key={i} 
                           onClick={(e) => { e.stopPropagation(); setIntelIndex(i); }}
                           className={`h-2 rounded-full transition-all duration-300 focus:outline-none ${i === intelIndex ? 'w-8 bg-slate-800 dark:bg-white' : 'w-2 bg-slate-400 dark:bg-white/30 hover:bg-slate-600 dark:hover:bg-white/50'}`} 
                           aria-label={`Go to slide ${i+1}`}
                         />
                      ))}
                   </div>
                 </div>
               </TiltCard>

               {/* 2. Massive Wisdom Prism Canvas (Dynamic Height) */}
               {/* 2. Massive Wisdom Prism Canvas (Dynamic Height) */}
               <TiltCard className="group w-full h-full min-h-[250px] perspective-1000">
                 <div 
                   className="relative w-full h-full [transform-style:preserve-3d] transition-transform duration-700 ease-[cubic-bezier(0.23,1,0.32,1)] cursor-pointer"
                   style={{ transform: quoteIsFlipped ? 'rotateY(180deg) translateZ(10px)' : 'rotateY(0deg) translateZ(10px)' }}
                   onClick={() => setQuoteIsFlipped(!quoteIsFlipped)}
                 >
                   {/* FRONT FACE (Inspiration) */}
                   <div className="absolute inset-0 [backface-visibility:hidden]">
                     <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-[24px] border border-white/50 dark:border-white/10 shadow-2xl transition-all duration-700 backdrop-blur-3xl bg-white/10 dark:bg-black/10">
                       <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 dark:opacity-20 mix-blend-overlay pointer-events-none z-10" />
                       
                       <div className="absolute bottom-4 right-6 z-30 flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
                         <span className="text-[10px] uppercase tracking-widest font-bold text-slate-800 dark:text-white">Reveal Conquest</span>
                         <Sparkles size={14} className="text-slate-800 dark:text-white" />
                       </div>

                       <AnimatePresence mode="wait">
                          <motion.div 
                            key={quoteIndex}
                            initial={{ opacity: 0, filter: 'blur(12px)', scale: 0.97 }} 
                            animate={{ opacity: 1, filter: 'blur(0px)', scale: 1 }} 
                            exit={{ opacity: 0, filter: 'blur(12px)', scale: 1.03 }} 
                            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                            className="absolute inset-0 flex items-stretch justify-stretch"
                          >
                             {(() => {
                               const activeQuote = GAMER_MOTIVATIONS[quoteIndex];
                               const style = generateGodTierStyle(quoteIndex, isDark);
                               return (
                                 <div className="w-full h-full flex flex-col justify-center items-center relative p-8 sm:p-12 transition-all duration-700" style={{ background: style.bg }}>
                                    {/* Ambient Glow Orbs */}
                                    <div className="absolute -top-32 -left-32 w-80 h-80 rounded-full blur-[80px] pointer-events-none transition-colors duration-1000" style={{ background: style.orb1 }} />
                                    <div className="absolute -bottom-32 -right-32 w-80 h-80 rounded-full blur-[80px] pointer-events-none transition-colors duration-1000" style={{ background: style.orb2 }} />

                                    <div className="z-20 text-center w-full max-w-4xl flex flex-col items-center">
                                      <h3 
                                        className={`text-slate-900 dark:text-white drop-shadow-sm text-balance break-words tracking-tight ${style.fontFamily}
                                          ${activeQuote.text.length < 60 ? "text-3xl md:text-5xl lg:text-[3.25rem] leading-[1.15]" : 
                                            activeQuote.text.length < 120 ? "text-2xl md:text-4xl lg:text-[2.5rem] leading-[1.25]" : 
                                            "text-xl md:text-2xl lg:text-3xl leading-[1.4]"}
                                        `}
                                      >
                                         "{activeQuote.text}"
                                      </h3>
                                      {activeQuote.author && (
                                         <motion.div 
                                          initial={{ opacity: 0, y: 15 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          transition={{ delay: 0.4, duration: 0.8, ease: "easeOut" }}
                                          className="mt-8 shrink-0"
                                         >
                                           <span className="text-slate-600 dark:text-slate-300 font-bold uppercase tracking-[0.25em] text-xs md:text-sm">
                                              — {activeQuote.author}
                                           </span>
                                         </motion.div>
                                      )}
                                    </div>
                                 </div>
                               );
                             })()}
                          </motion.div>
                       </AnimatePresence>
                     </div>
                   </div>

                   {/* BACK FACE (Conquest Matrix) */}
                   <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                     <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-[24px] border border-white/50 dark:border-[var(--mp-role-primary)]/20 shadow-2xl transition-all duration-700 bg-white/70 dark:bg-black/60 backdrop-blur-3xl p-6 sm:p-8">
                       <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 dark:opacity-20 mix-blend-overlay pointer-events-none z-10" />
                       
                       <div className="absolute top-4 right-6 z-30 flex items-center gap-2 opacity-40 hover:opacity-100 transition-opacity">
                         <span className="text-[10px] uppercase tracking-widest font-bold text-slate-800 dark:text-white">Back to Inspiration</span>
                       </div>

                       <div className="z-20 h-full flex flex-col sm:flex-row gap-6 relative items-center">
                         {/* LEFT: Grind Heatmap */}
                         <div className="flex-1 flex flex-col justify-center w-full">
                            <h4 className="text-xs font-black uppercase tracking-widest text-[var(--mp-role-primary)] mb-4 flex items-center gap-2 drop-shadow-sm">
                               <Activity size={16} /> Relentless Grind
                            </h4>
                            <div className="flex items-end gap-1.5 h-16 w-full max-w-sm">
                               {[...Array(14)].map((_, i) => (
                                 <div 
                                   key={i} 
                                   className={`flex-1 rounded-sm transition-all duration-500 hover:scale-110 cursor-crosshair
                                     ${[2, 4, 5, 7, 8, 9, 10, 12, 13].includes(i) 
                                        ? 'bg-[var(--mp-role-primary)] h-full shadow-[0_0_8px_var(--mp-role-primary)] dark:shadow-[0_0_12px_var(--mp-role-primary)]' 
                                        : 'bg-slate-300 dark:bg-white/10 h-1/4'}`} 
                                 />
                               ))}
                            </div>
                            <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mt-4 uppercase tracking-[0.2em]">
                               Consistency: Top 5% this week.
                            </p>
                         </div>

                         {/* RIGHT: Next Conquest */}
                         <div className="flex-1 flex flex-col justify-center border-t sm:border-t-0 sm:border-l border-slate-300 dark:border-white/10 pt-6 sm:pt-0 sm:pl-8 w-full">
                            <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                               <Target size={16} className="text-red-500" /> Next Conquest
                            </h4>
                            <p className="text-slate-600 dark:text-slate-300 text-sm font-medium mb-6 text-balance leading-relaxed">
                               Your mastery is incomplete. Conquer <strong className="text-slate-900 dark:text-white">DPS 7.3: Advanced Operations</strong> to secure your rank.
                            </p>
                            <button 
                               onClick={(e) => { 
                                 e.stopPropagation(); 
                                 Router.push('/student/practice'); 
                               }}
                               className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold uppercase tracking-widest text-[10px] sm:text-xs px-6 py-3.5 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 w-fit shadow-xl group/btn border border-transparent dark:hover:border-white/50"
                            >
                               Engage Practice <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                            </button>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
               </TiltCard>

            </div>

            {/* RIGHT COLUMN: Quick Links Bento Grid */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-4 h-full">
              {QuickLinks.map((LinkItem) => {
                const renderIcon = () => {
                  const props = { size: 28, strokeWidth: 2 };
                  switch (LinkItem.Label) {
                    case "Practice": return <BookOpenCheck {...props} />;
                    case "Assessments": return <GraduationCap {...props} />;
                    case "Mock Exams": return <Target {...props} />;
                    case "Progress": return <BarChart3 {...props} />;
                    case "Leaderboard": return <Trophy {...props} />;
                    case "Trophy Room": return <Award {...props} />;
                    default: return <BookOpenCheck {...props} />;
                  }
                };
                
                return (
                  <TiltCard key={LinkItem.Route} onClick={() => Router.push(LinkItem.Route)} className="group h-full min-h-[145px]">
                    <div className="math-dashboard-quick-card flex flex-col items-center justify-center text-center h-full w-full !rounded-[24px] border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl shadow-md hover:shadow-2xl transition-all duration-300 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      
                      <span className="math-dashboard-quick-icon mb-3 !flex items-center justify-center !w-[56px] !h-[56px] rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_0_20px_var(--mp-role-shadow)] z-10">
                        {renderIcon()}
                      </span>
                      
                      <span className="block w-full px-2 text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white drop-shadow-sm group-hover:text-[var(--mp-role-primary)] transition-colors z-10">
                        {LinkItem.Label}
                      </span>
                    </div>
                  </TiltCard>
                );
              })}
            </div>

          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
