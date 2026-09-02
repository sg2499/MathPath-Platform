import { z } from "zod";
import { LeaderboardEntrySchema, ModuleSchema, LevelSchema } from "./leaderboard";

// DPS leaderboard entry -- everything the mock-exam LeaderboardEntrySchema
// has, plus sheetsCompleted (how many DPS sheets contributed to this row's
// pooled score/accuracy) and punctualityPercent, which the mock-exam
// entries don't carry (mock exams aren't scheduled day-by-day).
// punctualityPercent is null (not 0) when this student has no scheduled
// DPS sheets at all in this scope -- see leaderboard_service.py's
// _process_dps_results -- so the UI can show a dash instead of a
// misleading 0%.
export const DpsLeaderboardEntrySchema = LeaderboardEntrySchema.extend({
  sheetsCompleted: z.number().optional(),
  punctualityPercent: z.number().nullable().optional(),
});

// DPS hierarchy has no third tier equivalent to "exams" -- practice sheets
// are assigned platform-wide by curriculum, not per-student, so there is no
// per-student "assigned DPS list" to enumerate the way mock exams are
// enumerated. Just modules + levels.
export const DpsHierarchyResponseSchema = z.object({
  modules: z.array(ModuleSchema),
  levels: z.array(LevelSchema),
  currentModuleId: z.string().nullable(),
  currentLevelId: z.string().nullable(),
});

export const DpsLeaderboardResponseSchema = z.object({
  leaderboard: z.array(DpsLeaderboardEntrySchema),
  currentStudentRank: z.number().nullable().optional(),
  currentStudentEntry: DpsLeaderboardEntrySchema.nullable().optional(),
  totalParticipants: z.number(),
});

export type DpsLeaderboardEntry = z.infer<typeof DpsLeaderboardEntrySchema>;
export type DpsHierarchyResponse = z.infer<typeof DpsHierarchyResponseSchema>;
export type DpsLeaderboardResponse = z.infer<typeof DpsLeaderboardResponseSchema>;
