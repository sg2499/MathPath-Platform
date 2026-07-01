import { api } from "./api";
import {
  HierarchyResponseSchema,
  LeaderboardResponseSchema,
  AchievementsResponseSchema,
} from "./schemas/leaderboard";

export const LeaderboardAPI = {
  getHierarchy: async () => {
    const response = await api.get(`/student/competition/hierarchy`);
    return HierarchyResponseSchema.parse(response.data);
  },

  getCumulativeLeaderboard: async (levelId: string) => {
    const response = await api.get(`/student/competition/mock-exams/cumulative-leaderboard?level_id=${levelId}`);
    return LeaderboardResponseSchema.parse(response.data);
  },

  getSpecificLeaderboard: async (examId: string) => {
    const response = await api.get(`/student/competition/mock-exams/${examId}/leaderboard`);
    return LeaderboardResponseSchema.parse(response.data);
  },

  getAchievements: async () => {
    const response = await api.get(`/student/competition/achievements`);
    return AchievementsResponseSchema.parse(response.data);
  },
};
