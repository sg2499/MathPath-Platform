"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getStudentAssignments, getStudentAssessments } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  BookOpenCheck,
  GraduationCap,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy,
  Laptop,
  Zap,
  Milestone,
  PlayCircle,
  Eye,
  ArrowRight,
  Award,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import React, { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from "framer-motion";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sparkles as DreiSparkles, MeshDistortMaterial } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";

type ProgressionTone = "success" | "ready" | "focus" | "steady";

function NormalizeStatus(Value: unknown) {
  return String(Value ?? "").toUpperCase();
}

function MessageIndex(Seed: unknown, Count: number) {
  if (Count <= 1) return 0;
  const Text = String(Seed || "MathPath Journey");
  const Total = Array.from(Text).reduce((Sum, Character) => Sum + Character.charCodeAt(0), 0);
  return Total % Count;
}

function PickMessage(Seed: unknown, Messages: string[]) {
  return Messages[MessageIndex(Seed, Messages.length)] || Messages[0];
}

function HasStartedPromotedLevel(Row: Record<string, any>, Assignments: Array<Record<string, any>>) {
  if (Row?.hasStartedPromotedLevel) return true;
  const ToLevelCode = NormalizeStatus(Row?.toLevelCode);
  if (!ToLevelCode) return false;
  return Assignments.some((Assignment) => {
    const SameLevel = NormalizeStatus(Assignment?.levelCode) === ToLevelCode;
    const AssignmentStatus = NormalizeStatus(Assignment?.status);
    return SameLevel && (Boolean(Assignment?.attemptId) || !["", "PENDING", "NOT_STARTED"].includes(AssignmentStatus));
  });
}

function BuildStudentProgressionMessage(Assessments: Array<Record<string, any>>, Assignments: Array<Record<string, any>>) {
  const Promoted = Assessments.find((Row) => (Row?.isPromoted || NormalizeStatus(Row?.progressionStatus) === "PROMOTED") && !HasStartedPromotedLevel(Row, Assignments));
  if (Promoted) {
    return {
      Tone: "success" as ProgressionTone,
      Label: "Promoted",
      Title: "Your Next Level Is Ready",
      Message: PickMessage(Promoted?.attemptId || Promoted?.assignmentId || Promoted?.assessmentTitle, [
        "Amazing work! Your new level is ready. Keep building speed, accuracy, and confidence one step at a time.",
        "You have moved forward in your MathPath journey. Stay curious, stay focused, and enjoy the next challenge.",
        "Wonderful progress! Your next learning path is open, and your steady practice has helped you reach this milestone.",
      ]),
      ActionLabel: "Open Progress",
      ActionRoute: "/student/results",
    };
  }

  const Ready = Assessments.find((Row) => Row?.isReadyForNextLevel || NormalizeStatus(Row?.progressionStatus) === "READY_FOR_NEXT_LEVEL");
  if (Ready) {
    return {
      Tone: "ready" as ProgressionTone,
      Label: "Ready For Next Level",
      Title: "You Are Ready For The Next Level",
      Message: PickMessage(Ready?.attemptId || Ready?.assignmentId || Ready?.assessmentTitle, [
        "Fantastic progress! You cleared your level assessment, and your next learning milestone is now within reach.",
        "Great work completing this level assessment. Your teacher will guide the next step so your journey continues smoothly.",
        "You have shown strong focus and steady effort. Keep your confidence high as you prepare for the next level.",
      ]),
      ActionLabel: "Review Assessments",
      ActionRoute: "/student/assessments",
    };
  }

  const NeedsReattempt = Assessments.find((Row) => {
    const Status = NormalizeStatus(Row?.status);
    return Status === "REATTEMPT_AVAILABLE" || Status === "NEEDS_RE_ATTEMPT" || Status === "NEEDS_REATTEMPT";
  });
  if (NeedsReattempt) {
    return {
      Tone: "focus" as ProgressionTone,
      Label: "Focused Practice",
      Title: "You Are Getting Closer",
      Message: PickMessage(NeedsReattempt?.attemptId || NeedsReattempt?.assignmentId || NeedsReattempt?.assessmentTitle, [
        "Every mistake is a clue. Review calmly, practise again, and your next attempt can be stronger.",
        "You are still building this skill. Step-by-step practice will help your confidence and accuracy grow.",
        "Stay steady. A little focused revision will help you move closer to clearing this level.",
      ]),
      ActionLabel: "Review Assessments",
      ActionRoute: "/student/assessments",
    };
  }

  return {
    Tone: "steady" as ProgressionTone,
    Label: "Learning Journey",
    Title: "Keep Building Your Skills",
    Message: PickMessage(Assessments[0]?.assessmentTitle || Assessments.length, [
      "Complete your assigned practice and assessments step by step. Every focused session brings you closer to your next milestone.",
      "Keep learning with patience and focus. Small daily wins will build strong number confidence.",
      "Your MathPath journey grows with every attempt. Stay curious and keep moving forward.",
    ]),
    ActionLabel: "Continue Learning",
    ActionRoute: Assessments.length > 0 ? "/student/assessments" : "/student/practice",
  };
}

const QuickLinks = [
  { Icon: <BookOpenCheck size={18} />, Label: "Practice", Route: "/student/practice" },
  { Icon: <GraduationCap size={18} />, Label: "Assessments", Route: "/student/assessments" },
  { Icon: <ShieldCheck size={18} />, Label: "Assessment Readiness", Route: "/student/assessment-readiness" },
  { Icon: <BarChart3 size={18} />, Label: "Progress", Route: "/student/results" },
  { Icon: <Trophy size={18} />, Label: "Mock Leaderboard", Route: "/student/competition/leaderboard" },
  { Icon: <Award size={18} />, Label: "Trophy Room", Route: "/student/achievements" },
];

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
          color="#f97316" // Orange base to match Student Theme
          emissive="#f43f5e" // Rose/Pink accent
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
      
      {/* Magical dust matching the theme */}
      <DreiSparkles count={150} scale={20} size={4} speed={0.4} opacity={0.6} color="#fb7185" />

      {/* Subtle bloom so it doesn't wash out the underlying CSS gradient */}
      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.5} mipmapBlur intensity={1.2} />
      </EffectComposer>
    </>
  );
}

// --- 3D FRAMER MOTION TILT CARD ---
// We wrap native CSS classes with this physics engine.
function TiltCard({ children, className, onClick }: { children: ReactNode, className?: string, onClick?: () => void }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Smooth, weighted spring for premium feel
  const springConfig = { damping: 25, stiffness: 120, mass: 1 };
  const mouseXSpring = useSpring(x, springConfig);
  const mouseYSpring = useSpring(y, springConfig);

  // Subtle 3D tilt
  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [6, -6]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-6, 6]);

  // Dynamic light glare that follows the mouse
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
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className={`relative cursor-pointer transition-all duration-300 transform-gpu z-10 hover:z-20 ${className}`}
    >
      {/* Glare Overlay */}
      <motion.div 
        className="absolute inset-0 z-50 pointer-events-none rounded-[inherit] mix-blend-overlay transition-opacity duration-300 opacity-0 group-hover:opacity-100"
        style={{ background: glareBackground }}
      />
      {/* Elevate children off the card base for parallax */}
      <div style={{ transform: "translateZ(20px)", transformStyle: "preserve-3d" }} className="h-full w-full">
         {children}
      </div>
    </motion.div>
  );
}

export default function StudentDashboardPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const Router = useRouter();

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

  if (!Ready) return null;

  const Assignments = AssignmentQuery.data ?? [];
  const Assessments = AssessmentQuery.data ?? [];
  const ProgressionMessage = BuildStudentProgressionMessage(Assessments as Array<Record<string, any>>, Assignments as Array<Record<string, any>>);
  const ActiveAssignments = Assignments.filter(
    (Assignment) =>
      Assignment.status === "NOT_STARTED" ||
      Assignment.status === "IN_PROGRESS" ||
      Assignment.status === "REATTEMPT_AVAILABLE"
  );

  return (
    <AppShell>
      {/* We restore the exact native math-dashboard-page wrappers to perfectly hook into globals.css theme variables */}
      <main className="math-dashboard-page math-dashboard-student w-full space-y-5">
        
        {/* HERO SECTION (Row 1 of the Bento Grid) */}
        <section className="math-dashboard-hero math-dashboard-hero-student relative overflow-hidden flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between !p-8 md:!p-10 rounded-[2rem] border border-black/5 dark:border-white/10 shadow-2xl">
          
          {/* R3F Canvas - Absolute positioned behind the text, with alpha=true so the native gradient shows through! */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-50 dark:opacity-70 mix-blend-screen dark:mix-blend-lighten">
             <Canvas camera={{ position: [0, 0, 10], fov: 45 }} gl={{ antialias: true, alpha: true }}>
                <HeroEnvironment />
             </Canvas>
          </div>

          <div className="relative z-10 min-w-0">
            <div className="math-block-header inline-flex items-center gap-2 mb-3 bg-white/50 dark:bg-black/20 backdrop-blur-md px-4 py-1.5 rounded-full border border-black/5 dark:border-white/10 shadow-sm">
              <Laptop size={14} className="text-[var(--mp-role-primary)]" />
              <span className="font-bold tracking-widest text-[var(--mp-role-primary)]">Student Workspace</span>
            </div>
            <h1 className="flex items-center gap-3 text-4xl sm:text-5xl lg:text-[3rem] font-black tracking-[-0.04em] text-slate-950 dark:text-white drop-shadow-sm">
              My Learning Dashboard
            </h1>
            <p className="math-subtitle mt-3 max-w-2xl text-lg font-medium opacity-90">
              Practice, assessments, and progress in one vibrant learning space.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => Router.push(ActiveAssignments.length > 0 ? "/student/practice" : ProgressionMessage.ActionRoute)}
                className="math-dashboard-primary-action px-8 py-3.5 rounded-xl font-bold tracking-wide transition-transform hover:scale-105 active:scale-95 shadow-xl"
              >
                <Sparkles size={16} className="inline-block mr-2 -mt-0.5" />
                {ActiveAssignments.length > 0 ? "Continue Practice" : ProgressionMessage.ActionLabel}
              </button>
              <button
                type="button"
                onClick={() => Router.push("/student/results")}
                className="math-dashboard-secondary-action px-8 py-3.5 rounded-xl font-bold tracking-wide transition-transform hover:scale-105 active:scale-95 shadow-sm"
              >
                <BarChart3 size={16} className="inline-block mr-2 -mt-0.5" />
                Open Progress
              </button>
            </div>
          </div>
          
          <div className="math-dashboard-readable-pulse math-dashboard-readable-pulse-student relative z-10 !rounded-2xl border border-white/20 dark:border-white/10 backdrop-blur-xl">
            <p className="math-dashboard-pulse-eyebrow font-bold tracking-widest mb-1 text-xs uppercase">Learning Pulse</p>
            <h2 className="text-2xl font-black mb-1 drop-shadow-sm text-white">Next Step</h2>
            <p className="font-medium opacity-90 leading-relaxed text-sm text-white/90">
              {ActiveAssignments.length > 0
                ? "Continue your assigned DPS from Practice."
                : "Review progress or readiness for your next step."}
            </p>
          </div>
        </section>

        {AssignmentQuery.isLoading || AssessmentQuery.isLoading ? <LoadingState label="Loading your universe..." /> : null}
        {AssignmentQuery.error ? <ErrorState message={apiErrorMessage(AssignmentQuery.error)} /> : null}
        {AssessmentQuery.error ? <ErrorState message={apiErrorMessage(AssessmentQuery.error)} /> : null}

        {!AssignmentQuery.isLoading && !AssessmentQuery.isLoading && !AssignmentQuery.error && !AssessmentQuery.error ? (
          
          /* BENTO GRID LAYOUT (Row 2) - No Scrolling Needed */
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            
            {/* LEFT COLUMN: Journey & Priority (Spans 8 cols) */}
            <div className="lg:col-span-8 flex flex-col gap-5 h-full">
               
               {/* 1. Journey Card (Wrapped in TiltCard for physics, but retains native CSS) */}
               <TiltCard onClick={() => Router.push(ProgressionMessage.ActionRoute)} className="group w-full h-full">
                 <div className="math-dashboard-journey-card flex flex-col h-full justify-center gap-4 sm:flex-row sm:items-center sm:justify-between !rounded-3xl border border-black/5 dark:border-white/5 shadow-xl transition-colors hover:border-[var(--mp-role-primary)]/30">
                   <div className="flex min-w-0 gap-5 items-center">
                     <span className={`inline-flex h-16 w-16 shrink-0 items-center justify-center rounded-[1.25rem] border shadow-inner bg-white dark:bg-black/20 ${
                        ProgressionMessage.Tone === 'success' ? 'border-emerald-200 text-emerald-600 dark:border-emerald-500/30 dark:text-emerald-400' :
                        ProgressionMessage.Tone === 'ready' ? 'border-violet-200 text-violet-600 dark:border-violet-500/30 dark:text-violet-400' :
                        ProgressionMessage.Tone === 'focus' ? 'border-amber-200 text-amber-600 dark:border-amber-500/30 dark:text-amber-400' :
                        'border-blue-200 text-blue-600 dark:border-blue-500/30 dark:text-blue-400'
                     }`}>
                       <Trophy size={28} className="drop-shadow-sm" />
                     </span>
                     <div className="min-w-0">
                       <div className="flex flex-wrap items-center gap-2 mb-1.5">
                         <div className="math-block-header !mb-0 !bg-transparent !p-0">
                           <Milestone size={14} /> Next Level Journey
                         </div>
                         <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-widest shadow-sm ${
                            ProgressionMessage.Tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' :
                            ProgressionMessage.Tone === 'ready' ? 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-500/20 dark:bg-violet-500/10 dark:text-violet-300' :
                            ProgressionMessage.Tone === 'focus' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300' :
                            'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300'
                         }`}>
                           {ProgressionMessage.Label}
                         </span>
                       </div>
                       <h2 className="text-xl md:text-2xl font-black tracking-tight text-slate-950 dark:text-white drop-shadow-sm">{ProgressionMessage.Title}</h2>
                       <p className="math-subtitle !mt-1 max-w-lg">{ProgressionMessage.Message}</p>
                     </div>
                   </div>
                   <div className="shrink-0">
                     <button type="button" className="math-dashboard-primary-action px-6 py-3 rounded-xl font-bold transition-transform group-hover:scale-105 shadow-lg">
                       <Sparkles size={15} className="inline-block mr-1.5 -mt-0.5" />
                       {ProgressionMessage.ActionLabel}
                     </button>
                   </div>
                 </div>
               </TiltCard>

               {/* 2. Priority Panel */}
               <TiltCard className="group w-full h-full">
                 <div className="math-dashboard-priority-panel flex flex-col justify-between h-full !rounded-3xl border border-black/5 dark:border-white/5 shadow-xl transition-colors hover:border-[var(--mp-role-primary)]/30">
                   <div>
                     <div className="math-block-header inline-flex items-center gap-2 mb-3 bg-[var(--mp-role-soft)] backdrop-blur-md px-3 py-1 rounded-full border border-[var(--mp-role-shadow)]">
                       <Zap size={14} className="text-[var(--mp-role-primary)]" />
                       <span className="font-bold tracking-widest text-[var(--mp-role-primary)]">Learning Priority</span>
                     </div>
                     <h2 className="text-2xl md:text-3xl font-black tracking-tight text-slate-950 dark:text-white drop-shadow-sm">
                       {ActiveAssignments.length > 0 ? "Continue Assigned Practice" : "Review Learning Progress"}
                     </h2>
                     <p className="math-subtitle mt-2 max-w-xl">
                       {ActiveAssignments.length > 0
                         ? "Complete assigned DPS, then check readiness for your next step."
                         : "Review attempts, scores, progress, and readiness."}
                     </p>
                   </div>
                   <div className="mt-6 flex flex-wrap gap-3">
                     <button
                       type="button"
                       onClick={(e) => { e.stopPropagation(); Router.push(ActiveAssignments.length > 0 ? "/student/practice" : "/student/results"); }}
                       className="math-dashboard-primary-action px-7 py-3 rounded-xl font-bold transition-transform hover:scale-105 active:scale-95 shadow-lg"
                     >
                       <Sparkles size={15} className="inline-block mr-1.5 -mt-0.5" />
                       {ActiveAssignments.length > 0 ? "Practice Review" : "Progress Review"}
                     </button>
                     <button
                       type="button"
                       onClick={(e) => { e.stopPropagation(); Router.push("/student/assessment-readiness"); }}
                       className="math-dashboard-secondary-action px-7 py-3 rounded-xl font-bold transition-transform hover:scale-105 active:scale-95 shadow-sm"
                     >
                       <ShieldCheck size={15} className="inline-block mr-1.5 -mt-0.5" />
                       Assessment Readiness
                     </button>
                   </div>
                 </div>
               </TiltCard>

            </div>

            {/* RIGHT COLUMN: Quick Links Bento Grid (Spans 4 cols) */}
            <div className="lg:col-span-4 grid grid-cols-2 gap-3 h-full">
              {QuickLinks.map((LinkItem) => (
                <TiltCard key={LinkItem.Route} onClick={() => Router.push(LinkItem.Route)} className="group h-full min-h-[140px]">
                  <div className="math-dashboard-quick-card flex flex-col items-center justify-center text-center h-full w-full !rounded-3xl border border-black/5 dark:border-white/5 shadow-md hover:shadow-2xl transition-all duration-300">
                    <span className="math-dashboard-quick-icon mb-3 p-3 rounded-2xl shadow-inner transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_0_20px_var(--mp-role-shadow)]">
                      {LinkItem.Icon}
                    </span>
                    <span className="block w-full px-2 text-sm font-black tracking-tight text-slate-900 dark:text-white/90 drop-shadow-sm group-hover:text-[var(--mp-role-primary)] transition-colors">
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
