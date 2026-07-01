"use client";

import React, { useState, useEffect } from "react";
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

export default function TrophyRoomPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [badges, setBadges] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"mock" | "dps">("mock");

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
          <Shelf title="Base Badges" badges={baseBadges} tier="BASE" />
          
          {/* Super Tier Shelf */}
          <Shelf title="Super Badges" badges={superBadges} tier="SUPER" />
          
          {/* Legendary Tier Shelf */}
          <Shelf title="Legendary Badges" badges={legendaryBadges} tier="LEGENDARY" />
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
    </AppShell>
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
  const Icon = IconMap[badge.iconName] || Target;
  const isUnlocked = badge.isUnlocked;

  // Track mouse for AAA 3D physics and Parallax
  const [physics, setPhysics] = useState({ rx: 0, ry: 0, px: 0, py: 0, gx: 50, gy: 50, opacity: 0 });
  const cardRef = React.useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isUnlocked || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Rotate (Max 25deg)
    const ry = ((x / rect.width) - 0.5) * 50; 
    const rx = ((0.5 - (y / rect.height))) * 50; 
    
    // Parallax (Max 20px opposite direction)
    const px = ((x / rect.width) - 0.5) * -40;
    const py = ((y / rect.height) - 0.5) * -40;

    // Glare % (0 to 100)
    const gx = (x / rect.width) * 100;
    const gy = (y / rect.height) * 100;
    
    setPhysics({ rx, ry, px, py, gx, gy, opacity: 1 });
  };

  const handleMouseLeave = () => {
    if (!isUnlocked) return;
    setPhysics({ rx: 0, ry: 0, px: 0, py: 0, gx: 50, gy: 50, opacity: 0 });
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isUnlocked) return;
    
    // Determine colors based on tier
    let burstColors = ["#f97316", "#f59e0b", "#fbbf24"]; // Base (Orange/Amber)
    if (badge.tier === "SUPER") burstColors = ["#94a3b8", "#cbd5e1", "#ffffff"]; // Super (Silver/White)
    if (badge.tier === "LEGENDARY") burstColors = ["#eab308", "#facc15", "#c084fc", "#ffffff"]; // Legendary (Gold/Purple)

    const x = e.clientX / window.innerWidth;
    const y = e.clientY / window.innerHeight;
    
    triggerMicroBurst(x, y, burstColors);
  };

  // Visual variants based on tier
  const tierConfig = {
    BASE: {
      unlockedBg: "bg-gradient-to-br from-amber-400 to-orange-500 shadow-orange-500/20",
      iconColor: "text-white",
      badgeText: "text-orange-600 dark:text-orange-400",
      bloomColor: "rgba(251, 146, 60, 0.6)",
      glitch: false,
    },
    SUPER: {
      unlockedBg: "bg-gradient-to-br from-slate-300 to-slate-500 shadow-slate-500/30 border-2 border-white",
      iconColor: "text-white",
      badgeText: "text-slate-600 dark:text-slate-400",
      bloomColor: "rgba(255, 255, 255, 0.8)",
      glitch: true,
    },
    LEGENDARY: {
      unlockedBg: "bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-600 shadow-yellow-500/40 border-4 border-yellow-200",
      iconColor: "text-yellow-50",
      badgeText: "text-yellow-600 dark:text-yellow-500",
      bloomColor: "rgba(253, 224, 71, 0.9)",
      glitch: true,
    }
  };

  const config = tierConfig[badge.tier as keyof typeof tierConfig] || tierConfig.BASE;
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
    <div 
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      className={`relative group [perspective:1000px] h-full ${isUnlocked ? 'cursor-pointer' : 'opacity-60 grayscale'}`}
    >
      <div 
        className={`relative flex flex-col items-center text-center p-5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 h-full transition-transform duration-200 ease-out transform-gpu overflow-hidden`}
        style={{
          transform: isUnlocked && physics.opacity > 0 ? `rotateX(${physics.rx}deg) rotateY(${physics.ry}deg) scale(1.05)` : 'rotateX(0deg) rotateY(0deg) scale(1)',
          boxShadow: isUnlocked && physics.opacity > 0 ? (badge.tier === 'LEGENDARY' ? '0 30px 60px -12px rgba(234, 179, 8, 0.5)' : '0 25px 50px -12px rgba(0, 0, 0, 0.25)') : ''
        }}
      >
        
        {/* AAA Sci-Fi Light Sweep (Hard Sheen) */}
        {isUnlocked && (
          <div 
            className="absolute inset-0 pointer-events-none z-10 transition-opacity duration-300 mix-blend-overlay"
            style={{
              background: `linear-gradient(105deg, transparent ${physics.gx - 25}%, rgba(255,255,255,1) ${physics.gx}%, transparent ${physics.gx + 25}%)`,
              opacity: physics.opacity
            }}
          />
        )}

        {/* Legendary Conic Sweep & High-Velocity Sparks */}
        {isUnlocked && badge.tier === "LEGENDARY" && (
           <>
             <div className="absolute inset-[-100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg,transparent_0_180deg,rgba(234,179,8,0.3)_360deg)] z-0 pointer-events-none mix-blend-color-dodge" />
             <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
                {[...Array(8)].map((_, i) => (
                   <div key={i} className={`absolute w-8 h-[1px] bg-white rounded-full animate-pulse rotate-45 blur-[0.5px] shadow-[0_0_5px_rgba(255,255,255,1)]`} style={{ top: `${10 + Math.random()*80}%`, left: `${10 + Math.random()*80}%`, animationDuration: `${0.2+Math.random()*0.5}s`, animationDelay: `${Math.random()*1}s` }} />
                ))}
             </div>
           </>
        )}

        {/* The Badge Graphic (Clipped Polygon + Drop Shadow) */}
        <div 
          className={`relative flex items-center justify-center mb-5 transition-all duration-300 ${shape.w} ${shape.h} z-20`} 
          style={{ 
            filter: isUnlocked && physics.opacity > 0 ? `drop-shadow(0 0 25px ${config.bloomColor}) drop-shadow(0 15px 15px rgba(0,0,0,0.5))` : (isUnlocked ? 'drop-shadow(0 4px 6px rgba(0,0,0,0.15))' : 'none'),
            transform: isUnlocked && physics.opacity > 0 ? `scale(1.1) translateZ(40px) translateX(${physics.px}px) translateY(${physics.py}px)` : 'scale(1) translateZ(0) translateX(0) translateY(0)' 
          }}
        >
          {/* Clipped Background Geometry */}
          <div 
            className={`absolute inset-0 transition-all duration-500 ${config.unlockedBg}`} 
            style={{ clipPath: shape.clipPath }} 
          />

          {/* HDR Bloom Under-layer (Legendary) */}
          {isUnlocked && badge.tier === "LEGENDARY" && physics.opacity > 0 && (
             <Icon size={40} className={`absolute z-0 text-yellow-300 transition-all duration-300 blur-md`} style={{ transform: `scale(1.2) rotate(12deg)` }} />
          )}

          {/* Icon with Chromatic Aberration/Glitch */}
          <Icon size={32} className={`relative z-10 ${config.iconColor} transition-all duration-300`} style={{ 
            transform: isUnlocked && physics.opacity > 0 ? 'scale(1.15) rotate(12deg)' : 'scale(1) rotate(0deg)',
            filter: isUnlocked && config.glitch && physics.opacity > 0 ? 'drop-shadow(-3px 0px 0px rgba(255,0,0,0.8)) drop-shadow(3px 0px 0px rgba(0,255,255,0.8))' : 'none'
          }} />
        </div>
        
        <h3 className={`relative font-black text-sm mb-2 z-20 ${isUnlocked ? config.badgeText : 'text-slate-400 dark:text-slate-600'}`} style={{ transform: isUnlocked && physics.opacity > 0 ? 'translateZ(20px)' : 'translateZ(0)' }}>
          {badge.name}
        </h3>
        
        <p className="relative text-[10px] md:text-xs text-slate-500 mb-4 min-h-[2.5rem] flex-grow z-20">
          {badge.description}
        </p>

        {!isUnlocked && badge.requiredCount > 1 && (
          <div className="w-full mt-auto z-20">
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
          <div className="relative w-full mt-auto pt-2 border-t border-slate-100 dark:border-slate-800 z-20">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
              Unlocked
            </p>
          </div>
        )}
      </div>
    </div>
  );
}