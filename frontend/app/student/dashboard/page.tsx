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
import { Float, Sparkles as DreiSparkles, MeshDistortMaterial, MeshTransmissionMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import { GAMER_MOTIVATIONS, POP_ART_STYLES } from "./quotes";

const IconMap: Record<string, any> = {
  Target, Focus, Scan, Zap, FastForward, Rocket, Medal, Flag, Crown, Flame,
  Activity, Infinity, Clock, Sun, AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp,
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

// --- R3F DARK ENVIRONMENT (Singularity) ---
function SingularityCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.1;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.15;
    }
    if (wireRef.current) {
      wireRef.current.rotation.x = -state.clock.elapsedTime * 0.2;
      wireRef.current.rotation.y = -state.clock.elapsedTime * 0.3;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.5} floatIntensity={1}>
      <mesh ref={meshRef} position={[6, 0, -2]} scale={1.2}>
        <sphereGeometry args={[2, 64, 64]} />
        <MeshDistortMaterial color="#000000" emissive="#4c1d95" emissiveIntensity={0.5} distort={0.6} speed={3} roughness={0} metalness={1} />
      </mesh>
      <mesh ref={wireRef} position={[6, 0, -2]} scale={1.4}>
        <torusKnotGeometry args={[1.5, 0.4, 128, 16]} />
        <meshBasicMaterial color="#a855f7" wireframe transparent opacity={0.3} />
      </mesh>
    </Float>
  );
}

function DarkEnvironment() {
  return (
    <>
      <ambientLight intensity={0.2} />
      <SingularityCore />
      <DreiSparkles count={200} scale={25} size={3} speed={0.2} opacity={0.4} color="#c084fc" />
      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
      </EffectComposer>
    </>
  );
}

// --- R3F LIGHT ENVIRONMENT (Crystalline) ---
function CrystallineCore() {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.x = state.clock.elapsedTime * 0.15;
      meshRef.current.rotation.y = state.clock.elapsedTime * 0.2;
    }
  });

  return (
    <Float speed={2.5} rotationIntensity={1} floatIntensity={1.5}>
      <mesh ref={meshRef} position={[6, 0, -2]} scale={1.8}>
        <icosahedronGeometry args={[1.5, 0]} />
        <MeshTransmissionMaterial 
          backside
          samples={4}
          thickness={1.5}
          chromaticAberration={0.05}
          anisotropy={0.1}
          distortion={0.2}
          distortionScale={0.3}
          temporalDistortion={0.1}
          clearcoat={1}
          attenuationDistance={0.5}
          attenuationColor="#fb923c"
          color="#fff7ed"
        />
      </mesh>
    </Float>
  );
}

function LightEnvironment() {
  return (
    <>
      <ambientLight intensity={1.5} color="#ffffff" />
      <directionalLight position={[10, 10, 5]} intensity={3} color="#fcd34d" />
      <pointLight position={[4, -2, 2]} intensity={2} color="#f472b6" />
      <CrystallineCore />
      <DreiSparkles count={100} scale={20} size={5} speed={0.5} opacity={0.6} color="#fb923c" />
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
      onClick={onClick}
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
      <main className="math-dashboard-page math-dashboard-student w-full space-y-5">
        
        {/* ROW 1: HERO & HUD */}
        <section className="math-dashboard-hero math-dashboard-hero-student relative overflow-hidden h-[180px] rounded-[2rem] border border-black/5 dark:border-white/10 shadow-2xl flex items-center p-6 sm:p-8">
          <div className="absolute inset-0 z-0 pointer-events-none opacity-80 dark:opacity-100 mix-blend-normal">
             <Canvas camera={{ position: [0, 0, 10], fov: 45 }} gl={{ antialias: true, alpha: true }}>
                {isDark ? <DarkEnvironment /> : <LightEnvironment />}
             </Canvas>
          </div>

          <div className="absolute top-6 left-6 z-10">
            <div className="math-block-header inline-flex items-center gap-2 bg-white/70 dark:bg-black/40 backdrop-blur-md px-4 py-1.5 rounded-full border border-black/5 dark:border-white/10 shadow-sm">
              <Laptop size={14} className="text-[var(--mp-role-primary)]" />
              <span className="font-bold tracking-widest text-[var(--mp-role-primary)] uppercase text-xs">MATHPATH LOBBY</span>
            </div>
          </div>

          <div className="absolute top-6 right-6 z-10 flex gap-3">
             <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-black/10 dark:border-white/10 px-4 py-2 rounded-2xl shadow-xl min-w-[180px] flex flex-col justify-center">
                <div className="flex justify-between items-center mb-1.5">
                   <span className="font-black text-slate-900 dark:text-white uppercase tracking-widest text-xs">Level {currentLevel}</span>
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

             <div className="flex items-center gap-2 bg-[var(--mp-role-soft)] backdrop-blur-xl border border-[var(--mp-role-primary)]/30 px-4 py-2 rounded-2xl shadow-xl">
                <div className="p-1.5 bg-[var(--mp-role-primary)] text-white rounded-lg shadow-[0_0_10px_var(--mp-role-primary)]">
                   <Coins size={16} />
                </div>
                <div className="flex flex-col justify-center leading-none">
                   <span className="text-[9px] font-black uppercase tracking-widest text-[var(--mp-role-primary)] mb-0.5">Coins</span>
                   <span className="text-sm font-black text-slate-900 dark:text-white">{mathCoins.toLocaleString()}</span>
                </div>
             </div>
          </div>

          <div className="relative z-10 w-full text-center mt-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-[-0.04em] text-slate-900 dark:text-white drop-shadow-md">
              My Learning Workspace
            </h1>
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
                           className="relative z-10 w-full h-full px-6 sm:px-10 flex items-center justify-start gap-6 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors focus:outline-none"
                         >
                            <div className="w-24 h-24 shrink-0 rounded-2xl bg-gradient-to-br from-rose-400 to-red-600 flex items-center justify-center shadow-[0_0_30px_rgba(244,63,94,0.3)]">
                               <Crown size={36} className="text-white" />
                            </div>
                            <div>
                               <h2 className="text-xl sm:text-3xl font-black tracking-tight mb-2 text-rose-600 dark:text-rose-400">
                                  LEADERBOARD RANKING
                               </h2>
                               <p className="text-slate-600 dark:text-slate-300 font-medium">
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

               {/* 2. Massive Pop-Art Transmission Canvas */}
               <TiltCard className="group w-full h-[280px]">
                 <div className="relative overflow-hidden h-full flex flex-col justify-center !rounded-3xl shadow-2xl transition-all duration-700 bg-slate-900">
                   <AnimatePresence mode="wait">
                      <motion.div 
                        key={quoteIndex}
                        initial={{ opacity: 0, scale: 0.9, rotate: -2 }} 
                        animate={{ opacity: 1, scale: 1, rotate: 0 }} 
                        exit={{ opacity: 0, scale: 1.1, rotate: 2 }} 
                        transition={{ duration: 0.6, type: "spring" }}
                        className="absolute inset-0 flex items-center justify-center"
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
                                  className={`absolute top-8 left-8 w-16 h-16 rounded-2xl flex items-center justify-center opacity-30 blur-sm ${activeStyle.iconBoxClass}`}
                                >
                                   <Cpu size={32} />
                                </motion.div>

                                <motion.div 
                                  animate={{ y: [10, -10, 10], rotate: [0, -5, 5, 0] }} 
                                  transition={{ repeat: Number.POSITIVE_INFINITY, duration: 5, ease: "easeInOut" }}
                                  className={`absolute bottom-8 right-8 w-12 h-12 rounded-full flex items-center justify-center opacity-40 blur-[2px] ${activeStyle.iconBoxClass}`}
                                >
                                   <Zap size={24} />
                                </motion.div>

                                <div className="z-10 text-center max-w-3xl">
                                  <h3 className={`text-2xl sm:text-4xl md:text-5xl ${activeStyle.textClass} leading-tight`}>
                                     "{activeQuote.text}"
                                  </h3>
                                  {activeQuote.author && (
                                     <motion.div 
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: 0.3 }}
                                      className="mt-6"
                                     >
                                       <span className={`${activeStyle.authorClass} text-lg md:text-xl`}>
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
