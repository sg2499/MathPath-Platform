"use client";

import type { Assignment } from "@/types/assignment";
import {
  ArrowRight,
  Clock3,
  ClipboardList,
  FileCheck2,
  PlayCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";

function getAssignmentAction(assignment: Assignment) {
  const status = assignment.status;

  if (status === "NOT_STARTED" || status === "REATTEMPT_AVAILABLE") {
    return {
      label: status === "REATTEMPT_AVAILABLE" ? "Start Re-Attempt" : assignment.mode === "ASSESSMENT" ? "Start Assessment" : "Start Practice",
      href: `/student/dps/${assignment.dpsId}?assignmentId=${assignment.assignmentId}`,
      disabled: false,
      icon: PlayCircle,
    };
  }

  if (status === "IN_PROGRESS") {
    return {
      label: "Resume Practice",
      href: assignment.attemptId
        ? `/student/attempt/${assignment.attemptId}`
        : `/student/dps/${assignment.dpsId}?assignmentId=${assignment.assignmentId}`,
      disabled: false,
      icon: RotateCcw,
    };
  }

  if (status === "SUBMITTED" || status === "AUTO_SUBMITTED") {
    return {
      label: "View Result",
      href: assignment.attemptId ? `/student/result/${assignment.attemptId}` : "",
      disabled: !assignment.attemptId,
      icon: FileCheck2,
    };
  }

  return {
    label: "Open",
    href: `/student/dps/${assignment.dpsId}?assignmentId=${assignment.assignmentId}`,
    disabled: false,
    icon: ArrowRight,
  };
}

function getStatusStyle(status: string) {
  if (status === "NOT_STARTED") return "bg-blue-50 text-blue-700 border-blue-200";
  if (status === "IN_PROGRESS") return "bg-amber-50 text-amber-700 border-amber-200";
  if (status === "SUBMITTED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (status === "AUTO_SUBMITTED") return "bg-rose-50 text-rose-700 border-rose-200";
  if (status === "REATTEMPT_AVAILABLE") return "bg-violet-50 text-violet-700 border-violet-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

export function AssignmentCard({ assignment }: { assignment: Assignment }) {
  const router = useRouter();
  const action = getAssignmentAction(assignment);
  const ActionIcon = action.icon;

  function handleClick() {
    if (action.disabled || !action.href) return;
    router.push(action.href);
  }

  return (
    <div className="math-card math-card-hover overflow-hidden p-5 sm:p-6 bg-white/40 dark:bg-slate-900/40 border border-white/50 dark:border-white/10 backdrop-blur-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] hover:shadow-[0_20px_50px_rgba(0,0,0,0.1)] transition-all duration-500 relative group hover:-translate-y-1">
      <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700">
            <Sparkles size={12} />
            {assignment.mode === "ASSESSMENT" ? "ASSESSMENT" : assignment.mode}
          </div>

          <h3 className="mt-4 text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
            {assignment.title}
          </h3>

          <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200 sm:text-base">
            Lesson {assignment.lessonNumber} · DPS {assignment.dpsNumber}
          </p>

          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {assignment.dpsTitle}
          </p>
        </div>

        <span className={`math-badge w-fit ${getStatusStyle(assignment.status)}`}>
          {assignment.status.replace("_", " ")}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3 relative z-10">
        <div className="rounded-2xl bg-white/60 p-4 dark:bg-slate-900/70 border border-white/50 dark:border-white/5 shadow-sm">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <ClipboardList size={16} /> Questions
          </span>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {assignment.questionCount}
          </p>
        </div>

        <div className="rounded-2xl bg-white/60 p-4 dark:bg-slate-900/70 border border-white/50 dark:border-white/5 shadow-sm">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <Clock3 size={16} /> Duration
          </span>
          <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white">
            {Math.floor(assignment.durationSeconds / 60)} min
          </p>
        </div>

        <div className="rounded-2xl bg-white/60 p-4 dark:bg-slate-900/70 border border-white/50 dark:border-white/5 shadow-sm">
          <span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400">
            <Sparkles size={16} /> Level
          </span>
          <p className="mt-2 text-lg font-black text-slate-900 dark:text-white">
            {assignment.levelCode}
          </p>
        </div>
      </div>

      <button
        className={`mt-6 w-full ${
          action.disabled
            ? "math-button-secondary opacity-70"
            : action.label === "View Result"
              ? "math-role-action-button px-4 py-3 text-sm"
              : "math-button-primary"
        }`}
        onClick={handleClick}
        disabled={action.disabled}
        style={{ position: 'relative', zIndex: 10 }}
      >
        <ActionIcon size={18} />
        {action.label}
      </button>
    </div>
  );
}
