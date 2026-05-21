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
    selectedOption: { label: string; value: string } | null;
    correctOption: { label: string; value: string } | null;
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
  lessonDistribution: AssessmentBlueprintLessonDistribution[];
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
  lessonDistribution: Array<{
    lessonId: string;
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
  lessonId: string;
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

export type AssessmentGeneratedLessonGroup = {
  lessonId: string;
  lessonNumber: number | null;
  lessonTitle: string | null;
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
  recipientEmail: string;
  recipientType: string;
  fileName?: string | null;
  status: string;
  sentAt?: string | null;
  createdAt?: string | null;
  sentBy?: string | null;
  errorMessage?: string | null;
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

export type ParentReportRecipientMode = "FATHER" | "MOTHER" | "BOTH" | "CUSTOM";
export type ParentReportResendRecipientMode = ParentReportRecipientMode | "SAME";

export type SendParentProgressReportPayload = StudentHistoryParams & {
  recipientMode: ParentReportRecipientMode;
  customEmail?: string;
};

export type SendParentProgressReportResponse = {
  sent: boolean;
  message: string;
  recipients: string[];
  fileName: string;
};

export async function sendAdminParentProgressReport(
  payload: SendParentProgressReportPayload,
): Promise<SendParentProgressReportResponse> {
  const { data } = await api.post<SendParentProgressReportResponse>(
    "/admin/results/send-parent-summary",
    payload,
  );
  return data;
}

export type ResendParentReportDeliveryPayload = {
  recipientMode?: ParentReportResendRecipientMode;
  customEmail?: string;
};

export async function resendAdminParentReportDelivery(
  deliveryId: string,
  payload: ResendParentReportDeliveryPayload = {},
): Promise<SendParentProgressReportResponse> {
  const { data } = await api.post<SendParentProgressReportResponse>(
    `/admin/results/parent-report-deliveries/${deliveryId}/resend`,
    payload,
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
