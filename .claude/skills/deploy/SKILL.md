---
name: deploy
description: Build the project, commit all changes, and deploy to main via the claude/merge-to-main branch. Use when deploying changes to production.
allowed-tools: Bash, Read, Glob, Write, Edit
---

# Deploy to Main

Automates the complete deployment workflow for pushing changes to main.

## Workflow

1. **Build**: Run `npm run build` to ensure no compilation errors
2. **Status Check**: Check git status for uncommitted changes
3. **Commit**: Commit changes with a descriptive message
4. **Push**: Push to the current branch
5. **Merge Branch**: Checkout and merge into `claude/merge-to-main` branch
6. **Deploy**: Push to trigger PR creation and deployment
7. **Confirm**: Provide PR URL and deployment status

## Commands

```bash
# Build project
npm run build

# Check status
git status
git log --oneline -3

# Commit (if changes exist)
git add -A
git commit -m "chore: <descriptive message>"

# Push current branch
git push -u origin <branch>

# Merge to deployment branch
git checkout claude/merge-to-main
git merge <branch> -m "chore: merge for deployment"
git push -u origin claude/merge-to-main
```

## When to Use

- "deploy to main"
- "push changes to production"
- "deploy these changes"
- "/deploy"
