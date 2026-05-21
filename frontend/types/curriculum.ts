export type ModuleItem = {
  moduleId: string;
  moduleCode: string;
  moduleName: string;
  displayOrder: number;
  isActive: boolean;
};

export type LevelItem = {
  levelId: string;
  levelCode: string;
  levelName: string;
  internalLevelNumber?: number;
  displayOrder: number;
};

export type LessonItem = {
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  dpsCount: number;
  isActive: boolean;
};

export type DpsItem = {
  dpsId: string;
  dpsNumber: number;
  dpsTitle: string;
  questionCount: number;
  durationSeconds: number;
  layoutTemplate: string;
  answerType: "MCQ";
  optionsPerQuestion: 4;
  publicationStatus?: "DRAFT" | "PUBLISHED" | "ARCHIVED" | string;
  publishedAt?: string | null;
  isActive: boolean;
};
