"use client";

import React, { useState, useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform, useMotionTemplate } from "framer-motion";
import { triggerMicroBurst } from "@/lib/utils/particles";
import { 
  Target, Focus, Scan, Zap, FastForward, Rocket, 
  Medal, Flag, Crown, Flame, Activity, Infinity, 
  Clock, Sun, AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp, 
  Trophy, Star, Sparkles, Crosshair, Aperture, Radar, 
  Shield, Anchor, Mountain, Brain, Lightbulb, Library,
  Lock, ChevronLeft, Award
} from "lucide-react";
import { api } from "@/lib/api";
import { AppShell } from "@/components/common/AppShell";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/common/LoadingState";
import { BadgeInspectionModal } from "@/components/gamification/BadgeInspectionModal";

// FORCE TAILWIND TO COMPILE THESE EXACT CLASSES DURING HOT-RELOAD
// Without this, Next.js dev server may not pick up tailwind.config.ts changes until a full restart
const _TAILWIND_HOT_RELOAD_SAFELIST = "bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-500/20 text-white from-emerald-500 to-emerald-700 shadow-emerald-500/30 border-2 border-white/70 text-emerald-50 from-emerald-600 to-emerald-800 shadow-emerald-500/40 border-4 border-emerald-200 from-cyan-400 to-cyan-600 shadow-cyan-500/20 from-cyan-500 to-cyan-700 shadow-cyan-500/30 text-cyan-50 from-cyan-600 to-cyan-800 shadow-cyan-500/40 border-cyan-200 from-blue-500 to-blue-700 shadow-blue-500/20 from-blue-600 to-blue-800 shadow-blue-500/30 text-blue-50 from-blue-700 to-blue-900 shadow-blue-500/40 border-blue-200 from-red-500 to-red-700 shadow-red-500/20 from-red-600 to-red-800 shadow-red-500/30 text-red-50 from-red-700 to-red-900 shadow-red-500/40 border-red-200 from-orange-400 to-orange-600 shadow-orange-500/20 from-orange-500 to-orange-700 shadow-orange-500/30 text-orange-50 from-orange-600 to-orange-800 shadow-orange-500/40 border-orange-200 from-indigo-400 to-indigo-600 shadow-indigo-500/20 from-indigo-500 to-indigo-700 shadow-indigo-500/30 text-indigo-50 from-indigo-600 to-indigo-800 shadow-indigo-500/40 border-indigo-200 from-yellow-400 to-yellow-600 shadow-yellow-500/20 from-yellow-500 to-yellow-700 shadow-yellow-500/30 text-yellow-50 from-yellow-600 to-yellow-800 shadow-yellow-500/40 border-yellow-200 from-pink-500 to-pink-700 shadow-pink-500/20 from-pink-600 to-pink-800 shadow-pink-500/30 text-pink-50 from-pink-700 to-pink-900 shadow-pink-500/40 border-pink-200 from-fuchsia-500 to-violet-600 shadow-fuchsia-500/20 from-fuchsia-600 to-violet-700 shadow-fuchsia-500/30 text-fuchsia-50 from-fuchsia-700 to-violet-800 shadow-fuchsia-500/40 border-fuchsia-200 from-teal-400 to-teal-600 shadow-teal-500/20 from-teal-500 to-teal-700 shadow-teal-500/30 text-teal-50 from-teal-600 to-teal-800 shadow-teal-500/40 border-teal-200";

// Map our backend icon names to Lucide icons
const IconMap: Record<string, any> = {
  "Target": Target, "Focus": Focus, "Scan": Scan,
  "Zap": Zap, "FastForward": FastForward, "Rocket": Rocket,
  "Medal": Medal, "Flag": Flag, "Crown": Crown,
  "Flame": Flame, "Activity": Activity, "Infinity": Infinity,
  "Clock": Clock, "Sun": Sun, "AlarmClock": AlarmClock,
  "TrendingUp": TrendingUp, "ArrowUpRight": ArrowUpRight, "ChevronsUp": ChevronsUp,
  "Trophy": Trophy, "Star": Star, "Sparkles": Sparkles,
  "Crosshair": Crosshair, "Aperture": Aperture, "Radar": Radar,
  "Shield": Shield, "Anchor": Anchor, "Mountain": Mountain,
  "Brain": Brain, "Lightbulb": Lightbulb, "Library": Library
};

// 30 Unique Colors based on Badge Code and Tier (Distinct Spectrum)
const badgeColorConfig: Record<string, any> = {
  // Perfectionist (Emerald)
  "perfectionist_BASE": { customBg: "linear-gradient(to bottom right, #34d399, #059669)", customShadow: "0 10px 15px -3px rgba(16, 185, 129, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(16, 185, 129, 0.6)", glitch: false, burst: ["#34d399", "#10b981", "#059669"] },
  "perfectionist_SUPER": { customBg: "linear-gradient(to bottom right, #10b981, #047857)", customShadow: "0 10px 15px -3px rgba(16, 185, 129, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#ecfdf5", bloomColor: "rgba(5, 150, 105, 0.8)", glitch: true, burst: ["#10b981", "#059669", "#ffffff"] },
  "perfectionist_LEGENDARY": { customBg: "linear-gradient(to bottom right, #059669, #065f46)", customShadow: "0 10px 15px -3px rgba(16, 185, 129, 0.4)", customBorder: "4px solid #a7f3d0", iconColorHex: "#ecfdf5", bloomColor: "rgba(4, 120, 87, 0.9)", glitch: true, burst: ["#059669", "#047857", "#d1fae5", "#ffffff"] },
  
  // Speed Demon (Cyan)
  "speed_demon_BASE": { customBg: "linear-gradient(to bottom right, #22d3ee, #0891b2)", customShadow: "0 10px 15px -3px rgba(6, 182, 212, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(6, 182, 212, 0.6)", glitch: false, burst: ["#22d3ee", "#06b6d4", "#0891b2"] },
  "speed_demon_SUPER": { customBg: "linear-gradient(to bottom right, #06b6d4, #0e7490)", customShadow: "0 10px 15px -3px rgba(6, 182, 212, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#ecfeff", bloomColor: "rgba(8, 145, 178, 0.8)", glitch: true, burst: ["#06b6d4", "#0891b2", "#ffffff"] },
  "speed_demon_LEGENDARY": { customBg: "linear-gradient(to bottom right, #0891b2, #155e75)", customShadow: "0 10px 15px -3px rgba(6, 182, 212, 0.4)", customBorder: "4px solid #a5f3fc", iconColorHex: "#ecfeff", bloomColor: "rgba(14, 116, 144, 0.9)", glitch: true, burst: ["#0891b2", "#0e7490", "#cffafe", "#ffffff"] },
  
  // Competitor (Blue)
  "competitor_BASE": { customBg: "linear-gradient(to bottom right, #3b82f6, #1d4ed8)", customShadow: "0 10px 15px -3px rgba(59, 130, 246, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(59, 130, 246, 0.6)", glitch: false, burst: ["#60a5fa", "#3b82f6", "#2563eb"] },
  "competitor_SUPER": { customBg: "linear-gradient(to bottom right, #2563eb, #1e40af)", customShadow: "0 10px 15px -3px rgba(59, 130, 246, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#eff6ff", bloomColor: "rgba(37, 99, 235, 0.8)", glitch: true, burst: ["#3b82f6", "#2563eb", "#ffffff"] },
  "competitor_LEGENDARY": { customBg: "linear-gradient(to bottom right, #1d4ed8, #1e3a8a)", customShadow: "0 10px 15px -3px rgba(59, 130, 246, 0.4)", customBorder: "4px solid #bfdbfe", iconColorHex: "#eff6ff", bloomColor: "rgba(29, 78, 216, 0.9)", glitch: true, burst: ["#2563eb", "#1d4ed8", "#dbeafe", "#ffffff"] },
  
  // Unstoppable Streak (Red)
  "unstoppable_streak_BASE": { customBg: "linear-gradient(to bottom right, #ef4444, #b91c1c)", customShadow: "0 10px 15px -3px rgba(239, 68, 68, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(239, 68, 68, 0.6)", glitch: false, burst: ["#f87171", "#ef4444", "#dc2626"] },
  "unstoppable_streak_SUPER": { customBg: "linear-gradient(to bottom right, #dc2626, #991b1b)", customShadow: "0 10px 15px -3px rgba(239, 68, 68, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#fef2f2", bloomColor: "rgba(220, 38, 38, 0.8)", glitch: true, burst: ["#ef4444", "#dc2626", "#ffffff"] },
  "unstoppable_streak_LEGENDARY": { customBg: "linear-gradient(to bottom right, #b91c1c, #7f1d1d)", customShadow: "0 10px 15px -3px rgba(239, 68, 68, 0.4)", customBorder: "4px solid #fecaca", iconColorHex: "#fef2f2", bloomColor: "rgba(185, 28, 28, 0.9)", glitch: true, burst: ["#dc2626", "#b91c1c", "#fee2e2", "#ffffff"] },

  // Early Bird (Orange)
  "early_bird_BASE": { customBg: "linear-gradient(to bottom right, #fb923c, #ea580c)", customShadow: "0 10px 15px -3px rgba(249, 115, 22, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(249, 115, 22, 0.6)", glitch: false, burst: ["#fb923c", "#f97316", "#ea580c"] },
  "early_bird_SUPER": { customBg: "linear-gradient(to bottom right, #f97316, #c2410c)", customShadow: "0 10px 15px -3px rgba(249, 115, 22, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#fff7ed", bloomColor: "rgba(234, 88, 12, 0.8)", glitch: true, burst: ["#f97316", "#ea580c", "#ffffff"] },
  "early_bird_LEGENDARY": { customBg: "linear-gradient(to bottom right, #ea580c, #9a3412)", customShadow: "0 10px 15px -3px rgba(249, 115, 22, 0.4)", customBorder: "4px solid #fed7aa", iconColorHex: "#fff7ed", bloomColor: "rgba(194, 65, 12, 0.9)", glitch: true, burst: ["#ea580c", "#c2410c", "#ffedd5", "#ffffff"] },

  // Comeback Kid (Indigo)
  "comeback_kid_BASE": { customBg: "linear-gradient(to bottom right, #818cf8, #4f46e5)", customShadow: "0 10px 15px -3px rgba(99, 102, 241, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(99, 102, 241, 0.6)", glitch: false, burst: ["#818cf8", "#6366f1", "#4f46e5"] },
  "comeback_kid_SUPER": { customBg: "linear-gradient(to bottom right, #6366f1, #4338ca)", customShadow: "0 10px 15px -3px rgba(99, 102, 241, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#eef2ff", bloomColor: "rgba(79, 70, 229, 0.8)", glitch: true, burst: ["#6366f1", "#4f46e5", "#ffffff"] },
  "comeback_kid_LEGENDARY": { customBg: "linear-gradient(to bottom right, #4f46e5, #3730a3)", customShadow: "0 10px 15px -3px rgba(99, 102, 241, 0.4)", customBorder: "4px solid #c7d2fe", iconColorHex: "#eef2ff", bloomColor: "rgba(67, 56, 202, 0.9)", glitch: true, burst: ["#4f46e5", "#4338ca", "#e0e7ff", "#ffffff"] },

  // Podium Finisher (Gold/Yellow)
  "podium_finisher_BASE": { customBg: "linear-gradient(to bottom right, #facc15, #ca8a04)", customShadow: "0 10px 15px -3px rgba(234, 179, 8, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(234, 179, 8, 0.6)", glitch: false, burst: ["#facc15", "#eab308", "#ca8a04"] },
  "podium_finisher_SUPER": { customBg: "linear-gradient(to bottom right, #eab308, #a16207)", customShadow: "0 10px 15px -3px rgba(234, 179, 8, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#fefce8", bloomColor: "rgba(202, 138, 4, 0.8)", glitch: true, burst: ["#eab308", "#ca8a04", "#ffffff"] },
  "podium_finisher_LEGENDARY": { customBg: "linear-gradient(to bottom right, #ca8a04, #854d0e)", customShadow: "0 10px 15px -3px rgba(234, 179, 8, 0.4)", customBorder: "4px solid #fef08a", iconColorHex: "#fefce8", bloomColor: "rgba(161, 98, 7, 0.9)", glitch: true, burst: ["#ca8a04", "#a16207", "#fef9c3", "#ffffff"] },

  // Sharpshooter (Pink)
  "sharpshooter_BASE": { customBg: "linear-gradient(to bottom right, #ec4899, #be185d)", customShadow: "0 10px 15px -3px rgba(236, 72, 153, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(236, 72, 153, 0.6)", glitch: false, burst: ["#f472b6", "#ec4899", "#db2777"] },
  "sharpshooter_SUPER": { customBg: "linear-gradient(to bottom right, #db2777, #9d174d)", customShadow: "0 10px 15px -3px rgba(236, 72, 153, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#fdf2f8", bloomColor: "rgba(219, 39, 119, 0.8)", glitch: true, burst: ["#ec4899", "#db2777", "#ffffff"] },
  "sharpshooter_LEGENDARY": { customBg: "linear-gradient(to bottom right, #be185d, #831843)", customShadow: "0 10px 15px -3px rgba(236, 72, 153, 0.4)", customBorder: "4px solid #fbcfe8", iconColorHex: "#fdf2f8", bloomColor: "rgba(190, 24, 93, 0.9)", glitch: true, burst: ["#db2777", "#be185d", "#fce7f3", "#ffffff"] },

  // Underdog (Fuchsia/Violet)
  "underdog_BASE": { customBg: "linear-gradient(to bottom right, #d946ef, #7c3aed)", customShadow: "0 10px 15px -3px rgba(217, 70, 239, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(217, 70, 239, 0.6)", glitch: false, burst: ["#e879f9", "#d946ef", "#c026d3"] },
  "underdog_SUPER": { customBg: "linear-gradient(to bottom right, #c026d3, #6d28d9)", customShadow: "0 10px 15px -3px rgba(217, 70, 239, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#fdf4ff", bloomColor: "rgba(192, 38, 211, 0.8)", glitch: true, burst: ["#d946ef", "#c026d3", "#ffffff"] },
  "underdog_LEGENDARY": { customBg: "linear-gradient(to bottom right, #a21caf, #5b21b6)", customShadow: "0 10px 15px -3px rgba(217, 70, 239, 0.4)", customBorder: "4px solid #f5d0fe", iconColorHex: "#fdf4ff", bloomColor: "rgba(162, 28, 175, 0.9)", glitch: true, burst: ["#c026d3", "#a21caf", "#fae8ff", "#ffffff"] },

  // Polymath (Teal)
  "polymath_BASE": { customBg: "linear-gradient(to bottom right, #2dd4bf, #0d9488)", customShadow: "0 10px 15px -3px rgba(20, 184, 166, 0.2)", customBorder: "none", iconColorHex: "#ffffff", bloomColor: "rgba(20, 184, 166, 0.6)", glitch: false, burst: ["#2dd4bf", "#14b8a6", "#0d9488"] },
  "polymath_SUPER": { customBg: "linear-gradient(to bottom right, #14b8a6, #0f766e)", customShadow: "0 10px 15px -3px rgba(20, 184, 166, 0.3)", customBorder: "2px solid rgba(255,255,255,0.7)", iconColorHex: "#f0fdfa", bloomColor: "rgba(13, 148, 136, 0.8)", glitch: true, burst: ["#14b8a6", "#0d9488", "#ffffff"] },
  "polymath_LEGENDARY": { customBg: "linear-gradient(to bottom right, #0d9488, #115e59)", customShadow: "0 10px 15px -3px rgba(20, 184, 166, 0.4)", customBorder: "4px solid #99f6e4", iconColorHex: "#f0fdfa", bloomColor: "rgba(15, 118, 110, 0.9)", glitch: true, burst: ["#0d9488", "#0f766e", "#ccfbf1", "#ffffff"] },
};

// Fallback Config just in case a badge is missing
const fallbackConfig: Record<string, any> = {
  BASE: { unlockedBg: "bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-500/20", iconColor: "text-white", bloomColor: "rgba(148, 163, 184, 0.6)", glitch: false, burst: ["#94a3b8", "#64748b", "#475569"] },
  SUPER: { unlockedBg: "bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-500/30 border-2 border-white", iconColor: "text-slate-50", bloomColor: "rgba(100, 116, 139, 0.8)", glitch: true, burst: ["#64748b", "#475569", "#ffffff"] },
  LEGENDARY: { unlockedBg: "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-500/40 border-4 border-slate-300", iconColor: "text-slate-50", bloomColor: "rgba(71, 85, 105, 0.9)", glitch: true, burst: ["#475569", "#334155", "#f1f5f9", "#ffffff"] }
};

export default function TrophyRoomPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"mock" | "dps">("mock");
  const [selectedBadge, setSelectedBadge] = useState<{ badge: any, config: any } | null>(null);

  useEffect(() => {
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
      } finally {
        setLoading(false);
      }
    }
    loadAchievements();
  }, []);

  if (loading) return <LoadingState />;

  // Group by tier
  const baseBadges = badges.filter(b => b.tier === "BASE");
  const superBadges = badges.filter(b => b.tier === "SUPER");
  const legendaryBadges = badges.filter(b => b.tier === "LEGENDARY");

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

      {activeTab === "mock" ? (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Base Tier Shelf */}
          <Shelf title="Base Badges" badges={baseBadges} tier="BASE" onSelectBadge={setSelectedBadge} />
          
          {/* Super Tier Shelf */}
          <Shelf title="Super Badges" badges={superBadges} tier="SUPER" onSelectBadge={setSelectedBadge} />
          
          {/* Legendary Tier Shelf */}
          <Shelf title="Legendary Badges" badges={legendaryBadges} tier="LEGENDARY" onSelectBadge={setSelectedBadge} />
        </div>
      ) : (
        <div className="text-center py-24 animate-in fade-in duration-500">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 mb-4">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">DPS Badges Coming Soon</h2>
          <p className="text-slate-500">Daily practice streak and mastery badges are currently being forged.</p>
        </div>
      )}
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
    LEGENDARY: "bg-yellow-50/50 dark:bg-yellow-900/10 border-yellow-100 dark:border-yellow-900/50"
  };

  const textStyles = {
    BASE: "text-slate-800 dark:text-slate-200",
    SUPER: "text-indigo-800 dark:text-indigo-300",
    LEGENDARY: "text-yellow-800 dark:text-yellow-300"
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
      "Library": { clipPath: "polygon(0% 0%, 100% 0%, 90% 50%, 100% 100%, 0% 100%, 10% 50%)", w: "w-20 md:w-24", h: "h-24 md:h-28" }
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
          boxShadow: isUnlocked ? (badge.tier === 'LEGENDARY' ? '0 30px 60px -12px rgba(234, 179, 8, 0.5)' : '0 25px 50px -12px rgba(0, 0, 0, 0.25)') : ''
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

        {/* Legendary Foil Sweep & Sparks */}
        {isUnlocked && badge.tier === "LEGENDARY" && (
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

        {/* The Badge Graphic (Clipped Polygon + Drop Shadow) */}
        <motion.div 
          className={`relative flex items-center justify-center mb-5 transition-all duration-300 ${shape.w} ${shape.h} z-20`} 
          style={{ 
            filter: isUnlocked ? `drop-shadow(0 0 25px ${config.bloomColor}) drop-shadow(0 15px 15px rgba(0,0,0,0.5))` : 'none',
            x: isUnlocked ? px : 0,
            y: isUnlocked ? py : 0,
            z: isUnlocked ? 40 : 0
          }}
        >
          {/* Clipped Background Geometry */}
          <div 
            className={`absolute inset-0 transition-all duration-500 ${!isUnlocked ? 'bg-slate-200 dark:bg-slate-800 shadow-[inset_0_4px_4px_rgba(0,0,0,0.1)]' : 'shadow-[inset_0_8px_16px_rgba(255,255,255,0.4)]'}`} 
            style={{ clipPath: shape.clipPath, ...(isUnlocked ? { background: config.customBg } : {}) }} 
          />

          {/* Icon with Chromatic Aberration/Glitch */}
          <Icon size={32} className={`relative z-10 ${!isUnlocked ? 'text-slate-400 dark:text-slate-600' : ''} transition-all duration-300`} style={{ 
            transform: isUnlocked ? 'scale(1.15) rotate(12deg)' : 'scale(1) rotate(0deg)',
            color: isUnlocked ? config.iconColorHex : undefined,
            filter: isUnlocked && config.glitch ? 'drop-shadow(-3px 0px 0px rgba(255,0,0,0.8)) drop-shadow(3px 0px 0px rgba(0,255,255,0.8))' : 'none'
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
