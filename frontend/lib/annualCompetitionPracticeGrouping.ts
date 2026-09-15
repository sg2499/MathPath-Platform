// 2026-09-15 (Shailesh): "for the grouping of levels in the student blocks,
// lets do that for both teacher and admin login" -- when a student's row is
// expanded in the Teacher practice tab or the Admin Practice Results tab,
// their papers used to be listed in one long flat table mixing every level
// together. This groups them into per-level sections instead, same idea as
// the student side's own per-level collapsible blocks
// (student/competition/annual/page.tsx).
//
// 2026-09-15 (Shailesh, same day, follow-up): "the individual student block
// must contain the different level blocks under it which should be
// expandable and collapseable and by default collapsed ... right now
// everything is expanded ... which makes the page look very clumsy and
// weird." The collapse/expand state itself lives in each page
// (admin/competition/annual-studio/page.tsx's ExpandedPracticeLevelGroups,
// teacher/competition/annual/page.tsx's own copy) rather than here -- this
// function only groups and orders the papers; it stays a pure, stateless
// helper on purpose.
//
// Shared by both admin/competition/annual-studio/page.tsx and
// teacher/competition/annual/page.tsx since they use the exact same
// student->papers roster shape (AnnualCompetitionPracticeRosterStudent /
// TeacherAnnualCompetitionPracticeRosterStudent -- structurally identical,
// just named differently per role's own API module).
//
// Preserves order: the levels appear in first-seen order (papers already
// arrive pre-sorted by paperOrdinal within a student, ascending, oldest
// assignment batch first), and each level's own papers keep that same
// relative order -- this never re-sorts anything, only groups it.
export function GroupPracticePapersByLevel<PaperType extends { competitionLevelCode: string }>(
  Papers: PaperType[]
): { LevelCode: string; Papers: PaperType[] }[] {
  const Groups: { LevelCode: string; Papers: PaperType[] }[] = [];
  const GroupByLevelCode = new Map<string, PaperType[]>();

  for (const Paper of Papers) {
    let Bucket = GroupByLevelCode.get(Paper.competitionLevelCode);
    if (!Bucket) {
      Bucket = [];
      GroupByLevelCode.set(Paper.competitionLevelCode, Bucket);
      Groups.push({ LevelCode: Paper.competitionLevelCode, Papers: Bucket });
    }
    Bucket.push(Paper);
  }

  return Groups;
}
