# MathPath Project Memory

This folder is the handoff and continuity system for MathPath.

**Canonical read order (updated 2026-07-10):** every new agent or new conversation must read these, in order, before planning or changing code:

1. `docs/project-memory/COWORK_HANDOFF.md` — the current source of truth for repo state, the engineering-system rework, and the agent squad. Read this first, always.
2. `docs/project-memory/CLAUDE_CODE_STATUS.md` — if a local Claude Code session is (or was recently) active, this is its live status snapshot. Check whether "Blocked on" is non-empty before assuming everything is idle.
3. `git log --oneline -30` — trust this over any prose state description in older docs.
4. `docs/project-memory/OPEN_ISSUES.md` — active/open work.
5. `.antigravity/instructions.md` — the approval-gate protocol and delivery loop.
6. `.agents/AGENTS.md` — the squad roster and MathPath-specific conventions (external assets, gamification architecture).
7. `docs/project-memory/SOURCE_ASSETS.md`.
8. The latest file in `docs/project-memory/DAILY_LOGS/`.

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

The agent must read the files listed above and continue from the latest handoff.
