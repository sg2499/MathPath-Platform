import { z } from "zod";
import { BadgeSchema, ModuleSchema, LevelSchema, ExamSchema } from "./leaderboard";

// Teacher-facing leaderboard schemas (2026-09-01) -- distinct from the
// student-facing LeaderboardEntrySchema in ./leaderboard.ts because the
// teacher endpoints (routes_teacher.py) return `isOwnStudent` instead of
// `isCurrent`/`currentStudentRank`/`currentStudentEntry`: a teacher shows
// the SAME full leaderboard every student sees (Shailesh's explicit call),
// with their own students flagged rather than a single "current student".

export const TeacherLeaderboardEntrySchema = z.object({
  rank: z.number(),
  studentId: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable().optional(),
  percentage: z.number(),
  score: z.number(),
  accuracy: z.number(),
  timeTakenSeconds: z.number(),
  sheetsCompleted: z.number().optional(),
  // DPS-only (mock-exam teacher entries never populate this). null (not 0)
  // when this student has no scheduled DPS sheets in this scope -- see
  // leaderboard_service.py's _process_dps_results.
  punctualityPercent: z.number().nullable().optional(),
  isOwnStudent: z.boolean(),
  topBadges: z.array(BadgeSchema).optional(),
});

export const TeacherLeaderboardResponseSchema = z.object({
  leaderboard: z.array(TeacherLeaderboardEntrySchema),
  totalParticipants: z.number(),
});

export const TeacherDpsHierarchyResponseSchema = z.object({
  modules: z.array(ModuleSchema),
  levels: z.array(LevelSchema),
  currentModuleId: z.string().nullable(),
  currentLevelId: z.string().nullable(),
});

export const TeacherMockHierarchyResponseSchema = z.object({
  modules: z.array(ModuleSchema),
  levels: z.array(LevelSchema),
  exams: z.array(ExamSchema),
  currentModuleId: z.string().nullable(),
  currentLevelId: z.string().nullable(),
});

export type TeacherLeaderboardEntry = z.infer<typeof TeacherLeaderboardEntrySchema>;
export type TeacherLeaderboardResponse = z.infer<typeof TeacherLeaderboardResponseSchema>;
export type TeacherDpsHierarchyResponse = z.infer<typeof TeacherDpsHierarchyResponseSchema>;
export type TeacherMockHierarchyResponse = z.infer<typeof TeacherMockHierarchyResponseSchema>;
