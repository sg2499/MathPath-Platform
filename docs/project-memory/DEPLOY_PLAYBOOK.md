# MathPath — Deploy Playbook (Shailesh's actual workflow)

Last documented: 2026-08-21, by a Cowork session, from Shailesh's own pasted
commands after a prior Cowork reply guessed wrong (offered the
`.agents/apex_deliver.py` / `sre-devops` route instead). **This file is the
one to follow. Whenever anyone (Cowork or local Claude Code) is asked for
"the usual push/merge/deploy commands" in this project, use the commands
below, substituted for the current branch/commit/files/PR text — not
`apex_deliver.py`, not the `LOCAL_DELIVERY_SYSTEM.md` console, not a fresh
invention.**

This is a manual, four-stage PowerShell + SSH workflow: branch → commit →
PR/merge → deploy. There are two deploy variants depending on what changed —
see Step 4.

**Standing delivery rule (explicit, from Shailesh, 2026-08-25): always hand
these commands over directly as plain text/code blocks in the chat reply
itself — every time work on this project reaches the push/PR/merge/deploy
stage, without being asked. Do not summarize them away, do not skip steps,
do not wrap them in an Artifact/hosted page, and do not wait to be asked
"what are the commands" first — proactively include the full substituted
command sequence (Steps 1-4 below, substituted for the branch/commit/PR
text of the change just made) in the same message that reports the work as
done.**

## Environment facts (fixed, do not ask the user for these again)

- Local repo: `C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Platform\MathPath_Platform_Live`
- GitHub remote: `https://github.com/sg2499/MathPath-Platform.git`
- Production server: `ubuntu@15.206.108.37`
- SSH key: `C:\Users\shail\.ssh\mathpath-platform.pem` (outside the repo and outside OneDrive sync — never expect it inside the working tree)
- Server repo path: `/home/ubuntu/MathPath-Platform`
- Backend service: `mathpath-backend` (systemd — `sudo systemctl restart mathpath-backend`)
- Frontend process: `mathpath-frontend` (pm2 — `pm2 restart mathpath-frontend`)
- `git clean` on the server always excludes: `backend/.env`, `frontend/.env`, `frontend/.env.local`, `backend/.venv`, `backend/uploads`, `frontend/node_modules`, `frontend/.next` — never drop these exclusions.

There is also a more automated script at `scripts/prod-deploy/deploy-simple.sh`
that builds the frontend via a GitHub Actions workflow (`prod-build.yml`)
instead of a local `npm run build`, then does the same scp+SSH tail end. It's
real and it has shipped a production deploy before (see
`docs/project-memory/OPEN_ISSUES.md`, 2026-08-11 entry). **Default to the
manual playbook below anyway** — that's what was explicitly asked for. Only
suggest `deploy-simple.sh` if the user asks whether a more automated option
exists.

## Standing caution: this repo's CRLF/LF noise

The OneDrive-synced working tree carries pre-existing CRLF/LF drift across
many files unrelated to any given fix — `git status` routinely shows 40-50
files as "modified" that have zero real (`git diff -w`) content change. Two
rules that exist specifically because of this:

1. **Never `git add .` / `git add -A`.** Stage the exact files the fix
   touched, by path, one by one (or as an explicit list). This is why Step 2
   below stages named files, not the whole tree.
2. Before staging, sanity-check with `git diff -w --stat -- <path>` if there's
   any doubt whether a file has a real change or just whitespace noise.

## Standing caution: this is PowerShell, not bash

Every command block Shailesh runs is pasted into Windows PowerShell, never a
bash/SSH shell (except the Step 4 sections explicitly marked "paste on the
server"). Two specific mistakes have actually happened and wasted real
deploy time (2026-09-02) — do not repeat either:

1. **Never use bash heredoc syntax** (`` $(cat <<'EOF' ... EOF) ``) in a
   PowerShell block. PowerShell does not parse it at all — pasting it just
   leaves the prompt hanging on `>>` forever, and every "did you hit enter"
   retry looks identical. For a multi-line string, use a PowerShell
   here-string instead: `$var = @'` ... `'@` (single-quoted = literal, no
   interpolation — use this for anything containing `$`, backticks, or
   markdown code spans).
2. **Never pass a multi-line here-string inline as an argument to a native
   .exe** (`gh.exe`, `git.exe`, etc.) — e.g. `gh pr create --body $prBody`.
   PowerShell's argument marshalling to native processes can silently
   mangle embedded newlines into multiple argv tokens, which surfaces as
   `gh` complaining about "unknown arguments" pulled out of the middle of
   the body text. Always write the string to a temp file first and pass
   `--body-file`, as Step 3 below does — this sidesteps the problem
   entirely and should be the default for any PR/commit body, not just a
   workaround for when it breaks.

## Standing caution: reuse this playbook's exact commands, don't reconstruct

The Step 4 frontend build/transfer already uses `tar` + `scp` + `tar -xzf`
specifically because it avoids a real failure mode: a zip built with
PowerShell's `Compress-Archive` does not store Unix permission bits, and
`unzip` on the Linux server can then create directories with the execute
bit missing — Next.js can't detect this at build time but crash-loops at
runtime with `EACCES ... scandir`. This actually happened (2026-09-02) after
the frontend step was reconstructed from memory as a zip/unzip flow instead
of using the `tar` commands already documented below, and cost a dozen
round trips to fully diagnose and fix. The `chmod -R a+rX frontend/.next`
line in Step 4a's server-side block is a permanent safety net for this, but
the real fix is simpler: **use the commands in this file verbatim,
substituted only for branch/commit/file/PR text — do not re-derive the
deploy steps from memory or general knowledge.**

## Step 1 — branch fresh off main

```powershell
$env:GH_DEBUG = $null
cd "C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Platform\MathPath_Platform_Live"
git checkout main
git pull origin main
git checkout -b <branch-name>
```

`<branch-name>` is a short kebab-case slug for the fix, e.g.
`fix/teacher-assign-button-crop` or `fix/bm-dps-counts-and-mm-bodmas`.

## Step 2 — stage only the changed files, commit, push

```powershell
git add <file-1> <file-2> ...
git status
```

Confirm only the intended files are staged (watch for CRLF-noise files
sneaking in), then:

```powershell
git commit -m "<commit message>"
git push -u origin <branch-name>
```

## Step 3 — PR, wait for CI, merge

Always build the PR body as a here-string and pass it via `--body-file` —
see the "PowerShell, not bash" caution above for why (never `--body "<...>"`
inline):

```powershell
$prBody = @'
<PR body, markdown, multi-line>
'@
$bodyFile = "$env:TEMP\pr-body.md"
Set-Content -Path $bodyFile -Value $prBody -Encoding utf8

gh pr create --base main --title "<PR title>" --body-file $bodyFile
gh pr checks --watch
```

Once green:

```powershell
gh pr merge --squash --delete-branch
git checkout main
git pull origin main
```

## Step 4 — deploy

Two variants. Pick based on whether `frontend/` files are in the diff.

### 4a. Frontend files changed (or both frontend + backend)

Build locally and ship the build artifact:

```powershell
cd frontend
$env:BACKEND_ORIGIN = "http://127.0.0.1:8000"
$env:NEXT_TELEMETRY_DISABLED = "1"
npm ci
npm run build

$artifactDir = "$env:TEMP\mp-frontend-artifact"
Remove-Item -Recurse -Force $artifactDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $artifactDir | Out-Null
Copy-Item -Recurse .next "$artifactDir\.next"
Copy-Item -Recurse public "$artifactDir\public"
Copy-Item package.json, package-lock.json, next.config.mjs "$artifactDir\"
git rev-parse HEAD | Out-File -Encoding ascii -NoNewline "$artifactDir\BUILD_SHA.txt"

cd $artifactDir
tar -czf "$env:TEMP\mathpath-frontend-build.tgz" .
cd "C:\Users\shail\OneDrive\Shailesh\Work\Math Path\Platform\MathPath_Platform_Live\frontend"
```

Upload:

```powershell
scp -i "C:\Users\shail\.ssh\mathpath-platform.pem" "$env:TEMP\mathpath-frontend-build.tgz" ubuntu@15.206.108.37:/tmp/mathpath-frontend-build.tgz

ssh -i "C:\Users\shail\.ssh\mathpath-platform.pem" ubuntu@15.206.108.37
```

Once connected, paste:

```bash
cd /home/ubuntu/MathPath-Platform
git remote set-url origin https://github.com/sg2499/MathPath-Platform.git
git fetch origin
git reset --hard origin/main
git clean -fd -e 'backend/.env' -e 'frontend/.env' -e 'frontend/.env.local' -e 'backend/.venv' -e 'backend/uploads' -e 'frontend/node_modules' -e 'frontend/.next'
rm -rf frontend/.next
tar -xzf /tmp/mathpath-frontend-build.tgz -C frontend
# 2026-09-02 -- safety net: a build artifact assembled on Windows (whether
# via this tar step or an ad-hoc zip) can occasionally land with a
# directory missing its execute/search bit, which Next.js can't detect at
# build time but crash-loops on at runtime with EACCES/scandir errors the
# instant it tries to read that folder. This is a no-op when permissions
# are already correct, so it's cheap insurance every deploy.
chmod -R a+rX frontend/.next
cd backend
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
deactivate
cd ../frontend
npm ci --omit=dev
cd ..
sudo systemctl restart mathpath-backend
pm2 restart mathpath-frontend
pm2 status
rm -f /tmp/mathpath-frontend-build.tgz
```

### 4b. Backend-only changes (no `frontend/` files in the diff)

No local build, no artifact, no scp — the server pulls the backend source
directly from `origin/main` and only the backend needs a restart:

```powershell
ssh -i "C:\Users\shail\.ssh\mathpath-platform.pem" ubuntu@15.206.108.37
```

Once connected, paste:

```bash
cd /home/ubuntu/MathPath-Platform
git remote set-url origin https://github.com/sg2499/MathPath-Platform.git
git fetch origin
git reset --hard origin/main
git clean -fd -e 'backend/.env' -e 'frontend/.env' -e 'frontend/.env.local' -e 'backend/.venv' -e 'backend/uploads' -e 'frontend/node_modules' -e 'frontend/.next'
cd backend
[ -d .venv ] || python3 -m venv .venv
. .venv/bin/activate
pip install -q -r requirements.txt
deactivate
cd ..
sudo systemctl restart mathpath-backend
pm2 status
```

(`pm2 restart mathpath-frontend` is skipped here since no frontend code
changed — the frontend process doesn't need to pick anything up. Leaving it
out is deliberate, not an oversight; add it back in if in doubt.)

## After either variant

Confirm live: fetch a real page (e.g. `https://mock.mathpath.in/login?role=admin`)
and/or hit a backend endpoint that exercises the changed code, and check
`pm2 status` / `sudo systemctl status mathpath-backend` both report healthy
before calling the deploy done.
