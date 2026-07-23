"use client";

import { api } from "@/lib/api";
import { formatMathPathDateTime } from "@/lib/date";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Lightbulb,
  MessageSquareText,
  Rocket,
  ShieldAlert,
  Sparkles,
  Target,
  Trophy,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type ViewerRole = "ADMIN" | "TEACHER" | "STUDENT";

export type AssessmentTeacherFeedback = {
  id?: string | null;
  attemptId?: string | null;
  text?: string | null;
  feedbackCategory?: string | null;
  feedbackVariant?: string | null;
  feedbackTone?: string | null;
  scoreBand?: string | null;
  createdByRole?: string | null;
  createdByName?: string | null;
  updatedByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type VariantConfig = {
  Kicker: string;
  Icon: React.ReactNode;
  CardClass: string;
  IconClass: string;
  BadgeClass: string;
};

function ConfigForVariant(Value?: string | null): VariantConfig {
  const Variant = String(Value || "TEACHER_GUIDANCE").toUpperCase();
  if (Variant === "EXCELLENCE") {
    return {
      Kicker: "Excellence Feedback",
      Icon: <Trophy size={22} />,
      CardClass: "border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-amber-50 text-emerald-950 ring-emerald-100 dark:border-emerald-400/20 dark:from-emerald-400/10 dark:via-slate-950 dark:to-amber-400/10 dark:text-emerald-50 dark:ring-emerald-400/10",
      IconClass: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-400/15 dark:text-emerald-200 dark:ring-emerald-400/20",
      BadgeClass: "border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/15 dark:text-emerald-100",
    };
  }
  if (Variant === "MASTERY_GROWTH" || Variant === "CONSISTENT_GROWTH" || Variant === "POSITIVE_PROGRESS") {
    return {
      Kicker: "Mastery Growth Feedback",
      Icon: <Rocket size={22} />,
      CardClass: "border-cyan-200 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 text-cyan-950 ring-cyan-100 dark:border-cyan-400/20 dark:from-cyan-400/10 dark:via-slate-950 dark:to-emerald-400/10 dark:text-cyan-50 dark:ring-cyan-400/10",
      IconClass: "bg-cyan-100 text-cyan-700 ring-cyan-200 dark:bg-cyan-400/15 dark:text-cyan-200 dark:ring-cyan-400/20",
      BadgeClass: "border-cyan-200 bg-cyan-100 text-cyan-800 dark:border-cyan-400/20 dark:bg-cyan-400/15 dark:text-cyan-100",
    };
  }
  if (Variant === "ENCOURAGING_PRACTICE") {
    return {
      Kicker: "Encouraging Practice Feedback",
      Icon: <Sparkles size={22} />,
      CardClass: "border-violet-200 bg-gradient-to-br from-violet-50 via-white to-blue-50 text-violet-950 ring-violet-100 dark:border-violet-400/20 dark:from-violet-400/10 dark:via-slate-950 dark:to-blue-400/10 dark:text-violet-50 dark:ring-violet-400/10",
      IconClass: "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-400/15 dark:text-violet-200 dark:ring-violet-400/20",
      BadgeClass: "border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-400/20 dark:bg-violet-400/15 dark:text-violet-100",
    };
  }
  if (Variant === "CONCEPT_REINFORCEMENT") {
    return {
      Kicker: "Concept Reinforcement Feedback",
      Icon: <Target size={22} />,
      CardClass: "border-amber-200 bg-gradient-to-br from-amber-50 via-white to-orange-50 text-amber-950 ring-amber-100 dark:border-amber-400/20 dark:from-amber-400/10 dark:via-slate-950 dark:to-orange-400/10 dark:text-amber-50 dark:ring-amber-400/10",
      IconClass: "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-400/15 dark:text-amber-200 dark:ring-amber-400/20",
      BadgeClass: "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/15 dark:text-amber-100",
    };
  }
  if (Variant === "REVISION_REQUIRED" || Variant === "FOCUSED_SUPPORT") {
    return {
      Kicker: "Focused Revision Feedback",
      Icon: Variant === "FOCUSED_SUPPORT" ? <BookOpen size={22} /> : <ShieldAlert size={22} />,
      CardClass: "border-orange-200 bg-gradient-to-br from-orange-50 via-white to-rose-50 text-orange-950 ring-orange-100 dark:border-orange-400/20 dark:from-orange-400/10 dark:via-slate-950 dark:to-rose-400/10 dark:text-orange-50 dark:ring-orange-400/10",
      IconClass: "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-400/15 dark:text-orange-200 dark:ring-orange-400/20",
      BadgeClass: "border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-400/20 dark:bg-orange-400/15 dark:text-orange-100",
    };
  }
  return {
    Kicker: "Teacher Guidance",
    Icon: <MessageSquareText size={22} />,
    CardClass: "border-fuchsia-200 bg-gradient-to-br from-fuchsia-50 via-white to-slate-50 text-fuchsia-950 ring-fuchsia-100 dark:border-fuchsia-400/20 dark:from-fuchsia-400/10 dark:via-slate-950 dark:to-white/5 dark:text-fuchsia-50 dark:ring-fuchsia-400/10",
    IconClass: "bg-fuchsia-100 text-fuchsia-700 ring-fuchsia-200 dark:bg-fuchsia-400/15 dark:text-fuchsia-200 dark:ring-fuchsia-400/20",
    BadgeClass: "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800 dark:border-fuchsia-400/20 dark:bg-fuchsia-400/15 dark:text-fuchsia-100",
  };
}

function LocalPreviewVariant(Text: string, Accuracy: number) {
  const Value = Text.toLowerCase();
  const HasPractice = /(practice|revise|revision|focus|mistake|concept|improve|again|careful)/.test(Value);
  const HasPositive = /(excellent|brilliant|great|good|well done|proud|perfect|strong|improved)/.test(Value);
  if (Accuracy >= 90) return HasPractice ? "MASTERY_GROWTH" : "EXCELLENCE";
  if (Accuracy >= 70) return HasPractice ? "CONSISTENT_GROWTH" : "POSITIVE_PROGRESS";
  if (Accuracy >= 40) return HasPositive ? "ENCOURAGING_PRACTICE" : "CONCEPT_REINFORCEMENT";
  return HasPositive ? "FOCUSED_SUPPORT" : "REVISION_REQUIRED";
}


function CleanFeedbackLabel(Value?: string | null, HasText = false) {
  const Raw = String(Value || "").trim();
  const Normalized = Raw.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  const Labels: Record<string, string> = {
    EXCELLENCE: "Excellence",
    MASTERY_GROWTH: "Mastery Growth",
    CONSISTENT_PERFORMANCE: "Consistent Performance",
    CONSISTENT_GROWTH: "Consistent Performance",
    GREAT_PROGRESS: "Great Progress",
    POSITIVE_PROGRESS: "Great Progress",
    ENCOURAGING_PRACTICE: "Encouraging Practice",
    CONCEPT_REINFORCEMENT: "Concept Reinforcement",
    FOCUSED_SUPPORT: "Focused Support",
    REVISION_REQUIRED: "Revision Guidance",
    TEACHER_GUIDANCE: "Teacher Guidance",
  };
  if (Labels[Normalized]) return Labels[Normalized];
  if (!HasText) return "Optional Feedback";
  return "Teacher Feedback";
}

async function SaveFeedback(Role: ViewerRole, AttemptId: string, RemarkText: string) {
  const Prefix = Role === "ADMIN" ? "/admin" : "/teacher";
  // Explicit X-Auth-Role override: this component is used from both the
  // admin and teacher shells, so the caller's intended role has to be
  // stated explicitly rather than inferred from the URL path (which the
  // shared axios interceptor would otherwise use as its default hint).
  const Response = await api.post(
    `${Prefix}/assessment-attempts/${AttemptId}/remarks`,
    { remarkText: RemarkText },
    { headers: { "X-Auth-Role": Role } },
  );
  return Response.data?.teacherFeedback as AssessmentTeacherFeedback | null;
}

async function DeleteFeedback(AttemptId: string) {
  const Response = await api.delete(`/admin/assessment-attempts/${AttemptId}/remarks`, {
    headers: { "X-Auth-Role": "ADMIN" },
  });
  return Response.data;
}

export function AssessmentFeedbackRemarkCard({
  AttemptId,
  ViewerRole,
  Feedback,
  AccuracyPercentage,
  QueryKey,
}: {
  AttemptId: string;
  ViewerRole: ViewerRole;
  Feedback?: AssessmentTeacherFeedback | null;
  AccuracyPercentage?: number | null;
  QueryKey?: unknown[];
}) {
  const QueryClient = useQueryClient();
  const CanEdit = ViewerRole === "TEACHER" || ViewerRole === "ADMIN";
  const CanDelete = ViewerRole === "ADMIN" && Boolean(Feedback?.id);
  const [RemarkText, SetRemarkText] = useState(Feedback?.text || "");
  const Accuracy = Math.min(Math.max(Number(AccuracyPercentage || 0), 0), 100);
  const EffectiveVariant = Feedback?.feedbackVariant || (RemarkText.trim() ? LocalPreviewVariant(RemarkText, Accuracy) : "TEACHER_GUIDANCE");
  const Config = ConfigForVariant(EffectiveVariant);

  useEffect(() => {
    SetRemarkText(Feedback?.text || "");
  }, [Feedback?.id, Feedback?.text]);

  const SaveMutation = useMutation({
    mutationFn: () => SaveFeedback(ViewerRole, AttemptId, RemarkText),
    onSuccess: async () => {
      if (QueryKey) await QueryClient.invalidateQueries({ queryKey: QueryKey });
    },
  });

  const DeleteMutation = useMutation({
    mutationFn: () => DeleteFeedback(AttemptId),
    onSuccess: async () => {
      SetRemarkText("");
      if (QueryKey) await QueryClient.invalidateQueries({ queryKey: QueryKey });
    },
  });

  if (!CanEdit && !Feedback?.text) return null;

  const HasVisibleFeedback = Boolean(Feedback?.text || RemarkText.trim());
  const Category = CleanFeedbackLabel(Feedback?.feedbackCategory || EffectiveVariant, HasVisibleFeedback);

  return (
    <section className={`rounded-[30px] border p-5 shadow-lg ring-1 transition ${Config.CardClass}`} id="assessment-feedback">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${Config.IconClass}`}>{Config.Icon}</div>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] opacity-70">{Config.Kicker}</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight">Assessment Remarks</h2>
            <p className="mt-1 text-sm font-semibold opacity-75">
              {CanEdit ? "Share clear, supportive feedback for this assessment attempt." : "Your teacher has shared feedback for this assessment attempt."}
            </p>
          </div>
        </div>
        {HasVisibleFeedback ? (
          <span className={`inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black uppercase tracking-[0.12em] ${Config.BadgeClass}`}>
            <Lightbulb size={14} /> {Category}
          </span>
        ) : null}
      </div>

      {CanEdit ? (
        <div className="mt-5 space-y-3">
          <textarea
            value={RemarkText}
            onChange={(Event) => SetRemarkText(Event.target.value)}
            maxLength={1500}
            rows={5}
            placeholder="Write feedback that helps the student understand this assessment performance."
            className="w-full rounded-[24px] border border-current/10 bg-white/80 p-4 text-sm font-semibold leading-6 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:ring-4 focus:ring-current/10 dark:bg-slate-950/70 dark:text-white"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-bold opacity-70">{RemarkText.length}/1500</p>
            <div className="flex flex-wrap gap-2">
              {CanDelete ? (
                <button
                  className="inline-flex items-center gap-2 rounded-2xl border border-rose-200 bg-white px-4 py-2 text-sm font-black text-rose-700 shadow-sm transition hover:bg-rose-600 hover:text-white disabled:opacity-60 dark:border-rose-400/20 dark:bg-white/10 dark:text-rose-200"
                  disabled={DeleteMutation.isPending}
                  onClick={() => DeleteMutation.mutate()}
                >
                  <Trash2 size={15} /> Delete
                </button>
              ) : null}
              <button
                className="math-role-action-button px-4 py-2 disabled:opacity-60"
                disabled={SaveMutation.isPending || RemarkText.trim().length < 3}
                onClick={() => SaveMutation.mutate()}
              >
                <MessageSquareText size={15} /> {Feedback?.id ? "Update Remarks" : "Save Remarks"}
              </button>
            </div>
          </div>
          {SaveMutation.error || DeleteMutation.error ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-700">Unable to save assessment remarks right now.</p>
          ) : null}
        </div>
      ) : (
        <div className="mt-5 rounded-[24px] border border-current/10 bg-white/70 p-4 text-base font-semibold leading-7 shadow-sm dark:bg-white/10">
          {Feedback?.text}
        </div>
      )}

      {Feedback?.updatedAt || Feedback?.createdByName ? (
        <p className="mt-4 text-xs font-bold opacity-65">
          {Feedback.createdByName ? `Added by ${Feedback.createdByName}` : "Feedback added"}{Feedback.updatedAt ? ` · ${formatMathPathDateTime(Feedback.updatedAt)}` : ""}
        </p>
      ) : null}
    </section>
  );
}
