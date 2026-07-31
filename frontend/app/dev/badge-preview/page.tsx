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

const LEVEL_MASTERY_BATCH4_PM: PreviewBadge[] = [
  { code: "level_mastery_pm_l1", tier: "BASE", name: "PM L1 -- Cleared", description: "Complete at least 12 Mock Exams within PM L1", iconName: "LevelMasteryPmL1Cleared" },
  { code: "level_mastery_pm_l1", tier: "SUPER", name: "PM L1 -- Mastered", description: "Complete at least 20 Mock Exams within PM L1, averaging 85% or higher", iconName: "LevelMasteryPmL1Mastered" },
  { code: "level_mastery_pm_l1", tier: "LEGENDARY", name: "PM L1 -- Perfected", description: "Complete at least 30 Mock Exams within PM L1, averaging 95% or higher", iconName: "LevelMasteryPmL1Perfected" },
  { code: "level_mastery_pm_l2", tier: "BASE", name: "PM L2 -- Cleared", description: "Complete at least 12 Mock Exams within PM L2", iconName: "LevelMasteryPmL2Cleared" },
  { code: "level_mastery_pm_l2", tier: "SUPER", name: "PM L2 -- Mastered", description: "Complete at least 20 Mock Exams within PM L2, averaging 85% or higher", iconName: "LevelMasteryPmL2Mastered" },
  { code: "level_mastery_pm_l2", tier: "LEGENDARY", name: "PM L2 -- Perfected", description: "Complete at least 30 Mock Exams within PM L2, averaging 95% or higher", iconName: "LevelMasteryPmL2Perfected" },
  { code: "level_mastery_pm_l3", tier: "BASE", name: "PM L3 -- Cleared", description: "Complete at least 12 Mock Exams within PM L3", iconName: "LevelMasteryPmL3Cleared" },
  { code: "level_mastery_pm_l3", tier: "SUPER", name: "PM L3 -- Mastered", description: "Complete at least 20 Mock Exams within PM L3, averaging 85% or higher", iconName: "LevelMasteryPmL3Mastered" },
  { code: "level_mastery_pm_l3", tier: "LEGENDARY", name: "PM L3 -- Perfected", description: "Complete at least 30 Mock Exams within PM L3, averaging 95% or higher", iconName: "LevelMasteryPmL3Perfected" },
  { code: "level_mastery_pm_l4", tier: "BASE", name: "PM L4 -- Cleared", description: "Complete at least 12 Mock Exams within PM L4", iconName: "LevelMasteryPmL4Cleared" },
  { code: "level_mastery_pm_l4", tier: "SUPER", name: "PM L4 -- Mastered", description: "Complete at least 20 Mock Exams within PM L4, averaging 85% or higher", iconName: "LevelMasteryPmL4Mastered" },
  { code: "level_mastery_pm_l4", tier: "LEGENDARY", name: "PM L4 -- Perfected", description: "Complete at least 30 Mock Exams within PM L4, averaging 95% or higher", iconName: "LevelMasteryPmL4Perfected" },
];


const LEVEL_MASTERY_BATCH5_IM: PreviewBadge[] = [
  { code: "im_l1_cleared", tier: "BASE", name: "L1 Cleared (IM)", description: "Cleared L1", iconName: "LevelMasteryImL1Cleared" },
  { code: "im_l1_mastered", tier: "SUPER", name: "L1 Mastered (IM)", description: "Mastered L1", iconName: "LevelMasteryImL1Mastered" },
  { code: "im_l1_perfected", tier: "LEGENDARY", name: "L1 Perfected (IM)", description: "Perfected L1", iconName: "LevelMasteryImL1Perfected" },
  { code: "im_l2_cleared", tier: "BASE", name: "L2 Cleared (IM)", description: "Cleared L2", iconName: "LevelMasteryImL2Cleared" },
  { code: "im_l2_mastered", tier: "SUPER", name: "L2 Mastered (IM)", description: "Mastered L2", iconName: "LevelMasteryImL2Mastered" },
  { code: "im_l2_perfected", tier: "LEGENDARY", name: "L2 Perfected (IM)", description: "Perfected L2", iconName: "LevelMasteryImL2Perfected" },
  { code: "im_l3_cleared", tier: "BASE", name: "L3 Cleared (IM)", description: "Cleared L3", iconName: "LevelMasteryImL3Cleared" },
  { code: "im_l3_mastered", tier: "SUPER", name: "L3 Mastered (IM)", description: "Mastered L3", iconName: "LevelMasteryImL3Mastered" },
  { code: "im_l3_perfected", tier: "LEGENDARY", name: "L3 Perfected (IM)", description: "Perfected L3", iconName: "LevelMasteryImL3Perfected" },
  { code: "im_l4_cleared", tier: "BASE", name: "L4 Cleared (IM)", description: "Cleared L4", iconName: "LevelMasteryImL4Cleared" },
  { code: "im_l4_mastered", tier: "SUPER", name: "L4 Mastered (IM)", description: "Mastered L4", iconName: "LevelMasteryImL4Mastered" },
  { code: "im_l4_perfected", tier: "LEGENDARY", name: "L4 Perfected (IM)", description: "Perfected L4", iconName: "LevelMasteryImL4Perfected" },
];


const DPS_BATCH_2: PreviewBadge[] = [
  // Family 3: The Boundless Tome (25 - 100 - 350 - 500)
  { code: "dps_tome", tier: "BASE", name: "The Leather Tome", description: "Complete 25 DPS sheets.", iconName: "DpsLeatherTome" },
  { code: "dps_tome", tier: "SUPER", name: "The Silver Tome", description: "Complete 100 DPS sheets.", iconName: "DpsSilverTome" },
  { code: "dps_tome", tier: "LEGENDARY", name: "The Astral Tome", description: "Complete 350 DPS sheets.", iconName: "DpsAstralTome" },
  { code: "dps_tome", tier: "MYTHIC", name: "The Boundless Tome", description: "Complete 500 DPS sheets.", iconName: "DpsBoundlessTome" },

  // Family 4: The Lightning Quill
  { code: "dps_quill", tier: "BASE", name: "The Bronze Quill", description: "Finish 5 DPS sheets in under 50% of the allocated time with >90% accuracy.", iconName: "DpsBronzeQuill" },
  { code: "dps_quill", tier: "SUPER", name: "The Silver Quill", description: "Achieve Lightning Quill on 25 DPS sheets.", iconName: "DpsSilverQuill" },
  { code: "dps_quill", tier: "LEGENDARY", name: "The Radiant Quill", description: "Achieve Lightning Quill on 75 DPS sheets.", iconName: "DpsRadiantQuill" },
  { code: "dps_quill", tier: "MYTHIC", name: "The Lightning Quill", description: "Achieve Lightning Quill on 150 DPS sheets.", iconName: "DpsLightningQuill" },
];

const DPS_BATCH_1: PreviewBadge[] = [
  // Family 1: The Ironclad Discipline
  { code: "dps_discipline", tier: "BASE", name: "The Ironclad Discipline", description: "Complete all 5 DPS sheets in a single week.", iconName: "DpsIronAnvil" },
  { code: "dps_discipline", tier: "SUPER", name: "Super Ironclad Discipline", description: "Complete all 5 DPS sheets for 4 consecutive weeks.", iconName: "DpsSteelAnvil" },
  { code: "dps_discipline", tier: "LEGENDARY", name: "Legendary Ironclad Discipline", description: "Complete all 5 DPS sheets for 12 consecutive weeks.", iconName: "DpsObsidianAnvil" },
  { code: "dps_discipline", tier: "MYTHIC", name: "Mythic Ironclad Discipline", description: "Complete all 5 DPS sheets for 36 consecutive weeks.", iconName: "DpsCelestialAnvil" },

  // Family 2: The Pure Crystal
  { code: "dps_crystal", tier: "BASE", name: "The Pure Crystal", description: "Score 100% on 5 different DPS sheets.", iconName: "DpsQuartzCrystal" },
  { code: "dps_crystal", tier: "SUPER", name: "Super Pure Crystal", description: "Score 100% on 25 different DPS sheets.", iconName: "DpsSapphireCrystal" },
  { code: "dps_crystal", tier: "LEGENDARY", name: "Legendary Pure Crystal", description: "Score 100% on 75 different DPS sheets.", iconName: "DpsRubyCrystal" },
  { code: "dps_crystal", tier: "MYTHIC", name: "Mythic Pure Crystal", description: "Score 100% on 200 different DPS sheets.", iconName: "DpsDiamondCrystal" },
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

const DPS_BATCH_3: PreviewBadge[] = [
  // Family 5: The Sage's Eye
  {
    code: "dps_sage",
    iconName: "DpsBronzeHourglass",
    name: "The Sage's Eye",
    description: "Use >95% of the allocated time and score exactly 100% accuracy on 5 DPS sheets.",
    tier: "BASE"
  },
  {
    code: "dps_sage",
    iconName: "DpsSilverHourglass",
    name: "The Sage's Eye",
    description: "Achieve Sage's Eye on 20 DPS sheets.",
    tier: "SUPER"
  },
  {
    code: "dps_sage",
    iconName: "DpsGoldenHourglass",
    name: "The Sage's Eye",
    description: "Achieve Sage's Eye on 50 DPS sheets.",
    tier: "LEGENDARY"
  },
  {
    code: "dps_sage",
    iconName: "DpsCelestialEye",
    name: "The Sage's Eye",
    description: "Achieve Sage's Eye on 100 DPS sheets.",
    tier: "MYTHIC"
  },
  
  // Family 6: The Unbroken Chain
  {
    code: "dps_chain",
    iconName: "DpsIronChain",
    name: "The Unbroken Chain",
    description: "Attempt 100% of the questions (zero unanswered) on 10 consecutive DPS sheets.",
    tier: "BASE"
  },
  {
    code: "dps_chain",
    iconName: "DpsSteelChain",
    name: "The Unbroken Chain",
    description: "Attempt 100% of the questions on 50 consecutive DPS sheets.",
    tier: "SUPER"
  },
  {
    code: "dps_chain",
    iconName: "DpsDiamondChain",
    name: "The Unbroken Chain",
    description: "Attempt 100% of the questions on 120 consecutive DPS sheets.",
    tier: "LEGENDARY"
  },
  {
    code: "dps_chain",
    iconName: "DpsUnbrokenMechanism",
    name: "The Unbroken Chain",
    description: "Attempt 100% of the questions on 250 consecutive DPS sheets.",
    tier: "MYTHIC"
  }
];


const DPS_BATCH_4: PreviewBadge[] = [
  {
    code: "dps_phoenix",
    tier: "BASE",
    name: "The Rising Phoenix",
    description: "Score <50% on a DPS, then score >90% on your very next DPS.",
    iconName: "DpsAshFeather"
  },
  {
    code: "dps_phoenix",
    tier: "SUPER",
    name: "The Rising Phoenix",
    description: "Achieve The Phoenix 5 times.",
    iconName: "DpsEmberWing"
  },
  {
    code: "dps_phoenix",
    tier: "LEGENDARY",
    name: "The Rising Phoenix",
    description: "Achieve The Phoenix 15 times.",
    iconName: "DpsGoldenPhoenix"
  },
  {
    code: "dps_phoenix",
    tier: "MYTHIC",
    name: "The Rising Phoenix",
    description: "Achieve The Phoenix 30 times.",
    iconName: "DpsSolarRebirth"
  },
  {
    code: "dps_anvil",
    tier: "BASE",
    name: "The Master's Anvil",
    description: "Fail a DPS attempt, but immediately use a retry and score 100%.",
    iconName: "DpsResilienceHammer"
  },
  {
    code: "dps_anvil",
    tier: "SUPER",
    name: "The Master's Anvil",
    description: "Achieve Master's Anvil 10 times.",
    iconName: "DpsResilienceAnvil"
  },
  {
    code: "dps_anvil",
    tier: "LEGENDARY",
    name: "The Master's Anvil",
    description: "Achieve Master's Anvil 30 times.",
    iconName: "DpsResilienceForge"
  },
  {
    code: "dps_anvil",
    tier: "MYTHIC",
    name: "The Master's Anvil",
    description: "Achieve Master's Anvil 60 times.",
    iconName: "DpsResilienceCore"
  },
];

const DPS_BATCH_5: PreviewBadge[] = [
  {
    code: "dps_midnight",
    tier: "BASE",
    name: "The Midnight Oil",
    description: "Complete 5 DPS sheets on a weekend (Saturday/Sunday).",
    iconName: "DpsMidnightLantern"
  },
  {
    code: "dps_midnight",
    tier: "SUPER",
    name: "The Midnight Oil",
    description: "Complete 25 DPS sheets on weekends.",
    iconName: "DpsMidnightStar"
  },
  {
    code: "dps_midnight",
    tier: "LEGENDARY",
    name: "The Midnight Oil",
    description: "Complete 75 DPS sheets on weekends.",
    iconName: "DpsMidnightMoon"
  },
  {
    code: "dps_midnight",
    tier: "MYTHIC",
    name: "The Midnight Oil",
    description: "Complete 150 DPS sheets on weekends.",
    iconName: "DpsMidnightGalaxy"
  },
  {
    code: "dps_compass",
    tier: "BASE",
    name: "The Golden Compass",
    description: "Score >90% on the very first attempt (no retries) for 10 DPS sheets.",
    iconName: "DpsCompassBronze"
  },
  {
    code: "dps_compass",
    tier: "SUPER",
    name: "The Golden Compass",
    description: "Score >90% on the very first attempt for 40 DPS sheets.",
    iconName: "DpsCompassSilver"
  },
  {
    code: "dps_compass",
    tier: "LEGENDARY",
    name: "The Golden Compass",
    description: "Score >90% on the very first attempt for 100 DPS sheets.",
    iconName: "DpsCompassGold"
  },
  {
    code: "dps_compass",
    tier: "MYTHIC",
    name: "The Golden Compass",
    description: "Score >90% on the very first attempt for 250 DPS sheets.",
    iconName: "DpsCompassAstral"
  },
];


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
      <Section title="Phase 3 -- Level Mastery, batch 4: PM-L1/L2/L3/L4 (12 badges)" badges={LEVEL_MASTERY_BATCH4_PM} onOpen={setSelected} />
      <Section title="Phase 3 -- Level Mastery, batch 5: IM-L1/L2/L3/L4 (12 badges)" badges={LEVEL_MASTERY_BATCH5_IM} onOpen={setSelected} />
      <Section title="Phase 5 -- DPS Batch 2 (Boundless Tome & Lightning Quill - 8 badges)" badges={DPS_BATCH_2} onOpen={setSelected} />
      <Section title="Phase 6 -- DPS Batch 3 (Sage's Eye & Unbroken Chain - 8 badges)" badges={DPS_BATCH_3} onOpen={setSelected} />
      <Section title="Phase 4 -- DPS Batch 1 (Ironclad Discipline & Pure Crystal - 8 badges)" badges={DPS_BATCH_1} onOpen={setSelected} />

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
          <Section title="Phase 7 -- DPS Batch 4 (Rising Phoenix & Master's Anvil - 8 badges)" badges={DPS_BATCH_4} onOpen={setSelected} />
          <Section title="Phase 8 -- DPS Batch 5 (Midnight Oil & Golden Compass - 8 badges)" badges={DPS_BATCH_5} onOpen={setSelected} />
      </main>
  );
}
