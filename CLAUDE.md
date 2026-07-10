# MathPath — Claude Code entry point

This file is read automatically by Claude Code at the start of every local session in this repo. Its only job is to point you at the real docs and tell you what this environment is for.

## Read, in order

1. `docs/project-memory/COWORK_HANDOFF.md` — current repo state and everything established in the most recent Cowork session (the engineering-system rework: agent squad, gated delivery, rollback).
2. `git log --oneline -30` — trust this over any prose state description in older docs.
3. `docs/project-memory/OPEN_ISSUES.md` — active/open work.
4. `.antigravity/instructions.md` — the full operating protocol (approval gates, delivery loop, model routing).
5. `.agents/AGENTS.md` — the squad roster and MathPath-specific conventions.

## What this environment is for

Claude Code, running locally, is the **delivery execution environment** for this project. It has direct shell and git access, and `git`'s credential helper here is already authenticated (`gh.exe`) — that is what lets `sre-devops` actually run `python .agents/apex_deliver.py` and `python .agents/rollback.py` to completion.

Cowork sessions on this project run in a sandboxed cloud environment with no route to github.com and no GitHub credentials — they can implement, review, and prepare changes, but cannot push, open PRs, or merge. If you're picking up work that a Cowork session prepared, the code changes will already be in the working tree; your job is verification (qa-reviewer) and delivery (sre-devops), not re-doing the implementation.

## Subagents

10 project-specific subagents are already defined in `.claude/agents/` and will be available automatically: `frontend-architect`, `backend-architect`, `qa-reviewer`, `sre-devops`, `vfx-3d`, `data-telemetry`, `principal-designer`, `model-router`, `browser-qa`, `scribe`. Route tasks to the matching persona per `.agents/AGENTS.md` — `qa-reviewer` must PASS before `sre-devops` delivers, and only `sre-devops` runs git push/PR/merge commands.

## Before you push anything

Verify (typecheck/lint/pytest as relevant) before any commit reaches `main` — the July 8–10 hotfix chain (#290–301) shipped straight to production without this and cost 11 follow-on patches to fix. `apex_deliver.py` now waits for CI and does not bypass branch protection by default; do not reintroduce a blind `--admin` merge as routine behavior.

## Keep `docs/project-memory/CLAUDE_CODE_STATUS.md` current

Cowork sessions on this project can't see this terminal directly — no live link between the two products. That file is the bridge: **you (the orchestrator, not a subagent) overwrite its "Current" section** at each milestone so a Cowork session can check progress without the developer relaying it manually. Update it:
- When you start a new task (task given, which persona(s) you're routing to).
- When a subagent reports back (qa-reviewer's verdict, sre-devops's delivery result, etc.) — update "Stage" and "Last action."
- Whenever you're blocked or waiting on something (a human decision, CI, external input) — fill in "Blocked on" honestly; don't leave it blank if you're actually stuck.
- When a task completes — move the outcome into "Last completed milestone" and reset "Current" to idle.

Overwrite, don't append — it's a snapshot so it stays cheap to read, not a growing log (that's what `DAILY_LOGS/` and `scribe` are for). Keep entries to a sentence or two each.
