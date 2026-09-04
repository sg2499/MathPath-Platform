# Annual Competition — Plan of Action

**Status: requirements gathered, plan not yet locked.** This is a stub, not
a phase-by-phase build plan like `competition-mock-practice-plan.md` — do
not treat it as approved scope. Full requirements, both source client
documents, the seven outstanding confirmations, and the relationship to the
already-shipped Competition Mock feature are in
`docs/project-memory/annual-competition/REQUIREMENTS.md`. Read that file in
full before doing any design or implementation work here.

## Why this isn't a full phase plan yet

Shailesh has not yet decided between:
(a) scope and build the fully-confirmed parts now (level auto-assignment,
    Bridge/Master Module placement, schedule/slot data, section timers,
    pause-on-disconnect, frozen shared-paper-per-level generation) while
    treating the seven open items as configurable placeholders, or
(b) hold off on anything touching those seven open items until MathPath
    (the client) answers them, and only scaffold the fully-confirmed parts.

Do not start Phase 1-style scope-lock work here until that decision is
recorded in this file or in `docs/project-memory/annual-competition/REQUIREMENTS.md`.

## What's already known to be genuinely new (not a Competition Mock extension)

- A frozen, identical-paper-per-competition-level generation path (Competition
  Mock's existing engines randomize per attempt; the real event must not).
- Student-group → competition-level auto-assignment, including the Bridge
  and Master Module lesson-milestone placement rules.
- Real scheduling: a single dated event with fixed per-group time slots
  (offline centre slots + two online slots), not an always-available pool.
- Pause/resume-on-disconnect for the *live* competition attempt specifically
  (DPS already has an analogous resume flow to reference).
- Results/ranking/certificate persistence — none of this exists today; the
  current leaderboard is computed at query time, not stored.

## What's still unresolved before any of the above can be fully speced

See "Seven outstanding confirmations" in
`docs/project-memory/annual-competition/REQUIREMENTS.md` — do not invent
answers to these in code; treat them as configuration TBD or ask again.
