// Shared badge visual config -- extracted 2026-07-25 from
// app/student/achievements/page.tsx so the mock-result page's new in-moment
// badge reveal (Round 1 gamification fix) can render badges with the exact
// same colors/icons/glow as the Trophy Room, instead of duplicating (and
// risking drift from) a second copy of this table. Achievements page now
// imports from here too -- this file is the single source of truth for how
// a badge's code+tier maps to its visual identity.
import {
  Target, Focus, Scan, Zap, FastForward, Rocket,
  Medal, Flag, Crown, Flame, Activity, Infinity as InfinityIcon,
  Clock, Sun, AlarmClock, TrendingUp, ArrowUpRight, ChevronsUp,
  Trophy, Star, Sparkles, Crosshair, Aperture, Radar,
  Shield, Anchor, Mountain, Brain, Lightbulb, Library,
} from "lucide-react";

// Map our backend icon names to Lucide icons
export const BadgeIconMap: Record<string, any> = {
  Target, Focus, Scan,
  Zap, FastForward, Rocket,
  Medal, Flag, Crown,
  Flame, Activity, Infinity: InfinityIcon,
  Clock, Sun, AlarmClock,
  TrendingUp, ArrowUpRight, ChevronsUp,
  Trophy, Star, Sparkles,
  Crosshair, Aperture, Radar,
  Shield, Anchor, Mountain,
  Brain, Lightbulb, Library,
};

// 30 Unique Colors based on Badge Code and Tier (Distinct Spectrum)
export const badgeColorConfig: Record<string, any> = {
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
export const fallbackBadgeConfig: Record<string, any> = {
  BASE: { unlockedBg: "bg-gradient-to-br from-slate-400 to-slate-600 shadow-slate-500/20", iconColor: "text-white", bloomColor: "rgba(148, 163, 184, 0.6)", glitch: false, burst: ["#94a3b8", "#64748b", "#475569"] },
  SUPER: { unlockedBg: "bg-gradient-to-br from-slate-500 to-slate-700 shadow-slate-500/30 border-2 border-white", iconColor: "text-slate-50", bloomColor: "rgba(100, 116, 139, 0.8)", glitch: true, burst: ["#64748b", "#475569", "#ffffff"] },
  LEGENDARY: { unlockedBg: "bg-gradient-to-br from-slate-600 to-slate-800 shadow-slate-500/40 border-4 border-slate-300", iconColor: "text-slate-50", bloomColor: "rgba(71, 85, 105, 0.9)", glitch: true, burst: ["#475569", "#334155", "#f1f5f9", "#ffffff"] },
};

export function getBadgeVisualConfig(code: string | undefined, tier: string | undefined) {
  const configKey = code ? `${code}_${tier}` : "";
  return (
    badgeColorConfig[configKey] ||
    fallbackBadgeConfig[tier as keyof typeof fallbackBadgeConfig] ||
    fallbackBadgeConfig.BASE
  );
}
