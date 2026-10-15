import { CheckCircle2 } from "lucide-react";
import type { TeacherLessonStatus } from "@/lib/api/teacher";
import { StudentJourney } from "@/components/common/LessonAssignmentStatus";

export interface LessonProgressBadgeProps {
  currentLessonNumber?: number | null;
  clearedInCurrentLesson?: number;
  totalInCurrentLesson?: number;
  levelComplete?: boolean;
  previousLessonNumber?: number | null;
  // ADDITIVE (Shailesh, 2026-09-15): the next lesson, in sequence, this
  // student is now eligible to be assigned -- see lesson_progress_service.py.
  // Only ever rendered when it differs from currentLessonNumber, since the
  // two coincide once the current lesson is fully cleared (currentLessonNumber
  // itself already walks forward in that case) and showing "Next: Lesson N"
  // next to "Lesson N" would just be redundant.
  nextEligibleLessonNumber?: number | null;
  // 2026-10-15: whether the current lesson has been given to the student.
  // Without it, "Lesson 5 · 0/5 Cleared" read the same before and after the
  // teacher assigned Lesson 5.
  currentLessonStatus?: TeacherLessonStatus | null;
  // No assignment history in this level yet ("New To This Level").
  isNewToLevel?: boolean;
  className?: string;
}

// Shared "where is this student right now" indicator, derived live from
// Attempt.cleared_at_attempt on the backend (see lesson_progress_service.py)
// -- never a stored/stale pointer, so this badge is always correct as of
// the moment it renders. Used on both Assign Practice (per student card)
// and My Students (as a table column) so teachers see one consistent tag
// wherever they look.
//
// 2026-10-15: when currentLessonStatus is passed, the pill also says
// whether that lesson has been given to the student -- "Lesson 5 · Not
// Assigned Yet", "Lesson 5 · Assigned · 0/5 Cleared", "Lesson 5 ·
// Scheduled from Mon 20 Oct" -- so a teacher can tell a student who still
// needs the next lesson from one who already has it.
//
// States:
//  - Level Complete: every lesson in the student's current level is fully
//    cleared -- a single emerald pill, nothing else to show.
//  - In progress: violet "Lesson N · x/y Cleared" pill (matches the
//    existing .math-badge pill system's unused violet tone). When the
//    student has just advanced into this lesson (0 cleared here yet) and a
//    previous lesson was cleared, a small secondary emerald "Lesson N-1
//    Cleared" chip appears alongside it -- this is what makes a
//    just-advanced student visually distinguishable from one who has never
//    started, without either state looking cluttered.
export function LessonProgressBadge({
  currentLessonNumber,
  clearedInCurrentLesson = 0,
  totalInCurrentLesson = 0,
  levelComplete = false,
  previousLessonNumber,
  currentLessonStatus,
  isNewToLevel = false,
  className = "",
}: LessonProgressBadgeProps) {
  if (levelComplete) {
    return (
      <span className={`math-badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 ${className}`}>
        <CheckCircle2 size={12} />
        Level Complete
      </span>
    );
  }

  if (!currentLessonNumber) {
    return null;
  }

  const showJustAdvancedChip = clearedInCurrentLesson === 0 && Boolean(previousLessonNumber);

  // Without the per-lesson status (older callers) keep the plain pill.
  if (currentLessonStatus === undefined) {
    return (
      <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
        <span className="math-badge border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200" data-current-lesson-state="UNKNOWN">
          Lesson {currentLessonNumber} · {clearedInCurrentLesson}/{totalInCurrentLesson} Cleared
        </span>
      </span>
    );
  }

  // 2026-10-15: one status about the student -- Needs Lesson N / Working On
  // Lesson N / Lesson N Scheduled / New To This Level (see StudentJourney).
  const Journey = StudentJourney({
    currentLessonNumber,
    clearedInCurrentLesson,
    totalInCurrentLesson,
    levelComplete,
    isNewToLevel,
    currentLessonStatus,
  });

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className={`math-badge ${Journey.tone}`} data-current-lesson-state={Journey.kind} data-needs-assigning={Journey.needsAssigning ? "1" : "0"}>
        {Journey.label}
      </span>
      {Journey.detail ? (
        <span className={`math-badge font-bold ${Journey.tone}`} data-current-lesson-detail>
          {Journey.detail}
        </span>
      ) : null}
      {showJustAdvancedChip ? (
        <span className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 size={12} />
          Lesson {previousLessonNumber} Cleared
        </span>
      ) : null}
    </span>
  );
}
