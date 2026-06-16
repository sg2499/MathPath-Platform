# MathPath Project Memory

This folder is the handoff and continuity system for MathPath.

Every new agent or new conversation must read these files before planning or changing code:

1. `CURRENT_STATUS.md` at the repository root.
2. `.mathpath/STATE.yaml`.
3. `.mathpath/rules/global.md`.
4. The active `.mathpath/packages/` file named in `.mathpath/STATE.yaml`.
5. `docs/project-memory/PROJECT_STATE.md`.
6. `docs/project-memory/DAILY_HANDOFF.md`.
7. The latest file in `docs/project-memory/DAILY_LOGS/`.

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
- Any focused rule file such as `MM_MOCK_GENERATOR_RULES.md`

## Resume Command

In a new conversation, the user can say:

`Resume MathPath from project memory.`

The agent must read the files listed above and continue from the latest handoff.
