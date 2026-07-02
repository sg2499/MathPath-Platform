import { z } from "zod";

// Shared Badges Schema
export const BadgeSchema = z.object({
  id: z.string(),
  name: z.string(),
  tier: z.enum(["BASE", "SUPER", "LEGENDARY"]),
  iconName: z.string(),
});

// Single Leaderboard Entry Schema
export const LeaderboardEntrySchema = z.object({
  rank: z.number(),
  studentId: z.string(),
  name: z.string(),
  photoUrl: z.string().nullable().optional(),
  percentage: z.number(),
  score: z.number(),
  accuracy: z.number(),
  timeTakenSeconds: z.number(),
  isCurrent: z.boolean(),
  topBadges: z.array(BadgeSchema).optional(),
});

// Hierarchy Schemas
export const ModuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
});

export const LevelSchema = z.object({
  id: z.string(),
  moduleId: z.string(),
  name: z.string(),
  code: z.string(),
});

export const ExamSchema = z.object({
  id: z.string(),
  levelId: z.string(),
  moduleId: z.string(),
  title: z.string(),
});

export const HierarchyResponseSchema = z.object({
  modules: z.array(ModuleSchema),
  levels: z.array(LevelSchema),
  exams: z.array(ExamSchema),
  currentLevelId: z.string().nullable(),
  currentModuleId: z.string().nullable(),
});

// API Response Schemas
export const LeaderboardResponseSchema = z.object({
  leaderboard: z.array(LeaderboardEntrySchema),
  currentStudentRank: z.number().nullable().optional(),
  currentStudentEntry: LeaderboardEntrySchema.nullable().optional(),
  totalParticipants: z.number(),
});

// Achievements Response Schemas
export const StudentAchievementStatSchema = z.object({
  totalMocksAttempted: z.number(),
  averageAccuracy: z.number(),
  highestScore: z.number(),
  perfectScores: z.number(),
  fastestCompletionSeconds: z.number().nullable(),
  totalTimeSpentSeconds: z.number(),
});

export const AchievementsResponseSchema = z.object({
  stats: StudentAchievementStatSchema,
  earnedBadges: z.array(z.object({
    badge: BadgeSchema,
    earnedAt: z.string(),
    examContext: z.string().nullable().optional(),
  })),
  lockedBadges: z.array(BadgeSchema),
  recentActivity: z.array(z.object({
    id: z.string(),
    type: z.enum(["BADGE_EARNED", "EXAM_COMPLETED", "MILESTONE_REACHED"]),
    title: z.string(),
    description: z.string(),
    timestamp: z.string(),
    iconName: z.string(),
    metadata: z.any().optional(),
  })).optional(),
});

// Infer Types from Schemas
export type Badge = z.infer<typeof BadgeSchema>;
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;
export type HierarchyResponse = z.infer<typeof HierarchyResponseSchema>;
export type AchievementsResponse = z.infer<typeof AchievementsResponseSchema>;
