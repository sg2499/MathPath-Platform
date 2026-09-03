"use client";

import { AppShell } from "@/components/common/AppShell";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ResultSummary } from "@/components/student/ResultSummary";
import { MathQuestionDisplay } from "@/components/common/MathQuestionDisplay";
import { RewardEarnedModal, type RewardBreakdown } from "@/components/gamification/RewardEarnedModal";
import { EpicCelebration } from "@/components/gamification/EpicCelebration";
import { BadgeInspectionModal } from "@/components/gamification/BadgeInspectionModal";
import { RankCinematicOverlay } from "@/components/gamification/RankCinematicOverlay";
import { getBadgeVisualConfig } from "@/lib/gamification/badgeVisuals";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import { apiErrorMessage } from "@/lib/api";
import { getAttemptResult } from "@/lib/api/student";
import { formatAnswerValue } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, CheckCircle2, BookOpenCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Rarity order used purely to sequence the post-submission badge reveal --
// legendary badges are always shown last so the moment escalates rather than
// peaking early. Mirrors BADGE_REVEAL_TIER_ORDER in the mock-result page
// exactly (2026-09-03 DPS celebration parity fix).
const BADGE_REVEAL_TIER_ORDER: Record<string, number> = {
  BASE: 0,
  SUPER: 1,
  LEGENDARY: 2,
};

export default function ResultPage() {
  const ready = useProtectedPage(["STUDENT"]);
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const query = useQuery({
    queryKey: ["result", params.attemptId],
    queryFn: () => getAttemptResult(params.attemptId),
    enabled: ready,
  });

  // Full celebration sequence (2026-09-03 DPS celebration parity fix):
  // EpicCelebration (confetti, if accuracy >= 80) -> RewardEarnedModal
  // (XP/coins) -> BadgeInspectionModal (one per unlocked badge) ->
  // RankCinematicOverlay (rank-up, if this attempt actually changed the
  // student's tier). This is the exact same four-step sequence the Mock
  // result page runs, using the exact same one-time sessionStorage handoff
  // pattern (stashed by the DPS attempt page right before navigating here)
  // -- see mock-result/[attemptId]/page.tsx for the reference
  // implementation this mirrors. Before this, DPS only ever ran the reward
  // modal, shown immediately with no sequencing in front of it.
  const [showCelebration, setShowCelebration] = useState(false);
  const [allowSkip, setAllowSkip] = useState(false);
  const hasExploded = useRef(false);

  const [unlockedBadges, setUnlockedBadges] = useState<any[]>([]);
  const [badgesLoaded, setBadgesLoaded] = useState(false);
  const [badgeRevealIndex, setBadgeRevealIndex] = useState<number | null>(null);
  const badgesConsumed = useRef(false);

  const [rankUpTier, setRankUpTier] = useState<string | null>(null);
  const [showRankUp, setShowRankUp] = useState(false);

  const [rewardBreakdown, setRewardBreakdown] = useState<RewardBreakdown | null>(null);
  const [showRewardModal, setShowRewardModal] = useState(false);

  // One-time sessionStorage handoff read: badges, rank-up, and reward
  // breakdown all consumed-and-cleared here together, same as the mock
  // result page's single combined effect.
  useEffect(() => {
    const attemptId = params.attemptId;
    if (!attemptId || badgesConsumed.current) return;
    badgesConsumed.current = true;
    try {
      const badgeKey = `mp_unlocked_badges_${attemptId}`;
      const badgeRaw = sessionStorage.getItem(badgeKey);
      if (badgeRaw) {
        sessionStorage.removeItem(badgeKey);
        const parsed = JSON.parse(badgeRaw);
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
      console.error("Failed to read celebration handoff from sessionStorage", e);
    } finally {
      setBadgesLoaded(true);
    }
  }, [params.attemptId]);

  // Sequencing: EpicCelebration (if accuracy >= 80) plays first; the reward
  // modal starts either right after it completes, or immediately if there
  // was no celebration to play. Waits on both the result query and the
  // handoff read so the two async sources never race each other. Mirrors
  // the mock-result page's sequencing effect exactly.
  useEffect(() => {
    if (query.data && badgesLoaded && !hasExploded.current) {
      hasExploded.current = true;
      const accuracy = query.data.summary?.accuracyPercentage || 0;
      if (accuracy >= 80) {
        try {
          const viewed = JSON.parse(localStorage.getItem("viewed_celebrations") || "[]");
          if (viewed.includes(params.attemptId)) {
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
  }, [query.data, badgesLoaded, unlockedBadges, rankUpTier, params.attemptId, rewardBreakdown]);

  const handleCelebrationComplete = () => {
    setShowCelebration(false);
    try {
      const viewed = JSON.parse(localStorage.getItem("viewed_celebrations") || "[]");
      if (!viewed.includes(params.attemptId)) {
        localStorage.setItem("viewed_celebrations", JSON.stringify([...viewed, params.attemptId]));
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

  return (
    <>
      <AnimatePresence>
        {showCelebration && (
          <EpicCelebration
            accuracy={query.data?.summary?.accuracyPercentage || 0}
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
      <AppShell title="Result Review">
      {query.isLoading ? <LoadingState label="Loading result..." /> : null}
      {query.error ? <ErrorState message={apiErrorMessage(query.error)} /> : null}

      {query.data ? (
        <div className="space-y-6">
          <ResultSummary result={query.data} />

          <div className="flex flex-wrap items-center gap-3">
            <button className="math-role-action-button px-4 py-3" onClick={() => router.push("/student/dashboard")}>
              <ArrowLeft size={16} />
              Back to Dashboard
            </button>
            <div className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 size={14} />
              Review ready
            </div>
          </div>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
                <BookOpenCheck size={22} />
              </div>
              <div>
                <h2 className="text-3xl font-black text-slate-950">Question Review</h2>
                <p className="text-slate-600">See each question, your selected answer, and the correct answer.</p>
              </div>
            </div>

            <div className="space-y-5">
              {query.data.questionReview?.map((q) => (
                <div key={q.questionId} className="math-card p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <h3 className="text-xl font-black text-slate-950">Question {q.questionNumber}</h3>
                    <span className={`math-badge ${q.isCorrect ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                      {q.isCorrect ? "Correct" : "Needs Practice"}
                    </span>
                  </div>

                  <div className="mt-5 rounded-[28px] bg-slate-50/90 p-6">
                    <MathQuestionDisplay operands={q.operands} operators={q.operators} displayType={(q as any).displayType ?? (q as any).display_type} questionText={(q as any).questionText ?? (q as any).question_text} />
                  </div>

                  <div className="mt-5 grid gap-3 xl:grid-cols-2">
                    <div className="rounded-[22px] bg-slate-50 p-4">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-500">Your answer</p>
                      <p className="mt-2 text-lg font-black text-slate-900">
                        {q.studentAnswer ? formatAnswerValue(q.studentAnswer) : "Not Answered"}
                      </p>
                    </div>
                    <div className="rounded-[22px] bg-emerald-50 p-4 text-emerald-900">
                      <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-emerald-700">Correct answer</p>
                      <p className="mt-2 text-lg font-black">
                        {q.correctAnswer !== undefined && q.correctAnswer !== null ? formatAnswerValue(q.correctAnswer) : "Hidden"}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
      </AppShell>
    </>
  );
}
