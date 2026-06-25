# MathPath Platform Workspace Rules

## Core Memory & Conventions
1. **Admin Authorization Check:** When querying the database for "Admins" to send notifications or verify permissions, always use `User.role.in_(["ADMIN", "SUPER_ADMIN"])` instead of just checking for `"ADMIN"`. The primary administrator account relies on the `SUPER_ADMIN` role.
2. **Mock Exam Notification Routing:** Frontend notifications for mock exams (`MOCK_SUBMITTED`) must route students/admins to the `mock-result` page to view their scores, not the `mock-attempt` page.

## Zero-Touch CI/CD Workflow
For any task assigned to you in this project:
1. **Understand & Implement**: Plan out the task, write the code, and ensure all changes are functional.
2. **Local Verification**: Run relevant tests, formatters, and linters to ensure changes won't break the `repository-safety` checks in GitHub Actions.
3. **Commit & Push**: Once verified locally, automatically add changes, write a conventional commit message, and `git push` to the working branch.
4. **Monitor Deployment (`gh` CLI)**: After pushing, use the GitHub CLI (`gh run list` or `gh pr status`) to check the status of the triggered Actions. Since Render and Vercel are hooked to GitHub, a successful build indicates successful deployment.
5. **Autonomy Recommendation**: Actively suggest that the user uses the `/goal` slash command for new assignments to allow this workflow to run continuously without pausing for intermediate permission steps.
6. **Final Handoff**: Only stop and notify the user once the GitHub push is successful and deployments have been triggered, prompting them to verify the live platform.
