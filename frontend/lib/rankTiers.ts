// The rank ladder, the same as backend economy_service.RANK_TIERS (keep the
// two in step). Used by the rank cut scene for "N XP to the next division".
export const RANK_TIERS: { tier: string; xp: number }[] = [
  { tier: "COPPER_V", xp: 0 },
  { tier: "COPPER_IV", xp: 500 },
  { tier: "COPPER_III", xp: 1100 },
  { tier: "COPPER_II", xp: 1800 },
  { tier: "COPPER_I", xp: 2600 },
  { tier: "BRONZE_V", xp: 3500 },
  { tier: "BRONZE_IV", xp: 4500 },
  { tier: "BRONZE_III", xp: 5600 },
  { tier: "BRONZE_II", xp: 6800 },
  { tier: "BRONZE_I", xp: 8100 },
  { tier: "SILVER_V", xp: 9500 },
  { tier: "SILVER_IV", xp: 11000 },
  { tier: "SILVER_III", xp: 12600 },
  { tier: "SILVER_II", xp: 14300 },
  { tier: "SILVER_I", xp: 16100 },
  { tier: "GOLD_V", xp: 18000 },
  { tier: "GOLD_IV", xp: 20000 },
  { tier: "GOLD_III", xp: 22100 },
  { tier: "GOLD_II", xp: 24300 },
  { tier: "GOLD_I", xp: 26600 },
  { tier: "PLATINUM_V", xp: 29000 },
  { tier: "PLATINUM_IV", xp: 31500 },
  { tier: "PLATINUM_III", xp: 34100 },
  { tier: "PLATINUM_II", xp: 36800 },
  { tier: "PLATINUM_I", xp: 39600 },
  { tier: "EMERALD_V", xp: 43000 },
  { tier: "EMERALD_IV", xp: 46600 },
  { tier: "EMERALD_III", xp: 50400 },
  { tier: "EMERALD_II", xp: 54400 },
  { tier: "EMERALD_I", xp: 58600 },
  { tier: "DIAMOND_III", xp: 65000 },
  { tier: "DIAMOND_II", xp: 72000 },
  { tier: "DIAMOND_I", xp: 80000 },
  { tier: "CHAMPION", xp: 100000 },
];

export type RankStep = { tier: string; start: number; next: string | null; nextXp: number | null };

// Where a tier begins and what comes after it. Unknown tiers read as Copper V.
export function RankStepFor(Tier: string): RankStep {
  const Index = Math.max(0, RANK_TIERS.findIndex((Row) => Row.tier === String(Tier || "").toUpperCase()));
  const Row = RANK_TIERS[Index];
  const Next = RANK_TIERS[Index + 1] ?? null;
  return { tier: Row.tier, start: Row.xp, next: Next ? Next.tier : null, nextXp: Next ? Next.xp : null };
}

// The tier a given XP total earns (the server's calculate_rank_from_xp).
export function RankTierForXp(Xp: number): string {
  let Tier = RANK_TIERS[0].tier;
  for (const Row of RANK_TIERS) if (Xp >= Row.xp) Tier = Row.tier;
  return Tier;
}
