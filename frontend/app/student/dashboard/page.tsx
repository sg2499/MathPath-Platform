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
  FastForward, Rocket, Medal, Flag, Crown, Flame, Activity, Infinity, Clock, Sun,
  AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, Star, Sparkles, Crosshair,
  Aperture, Radar, Shield, Anchor, Mountain, Brain, Lightbulb, Library
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import React, { useRef, useState, useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate, AnimatePresence } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles as DreiSparkles, MeshDistortMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { GAMER_MOTIVATIONS, POP_ART_STYLES } from "./quotes";

const IconMap: Record<string, any> = {
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal, Flag, Crown, Flame,
  Activity, Infinity, Clock, Sun, AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp,
  Trophy, Star, Sparkles, Crosshair, Aperture, Radar, Shield, Anchor, Mountain,
  Brain, Lightbulb, Library, Award
};

// --- R3F HERO ENVIRONMENT ---
function LiquidCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.2;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <Float speed={2} rotationIntensity={1} floatIntensity={2}>
      <mesh ref={meshRef} position={[6, 0, -2]} scale={1.5}>
        <sphereGeometry args={[2, 64, 64]} />
        <MeshDistortMaterial 
          color="#f97316"
          emissive="#f43f5e"
          emissiveIntensity={1}
          distort={0.4} 
          speed={2} 
          roughness={0.2} 
          metalness={0.8} 
          transparent
          opacity={0.8}
        />
      </mesh>
    </Float>
  );
}

function HeroEnvironment() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={2} color="#ffffff" />
      <LiquidCore />
      <DreiSparkles count={150} scale={20} size={4} speed={0.4} opacity={0.6} color="#fb7185" />
      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.5} mipmapBlur intensity={1.2} />
      </EffectComposer>
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

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-6, 6]);

  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], [0, 100]);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.15) 0%, transparent 60%)`;

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
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className={`relative transition-all duration-300 transform-gpu z-10 hover:z-20 ${className}`}
    >
      <motion.div 
        className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] mix-blend-overlay transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{ background: glareBackground }}
      />
      <div style={{ transform: "translateZ(20px)", transformStyle: "preserve-3d" }} className="h-full w-full">
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
      setIntelIndex((prev) => (prev + 1) % 3);
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
      <main className="math-dashboard-page math-dashboard-student w-full space-y-5">
        
        {/* ROW 1: HERO & HUD */}
        <section className="math-dashboard-hero math-dashboard-hero-student relative overflow-hidden flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between !p-8 md:!p-10 rounded-[2rem] border border-black/5 dark:border-white/10 shadow-2xl">
          <div className="absolute inset-0 z-0 pointer-events-none opacity-50 dark:opacity-70 mix-blend-screen dark:mix-blend-lighten">
             <Canvas camera={{ position: [0, 0, 10], fov: 45 }} gl={{ antialias: true, alpha: true }}>
                <HeroEnvironment />
             </Canvas>
          </div>

          <div className="relative z-10 min-w-0">
            <div className="math-block-header inline-flex items-center gap-2 mb-3 bg-white/50 dark:bg-black/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-black/5 dark:border-white/10 shadow-sm">
              <Laptop size={14} className="text-[var(--mp-role-primary)]" />
              <span className="font-bold tracking-widest text-[var(--mp-role-primary)] uppercase text-xs">MATHPATH LOBBY</span>
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-[3rem] font-black tracking-[-0.04em] text-slate-950 dark:text-white drop-shadow-sm">
              My Learning Workspace
            </h1>
            <p className="math-subtitle mt-3 max-w-xl text-lg font-medium opacity-90">
              Welcome back. Track your learning progress, practice daily, and stay ready.
            </p>
          </div>
          
          <div className="relative z-10 flex flex-col sm:flex-row gap-4 items-center">
             <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border border-black/10 dark:border-white/10 p-4 rounded-2xl shadow-xl min-w-[200px]">
                <div className="flex justify-between items-center mb-2">
                   <span className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-xs">Level {currentLevel}</span>
                   <span className="font-bold text-[var(--mp-role-primary)] text-xs">{xpIntoLevel} / 1000 XP</span>
                </div>
                <div className="h-2 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                   <motion.div 
                     initial={{ width: 0 }}
                     animate={{ width: `${(xpIntoLevel / 1000) * 100}%` }}
                     transition={{ duration: 1.5, ease: "easeOut" }}
                     className="h-full bg-gradient-to-r from-[var(--mp-role-primary)] to-[var(--mp-role-accent)] shadow-[0_0_10px_var(--mp-role-primary)]"
                   />
                </div>
             </div>

             <div className="flex items-center gap-3 bg-[var(--mp-role-soft)] backdrop-blur-xl border border-[var(--mp-role-primary)]/30 p-4 rounded-2xl shadow-xl">
                <div className="p-2 bg-[var(--mp-role-primary)] text-white rounded-xl shadow-[0_0_15px_var(--mp-role-primary)]">
                   <Coins size={20} />
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-[var(--mp-role-primary)]">Math Coins</p>
                   <p className="text-xl font-black text-slate-900 dark:text-white">{mathCoins.toLocaleString()}</p>
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
                 <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-3xl border border-black/10 dark:border-white/10 shadow-xl bg-slate-100 dark:bg-slate-900 text-slate-900 dark:text-white transition-colors">
                   <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] dark:opacity-10 mix-blend-overlay" />
                   <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.03)_1px,transparent_1px)] dark:bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:20px_20px] pointer-events-none" />
                   
                   <div className="absolute top-5 left-6 flex items-center gap-2 z-20">
                     <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                     <span className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Live Intel Feed</span>
                   </div>

                   <AnimatePresence mode="wait">
                      {intelIndex === 0 && (
                         <motion.button 
                           key="slide-0"
                           onClick={() => Router.push("/student/achievements")}
                           initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.5 }}
                           className="relative z-10 w-full h-full px-6 sm:px-10 flex items-center justify-start gap-6 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-24 h-24 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-700 p-[3px] shadow-[0_0_30px_rgba(99,102,241,0.3)]">
                               <div className="w-full h-full bg-white dark:bg-slate-900 rounded-[14px] flex items-center justify-center">
                                  <RecentBadgeIcon size={32} className="text-indigo-500 dark:text-indigo-400" />
                               </div>
                            </div>
                            <div>
                               <h2 className="text-xl sm:text-3xl font-black italic tracking-tight mb-2 text-indigo-600 dark:text-indigo-400">
                                  {recentBadge ? "LATEST UNLOCK" : "NO RECENT UNLOCKS"}
                               </h2>
                               <p className="text-slate-600 dark:text-slate-300 font-medium">
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
                           className="relative z-10 w-full h-full px-6 sm:px-10 flex items-center justify-start gap-6 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-24 h-24 shrink-0 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
                               <CheckCircle size={32} className="text-amber-500" />
                            </div>
                            <div>
                               <h2 className="text-xl sm:text-3xl font-black italic tracking-tight text-amber-600 dark:text-amber-500 mb-2">
                                  DAILY OBJECTIVE
                               </h2>
                               <p className="text-slate-600 dark:text-slate-300 font-medium">
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
                           className="relative z-10 w-full h-full px-6 sm:px-10 flex items-center justify-start gap-6 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-24 h-24 shrink-0 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center shadow-[0_0_30px_rgba(52,211,153,0.3)]">
                               <ShieldCheck size={36} className="text-white" />
                            </div>
                            <div>
                               <h2 className="text-xl sm:text-3xl font-black tracking-tight mb-2 text-emerald-600 dark:text-emerald-400">
                                  MOCK READINESS
                               </h2>
                               <p className="text-slate-600 dark:text-slate-300 font-medium">
                                  Challenge yourself with the next Mock Exam to test your readiness and secure your leaderboard rank.
                               </p>
                               <span className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-500">
                                  View Mock Exams <ChevronRight size={14} />
                               </span>
                            </div>
                         </motion.button>
                      )}
                   </AnimatePresence>

                   {/* Carousel Indicators (Clickable) */}
                   <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 z-20">
                      {[0, 1, 2].map(i => (
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

               {/* 2. Transmission Block */}
               <TiltCard className="group w-full h-[200px]">
                 <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-3xl border border-black/10 dark:border-white/10 shadow-xl transition-all duration-500 bg-slate-50 dark:bg-slate-900">
                   <div className="absolute top-4 left-6 flex items-center gap-2 z-20 mix-blend-difference text-white">
                     <RadioTower size={14} className="opacity-80" />
                     <span className="text-xs font-black uppercase tracking-widest opacity-80">Incoming Transmission</span>
                   </div>
                   
                   <AnimatePresence mode="wait">
                      <motion.div 
                        key={quoteIndex}
                        initial={{ opacity: 0, filter: "blur(10px) brightness(2)" }} 
                        animate={{ opacity: 1, filter: "blur(0px) brightness(1)" }} 
                        exit={{ opacity: 0, filter: "blur(10px) brightness(0.5)" }} 
                        transition={{ duration: 0.6 }}
                        className="absolute inset-0 flex items-center justify-center p-6"
                      >
                         {(() => {
                           const activeQuote = GAMER_MOTIVATIONS[quoteIndex];
                           const activeStyle = POP_ART_STYLES[activeQuote.style];
                           return (
                             <div className={`w-full h-full flex flex-col justify-center relative p-6 rounded-2xl ${activeStyle.containerClass} transition-all duration-500`}>
                                <div className={`absolute -top-4 -left-4 w-10 h-10 rounded-xl flex items-center justify-center ${activeStyle.iconBoxClass}`}>
                                   <Cpu size={20} />
                                </div>
                                <h3 className={`text-lg sm:text-2xl mt-2 ${activeStyle.textClass} leading-tight`}>
                                   "{activeQuote.text}"
                                </h3>
                                {activeQuote.author && (
                                   <p className={`mt-3 ${activeStyle.authorClass}`}>
                                      - {activeQuote.author}
                                   </p>
                                )}
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
                  <div className="math-dashboard-quick-card flex flex-col items-center justify-center text-center h-full w-full !rounded-3xl border border-black/5 dark:border-white/5 shadow-md hover:shadow-2xl transition-all duration-300">
                    <span className="math-dashboard-quick-icon mb-3 p-3 rounded-2xl shadow-inner transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_0_20px_var(--mp-role-shadow)]">
                      {LinkItem.Icon}
                    </span>
                    <span className="block w-full px-2 text-xs font-black uppercase tracking-tight text-slate-900 dark:text-white/90 drop-shadow-sm group-hover:text-[var(--mp-role-primary)] transition-colors">
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
