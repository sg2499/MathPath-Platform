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

### Candidate MM Module Folder

Path:

- `C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Modules\MM`

Observed on 2026-06-18:

- folder `Level - 9`
- workbook `MM-L19 DPS 3.xlsx`
- temporary Excel lock file `~$MASTER MODULE.xlsx`

Status:

- Candidate source location only.
- Not yet confirmed as the full 150 DPS image set or the 3 authoritative workbooks.

### Downloads Screenshot

Path:

- `C:\Users\shail\Downloads\screencapture-math-path-platform-vercel-app-admin-curriculum-2026-06-18-13_14_59.png`

Purpose:

- Bug evidence for Admin Learning Path Studio MM DPS preview failure.

Status:

- Used on 2026-06-18 to fix and live-verify MM DPS preview generation.

## Expected Missing Assets

The user has referenced these original materials, but exact durable paths are not yet recorded:

- 150 DPS images
- 3 Excel workbooks

Status:

- Awaiting final one-time asset handoff.
- Once provided, record paths and coverage here immediately.

## Ingestion Log

### 2026-06-18

- Created source asset manifest and local vault convention.
- Found candidate folder `C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Modules\MM`.
- Did not confirm the full 150 DPS image set or 3 Excel workbooks.
