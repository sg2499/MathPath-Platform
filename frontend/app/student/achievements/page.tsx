"use client";

import React, { useState, useEffect } from "react";
import { Award, Target, Zap, Medal, Flame, Clock, TrendingUp, Trophy, Crown, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { LoadingState } from "@/components/common/LoadingState";

// Map our backend icon names to Lucide icons
const IconMap: Record<string, any> = {
  "Target": Target,
  "Zap": Zap,
  "Medal": Medal,
  "Flame": Flame,
  "Clock": Clock,
  "TrendingUp": TrendingUp,
  "Trophy": Trophy,
  "Crown": Crown,
};

export default function TrophyRoomPage() {
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<any[]>([]);

  useEffect(() => {
    async function loadAchievements() {
      try {
        const response = await api.get(`/student/achievements`);
        const data = response.data;
        if (data.achievements) {
          setBadges(data.achievements);
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
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-12">
      <div className="text-center max-w-2xl mx-auto mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 mb-6">
          <Award size={40} />
        </div>
        <h1 className="text-4xl font-black text-slate-900 dark:text-white mb-4">The Trophy Room</h1>
        <p className="text-lg text-slate-500">Complete challenges, maintain streaks, and dominate Mock Exams to unlock exclusive badges.</p>
      </div>

      {/* Legendary Tier Shelf */}
      <Shelf title="Legendary Badges" badges={legendaryBadges} tier="LEGENDARY" />
      
      {/* Super Tier Shelf */}
      <Shelf title="Super Badges" badges={superBadges} tier="SUPER" />
      
      {/* Base Tier Shelf */}
      <Shelf title="Base Badges" badges={baseBadges} tier="BASE" />
    </div>
  );
}

function Shelf({ title, badges, tier }: { title: string, badges: any[], tier: string }) {
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
          <BadgeCard key={b.id} badge={b} />
        ))}
      </div>
    </div>
  );
}

function BadgeCard({ badge }: { badge: any }) {
  const Icon = IconMap[badge.iconName] || Award;
  const isUnlocked = badge.isUnlocked;

  // Visual variants based on tier
  const tierConfig = {
    BASE: {
      unlockedBg: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/20",
      iconColor: "text-white",
      badgeText: "text-orange-600 dark:text-orange-400",
    },
    SUPER: {
      unlockedBg: "bg-gradient-to-br from-slate-300 to-slate-500 shadow-slate-500/30 border-2 border-white",
      iconColor: "text-white drop-shadow-md",
      badgeText: "text-slate-600 dark:text-slate-400",
    },
    LEGENDARY: {
      unlockedBg: "bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-600 shadow-yellow-500/40 border-4 border-yellow-200 animate-[pulse_3s_ease-in-out_infinite]",
      iconColor: "text-yellow-100 drop-shadow-lg",
      badgeText: "text-yellow-600 dark:text-yellow-500",
    }
  };

  const config = tierConfig[badge.tier as keyof typeof tierConfig] || tierConfig.BASE;

  // Progress logic
  const progressPercent = Math.min(100, Math.round((badge.currentProgress / badge.requiredCount) * 100));

  return (
    <div className="relative group flex flex-col items-center text-center p-4 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 transition-transform hover:-translate-y-1 hover:shadow-md">
      <div className={`w-20 h-20 md:w-24 md:h-24 rounded-full flex items-center justify-center mb-4 transition-all ${isUnlocked ? config.unlockedBg + ' shadow-lg' : 'bg-slate-100 dark:bg-slate-800 opacity-50 grayscale'}`}>
        {isUnlocked ? <Icon size={40} className={config.iconColor} /> : <Lock size={32} className="text-slate-400" />}
      </div>
      
      <h3 className={`font-black text-sm mb-1 line-clamp-1 ${isUnlocked ? config.badgeText : 'text-slate-400 dark:text-slate-600'}`}>
        {badge.name}
      </h3>
      
      <p className="text-[10px] md:text-xs text-slate-500 mb-3 h-8 line-clamp-2">
        {badge.description}
      </p>

      {!isUnlocked && badge.requiredCount > 1 && (
        <div className="w-full mt-auto">
          <div className="flex justify-between text-[9px] font-bold text-slate-400 mb-1">
            <span>Progress</span>
            <span>{badge.currentProgress} / {badge.requiredCount}</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div className="h-full bg-slate-400 rounded-full transition-all duration-1000" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}
      
      {isUnlocked && (
        <div className="w-full mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            Unlocked
          </p>
        </div>
      )}
    </div>
  );
}