# Package 4 (Phase 4): Section-Timer + Pause Engine

## Objective
The highest-risk, most novel piece of this build. Independently timed
sections with genuine pause-on-disconnect -- nothing like this exists
anywhere in this codebase today (DPS/Assessment/Competition Mock all use
one whole-attempt wall-clock timer with no pause concept). Built and
tested in isolation with synthetic attempts before it is wired into any
student-facing screen.

## Status: NOT STARTED

## Checklist

### 1. Heartbeat mechanic
- [ ] Client sends a heartbeat every ~5-10s while a section is active.
- [ ] Server persists `remaining_seconds_at_last_heartbeat` +
      `last_heartbeat_at` on the matching
      `CompetitionEventAttemptSectionState` row on **every single**
      heartbeat -- never batched, so a server restart mid-competition
      never loses more than one heartbeat interval.
- [ ] A fixed grace window (30-60s) absorbs normal network jitter before a
      gap between heartbeats counts as elapsed time.
- [ ] No explicit "disconnect" event -- absence of heartbeats past the
      grace window is the only pause signal, since this repo has no
      WebSocket infrastructure.

### 2. Single-active-session guard
- [ ] Attempt-start issues a fresh `session_token`.
- [ ] Heartbeat/answer/submit calls carrying a stale token are rejected
      with a "resume here" signal, not silently accepted.

### 3. Auto-advance + finalization
- [ ] Any request touching an attempt lazily checks whether the active
      section's remaining time has hit zero (same pattern as
      `EnsureCompetitionAttemptActiveOrSubmit`); if so, finalizes that
      section and opens the next one, or finalizes the whole attempt on
      the last section.
- [ ] Reconciliation sweep: a lightweight endpoint (admin-triggered, or
      run once post-event) that finalizes any attempt whose last section
      expired but was never followed by another request -- there is no
      scheduler/cron anywhere in this backend, so nothing else would ever
      touch that row.

### 4. Verification (highest coverage of any package)
- [ ] Heartbeat gap under the grace window -> no time lost.
- [ ] Heartbeat gap over the grace window -> correct elapsed time deducted
      on resume.
- [ ] Stale `session_token` rejected on every mutating endpoint.
- [ ] Section auto-advances at exactly zero remaining time.
- [ ] Whole-attempt finalization triggers correctly on the last section.
- [ ] Reconciliation sweep catches an attempt nobody ever touches again
      after its last section expires.
- [ ] All of the above run against synthetic attempts only -- no student
      UI involved yet.
