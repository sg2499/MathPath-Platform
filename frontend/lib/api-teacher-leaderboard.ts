import { api } from "./api";
import {
  TeacherDpsHierarchyResponseSchema,
  TeacherMockHierarchyResponseSchema,
  TeacherLeaderboardResponseSchema,
} from "./schemas/teacher-leaderboard";

// Teacher-facing leaderboard clients (2026-09-01) -- mirror the student
// DpsLeaderboardAPI/LeaderboardAPI clients in ./api-dps-leaderboard.ts and
// ./api-leaderboard.ts, pointed at the new teacher endpoints in
// routes_teacher.py. Same full leaderboard every student sees, with the
// requesting teacher's own students flagged (isOwnStudent) instead of a
// single "current student".

export const TeacherDpsLeaderboardAPI = {
  getHierarchy: async () => {
    const response = await api.get(`/teacher/competition/dps/hierarchy`);
    return TeacherDpsHierarchyResponseSchema.parse(response.data);
  },

  // "Overall Journey" tab -- pooled across every level within a module.
  getOverallLeaderboard: async (moduleId: string) => {
    const response = await api.get(`/teacher/competition/dps/overall-leaderboard?module_id=${moduleId}`);
    return TeacherLeaderboardResponseSchema.parse(response.data);
  },

  // "Specific Level" tab -- pooled across every DPS sheet within one level.
  getSpecificLeaderboard: async (levelId: string) => {
    const response = await api.get(`/teacher/competition/dps/specific-leaderboard?level_id=${levelId}`);
    return TeacherLeaderboardResponseSchema.parse(response.data);
  },
};

export const TeacherMockLeaderboardAPI = {
  getHierarchy: async () => {
    const response = await api.get(`/teacher/competition/mock/hierarchy`);
    return TeacherMockHierarchyResponseSchema.parse(response.data);
  },

  // "Overall Journey" (cumulative) tab -- pooled across every mock exam
  // within a level.
  getCumulativeLeaderboard: async (levelId: string) => {
    const response = await api.get(`/teacher/competition/mock/cumulative-leaderboard?level_id=${levelId}`);
    return TeacherLeaderboardResponseSchema.parse(response.data);
  },

  // "Specific Exam" tab -- one exam. `levelId` is required explicitly
  // (unlike the student endpoint, which always implicitly used the
  // requesting student's own current level) since a teacher has no single
  // current level of their own.
  getSpecificLeaderboard: async (examId: string, levelId: string) => {
    const response = await api.get(`/teacher/competition/mock/specific-leaderboard?exam_id=${examId}&level_id=${levelId}`);
    return TeacherLeaderboardResponseSchema.parse(response.data);
  },
};
