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
import { GAMER_MOTIVATIONS, POP_ART_STYLES } from "./quotes";

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

function GlobalLightDataWave() {
  return (
    <>
      <ambientLight intensity={1.5} color="#ffffff" />
      <directionalLight position={[10, 10, 5]} intensity={3} color="#ea580c" />
      <directionalLight position={[-10, -10, -5]} intensity={1} color="#fcd34d" />
      <DreiSparkles count={400} scale={100} size={8} speed={0.4} opacity={0.8} color="#ea580c" />
      <FloatingDataNodes count={200} color="#ea580c" wireframe={false} opacity={0.7} />
    </>
  );
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
  { Icon: <BookOpenCheck size={18} />, Label: "Practice", Route: "/student/practice" },
  { Icon: <GraduationCap size={18} />, Label: "Assessments", Route: "/student/assessments" },
  { Icon: <ShieldCheck size={18} />, Label: "Assessment Readiness", Route: "/student/assessment-readiness" },
  { Icon: <BarChart3 size={18} />, Label: "Progress", Route: "/student/results" },
  { Icon: <Trophy size={18} />, Label: "Mock Leaderboard", Route: "/student/competition/leaderboard" },
  { Icon: <Award size={18} />, Label: "Trophy Room", Route: "/student/achievements" },
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
      {/* GLOBAL R3F VFX BACKGROUND */}
      <div className="fixed inset-0 z-[0] pointer-events-none opacity-40 dark:opacity-60 transition-opacity duration-1000">
         <Canvas camera={{ position: [0, 0, 30], fov: 60 }} gl={{ antialias: true, alpha: true }}>
            {isDark ? <GlobalDarkConstellation /> : <GlobalLightDataWave />}
         </Canvas>
      </div>

      <main className="math-dashboard-page math-dashboard-student w-full space-y-5 relative z-10">
        
        {/* ROW 1: HERO & HUD - Restored to Standard Conventions */}
        <section className="math-dashboard-hero math-dashboard-hero-student relative overflow-hidden rounded-[2rem] border border-black/5 dark:border-white/10 shadow-2xl p-6 sm:p-8 bg-white/40 dark:bg-slate-900/40 backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between w-full">
            
            <div className="flex flex-col gap-3">
              <div className="math-block-header inline-flex items-center gap-2 w-fit bg-white/70 dark:bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-black/5 dark:border-white/10 shadow-sm">
                <Laptop size={14} className="text-[var(--mp-role-primary)]" />
                <span className="font-bold tracking-widest text-[var(--mp-role-primary)] uppercase text-xs">MATHPATH LOBBY</span>
              </div>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-black tracking-[-0.03em] text-slate-950 dark:text-white drop-shadow-sm leading-tight">
                My Learning Workspace
              </h1>
            </div>

            <div className="flex flex-wrap gap-3 items-center shrink-0">
               <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-black/10 dark:border-white/10 px-4 py-2.5 rounded-2xl shadow-lg min-w-[160px] flex flex-col justify-center">
                  <div className="flex justify-between items-center mb-1.5">
                     <span className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-[11px]">Level {currentLevel}</span>
                     <span className="font-bold text-[var(--mp-role-primary)] text-[10px]">{xpIntoLevel} / 1000 XP</span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                     <motion.div 
                       initial={{ width: 0 }}
                       animate={{ width: `${(xpIntoLevel / 1000) * 100}%` }}
                       transition={{ duration: 1.5, ease: "easeOut" }}
                       className="h-full bg-gradient-to-r from-[var(--mp-role-primary)] to-[var(--mp-role-accent)] shadow-[0_0_10px_var(--mp-role-primary)]"
                     />
                  </div>
               </div>

               <div className="flex items-center gap-3 bg-[var(--mp-role-soft)] backdrop-blur-xl border border-[var(--mp-role-primary)]/30 px-4 py-2.5 rounded-2xl shadow-lg">
                  <div className="p-1.5 bg-[var(--mp-role-primary)] text-white rounded-lg shadow-[0_0_10px_var(--mp-role-primary)]">
                     <Coins size={18} />
                  </div>
                  <div className="flex flex-col justify-center leading-none">
                     <span className="text-[9px] font-black uppercase tracking-widest text-[var(--mp-role-primary)] mb-0.5">Coins</span>
                     <span className="text-sm font-black text-slate-900 dark:text-white">{mathCoins.toLocaleString()}</span>
                  </div>
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
                 <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-3xl border border-black/10 dark:border-white/10 shadow-xl bg-slate-100/90 dark:bg-slate-900/90 backdrop-blur-xl text-slate-900 dark:text-white transition-colors">
                   <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] dark:opacity-10 mix-blend-overlay" />
                   <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
                   
                   <div className="px-6 sm:px-10 pt-5 flex items-center gap-2 z-20 shrink-0">
                     <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                     <span className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Live Intel Feed</span>
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

               {/* 2. Massive Pop-Art Transmission Canvas (Dynamic Height) */}
               <TiltCard className="group w-full h-full min-h-[250px]">
                 <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-3xl shadow-2xl transition-all duration-700 bg-slate-900">
                   <AnimatePresence mode="wait">
                      <motion.div 
                        key={quoteIndex}
                        initial={{ opacity: 0, scale: 0.95 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        exit={{ opacity: 0, scale: 1.05 }} 
                        transition={{ duration: 0.6, type: "spring" }}
                        className="absolute inset-0 flex items-stretch justify-stretch"
                      >
                         {(() => {
                           const activeQuote = GAMER_MOTIVATIONS[quoteIndex];
                           const activeStyle = POP_ART_STYLES[activeQuote.style];
                           return (
                             <div className={`w-full h-full flex flex-col justify-center items-center relative p-8 sm:p-12 ${activeStyle.containerClass} transition-all duration-700`}>
                                {/* Floating Background Physics Placeholder */}
                                <motion.div 
                                  animate={{ y: [-10, 10, -10], rotate: [0, 5, -5, 0] }} 
                                  transition={{ repeat: Number.POSITIVE_INFINITY, duration: 6, ease: "easeInOut" }}
                                  className={`absolute top-8 left-8 w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center opacity-30 blur-sm ${activeStyle.iconBoxClass}`}
                                >
                                   <Cpu size={28} />
                                </motion.div>

                                <motion.div 
                                  animate={{ y: [10, -10, 10], rotate: [0, -5, 5, 0] }} 
                                  transition={{ repeat: Number.POSITIVE_INFINITY, duration: 5, ease: "easeInOut" }}
                                  className={`absolute bottom-8 right-8 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center opacity-40 blur-[2px] ${activeStyle.iconBoxClass}`}
                                >
                                   <Zap size={20} />
                                </motion.div>

                                <div className="z-10 text-center w-full max-w-4xl flex flex-col items-center">
                                  <h3 className={`text-[clamp(1.5rem,4vw,3rem)] ${activeStyle.textClass} leading-[1.2] text-balance break-words`}>
                                     "{activeQuote.text}"
                                  </h3>
                                  {activeQuote.author && (
                                     <motion.div 
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: 0.3 }}
                                      className="mt-6 shrink-0"
                                     >
                                       <span className={`${activeStyle.authorClass} text-sm md:text-lg`}>
                                          - {activeQuote.author}
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
            <div className="lg:col-span-4 grid grid-cols-2 gap-3 h-full">
              {QuickLinks.map((LinkItem) => (
                <TiltCard key={LinkItem.Route} onClick={() => Router.push(LinkItem.Route)} className="group h-full min-h-[135px]">
                  <div className="math-dashboard-quick-card flex flex-col items-center justify-center text-center h-full w-full !rounded-3xl border border-black/10 dark:border-white/10 bg-white/40 dark:bg-slate-900/40 backdrop-blur-md shadow-md hover:shadow-2xl transition-all duration-300">
                    <span className="math-dashboard-quick-icon mb-3 p-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_0_20px_var(--mp-role-shadow)]">
                      {LinkItem.Icon}
                    </span>
                    <span className="block w-full px-2 text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white drop-shadow-sm group-hover:text-[var(--mp-role-primary)] transition-colors">
                      {LinkItem.Label}
                    </span>
                  </div>
                </TiltCard>
              ))}
            </div>

          </div>
        ) : null}
      </main>
    </AppShell>
  );
}
