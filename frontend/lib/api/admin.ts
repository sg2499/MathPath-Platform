import { api } from "@/lib/api";
import type { ModuleItem, LevelItem, LessonItem, DpsItem } from "@/types/curriculum";
import type { AdminPreviewQuestion } from "@/types/question";
import type { AdminStudent, BulkUploadResult, StudentProfilePayload } from "@/types/student";
import type { AdminTeacher, TeacherPayload } from "@/types/teacher";


export async function getModules(): Promise<ModuleItem[]> {
  const { data } = await api.get<{ modules: ModuleItem[] }>("/admin/modules");
  return data.modules;
}

export async function getLevels(moduleId: string): Promise<LevelItem[]> {
  const { data } = await api.get<{ levels: LevelItem[] }>(`/admin/modules/${moduleId}/levels`);
  return data.levels;
}

export async function getLessons(levelId: string): Promise<LessonItem[]> {
  const { data } = await api.get<{ lessons: LessonItem[] }>(`/admin/levels/${levelId}/lessons`);
  return data.lessons;
}

export type AssessmentSectionItem = {
  sectionKey: string;
  sectionNumber: number;
  sectionTitle: string;
  conceptCount: number;
  // 2026-07-23: lets the Assessment Blueprint Studio auto-balance a paper to
  // always total 100 marks -- isWeighted sections (Skill Stacker/Concept
  // Drill) are worth marksPerQuestion each (5 for concept-weighted modules),
  // everything else is worth 1. See section_marks_metadata() in
  // assessment_blueprint_service.py.
  isWeighted: boolean;
  marksPerQuestion: number;
};

export type AssessmentSectionsForLevelResponse = {
  levelId: string;
  levelCode: string | null;
  moduleCode: string | null;
  isSectionWise: boolean;
  sections: AssessmentSectionItem[];
};

// Section-wise counterpart of getLessons() above -- for IM/MM levels,
// assessments mirror the exact sections that level's competition mock exam
// uses (see AssessmentBlueprintSection). isSectionWise is false for YLM (or
// any module without one), and the caller should fall back to getLessons().
export async function getAssessmentSectionsForLevel(levelId: string): Promise<AssessmentSectionsForLevelResponse> {
  const { data } = await api.get<AssessmentSectionsForLevelResponse>(`/admin/levels/${levelId}/assessment-sections`);
  return data;
}

export async function getDpsByLesson(lessonId: string): Promise<DpsItem[]> {
  const { data } = await api.get<{ dps: DpsItem[] }>(`/admin/lessons/${lessonId}/dps`);
  return data.dps;
}

export async function getDpsConfig(dpsId: string) {
  const { data } = await api.get(`/admin/dps/${dpsId}`);
  return data;
}

export async function generateDpsPreview(dpsId: string): Promise<{ dpsId: string; previewId?: string; title: string; questions: AdminPreviewQuestion[] }> {
  const { data } = await api.post(`/admin/dps/${dpsId}/generate-preview`, { questionCount: 10 });
  return data;
}


export async function publishDps(dpsId: string): Promise<{
  published: boolean;
  message: string;
  dps: { dpsId: string; dpsNumber: number; dpsTitle: string; publicationStatus: string; publishedAt?: string | null };
}> {
  const { data } = await api.post(`/admin/dps/${dpsId}/publish`);
  return data;
}

export type LessonBulkPreviewResult = {
  dpsId: string;
  dpsNumber: number;
  dpsTitle: string;
  title: string;
  previewSeed: string;
  questions: AdminPreviewQuestion[];
  wasAlreadyPublished: boolean;
};

export type LessonBulkSkippedSheet = {
  dpsId: string;
  dpsNumber: number;
  dpsTitle?: string;
  reason: "ALREADY_PUBLISHED" | "PREVIEW_REQUIRED" | string;
};

export async function generateDpsPreviewForLesson(
  lessonId: string,
  includePublished: boolean
): Promise<{
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  results: LessonBulkPreviewResult[];
  skipped: LessonBulkSkippedSheet[];
  totalDpsCount: number;
}> {
  const { data } = await api.post(`/admin/lessons/${lessonId}/dps/generate-preview-all`, { includePublished });
  return data;
}

export async function publishAllDpsForLesson(
  lessonId: string,
  dpsIds: string[]
): Promise<{
  published: boolean;
  message: string;
  lessonId: string;
  publishedDpsIds: string[];
  skipped: LessonBulkSkippedSheet[];
}> {
  const { data } = await api.post(`/admin/lessons/${lessonId}/dps/publish-all`, { dpsIds });
  return data;
}

export async function createAssignment(payload: Record<string, unknown>) {
  const { data } = await api.post("/admin/assignments", payload);
  return data;
}


export type LearningPerformanceParams = {
  teacherId?: string;
  moduleId?: string;
  levelId?: string;
  lessonId?: string;
  dpsId?: string;
  timezone?: string;
  timezoneOffsetMinutes?: number;
};

export type StudentHistoryParams = {
  studentId: string;
  moduleId?: string;
  levelId?: string;
  lessonId?: string;
  dpsId?: string;
  timezone?: string;
  timezoneOffsetMinutes?: number;
};

export async function getDpsResults(dpsId: string, teacherId?: string) {
  const params = teacherId ? { teacherId } : undefined;
  const { data } = await api.get(`/admin/dps/${dpsId}/results`, { params });
  return data;
}

export async function getLevelResults(params: { moduleId?: string; levelId: string; teacherId?: string }) {
  const { data } = await api.get('/admin/results/level', { params });
  return data;
}

export async function getAdminLearningPerformance(params: LearningPerformanceParams) {
  const { data } = await api.get('/admin/results/learning-performance', { params });
  return data;
}

export async function getStudentReport(params: StudentHistoryParams) {
  const { data } = await api.get('/admin/results/student', { params });
  return data;
}

export async function downloadAdminDpsReport(params: { dpsId: string; teacherId?: string; timezone?: string; timezoneOffsetMinutes?: number }): Promise<Blob> {
  const { data } = await api.get('/admin/results/export/dps', { params, responseType: 'blob' });
  return data;
}

export async function downloadAdminLevelReport(params: { moduleId?: string; levelId: string; teacherId?: string; timezone?: string; timezoneOffsetMinutes?: number }): Promise<Blob> {
  const { data } = await api.get('/admin/results/export/level', { params, responseType: 'blob' });
  return data;
}

export async function downloadAdminLearningPerformanceReport(params: LearningPerformanceParams): Promise<Blob> {
  const { data } = await api.get('/admin/results/export/learning-performance', { params, responseType: 'blob' });
  return data;
}

export async function downloadAdminStudentReport(params: StudentHistoryParams): Promise<Blob> {
  const { data } = await api.get('/admin/results/export/student', { params, responseType: 'blob' });
  return data;
}

export async function downloadAdminParentProgressReport(params: StudentHistoryParams): Promise<Blob> {
  const { data } = await api.get('/admin/results/export/parent-summary', { params, responseType: 'blob' });
  return data;
}

export async function getAdminAttempt(attemptId: string) {
  const { data } = await api.get(`/admin/attempts/${attemptId}`);
  return data;
}


export async function getAdminStudents(): Promise<AdminStudent[]> {
  const { data } = await api.get<{ students: AdminStudent[] }>("/admin/students");
  return data.students;
}

export async function createStudentProfile(payload: StudentProfilePayload): Promise<{
  created: boolean;
  message: string;
  student: AdminStudent;
  login: { identifier: string; password: string };
}> {
  const { data } = await api.post("/admin/students", payload);
  return data;
}

export async function updateStudentProfile(
  studentId: string,
  payload: Partial<StudentProfilePayload>
): Promise<{ updated: boolean; message: string; student: AdminStudent }> {
  const { data } = await api.patch(`/admin/students/${studentId}`, payload);
  return data;
}

export async function updateStudentStatus(
  studentId: string,
  isActive: boolean
): Promise<{ updated: boolean; message: string; student: AdminStudent }> {
  const { data } = await api.patch(`/admin/students/${studentId}/status`, { isActive });
  return data;
}

export async function resetStudentPassword(
  studentId: string,
  password: string
): Promise<{ updated: boolean; message: string; login: { identifier: string; password: string } }> {
  const { data } = await api.post(`/admin/students/${studentId}/reset-password`, { password });
  return data;
}

export async function uploadStudentPhoto(studentId: string, file: File): Promise<{ updated: boolean; photoUrl: string; student: AdminStudent }> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post(`/admin/students/${studentId}/photo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadStudentSignature(studentId: string, file: File): Promise<{ updated: boolean; signatureUrl: string; student: AdminStudent }> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post(`/admin/students/${studentId}/signature`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function downloadStudentTemplate(): Promise<Blob> {
  const { data } = await api.get("/admin/students/template", { responseType: "blob" });
  return data;
}

export async function bulkUploadStudents(file: File): Promise<BulkUploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post("/admin/students/bulk-upload", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
  });
  return data;
}


export async function deleteStudent(studentId: string): Promise<{
  deleted: boolean;
  message: string;
  studentId: string;
  studentName: string;
  studentCode: string;
}> {
  const { data } = await api.delete(`/admin/students/${studentId}`);
  return data;
}

export async function getAdminTeachers(): Promise<AdminTeacher[]> {
  const { data } = await api.get<{ teachers: AdminTeacher[] }>("/admin/teachers");
  return data.teachers;
}

export async function createTeacher(payload: TeacherPayload): Promise<{
  created: boolean;
  message: string;
  teacher: AdminTeacher;
  login: { identifier: string; password: string };
}> {
  const { data } = await api.post("/admin/teachers", payload);
  return data;
}

export async function updateTeacher(
  teacherId: string,
  payload: Partial<TeacherPayload>
): Promise<{ updated: boolean; message: string; teacher: AdminTeacher }> {
  const { data } = await api.patch(`/admin/teachers/${teacherId}`, payload);
  return data;
}

export async function updateTeacherStatus(
  teacherId: string,
  isActive: boolean
): Promise<{ updated: boolean; message: string; teacher: AdminTeacher }> {
  const { data } = await api.patch(`/admin/teachers/${teacherId}/status`, { isActive });
  return data;
}

export async function resetTeacherPassword(
  teacherId: string,
  password: string
): Promise<{ updated: boolean; message: string; login: { identifier: string; password: string } }> {
  const { data } = await api.post(`/admin/teachers/${teacherId}/reset-password`, { password });
  return data;
}

export async function deleteTeacher(teacherId: string): Promise<{ deleted: boolean; message: string; teacherId: string }> {
  const { data } = await api.delete(`/admin/teachers/${teacherId}`);
  return data;
}

export async function uploadTeacherPhoto(teacherId: string, file: File): Promise<{ uploaded: boolean; teacher: AdminTeacher }> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post(`/admin/teachers/${teacherId}/photo`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export async function uploadTeacherSignature(teacherId: string, file: File): Promise<{ uploaded: boolean; teacher: AdminTeacher }> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post(`/admin/teachers/${teacherId}/signature`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}


export type AdminAssignment = {
  assignmentId: string;
  assignmentType: string;
  title: string;
  instructions: string | null;
  isActive: boolean;
  status: string;
  allowReattempt: boolean;
  createdAt: string | null;
  assignedByUserId: string | null;
  assignedByName: string;
  assignedByRole: string;
  assignedToType: string;
  assignedToId: string;
  assignedToLabel: string;
  targetStudentName?: string | null;
  targetStudentCode?: string | null;
  targetClassName?: string | null;
  targetSection?: string | null;
  dpsId: string;
  dpsNumber: number | null;
  dpsTitle: string | null;
  lessonId: string | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  levelId: string | null;
  levelCode: string | null;
  levelName: string | null;
  moduleId: string | null;
  moduleCode: string | null;
  moduleName: string | null;
  attemptCount: number;
  completedAttemptCount: number;
  inProgressAttemptCount: number;
  pendingAttemptCount: number;
  averageAccuracy: number;
  latestCompletedAt?: string | null;
};

export async function getAdminAssignments(): Promise<AdminAssignment[]> {
  const { data } = await api.get<{ assignments: AdminAssignment[] }>("/admin/assignments");
  return data.assignments;
}

export async function updateAssignmentStatus(
  assignmentId: string,
  isActive: boolean
): Promise<{ updated: boolean; message: string; assignment: AdminAssignment }> {
  const { data } = await api.patch(`/admin/assignments/${assignmentId}/status`, { isActive });
  return data;
}

export async function deleteAssignment(
  assignmentId: string
): Promise<{ deleted: boolean; message: string; assignmentId: string }> {
  const { data } = await api.delete(`/admin/assignments/${assignmentId}`, { params: { force: true } });
  return data;
}

export async function updateAssessmentAssignmentStatus(
  assignmentId: string,
  isActive: boolean
): Promise<{ updated: boolean; message: string; assignment: AdminAssignment }> {
  const { data } = await api.patch(`/admin/assessments/${assignmentId}/status`, { isActive });
  return data;
}

export async function deleteAssessmentAssignment(
  assignmentId: string
): Promise<{ deleted: boolean; message: string; assignmentId: string }> {
  const { data } = await api.delete(`/admin/assessments/${assignmentId}`, { params: { force: true } });
  return data;
}

export async function promoteAssessmentAssignment(
  assignmentId: string,
  payload?: { targetLevelId?: string | null; targetLevelCode?: string | null }
): Promise<{
  promoted: boolean;
  alreadyPromoted?: boolean;
  message: string;
  promotion?: Record<string, unknown>;
  assignment?: AdminAssignment;
}> {
  const { data } = await api.post(`/admin/assessments/${assignmentId}/promote`, payload || {});
  return data;
}

export type AdminStudentLevelPromotion = {
  promotionId: string;
  studentId?: string | null;
  studentName?: string | null;
  studentCode?: string | null;
  fromModuleCode?: string | null;
  fromModuleName?: string | null;
  fromLevelCode?: string | null;
  fromLevelName?: string | null;
  toModuleCode?: string | null;
  toModuleName?: string | null;
  toLevelCode?: string | null;
  toLevelName?: string | null;
  assessmentAssignmentId?: string | null;
  assessmentAttemptId?: string | null;
  assessmentResultId?: string | null;
  assessmentTitle?: string | null;
  score?: number | null;
  maxScore?: number | null;
  percentage?: number | null;
  status?: string | null;
  statusLabel?: string | null;
  promotedByUserId?: string | null;
  promotedByName?: string | null;
  promotedAt?: string | null;
  createdAt?: string | null;
};

export async function getAdminStudentLevelPromotions(): Promise<{
  items: AdminStudentLevelPromotion[];
  total: number;
}> {
  const { data } = await api.get("/admin/student-level-promotions");
  return data;
}

export async function getAdminAssignmentDetail(assignmentId: string): Promise<{
  assignment: AdminAssignment;
  attempts: Array<Record<string, unknown>>;
}> {
  const { data } = await api.get(`/admin/assignments/${assignmentId}`);
  return data;
}


export type AdminAssignmentStudentRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  className: string | null;
  section: string | null;
  status: "COMPLETED" | "PENDING" | "REATTEMPT_AVAILABLE" | string;
  attemptId: string | null;
  attemptStatus: string | null;
  score: number | null;
  maxScore: number | null;
  accuracyPercentage: number | null;
  correct: number | null;
  wrong: number | null;
  unanswered: number | null;
  timeTakenSeconds: number | null;
  benchmarkPercentage?: number | null;
  benchmarkStatus?: string | null;
  requiresAttention?: boolean | null;
  benchmarkMessage?: string | null;
  requiresManualIntervention?: boolean | null;
  startedAt: string | null;
  submittedAt: string | null;
  attemptDate: string | null;
  completedDate: string | null;
  reattemptPermissionId?: string | null;
  reattemptStatus?: "NONE" | "APPROVED" | "USED" | string;
  reattemptAllowedAt?: string | null;
  reattemptUsedAt?: string | null;
  reattemptReason?: string | null;
  usedAssignmentId?: string | null;
  nextAttemptNumber?: number | null;
  retryAttemptNumber?: number | null;
};

export type AdminAssignmentAttemptRow = {
  attemptId: string;
  studentId: string | null;
  studentName: string;
  studentCode: string;
  className?: string | null;
  section?: string | null;
  status: string;
  score: number | null;
  maxScore: number | null;
  accuracyPercentage: number | null;
  correct: number | null;
  wrong: number | null;
  unanswered: number | null;
  timeTakenSeconds: number | null;
  benchmarkPercentage?: number | null;
  benchmarkStatus?: string | null;
  requiresAttention?: boolean | null;
  benchmarkMessage?: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  attemptDate: string | null;
  completedDate: string | null;
};

export type AdminAssignmentDetailFull = {
  assignment: AdminAssignment;
  attempts: AdminAssignmentAttemptRow[];
  students: AdminAssignmentStudentRow[];
  summary: {
    assignedStudentCount: number;
    completedStudentCount: number;
    pendingStudentCount: number;
    attemptCount: number;
  };
};

export async function getAdminAssignmentDetailFull(
  assignmentId: string
): Promise<AdminAssignmentDetailFull> {
  const { data } = await api.get<AdminAssignmentDetailFull>(`/admin/assignments/${assignmentId}`);
  return data;
}

export type AdminAttemptResult = {
  attemptId: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  attemptDate: string | null;
  completedDate: string | null;
  summary: {
    totalQuestions: number;
    attempted: number;
    correct: number;
    wrong: number;
    unanswered: number;
    score: number;
    maxScore: number;
    accuracyPercentage: number;
    timeTakenSeconds: number | null;
    benchmarkPercentage?: number | null;
    benchmarkStatus?: string | null;
    requiresAttention?: boolean | null;
    benchmarkMessage?: string | null;
  };
  requiresAttention?: boolean | null;
  benchmarkMessage?: string | null;
  questionReview: Array<{
    questionNumber: number;
    questionId: string;
    displayType: string;
    operands: number[];
    operators: string[];
    // DPS questions are typed free-text answers now, not MCQ picks -- see
    // OPEN_ISSUES.md 2026-08-03e.
    studentAnswer?: string | null;
    correctAnswer?: string | number | null;
    isCorrect: boolean;
  }>;
  message: string;
  student?: {
    studentId: string | null;
    studentName: string;
    studentCode: string;
    className?: string | null;
    section?: string | null;
  };
  assignment?: {
    assignmentId: string | null;
    title?: string | null;
  };
  dps?: {
    dpsId?: string | null;
    dpsNumber?: number | null;
    dpsTitle?: string | null;
    lessonNumber?: number | null;
    lessonTitle?: string | null;
    levelCode?: string | null;
    levelName?: string | null;
  };
};

export async function getAdminAttemptResult(attemptId: string): Promise<AdminAttemptResult> {
  const { data } = await api.get<AdminAttemptResult>(`/admin/attempts/${attemptId}`);
  return data;
}


export async function allowAdminAssignmentReattempt(
  assignmentId: string,
  studentId: string,
  reason?: string
): Promise<{
  created: boolean;
  message: string;
  permission: {
    reattemptPermissionId: string | null;
    reattemptStatus: string;
    reattemptAllowedAt: string | null;
    reattemptUsedAt: string | null;
    reattemptReason: string | null;
    usedAssignmentId: string | null;
  };
  freshAssignmentId?: string | null;
  freshAssignmentTitle?: string | null;
}> {
  const { data } = await api.post(`/admin/assignments/${assignmentId}/students/${studentId}/allow-reattempt`, {
    reason: reason || null,
  });
  return data;
}


export async function createAssessment(payload: Record<string, unknown>) {
  const { data } = await api.post("/admin/assessments", payload);
  return data;
}

export async function getAdminAssessments(): Promise<AdminAssignment[]> {
  const { data } = await api.get<{ assessments: AdminAssignment[] }>("/admin/assessments");
  return data.assessments;
}


export type AssessmentDpsEligibility = {
  dpsId: string;
  dpsNumber: number | null;
  dpsTitle: string | null;
  lessonId: string | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  status: string;
  isCompleted: boolean;
  isPassed: boolean;
  benchmarkPercentage: number;
  bestAccuracy: number | null;
  latestAccuracy: number | null;
  bestAttemptId: string | null;
  latestAttemptId: string | null;
  latestStatus: string | null;
  latestSubmittedAt: string | null;
  latestStartedAt: string | null;
  latestScore: number | null;
  latestMaxScore: number | null;
};

export type AssessmentLessonEligibility = {
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  requiredDpsCount: number;
  completedDpsCount: number;
  passedDpsCount: number;
  missingDpsCount: number;
  belowBenchmarkDpsCount: number;
  dps: AssessmentDpsEligibility[];
};

export type AssessmentEligibilityRow = {
  studentId: string;
  studentName: string;
  studentCode: string;
  className: string | null;
  section: string | null;
  levelId: string | null;
  levelCode: string | null;
  levelName: string | null;
  moduleId: string | null;
  moduleCode: string | null;
  moduleName: string | null;
  benchmarkPercentage: number;
  eligible: boolean;
  status: string;
  statusLabel: string;
  requiredDpsCount: number;
  completedDpsCount: number;
  passedDpsCount: number;
  missingDpsCount: number;
  belowBenchmarkDpsCount: number;
  progressPercentage: number;
  lessons: AssessmentLessonEligibility[];
  missingDps: AssessmentDpsEligibility[];
  belowBenchmarkDps: AssessmentDpsEligibility[];
  message: string;
};

export type AssessmentReadinessGateAudit = {
  mode: string;
  label: string;
  temporaryBypassEnabled: boolean;
  strictReadinessActive: boolean;
  notReadyStudentsImpacted: number;
  assignmentImpactLabel: string;
  nextPhaseNote: string;
};

export type AssessmentEligibilityResponse = {
  benchmarkPercentage: number;
  totalStudents: number;
  readyCount: number;
  notReadyCount: number;
  readinessGate?: AssessmentReadinessGateAudit;
  rows: AssessmentEligibilityRow[];
};

export async function getAdminAssessmentEligibility(levelId?: string): Promise<AssessmentEligibilityResponse> {
  const { data } = await api.get<AssessmentEligibilityResponse>("/admin/assessment-eligibility", {
    params: levelId ? { levelId } : undefined,
  });
  return data;
}

export async function getAdminStudentAssessmentEligibility(studentId: string, levelId?: string): Promise<AssessmentEligibilityRow> {
  const { data } = await api.get<AssessmentEligibilityRow>(`/admin/students/${studentId}/assessment-eligibility`, {
    params: levelId ? { levelId } : undefined,
  });
  return data;
}



export type AssessmentTestingOverride = {
  id: string;
  studentId: string;
  studentCode?: string | null;
  moduleId?: string | null;
  moduleCode?: string | null;
  moduleName?: string | null;
  levelId: string;
  levelCode?: string | null;
  levelName?: string | null;
  status: string;
  isActive: boolean;
  reason?: string | null;
  enabledByUserId?: string | null;
  enabledBy?: string | null;
  enabledAt?: string | null;
  disabledByUserId?: string | null;
  disabledBy?: string | null;
  disabledAt?: string | null;
  usedForAssessmentAssignmentId?: string | null;
  usedAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  archivedAt?: string | null;
};

export type AssessmentTestingOverrideListResponse = {
  testingOverrideEnabled: boolean;
  testingOverrideLabel: string;
  count: number;
  overrides: AssessmentTestingOverride[];
};

export async function getAdminAssessmentTestingOverrides(params: {
  studentId?: string;
  moduleId?: string;
  levelId?: string;
  activeOnly?: boolean;
} = {}): Promise<AssessmentTestingOverrideListResponse> {
  const { data } = await api.get<AssessmentTestingOverrideListResponse>(
    "/admin/assessment-readiness/testing-overrides",
    { params },
  );
  return data;
}

export async function createAdminAssessmentTestingOverride(payload: {
  studentId: string;
  moduleId?: string | null;
  levelId: string;
  reason?: string | null;
}): Promise<{ message: string; override: AssessmentTestingOverride }> {
  const { data } = await api.post<{ message: string; override: AssessmentTestingOverride }>(
    "/admin/assessment-readiness/testing-overrides",
    payload,
  );
  return data;
}

export async function deactivateAdminAssessmentTestingOverride(
  overrideId: string,
  payload: { reason?: string | null } = {},
): Promise<{ message: string; override: AssessmentTestingOverride }> {
  const { data } = await api.patch<{ message: string; override: AssessmentTestingOverride }>(
    `/admin/assessment-readiness/testing-overrides/${overrideId}/deactivate`,
    payload,
  );
  return data;
}

export type AssessmentBlueprintLessonDistribution = {
  id?: string;
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  questionCount: number;
  displayOrder?: number;
  conceptRules?: Record<string, unknown>;
};

// Section-wise counterpart of AssessmentBlueprintLessonDistribution above --
// IM/MM assessments (2026-07-22) mirror the exact sections that level's
// competition mock exam uses instead of a lesson-wise split. See
// AssessmentBlueprint.distributionMode to tell which shape applies.
export type AssessmentBlueprintSectionDistribution = {
  id?: string;
  sectionKey: string;
  sectionNumber: number | null;
  sectionTitle: string | null;
  questionCount: number;
  displayOrder?: number;
};

export type AssessmentBlueprint = {
  id: string;
  title: string;
  moduleId: string;
  moduleCode: string | null;
  moduleName: string | null;
  levelId: string;
  levelCode: string | null;
  levelName: string | null;
  totalQuestions: number;
  totalMarks: number;
  marksPerQuestion: number;
  durationSeconds: number;
  durationMinutes: number;
  passingPercentage: number;
  instructions: string | null;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  isPublished: boolean;
  isArchived: boolean;
  isActive: boolean;
  createdByUserId: string | null;
  createdByName: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  distributionMode: "SECTION_WISE" | "LESSON_WISE" | string;
  lessonDistribution: AssessmentBlueprintLessonDistribution[];
  sectionDistribution: AssessmentBlueprintSectionDistribution[];
  engineVersionCount?: number;
  engineAssignmentCount?: number;
  engineResultCount?: number;
  latestPublishedVersionId?: string | null;
  latestPublishedVersionNumber?: number | null;
  latestPublishedVersionStatus?: string | null;
  latestPublishedVersionIsLive?: boolean;
};

export type AssessmentBlueprintListResponse = {
  total: number;
  items: AssessmentBlueprint[];
};

export type AssessmentBlueprintCreatePayload = {
  title: string;
  moduleId: string;
  levelId: string;
  totalQuestions: number;
  durationSeconds: number;
  instructions?: string | null;
  status?: "DRAFT" | "PUBLISHED";
  // Row shape doubles for both distribution modes -- lessonId for YLM,
  // sectionKey for IM/MM. Exactly one is populated per row depending on
  // moduleId's module; the backend validator only reads the one that
  // applies (see AssessmentLessonDistributionRequest in routes_admin.py).
  lessonDistribution: Array<{
    lessonId?: string;
    sectionKey?: string;
    questionCount: number;
    conceptRules?: Record<string, unknown> | null;
  }>;
};

export async function getAdminAssessmentBlueprints(params?: {
  status?: string;
  moduleId?: string;
  levelId?: string;
  includeArchived?: boolean;
}): Promise<AssessmentBlueprintListResponse> {
  const { data } = await api.get<AssessmentBlueprintListResponse>("/admin/assessment-blueprints", {
    params,
  });
  return data;
}

export async function createAdminAssessmentBlueprint(payload: AssessmentBlueprintCreatePayload): Promise<AssessmentBlueprint> {
  const { data } = await api.post<AssessmentBlueprint>("/admin/assessment-blueprints", payload);
  return data;
}

export async function getAdminAssessmentBlueprint(blueprintId: string): Promise<AssessmentBlueprint> {
  const { data } = await api.get<AssessmentBlueprint>(`/admin/assessment-blueprints/${blueprintId}`);
  return data;
}

export type AssessmentBlueprintUpdatePayload = Partial<Pick<AssessmentBlueprintCreatePayload, "title" | "totalQuestions" | "durationSeconds" | "instructions" | "lessonDistribution">>;

export async function updateAdminAssessmentBlueprint(blueprintId: string, payload: AssessmentBlueprintUpdatePayload): Promise<AssessmentBlueprint> {
  const { data } = await api.patch<AssessmentBlueprint>(`/admin/assessment-blueprints/${blueprintId}`, payload);
  return data;
}

export type AssessmentEngineFoundation = {
  engineStatus: string;
  blueprintCount: number;
  versionCount: number;
  publishedVersionCount: number;
  questionCount: number;
  assignmentCount: number;
  attemptCount: number;
  resultCount: number;
  pendingReattemptCount: number;
  governance: Record<string, boolean>;
};

export async function getAdminAssessmentEngineFoundation(): Promise<AssessmentEngineFoundation> {
  const { data } = await api.get<AssessmentEngineFoundation>("/admin/assessment-engine/foundation");
  return data;
}

export type AdminAssessmentReattemptApproval = {
  approvalId: string;
  assessmentAssignmentId: string | null;
  assessmentVersionId: string | null;
  blueprintId: string | null;
  studentId: string | null;
  studentCode: string | null;
  studentName: string;
  teacherId: string | null;
  teacherName: string;
  moduleId: string | null;
  moduleCode: string | null;
  moduleName: string | null;
  levelId: string | null;
  levelCode: string | null;
  levelName: string | null;
  assessmentTitle: string;
  versionNumber: number | null;
  failedAssessmentTitle?: string | null;
  failedAssessmentVersionLabel?: string | null;
  assignmentType: string;
  sourceAssignmentId: string | null;
  attemptId: string | null;
  attemptNumber: number | null;
  attemptType: string | null;
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  resultStatus: string | null;
  completionDate: string | null;
  status: string;
  statusLabel: string;
  reason: string | null;
  adminNote: string | null;
  nextAttemptNumber: number | null;
  requestedByName: string;
  approvedByName: string | null;
  requestedAt: string | null;
  approvedAt: string | null;
  usedAt: string | null;
  canApprove: boolean;
  canReject: boolean;
  canAssign: boolean;
};

export type AdminAssessmentReattemptApprovalResponse = {
  total: number;
  pending: number;
  approved: number;
  assigned: number;
  rejected: number;
  items: AdminAssessmentReattemptApproval[];
};

export async function getAdminAssessmentReattemptApprovals(params?: { status?: string }): Promise<AdminAssessmentReattemptApprovalResponse> {
  const { data } = await api.get<AdminAssessmentReattemptApprovalResponse>("/admin/assessment-reattempt-approvals", { params });
  return data;
}

export async function approveAdminAssessmentReattempt(approvalId: string, payload?: { adminNote?: string | null }): Promise<{ updated: boolean; message: string; item: AdminAssessmentReattemptApproval }> {
  const { data } = await api.post(`/admin/assessment-reattempt-approvals/${approvalId}/approve`, payload ?? {});
  return data;
}

export async function rejectAdminAssessmentReattempt(approvalId: string, payload?: { adminNote?: string | null }): Promise<{ updated: boolean; message: string; item: AdminAssessmentReattemptApproval }> {
  const { data } = await api.post(`/admin/assessment-reattempt-approvals/${approvalId}/reject`, payload ?? {});
  return data;
}

export async function getAdminAssessmentBlueprintEngineState(blueprintId: string): Promise<Record<string, unknown>> {
  const { data } = await api.get<Record<string, unknown>>(`/admin/assessment-blueprints/${blueprintId}/engine-state`);
  return data;
}


export type AssessmentGeneratedOption = {
  id: string;
  label: string;
  value: string;
  displayOrder: number;
  isCorrect?: boolean;
};

export type AssessmentGeneratedQuestion = {
  id: string;
  assessmentVersionId: string;
  questionNumber: number;
  lessonQuestionNumber: number;
  lessonId: string | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  displayType: string;
  questionText: string | null;
  operands: number[];
  operators: string[];
  difficulty: string | null;
  conceptTag: string | null;
  sourceType: string;
  sourceReferenceId: string | null;
  metadata: Record<string, unknown>;
  options: AssessmentGeneratedOption[];
  correctAnswer?: string;
  correctOptionLabel?: string | null;
  explanation?: string | null;
  createdAt: string | null;
};

// "lessonGroups" carries both shapes (2026-07-22): groupKind "LESSON" for
// YLM's original per-lesson grouping, groupKind "SECTION" for IM/MM's
// section-wise grouping (sectionKey/sectionNumber/sectionTitle populated,
// lessonId null). See VersionPayload() in assessment_engine_service.py.
export type AssessmentGeneratedLessonGroup = {
  groupKind?: "LESSON" | "SECTION" | string;
  lessonId: string | null;
  lessonNumber: number | null;
  lessonTitle: string | null;
  sectionKey?: string | null;
  sectionNumber?: number | null;
  sectionTitle?: string | null;
  questionCount: number;
  questions: AssessmentGeneratedQuestion[];
};

export type AssessmentGeneratedVersion = {
  id: string;
  blueprintId: string;
  blueprintTitle: string | null;
  versionNumber: number;
  status: string;
  generationMode: string;
  seed: string | null;
  totalQuestions: number;
  totalMarks: number;
  marksPerQuestion: number;
  durationSeconds: number;
  durationMinutes: number;
  questionCount: number;
  assignmentCount: number;
  attemptCount: number;
  generatedByUserId: string | null;
  generatedByName: string | null;
  publishedByUserId: string | null;
  publishedByName: string | null;
  generatedAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  isActive: boolean;
  questions: AssessmentGeneratedQuestion[];
  lessonGroups: AssessmentGeneratedLessonGroup[];
};

export async function generateAdminAssessmentPreview(blueprintId: string): Promise<AssessmentGeneratedVersion> {
  const { data } = await api.post<AssessmentGeneratedVersion>(`/admin/assessment-blueprints/${blueprintId}/generate-preview`);
  return data;
}

export async function getAdminGeneratedAssessment(blueprintId: string, includeAnswerKey = true): Promise<{
  available: boolean;
  assessment: AssessmentGeneratedVersion | null;
}> {
  const { data } = await api.get(`/admin/assessment-blueprints/${blueprintId}/generated-assessment`, {
    params: { includeAnswerKey },
  });
  return data;
}


export async function makeAdminAssessmentVersionAvailable(blueprintId: string, versionId: string): Promise<AssessmentGeneratedVersion> {
  const { data } = await api.post<AssessmentGeneratedVersion>(`/admin/assessment-blueprints/${blueprintId}/versions/${versionId}/make-available`);
  return data;
}

export async function pauseAdminAssessmentVersion(blueprintId: string, versionId: string): Promise<AssessmentGeneratedVersion> {
  const { data } = await api.post<AssessmentGeneratedVersion>(`/admin/assessment-blueprints/${blueprintId}/versions/${versionId}/pause`);
  return data;
}

export async function publishAdminAssessmentBlueprint(blueprintId: string): Promise<AssessmentBlueprint> {
  const { data } = await api.post<AssessmentBlueprint>(`/admin/assessment-blueprints/${blueprintId}/publish`);
  return data;
}

export async function archiveAdminAssessmentBlueprint(blueprintId: string): Promise<AssessmentBlueprint> {
  const { data } = await api.post<AssessmentBlueprint>(`/admin/assessment-blueprints/${blueprintId}/archive`);
  return data;
}

export async function deleteAdminAssessmentBlueprint(blueprintId: string): Promise<{
  ok: boolean;
  message: string;
  item: AssessmentBlueprint;
}> {
  const { data } = await api.delete(`/admin/assessment-blueprints/${blueprintId}`);
  return data;
}


export type ParentReportDeliveryLog = {
  id: string;
  studentId?: string | null;
  studentName: string;
  studentCode: string;
  moduleCode: string;
  moduleName: string;
  moduleLabel: string;
  levelCode: string;
  levelName: string;
  levelLabel: string;
  fileName?: string | null;
  assessmentTitle?: string | null;
  status: string;
  isPublishedToTeacher: boolean;
  generatedAt?: string | null;
  generatedBy?: string | null;
  publishedToTeacherAt?: string | null;
  publishedBy?: string | null;
  createdAt?: string | null;
};

export type ParentReportDeliveryLogParams = {
  moduleId?: string;
  levelId?: string;
  status?: string;
  search?: string;
};

export async function getAdminParentReportDeliveryLogs(
  params: ParentReportDeliveryLogParams = {},
): Promise<{ logs: ParentReportDeliveryLog[] }> {
  const { data } = await api.get<{ logs: ParentReportDeliveryLog[] }>(
    "/admin/results/parent-report-deliveries",
    { params },
  );
  return data;
}

export async function downloadAdminParentReportDelivery(deliveryId: string): Promise<Blob> {
  const { data } = await api.get(`/admin/results/parent-report-deliveries/${deliveryId}/download`, {
    responseType: "blob",
  });
  return data;
}

export async function publishAdminParentReportToTeacher(
  deliveryId: string,
): Promise<{ published: boolean; deliveryId: string; publishedToTeacherAt: string; message: string }> {
  const { data } = await api.post<{ published: boolean; deliveryId: string; publishedToTeacherAt: string; message: string }>(
    `/admin/results/parent-report-deliveries/${deliveryId}/publish-to-teacher`,
  );
  return data;
}

export async function deleteAdminParentReportDelivery(
  deliveryId: string,
): Promise<{ deleted: boolean; message: string; deliveryId: string }> {
  const { data } = await api.delete<{ deleted: boolean; message: string; deliveryId: string }>(
    `/admin/results/parent-report-deliveries/${deliveryId}`,
  );
  return data;
}

export type CompetitionMockExamSummary = {
  mockExamId: string;
  mockCode: string;
  title: string;
  moduleId: string;
  moduleCode: string | null;
  moduleName: string | null;
  levelId: string;
  levelCode: string | null;
  levelName: string | null;
  competitionScope: string;
  difficultyBand: string;
  totalQuestions: number;
  totalMarks: number;
  marksPerQuestion: number;
  durationSeconds: number;
  status: string;
  instructions?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type CompetitionMockQuestionOption = {
  optionId: string;
  label: string;
  value: string;
  isCorrect: boolean;
  displayOrder: number;
};

export type CompetitionMockQuestion = {
  mockQuestionId: string;
  sectionNumber: number;
  sectionTitle: string;
  questionNumber: number;
  displayType: string;
  questionText: string;
  operands: unknown[];
  operators: string[];
  correctAnswer: string;
  difficulty: string;
  conceptFamily: string;
  conceptTag: string;
  marks: number;
  options: CompetitionMockQuestionOption[];
};

export type CompetitionMockExamDetail = CompetitionMockExamSummary & {
  questions: CompetitionMockQuestion[];
};

export type CompetitionMockSectionPlanItem = {
  sectionKey: string;
  sectionNumber: number;
  sectionTitle: string;
  questionCount: number;
  locked?: boolean;
  // 2026-09-01: Concept Drill/Skill Stacker sections are worth 5
  // marks/question, same as assessments -- isWeighted/marksPerQuestion let
  // the Mock Studio Section Allocation panel show weighted sections as
  // admin-editable and flat sections as auto-computed (see
  // _CompetitionMockSectionPlanSections in
  // competition_mock_generation_service.py).
  isWeighted?: boolean;
  marksPerQuestion?: number;
};

export type CompetitionMockSectionPlan = {
  moduleId: string;
  moduleCode?: string | null;
  moduleName?: string | null;
  levelId: string;
  levelCode?: string | null;
  levelName?: string | null;
  totalQuestions: number;
  structure: string;
  sections: CompetitionMockSectionPlanItem[];
};

export type GenerateCompetitionMockPayload = {
  levelId: string;
  title?: string;
  mockCode?: string;
  totalQuestions?: number;
  // Admin-chosen total marks, 10-100 inclusive, default 100 when omitted --
  // applies whether or not this level has a weighted (Concept Drill/Skill
  // Stacker) section.
  totalMarks?: number;
  durationSeconds?: number;
  competitionScope?: string;
  difficultyBand?: string;
  sectionCounts?: Record<string, number>;
};

export type CompetitionMockAssignment = {
  assignmentId: string;
  mockExamId: string;
  studentId: string;
  student?: {
    studentId: string;
    studentCode: string;
    studentName: string | null;
    currentModuleId: string | null;
    currentLevelId: string | null;
    teacherId: string | null;
  } | null;
  teacherId?: string | null;
  teacherCode?: string | null;
  assignedByUserId?: string | null;
  assignedByName?: string | null;
  status: string;
  currentAttemptNumber: number;
  maxAttempts: number;
  assignedAt?: string | null;
  dueAt?: string | null;
  instructions?: string | null;
  isActive: boolean;
  mockExam?: CompetitionMockExamSummary;
};

export type AssignCompetitionMocksPayload = {
  levelId: string;
  mockExamIds: string[];
  studentIds?: string[];
  assignToAllInLevel?: boolean;
  maxAttempts?: number;
  dueAt?: string | null;
  instructions?: string | null;
};

export async function getCompetitionMockSectionPlan(levelId: string, totalQuestions?: number, totalMarks?: number): Promise<CompetitionMockSectionPlan> {
  const { data } = await api.get<CompetitionMockSectionPlan>("/admin/competition/mock-section-plan", { params: { levelId, totalQuestions, totalMarks } });
  return data;
}

export async function generateCompetitionMockDraft(payload: GenerateCompetitionMockPayload): Promise<CompetitionMockExamDetail> {
  const { data } = await api.post<CompetitionMockExamDetail>("/admin/competition/mock-exams/generate-draft", payload, { timeout: 60000 });
  return data;
}

export async function listCompetitionMockExams(levelId?: string): Promise<CompetitionMockExamSummary[]> {
  const { data } = await api.get<{ mockExams: CompetitionMockExamSummary[] }>("/admin/competition/mock-exams", { params: levelId ? { levelId } : undefined });
  return data.mockExams;
}

export async function getCompetitionMockExam(mockExamId: string): Promise<CompetitionMockExamDetail> {
  const { data } = await api.get<CompetitionMockExamDetail>(`/admin/competition/mock-exams/${mockExamId}`);
  return data;
}

export async function deleteCompetitionMockExam(mockExamId: string): Promise<{ ok: boolean; message: string; deleted: { mockExamId: string; title: string; questionsDeleted: number; assignmentsDeleted: number; attemptsDeleted: number } }> {
  const { data } = await api.delete(`/admin/competition/mock-exams/${mockExamId}`);
  return data;
}

export async function archiveCompetitionMockExam(mockExamId: string): Promise<{ ok: boolean; message: string; mockExam: CompetitionMockExamSummary }> {
  const { data } = await api.patch(`/admin/competition/mock-exams/${mockExamId}/archive`);
  return data;
}

export async function assignCompetitionMockExams(payload: AssignCompetitionMocksPayload): Promise<{
  ok: boolean;
  levelId: string;
  levelCode?: string | null;
  moduleId?: string | null;
  moduleCode?: string | null;
  mockExamCount: number;
  studentCount: number;
  createdAssignmentCount: number;
  updatedExistingAssignmentCount: number;
  assignments: CompetitionMockAssignment[];
}> {
  const { data } = await api.post("/admin/competition/mock-exams/assign", payload);
  return data;
}

export async function listCompetitionMockAssignments(params: {
  levelId?: string;
  mockExamId?: string;
  studentId?: string;
  status?: string;
} = {}): Promise<CompetitionMockAssignment[]> {
  const { data } = await api.get<{ assignments: CompetitionMockAssignment[] }>("/admin/competition/mock-assignments", { params });
  return data.assignments;
}

export type AdminCompetitionTrackerRow = {
  assignmentId: string;
  mockExamId: string;
  attemptId: string | null;
  status: string;
  assignmentStatus: string;
  attemptStatus: string | null;
  assignedAt: string | null;
  dueAt: string | null;
  submittedAt: string | null;
  teacherName: string | null;
  teacherCode: string | null;
  student: {
    studentId: string;
    studentCode: string;
    studentName: string;
    className: string | null;
    section: string | null;
  };
  mockExam: {
    title: string;
    mockCode: string | null;
    moduleCode: string | null;
    levelCode: string | null;
    totalQuestions: number;
    totalMarks: number;
    marksPerQuestion: number;
    durationSeconds: number;
  };
  score: number | null;
  maxScore: number | null;
  percentage: number | null;
  accuracyPercentage: number | null;
  correctCount: number | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  timeTakenSeconds: number | null;
  timeTakenText: string | null;
  timeUtilizationPercentage: number | null;
  performanceBand: string | null;
  sectionPerformance: any;
  strengths: any;
  weakAreas: any;
};

export async function getAdminCompetitionMockTracker(): Promise<{ rows: AdminCompetitionTrackerRow[] }> {
  const { data } = await api.get<{ rows: AdminCompetitionTrackerRow[] }>("/admin/competition/mock-tracker");
  return data;
}


export async function deleteAdminCompetitionMockAssignment(assignmentId: string) {
  const { data } = await api.delete(`/admin/competition/mock-tracker/assignment/${assignmentId}`);
  return data;
}

export async function deleteAdminCompetitionMockStudent(studentId: string) {
  const { data } = await api.delete(`/admin/competition/mock-tracker/student/${studentId}`);
  return data;
}

export async function getAdminCompetitionMockResult(attemptId: string) {

  const { data } = await api.get(`/admin/competition/mock-attempts/${attemptId}/result`);
  return data;
}


// Superadmin DB Search -- read-only ad-hoc SELECT against production,
// requested by the hosting team as the sanctioned alternative to handing a
// raw DB credential to a dev machine. Backend enforces SELECT-only + a hard
// row cap + (on Postgres) a genuinely read-only transaction; see
// db_search() in routes_admin.py for the full contract.
export type DbSearchResult = {
  columns: string[];
  rows: (string | number | boolean | null)[][];
  rowCount: number;
  rowLimit: number;
};

export async function runAdminDbSearch(query: string): Promise<DbSearchResult> {
  const { data } = await api.post("/admin/db-search", { query });
  return data;
}

// ---------------------------------------------------------------------------
// Annual Competition -- Admin Studio (Package 2/3). Types mirror the
// camelCase payloads returned by annual_competition_assignment_service.py /
// annual_competition_studio_service.py verbatim -- see those files for the
// full rationale (esp. why BM-L1 is never a valid competitionLevelCode, and
// why MM-L2 can exist as an assignment target with no linked paper yet).
// ---------------------------------------------------------------------------

export type AnnualCompetitionEvent = {
  eventId: string;
  name: string;
  status: string;
  competitionDate: string | null;
  resultsReleaseAt: string | null;
  createdByUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AnnualCompetitionSlot = {
  slotId: string;
  eventId: string;
  mode: string;
  slotLabel: string | null;
  scheduledStartAt: string | null;
  scheduledEndAt: string | null;
  applicableLevelCodes: string[];
  durationMinutes: number | null;
  isActive: boolean;
};

export type AnnualCompetitionSectionTimer = {
  sectionTimerId: string;
  sectionNumber: number;
  sectionTitle: string | null;
  mode: string | null;
  timeLimitSeconds: number;
};

export type AnnualCompetitionLevelPaper = {
  levelPaperId: string;
  eventId: string;
  competitionLevelCode: string;
  mockExamId: string | null;
  mockExamTitle: string | null;
  status: "PENDING" | "READY" | "LOCKED";
  lockedAt: string | null;
  sectionTimers: AnnualCompetitionSectionTimer[];
  totalSectionSeconds: number | null;
};

export type AnnualCompetitionSlotDurationConflict = {
  slotId: string;
  slotLabel: string | null;
  levelCode: string;
  slotDurationSeconds: number;
  requiredSeconds: number;
  shortBySeconds: number;
};

export type AnnualCompetitionEventOverview = {
  event: AnnualCompetitionEvent;
  slots: AnnualCompetitionSlot[];
  levelPapers: AnnualCompetitionLevelPaper[];
  missingLevelPapers: string[];
  slotDurationConflicts: AnnualCompetitionSlotDurationConflict[];
};

export type AnnualCompetitionAssignmentPreviewRow = {
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  currentModuleCode: string | null;
  currentLevelCode: string | null;
  // 2026-09-15 (Shailesh): Master-module-only lesson info -- see
  // FormatCompetitionLevelLabel's comment for why Current Level itself
  // stays the raw "MM-L1" curriculum code and this is shown alongside it
  // instead. Always null for every non-Master row.
  currentLessonNumber: number | null;
  masterLevelComplete: boolean | null;
  computedAssignedLevelCode: string | null;
  ruleApplied: string | null;
  noRuleMatched: boolean;
  reason: string | null;
  existingAssignedLevelCode: string | null;
  existingAssignmentSource: string | null;
  wouldOverwriteAdminOverride: boolean;
  wouldChangeOnRun: boolean;
  requiresNewPaperRegistryEntry: boolean;
};

export type AnnualCompetitionAssignmentPreview = {
  eventId: string;
  eventName: string;
  totalStudentsConsidered: number;
  wouldAssignCount: number;
  noRuleMatchedCount: number;
  adminOverridePreservedCount: number;
  rows: AnnualCompetitionAssignmentPreviewRow[];
};

export type AnnualCompetitionAssignmentRunResult = {
  eventId: string;
  totalConsidered: number;
  created: number;
  updated: number;
  skippedAdminOverrides: number;
  noRuleMatched: number;
};

// The 12 real assignment-target level codes, in display order -- mirrors
// VALID_COMPETITION_LEVEL_CODES (annual_competition_studio_service.py).
// BM-L1 is deliberately excluded (see that module's docstring). YLM-L0
// ("Bloomers") added 2026-09-15 alongside YLM-L1 ("Beginners") -- see
// ANNUAL_COMPETITION_LEVEL_DISPLAY_LABELS below for why both show a
// different name than their code (MM-L1/MM-L2 -> MM-1/MM-2 likewise).
export const ANNUAL_COMPETITION_LEVEL_CODES = [
  "YLM-L0", "YLM-L1",
  "PM-L1", "PM-L2", "PM-L3", "PM-L4",
  "IM-L1", "IM-L2", "IM-L3", "IM-L4",
  "MM-L1", "MM-L2",
] as const;

// 2026-09-15 (Shailesh): "the wordings need to be updated everywhere
// relevant ... nothing should showcase the old name wherever it is being
// seen by the human eyes." Every level code except these two renders as
// itself unchanged (e.g. "PM-L1" stays "PM-L1"); YLM-L1 and YLM-L0 keep
// their existing/new internal codes (so no stored data, attempt, or result
// needs to change) but always display under these names to admin, teacher,
// and student alike, across both the Official and Practice flows. Mirrors
// the backend's own copy of this exact mapping
// (annual_competition_paper_registry.py's ANNUAL_COMPETITION_LEVEL_DISPLAY_
// LABELS) -- keep both in sync if this ever changes.
// 2026-09-15 (Shailesh): "lets rename MM-L1 to MM-1 because that is the
// paper and wherever relevant we need to show MM-2 and not MM-L2." Same
// swap-the-label-not-the-code approach as YLM-L0/YLM-L1. Deliberately does
// NOT apply to the "Current Level" column anywhere -- confirmed: "the
// current level should remain as is because the actual level is MM-L1,
// MM-1 and MM-2 shown in the competition eligibility is the segregation
// between students, students btw lessons 1 to 15 sit for IM-L4, students
// between lesson 16-30 sit for MM-1 and students that have completed the
// course and are alumnis sit for MM-2" -- so Current Level cells read
// `Row.currentLevelCode` raw, never through this function.
const ANNUAL_COMPETITION_LEVEL_DISPLAY_LABELS: Record<string, string> = {
  "YLM-L0": "Bloomers (Below 8 Years)",
  "YLM-L1": "Beginners (Above 8 Years)",
  "MM-L1": "MM-1",
  "MM-L2": "MM-2",
};

export function FormatCompetitionLevelLabel(levelCode: string | null | undefined): string {
  if (!levelCode) return "";
  return ANNUAL_COMPETITION_LEVEL_DISPLAY_LABELS[levelCode] || levelCode;
}

// 2026-09-15 (Shailesh): Master-module-only "which lesson are they on"
// caption for a Current Level cell, e.g. "MM-L1 -- Lesson 22" or
// "MM-L1 -- Course Complete". Only ever called for currentModuleCode ===
// "MM" rows; every other module's Current Level cell stays a bare code.
export function FormatMasterCurrentLevelSuffix(
  currentLessonNumber: number | null | undefined,
  masterLevelComplete: boolean | null | undefined
): string {
  if (masterLevelComplete) return "Course Complete";
  if (currentLessonNumber != null) return `Lesson ${currentLessonNumber}`;
  return "";
}

export async function listAnnualCompetitionEvents(): Promise<AnnualCompetitionEvent[]> {
  const { data } = await api.get<{ events: AnnualCompetitionEvent[] }>("/admin/annual-competition/events");
  return data.events;
}

export async function createAnnualCompetitionEvent(payload: {
  name: string;
  competitionDate: string;
  resultsReleaseAt?: string | null;
}): Promise<AnnualCompetitionEvent> {
  const { data } = await api.post<AnnualCompetitionEvent>("/admin/annual-competition/events", payload);
  return data;
}

export async function updateAnnualCompetitionEvent(
  eventId: string,
  payload: {
    name?: string;
    status?: string;
    competitionDate?: string;
    resultsReleaseAt?: string | null;
    clearResultsReleaseAt?: boolean;
  }
): Promise<AnnualCompetitionEvent> {
  const { data } = await api.patch<AnnualCompetitionEvent>(`/admin/annual-competition/events/${eventId}`, payload);
  return data;
}

export async function deleteAnnualCompetitionEvent(eventId: string): Promise<{ eventId: string; deleted: boolean }> {
  const { data } = await api.delete<{ eventId: string; deleted: boolean }>(`/admin/annual-competition/events/${eventId}`);
  return data;
}

export async function getAnnualCompetitionEventOverview(eventId: string): Promise<AnnualCompetitionEventOverview> {
  const { data } = await api.get<AnnualCompetitionEventOverview>(`/admin/annual-competition/events/${eventId}/overview`);
  return data;
}

export async function createAnnualCompetitionSlot(
  eventId: string,
  payload: {
    mode: string;
    scheduledStartAt: string;
    scheduledEndAt: string;
    applicableLevelCodes: string[];
    slotLabel?: string | null;
  }
): Promise<AnnualCompetitionSlot> {
  const { data } = await api.post<AnnualCompetitionSlot>(`/admin/annual-competition/events/${eventId}/slots`, payload);
  return data;
}

export async function updateAnnualCompetitionSlot(
  slotId: string,
  payload: Partial<{
    mode: string;
    slotLabel: string | null;
    scheduledStartAt: string;
    scheduledEndAt: string;
    applicableLevelCodes: string[];
    isActive: boolean;
  }>
): Promise<AnnualCompetitionSlot> {
  const { data } = await api.patch<AnnualCompetitionSlot>(`/admin/annual-competition/slots/${slotId}`, payload);
  return data;
}

export async function generateAnnualCompetitionLevelPaper(eventId: string, levelCode: string): Promise<AnnualCompetitionLevelPaper> {
  const { data } = await api.post<AnnualCompetitionLevelPaper>(
    `/admin/annual-competition/events/${eventId}/level-papers/${levelCode}/generate`,
    {},
    { timeout: 60000 }
  );
  return data;
}

export async function linkAnnualCompetitionLevelPaper(eventId: string, levelCode: string, mockExamId: string): Promise<AnnualCompetitionLevelPaper> {
  const { data } = await api.post<AnnualCompetitionLevelPaper>(
    `/admin/annual-competition/events/${eventId}/level-papers/${levelCode}/link`,
    { mockExamId }
  );
  return data;
}

export async function updateAnnualCompetitionSectionTimer(
  sectionTimerId: string,
  payload: Partial<{ sectionTitle: string; mode: string; timeLimitSeconds: number }>
): Promise<AnnualCompetitionSectionTimer> {
  const { data } = await api.patch<AnnualCompetitionSectionTimer>(`/admin/annual-competition/section-timers/${sectionTimerId}`, payload);
  return data;
}

export async function previewAnnualCompetitionAssignments(eventId: string, studentIds?: string[]): Promise<AnnualCompetitionAssignmentPreview> {
  const { data } = await api.get<AnnualCompetitionAssignmentPreview>(
    `/admin/annual-competition/events/${eventId}/assignments/preview`,
    { params: studentIds ? { studentIds } : undefined }
  );
  return data;
}

export async function runAnnualCompetitionAssignments(eventId: string, studentIds?: string[]): Promise<AnnualCompetitionAssignmentRunResult> {
  const { data } = await api.post<AnnualCompetitionAssignmentRunResult>(
    `/admin/annual-competition/events/${eventId}/assignments/run`,
    { studentIds: studentIds || null }
  );
  return data;
}

export async function overrideAnnualCompetitionAssignment(
  eventId: string,
  payload: { studentId: string; assignedLevelCode: string; slotId?: string | null }
): Promise<{ assignmentId: string; eventId: string; studentId: string; assignedLevelCode: string; slotId: string | null; assignmentSource: string; overriddenByUserId: string | null }> {
  const { data } = await api.post(`/admin/annual-competition/events/${eventId}/assignments/override`, payload);
  return data;
}

// ---------------------------------------------------------------------------
// Annual Competition -- Scoring + Results (Package 6). The computation/
// rank/release endpoints themselves shipped with Package 6 as API-only
// (see annual_competition_scoring_service.py); these client functions and
// the admin "RESULTS" tab are Package 7's addition -- the deliberately
// deferred "results-review screen."
// ---------------------------------------------------------------------------

export type AnnualCompetitionResultRow = {
  resultId: string;
  competitionLevelCode: string;
  score: number;
  maxScore: number;
  percentage: number;
  accuracyPercentage: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeTakenSeconds: number | null;
  perSectionTime: Array<Record<string, unknown>>;
  rank: number | null;
  releasedAt: string | null;
  attemptId: string;
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  isReleased: boolean;
};

export type AnnualCompetitionResultsList = {
  eventId: string;
  competitionLevelCode: string | null;
  totalResults: number;
  rows: AnnualCompetitionResultRow[];
};

export async function listAnnualCompetitionResults(eventId: string, competitionLevelCode?: string | null): Promise<AnnualCompetitionResultsList> {
  const { data } = await api.get<AnnualCompetitionResultsList>(`/admin/annual-competition/events/${eventId}/results`, {
    params: competitionLevelCode ? { competitionLevelCode } : undefined,
  });
  return data;
}

export async function rankAnnualCompetitionResults(eventId: string, competitionLevelCode: string): Promise<{ eventId: string; competitionLevelCode: string; rankedCount: number }> {
  const { data } = await api.post(`/admin/annual-competition/events/${eventId}/results/rank`, { competitionLevelCode });
  return data;
}

export async function releaseAnnualCompetitionResults(eventId: string, competitionLevelCode?: string | null): Promise<{ eventId: string; competitionLevelCode: string | null; releasedCount: number }> {
  const { data } = await api.post(`/admin/annual-competition/events/${eventId}/results/release`, { competitionLevelCode: competitionLevelCode || null });
  return data;
}

// Package 8 (certificate half). Admin download bypasses the release gate
// entirely (matches this table's own "admin always sees everything"
// convention) -- useful to preview/print a certificate before releasing.
export async function downloadAnnualCompetitionCertificate(attemptId: string): Promise<Blob> {
  const { data } = await api.get(`/admin/annual-competition/attempts/${attemptId}/certificate`, {
    responseType: "blob",
  });
  return data;
}

// Point 10 (Shailesh, 2026-09-08): refreshes already-finalized results
// under the current scoring formula -- see RecomputeAnnualCompetitionResults's
// own docstring (annual_competition_scoring_service.py). Never touches
// release/rank state.
export async function recomputeAnnualCompetitionResults(
  eventId: string,
  competitionLevelCode?: string | null
): Promise<{ eventId: string; competitionLevelCode: string | null; recomputedCount: number }> {
  const { data } = await api.post(`/admin/annual-competition/events/${eventId}/results/recompute`, {
    competitionLevelCode: competitionLevelCode || null,
  });
  return data;
}

// REQUIREMENTS.md item 6 -- the admin-only "technical issue" single-retake
// override (GrantAnnualCompetitionAttemptRetry). Was API-only until this
// Results-page button (Point 10).
export type AnnualCompetitionRetryGrant = {
  grantId: string;
  eventId: string;
  assignmentId: string;
  studentId: string;
  grantedByUserId: string | null;
  reason: string;
  status: string;
  grantedAt: string | null;
  usedAt: string | null;
  usedAttemptId: string | null;
};

export async function grantAnnualCompetitionAttemptRetry(attemptId: string, reason: string): Promise<AnnualCompetitionRetryGrant> {
  const { data } = await api.post(`/admin/annual-competition/attempts/retry-grants`, { attemptId, reason });
  return data;
}

export async function listAnnualCompetitionAttemptRetryGrants(eventId: string): Promise<{ grants: AnnualCompetitionRetryGrant[] }> {
  const { data } = await api.get(`/admin/annual-competition/events/${eventId}/attempts/retry-grants`);
  return data;
}

// Point 7 (Shailesh, 2026-09-08): admin per-question attempt review --
// mirrors GetCompetitionEventAttemptReviewForAdmin's payload verbatim
// (annual_competition_attempt_service.py). Typed-answer shape throughout
// (studentAnswer/correctAnswer), matching Point 8's DPS-style attempt UI --
// not Competition Mock's MCQ-options shape.
export type AnnualCompetitionAttemptReviewQuestion = {
  questionId: string;
  questionNumber: number;
  displayType: string | null;
  questionText: string | null;
  operands: Array<number | string>;
  operators: string[];
  studentAnswer: string | null;
  correctAnswer: string | null;
  isUnanswered: boolean;
  isCorrect: boolean;
};

export type AnnualCompetitionAttemptReviewSection = {
  sectionNumber: number;
  sectionTitle: string | null;
  mode: string | null;
  status: string;
  timeLimitSeconds: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  questions: AnnualCompetitionAttemptReviewQuestion[];
};

export type AnnualCompetitionAttemptReview = {
  attemptId: string;
  eventId: string;
  eventName: string | null;
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  assignedLevelCode: string | null;
  // Phase E (Competition Practice): "OFFICIAL" or "PRACTICE" -- assignedLevelCode
  // above now reads correctly for both (see the backend's own Phase E note on
  // GetCompetitionEventAttemptReviewForAdmin), this just makes which kind the
  // review is FOR visible in the UI too.
  attemptType: string;
  status: string;
  startedAt: string | null;
  submittedAt: string | null;
  result: {
    score: number;
    maxScore: number;
    percentage: number;
    accuracyPercentage: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
    timeTakenSeconds: number | null;
    rank: number | null;
    isReleased: boolean;
    isVoided: boolean;
  } | null;
  sections: AnnualCompetitionAttemptReviewSection[];
};

export async function getAnnualCompetitionAttemptReview(attemptId: string): Promise<AnnualCompetitionAttemptReview> {
  const { data } = await api.get<AnnualCompetitionAttemptReview>(`/admin/annual-competition/attempts/${attemptId}/review`);
  return data;
}

// ---------------------------------------------------------------------------
// Annual Competition -- Teacher/Admin Monitoring (Package 7). Types mirror
// annual_competition_monitoring_service.py's payloads verbatim.
// ---------------------------------------------------------------------------

export type AnnualCompetitionLiveMonitoringRow = {
  assignmentId: string;
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  className: string | null;
  section: string | null;
  assignedLevelCode: string;
  slot: { slotId: string; mode: string; slotLabel: string | null; scheduledStartAt: string | null; scheduledEndAt: string | null } | null;
  attemptId: string | null;
  attemptStatus: string;
  liveStatus: "NOT_STARTED" | "IN_PROGRESS" | "STUCK" | "SUBMITTED" | "FINALIZED";
  currentSectionNumber: number | null;
  remainingSecondsAtLastHeartbeat: number | null;
  lastHeartbeatAt: string | null;
  heartbeatGapSeconds: number | null;
};

export type AnnualCompetitionLiveMonitoring = {
  eventId: string;
  eventName: string;
  eventStatus: string;
  generatedAt: string;
  summary: {
    totalCount: number;
    notStartedCount: number;
    inProgressCount: number;
    stuckCount: number;
    submittedCount: number;
    finalizedCount: number;
  };
  rows: AnnualCompetitionLiveMonitoringRow[];
};

export async function getAnnualCompetitionLiveMonitoring(eventId: string, slotId?: string | null): Promise<AnnualCompetitionLiveMonitoring> {
  const { data } = await api.get<AnnualCompetitionLiveMonitoring>(`/admin/annual-competition/events/${eventId}/monitoring/live`, {
    params: slotId ? { slotId } : undefined,
  });
  return data;
}

export async function reconcileAnnualCompetitionAttempts(eventId: string): Promise<{ reconciledCount: number; attemptIds: string[] }> {
  const { data } = await api.post(`/admin/annual-competition/events/${eventId}/attempts/reconcile`, {});
  return data;
}

// ---------------------------------------------------------------------------
// Annual Competition -- Practice (Phase C/E admin surfaces; fully decoupled
// from any event + bulk assignment, 2026-09-12: "the practice papers should
// not be related to any event whatsoever ... it allows the admin to just
// assign papers to all the students"). Deliberately separate types/functions
// from the OFFICIAL ones above -- practice papers are per-student bank rows,
// never ranked, and always released the instant they're scored, so their
// shapes genuinely differ (no rank/isReleased columns worth showing, a
// student can have many results overall). None of these functions take an
// eventId. Quantity must be a whole multiple of 5, capped at 25 per batch
// (see _ValidatePracticeBatchQuantity in annual_competition_studio_service.py).
// ---------------------------------------------------------------------------

export const PRACTICE_BATCH_QUANTITY_OPTIONS = [5, 10, 15, 20, 25] as const;

// Matches PRACTICE_BULK_MAX_STUDENTS_PER_CALL in annual_competition_studio_
// service.py -- this backend has no background job queue, so bulk practice
// generation runs synchronously in-request. This is a flat, absolute
// ceiling on students-per-call regardless of quantity; the REAL chunk-size
// calculation the frontend actually uses (see BulkAssignMutation in
// annual-studio/page.tsx) additionally bounds by total PAPER count via
// PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL below, which is the tighter,
// more accurate bound that actually protects against a timeout.
export const PRACTICE_BULK_MAX_STUDENTS_PER_CALL = 25;

// 2026-09-16 (Shailesh, 504 fix -- "we need to make sure this never happens
// ... bulletproof end to end"): live bug -- a bulk practice-paper assign to
// multiple students failed with a 504 from the reverse-proxy in front of
// this backend. Root cause: PRACTICE_BULK_MAX_STUDENTS_PER_CALL alone
// bounds how many STUDENTS one call covers, but not how much total work
// that really is -- each paper is a full synchronous generation (this
// backend has no background job queue), and the two multiply freely.
// PRACTICE_BATCH_MAX_QUANTITY (see that constant's own comment, backend
// side) already establishes 25 papers for ONE student -- even at the
// heaviest level -- as an already-accepted, comfortably-safe workload; this
// reuses that as its calibration anchor rather than guessing a fresh
// number: 5x that single-student ceiling. Generous enough that an ordinary
// bulk action rarely needs more than a couple of chunks, while still
// forcing the previous worst case (25 students x 25 papers = 625 papers)
// into several smaller, safer calls instead of one giant one. Matches
// PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL in annual_competition_studio_
// service.py -- keep both in sync; the backend enforces this as a hard
// validation (so a call this frontend forgot to chunk correctly fails fast
// with a clear error instead of running long and dying ambiguously at the
// gateway), the frontend uses the same number to size its chunks so that
// rejection should not actually happen in normal use.
export const PRACTICE_BULK_MAX_TOTAL_PAPERS_PER_CALL = 125;

export type AnnualCompetitionPracticeBankPaper = {
  levelPaperId: string;
  competitionLevelCode: string;
  status: string;
  assignedAt: string | null;
  consumedAt: string | null;
  isConsumed: boolean;
};

export type AnnualCompetitionPracticeBank = {
  studentId: string;
  studentCode: string | null;
  competitionLevelCode: string | null;
  totalAssigned: number;
  consumedCount: number;
  remainingCount: number;
  papers: AnnualCompetitionPracticeBankPaper[];
};

export async function getAnnualCompetitionPracticeBank(
  studentId: string,
  competitionLevelCode?: string | null
): Promise<AnnualCompetitionPracticeBank> {
  const { data } = await api.get<AnnualCompetitionPracticeBank>(`/admin/annual-competition/practice-bank`, {
    params: { studentId, competitionLevelCode: competitionLevelCode || undefined },
  });
  return data;
}

// The roster the Practice Bank student picker lists from -- every active
// student tagged with the Annual Competition level they're currently
// eligible for (computed the same way the OFFICIAL assignment engine
// would), so the admin can select all, many, or a filtered subset before
// assigning practice papers.
export type AnnualCompetitionPracticeBankStudentRow = {
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  currentModuleCode: string | null;
  currentLevelCode: string | null;
  // 2026-09-15 (Shailesh): same Master-module lesson info as
  // AnnualCompetitionAssignmentPreviewRow above -- see that type's comment.
  currentLessonNumber: number | null;
  masterLevelComplete: boolean | null;
  eligibleCompetitionLevelCode: string | null;
};

export type AnnualCompetitionPracticeBankStudentsList = {
  totalStudents: number;
  students: AnnualCompetitionPracticeBankStudentRow[];
};

export async function listStudentsForAnnualCompetitionPracticeBank(): Promise<AnnualCompetitionPracticeBankStudentsList> {
  const { data } = await api.get<AnnualCompetitionPracticeBankStudentsList>(`/admin/annual-competition/practice-bank/students`);
  return data;
}

export type AnnualCompetitionPracticeBatchAssignSucceededRow = {
  studentId: string;
  studentCode: string | null;
  quantityAssigned: number;
};

export type AnnualCompetitionPracticeBatchAssignFailedRow = {
  studentIdentifier: string;
  reason: string;
};

export type AnnualCompetitionPracticeBatchAssignResult = {
  competitionLevelCode: string;
  quantityPerStudent: number;
  studentsRequested: number;
  studentsSucceeded: number;
  studentsFailed: number;
  totalPapersAssigned: number;
  succeeded: AnnualCompetitionPracticeBatchAssignSucceededRow[];
  failed: AnnualCompetitionPracticeBatchAssignFailedRow[];
};

// 2026-09-22 (Shailesh, live incident: a single-student, 25-paper batch
// assign genuinely succeeded server-side -- papers landed in the bank --
// but the admin still saw "This batch call did not complete", because the
// full round trip (25x paper generation, each with its own DB writes, plus
// the post-generation per-student/teacher/admin notification loop --
// BatchAssignAnnualCompetitionPracticePapers's own docstring) ran long
// enough to exceed this call's timeout, which was previously just the
// generic DEFAULT_API_TIMEOUT_MS (90s, api.ts) with no override -- unlike
// bulkUploadStudents (120s) and the mock-exam draft generator (60s) above,
// both of which already give their own heavy actions explicit headroom.
// 180s matches the same "give a known-heavy action its own generous
// ceiling" pattern rather than inflating the shared default for every
// other call on this instance.
export async function batchAssignAnnualCompetitionPracticePapers(payload: {
  studentIds: string[];
  competitionLevelCode: string;
  quantity: number;
}): Promise<AnnualCompetitionPracticeBatchAssignResult> {
  const { data } = await api.post<AnnualCompetitionPracticeBatchAssignResult>(
    `/admin/annual-competition/practice-bank/assign`,
    payload,
    { timeout: 180000 }
  );
  return data;
}

// 2026-09-14 (Shailesh, "show all papers, not just submitted, on
// expanding a student block"): rewired from a flat list of submitted
// results to a per-student roster of every practice paper (pending AND
// submitted), ascending by assignment order -- see
// ListAnnualCompetitionPracticeResultsForAdmin's own docstring in
// annual_competition_scoring_service.py.
export type AnnualCompetitionPracticeResult = {
  resultId: string;
  competitionLevelCode: string;
  score: number;
  maxScore: number;
  percentage: number;
  accuracyPercentage: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  timeTakenSeconds: number | null;
  perSectionTime: Array<Record<string, unknown>>;
  rank: number | null;
  computedAt: string | null;
  releasedAt: string | null;
  isVoided: boolean;
  voidedReason: string | null;
  voidedAt: string | null;
};

export type AnnualCompetitionPracticeRosterPaper = {
  levelPaperId: string;
  attemptId: string | null;
  competitionLevelCode: string;
  // levelPaperId/paperOrdinal/paperLabel (2026-09-14, Shailesh -- "Practice
  // Paper 1, 2 and so on"): stable per (student, competitionLevelCode)
  // numbering computed server-side by ComputePracticePaperOrdinals, so it
  // reads identically here and in the student/teacher surfaces -- never
  // recompute this client-side.
  paperOrdinal: number | null;
  paperLabel: string;
  // NOT_STARTED for a pending (never-attempted) paper; otherwise the
  // underlying CompetitionEventAttempt's own status (IN_PROGRESS/FINALIZED).
  status: string;
  assignedAt: string | null;
  submittedAt: string | null;
  result: AnnualCompetitionPracticeResult | null;
};

export type AnnualCompetitionPracticeRosterStudent = {
  studentId: string;
  studentCode: string | null;
  studentName: string | null;
  papers: AnnualCompetitionPracticeRosterPaper[];
};

export type AnnualCompetitionPracticeResultsList = {
  competitionLevelCode: string | null;
  studentId: string | null;
  totalStudents: number;
  students: AnnualCompetitionPracticeRosterStudent[];
};

export async function listAnnualCompetitionPracticeResults(filters?: {
  competitionLevelCode?: string | null;
  studentId?: string | null;
  // 2026-09-16 (Shailesh, Practice Reports UI redesign): "the admin can see
  // the students teacher wise as well" -- admin-only narrowing, mirrors the
  // level/student filters server-side; a teacher's own roster endpoint
  // never needs this since it's already scoped to their own students.
  teacherId?: string | null;
}): Promise<AnnualCompetitionPracticeResultsList> {
  const { data } = await api.get<AnnualCompetitionPracticeResultsList>(`/admin/annual-competition/practice-results`, {
    params: {
      competitionLevelCode: filters?.competitionLevelCode || undefined,
      studentId: filters?.studentId || undefined,
      teacherId: filters?.teacherId || undefined,
    },
  });
  return data;
}

// 2026-09-14 (Shailesh): admin Practice delete icons -- per-row (works on
// a pending OR submitted row, keyed by levelPaperId since a pending row
// has no attempt) and per-student-block ("delete all", Practice-only,
// that student's OFFICIAL Annual Competition record is untouched). See
// DeleteAnnualCompetitionPracticeAttempt/
// DeleteAllAnnualCompetitionPracticeRecordsForStudent's own docstrings.
export async function deleteAnnualCompetitionPracticeAttempt(levelPaperId: string) {
  const { data } = await api.delete(`/admin/annual-competition/practice/attempt/${levelPaperId}`);
  return data;
}

export async function deleteAllAnnualCompetitionPracticeRecordsForStudent(studentId: string) {
  const { data } = await api.delete(`/admin/annual-competition/practice/student/${studentId}`);
  return data;
}

// 2026-09-14 (Shailesh, accuracy-formula backfill): recomputes every
// already-finalized OFFICIAL result across every event (RecomputeAnnual-
// CompetitionResults with EventId=None) or every PRACTICE result
// (RecomputeAnnualCompetitionPracticeResults) under the corrected
// (attempted-questions) accuracy formula. Never touches is_released/rank.
export async function recomputeAllAnnualCompetitionOfficialResults(
  competitionLevelCode?: string | null
): Promise<{ competitionLevelCode: string | null; recomputedCount: number }> {
  const { data } = await api.post(`/admin/annual-competition/results/recompute-all`, {
    competitionLevelCode: competitionLevelCode || undefined,
  });
  return data;
}

export async function recomputeAnnualCompetitionPracticeResults(
  competitionLevelCode?: string | null
): Promise<{ competitionLevelCode: string | null; recomputedCount: number }> {
  const { data } = await api.post(`/admin/annual-competition/practice-results/recompute`, {
    competitionLevelCode: competitionLevelCode || undefined,
  });
  return data;
}

// ---------------------------------------------------------------------------
// Practice Reports (package 2/3, Shailesh, 2026-09-16): per-student and
// per-level analytics over Annual Competition PRACTICE attempts -- see
// annual_competition_practice_report_service.py's own module docstring for
// the full design (every "avg" is an attempt-weighted mean; level-filter
// semantics below).
// ---------------------------------------------------------------------------

export type AnnualCompetitionPracticeReportSummary = {
  attemptsCount: number;
  avgScore: number | null;
  avgMaxScore: number | null;
  avgPercentage: number | null;
  avgAccuracyPercentage: number | null;
  avgTimeTakenSeconds: number | null;
  papersAssignedCount: number;
  papersCompletedCount: number;
};

export type AnnualCompetitionPracticeReportSectionRow = {
  sectionNumber: number;
  // 2026-09-17 (Shailesh: "the section number and section names should
  // appear everywhere relevant") -- the section's real title from its
  // level's own registry, e.g. "Add/Less (Abacus)". null only if the level
  // code is somehow unrecognized (defensive; should not happen in practice).
  sectionTitle: string | null;
  attemptsCount: number;
  avgScore: number | null;
  avgMaxScore: number | null;
  avgAttemptedCount: number | null;
  avgTotalQuestions: number | null;
  avgAccuracyPercentage: number | null;
  avgTimeTakenSeconds: number | null;
  timeLimitSeconds: number | null;
};

export type AnnualCompetitionPracticeReportTrendRow = {
  attemptId: string;
  computedAt: string | null;
  score: number;
  maxScore: number;
  percentage: number;
  accuracyPercentage: number;
  timeTakenSeconds: number | null;
};

// One row per level the student has ever practiced, only populated when the
// student report is requested with no level filter ("All Levels") -- see
// GetAnnualCompetitionPracticeReportForStudent's own docstring for why this
// blended view has no per-section table (paper structures differ level to
// level, so a section-by-section blend across levels would not mean
// anything).
export type AnnualCompetitionPracticeReportByLevelRow = AnnualCompetitionPracticeReportSummary & {
  competitionLevelCode: string;
  lastAttemptAt: string | null;
};

// Only populated when the student report IS scoped to one level -- this
// student's own averages against that level's whole cohort (every student
// who has practiced it), computed the same attempt-weighted way.
export type AnnualCompetitionPracticeReportLevelComparison = {
  cohortAttemptsCount: number;
  cohortStudentsCount: number;
  cohortAvgScore: number | null;
  cohortAvgMaxScore: number | null;
  cohortAvgPercentage: number | null;
  cohortAvgAccuracyPercentage: number | null;
  cohortAvgTimeTakenSeconds: number | null;
};

export type AnnualCompetitionPracticeReportForStudent = {
  studentId: string;
  studentName: string | null;
  studentCode: string | null;
  // null means "All Levels" (blended) -- byLevel is populated instead of
  // perSection/trend/levelComparison in that case. See this type's own
  // fields below and the service module's docstring.
  competitionLevelCode: string | null;
  summary: AnnualCompetitionPracticeReportSummary;
  perSection: AnnualCompetitionPracticeReportSectionRow[];
  trend: AnnualCompetitionPracticeReportTrendRow[];
  byLevel: AnnualCompetitionPracticeReportByLevelRow[];
  levelComparison: AnnualCompetitionPracticeReportLevelComparison | null;
};

// competitionLevelCode is OPTIONAL here, unlike the level report below --
// 2026-09-16 (Shailesh): "the same student would not be in the same level
// [across annual cycles] ... it would still be better to have a level
// filter for the student data analytics." Omit it (or pass null/undefined)
// for the blended "All Levels" view.
export async function getAnnualCompetitionPracticeReportForStudent(
  studentId: string,
  competitionLevelCode?: string | null
): Promise<AnnualCompetitionPracticeReportForStudent> {
  const { data } = await api.get<AnnualCompetitionPracticeReportForStudent>(
    `/admin/annual-competition/practice-reports/student/${studentId}`,
    { params: { competitionLevelCode: competitionLevelCode || undefined } }
  );
  return data;
}

export type AnnualCompetitionPracticeReportStudentRow = AnnualCompetitionPracticeReportSummary & {
  studentId: string;
  studentName: string | null;
  studentCode: string | null;
  lastAttemptAt: string | null;
  // 2026-09-18 (Practice Leaderboard feature): 1-based rank within this
  // level's perStudent array, highest avg accuracy first, avg time
  // ascending as tiebreak -- see GetAnnualCompetitionPracticeReportForLevel's
  // own comment. The pre-existing "Individual Level" report tab already
  // rendered these rows in this same order; this field just makes that
  // order an explicit, addressable number instead of only array position.
  rank: number;
};

export type AnnualCompetitionPracticeReportForLevel = {
  competitionLevelCode: string;
  summary: AnnualCompetitionPracticeReportSummary & { studentsWithAttemptsCount: number };
  perSection: AnnualCompetitionPracticeReportSectionRow[];
  // Sorted server-side, highest avgAccuracyPercentage first (leaderboard
  // order) -- see GetAnnualCompetitionPracticeReportForLevel's own docstring.
  perStudent: AnnualCompetitionPracticeReportStudentRow[];
};

// competitionLevelCode is REQUIRED here -- 2026-09-16 (Shailesh): "for the
// level scoped analytics there we will ofc need level filters ... we need
// to see the level scoped data for all the levels" -- a cohort average
// blended across different levels' different papers would not mean
// anything, so there is no "all levels" mode on this one, unlike the
// student report above.
export async function getAnnualCompetitionPracticeReportForLevel(
  competitionLevelCode: string
): Promise<AnnualCompetitionPracticeReportForLevel> {
  const { data } = await api.get<AnnualCompetitionPracticeReportForLevel>(
    `/admin/annual-competition/practice-reports/level/${competitionLevelCode}`
  );
  return data;
}

// Analytics Visualization feature, package 1 (Shailesh, 2026-09-22): the
// cross-level Overview row backing the new admin-only Visualization
// sub-tab's level-comparison chart. avgPercentage on each row is already
// rebased onto that level's own canonical total question count server-side
// -- see GetAnnualCompetitionPracticeReportOverview's own docstring -- so
// it is directly comparable across levels with no further adjustment here.
export type AnnualCompetitionPracticeReportOverviewRow = AnnualCompetitionPracticeReportSummary & {
  competitionLevelCode: string;
  studentsWithAttemptsCount: number;
};

export type AnnualCompetitionPracticeReportOverview = {
  byLevel: AnnualCompetitionPracticeReportOverviewRow[];
};

export async function getAnnualCompetitionPracticeReportOverview(): Promise<AnnualCompetitionPracticeReportOverview> {
  const { data } = await api.get<AnnualCompetitionPracticeReportOverview>(
    "/admin/annual-competition/practice-reports/overview"
  );
  return data;
}
