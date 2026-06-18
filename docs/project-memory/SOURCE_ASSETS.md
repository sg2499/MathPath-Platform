# Source Assets

Last updated: 2026-06-18

This file is the durable manifest for all MathPath source materials that the generator, curriculum, UI, or QA work must treat as authoritative.

## Purpose

Future conversations must not ask the user to re-send the same DPS images, workbook files, or curriculum references. When the user provides a new source file or folder, record it here immediately with its exact path, scope, and current ingestion status.

## Required Wake-Up Rule

Every new MathPath conversation must read this file before changing:

- DPS or assessment generation logic
- Master Module curriculum maps
- Young Learners Module curriculum maps
- mock generator rules
- question renderers
- source-data seed scripts

## Asset Intake Protocol

When the user provides source assets:

1. Record the exact filesystem path in this manifest.
2. Record whether the source is a file, folder, workbook, image batch, PDF, or extracted data.
3. Record the module, level, lesson, and DPS coverage if known.
4. Record whether the source is authoritative, supplemental, superseded, or unknown.
5. If the asset is outside the repo, do not move it unless the user asks. The path is enough as long as it remains readable on this machine.
6. If the user drops files into `reference-assets/`, keep the files local and record them here. The folder is intentionally ignored by git to avoid pushing bulky reference images/workbooks.
7. If structured facts are extracted from an image/workbook into code or seed data, record the extraction result and commit the resulting code/data.

## Local Asset Vault

Preferred local drop location for files the user wants Codex to retain on this machine:

- `C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Platform\MathPath_Platform_Live\reference-assets\incoming`

Organized subfolders:

- `reference-assets\dps-images`
- `reference-assets\workbooks`
- `reference-assets\extracted`

The files in `reference-assets/` are intentionally local-only. The manifest and extraction notes are committed.

## Known Source Asset Locations

### Authoritative Master Module Level 9 Source Folder

Path:

- `C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Modules\MM\Level - 9`

Confirmed on 2026-06-18:

- 30 lesson folders: `Lesson - 1` through `Lesson - 30`.
- 150 DPS image files: 5 `.png` files under each lesson folder.
- 3 Excel workbooks at the folder root:
  - `LESSON 1.xlsx`
  - `LESSON 2.xlsx`
  - `MASTER MODULE.xlsx`

Coverage:

- Module: Master Module.
- Level/source label: Level 9 source folder.
- Lessons: 1-30.
- DPS images: 5 per lesson, 150 total.
- Workbooks: 3 files covering the 30 lessons according to the user.

Authority:

- Authoritative source for Master Module DPS image/workbook reference unless the user explicitly supersedes it.
- Future generator, curriculum-map, and question-rendering work must consult this folder before changing Master Module practice DPS behavior.

Agent rule:

- Do not ask the user to provide this path again.
- If the path is inaccessible, first report that the recorded source path is unavailable and verify whether the folder moved.
- When new source files are added under this folder, update this manifest in the same session.

Status:

- Confirmed and retained in project memory.

### Downloads Screenshot

Path:

- `C:\Users\shail\Downloads\screencapture-math-path-platform-vercel-app-admin-curriculum-2026-06-18-13_14_59.png`

Purpose:

- Bug evidence for Admin Learning Path Studio MM DPS preview failure.

Status:

- Used on 2026-06-18 to fix and live-verify MM DPS preview generation.

## Expected Missing Assets

None for the current Master Module Level 9 source set. The 150 DPS images and 3 Excel workbooks are recorded above.

## Ingestion Log

### 2026-06-18

- Created source asset manifest and local vault convention.
- Found candidate folder `C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Modules\MM`.
- User confirmed authoritative source folder `C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Modules\MM\Level - 9`.
- Verified 30 lesson folders, 150 `.png` DPS images, and 3 `.xlsx` workbooks.
