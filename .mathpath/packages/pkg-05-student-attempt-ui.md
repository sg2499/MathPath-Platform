# Package 5 (Phase 5): Student Live-Attempt UI

## Objective
The student-facing screen for actually taking the Annual Competition,
built on top of the Package 4 timer/pause engine.

## Status: NOT STARTED

## Checklist

### 1. Pre-attempt gating
- [ ] Student cannot start before their assigned slot's
      `scheduled_start_at` ("can't begin before your scheduled time").
- [ ] Pre-section instructions screen showing section name, ABACUS/VISUAL
      mode, concepts/formats, sum count, and time limit -- per the client
      doc's own requirement.

### 2. Attempt screen
- [ ] Multi-section timer UI, one section active at a time.
- [ ] Resume-on-reconnect UX: reopening mid-section picks up exactly where
      the heartbeat mechanic left off, with no special-cased "you were
      disconnected" flow needed since disconnect and idle-reopen are
      indistinguishable by design.
- [ ] "Your timer is running" indicator, since heartbeats signal
      connectivity, not attentiveness -- an idle-but-connected tab still
      burns its timer normally.

### 3. Verification
- [ ] A student cannot start a second concurrent session (Package 4's
      `session_token` guard surfaces correctly in the UI).
- [ ] A student who reloads mid-section resumes with the correct remaining
      time, not a full reset.
