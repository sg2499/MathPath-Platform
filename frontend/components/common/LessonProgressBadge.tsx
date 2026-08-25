import { CheckCircle2 } from "lucide-react";

export interface LessonProgressBadgeProps {
  currentLessonNumber?: number | null;
  clearedInCurrentLesson?: number;
  totalInCurrentLesson?: number;
  levelComplete?: boolean;
  previousLessonNumber?: number | null;
  className?: string;
}

// Shared "where is this student right now" indicator, derived live from
// Attempt.cleared_at_attempt on the backend (see lesson_progress_service.py)
// -- never a stored/stale pointer, so this badge is always correct as of
// the moment it renders. Used on both Assign Practice (per student card)
// and My Students (as a table column) so teachers see one consistent tag
// wherever they look.
//
// Two states:
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

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      <span className="math-badge border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
        Lesson {currentLessonNumber} · {clearedInCurrentLesson}/{totalInCurrentLesson} Cleared
      </span>
      {showJustAdvancedChip ? (
        <span className="math-badge border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
          <CheckCircle2 size={12} />
          Lesson {previousLessonNumber} Cleared
        </span>
      ) : null}
    </span>
  );
}
