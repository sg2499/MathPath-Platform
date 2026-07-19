# MathPath Apex Squad — Engineering Protocol

**Status (2026-07-10):** revised after the #290–301 hotfix chain (12 commits in 3 days, all merged straight to production via an unconditional `gh pr merge --admin` bypass with no CI gate). The squad concept is kept; the mechanism that let it ship unverified code is not. See `.antigravity/instructions.md` for the full approval-gate protocol — this file is the squad roster and MathPath-specific conventions.

## 1. How the squad actually works now
- The seven personas below are implemented as real Claude Code subagents in `.claude/agents/*.md` (frontend-architect, backend-architect, qa-reviewer, sre-devops, vfx-3d, data-telemetry, principal-designer) — each with its own scoped tool access and a concrete checklist, not just a description. Route tasks to the matching persona; run independent ones in parallel.
- **qa-reviewer is a mandatory gate**, not an optional pass, for anything beyond a copy/style tweak: schema changes, auth, payments, gamification/streak/badge logic, or math-generator logic. It must return PASS or PASS WITH NOTES before delivery.
- **Only sre-devops executes delivery** (git push / PR / merge / deploy). No other persona runs git commands against origin. Use `python .agents/apex_deliver.py "<commit_message>"` — it now waits for real CI results and merges without an admin bypass by default. `--emergency-bypass` exists but requires interactive human confirmation and is not a default agent action.
- **Approval gating:** low-risk, isolated UI/copy changes may proceed autopilot-style straight to qa-reviewer → sre-devops. Anything touching schema, auth, payments, or gamification state requires the Implementation Plan + explicit developer approval described in `.antigravity/instructions.md` §3 before any edit is made. This is the resolution to the old contradiction between "ship immediately" and "wait for approval" — the two docs previously disagreed; they no longer do.
- **Architectural Visualization:** before complex/multi-file work, generate a Mermaid diagram (data flow, component tree, or schema) so the plan is reviewable before code is written.
- **Self-Evolving Memory:** when a new convention or hard-won bugfix pattern is established, append it here (MathPath-specific conventions) or to `docs/project-memory/OPEN_ISSUES.md` (open work) — keep memory docs current as part of finishing the task, not as an afterthought.
- **No more `walkthrough.md`-by-default.** Deliver code via direct file edits; only produce a written walkthrough when the developer asks for one or the change is large enough that a diff alone won't explain the reasoning.

## 2. Squad Roster (full definitions in `.claude/agents/`)

| Persona | Owns | Tools |
|---|---|---|
| 👑 principal-designer | Aesthetics/UX review, Tailwind + Framer Motion/GSAP polish passes | Read, Edit, Grep, Glob |
| 🧠 frontend-architect | Next.js/TS/Tailwind implementation, Core Web Vitals, SEO | Read, Write, Edit, Grep, Glob, Bash |
| 🧠 backend-architect | FastAPI/SQLAlchemy/Alembic, migrations, math generators | Read, Write, Edit, Grep, Glob, Bash |
| 🛡️ sre-devops | Delivery, CI/CD, rollback, monitoring, security posture | Read, Write, Edit, Grep, Glob, Bash |
| 🔬 qa-reviewer | Pre-merge gate: correctness, complexity, schema parity, test evidence | Read, Grep, Glob, Bash (read-only, no edits) |
| 📊 data-telemetry | PostHog instrumentation, SQL analytics on student performance | Read, Write, Edit, Grep, Glob, Bash |
| 🎬 vfx-3d | Three.js/React Three Fiber/GLSL, badge cutscenes, Collector's Vault | Read, Write, Edit, Grep, Glob, Bash |
| 🧭 model-router | Recommends which model (Haiku/Sonnet/Opus/Fable) suits a task; never implements | Read, Grep, Glob |
| 🌐 browser-qa | Live/preview browser verification (responsive, theme, tooltips) qa-reviewer structurally can't do | Read, Grep, Glob, Claude-in-Chrome tools |
| 📝 scribe | Owns end-of-session updates to `docs/project-memory/` so it doesn't go stale again | Read, Write, Edit, Grep, Glob |

See each file for the full, concrete operating checklist — this table is a router, not the source of truth. **Model routing:** before non-trivial work, check `model-router`'s rubric — Sonnet is the default; escalating to Opus (hard technical) or Fable (creative/strategic) or narrowing to Haiku (mechanical triage) requires the developer's explicit approval first (see `.antigravity/instructions.md` §6). No agent switches the session's model on its own.

---

# MathPath Project External Assets
The master external assets for MathPath (including the 150 DPS sheet images across 30 lessons and the 3 master Excel sheets) are permanently stored on the local filesystem at the following absolute path:
`C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Modules\MM\Level - 9`

**CRITICAL INSTRUCTION FOR ALL AGENTS:**
Do not ask the user to upload these sheets or images. Whenever you need to read or parse the master excel sheets or reference the DPS sheet images, ALWAYS access them directly from the absolute path above.

# Legacy Robustness Guidelines
1. **Data Normalization:** Backend acts as the single source of truth. Standardized scores/time utilization must be computed precisely once in the backend.
2. **Testing:** Enforce automated testing (Jest, Playwright) and block PRs on failure.
3. **CI/CD:** Require preview environments for review before merging to production.
4. **Admin Authorization Check:** When querying the database for "Admins" to send notifications or verify permissions, always use `User.role.in_(["ADMIN", "SUPER_ADMIN"])` instead of just checking for `"ADMIN"`. The primary administrator account relies on the `SUPER_ADMIN` role.
5. **Mock Exam Notification Routing:** Frontend notifications for mock exams (`MOCK_SUBMITTED`) must route students/admins to the `mock-result` page to view their scores, not the `mock-attempt` page.

# Gamification Architecture (Evolved July 8, 2026)
1. **AAA-Quality Badges (Cinematic Overhaul):** Do not use flat SVGs or procedural geometry for Rank Badge cutscenes. The new paradigm uses **AI-Generated Hyper-Realistic Master Assets** (e.g., Copper Forge, Champion Black Hole) rendered natively through `@react-three/fiber` `<Canvas>`. The assets must be displayed with crystal-clear fidelity using custom GLSL shaders to key out black backgrounds, paired with deterministic camera choreography (shakes, FOV shifts) and optimized Post-Processing (Bloom, Vignette) without destroying the 2D asset's crispness.
2. **Visual Roadmaps:** Do not use simple lists or basic 3D spheres for ranking progression. Use visual timelines ("Rank Pathways") showcasing the full visual tier list with dynamic line connections.
3. **Collector's Vault:** The 3D Vault is active. Continue using React Three Fiber, Cannon.js physics, and `three-stdlib` for 3D loot unboxing mechanics, adhering to the standard Next.js dynamic import rules for 3D canvas rendering.
4. **Gamification Stat Integrity (Evolved July 10, 2026):** Never write piecemeal ORM scripts to retroactively fix gamification stats or badges, as this inherently risks inflating stats via double-counting. Always handle gamification corrections via a holistic master reset (`recalculate_all_gamification_stats`) that truncates `student_achievement_stats` and `student_badges` and recalculates from scratch using perfectly sorted `completed_at` chronological history.
