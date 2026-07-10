"""
One-command rollback to a last-known-good production tag.

apex_deliver.py tags every successful merge to main as prod-YYYYMMDD-HHMMSS
and pushes the tag. When a deploy turns out to be bad, use this script to
revert to a previous tag instead of chasing the failure with another
untested forward-fix hotfix (that pattern produced the #290-301 chain).

Usage:
    python .agents/rollback.py                  # lists recent prod-* tags
    python .agents/rollback.py --to prod-20260710-140501
    python .agents/rollback.py --to prod-20260710-140501 --emergency
        (--emergency skips the CI gate on the rollback PR itself; only use
        this when the current production state is actively broken)
"""
import os
import sys
import subprocess
import time

def run_command(command, fail_fast=True):
    print(f"Running: {command}")
    result = subprocess.run(command, shell=True, text=True, capture_output=True)
    if result.returncode != 0 and fail_fast:
        print(f"[ERROR] Command failed: {command}")
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip()

def run_command_rc(command):
    print(f"Running: {command}")
    result = subprocess.run(command, shell=True, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stderr.strip())
    return result.stdout.strip(), result.returncode

def list_recent_tags():
    run_command("git fetch --tags origin", fail_fast=False)
    tags = run_command("git tag --list 'prod-*' --sort=-creatordate", fail_fast=False)
    tags = [t for t in tags.splitlines() if t.strip()][:15]
    if not tags:
        print("No prod-* tags found. Nothing to roll back to.")
        sys.exit(1)
    print("Recent production tags (newest first):")
    for t in tags:
        print(f"  {t}")
    print()
    print("Re-run with: python .agents/rollback.py --to <tag>")
    sys.exit(0)

def main():
    args = sys.argv[1:]
    if "--to" not in args:
        list_recent_tags()
        return

    target_tag = args[args.index("--to") + 1]
    emergency = "--emergency" in args

    print(f"Rolling back to {target_tag}")
    print("-" * 40)

    run_command("git fetch --tags origin")
    exists, rc = run_command_rc(f"git rev-parse --verify {target_tag}")
    if rc != 0:
        print(f"Tag {target_tag} not found locally after fetch. Aborting.")
        sys.exit(1)

    run_command("git fetch origin main")
    branch_name = f"rollback/to-{target_tag}-{int(time.time())}"
    run_command(f"git checkout -B {branch_name} origin/main")

    print(f">> Resetting working tree to exactly match {target_tag}...")
    run_command("git rm -rf --ignore-unmatch .")  # capture_output=True already suppresses this; no shell redirection needed (was "> /dev/null", which cmd.exe on Windows misinterprets as a literal C:\dev\null path)
    run_command(f"git checkout {target_tag} -- .")
    run_command("git add -A")

    status = run_command("git status --porcelain")
    if not status:
        print(f"main already matches {target_tag}. Nothing to roll back.")
        run_command("git checkout main")
        run_command(f"git branch -D {branch_name}", fail_fast=False)
        sys.exit(0)

    run_command(f'git commit -m "revert: rollback production to {target_tag}"')

    if "GITHUB_TOKEN" in os.environ:
        del os.environ["GITHUB_TOKEN"]
    run_command(f"git push -f -u origin {branch_name}")

    pr_url = run_command(
        f'gh pr create --title "rollback: revert production to {target_tag}" '
        f'--body "Automated rollback via .agents/rollback.py" --base main'
    )
    print(f"PR Created: {pr_url}")

    if emergency:
        print(">> --emergency set: merging rollback immediately (branch protection bypass).")
        run_command(f"gh pr merge {branch_name} --squash --admin")
    else:
        print(">> Waiting for CI on the rollback PR...")
        _, ci_rc = run_command_rc(f"gh pr checks {branch_name} --watch --fail-fast")
        if ci_rc != 0:
            print("CI failed on the rollback itself. Do not force it blind -")
            print(f"investigate, or re-run with --emergency if production is down. PR: {pr_url}")
            sys.exit(1)
        _, merge_rc = run_command_rc(f"gh pr merge {branch_name} --squash --auto")
        if merge_rc != 0:
            print(f"Merge did not complete automatically. PR left open: {pr_url}")
            sys.exit(1)

    run_command("git checkout main")
    run_command("git pull origin main")
    run_command(f"git branch -D {branch_name}", fail_fast=False)

    new_tag = f"prod-{time.strftime('%Y%m%d-%H%M%S')}-rollback"
    run_command(f"git tag {new_tag}", fail_fast=False)
    run_command(f"git push origin {new_tag}", fail_fast=False)

    print("-" * 40)
    print(f"Rollback complete. main now matches {target_tag}.")
    print(f"New tag: {new_tag}")
    print("Next: run monitor_deploy.py and confirm live health.")

if __name__ == "__main__":
    main()
