import type { TeacherStudent } from "@/lib/api/teacher";

// 2026-10 (teacher revamp, fix E): a leaderboard opened without a module in
// its address used to show the first module in the list (Young Learners, one
// student) even when most of the teacher's students are in another module.
// It now opens on the module most of the teacher's active students are in;
// ties, or no students, keep the list's own order.
export function PickTeacherDefaultModuleId(
  Modules: { id: string }[],
  Students: TeacherStudent[] | null | undefined,
): string | null {
  if (Modules.length === 0) return null;
  const Counts = new Map<string, number>();
  for (const Student of Students ?? []) {
    if (Student.isActive === false || !Student.currentModuleId) continue;
    Counts.set(Student.currentModuleId, (Counts.get(Student.currentModuleId) ?? 0) + 1);
  }
  let Best = Modules[0].id;
  let BestCount = Counts.get(Best) ?? 0;
  for (const Module of Modules) {
    const Count = Counts.get(Module.id) ?? 0;
    if (Count > BestCount) {
      Best = Module.id;
      BestCount = Count;
    }
  }
  return Best;
}


// The same idea one step down: within the chosen module, open on the level
// most of the teacher's active students are at (else the module's first).
export function PickTeacherDefaultLevelId(
  Levels: { id: string; moduleId: string }[],
  ModuleId: string | null,
  Students: TeacherStudent[] | null | undefined,
): string | null {
  const ModuleLevels = Levels.filter((Level) => Level.moduleId === ModuleId);
  if (ModuleLevels.length === 0) return null;
  const Counts = new Map<string, number>();
  for (const Student of Students ?? []) {
    if (Student.isActive === false || !Student.currentLevelId) continue;
    Counts.set(Student.currentLevelId, (Counts.get(Student.currentLevelId) ?? 0) + 1);
  }
  let Best = ModuleLevels[0].id;
  let BestCount = Counts.get(Best) ?? 0;
  for (const Level of ModuleLevels) {
    const Count = Counts.get(Level.id) ?? 0;
    if (Count > BestCount) {
      Best = Level.id;
      BestCount = Count;
    }
  }
  return Best;
}
