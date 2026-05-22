# Phase 10.9.4 — DPS Auto Re-Attempt Workflow

## Objective
Create a scalable DPS retry workflow where students receive a fresh practice sheet after an uncleared DPS attempt without requiring manual Admin approval for the first three retry cycles.

## Final Business Rules

### Attempt Chain
Each original DPS and all retries belong to one attempt chain.

- `AttemptNumber = 0` → Original
- `AttemptNumber = 1` → Re-Attempt 1
- `AttemptNumber = 2` → Re-Attempt 2
- `AttemptNumber = 3` → Re-Attempt 3
- `AttemptNumber >= 4` → Manual Admin/Teacher controlled retry

### Auto Retry Rule
When a submitted DPS does not achieve the benchmark:

1. The attempt is stored in history.
2. The related DPS concept/sheet is counted once in Needs Re-Attempt until cleared.
3. If the chain has fewer than three auto retries, a fresh DPS variant is prepared for the same concept.
4. If Re-Attempt 3 is also uncleared, auto retry stops and manual Admin/Teacher intervention is required.

### Needs Re-Attempt Count
The Needs Re-Attempt count is based on unique uncleared DPS chains, not total failed attempts.

Example:

- DPS-2 Original uncleared → count `1`
- DPS-2 Re-Attempt 1 uncleared → count remains `1`
- DPS-2 Re-Attempt 2 uncleared → count remains `1`
- DPS-5 Original uncleared → count becomes `2`
- DPS-2 later cleared → count becomes `1`

### Student-Facing Messaging
Student messaging must avoid backend/internal wording such as:

- assigned automatically
- auto-generated
- failed
- retry exhausted

Approved message styles:

#### Cleared
Excellent work! You have successfully achieved the benchmark for this practice sheet.

You may now continue your learning journey with the next assigned practice.

#### Retry Required
You are improving, but the required benchmark has not been achieved yet.

A new practice sheet has been prepared to help you strengthen this concept before moving ahead.

#### Manual Review Required
This practice requires additional review before the next attempt can be unlocked.

Your teacher will guide you through the next step to help strengthen this concept.

## QA Checklist

Before pushing Phase 10.9.4 live, verify:

- Original DPS cleared path still works.
- Original DPS uncleared path creates Re-Attempt 1.
- Re-Attempt 1 uncleared path creates Re-Attempt 2.
- Re-Attempt 2 uncleared path creates Re-Attempt 3.
- Re-Attempt 3 uncleared path stops auto retry and enters manual intervention.
- Needs Re-Attempt count stays unique per DPS chain.
- Admin, Teacher, and Student history views continue showing every attempt.
- Student result messages follow approved wording.
- Generated retry DPS questions are different while keeping the same concept.

## Regression Command

From `frontend/`:

```bash
npm run verify:dps-auto-reattempt-e2e
```

For UI debugging:

```bash
npm run verify:dps-auto-reattempt-e2e:headed
npm run verify:dps-auto-reattempt-e2e:ui
```
