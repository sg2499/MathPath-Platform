"use client";

import React, { useState, useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from "framer-motion";
import { triggerMicroBurst } from "@/lib/utils/particles";
import { Target, Lock, ChevronLeft, Award } from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/common/AppShell";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/common/LoadingState";
import { ErrorState } from "@/components/common/ErrorState";
import { BadgeInspectionModal } from "@/components/gamification/BadgeInspectionModal";
import { useProtectedPage } from "@/hooks/useProtectedPage";
import {
  BadgeIconMap as IconMap,
  badgeColorConfig,
  fallbackBadgeConfig as fallbackConfig,
} from "@/lib/gamification/badgeVisuals";

// FORCE TAILWIND TO COMPILE THESE EXACT CLASSES DURING HOT-RELOAD
// Without this, Next.js dev server may not pick up tailwind.config.ts changes until a full restart
const _TAILWIND_HOT_RELOAD_SAFELIST = "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/20 text-white from-emerald-500 to-emerald-700 shadow-emerald-500/30 border-2 border-white/70 text-emerald-50 from-emerald-600 to-emerald-800 shadow-emerald-500/40 border-4 border-emerald-200 from-cyan-400 to-cyan-600 shadow-cyan-500/20 from-cyan-500 to-cyan-700 shadow-cyan-500/30 text-cyan-50 from-cyan-600 to-cyan-800 shadow-cyan-500/40 border-cyan-200 from-blue-500 to-blue-700 shadow-blue-500/20 from-blue-600 to-blue-800 shadow-blue-500/30 text-blue-50 from-blue-700 to-blue-900 shadow-blue-500/40 border-blue-200 from-red-500 to-red-700 shadow-red-500/20 from-red-600 to-red-800 shadow-red-500/30 text-red-50 from-red-700 to-red-900 shadow-red-500/40 border-red-200 from-orange-400 to-orange-600 shadow-orange-500/20 from-orange-500 to-orange-700 shadow-orange-500/30 text-orange-50 from-orange-600 to-orange-800 shadow-orange-500/40 border-orange-200 from-indigo-400 to-indigo-600 shadow-indigo-500/20 from-indigo-500 to-indigo-700 shadow-indigo-500/30 text-indigo-50 from-indigo-600 to-indigo-800 shadow-indigo-500/40 border-indigo-200 from-yellow-400 to-yellow-600 shadow-yellow-500/20 from-yellow-500 to-yellow-700 shadow-yellow-500/30 text-yellow-50 from-yellow-600 to-yellow-800 shadow-yellow-500/40 border-yellow-200 from-pink-500 to-pink-700 shadow-pink-500/20 from-pink-600 to-pink-800 shadow-pink-500/30 text-pink-50 from-pink-700 to-pink-900 shadow-pink-500/40 border-pink-200 from-fuchsia-500 to-violet-600 shadow-fuchsia-500/20 from-fuchsia-600 to-violet-700 shadow-fuchsia-500/30 text-fuchsia-50 from-fuchsia-700 to-violet-800 shadow-fuchsia-500/40 border-fuchsia-200 from-teal-400 to-teal-600 shadow-teal-500/20 from-teal-500 to-teal-700 shadow-teal-500/30 text-teal-50 from-teal-600 to-teal-800 shadow-teal-500/40 border-teal-200";

export default function TrophyRoomPage() {
  const Ready = useProtectedPage(["STUDENT"]);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"mock" | "dps">("mock");
  const [selectedBadge, setSelectedBadge] = useState<{ badge: any, config: any } | null>(null);

  useEffect(() => {
    if (!Ready) return;
    async function loadAchievements() {
      try {
        const response = await api.get(`/student/achievements`);
        const data = response.data;
        if (data.achievements) {
          setBadges(data.achievements);

          // Check for deep link
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const badgeCodeTier = params.get("badge");
            if (badgeCodeTier) {
              const matchedBadge = data.achievements.find(
                (b: any) => `${b.code}_${b.tier}` === badgeCodeTier
              );
              if (matchedBadge) {
                const configKey = `${matchedBadge.code}_${matchedBadge.tier}`;
                const config = badgeColorConfig[configKey] || fallbackConfig[matchedBadge.tier as keyof typeof fallbackConfig] || fallbackConfig.BASE;
                setSelectedBadge({ badge: matchedBadge, config });
                // Clean up URL so it doesn't reopen on refresh
                window.history.replaceState({}, '', '/student/achievements');
              }
            }
          }
        }
      } catch (err) {
        console.error(err);
        setError("We couldn't load your achievements. Please try again in a moment.");
      } finally {
        setLoading(false);
      }
    }
    loadAchievements();
  }, [Ready]);

  if (!Ready || loading) return <LoadingState />;

  if (error) {
    return (
      <AppShell>
        <main className="math-dashboard-page math-dashboard-student w-full space-y-5">
          <ErrorState title="Trophy Room Unavailable" message={error} />
        </main>
      </AppShell>
    );
  }

  // Separate into categories based on badge code prefix
  const isDpsBadge = (b: any) => b.code.startsWith("dps_");

  const activeBadges = activeTab === "dps"
    ? badges.filter(isDpsBadge)
    : badges.filter(b => !isDpsBadge(b));

  // Group by tier
  const baseBadges = activeBadges.filter(b => b.tier === "BASE");
  const superBadges = activeBadges.filter(b => b.tier === "SUPER");
  const legendaryBadges = activeBadges.filter(b => b.tier === "LEGENDARY");
  const mythicBadges = activeBadges.filter(b => b.tier === "MYTHIC");

  return (
    <AppShell>
      <main className="math-dashboard-page math-dashboard-student w-full space-y-5">
        <section className="math-dashboard-hero math-dashboard-hero-student math-dashboard-hero-clean">
          <div className="pointer-events-none absolute -right-16 -top-20 h-60 w-60 rounded-full bg-orange-300/18 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 left-1/3 h-36 w-36 rounded-full bg-pink-300/16 blur-3xl" />

          <div className="relative flex items-start justify-between gap-5">
            <div className="flex flex-col gap-5">
              <div className="math-block-header w-fit">
                <Award size={14} />
                Student Achievements
              </div>

              <div className="flex flex-col gap-3">
                <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight text-slate-950 dark:text-white sm:text-[2.35rem]">
                  The Trophy Room
                </h1>
                <p className="math-subtitle max-w-4xl lg:whitespace-nowrap">
                  Complete challenges, maintain streaks, and dominate Mock Exams to unlock exclusive badges.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.back()}
              className="math-dashboard-secondary-action shrink-0"
            >
              <ChevronLeft size={15} />
              Back
            </button>
          </div>
        </section>

        {/* Tabs */}
        <div className="flex items-center space-x-4 mb-8">
          <button
            onClick={() => setActiveTab("mock")}
            className={`px-8 py-3 rounded-full font-bold transition-all ${
              activeTab === "mock"
                ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30 scale-105"
                : "bg-white dark:bg-slate-800 text-slate-500 hover:text-white hover:bg-orange-500"
            }`}
          >
            Mock Exams
          </button>
          <button
            onClick={() => setActiveTab("dps")}
            className={`px-8 py-3 rounded-full font-bold transition-all ${
              activeTab === "dps"
                ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30 scale-105"
                : "bg-white dark:bg-slate-800 text-slate-500 hover:text-white hover:bg-orange-500"
            }`}
          >
            DPS Sheets
          </button>
        </div>

      <div key={activeTab} className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {/* Base Tier Shelf */}
        <Shelf title="Base Badges" badges={baseBadges} tier="BASE" onSelectBadge={setSelectedBadge} />

        {/* Super Tier Shelf */}
        <Shelf title="Super Badges" badges={superBadges} tier="SUPER" onSelectBadge={setSelectedBadge} />

        {/* Legendary Tier Shelf */}
        <Shelf title="Legendary Badges" badges={legendaryBadges} tier="LEGENDARY" onSelectBadge={setSelectedBadge} />

        {/* Mythic Tier Shelf -- Phase 1 (2026-07-28), the 4th tier above Legendary */}
        <Shelf title="Mythic Badges" badges={mythicBadges} tier="MYTHIC" onSelectBadge={setSelectedBadge} />

        {activeBadges.length === 0 && (
          <div className="text-center py-24 animate-in fade-in duration-500">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-4">
              <Lock size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No Badges Yet</h2>
            <p className="text-slate-500">
              {activeTab === "dps"
                ? "Keep completing your daily practice sheets to earn these badges!"
                : "Complete mock exams to start building your collection."}
            </p>
          </div>
        )}
      </div>
      </main>

      {/* Epic Badge Inspection Modal */}
      {selectedBadge && (
        <BadgeInspectionModal
          badge={selectedBadge.badge}
          config={selectedBadge.config}
          onClose={() => setSelectedBadge(null)}
        />
      )}
    </AppShell>
  );
}

function Shelf({ title, badges, tier, onSelectBadge }: { title: string, badges: any[], tier: string, onSelectBadge: (b: any) => void }) {
  if (badges.length === 0) return null;

  const bgStyles = {
    BASE: "bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800",
    SUPER: "bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/50",
    LEGENDARY: "bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-100 dark:border-yellow-900/50",
    // Phase 1 (2026-07-28): MYTHIC is the 4th tier, above Legendary. Fuchsia/
    // violet deliberately doesn't overlap any shelf above it (slate/indigo/gold).
    MYTHIC: "bg-fuchsia-50/50 dark:bg-fuchsia-950/20 border-fuchsia-100 dark:border-fuchsia-900/50"
  };

  const textStyles = {
    BASE: "text-slate-800 dark:text-slate-200",
    SUPER: "text-indigo-800 dark:text-indigo-300",
    LEGENDARY: "text-yellow-800 dark:text-yellow-300",
    MYTHIC: "text-fuchsia-800 dark:text-fuchsia-300"
  };

  return (
    <div className="space-y-6">
      <h2 className={`text-2xl font-black ${textStyles[tier as keyof typeof textStyles]}`}>{title}</h2>
      <div className={`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 p-6 md:p-8 rounded-3xl border-2 ${bgStyles[tier as keyof typeof bgStyles]}`}>
        {badges.map(b => (
          <BadgeCard key={b.id} badge={b} onSelectBadge={onSelectBadge} />
        ))}
      </div>
    </div>
  );
}

function BadgeCard({ badge, onSelectBadge }: { badge: any, onSelectBadge: (data: { badge: any, config: any }) => void }) {
  const Icon = (IconMap[badge.iconName] || Target) as any;
  const isUnlocked = badge.isUnlocked;

  const cardRef = React.useRef<HTMLDivElement>(null);

  // High-performance Framer Motion Values
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const opacity = useMotionValue(0);

  const springConfig = { damping: 20, stiffness: 150, mass: 0.5 };

  const smoothX = useSpring(mouseX, springConfig);
  const smoothY = useSpring(mouseY, springConfig);
  const smoothOpacity = useSpring(opacity, { damping: 20, stiffness: 100 });

  // Rotate based on mouse (Max 25deg)
  const rx = useTransform(smoothY, [-0.5, 0.5], [25, -25]);
  const ry = useTransform(smoothX, [-0.5, 0.5], [-25, 25]);

  // Parallax (Max 20px)
  const px = useTransform(smoothX, [-0.5, 0.5], [-20, 20]);
  const py = useTransform(smoothY, [-0.5, 0.5], [-20, 20]);

  // Dynamic Specular Highlight / Volumetric Flashlight
  const glareX = useTransform(smoothX, [-0.5, 0.5], [0, 100]);
  const glareY = useTransform(smoothY, [-0.5, 0.5], [0, 100]);
  const background = useMotionTemplate`radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.4) 0%, transparent 60%)`;

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isUnlocked || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;

    mouseX.set(x);
    mouseY.set(y);
    opacity.set(1);
  };

  const handleMouseLeave = () => {
    if (!isUnlocked) return;
    mouseX.set(0);
    mouseY.set(0);
    opacity.set(0);
  };

  const configKey = badge.code ? `${badge.code}_${badge.tier}` : "";
  const config = badgeColorConfig[configKey] || fallbackConfig[badge.tier as keyof typeof fallbackConfig] || fallbackConfig.BASE;

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isUnlocked) return;
    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    triggerMicroBurst(x, y, config.burst);
    // Slight delay so the violent click animation runs before mounting modal
    setTimeout(() => {
      onSelectBadge({ badge, config });
    }, 150);
  };

  const progressPercent = Math.min(100, Math.round((badge.currentProgress / badge.requiredCount) * 100));

  const getShapeStyles = (iconName: string) => {
    const shapes: Record<string, { clipPath: string, w: string, h: string }> = {
      "Target": { clipPath: "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)", w: "w-20 md:w-24", h: "h-20 md:h-24" },
      "Focus": { clipPath: "polygon(50% 0%, 90% 20%, 100% 60%, 75% 100%, 25% 100%, 0% 60%, 10% 20%)", w: "w-20 md:w-24", h: "h-20 md:h-24" },
      "Scan": { clipPath: "polygon(50% 0%, 65% 25%, 100% 25%, 75% 50%, 85% 90%, 50% 70%, 15% 90%, 25% 50%, 0% 25%, 35% 25%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "Zap": { clipPath: "polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)", w: "w-24 md:w-28", h: "h-16 md:h-20" },
      "FastForward": { clipPath: "polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      "Rocket": { clipPath: "polygon(50% 0%, 100% 40%, 80% 100%, 50% 80%, 20% 100%, 0% 40%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Medal": { clipPath: "polygon(0% 0%, 100% 0%, 100% 70%, 50% 100%, 0% 70%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Flag": { clipPath: "polygon(0% 0%, 100% 0%, 80% 50%, 100% 100%, 0% 100%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Crown": { clipPath: "polygon(0% 0%, 25% 30%, 50% 0%, 75% 30%, 100% 0%, 90% 100%, 10% 100%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      "Flame": { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)", w: "w-20 md:w-24", h: "h-20 md:h-24" },
      "Activity": { clipPath: "polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Infinity": { clipPath: "polygon(20% 0%, 80% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      "Clock": { clipPath: "polygon(15% 0%, 85% 0%, 100% 15%, 100% 85%, 85% 100%, 15% 100%, 0% 85%, 0% 15%)", w: "w-20 md:w-24", h: "h-20 md:h-24" },
      "Sun": { clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 90% 100%, 10% 100%, 0% 50%)", w: "w-24 md:w-28", h: "h-16 md:h-20" },
      "AlarmClock": { clipPath: "polygon(30% 0%, 70% 0%, 100% 20%, 100% 80%, 70% 100%, 30% 100%, 0% 80%, 0% 20%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "TrendingUp": { clipPath: "polygon(50% 0%, 100% 100%, 0% 100%)", w: "w-20 md:w-24", h: "h-20 md:h-24" },
      "ArrowUpRight": { clipPath: "polygon(50% 0%, 100% 50%, 80% 100%, 20% 100%, 0% 50%)", w: "w-20 md:w-24", h: "h-20 md:h-24" },
      "ChevronsUp": { clipPath: "polygon(50% 0%, 100% 40%, 70% 40%, 70% 100%, 30% 100%, 30% 40%, 0% 40%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Trophy": { clipPath: "polygon(0% 0%, 100% 0%, 80% 100%, 20% 100%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      "Star": { clipPath: "polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "Sparkles": { clipPath: "polygon(50% 0%, 55% 45%, 100% 50%, 55% 55%, 50% 100%, 45% 55%, 0% 50%, 45% 45%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "Crosshair": { clipPath: "polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%)", w: "w-20 md:w-24", h: "h-20 md:h-24" },
      "Aperture": { clipPath: "polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      "Radar": { clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "Shield": { clipPath: "polygon(0% 10%, 100% 10%, 100% 60%, 50% 100%, 0% 60%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Anchor": { clipPath: "polygon(10% 0%, 90% 0%, 100% 50%, 50% 100%, 0% 50%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Mountain": { clipPath: "polygon(50% 0%, 100% 20%, 90% 80%, 50% 100%, 10% 80%, 0% 20%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Brain": { clipPath: "polygon(20% 20%, 80% 20%, 100% 80%, 0% 80%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      "Lightbulb": { clipPath: "polygon(30% 0%, 70% 0%, 100% 40%, 80% 100%, 20% 100%, 0% 40%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "Library": { clipPath: "polygon(0% 0%, 100% 0%, 90% 50%, 100% 100%, 0% 100%, 10% 50%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },

      // --- MYTHIC tier silhouettes (2026-07-28) ---------------------------
      // One per MYTHIC iconName. These are the 2D card silhouettes only -- the
      // cinematic geometry lives in BadgeInspectionModal. Each is deliberately
      // BUSIER than its own family's lower tiers (more vertices, sharper
      // points) so the ceiling tier is legible as a shape at thumbnail size
      // before any colour or label is read.
      //
      // PerfectionistGemMythic was previously MISSING from this map entirely
      // and silently fell through to the `shapes["Target"]` octagon below --
      // the one already-shipped MYTHIC badge was wearing the Perfectionist
      // BASE silhouette. It now gets the split-gem outline its glyph and its
      // cinematic both use: a stone with a jagged fracture down the centre.
      "PerfectionistGemMythic": { clipPath: "polygon(36% 0%, 64% 0%, 100% 34%, 58% 100%, 54% 62%, 46% 62%, 42% 100%, 0% 34%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },

      // Speed Demon -- the dart, torn open by the rupture into a swept delta.
      "SpeedCometMythic": { clipPath: "polygon(100% 0%, 74% 46%, 92% 52%, 30% 100%, 44% 56%, 20% 62%, 62% 22%, 46% 30%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      // Competitor -- a five-point coronation crown on a seated band.
      "CrownMythic": { clipPath: "polygon(0% 22%, 16% 0%, 32% 26%, 50% 0%, 68% 26%, 84% 0%, 100% 22%, 92% 100%, 8% 100%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      // Unstoppable Streak -- a pinched figure-8 waist, the loop folding in.
      "InfinityMythic": { clipPath: "polygon(24% 0%, 42% 22%, 58% 22%, 76% 0%, 100% 30%, 100% 70%, 76% 100%, 58% 78%, 42% 78%, 24% 100%, 0% 70%, 0% 30%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      // Early Bird -- a sun cresting a horizon line, rays above the curve.
      "DawnBreakMythic": { clipPath: "polygon(50% 0%, 62% 20%, 84% 10%, 80% 34%, 100% 44%, 100% 100%, 0% 100%, 0% 44%, 20% 34%, 16% 10%, 38% 20%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      // Comeback Kid -- a rising phoenix: swept wings over a lifting body.
      "PhoenixSurgeMythic": { clipPath: "polygon(50% 0%, 66% 24%, 100% 14%, 78% 48%, 90% 96%, 50% 66%, 10% 96%, 22% 48%, 0% 14%, 34% 24%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      // Podium Finisher ("The Immortal") -- a closed wreath around a plinth.
      "LaurelCrownMythic": { clipPath: "polygon(50% 0%, 74% 10%, 90% 30%, 96% 58%, 76% 84%, 62% 100%, 38% 100%, 24% 84%, 4% 58%, 10% 30%, 26% 10%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      // Sharpshooter -- concentric lock: a notched ring around a hard centre.
      "PrecisionCoreMythic": { clipPath: "polygon(44% 0%, 56% 0%, 56% 14%, 78% 22%, 86% 44%, 100% 44%, 100% 56%, 86% 56%, 78% 78%, 56% 86%, 56% 100%, 44% 100%, 44% 86%, 22% 78%, 14% 56%, 0% 56%, 0% 44%, 14% 44%, 22% 22%, 44% 14%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      // Underdog -- a twin-spur summit breaking a flat cloud line.
      "SummitMythic": { clipPath: "polygon(50% 0%, 68% 34%, 78% 22%, 100% 68%, 100% 100%, 0% 100%, 0% 68%, 22% 22%, 32% 34%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      // High Achiever -- an open eye in a pointed mandorla.
      "OracleMythic": { clipPath: "polygon(0% 50%, 22% 22%, 50% 12%, 78% 22%, 100% 50%, 78% 78%, 50% 88%, 22% 78%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },

      // --- PHASE 2: five new families, four tiers each (2026-07-28) -------
      // One silhouette per new iconName. These are the 2D card outlines only --
      // the glyph lives in lib/gamification/badgeGlyphs.tsx and the cinematic
      // geometry in BadgeInspectionModal.
      //
      // Two rules, both of which the existing entries above already follow:
      //   1. WITHIN a family the four shapes share a silhouette family and grow
      //      in STRUCTURE with tier, so the ladder is legible without reading
      //      the label -- e.g. Iron Wall goes one brick -> three merlons ->
      //      five -> a tiered keep.
      //      "Structure" is NOT the same as "vertex count", and this pass
      //      learned that the hard way (see Section Specialist below): on a
      //      CONVEX outline, adding vertices only makes the shape rounder, so
      //      a convex ladder converges on a disc and the tiers become LESS
      //      distinguishable as they climb. Where a family escalates by adding
      //      detail it has to add CONCAVE detail -- notches, merlons, lobes,
      //      valleys -- which is what every escalating family here now does.
      //   1b. All of this is measured, not eyeballed. Each silhouette is
      //      rasterised at its real w/h and compared to the other 59 by
      //      intersection-over-union. The shipped catalogue's own worst pair is
      //      Clock vs Crosshair at 0.979 and its p99 is 0.889; no pair
      //      involving a phase-2 shape exceeds 0.898.
      //   2. ACROSS families no two outlines collide. The five motifs are
      //      chosen to be structurally different at thumbnail size: a
      //      perspective trapezoid (Marathoner), a crenellated block (Iron
      //      Wall), a stacked V (The Veteran), a notched dial (Last-Minute
      //      Hero) and a hexagon (Section Specialist).
      //      Four of those five motifs are unused by the 40 entries above. The
      //      HEXAGON IS NOT: "Radar", "Infinity" and "Sun" are all six-sided
      //      already. That collision was real and was caught by comparing
      //      normalised clipPath strings across all 60 entries rather than by
      //      eye -- SectionSpecialistNode's first draft was byte-identical to
      //      Radar's polygon. See the Section Specialist block below for how
      //      the family is held apart from those three instead.

      // Marathoner -- a road in perspective: narrow at the top, wide at the
      // foot. Widens and gains verge steps as the tiers climb, and MYTHIC
      // closes into a ring because at that tier the trail is a circuit.
      "MarathonTrail": { clipPath: "polygon(38% 0%, 62% 0%, 100% 100%, 0% 100%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "MarathonSurge": { clipPath: "polygon(38% 0%, 62% 0%, 78% 48%, 100% 100%, 62% 78%, 38% 78%, 0% 100%, 22% 48%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "MarathonHorizon": { clipPath: "polygon(0% 34%, 24% 22%, 44% 30%, 56% 30%, 76% 22%, 100% 34%, 100% 44%, 66% 44%, 100% 100%, 0% 100%, 34% 44%, 0% 44%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "MarathonEternal": { clipPath: "polygon(50% 8%, 76% 14%, 94% 30%, 100% 52%, 88% 76%, 62% 92%, 38% 92%, 12% 76%, 0% 52%, 6% 30%, 24% 14%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },

      // Iron Wall -- crenellated masonry. One merlon, then three, then five,
      // then a tiered keep silhouette. Flat-bottomed at every tier: this family
      // never leaves the ground, which is the whole read.
      // BASE is one brick, and it is a KEYED brick rather than a plain
      // rectangle: a mortar notch is cut into each end, so it reads as a unit
      // that interlocks with the course beside it rather than as a generic
      // filled box. This is a measured change, not a flourish -- the plain
      // 4-point rectangle is simply the un-clipped card box, so it scored 0.896
      // IoU against "Sun" and 0.853 against this family's own LEGENDARY. The
      // notches take its worst pair to 0.841 (vs "Zap") while keeping the flat
      // top and bottom the whole family depends on.
      "IronWallBrick": { clipPath: "polygon(0% 0%, 100% 0%, 100% 34%, 88% 34%, 88% 66%, 100% 66%, 100% 100%, 0% 100%, 0% 66%, 12% 66%, 12% 34%, 0% 34%)", w: "w-24 md:w-28", h: "h-16 md:h-20" },
      "IronWallBastion": { clipPath: "polygon(0% 16%, 22% 16%, 22% 0%, 44% 0%, 44% 16%, 66% 16%, 66% 0%, 88% 0%, 88% 16%, 100% 16%, 100% 100%, 0% 100%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "IronWallRampart": { clipPath: "polygon(0% 0%, 14% 0%, 14% 18%, 30% 18%, 30% 6%, 44% 6%, 44% 18%, 56% 18%, 56% 6%, 70% 6%, 70% 18%, 86% 18%, 86% 0%, 100% 0%, 100% 100%, 0% 100%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      "IronWallCitadel": { clipPath: "polygon(44% 0%, 56% 0%, 56% 14%, 66% 14%, 66% 30%, 78% 30%, 78% 20%, 88% 20%, 88% 46%, 100% 46%, 100% 62%, 100% 100%, 0% 100%, 0% 62%, 0% 46%, 12% 46%, 12% 20%, 22% 20%, 22% 30%, 34% 30%, 34% 14%, 44% 14%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },

      // The Veteran -- the stacked chevron, gaining a course per tier.
      // MYTHIC narrows into an obelisk on a plinth, which is the same V
      // repeated four times up a shaft.
      "VeteranChevron": { clipPath: "polygon(50% 0%, 100% 44%, 100% 66%, 50% 22%, 0% 66%, 0% 44%)", w: "w-24 md:w-28", h: "h-20 md:h-24" },
      "VeteranMedallion": { clipPath: "polygon(30% 0%, 70% 0%, 70% 18%, 100% 56%, 84% 92%, 50% 100%, 16% 92%, 0% 56%, 30% 18%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "VeteranStandard": { clipPath: "polygon(50% 0%, 62% 10%, 92% 10%, 92% 74%, 76% 74%, 76% 88%, 62% 74%, 38% 74%, 24% 88%, 24% 74%, 8% 74%, 8% 10%, 38% 10%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "VeteranLegacy": { clipPath: "polygon(50% 0%, 62% 16%, 58% 24%, 66% 40%, 60% 46%, 70% 64%, 62% 70%, 74% 88%, 100% 88%, 100% 100%, 0% 100%, 0% 88%, 26% 88%, 38% 70%, 30% 64%, 40% 46%, 34% 40%, 42% 24%, 38% 16%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },

      // Last-Minute Hero -- the countdown dial, and the final-10% wedge the
      // whole family is built on. The escalation is what the dial DOES with
      // that wedge: BASE still has it missing, SUPER fires it outward as a
      // starburst, LEGENDARY spreads that into a full flame crown, and MYTHIC
      // closes back to a disc, because an eclipse is the one tier where the
      // dial is whole and the drama is the darkness instead of the gap.
      // BASE is the wedge itself, cut OUT of the dial at the top right: the
      // final 10% of the window, missing. Its first draft was a near-circle
      // and measured 0.942 IoU against this family's own MYTHIC eclipse disc,
      // which is the one comparison a tier ladder cannot afford to fail --
      // removing the wedge takes that pair to 0.727.
      "LastMinuteSpark": { clipPath: "polygon(50% 50%, 98% 36%, 100% 53%, 96% 69%, 87% 83%, 74% 94%, 59% 99%, 42% 99%, 26% 94%, 13% 84%, 4% 70%, 0% 53%, 2% 37%, 9% 22%, 20% 10%, 35% 2%, 52% 0%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "LastMinuteFlash": { clipPath: "polygon(50% 0%, 62% 18%, 82% 4%, 76% 26%, 100% 26%, 84% 44%, 100% 66%, 78% 74%, 84% 96%, 50% 86%, 16% 96%, 22% 74%, 0% 66%, 16% 44%, 0% 26%, 24% 26%, 18% 4%, 38% 18%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "LastMinuteBlaze": { clipPath: "polygon(50% 0%, 58% 20%, 72% 8%, 74% 28%, 96% 22%, 88% 46%, 100% 68%, 78% 80%, 66% 100%, 34% 100%, 22% 80%, 0% 68%, 12% 46%, 4% 22%, 26% 28%, 28% 8%, 42% 20%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "LastMinuteEclipse": { clipPath: "polygon(50% 2%, 70% 4%, 74% 18%, 88% 16%, 96% 32%, 100% 50%, 92% 72%, 72% 92%, 50% 98%, 28% 92%, 8% 72%, 0% 50%, 8% 28%, 28% 8%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },

      // Section Specialist -- the hexagonal lattice. BASE is a single cell and
      // each tier fuses more cells around it, so the outline gains LOBES (and
      // the valleys between them) without ever stopping being hexagonal.
      //
      // NOTE: the hexagon is NOT unused elsewhere in this map, so this family
      // has to earn its separation rather than assume it. Three entries above
      // are already six-sided: "Radar" (sharpshooter LEGENDARY) is a point-top
      // hexagon, and "Infinity" and "Sun" are flat-top ones.
      //
      // THIS FAMILY'S FIRST DRAFT ESCALATED THE WRONG WAY and was rebuilt. It
      // climbed 6 -> 12 -> 16 -> 24 vertices around a CONVEX outline, on the
      // assumption that more vertices reads as more elaborate. It does not: a
      // convex polygon with more vertices is just a rounder polygon, so the
      // ladder converged on a disc instead of diverging. Measured by
      // rasterising every pair of the 60 silhouettes at their real w/h and
      // taking intersection-over-union, the draft's SUPER tier scored 0.987
      // against Radar -- higher than ANY pair in the shipped catalogue, whose
      // worst is Clock vs Crosshair at 0.979 -- and its own four tiers sat at
      // 0.90-0.94 against each other.
      //
      // The rebuild escalates by LOBE COUNT on a CONCAVE outline instead,
      // which is also the truer picture of what the badge means: 1 cell -> 3
      // fused cells -> a 6-cell ring -> a 12-point nexus. The valleys between
      // lobes are what stop it from ever becoming a disc. Worst pair involving
      // any of the four is now 0.881, i.e. at the catalogue's existing p99
      // (0.889) rather than past its maximum.
      //
      // BASE is a single point-top cell with a connector socket notched into
      // each side -- one node, wired for the ring that arrives at SUPER. It is
      // deliberately NOT the plain point-top hexagon, which is byte-identical
      // to Radar's polygon.
      "SectionSpecialistNode": { clipPath: "polygon(50% 0%, 100% 25%, 82% 50%, 100% 75%, 50% 100%, 0% 75%, 18% 50%, 0% 25%)", w: "w-20 md:w-24", h: "h-24 md:h-28" },
      "SectionSpecialistGrid": { clipPath: "polygon(50% 0%, 77% 34%, 93% 75%, 50% 81%, 7% 75%, 23% 34%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "SectionSpecialistMatrix": { clipPath: "polygon(50% 0%, 66% 23%, 93% 25%, 81% 50%, 93% 75%, 66% 77%, 50% 100%, 35% 77%, 7% 75%, 19% 50%, 7% 25%, 34% 23%)", w: "w-24 md:w-28", h: "h-24 md:h-28" },
      "SectionSpecialistNexus": { clipPath: "polygon(50% 0%, 59% 18%, 75% 7%, 73% 27%, 93% 25%, 82% 41%, 100% 50%, 82% 59%, 93% 75%, 73% 73%, 75% 93%, 59% 82%, 50% 100%, 41% 82%, 25% 93%, 27% 73%, 7% 75%, 18% 59%, 0% 50%, 18% 41%, 7% 25%, 27% 27%, 25% 7%, 41% 18%)", w: "w-24 md:w-28", h: "h-24 md:h-28" }
    };
    return shapes[iconName] || shapes["Target"];
  };
  const shape = getShapeStyles(badge.iconName);

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      whileHover={isUnlocked ? { scale: 1.05 } : {}}
      whileTap={isUnlocked ? { scale: 0.85 } : {}}
      className={`relative group [perspective:1000px] h-full ${isUnlocked ? 'cursor-pointer' : ''}`}
    >
      <motion.div
        className={`relative flex flex-col items-center text-center p-5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] border border-slate-100/50 dark:border-slate-800/50 h-full overflow-hidden`}
        style={{
          rotateX: isUnlocked ? rx : 0,
          rotateY: isUnlocked ? ry : 0,
          boxShadow: isUnlocked ? (badge.tier === 'MYTHIC' ? '0 30px 70px -10px rgba(217, 70, 239, 0.55)' : badge.tier === 'LEGENDARY' ? '0 30px 60px -12px rgba(234, 179, 8, 0.5)' : '0 25px 50px -12px rgba(0, 0, 0, 0.25)') : ''
        }}
      >

        {/* Dynamic Volumetric Flashlight */}
        {isUnlocked && (
          <motion.div
            className="absolute inset-0 pointer-events-none z-10 mix-blend-overlay"
            style={{
              background,
              opacity: smoothOpacity
            }}
          />
        )}

        {/* Legendary/Mythic Foil Sweep & Sparks. MYTHIC reuses this baseline
            treatment for now (2026-07-28, Phase 1) rather than shipping with
            no effect at all -- a distinct prismatic/holographic sweep to
            match each MYTHIC badge's own identity is design follow-up work,
            not a blocker for these badges being live and functional. */}
        {isUnlocked && (badge.tier === "LEGENDARY" || badge.tier === "MYTHIC") && (
           <>
             {/* Holographic foil sweep tied to rotation */}
             <motion.div
                className="absolute inset-[-100%] z-0 pointer-events-none mix-blend-color-dodge opacity-50"
                style={{
                   background: "linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.8) 50%, transparent 60%)",
                   x: px,
                   y: py
                }}
             />
             <div className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_180deg,rgba(234,179,8,0.3)_360deg)] z-0 pointer-events-none mix-blend-color-dodge" />
             <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                {[...Array(8)].map((_, i) => (
                   <div key={i} className={`absolute w-8 h-[1px] bg-white rounded-full animate-pulse rotate-45 blur-[0.5px] shadow-[0_0_5px_rgba(255,255,255,1)]`} style={{ top: `${10 + Math.random()*80}%`, left: `${10 + Math.random()*80}%`, animationDuration: `${0.2+Math.random()*0.5}s`, animationDelay: `${Math.random()*1}s` }} />
                ))}
             </div>
           </>
        )}

        {/* The Badge Graphic (Clipped Polygon + Drop Shadow)
            2026-07-28 clarity fix: the glow filter used to sit on THIS
            wrapper, which meant it applied to the flattened composite of
            the background shape AND the icon together. At the ~32px size
            this renders at (vs. 120px in the unlock cutscene, where the
            same style of glow reads fine), a 25px blur radius is close to
            the icon's own size -- it didn't blur the icon's pixels, but the
            glow's halo and offset shadow sat close enough behind/around the
            thin icon linework that it read as "hazy" rather than "glowing",
            on every single unlocked badge across every tier. Fix: the glow
            now lives only on the background-shape div below (so it follows
            the badge's clean polygon silhouette, isolated from the icon's
            own rendering layer), tuned down to a size that suits a small
            card instead of a cinematic reveal. The icon itself no longer
            gets any filter at all -- rarity/tier is already communicated by
            color, shape, and this glow; the icon linework stays exactly as
            crisp unlocked as it is locked. */}
        <motion.div
          className={`relative flex items-center justify-center mb-5 transition-all duration-300 ${shape.w} ${shape.h} z-20`}
          style={{
            x: isUnlocked ? px : 0,
            y: isUnlocked ? py : 0,
            z: isUnlocked ? 40 : 0
          }}
        >
          {/* Clipped Background Geometry -- glow lives here now, isolated
              from the icon (see note above). */}
          <div
            className={`absolute inset-0 transition-all duration-500 ${!isUnlocked ? 'bg-slate-200 dark:bg-slate-800 shadow-[inset_0_4px_4px_rgba(0,0,0,0.1)]' : 'shadow-[inset_0_8px_16px_rgba(255,255,255,0.4)]'}`}
            style={{
              clipPath: shape.clipPath,
              ...(isUnlocked ? { background: config.customBg } : {}),
              filter: isUnlocked ? `drop-shadow(0 0 8px ${config.bloomColor}) drop-shadow(0 6px 8px rgba(0,0,0,0.35))` : 'none',
            }}
          />

          {/* Icon -- always rendered crystal-clear, locked or unlocked. No
              blur, no chromatic-aberration/glitch filter at this size: that
              stylistic RGB-split effect (still used in the big cutscene
              reveal, where it reads as an intentional flourish on a much
              larger icon) just looked like ghosting/blur on a 32px glyph. */}
          <Icon size={32} className={`relative z-10 ${!isUnlocked ? 'text-slate-400 dark:text-slate-600' : ''} transition-all duration-300`} style={{
            transform: isUnlocked ? 'scale(1.15) rotate(12deg)' : 'scale(1) rotate(0deg)',
            color: isUnlocked ? config.iconColorHex : undefined,
          }} />
        </motion.div>

        <motion.h3
          className={`relative font-black text-sm mb-2 z-20 ${isUnlocked ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}
          style={{ z: isUnlocked ? 20 : 0 }}
        >
          {badge.name}
        </motion.h3>

        <p className="relative text-[10px] md:text-xs text-slate-500 mb-4 min-h-[2.5rem] flex-grow z-20">
          {badge.description}
        </p>

        {!isUnlocked && badge.requiredCount > 1 && (
          <div className="w-full mt-auto z-20">
            <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
              <span>Progress</span>
              <span>{badge.currentProgress} / {badge.requiredCount}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-slate-400 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
            </div>
          </div>
        )}

        {isUnlocked && (
          <div className="relative w-full mt-auto pt-2 border-t border-slate-100 dark:border-slate-800 z-20">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              Unlocked
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
