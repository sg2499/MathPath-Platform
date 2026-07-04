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
  Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library, Swords
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import React, { useRef, useState, useEffect, useMemo } from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate, AnimatePresence } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles as DreiSparkles, Stars, MeshDistortMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
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

// --- GLOBAL R3F BACKGROUNDS ---

function FloatingDataNodes({ count, color, wireframe = true, opacity = 0.3 }: { count: number, color: string, wireframe?: boolean, opacity?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const t = Math.random() * 100;
      const factor = 20 + Math.random() * 100;
      const speed = 0.01 + Math.random() / 200;
      const xFactor = -50 + Math.random() * 100;
      const yFactor = -50 + Math.random() * 100;
      const zFactor = -50 + Math.random() * 100;
      temp.push({ t, factor, speed, xFactor, yFactor, zFactor, mx: 0, my: 0 });
    }
    return temp;
  }, [count]);

  useFrame(() => {
    if (!meshRef.current) return;
    particles.forEach((particle, i) => {
      let { t, factor, speed, xFactor, yFactor, zFactor } = particle;
      t = particle.t += speed / 2;
      const a = Math.cos(t) + Math.sin(t * 1) / 10;
      const b = Math.sin(t) + Math.cos(t * 2) / 10;
      const s = Math.cos(t);
      dummy.position.set(
        (particle.mx / 10) * a + xFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 1) * factor) / 10,
        (particle.my / 10) * b + yFactor + Math.sin((t / 10) * factor) + (Math.cos(t * 2) * factor) / 10,
        (particle.my / 10) * b + zFactor + Math.cos((t / 10) * factor) + (Math.sin(t * 3) * factor) / 10
      );
      dummy.scale.set(s, s, s);
      dummy.rotation.set(s * 5, s * 5, s * 5);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <icosahedronGeometry args={[0.2, 0]} />
      {wireframe ? (
        <meshBasicMaterial color={color} wireframe transparent opacity={opacity} />
      ) : (
        <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.2} metalness={0.6} />
      )}
    </instancedMesh>
  );
}

function GlobalDarkConstellation() {
  return (
    <>
      <ambientLight intensity={0.2} />
      <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
      <DreiSparkles count={300} scale={100} size={4} speed={0.2} opacity={0.3} color="#8b5cf6" />
      <FloatingDataNodes count={150} color="#c084fc" wireframe={true} opacity={0.3} />
      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
      </EffectComposer>
    </>
  );
}

function GlobalLightAuroraMesh() {
  return (
    <div className="fixed inset-0 z-[-10] overflow-hidden bg-slate-50 pointer-events-none">
      <div className="absolute inset-0 opacity-40 mix-blend-soft-light bg-[url('/noise.png')]"></div>
      
      {/* Aurora Orbs - Slow CSS Animations */}
      <motion.div 
        animate={{ 
          x: ['0%', '10%', '-10%', '0%'],
          y: ['0%', '-10%', '10%', '0%'],
          scale: [1, 1.1, 0.9, 1]
        }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full bg-orange-300/40 blur-[120px]"
      />
      
      <motion.div 
        animate={{ 
          x: ['0%', '-15%', '5%', '0%'],
          y: ['0%', '15%', '-5%', '0%'],
          scale: [1, 0.9, 1.1, 1]
        }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut", delay: 2 }}
        className="absolute top-[20%] right-[10%] w-[50%] h-[70%] rounded-full bg-sky-300/40 blur-[120px]"
      />

      <motion.div 
        animate={{ 
          x: ['0%', '5%', '-15%', '0%'],
          y: ['0%', '-5%', '15%', '0%'],
          scale: [1, 1.2, 0.8, 1]
        }}
        transition={{ duration: 35, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        className="absolute -bottom-[20%] left-[20%] w-[70%] h-[60%] rounded-full bg-violet-300/40 blur-[140px]"
      />
    </div>
  );
}

// --- PROCEDURAL GOD-TIER TEMPLATES ---
function generateGodTierStyle(index: number, isDark: boolean) {
  // Golden ratio hue shifting ensures every index gets a unique, pleasant color pair
  const hue1 = Math.floor((index * 137.5) % 360);
  const hue2 = Math.floor((hue1 + 45 + (index * 15) % 90) % 360);
  
  const fonts = ["font-serif", "font-sans", "font-mono"];
  const fontFamily = fonts[index % 3];

  return {
    bg: isDark ? `linear-gradient(135deg, hsla(${hue1}, 50%, 8%, 0.8), hsla(${hue2}, 50%, 4%, 0.9))`
               : `linear-gradient(135deg, hsla(${hue1}, 70%, 98%, 0.8), hsla(${hue2}, 70%, 94%, 0.9))`,
    orb1: `hsla(${hue1}, 80%, 50%, ${isDark ? 0.15 : 0.25})`,
    orb2: `hsla(${hue2}, 80%, 50%, ${isDark ? 0.15 : 0.25})`,
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

const GridIconMap: Record<string, any> = {
  BookOpenCheck, GraduationCap, ShieldCheck, BarChart3, Trophy, Award
};

const QuickLinks = [
  { iconName: "BookOpenCheck", Label: "Practice", Route: "/student/practice" },
  { iconName: "GraduationCap", Label: "Assessments", Route: "/student/assessments" },
  { iconName: "ShieldCheck", Label: "Assessment Readiness", Route: "/student/assessment-readiness" },
  { iconName: "BarChart3", Label: "Progress", Route: "/student/results" },
  { iconName: "Trophy", Label: "Mock Leaderboard", Route: "/student/competition/leaderboard" },
  { iconName: "Award", Label: "Trophy Room", Route: "/student/achievements" },
];

export default function StudentDashboardPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Router = useRouter();
  const isDark = useDarkMode();
  
  const [quoteIndex, setQuoteIndex] = useState(0);
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
  const RecentBadgeIcon = recentBadge && IconMap[recentBadge.icon] ? IconMap[recentBadge.icon] : Award;

  return (
    <AppShell>
      {/* GLOBAL VFX BACKGROUNDS */}
      {isDark ? (
        <div className="fixed inset-0 z-[0] pointer-events-none opacity-60 transition-opacity duration-1000">
           <Canvas camera={{ position: [0, 0, 30], fov: 60 }} gl={{ antialias: true, alpha: true }}>
              <GlobalDarkConstellation />
           </Canvas>
        </div>
      ) : (
        <div className="fixed inset-0 z-[0] pointer-events-none transition-opacity duration-1000">
           <GlobalLightAuroraMesh />
        </div>
      )}

      <main className="math-dashboard-page math-dashboard-student w-full space-y-5 relative z-10">
        
        {/* ROW 1: HERO & HUD - Premium Glassmorphism */}
        <section className="math-dashboard-hero math-dashboard-hero-student relative overflow-hidden rounded-[2rem] border border-white/40 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] dark:shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)] p-6 sm:p-8 bg-white/30 dark:bg-slate-900/30 backdrop-blur-2xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between w-full">
            
            <div className="flex flex-col gap-3">
              <div className="math-block-header inline-flex items-center gap-2 w-fit bg-white/70 dark:bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/50 dark:border-white/10 shadow-sm">
                <Laptop size={14} className="text-[var(--mp-role-primary)] drop-shadow-sm" />
                <span className="font-bold tracking-widest text-[var(--mp-role-primary)] uppercase text-xs">MATHPATH LOBBY</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black tracking-[-0.03em] text-slate-950 dark:text-white drop-shadow-md leading-tight">
                My Learning Workspace
              </h1>
            </div>

            {/* RIGHT SIDE: Level & Coins */}
            <div className="flex flex-wrap gap-4 items-center shrink-0 relative z-20">
               {/* Level Chip */}
               <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl border border-white/60 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md shadow-lg transition-transform hover:scale-105 cursor-pointer">
                 <span className="text-sm font-black uppercase tracking-widest text-slate-900 dark:text-white">Level {currentLevel}</span>
                 <div className="w-24 h-2 bg-slate-200/60 dark:bg-slate-700/60 rounded-full overflow-hidden shadow-inner relative">
                   <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${(xpIntoLevel / 1000) * 100}%` }}
                       transition={{ duration: 1.5, ease: "easeOut" }}
                       className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 absolute top-0 left-0" 
                   />
                   <div className="absolute top-0 left-0 h-full w-[200%] bg-gradient-to-r from-transparent via-white/40 to-transparent animate-[mathShimmer_2s_infinite]" />
                 </div>
                 <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{xpIntoLevel} / 1000 XP</span>
               </div>

               {/* Coins Chip */}
               <div className="flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-orange-900/60 dark:to-orange-800/40 border border-orange-200/60 dark:border-orange-500/30 shadow-lg transition-transform hover:scale-105 cursor-pointer backdrop-blur-md">
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
               <TiltCard className="group w-full h-full min-h-[250px]">
                 <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-[24px] border border-white/50 dark:border-white/10 shadow-2xl transition-all duration-700 backdrop-blur-3xl">
                   <div className="absolute inset-0 bg-[url('/noise.png')] opacity-10 dark:opacity-20 mix-blend-overlay pointer-events-none z-10" />
                   
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
               </TiltCard>

            </div>

            {/* RIGHT COLUMN: Quick Links Bento Grid */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-4 h-full">
              {QuickLinks.map((LinkItem) => {
                const IconCmp = GridIconMap[LinkItem.iconName];
                return (
                  <TiltCard key={LinkItem.Route} onClick={() => Router.push(LinkItem.Route)} className="group h-full min-h-[145px]">
                    <div className="math-dashboard-quick-card flex flex-col items-center justify-center text-center h-full w-full !rounded-[24px] border border-white/50 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-2xl shadow-md hover:shadow-2xl hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all duration-500 relative overflow-hidden">
                      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                      <div className="math-dashboard-quick-icon flex items-center justify-center mb-4 p-5 rounded-[22px] bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 border border-white/80 dark:border-slate-700 shadow-sm transition-all duration-500 group-hover:scale-110 group-hover:-translate-y-1 group-hover:shadow-[0_10px_30px_var(--mp-role-shadow)] z-10 text-slate-600 dark:text-slate-300 group-hover:text-[var(--mp-role-primary)]">
                        {IconCmp && <IconCmp size={36} strokeWidth={2.5} className="text-slate-600 dark:text-slate-300 group-hover:text-[var(--mp-role-primary)] transition-colors" />}
                      </div>
                      <span className="block w-full px-2 text-sm font-black uppercase tracking-widest text-slate-800 dark:text-slate-200 drop-shadow-sm group-hover:text-[var(--mp-role-primary)] transition-colors z-10">
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
