"use client";

// TEMPORARY, DEV-ONLY PREVIEW HARNESS -- rebuilt 2026-07-28 to review Phase 1
// (10 new MYTHIC-tier badges) and Phase 2 (20 brand-new badges across 5 new
// families) before pushing, the same way the reference batch was reviewed
// before it shipped. Deliberately unauthenticated (no login needed) and
// force-renders every badge as "unlocked" regardless of real StudentBadge
// data, since no test account has (or realistically ever will, especially
// for MYTHIC thresholds) actually earned most of these.
//
// DELETE THIS ROUTE before/alongside merging once review is done -- same
// discipline as every prior preview harness in this project.

import React, { useState } from "react";
import { BadgeInspectionModal } from "@/components/gamification/BadgeInspectionModal";
import { BadgeIconMap, getBadgeVisualConfig } from "@/lib/gamification/badgeVisuals";

type PreviewBadge = {
  code: string;
  tier: "BASE" | "SUPER" | "LEGENDARY" | "MYTHIC";
  name: string;
  description: string;
  iconName: string;
};

// Verbatim from backend/app/services/achievements.py's seed_badges() --
// copy-checked against that file, not retyped from memory.
const PHASE1_MYTHIC: PreviewBadge[] = [
  { code: "perfectionist", tier: "MYTHIC", name: "Mythic Perfectionist", description: "Score 100% on 25 Mock Exams", iconName: "PerfectionistGemMythic" },
  { code: "speed_demon", tier: "MYTHIC", name: "Mythic Speed Demon", description: "Achieve Speed Demon 40 times", iconName: "SpeedCometMythic" },
  { code: "competitor", tier: "MYTHIC", name: "Mythic Competitor", description: "Complete 150 Mock Exams", iconName: "CrownMythic" },
  { code: "unstoppable_streak", tier: "MYTHIC", name: "Mythic Streak", description: "Score > 90% on 25 consecutive Mock Exams", iconName: "InfinityMythic" },
  { code: "early_bird", tier: "MYTHIC", name: "Mythic Early Bird", description: "Submit early 30 times", iconName: "DawnBreakMythic" },
  { code: "comeback_kid", tier: "MYTHIC", name: "Mythic Comeback Kid", description: "Achieve 12 comeback improvements", iconName: "PhoenixSurgeMythic" },
  { code: "podium_finisher", tier: "MYTHIC", name: "The Immortal", description: "Rank 1st Place on 15 Mock Exams", iconName: "LaurelCrownMythic" },
  { code: "sharpshooter", tier: "MYTHIC", name: "Mythic Sharpshooter", description: "Achieve Sharpshooter 25 times", iconName: "PrecisionCoreMythic" },
  { code: "underdog", tier: "MYTHIC", name: "Mythic Underdog", description: "Achieve Underdog 12 times", iconName: "SummitMythic" },
  { code: "polymath", tier: "MYTHIC", name: "Mythic Achiever", description: "Score > 80% on 75 Mock Exams", iconName: "OracleMythic" },
];

const PHASE2_NEW: PreviewBadge[] = [
  { code: "marathoner", tier: "BASE", name: "Marathoner", description: "Spend 3 hours total completing Mock Exams", iconName: "MarathonTrail" },
  { code: "marathoner", tier: "SUPER", name: "Super Marathoner", description: "Spend 10 hours total completing Mock Exams", iconName: "MarathonSurge" },
  { code: "marathoner", tier: "LEGENDARY", name: "Legendary Marathoner", description: "Spend 25 hours total completing Mock Exams", iconName: "MarathonHorizon" },
  { code: "marathoner", tier: "MYTHIC", name: "Mythic Marathoner", description: "Spend 60 hours total completing Mock Exams", iconName: "MarathonEternal" },

  { code: "iron_wall", tier: "BASE", name: "Iron Wall", description: "Never score below 60% across 5 straight Mock Exams", iconName: "IronWallBrick" },
  { code: "iron_wall", tier: "SUPER", name: "Super Iron Wall", description: "Never score below 70% across 10 straight Mock Exams", iconName: "IronWallBastion" },
  { code: "iron_wall", tier: "LEGENDARY", name: "Legendary Iron Wall", description: "Never score below 75% across 20 straight Mock Exams", iconName: "IronWallRampart" },
  { code: "iron_wall", tier: "MYTHIC", name: "Mythic Iron Wall", description: "Never score below 80% across 40 straight Mock Exams", iconName: "IronWallCitadel" },

  { code: "veteran", tier: "BASE", name: "The Veteran", description: "Answer 250 questions across all Mock Exams", iconName: "VeteranChevron" },
  { code: "veteran", tier: "SUPER", name: "Super Veteran", description: "Answer 1,000 questions across all Mock Exams", iconName: "VeteranMedallion" },
  { code: "veteran", tier: "LEGENDARY", name: "Legendary Veteran", description: "Answer 3,000 questions across all Mock Exams", iconName: "VeteranStandard" },
  { code: "veteran", tier: "MYTHIC", name: "Mythic Veteran", description: "Answer 7,500 questions across all Mock Exams", iconName: "VeteranLegacy" },

  { code: "last_minute_hero", tier: "BASE", name: "Last-Minute Hero", description: "Submit in the final 10% of the assignment window and score 80%+", iconName: "LastMinuteSpark" },
  { code: "last_minute_hero", tier: "SUPER", name: "Super Last-Minute Hero", description: "Achieve Last-Minute Hero 5 times", iconName: "LastMinuteFlash" },
  { code: "last_minute_hero", tier: "LEGENDARY", name: "Legendary Last-Minute Hero", description: "Achieve Last-Minute Hero 15 times", iconName: "LastMinuteBlaze" },
  { code: "last_minute_hero", tier: "MYTHIC", name: "Mythic Last-Minute Hero", description: "Achieve Last-Minute Hero 30 times", iconName: "LastMinuteEclipse" },

  { code: "section_specialist", tier: "BASE", name: "Section Specialist", description: "Score 100% on one full concept/section within a Mock Exam, 3 times", iconName: "SectionSpecialistNode" },
  { code: "section_specialist", tier: "SUPER", name: "Super Section Specialist", description: "Achieve Section Specialist 10 times", iconName: "SectionSpecialistGrid" },
  { code: "section_specialist", tier: "LEGENDARY", name: "Legendary Section Specialist", description: "Achieve Section Specialist 25 times", iconName: "SectionSpecialistMatrix" },
  { code: "section_specialist", tier: "MYTHIC", name: "Mythic Section Specialist", description: "Achieve Section Specialist 50 times", iconName: "SectionSpecialistNexus" },
];

// PHASE 3 (2026-07-29) -- Level Mastery, built in small batches per
// Shailesh's request (review each batch live before starting the next).
// Verbatim from seed_badges()'s dynamic Level Mastery derivation for BM-L1
// (level_code "BM-L1" -> key "bm_l1" -> code "level_mastery_bm_l1").
const LEVEL_MASTERY_BATCH1_BM: PreviewBadge[] = [
  { code: "level_mastery_bm_l1", tier: "BASE", name: "BM L1 -- Cleared", description: "Complete at least 12 Mock Exams within BM L1", iconName: "LevelMasteryBmL1Cleared" },
  { code: "level_mastery_bm_l1", tier: "SUPER", name: "BM L1 -- Mastered", description: "Complete at least 20 Mock Exams within BM L1, averaging 85% or higher", iconName: "LevelMasteryBmL1Mastered" },
  { code: "level_mastery_bm_l1", tier: "LEGENDARY", name: "BM L1 -- Perfected", description: "Complete at least 30 Mock Exams within BM L1, averaging 95% or higher (or score 100% on at least one)", iconName: "LevelMasteryBmL1Perfected" },
];

// Batch 2 -- verbatim from seed_badges()'s dynamic Level Mastery derivation
// for MM-L1 (level_code "MM-L1" -> key "mm_l1" -> code "level_mastery_mm_l1").
const LEVEL_MASTERY_BATCH2_MM: PreviewBadge[] = [
  { code: "level_mastery_mm_l1", tier: "BASE", name: "MM L1 -- Cleared", description: "Complete at least 12 Mock Exams within MM L1", iconName: "LevelMasteryMmL1Cleared" },
  { code: "level_mastery_mm_l1", tier: "SUPER", name: "MM L1 -- Mastered", description: "Complete at least 20 Mock Exams within MM L1, averaging 85% or higher", iconName: "LevelMasteryMmL1Mastered" },
  { code: "level_mastery_mm_l1", tier: "LEGENDARY", name: "MM L1 -- Perfected", description: "Complete at least 30 Mock Exams within MM L1, averaging 95% or higher (or score 100% on at least one)", iconName: "LevelMasteryMmL1Perfected" },
];

// Batch 3 -- verbatim from seed_badges()'s dynamic Level Mastery derivation
// for YLM-L1/L2/L3.
const LEVEL_MASTERY_BATCH3_YLM: PreviewBadge[] = [
  { code: "level_mastery_ylm_l1", tier: "BASE", name: "YLM L1 -- Cleared", description: "Complete at least 12 Mock Exams within YLM L1", iconName: "LevelMasteryYlmL1Cleared" },
  { code: "level_mastery_ylm_l1", tier: "SUPER", name: "YLM L1 -- Mastered", description: "Complete at least 20 Mock Exams within YLM L1, averaging 85% or higher", iconName: "LevelMasteryYlmL1Mastered" },
  { code: "level_mastery_ylm_l1", tier: "LEGENDARY", name: "YLM L1 -- Perfected", description: "Complete at least 30 Mock Exams within YLM L1, averaging 95% or higher (or score 100% on at least one)", iconName: "LevelMasteryYlmL1Perfected" },
  { code: "level_mastery_ylm_l2", tier: "BASE", name: "YLM L2 -- Cleared", description: "Complete at least 12 Mock Exams within YLM L2", iconName: "LevelMasteryYlmL2Cleared" },
  { code: "level_mastery_ylm_l2", tier: "SUPER", name: "YLM L2 -- Mastered", description: "Complete at least 20 Mock Exams within YLM L2, averaging 85% or higher", iconName: "LevelMasteryYlmL2Mastered" },
  { code: "level_mastery_ylm_l2", tier: "LEGENDARY", name: "YLM L2 -- Perfected", description: "Complete at least 30 Mock Exams within YLM L2, averaging 95% or higher (or score 100% on at least one)", iconName: "LevelMasteryYlmL2Perfected" },
  { code: "level_mastery_ylm_l3", tier: "BASE", name: "YLM L3 -- Cleared", description: "Complete at least 12 Mock Exams within YLM L3", iconName: "LevelMasteryYlmL3Cleared" },
  { code: "level_mastery_ylm_l3", tier: "SUPER", name: "YLM L3 -- Mastered", description: "Complete at least 20 Mock Exams within YLM L3, averaging 85% or higher", iconName: "LevelMasteryYlmL3Mastered" },
  { code: "level_mastery_ylm_l3", tier: "LEGENDARY", name: "YLM L3 -- Perfected", description: "Complete at least 30 Mock Exams within YLM L3, averaging 95% or higher (or score 100% on at least one)", iconName: "LevelMasteryYlmL3Perfected" },
];

const TIER_CHIP_STYLE: Record<string, string> = {
  BASE: "bg-slate-700 text-slate-200",
  SUPER: "bg-indigo-700 text-indigo-100",
  LEGENDARY: "bg-yellow-600 text-yellow-50",
  MYTHIC: "bg-fuchsia-700 text-fuchsia-50",
};

function PreviewCard({ badge, onOpen }: { badge: PreviewBadge; onOpen: () => void }) {
  const Icon = (BadgeIconMap[badge.iconName]) as any;
  const config = getBadgeVisualConfig(badge.code, badge.tier);
  return (
    <button
      onClick={onOpen}
      className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 text-left transition hover:border-slate-600 hover:bg-slate-900"
    >
      <div
        className="flex h-16 w-16 items-center justify-center rounded-xl"
        style={{ background: config.customBg, boxShadow: `0 0 20px ${config.bloomColor}` }}
      >
        {Icon ? <Icon size={32} style={{ color: config.iconColorHex }} /> : <span className="text-xs text-white">?</span>}
      </div>
      <div className="flex flex-col items-center gap-1 text-center">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${TIER_CHIP_STYLE[badge.tier]}`}>
          {badge.tier}
        </span>
        <span className="text-sm font-bold text-white">{badge.name}</span>
        <span className="text-[11px] text-slate-400">{badge.description}</span>
        <span className="mt-1 text-[10px] text-slate-600">{badge.iconName}</span>
      </div>
    </button>
  );
}

function Section({ title, badges, onOpen }: { title: string; badges: PreviewBadge[]; onOpen: (b: PreviewBadge) => void }) {
  return (
    <div className="mb-10">
      <h2 className="mb-4 text-lg font-black text-white">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-5">
        {badges.map((b) => (
          <PreviewCard key={`${b.code}_${b.tier}`} badge={b} onOpen={() => onOpen(b)} />
        ))}
      </div>
    </div>
  );
}

export default function BadgePreviewPage() {
  const [selected, setSelected] = useState<PreviewBadge | null>(null);

  return (
    <main className="min-h-screen bg-slate-950 p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-white">Badge Preview -- Phase 1 + Phase 2 + Phase 3 (dev-only, pre-push review)</h1>
        <p className="text-sm text-slate-400">
          Every card here is forced "unlocked" so its full cinematic can be opened regardless of real StudentBadge data.
          Click any card to open the same BadgeInspectionModal the Trophy Room uses.
        </p>
      </div>

      <Section title="Phase 1 -- MYTHIC tier, existing 10 families (10 badges)" badges={PHASE1_MYTHIC} onOpen={setSelected} />
      <Section title="Phase 2 -- 5 new families, all 4 tiers (20 badges)" badges={PHASE2_NEW} onOpen={setSelected} />
      <Section title="Phase 3 -- Level Mastery, batch 1: BM-L1 (3 badges)" badges={LEVEL_MASTERY_BATCH1_BM} onOpen={setSelected} />
      <Section title="Phase 3 -- Level Mastery, batch 2: MM-L1 (3 badges)" badges={LEVEL_MASTERY_BATCH2_MM} onOpen={setSelected} />
      <Section title="Phase 3 -- Level Mastery, batch 3: YLM-L1/L2/L3 (9 badges)" badges={LEVEL_MASTERY_BATCH3_YLM} onOpen={setSelected} />

      {selected && (
        <BadgeInspectionModal
          badge={{
            code: selected.code,
            tier: selected.tier,
            name: selected.name,
            description: selected.description,
            iconName: selected.iconName,
          }}
          config={getBadgeVisualConfig(selected.code, selected.tier)}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
