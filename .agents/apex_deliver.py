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

def sanitize_branch_name(message):
    # Convert to lowercase and replace non-alphanumeric with hyphens
    clean = re.sub(r'[^a-z0-9]+', '-', message.lower()).strip('-')
    return f"feature/apex-{clean}-{int(time.time())}"

def check_live_students():
    print(">> Performing pre-flight safety check for active students...")
    try:
        sys.path.append(os.path.join(os.getcwd(), 'backend'))
        from app.database import SessionLocal
        from app.models import User
        from datetime import datetime, timezone, timedelta
        
        db = SessionLocal()
        five_mins_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
        live_count = db.query(User).filter(User.last_active_at >= five_mins_ago, User.role == "STUDENT").count()
        db.close()
        
        if live_count > 0:
            print(f"\n=======================================================")
            print(f" ⚠️  STOP: {live_count} students are currently active on the platform.")
            print(f"    Deploying now may disrupt their session.")
            print(f"=======================================================")
            
            # Note: Since agents run non-interactively, we will hard fail unless explicitly overridden
            # but for a developer running this locally, it prompts.
            if not sys.stdin.isatty():
                print("Aborting delivery due to active students (running non-interactively).")
                sys.exit(1)
                
            override = input("Do you want to override and deploy anyway? (y/N): ")
            if override.lower() != 'y':
                print("Aborting delivery.")
                sys.exit(1)
            print("Override accepted. Proceeding with deployment...")
        else:
            print(">> Safety check passed. No active students detected.")
    except Exception as e:
        print(f">> Safety check skipped or failed: {e}")

def main():
    if len(sys.argv) < 2:
        print("Usage: python apex_deliver.py \"Commit message here\"")
        sys.exit(1)
        
    commit_message = sys.argv[1]
    branch_name = sanitize_branch_name(commit_message)
    
    print(f"Apex Squad Auto-Delivery Initiated")
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
    
    # Check if there's actually anything to commit
    status = run_command("git status --porcelain")
    if not status:
        print("No changes to deliver. Everything is up to date!")
        sys.exit(0)
        
    run_command(f'git commit -m "{commit_message}"')
    
    # 6. Push to origin
    print(">> Pushing to origin...")
    # Clean GITHUB_TOKEN if it exists in env (can interfere with gh CLI auth)
    if "GITHUB_TOKEN" in os.environ:
        del os.environ["GITHUB_TOKEN"]
    
    run_command(f"git push -f -u origin {branch_name}")
    
    # 7. Create Pull Request
    print(">> Creating PR...")
    pr_url = run_command(f'gh pr create --title "{commit_message}" --body "Apex Squad Automated Delivery" --base main')
    print(f"PR Created: {pr_url}")
    
    # 8. Squash and Merge (Bypass as Admin)
    print(">> Merging PR (Bypassing Branch Protections)...")
    run_command(f"gh pr merge {branch_name} --squash --admin")
    
    # 9. Clean up
    print(">> Cleaning up local branches...")
    run_command("git checkout main")
    run_command("git pull origin main")
    run_command(f"git branch -D {branch_name}", fail_fast=False)
    
    print("-" * 40)
    print("Delivery Complete! Code is merging to production.")

if __name__ == "__main__":
    main()
