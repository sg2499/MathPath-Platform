import os
import sys
import subprocess
import time
import re

def run_command(command, fail_fast=True):
    print(f"Running: {command}")
    result = subprocess.run(command, shell=True, text=True, capture_output=True)
    if result.returncode != 0 and fail_fast:
        print(f"[ERROR] Command failed: {command}")
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip()

def run_command_rc(command):
    """Like run_command, but never exits — returns (stdout, returncode) so the
    caller can make a real decision instead of the script silently dying."""
    print(f"Running: {command}")
    result = subprocess.run(command, shell=True, text=True, capture_output=True)
    if result.returncode != 0:
        print(result.stderr.strip())
    return result.stdout.strip(), result.returncode

def sanitize_branch_name(message):
    # Convert to lowercase and replace non-alphanumeric with hyphens
    clean = re.sub(r'[^a-z0-9]+', '-', message.lower()).strip('-')
    return f"feature/apex-{clean}-{int(time.time())}"

def check_live_students():
    """
    Pre-flight safety check for active students.

    IMPORTANT: this only means anything if it is actually connected to the
    PRODUCTION database. The app's default DATABASE_URL (see
    backend/app/core/config.py) falls back to a local SQLite file, so running
    this from a developer/agent machine with no extra configuration was
    silently checking an empty local dev DB and always reporting "passed" —
    that is a false safety signal, worse than having no check at all.

    Resolution order:
      1. PROD_DATABASE_URL env var, if set — a read-only connection string to
         the real production Postgres, explicitly opted into by a human.
      2. DATABASE_URL env var, but ONLY if it does not look like sqlite/local.
      3. Otherwise: refuse to claim "passed". Report UNVERIFIED and require
         explicit human override before proceeding.
    """
    print(">> Performing pre-flight safety check for active students...")

    prod_url = os.environ.get("PROD_DATABASE_URL")
    fallback_url = os.environ.get("DATABASE_URL", "")
    is_probably_local = (not fallback_url) or fallback_url.startswith("sqlite")

    if not prod_url and is_probably_local:
        print("=======================================================")
        print(" WARNING: no PROD_DATABASE_URL is configured, and")
        print("    DATABASE_URL resolves to a local/sqlite database.")
        print("    This check CANNOT see live production students.")
        print("=======================================================")
        if not sys.stdin.isatty():
            print("Aborting delivery: cannot verify production safety non-interactively.")
            print("Set PROD_DATABASE_URL (read-only) to enable a real check, or have a")
            print("human run this delivery interactively and explicitly accept the risk.")
            sys.exit(1)
        override = input("Proceed WITHOUT verifying live students? (y/N): ")
        if override.lower() != 'y':
            print("Aborting delivery.")
            sys.exit(1)
        print("Proceeding without live-student verification (human override accepted).")
        return

    target_url = prod_url or fallback_url
    try:
        original_cwd = os.getcwd()
        backend_dir = os.path.join(original_cwd, 'backend')
        os.chdir(backend_dir)
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)

        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from datetime import datetime, timezone, timedelta

        engine = create_engine(target_url, pool_pre_ping=True)
        Session = sessionmaker(bind=engine, future=True)
        db = Session()

        from app.models import User
        five_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
        live_count = db.query(User).filter(
            User.last_active_at >= five_mins_ago, User.role == "STUDENT"
        ).count()
        db.close()

        os.chdir(original_cwd)

        if live_count > 0:
            print("=======================================================")
            print(f" WARNING - STOP: {live_count} students are currently active on the platform.")
            print("    Deploying now may disrupt their session.")
            print("=======================================================")
            if not sys.stdin.isatty():
                print("Aborting delivery due to active students (running non-interactively).")
                sys.exit(1)
            override = input("Do you want to override and deploy anyway? (y/N): ")
            if override.lower() != 'y':
                print("Aborting delivery.")
                sys.exit(1)
            print("Override accepted. Proceeding with deployment...")
        else:
            print(">> Safety check passed against PRODUCTION data. No active students detected.")
    except Exception as e:
        # A failed check must NOT be silently treated as "safe" — that was the
        # original bug. Fail loud instead.
        print(f">> Safety check FAILED to run: {e}")
        print(">> Refusing to report 'passed' on an unverified check.")
        if not sys.stdin.isatty():
            sys.exit(1)
        override = input("Proceed WITHOUT a working safety check? (y/N): ")
        if override.lower() != 'y':
            print("Aborting delivery.")
            sys.exit(1)

def wait_for_ci(branch_name):
    """
    Wait for the mathpath-ci.yml required checks to actually finish, and
    report their real result. `gh pr checks --watch` polls until all checks
    complete and returns non-zero if any failed.
    """
    print(">> Waiting for CI checks to complete (this may take a few minutes)...")
    _, rc = run_command_rc(f"gh pr checks {branch_name} --watch --fail-fast")
    return rc == 0

def main():
    if len(sys.argv) < 2:
        print("Usage: python apex_deliver.py \"Commit message here\" [--emergency-bypass]")
        sys.exit(1)

    commit_message = sys.argv[1]
    emergency_bypass = "--emergency-bypass" in sys.argv[2:]
    branch_name = sanitize_branch_name(commit_message)

    print("Apex Squad Delivery Initiated")
    print(f"Feature: {commit_message}")
    print("-" * 40)

    check_live_students()

    # 1. Stash current working directory to be absolutely safe
    print(">> Stashing current changes...")
    run_command("git add .")
    stash_result = run_command("git stash", fail_fast=False)
    has_stash = "No local changes to save" not in stash_result

    # 2. Fetch latest from origin to prevent merge conflicts
    print(">> Fetching origin/main...")
    run_command("git fetch origin main")

    # 3. Create a fresh branch off the absolute latest main
    print(f">> Creating fresh branch: {branch_name}")
    run_command(f"git checkout -B {branch_name} origin/main")

    # 4. Apply our work
    if has_stash:
        print(">> Applying stashed changes...")
        run_command("git stash pop")

    # 5. Commit
    print(">> Committing changes...")
    run_command("git add .")

    status = run_command("git status --porcelain")
    if not status:
        print("No changes to deliver. Everything is up to date!")
        sys.exit(0)

    run_command(f'git commit -m "{commit_message}"')

    # 6. Push to origin
    print(">> Pushing to origin...")
    if "GITHUB_TOKEN" in os.environ:
        del os.environ["GITHUB_TOKEN"]

    run_command(f"git push -f -u origin {branch_name}")

    # 7. Create Pull Request
    print(">> Creating PR...")
    pr_url = run_command(f'gh pr create --title "{commit_message}" --body "Apex Squad Automated Delivery" --base main')
    print(f"PR Created: {pr_url}")

    # 8. Gate on CI — this is the step that was previously skipped entirely.
    if emergency_bypass:
        print("=======================================================")
        print(" WARNING: --emergency-bypass requested: skipping CI gate and")
        print("    merging with branch-protection bypass (--admin).")
        print("    This must be a human-declared emergency, not routine use.")
        print("=======================================================")
        if sys.stdin.isatty():
            confirm = input('Type "EMERGENCY" to confirm bypassing CI and branch protection: ')
            if confirm != "EMERGENCY":
                print("Confirmation not given. Aborting bypass. PR left open for normal review.")
                print(f"PR: {pr_url}")
                sys.exit(1)
        else:
            print("Non-interactive session cannot confirm an emergency bypass. Aborting.")
            print(f"PR: {pr_url}")
            sys.exit(1)
        run_command(f"gh pr merge {branch_name} --squash --admin")
    else:
        ci_passed = wait_for_ci(branch_name)
        if not ci_passed:
            print("=======================================================")
            print(" FAILED: CI failed (or a required check did not pass).")
            print("    NOT merging. Fix the failure and re-run delivery, or")
            print("    use --emergency-bypass with explicit confirmation if")
            print("    this is a genuine, human-declared emergency.")
            print("=======================================================")
            print(f"PR: {pr_url}")
            sys.exit(1)

        print(">> CI passed. Merging PR (respecting branch protection)...")
        _, rc = run_command_rc(f"gh pr merge {branch_name} --squash --auto")
        if rc != 0:
            print("Merge did not complete automatically (branch protection may require")
            print("something this script doesn't satisfy, e.g. manual review approval).")
            print(f"PR left open for manual merge: {pr_url}")
            sys.exit(1)

    # 9. Clean up
    print(">> Cleaning up local branches...")
    run_command("git checkout main")
    run_command("git pull origin main")
    run_command(f"git branch -D {branch_name}", fail_fast=False)

    # 10. Tag the delivered commit so sre-devops always has a rollback target.
    tag_name = f"prod-{time.strftime('%Y%m%d-%H%M%S')}"
    print(f">> Tagging delivered commit as {tag_name}...")
    run_command(f"git tag {tag_name}", fail_fast=False)
    run_command(f"git push origin {tag_name}", fail_fast=False)

    print("-" * 40)
    print("Delivery Complete! Code merged to production.")
    print(f"Rollback target if needed: {tag_name}")
    print("Next: run monitor_deploy.py and confirm live health before considering this done.")

if __name__ == "__main__":
    main()
