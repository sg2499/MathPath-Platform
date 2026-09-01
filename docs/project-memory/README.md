# MathPath Project Memory

This folder is the handoff and continuity system for MathPath.

**Canonical read order (updated 2026-09-01 -- now includes a mandatory verification step, see below):** every new agent or new conversation must read these, in order, before planning or changing code:

1. `docs/project-memory/COWORK_HANDOFF.md` — the current source of truth for repo state, the engineering-system rework, and the agent squad. Read this first, always.
2. `docs/project-memory/CLAUDE_CODE_STATUS.md` — if a local Claude Code session is (or was recently) active, this is its live status snapshot. Check whether "Blocked on" is non-empty before assuming everything is idle.
3. `git log --oneline origin/main -50` (fetch first: `git fetch origin main`) — trust this over any prose state description in older docs. This is not optional background reading -- step 9 below requires actually using it.
4. `docs/project-memory/OPEN_ISSUES.md` — active/open work.
5. `.antigravity/instructions.md` — the approval-gate protocol and delivery loop.
6. `.agents/AGENTS.md` — the squad roster and MathPath-specific conventions (external assets, gamification architecture).
7. `docs/project-memory/SOURCE_ASSETS.md`.
8. The latest file in `docs/project-memory/DAILY_LOGS/`.
9. **Verify before trusting (added 2026-09-01, mandatory, do not skip).** `OPEN_ISSUES.md`'s `## Active` section and any `COWORK_HANDOFF.md` entry saying "PREPARED, NOT YET DELIVERED" have a proven, repeated history of drifting stale -- items get merged and deployed via a local Claude Code session (or Shailesh directly) without this Cowork-side doc ever being updated to reflect it. Confirmed twice now: once on 2026-07-13 (a git-sync timing bug), and again on 2026-09-01 (14 Active-section items were sitting there marked open/undelivered weeks after they'd actually been merged -- PM-L2, PM-L1's digit-width fix, both YLM builds, the parent-report rework, and more -- caught only because Shailesh personally checked and called it out). **Before reporting any item as "still open," "not yet delivered," or "pending" to the user, cross-check it against real git history:** `git log --oneline origin/main --grep="<keyword from the item>"` (case-insensitive: add `-i`). A merged commit matching the item's own description means it shipped -- trust the commit, not the doc's prose. If the item claims something is "live" or "deployed," verify with the Render/Vercel MCP tools when available (`mcp__Render__list_deploys` / `mcp__Vercel__list_deployments`, filtered to the relevant service/project, checked against the commit SHA) rather than taking the doc's word for it -- both were confirmed reachable and useful for this on 2026-09-01. This check takes a few minutes and should run at the start of every session before any status is reported back or new work is planned, not just when something seems suspicious.
10. **When the verification step above finds stale entries, fix them in the same session** -- move confirmed-resolved items out of `OPEN_ISSUES.md`'s `## Active` section into a dated `## Resolved Recently (...)` entry citing the real PR/commit, the same way the 2026-09-01 cleanup did. Do not just silently use the corrected understanding for your own answer and leave the doc wrong for the next session -- that's how the drift compounds.

`CURRENT_STATUS.md`, `PROJECT_STATE.md`, and `DAILY_HANDOFF.md` are kept for historical narrative but are marked superseded — do not treat them as current without checking their "Last Updated" date against `git log` first.

## Purpose

The goal is to preserve product knowledge, technical decisions, daily work, deployments, tests, and next actions across conversations.

This is not a replacement for Git history. It is the human-readable continuity layer that explains why changes were made, what is safe, what is pending, and what must be verified before the next push.

## Daily Closeout Rule

At the end of every MathPath work session, update:

- `DAILY_HANDOFF.md`
- `DAILY_LOGS/YYYY-MM-DD.md`
- `PROJECT_STATE.md` if the product or architecture state changed
- `DECISIONS.md` if a new durable decision was made
- `DEPLOYMENT_LOG.md` if anything was pushed or deployed
- `OPEN_ISSUES.md` if new risks, bugs, or pending work were discovered
- `SOURCE_ASSETS.md` whenever the user provides images, workbooks, PDFs, extracted datasets, or source folders
- Any focused rule file such as `MM_MOCK_GENERATOR_RULES.md`

## Resume Command

In a new conversation, the user can say:

`Resume MathPath from project memory.`

The agent must read the files listed above (1-8), then run the verification step (9-10) before reporting anything back or starting new work -- reciting `OPEN_ISSUES.md`'s `Active` list or a "PREPARED, NOT YET DELIVERED" claim as current status WITHOUT cross-checking it against `git log` first is exactly the failure mode this section exists to prevent, confirmed happening for real on 2026-09-01. The status report back to the user should distinguish, explicitly: (a) genuinely still-open items (verified absent from git log), (b) items the docs claimed were open but git log shows already merged (report these as corrections, and fix the doc per item 10), and (c) the actual current `HEAD`/deploy state, cited with a commit SHA and deploy ID/status when the Render/Vercel tools are available -- not a vague "should be live" from memory.
