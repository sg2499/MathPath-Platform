import { api } from "./api";
import {
  DpsHierarchyResponseSchema,
  DpsLeaderboardResponseSchema,
} from "./schemas/dps-leaderboard";

// DPS (practice-sheet) leaderboard -- distinct from LeaderboardAPI in
// ./api-leaderboard.ts, which is the mock-exam leaderboard. Same client
// shape (getHierarchy + two scoped leaderboard fetches), pointed at the
// backend's DPS-specific endpoints (routes_student.py:
// get_dps_hierarchy / get_dps_overall_leaderboard / get_dps_specific_leaderboard).
export const DpsLeaderboardAPI = {
  getHierarchy: async () => {
    const response = await api.get(`/student/competition/dps/hierarchy`);
    return DpsHierarchyResponseSchema.parse(response.data);
  },

  // "Overall Journey" tab -- pooled across every level within a module.
  getOverallLeaderboard: async (moduleId: string) => {
    const response = await api.get(`/student/competition/dps/overall-leaderboard?module_id=${moduleId}`);
    return DpsLeaderboardResponseSchema.parse(response.data);
  },

  // "Specific Level" tab -- pooled across every DPS sheet within one level.
  getSpecificLeaderboard: async (levelId: string) => {
    const response = await api.get(`/student/competition/dps/specific-leaderboard?level_id=${levelId}`);
    return DpsLeaderboardResponseSchema.parse(response.data);
  },
};
