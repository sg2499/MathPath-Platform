"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { StudentWallet } from "@/components/gamification/StudentWallet";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { api, apiErrorMessage } from "@/lib/api";
import { getStudentAssignments, getStudentAssessments, getStudentResults, getStudentCompetitionMockAssignments } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, BookOpenCheck, GraduationCap, ShieldCheck, Trophy, Laptop, Award,
  Coins, Cpu, RadioTower, Lock, ChevronLeft, ChevronRight, CheckCircle, Target, Focus, Scan, Zap,
  FastForward, Rocket, Medal, Flag, Crown, Flame, Activity, Infinity as InfinityIcon, Clock, Sun,
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Star, Sparkles, Crosshair,
  Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library, Swords, ArrowRight, Info
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
function TiltCard({ children, className, onClick, isFlipped = false }: { children: ReactNode, className?: string, onClick?: () => void, isFlipped?: boolean }) {
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
    if (isFlipped) return;
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

  useEffect(() => {
    if (isFlipped) {
      x.set(0);
      y.set(0);
    }
  }, [isFlipped, x, y]);

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
  const isDark = useDarkMode();
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [quoteIsFlipped, setQuoteIsFlipped] = useState(false);
  const [intelIndex, setIntelIndex] = useState(0);
  const [conquestIndex, setConquestIndex] = useState(0);
  const [heatmapInfoOpen, setHeatmapInfoOpen] = useState(false);

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

  const MockAssignmentsQuery = useQuery({
    queryKey: ["student-mock-assignments"],
    queryFn: getStudentCompetitionMockAssignments,
    enabled: Ready,
  });

  const ResultsQuery = useQuery({
    queryKey: ["student-results"],
    queryFn: getStudentResults,
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
    if (quoteIsFlipped) return;
    const quoteTimer = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % GAMER_MOTIVATIONS.length);
    }, 8000);
    return () => clearInterval(quoteTimer);
  }, [quoteIsFlipped]);

  const Assignments = AssignmentQuery.data ?? [];
  const Assessments = AssessmentQuery.data ?? [];
  const Badges = AchievementQuery.data ?? [];
  const MockAssignments = MockAssignmentsQuery.data ?? [];
  const Results = ResultsQuery.data ?? [];

  const pendingPractice = useMemo(() => {
    return Assignments.find(
      (a: any) => a && (a.status === "NOT_STARTED" || a.status === "IN_PROGRESS" || a.status === "REATTEMPT_AVAILABLE")
    );
  }, [Assignments]);

  const pendingMock = useMemo(() => {
    return MockAssignments.find(
      (a: any) => a && (a.status === "ASSIGNED" || a.status === "NOT_STARTED" || a.status === "IN_PROGRESS")
    );
  }, [MockAssignments]);

  const conquests = useMemo(() => {
    const list = [];
    if (pendingPractice) {
      list.push({
        type: "PRACTICE",
        title: `DPS ${pendingPractice.dpsNumber || pendingPractice.lessonNumber || ''}: ${pendingPractice.dpsTitle || pendingPractice.title}`,
        detail: `Level ${pendingPractice.levelCode} • Lesson ${pendingPractice.lessonNumber}`,
        buttonText: "Engage Practice",
        route: `/student/practice?assignmentId=${pendingPractice.assignmentId}&dpsId=${pendingPractice.dpsId}`
      });
    }
    if (pendingMock) {
      list.push({
        type: "MOCK_EXAM",
        title: pendingMock.mockExam?.title || "Assigned Mock Exam",
        detail: `Level ${pendingMock.mockExam?.levelCode || ''} Mock Exam • ${pendingMock.mockExam?.totalQuestions || 0} Questions`,
        buttonText: "Launch Mock Exam",
        route: "/student/competition/mock-exams"
      });
    }
    if (list.length === 0) {
      list.push({
        type: "COMPLETED",
        title: "No Assigned Conquests",
        detail: "You haven't had any Practice Sheets or Mock Exams assigned to you yet.",
        buttonText: "Explore Practice",
        route: "/student/practice"
      });
    }
    return list;
  }, [pendingPractice, pendingMock]);

  const activeConquest = useMemo(() => {
    return conquests[conquestIndex] || conquests[0];
  }, [conquests, conquestIndex]);

  // Every completed activity this week, normalized to one shape, regardless
  // of source (practice/DPS sheets, assessments, or competition mock exams)
  // or how many attempts happened on a given day. The heatmap below pools
  // all of these per calendar day rather than reading Results alone.
  const combinedActivityEvents = useMemo(() => {
    const practiceEvents = Results
      .filter((r: any) => r && (r.completedDate || r.submittedAt))
      .map((r: any) => ({
        date: (r.completedDate || r.submittedAt || "").split("T")[0],
        timeTakenSeconds: r.timeTakenSeconds || 0,
        expectedDurationSeconds: r.expectedDurationSeconds || null,
        accuracyPercentage: r.accuracyPercentage || 0,
        totalQuestions: r.totalQuestions || 5,
      }));

    const mockEvents = MockAssignments
      .filter((a: any) => a)
      .flatMap((a: any) =>
        (a.attemptHistory || []).map((h: any) => ({
          date: (h.completedAt || "").split("T")[0],
          timeTakenSeconds: h.timeTakenSeconds || 0,
          expectedDurationSeconds: h.expectedDurationSeconds || a.mockExam?.durationSeconds || null,
          accuracyPercentage: h.accuracyPercentage || 0,
          totalQuestions: h.totalQuestions || a.mockExam?.totalQuestions || 5,
        }))
      );

    const assessmentEvents = Assessments
      .filter((a: any) => a)
      .flatMap((a: any) =>
        (a.attemptHistory || []).map((h: any) => ({
          date: (h.completedAt || "").split("T")[0],
          timeTakenSeconds: h.timeTakenSeconds || 0,
          expectedDurationSeconds: h.expectedDurationSeconds || a.durationSeconds || null,
          accuracyPercentage: h.accuracyPercentage || 0,
          totalQuestions: h.totalQuestions || a.questionCount || 5,
        }))
      );

    return [...practiceEvents, ...mockEvents, ...assessmentEvents].filter((e) => e.date);
  }, [Results, MockAssignments, Assessments]);

  const grindData = useMemo(() => {
    const data = [];
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Get current week (Sunday to Saturday)
    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 is Sunday, 6 is Saturday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDayOfWeek);

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dayName = days[d.getDay()];
      const dateStr = d.toISOString().split("T")[0]; // YYYY-MM-DD

      // Pooled across every activity type completed this day (practice
      // sheets, assessments, mock exams) and every attempt within it.
      const dayResults = combinedActivityEvents.filter((r) => r.date === dateStr);

      const count = dayResults.length;
      const totalSeconds = dayResults.reduce((acc: number, r: any) => acc + (r.timeTakenSeconds || 0), 0);
      const rawTimeSpent = Math.round(totalSeconds / 60);
      const timeSpent = count > 0 ? Math.max(rawTimeSpent, 2) : 0; // minimum 2 mins credit if completed

      const avgAccuracy = count > 0 
        ? Math.round(dayResults.reduce((acc: number, r: any) => acc + (r.accuracyPercentage || 0), 0) / count)
        : 0;

      // Pace, judged per task rather than one flat questions/minute bar: each
      // practice sheet, assessment, and mock exam has its own admin-defined
      // expected duration (expectedDurationSeconds). Pace ratio = expected
      // time ÷ actual time taken for that specific attempt, so a 60-minute
      // mock exam that used its full 60 minutes scores as "on pace" (ratio
      // 1.0) rather than being penalized against a flat speed threshold that
      // doesn't know the difference between a 5-minute drill and an hour-long
      // exam. Capped at 1.5 so an implausibly fast attempt can't run away
      // with the bonus. When expected duration is unknown, that attempt is
      // treated as neutral (ratio 1.0) rather than skewing the day's score.
      const paceRatios = dayResults.map((r: any) => {
        const actual = r.timeTakenSeconds && r.timeTakenSeconds > 0 ? r.timeTakenSeconds : null;
        const expected = r.expectedDurationSeconds && r.expectedDurationSeconds > 0 ? r.expectedDurationSeconds : actual;
        if (!actual || !expected) return 1;
        return Math.min(expected / actual, 1.5);
      });
      const avgPaceRatio = count > 0
        ? paceRatios.reduce((acc: number, r: number) => acc + r, 0) / count
        : 0;

      // Speed keeps the same ~30-point ceiling it always had (speed remains
      // a major factor, matching how central pace is to abacus training) —
      // only how pace is measured has changed, from a flat threshold to a
      // per-task-relative one.
      const speed = avgPaceRatio; // exposed as "pace ratio": 1.0 = exactly on pace
      const speedBonus = count > 0 ? Math.min(avgPaceRatio, 1.5) / 1.5 * 30 : 0;

      // Flow State: 0 to 100%
      const flowState = count > 0
        ? Math.min(Math.round(avgAccuracy * 0.7 + speedBonus), 100)
        : 0;

      let tier = "REST";
      let insight = "Rest Day. No conquests attempted.";
      if (count > 0) {
        if (flowState >= 90) {
          tier = "S-TIER";
          insight = "Peak Focus! Absolute flow state.";
        } else if (flowState >= 80) {
          tier = "A-TIER";
          insight = "Exceptional speed and precision.";
        } else if (flowState >= 70) {
          tier = "B-TIER";
          insight = "Solid execution. Steady progress.";
        } else if (flowState >= 50) {
          tier = "C-TIER";
          insight = "Keep grinding. Focus is building.";
        } else {
          tier = "D-TIER";
          insight = "Analyze mistakes & try again.";
        }
      }

      data.push({ day: dayName, date: dateStr, count, timeSpent, accuracy: avgAccuracy, speed, flowState, tier, insight });
    }
    return data;
  }, [combinedActivityEvents]);

  const heatmapMonthYearLabel = useMemo(() => {
    if (grindData.length === 0) return "";
    const firstDate = new Date(grindData[0].date);
    const lastDate = new Date(grindData[grindData.length - 1].date);
    const monthNames = [
      "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
      "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
    ];
    const firstMonth = monthNames[firstDate.getMonth()];
    const lastMonth = monthNames[lastDate.getMonth()];
    const firstYear = firstDate.getFullYear();
    const lastYear = lastDate.getFullYear();

    if (firstYear !== lastYear) {
      return `${firstMonth} ${firstYear} - ${lastMonth} ${lastYear}`;
    }
    if (firstMonth !== lastMonth) {
      return `${firstMonth} - ${lastMonth} ${lastYear}`;
    }
    return `${lastMonth} ${lastYear}`;
  }, [grindData]);

  const completedAssignments = Assignments.filter((a: any) => a && a.status === 'COMPLETED').length;
  const completedAssessments = Assessments.filter((a: any) => a && (a.status === 'COMPLETED' || a.status === 'PASSED')).length;
  
  const earnedBadges = Badges.filter((b: any) => b && b.isUnlocked).sort((a: any, b: any) => {
    return new Date(b.unlockedAt).getTime() - new Date(a.unlockedAt).getTime();
  });

  const totalXP = (completedAssignments * 50) + (completedAssessments * 150) + (earnedBadges.length * 200);
  const currentLevel = Math.floor(totalXP / 1000) + 1;
  const xpIntoLevel = totalXP % 1000;
  const mathCoins = Math.floor(totalXP / 10);

  const recentBadge = earnedBadges.length > 0 ? earnedBadges[0] : null;
  const RecentBadgeIcon = recentBadge && IconMap[recentBadge.iconName] ? IconMap[recentBadge.iconName] : Medal;

  const isLoadingStats = AssignmentQuery.isLoading || AssessmentQuery.isLoading || AchievementQuery.isLoading;

  // Auto-slideshow for multiple conquests
  useEffect(() => {
    if (!quoteIsFlipped || conquests.length <= 1) return;
    const conquestTimer = setInterval(() => {
      setConquestIndex((prev) => (prev + 1) % conquests.length);
    }, 5000);
    return () => clearInterval(conquestTimer);
  }, [quoteIsFlipped, conquests.length]);

  if (!Ready) return null;

  return (
    <AppShell>
      <main className="math-dashboard-page math-dashboard-student w-full flex flex-col gap-4 lg:h-[calc(100vh-90px)] 2xl:h-[calc(100vh-110px)] relative z-10">
        
        {/* ROW 1: HERO & HUD - Premium Glassmorphism */}
        <section className="math-dashboard-hero math-dashboard-hero-student shrink-0 relative overflow-hidden rounded-[2rem] border border-white/40 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] p-3 sm:p-4 bg-white/30 dark:bg-slate-900/30 backdrop-blur-2xl">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between w-full">
            
            <div className="flex flex-col gap-2 pt-1 lg:pt-2">
              <div className="math-block-header">
                <Laptop size={14} />
                MATHPATH LOBBY
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-[2.25rem] 2xl:text-[2.5rem] font-black tracking-[-0.03em] text-slate-950 dark:text-white drop-shadow-md leading-tight">
                My Learning Workspace
              </h1>
            </div>

            {/* RIGHT SIDE: Gamification Wallet */}
            <div className="flex flex-wrap gap-4 items-center shrink-0 relative z-20">
              <StudentWallet currentXp={totalXP} coinBalance={mathCoins} isLoading={isLoadingStats} className="scale-100 sm:scale-100 origin-right" />
            </div>
          </div>
        </section>

        {AssignmentQuery.isLoading || AssessmentQuery.isLoading ? <LoadingState label="Syncing Lobby Data..." /> : null}
        {AssignmentQuery.error ? <ErrorState message={apiErrorMessage(AssignmentQuery.error)} /> : null}
        {AssessmentQuery.error ? <ErrorState message={apiErrorMessage(AssessmentQuery.error)} /> : null}

        {!AssignmentQuery.isLoading && !AssessmentQuery.isLoading && !AssignmentQuery.error && !AssessmentQuery.error ? (
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0 items-stretch">
            
            {/* LEFT COLUMN: Intel Slider & Transmission Block */}
            <div className="lg:col-span-8 flex flex-col gap-4 h-full min-h-0">
               
               {/* 1. The Intel Carousel */}
               <TiltCard className="group w-full h-[150px] 2xl:h-[180px] shrink-0">
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
                   
                   <div className="px-6 sm:px-8 pt-4 flex items-center gap-2 z-20 shrink-0">
                     <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-[mathBlobPulse_2s_infinite] shadow-[0_0_8px_rgba(244,63,94,0.6)]" />
                     <span className="text-xs font-black uppercase tracking-[0.2em] text-slate-600 dark:text-slate-400 drop-shadow-sm">Live Intel Feed</span>
                   </div>

                   <AnimatePresence mode="wait">
                      {intelIndex === 0 && (
                         <motion.button 
                           key="slide-0"
                           onClick={() => Router.push("/student/achievements")}
                           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }}
                           className="relative z-10 w-full h-full px-6 sm:px-8 pb-4 pt-1 flex items-center justify-start gap-5 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-700 p-[3px] shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                               <div className="w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex items-center justify-center">
                                  <RecentBadgeIcon size={28} className="text-indigo-500 dark:text-indigo-400" />
                               </div>
                            </div>
                            <div>
                               <h2 className="text-lg sm:text-2xl font-black italic tracking-tight mb-1 text-indigo-600 dark:text-indigo-400">
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
               <TiltCard className="group w-full flex-1 min-h-0 perspective-1000" isFlipped={quoteIsFlipped}>
                 <motion.div 
                   className="grid w-full h-full"
                   style={{ transformStyle: "preserve-3d" }}
                   animate={{ rotateY: quoteIsFlipped ? 180 : 0 }}
                   transition={{ duration: 0.8, ease: [0.23, 1, 0.32, 1] }}
                   onClick={() => setQuoteIsFlipped(!quoteIsFlipped)}
                 >
                   {/* FRONT FACE (Inspiration) */}
                   <div 
                     className="col-start-1 row-start-1 w-full h-full" 
                     style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden" }}
                   >
                     <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-[24px] border border-white/50 dark:border-white/10 shadow-2xl transition-all duration-700 backdrop-blur-3xl bg-white/10 dark:bg-black/10 cursor-pointer">
                       <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 dark:opacity-20 mix-blend-overlay pointer-events-none z-10" />
                       
                       <div className="absolute bottom-4 right-6 z-30 flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
                         <span className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-slate-900 dark:text-slate-200">Reveal Conquest</span>
                         <Sparkles size={14} className="text-slate-900 dark:text-slate-200 animate-pulse" />
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
                   <div 
                     className="col-start-1 row-start-1 w-full h-full" 
                     style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: "rotateY(180deg)" }}
                   >
                     <div className="relative overflow-visible h-full flex flex-col justify-center !rounded-[24px] border border-white/50 dark:border-[var(--mp-role-primary)]/20 shadow-2xl transition-all duration-700 bg-white/95 dark:bg-black/85 backdrop-blur-3xl p-6 sm:p-8 cursor-pointer">
                       <div className="absolute inset-0 overflow-hidden !rounded-[24px] pointer-events-none z-10">
                         <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 dark:opacity-20 mix-blend-overlay" />
                       </div>
                       
                       <div className="absolute top-4 right-6 z-30 flex items-center gap-2 opacity-70 hover:opacity-100 transition-opacity">
                         <span className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-slate-900 dark:text-slate-200">Back to Inspiration</span>
                       </div>

                       <div className="z-20 h-full flex flex-col sm:flex-row gap-6 relative items-center">
                          {/* LEFT: Grind Heatmap */}
                          <div className="flex-1 flex flex-col justify-between w-full h-full py-1">
                             <div>
                               <span className="text-xs font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-2 block leading-none">
                                 {heatmapMonthYearLabel}
                               </span>
                               <h4 className="relative text-sm font-black uppercase tracking-widest text-[var(--mp-role-primary)] mb-5 flex items-center gap-2.5 drop-shadow-sm">
                                  <Activity size={18} /> Grind Heatmap (This Week)
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setHeatmapInfoOpen((prev) => !prev); }}
                                    className="text-slate-400 dark:text-slate-500 hover:text-[var(--mp-role-primary)] transition-colors normal-case tracking-normal font-normal"
                                    aria-label="What does the Grind Heatmap show?"
                                  >
                                    <Info size={14} />
                                  </button>
                                  {heatmapInfoOpen && (
                                    <>
                                      <div className="fixed inset-0 z-40" onClick={() => setHeatmapInfoOpen(false)} />
                                      <div className="absolute top-full left-0 mt-2 w-72 z-50 bg-slate-950 text-white dark:bg-white dark:text-slate-950 text-[11px] leading-relaxed p-4 rounded-2xl font-semibold normal-case tracking-normal shadow-2xl border border-white/10 dark:border-slate-200">
                                        <p className="font-black uppercase text-[10px] tracking-wider mb-2 text-[var(--mp-role-primary)]">What is this?</p>
                                        <p className="mb-2 opacity-90">Each bar is one day. It combines every practice sheet, assessment, and mock exam you completed that day — every attempt counts, not just your last one.</p>
                                        <p className="mb-2 opacity-90">The tier (S/A/B/C/D) reflects both your <span className="text-emerald-400 dark:text-emerald-600">accuracy</span> and your <span className="text-amber-400 dark:text-amber-600">pace</span> against each task's own allotted time — finishing accurately and within your time earns the highest tiers.</p>
                                        <p className="opacity-70">A gray, flat bar means no activity that day.</p>
                                      </div>
                                    </>
                                  )}
                               </h4>
                             </div>
                             <div className="flex items-end justify-between gap-3 h-28 w-full max-w-sm px-2">
                                {grindData.map((d, i) => {
                                  const pct = d.count > 0 ? (d.flowState / 100) * 80 + 20 : 10;
                                  return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group/bar relative">
                                      {/* Tooltip on hover */}
                                      <div className="absolute -top-[100px] left-1/2 -translate-x-1/2 bg-slate-950 text-white dark:bg-white dark:text-slate-950 text-[12px] p-3.5 rounded-2xl font-bold opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-2xl border border-white/10 dark:border-slate-200 w-56 flex flex-col gap-1.5">
                                        <div className="flex justify-between items-center border-b border-white/10 dark:border-slate-200 pb-1.5 font-black text-[13px] uppercase">
                                          <span className="text-rose-500 dark:text-rose-600 drop-shadow-sm">{d.count > 0 ? `${d.flowState}% ${d.tier}` : 'REST DAY'}</span>
                                          <span className="text-[10px] text-slate-300 dark:text-slate-500 opacity-90 font-black tracking-wider">{d.day}</span>
                                        </div>
                                        {d.count > 0 ? (
                                          <>
                                            <div className="flex justify-between leading-none text-[11px] mt-0.5">
                                              <span className="opacity-80">Accuracy: <span className="opacity-100 text-emerald-400 dark:text-emerald-600">{d.accuracy}%</span></span>
                                              <span className="opacity-80">Time: <span className="opacity-100">{d.timeSpent}m</span></span>
                                            </div>
                                            <p className="text-[11px] opacity-90 leading-tight text-center border-t border-white/10 dark:border-slate-300 pt-2 font-semibold italic whitespace-normal mt-1">
                                              "{d.insight}"
                                            </p>
                                          </>
                                        ) : (
                                          <span className="text-[12px] opacity-70 text-center py-2">No conquests attempted</span>
                                        )}
                                      </div>
                                      {/* Fixed-height bar track: the bar's height:X% below needs an
                                          explicit-height ancestor to resolve against, otherwise it
                                          collapses to zero (a "ghost" bar that only shows via tooltip). */}
                                      <div className="h-20 w-full flex items-end">
                                        <div
                                          style={{ height: `${pct}%` }}
                                          className={`w-full rounded-t-[4px] transition-all duration-300 hover:scale-y-105
                                            ${d.timeSpent > 0
                                               ? 'bg-[var(--mp-role-primary)] shadow-[0_0_8px_var(--mp-role-primary)] dark:shadow-[0_0_12px_var(--mp-role-primary)]'
                                               : 'bg-slate-300 dark:bg-white/10'}`}
                                        />
                                      </div>
                                      <div className="flex flex-col items-center gap-1 mt-2">
                                        <span className="text-[11px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-none">{d.day}</span>
                                        <span className="text-xs sm:text-sm font-black text-slate-800 dark:text-slate-200 leading-none">{parseInt(d.date.split("-")[2], 10)}</span>
                                      </div>
                                    </div>
                                  );
                                })}
                             </div>
                             <p className="text-[11px] sm:text-xs font-black text-slate-500 dark:text-slate-400 mt-6 uppercase tracking-[0.25em] leading-none">
                                Consistency: Top 5% this week.
                             </p>
                          </div>

                          {/* RIGHT: Next Conquest */}
                          <div className="flex-1 flex flex-col justify-between border-t sm:border-t-0 sm:border-l border-slate-300 dark:border-white/10 pt-6 sm:pt-0 sm:pl-8 w-full h-full py-1">
                             <div className="flex items-center justify-between w-full mb-4">
                               <h4 className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white flex items-center gap-2.5">
                                  <Target size={18} className="text-red-500" /> Next Conquest {conquests.length > 1 && `(${conquestIndex + 1}/${conquests.length})`}
                               </h4>
                               {conquests.length > 1 && (
                                 <div className="flex items-center gap-1 relative z-40">
                                   <button 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setConquestIndex((prev) => (prev - 1 + conquests.length) % conquests.length);
                                     }}
                                     className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 transition-colors"
                                   >
                                     <ChevronLeft size={14} />
                                   </button>
                                   <button 
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setConquestIndex((prev) => (prev + 1) % conquests.length);
                                     }}
                                     className="p-1 rounded hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-slate-400 transition-colors"
                                   >
                                     <ChevronRight size={14} />
                                   </button>
                                 </div>
                               )}
                             </div>
                             <div className="mb-6 min-h-[50px] h-auto flex flex-col justify-center gap-1.5">
                               <h5 className="text-slate-900 dark:text-white text-sm font-black tracking-wide leading-tight">
                                 {activeConquest.title}
                               </h5>
                               <p className="text-slate-600 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider leading-relaxed">
                                 {activeConquest.detail}
                               </p>
                             </div>
                             <button 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  Router.push(activeConquest.route); 
                                }}
                                className="bg-slate-950 dark:bg-white/10 text-white dark:text-white font-bold uppercase tracking-widest text-[10px] sm:text-xs px-6 py-3.5 rounded-full hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3 w-fit shadow-xl group/btn border border-transparent dark:border-white/20 dark:hover:bg-white/20"
                             >
                                {activeConquest.buttonText} <ArrowRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />
                             </button>
                          </div>
                       </div>
                     </div>
                   </div>
                 </motion.div>
               </TiltCard>

            </div>

            {/* RIGHT COLUMN: Quick Links Bento Grid */}
            <div className="lg:col-span-4 grid grid-cols-2 grid-rows-3 gap-3 sm:gap-4 h-full min-h-0">
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
                  <TiltCard key={LinkItem.Route} onClick={() => Router.push(LinkItem.Route)} className="group h-full">
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
