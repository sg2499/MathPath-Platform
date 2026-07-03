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
import React from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate, AnimatePresence } from "framer-motion";
import { Canvas } from "@react-three/fiber";
import { Float, Sparkles as DreiSparkles, TorusKnot, Icosahedron } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
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
      ColorHex: "#10b981" // Emerald
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
      ColorHex: "#8b5cf6" // Violet
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
      ColorHex: "#f59e0b" // Amber
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
    ColorHex: "#3b82f6" // Blue
  };
}

const QuickLinks = [
  { Icon: <BookOpenCheck size={20} />, Label: "Practice", Route: "/student/practice", Color: "from-blue-500/20 to-blue-900/20", BorderColor: "border-blue-500/30", GlowColor: "rgba(59,130,246,0.5)" },
  { Icon: <GraduationCap size={20} />, Label: "Assessments", Route: "/student/assessments", Color: "from-purple-500/20 to-purple-900/20", BorderColor: "border-purple-500/30", GlowColor: "rgba(168,85,247,0.5)" },
  { Icon: <ShieldCheck size={20} />, Label: "Assessment Readiness", Route: "/student/assessment-readiness", Color: "from-emerald-500/20 to-emerald-900/20", BorderColor: "border-emerald-500/30", GlowColor: "rgba(16,185,129,0.5)" },
  { Icon: <BarChart3 size={20} />, Label: "Progress", Route: "/student/results", Color: "from-amber-500/20 to-amber-900/20", BorderColor: "border-amber-500/30", GlowColor: "rgba(245,158,11,0.5)" },
  { Icon: <Trophy size={20} />, Label: "Mock Leaderboard", Route: "/student/competition/leaderboard", Color: "from-rose-500/20 to-rose-900/20", BorderColor: "border-rose-500/30", GlowColor: "rgba(244,63,94,0.5)" },
  { Icon: <Award size={20} />, Label: "Trophy Room", Route: "/student/achievements", Color: "from-yellow-500/20 to-yellow-900/20", BorderColor: "border-yellow-500/30", GlowColor: "rgba(234,179,8,0.5)" },
];

// --- 3D ENVIRONMENT FOR DASHBOARD ---
function HeroEnvironment() {
  return (
    <>
      <ambientLight intensity={0.5} />
      <pointLight position={[10, 10, 10]} intensity={50} color="#3b82f6" distance={50} />
      <pointLight position={[-10, -10, -10]} intensity={30} color="#8b5cf6" distance={50} />
      
      <Float speed={2} rotationIntensity={1} floatIntensity={1}>
        <Icosahedron args={[3, 0]} position={[6, 0, -5]}>
          <meshStandardMaterial color="#3b82f6" emissive="#3b82f6" emissiveIntensity={1} wireframe />
        </Icosahedron>
        <TorusKnot args={[2, 0.1, 100, 16]} position={[-8, 2, -10]} rotation={[Math.PI/4, 0, 0]}>
          <meshStandardMaterial color="#8b5cf6" emissive="#8b5cf6" emissiveIntensity={2} wireframe />
        </TorusKnot>
      </Float>

      <DreiSparkles count={200} scale={30} size={3} speed={0.5} color="#c084fc" />

      <EffectComposer multisampling={4}>
         <Bloom luminanceThreshold={0.2} mipmapBlur intensity={1.5} />
      </EffectComposer>
    </>
  );
}


// --- 3D GAMIFIED TILT CARD WRAPPER ---
function TiltCard({ children, className, onClick, glowColor }: { children: ReactNode, className?: string, onClick?: () => void, glowColor?: string }) {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 150, mass: 1 };
  const mouseXSpring = useSpring(x, springConfig);
  const mouseYSpring = useSpring(y, springConfig);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [10, -10]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-10, 10]);

  const glareX = useTransform(mouseXSpring, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(mouseYSpring, [-0.5, 0.5], [0, 100]);
  const glareBackground = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.2) 0%, transparent 50%)`;
  const hoverGlow = useMotionTemplate`drop-shadow(0 0 20px ${glowColor || 'rgba(59,130,246,0.3)'})`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
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
      style={{ rotateX, rotateY, transformStyle: "preserve-3d", filter: x.get() !== 0 ? hoverGlow : "none" }}
      className={`relative cursor-pointer transition-all duration-200 transform-gpu ${className}`}
    >
      <motion.div 
        className="absolute inset-0 z-10 pointer-events-none rounded-[inherit] mix-blend-overlay"
        style={{ background: glareBackground }}
      />
      <div style={{ transform: "translateZ(30px)", transformStyle: "preserve-3d" }} className="h-full w-full">
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
      {/* Global AAA Animated Background */}
      <div className="fixed inset-0 z-[-1] bg-slate-950 overflow-hidden">
         <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-900/30 blur-[120px] animate-pulse" />
         <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-purple-900/20 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
         <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay" />
      </div>

      <main className="relative w-full max-w-7xl mx-auto space-y-8 p-4 md:p-8 text-slate-200">
        
        {/* HUD HERO SECTION */}
        <section className="relative overflow-hidden rounded-3xl border border-slate-700/50 bg-slate-900/40 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          
          {/* R3F Canvas strictly scoped to Hero Background */}
          <div className="absolute inset-0 z-0 pointer-events-none opacity-60">
             <Canvas camera={{ position: [0, 0, 15], fov: 45 }} gl={{ antialias: false }}>
                <HeroEnvironment />
             </Canvas>
          </div>

          <div className="relative z-10 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between p-8 md:p-12">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-blue-400 mb-4">
                <Laptop size={16} />
                Student Workspace
              </div>
              
              {/* Kinetic Typography Title */}
              <h1 className="mt-2 flex flex-wrap items-center gap-4 text-4xl sm:text-5xl lg:text-6xl font-black tracking-tighter text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
                My Learning Dashboard <span className="inline-block origin-[70%_70%] animate-[wave_2.5s_ease-in-out_infinite]">👋</span>
              </h1>
              
              <p className="mt-4 text-lg text-slate-300 max-w-2xl font-medium leading-relaxed">
                Practice, assessments, and progress in one bright learning space.
              </p>
              
              <div className="mt-8 flex flex-wrap gap-4">
                <button
                  type="button"
                  onClick={() => Router.push(ActiveAssignments.length > 0 ? "/student/practice" : ProgressionMessage.ActionRoute)}
                  className="flex items-center gap-2 px-8 py-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-wider shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(59,130,246,0.6)] transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  <Sparkles size={18} />
                  {ActiveAssignments.length > 0 ? "Continue Practice" : ProgressionMessage.ActionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => Router.push("/student/results")}
                  className="flex items-center gap-2 px-8 py-4 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-white font-black uppercase tracking-wider border border-slate-600/50 backdrop-blur-md transition-all duration-300 hover:scale-105 active:scale-95"
                >
                  <BarChart3 size={18} />
                  Open Progress
                </button>
              </div>
            </div>
            
            <div className="relative p-6 rounded-2xl bg-slate-900/60 border border-slate-700/50 backdrop-blur-md shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] lg:min-w-[300px]">
              <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-blue-500 animate-ping opacity-75" />
              <div className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-blue-500 border-2 border-slate-900" />
              
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Learning Pulse</p>
              <h2 className="text-2xl font-black text-white mb-2 tracking-tight">Next Step</h2>
              <p className="text-sm text-slate-300 font-medium leading-relaxed">
                {ActiveAssignments.length > 0
                  ? "Continue your assigned DPS from Practice."
                  : "Review progress or readiness for your next step."}
              </p>
            </div>
          </div>
        </section>

        {AssignmentQuery.isLoading || AssessmentQuery.isLoading ? <LoadingState label="Initializing HUD Data..." /> : null}
        {AssignmentQuery.error ? <ErrorState message={apiErrorMessage(AssignmentQuery.error)} /> : null}
        {AssessmentQuery.error ? <ErrorState message={apiErrorMessage(AssessmentQuery.error)} /> : null}

        {!AssignmentQuery.isLoading && !AssessmentQuery.isLoading && !AssignmentQuery.error && !AssessmentQuery.error ? (
          <div className="space-y-8">
            <TiltCard glowColor={ProgressionMessage.ColorHex} onClick={() => Router.push(ProgressionMessage.ActionRoute)} className="w-full">
               <ProgressionJourneyCard State={ProgressionMessage} />
            </TiltCard>

            <section className="grid lg:grid-cols-[1fr_300px] gap-8 items-stretch">
               
               {/* Priority Panel */}
               <TiltCard glowColor="rgba(59,130,246,0.5)" className="h-full">
                 <div className="h-full flex flex-col justify-between p-8 rounded-3xl bg-slate-900/50 backdrop-blur-xl border border-slate-700/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
                   <div>
                     <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-400 mb-4">
                       <Zap size={16} />
                       Learning Priority
                     </div>
                     <h2 className="text-3xl font-black tracking-tight text-white mb-3">
                       {ActiveAssignments.length > 0 ? "Continue Assigned Practice" : "Review Learning Progress"}
                     </h2>
                     <p className="text-slate-300 font-medium leading-relaxed max-w-lg">
                       {ActiveAssignments.length > 0
                         ? "Complete assigned DPS, then check readiness for your next step."
                         : "Review attempts, scores, progress, and readiness."}
                     </p>
                   </div>
                   
                   <div className="mt-8 flex flex-wrap gap-4">
                     <button
                       type="button"
                       onClick={(e) => { e.stopPropagation(); Router.push(ActiveAssignments.length > 0 ? "/student/practice" : "/student/results"); }}
                       className="flex items-center gap-2 px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-wider shadow-[0_0_15px_rgba(245,158,11,0.4)] hover:shadow-[0_0_25px_rgba(245,158,11,0.6)] transition-all duration-300"
                     >
                       <Sparkles size={16} />
                       {ActiveAssignments.length > 0 ? "Practice Review" : "Progress Review"}
                     </button>
                     <button
                       type="button"
                       onClick={(e) => { e.stopPropagation(); Router.push("/student/assessment-readiness"); }}
                       className="flex items-center gap-2 px-6 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-black uppercase tracking-wider border border-slate-600 transition-all duration-300"
                     >
                       <ShieldCheck size={16} />
                       Assessment Readiness
                     </button>
                   </div>
                 </div>
               </TiltCard>

               {/* Quick Access Grid */}
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 {QuickLinks.map((LinkItem) => (
                   <TiltCard key={LinkItem.Route} glowColor={LinkItem.GlowColor} onClick={() => Router.push(LinkItem.Route)}>
                     <QuickAccessCard
                       Icon={LinkItem.Icon}
                       Label={LinkItem.Label}
                       ColorClass={LinkItem.Color}
                       BorderClass={LinkItem.BorderColor}
                     />
                   </TiltCard>
                 ))}
               </div>
            </section>
          </div>
        ) : null}
      </main>
    </AppShell>
  );
}

function ProgressionJourneyCard({ State }: { State: ReturnType<typeof BuildStudentProgressionMessage> }) {
  const ToneColor = 
    State.Tone === "success" ? "text-emerald-400 border-emerald-500/50 bg-emerald-950/50 shadow-[0_0_20px_rgba(16,185,129,0.3)]" :
    State.Tone === "ready" ? "text-violet-400 border-violet-500/50 bg-violet-950/50 shadow-[0_0_20px_rgba(139,92,246,0.3)]" :
    State.Tone === "focus" ? "text-amber-400 border-amber-500/50 bg-amber-950/50 shadow-[0_0_20px_rgba(245,158,11,0.3)]" :
    "text-blue-400 border-blue-500/50 bg-blue-950/50 shadow-[0_0_20px_rgba(59,130,246,0.3)]";

  const IconBg = 
    State.Tone === "success" ? "bg-emerald-500/20 text-emerald-300" :
    State.Tone === "ready" ? "bg-violet-500/20 text-violet-300" :
    State.Tone === "focus" ? "bg-amber-500/20 text-amber-300" :
    "bg-blue-500/20 text-blue-300";

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-8 rounded-3xl bg-slate-900/60 backdrop-blur-xl border border-slate-700/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]">
      <div className="flex items-start md:items-center gap-6">
        <div className={`shrink-0 flex items-center justify-center w-16 h-16 rounded-2xl border ${ToneColor}`}>
          <Trophy size={28} />
        </div>
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-slate-400">
              <Milestone size={14} /> Next Level Journey
            </div>
            <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border ${ToneColor}`}>
              {State.Label}
            </span>
          </div>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight text-white mb-2">{State.Title}</h2>
          <p className="text-slate-300 font-medium leading-relaxed max-w-3xl">{State.Message}</p>
        </div>
      </div>
      <div className="shrink-0">
         <span className="flex items-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-black uppercase tracking-wider backdrop-blur-md border border-white/10 transition-colors">
            <Sparkles size={16} />
            {State.ActionLabel}
         </span>
      </div>
    </div>
  );
}

function QuickAccessCard({ Icon, Label, ColorClass, BorderClass }: { Icon: ReactNode; Label: string; ColorClass: string; BorderClass: string }) {
  return (
    <div className={`h-full flex flex-col items-center justify-center p-6 text-center rounded-2xl bg-gradient-to-br ${ColorClass} backdrop-blur-md border ${BorderClass} shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] group-hover:border-white/50 transition-all`}>
      <div className="mb-3 text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all duration-300">
         {Icon}
      </div>
      <span className="text-sm font-black uppercase tracking-wider text-white drop-shadow-md">
         {Label}
      </span>
    </div>
  );
}
