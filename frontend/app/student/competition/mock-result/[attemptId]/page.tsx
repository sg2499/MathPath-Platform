"use client";

import { ResultReviewTabs, ToMockReviewQuestions } from "@/components/common/ResultReviewTabs";
import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getCompetitionMockResult } from "@/lib/api/student";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Flame,
  Rocket,
  Sparkles,
  Target,
  Trophy,
  XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState, useEffect, useRef } from "react";
import { RewardEarnedModal, type RewardBreakdown } from "@/components/gamification/RewardEarnedModal";
import { getBadgeVisualConfig } from "@/lib/gamification/badgeVisuals";
import { AnimatePresence } from "framer-motion";
import { CompetitionMessage, competitionMessagePools } from "@/lib/utils/competitionMessages";
import dynamic from "next/dynamic";

// 2026-10-11 (performance): the 3D / celebration scenes load only when shown.
const EpicCelebration = dynamic(() => import("@/components/gamification/EpicCelebration").then((Module) => Module.EpicCelebration), { ssr: false });
const BadgeInspectionModal = dynamic(() => import("@/components/gamification/BadgeInspectionModal").then((Module) => Module.BadgeInspectionModal), { ssr: false });
const RankCinematicOverlay = dynamic(() => import("@/components/gamification/RankCinematicOverlay").then((Module) => Module.RankCinematicOverlay), { ssr: false });

// Rarity order used purely to sequence the post-submission badge reveal --
// legendary badges are always shown last so the moment escalates rather than
// peaking early (2026-07-25, Round 1 gamification fix).
const BADGE_REVEAL_TIER_ORDER: Record<string, number> = {
  BASE: 0,
  SUPER: 1,
  LEGENDARY: 2,
};

function formatDuration(seconds?: number | null) {
  if (seconds === null || seconds === undefined) return "-";
  const total = Math.max(0, Number(seconds || 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins && secs) {
    return `${mins} Min${mins !== 1 ? "s" : ""} ${secs} Sec${secs !== 1 ? "s" : ""}`;
  }
  if (mins) {
    return `${mins} Min${mins !== 1 ? "s" : ""}`;
  }
  return `${secs} Sec${secs !== 1 ? "s" : ""}`;
}

function formatNumber(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value)))
    return "-";
  const numeric = Number(value);
  return String(Math.round(numeric));
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function pickFrom<T>(pool: T[], seed: number, offset = 0): T {
  return pool[(seed + offset) % pool.length];
}

function competitionBandKey(percentage: number) {
  if (percentage >= 100) return "perfect";
  if (percentage >= 90) return "champion";
  if (percentage >= 75) return "strong";
  if (percentage >= 60) return "momentum";
  if (percentage >= 40) return "practice";
  return "restart";
}

function buildCompetitionMessage(
  result: Awaited<ReturnType<typeof getCompetitionMockResult>>,
): CompetitionMessage {
  const percentage = Number(
    result.percentage ?? result.accuracyPercentage ?? 0,
  );
  const bandKey = competitionBandKey(percentage);
  const pool = competitionMessagePools[bandKey];
  const weaknesses = (result.conceptWeaknesses || [])
    .map((item) => item.concept)
    .filter(Boolean);
  const strengths = (result.conceptStrengths || [])
    .map((item) => item.concept)
    .filter(Boolean);
  const focusAreas =
    percentage >= 100
      ? ["Maintain your perfect form and consistency"]
      : weaknesses.length > 0
        ? weaknesses.slice(0, 3)
        : strengths.slice(0, 2);
  const seed = stableHash(
    [
      result.attemptId,
      result.mockExam?.mockCode,
      result.score,
      result.maxScore,
      result.percentage,
      result.correct,
      result.unanswered,
      result.timeTakenSeconds,
      focusAreas.join("|"),
    ].join("-"),
  );
  const nextBandTarget =
    percentage >= 100
      ? "Maintain 100% accuracy and keep setting the standard."
      : percentage >= 95
        ? "Aim for a flawless 100% next time."
      : percentage >= 90
        ? "Aim for 95%+ with zero careless errors."
      : percentage >= 75
        ? "Push into the 90% Champion Zone."
        : percentage >= 60
          ? "Target 75%+ by converting weak sections."
          : percentage >= 40
            ? "Push toward 60%+ with cleaner basics."
            : "Target your first strong jump with section-wise practice.";
  const unansweredNote =
    Number(result.unanswered || 0) > 0
      ? ` Also reduce unanswered questions; every attempted question is a chance to gain marks.`
      : "";
  const timeNote =
    Number(result.timeUtilizationPercentage || 0) > 85
      ? " Keep watching time pressure so accuracy does not drop near the end."
      : Number(result.timeUtilizationPercentage || 0) < 25
        ? " You finished quickly, so use review time to catch avoidable mistakes."
        : " Your time usage gives you room to balance speed with accuracy.";

  return {
    title: `${pickFrom(pool.titles, seed)} ${bandKey === "perfect" ? "🌟" : bandKey === "champion" ? "🏆" : bandKey === "strong" ? "🚀" : bandKey === "momentum" ? "🔥" : bandKey === "practice" ? "✨" : "🌱"}`,
    badge: pool.badge,
    message: `${pickFrom(pool.messages, seed, 3)}${unansweredNote}`,
    coachNote: `${pickFrom(pool.notes, seed, 7)}${timeNote}`,
    focusAreas:
      focusAreas.length > 0
        ? focusAreas
        : ["Review the question paper section by section"],
    nextTarget: nextBandTarget,
    icon: pool.icon as any,
  };
}

export default function StudentCompetitionMockResultPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const attemptId = params.attemptId;
  // Focus-area buttons open a section in the review (ResultReviewTabs).
  const [focusRequest, setFocusRequest] = useState<{ Title: string; Nonce: number } | null>(null);
  const [showCelebration, setShowCelebration] = useState(false);
  const [allowSkip, setAllowSkip] = useState(false);
  const hasExploded = useRef(false);

  // Badge-unlock reveal handoff: the mock-attempt page stashes any badges
  // unlocked by this specific submission into sessionStorage right before
  // navigating here (one-time, per-attempt). Consumed once, then cleared --
  // reloading this result page later should not replay the reveal.
  const [unlockedBadges, setUnlockedBadges] = useState<any[]>([]);
  const [badgesLoaded, setBadgesLoaded] = useState(false);
  const [badgeRevealIndex, setBadgeRevealIndex] = useState<number | null>(null);
  const badgesConsumed = useRef(false);

  // Rank-up cinematic finale: same one-time sessionStorage handoff as the
  // badge reveal above. RankCinematicOverlay previously only ever fired from
  // a student manually clicking a tier inside the rank roadmap modal -- this
  // is what makes a real, XP-driven rank-up play automatically, as the last
  // beat after any celebration and badge reveals (2026-07-25 Round 1 fix).
  const [rankUpTier, setRankUpTier] = useState<string | null>(null);
  const [showRankUp, setShowRankUp] = useState(false);

  // Reward-earned modal: XP/coins breakdown, shown right after the
  // completion celebration and before any badge reveals (2026-08-26 reward
  // formula + celebration sequencing rollout). Same one-time sessionStorage
  // handoff pattern as the badge/rank-up state above.
  const [rewardBreakdown, setRewardBreakdown] = useState<RewardBreakdown | null>(null);
  const [showRewardModal, setShowRewardModal] = useState(false);

  const query = useQuery({
    queryKey: ["student-competition-mock-result", attemptId],
    queryFn: () => getCompetitionMockResult(attemptId),
    enabled: ready && Boolean(attemptId),
  });

  useEffect(() => {
    if (!attemptId || badgesConsumed.current) return;
    badgesConsumed.current = true;
    try {
      const key = `mp_unlocked_badges_${attemptId}`;
      const raw = sessionStorage.getItem(key);
      if (raw) {
        sessionStorage.removeItem(key);
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const sorted = [...parsed].sort(
            (a, b) => (BADGE_REVEAL_TIER_ORDER[a?.tier] ?? 0) - (BADGE_REVEAL_TIER_ORDER[b?.tier] ?? 0),
          );
          setUnlockedBadges(sorted);
        }
      }
      const rankKey = `mp_rank_up_${attemptId}`;
      const rankRaw = sessionStorage.getItem(rankKey);
      if (rankRaw) {
        sessionStorage.removeItem(rankKey);
        setRankUpTier(rankRaw);
      }
      const rewardKey = `mp_reward_breakdown_${attemptId}`;
      const rewardRaw = sessionStorage.getItem(rewardKey);
      if (rewardRaw) {
        sessionStorage.removeItem(rewardKey);
        setRewardBreakdown(JSON.parse(rewardRaw));
      }
    } catch (e) {
      console.error("Failed to read unlocked badge handoff from sessionStorage", e);
    } finally {
      setBadgesLoaded(true);
    }
  }, [attemptId]);

  // Sequencing: EpicCelebration (if accuracy >= 80) plays first; the badge
  // reveal starts either right after it completes, or immediately if there
  // was no celebration to play. Waits on both the result query and the
  // badge handoff read so the two async sources never race each other.
  useEffect(() => {
    if (query.data && badgesLoaded && !hasExploded.current) {
      hasExploded.current = true;
      const accuracy = query.data.accuracyPercentage || 0;
      if (accuracy >= 80) {
        try {
          const viewed = JSON.parse(localStorage.getItem("viewed_celebrations") || "[]");
          if (viewed.includes(attemptId)) {
            setAllowSkip(true);
          }
        } catch (e) {
          console.error("Failed to parse viewed_celebrations from localStorage", e);
        }
        setShowCelebration(true);
      } else if (rewardBreakdown) {
        setShowRewardModal(true);
      } else if (unlockedBadges.length > 0) {
        setBadgeRevealIndex(0);
      } else if (rankUpTier) {
        setShowRankUp(true);
      }
    }
  }, [query.data, badgesLoaded, unlockedBadges, rankUpTier, attemptId, rewardBreakdown]);

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    try {
      const viewed = JSON.parse(localStorage.getItem("viewed_celebrations") || "[]");
      if (!viewed.includes(attemptId)) {
        localStorage.setItem("viewed_celebrations", JSON.stringify([...viewed, attemptId]));
      }
    } catch (e) {
      console.error("Failed to save viewed_celebrations to localStorage", e);
    }
    if (rewardBreakdown) {
      setShowRewardModal(true);
    } else if (unlockedBadges.length > 0) {
      setBadgeRevealIndex(0);
    } else if (rankUpTier) {
      setShowRankUp(true);
    }
  };

  const handleRewardModalContinue = () => {
    setShowRewardModal(false);
    if (unlockedBadges.length > 0) {
      setBadgeRevealIndex(0);
    } else if (rankUpTier) {
      setShowRankUp(true);
    }
  };

  const handleBadgeRevealClose = () => {
    setBadgeRevealIndex((prev) => {
      if (prev === null) return null;
      const next = prev + 1;
      if (next < unlockedBadges.length) return next;
      // Badge sequence finished -- hand off to the rank-up cinematic finale.
      if (rankUpTier) setShowRankUp(true);
      return null;
    });
  };

  if (!ready) return null;

  if (query.isLoading) {
    return (
      <AppShell title="Competition Mock Result">
        <LoadingState label="Loading mock result..." />
      </AppShell>
    );
  }

  if (query.error) {
    return (
      <AppShell title="Competition Mock Result">
        <ErrorState message={apiErrorMessage(query.error)} />
      </AppShell>
    );
  }

  const result = query.data;
  if (!result) {
    return (
      <AppShell title="Competition Mock Result">
        <LoadingState label="Preparing result summary..." />
      </AppShell>
    );
  }

  const mock = result.mockExam || {};
  const questionReview = result.questionReview || [];
  const competitionMessage = buildCompetitionMessage(result);

  // Focus-area buttons pass a concept name (e.g. "BODMAS"), not a section
  // title -- several concepts share one section -- so map the concept back to
  // its section and ask the review to open that section.
  const conceptToSectionTitle = new Map<string, string>(
    (result.conceptPerformance || []).map((item): [string, string] => [item.concept, item.sectionTitle || item.concept]),
  );
  const jumpToSection = (nameOrConcept: string) => {
    const sectionTarget = conceptToSectionTitle.get(nameOrConcept) || nameOrConcept;
    setFocusRequest({ Title: sectionTarget, Nonce: Date.now() });
  };

  return (
    <>
      <AnimatePresence>
        {showCelebration && (
          <EpicCelebration
            accuracy={result.accuracyPercentage || 0}
            onComplete={handleCelebrationComplete}
            allowSkip={allowSkip}
          />
        )}
      </AnimatePresence>
      {!showCelebration && showRewardModal && rewardBreakdown && (
        <RewardEarnedModal breakdown={rewardBreakdown} onContinue={handleRewardModalContinue} />
      )}
      {!showCelebration && !showRewardModal && badgeRevealIndex !== null && unlockedBadges[badgeRevealIndex] && (
        <BadgeInspectionModal
          badge={unlockedBadges[badgeRevealIndex]}
          config={getBadgeVisualConfig(
            unlockedBadges[badgeRevealIndex].code,
            unlockedBadges[badgeRevealIndex].tier,
          )}
          onClose={handleBadgeRevealClose}
        />
      )}
      {!showCelebration && !showRewardModal && badgeRevealIndex === null && showRankUp && rankUpTier && (
        <RankCinematicOverlay tier={rankUpTier} onComplete={() => setShowRankUp(false)} />
      )}
      <AppShell title="Competition Mock Result">
      <section className="space-y-5">
        <div className="math-card p-6">
          <button
            className="math-button-secondary mb-4 px-4 py-2 text-sm"
            onClick={() => router.push(`/student/competition/mock-exams?moduleCode=${mock.moduleCode || ""}&levelCode=${mock.levelCode || ""}`)}
          >
            Back To Mock Exams
          </button>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="math-block-header mb-2"><Trophy size={14} /> Mock Result</div>
              <h1 className="math-title">{mock.title || "Mock Result"}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                {mock.mockCode ? <Chip label={mock.mockCode} /> : null}
                <Chip
                  label={`${mock.moduleCode || "Module"} · ${mock.levelCode || "Level"}`}
                />
              </div>
              <p className="math-subtitle">
                Submitted {formatDate(result.completedAt || result.submittedAt)}
                . Review your mock answers, correct solutions, and section
                performance below.
              </p>
            </div>
            {/* shrink-0 + whitespace-nowrap: beside a long title this box used to be
                squeezed until the score broke inside the number ("73/10" over "0"). */}
            <div className="shrink-0 rounded-[24px] border border-orange-200 bg-orange-50/70 px-6 py-4 text-center dark:border-orange-800 dark:bg-orange-950/30">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-200">
                Score
              </p>
              <p className="mt-1 whitespace-nowrap text-4xl font-black text-slate-950 dark:text-white">
                {formatNumber(result.score)}/{formatNumber(result.maxScore)}
              </p>
              <p className="mt-1 text-sm font-black text-slate-800 dark:text-slate-200">
                {formatNumber(result.percentage)}%
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-4">
          <MetricCard
            icon={<Target size={18} />}
            label="Accuracy"
            value={`${formatNumber(result.accuracyPercentage)}%`}
            helper="Attempted answers"
          />
          <MetricCard
            icon={<CheckCircle2 size={18} />}
            label="Correct"
            value={result.correct}
            helper={`${result.totalQuestions} total questions`}
          />
          <MetricCard
            icon={<XCircle size={18} />}
            label="Unanswered"
            value={result.unanswered}
            helper="Scored as zero"
          />
          <MetricCard
            icon={<Clock3 size={18} />}
            label="Time Taken"
            value={formatDuration(result.timeTakenSeconds)}
            helper={`${formatNumber(result.timeUtilizationPercentage)}% time used`}
          />
        </div>

        <CompetitionMessageBox
          message={competitionMessage}
          onSectionSelect={jumpToSection}
        />

        {/* 2026-10-11: Answer Sheet (section blocks) and Scorecard, the same
            two tabs on every result page. The old Result Analysis tab's
            section rows, strengths and weak areas live in the Scorecard. */}
        <ResultReviewTabs Questions={ToMockReviewQuestions(questionReview as any)} Viewer="STUDENT" FocusRequest={focusRequest} />
      </section>
      </AppShell>
    </>
  );
}

function CompetitionMessageBox({
  message,
  onSectionSelect,
}: {
  message: CompetitionMessage;
  onSectionSelect: (sectionName: string) => void;
}) {
  const Icon =
    message.icon === "trophy"
      ? Trophy
      : message.icon === "rocket"
        ? Rocket
        : message.icon === "flame"
          ? Flame
          : Sparkles;
  return (
    <article className="relative overflow-hidden rounded-[32px] border border-orange-200 bg-gradient-to-br from-white via-orange-50/70 to-amber-50/60 p-5 shadow-xl shadow-orange-100/60 dark:border-orange-800 dark:from-slate-950 dark:via-orange-950/20 dark:to-slate-900 dark:shadow-orange-950/20">
      <div className="absolute right-0 top-0 h-28 w-28 rounded-full bg-orange-300/20 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-600 to-amber-500 text-white shadow-lg shadow-orange-200 dark:shadow-orange-950/40">
            <Icon size={26} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="math-block-header mb-2"><Rocket size={14} /> Competition Coach</div>
              <span className="math-badge border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
                {message.badge}
              </span>
            </div>
            <h2 className="mt-2 text-2xl font-black text-slate-950 dark:text-white">
              {message.title}
            </h2>
            <p className="mt-4 max-w-5xl text-lg font-black leading-8 text-slate-950 dark:text-white">
              {message.message}
            </p>
            <p className="mt-3 max-w-5xl text-base font-black leading-7 text-slate-900 dark:text-slate-100">
              {message.coachNote}
            </p>
          </div>
        </div>

        <div className="grid min-w-0 gap-3 lg:w-[360px]">
          <div className="rounded-[24px] border border-orange-200 bg-white/90 p-4 dark:border-orange-800 dark:bg-slate-950/70">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-orange-700 dark:text-orange-200">
              Focus Next
            </p>
            <div className="mt-3 grid gap-2">
              {message.focusAreas.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => onSectionSelect(area)}
                  className="rounded-[16px] border border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] px-3 py-2.5 text-left text-sm font-black text-slate-900 transition hover:border-[var(--mp-role-primary)] hover:bg-[var(--mp-role-primary)] hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--mp-role-primary)] dark:text-white dark:hover:bg-[var(--mp-role-primary)]"
                >
                  {area}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 p-4 dark:border-amber-800 dark:bg-amber-950/20">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-amber-700 dark:text-amber-200">
              Next Target
            </p>
            <p className="mt-2 text-base font-black leading-6 text-slate-950 dark:text-white">
              {message.nextTarget}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="math-badge border-[var(--mp-role-border)] bg-[var(--mp-role-softer)] text-[var(--mp-role-readable)]">
      {label}
    </span>
  );
}

function MetricCard({
  icon,
  label,
  value,
  helper,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <div className="math-student-metric-card group relative overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-xl" style={{ boxShadow: 'hover: 0 20px 40px rgba(0,0,0,0.1)' }}>
      {/* Gamified hover shine */}
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-0 transition-all duration-700 group-hover:translate-x-full group-hover:opacity-100" />
      
      <div className="math-student-icon-chip relative z-10 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 group-hover:shadow-md">
        {icon}
      </div>
      <p className="relative z-10 mt-3 text-xs font-black uppercase tracking-[0.16em] text-slate-800 transition-colors duration-300 group-hover:text-[var(--math-role-primary)] dark:text-slate-100">
        {label}
      </p>
      <p className={`relative z-10 mt-1 origin-left text-3xl font-black text-slate-950 transition-transform duration-300 group-hover:scale-105 group-hover:text-[var(--math-role-primary)] dark:text-white ${String(value ?? "").length > 12 ? "se-metric-long" : ""}`}>
        {value}
      </p>
      <p className="relative z-10 mt-1 text-sm font-bold text-slate-700 transition-colors duration-300 group-hover:text-slate-900 dark:text-slate-300 dark:group-hover:text-slate-100">
        {helper}
      </p>
    </div>
  );
}
