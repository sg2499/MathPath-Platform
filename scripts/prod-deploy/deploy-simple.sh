#follow the comments properly- Edit and Replace all
#
# FLOW (mostly script-driven):
#   1) Push/merge code to GitHub first
#   2) Run THIS script from laptop
#   3) Script asks GitHub Actions to BUILD Next.js (on GitHub — not on production)
#   4) Script downloads the build artifact
#   5) Script SSHs to production (your local .pem) → git sync + copy .next + deps + pm2 restart
#
# Requires on laptop: GitHub CLI (`gh`) in PATH  →  https://cli.github.com/
# Then once: gh auth login
# GitHub Actions PROD_* secrets are NOT required.
# AWS CLI is NOT required — production IP is static, no Lightsail lookup needed (2026-08-10, hosting-team update).

## Deployment script

set -euo pipefail

github_repo="sg2499/MathPath-Platform"
workflow_file="prod-build.yml"
github_branch="main"
git_ref=""

app_backend="mathpath-backend"
app_frontend="mathpath-frontend"
remote_main="/home/ubuntu/MathPath-Platform"
comment="GithubBuildThenScriptDeploy"

instance_key_pair="C:\Users\shail\.ssh\mathpath-platform.pem"

echo "$github_repo"
echo "$workflow_file"
echo "$comment"

if ! command -v gh >/dev/null 2>&1; then
	echo "ERROR: GitHub CLI (gh) not found in this Bash PATH."
	echo "Install from https://cli.github.com/  then CLOSE and reopen Git Bash."
	echo "Then run:  gh auth login"
	exit 1
fi
gh auth status


if [ -n "$git_ref" ]; then
	echo "Dispatching build workflow with git_ref=$git_ref"
	gh workflow run "$workflow_file" --repo "$github_repo" --ref "$github_branch" -f git_ref="$git_ref"
else
	echo "Dispatching build workflow on branch $github_branch"
	gh workflow run "$workflow_file" --repo "$github_repo" --ref "$github_branch"
fi

echo "Waiting for the new workflow run to appear..."
sleep 8
run_id=$(gh run list --repo "$github_repo" --workflow "$workflow_file" --branch "$github_branch" --limit 1 --json databaseId --jq '.[0].databaseId')
if [ -z "$run_id" ] || [ "$run_id" = "null" ]; then
	echo "ERROR: Could not find workflow run id for $workflow_file"
	exit 1
fi
echo "Watching build run id: $run_id"
gh run watch "$run_id" --repo "$github_repo" --exit-status


artifact_dir=$(mktemp -d 2>/dev/null || mktemp -d -t mpbuild)
echo "Downloading artifact to $artifact_dir"
gh run download "$run_id" --repo "$github_repo" --name mathpath-frontend-build --dir "$artifact_dir"
build_tgz="$artifact_dir/mathpath-frontend-build.tgz"
if [ ! -f "$build_tgz" ]; then
	build_tgz=$(find "$artifact_dir" -name 'mathpath-frontend-build.tgz' | head -n 1)
fi
echo "Build file: $build_tgz"
if [ -z "$build_tgz" ] || [ ! -f "$build_tgz" ]; then
	echo "ERROR: Frontend build artifact not found. Check Actions run $run_id succeeded and uploaded mathpath-frontend-build."
	exit 1
fi


instance_public_ip="15.206.108.37"
echo "$instance_public_ip"


scp -i "$instance_key_pair" "$build_tgz" ubuntu@"$instance_public_ip":/tmp/mathpath-frontend-build.tgz


ssh -t -i "$instance_key_pair" ubuntu@"$instance_public_ip" "
	set -e
	cd $remote_main
	pwd

	git remote set-url origin https://github.com/sg2499/MathPath-Platform.git

	git fetch origin
	git reset --hard origin/$github_branch
	git clean -fd -e 'backend/.env' -e 'frontend/.env' -e 'frontend/.env.local' -e 'backend/.venv' -e 'backend/uploads' -e 'frontend/node_modules' -e 'frontend/.next'

	rm -rf $remote_main/frontend/.next
	tar -xzf /tmp/mathpath-frontend-build.tgz -C $remote_main/frontend
	rm -f /tmp/mathpath-frontend-build.tgz

	cd $remote_main/backend
	if [ ! -d .venv ]; then python3 -m venv .venv; fi
	. .venv/bin/activate
	pip install -q -r requirements.txt
	deactivate

	cd $remote_main/frontend
	if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

	cd $remote_main
	sudo systemctl restart $app_backend
	pm2 restart $app_frontend
	pm2 status
"

rm -rf "$artifact_dir"
echo "script completed successfully"
