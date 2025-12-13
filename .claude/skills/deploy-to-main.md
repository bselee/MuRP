# Deploy to Main Skill

This skill automates the deployment workflow for pushing changes to main via the claude/merge-to-main branch.

## What this skill does:

1. Builds the project to ensure no errors
2. Commits all changes with a descriptive message
3. Pushes to the appropriate claude/ branch
4. Merges changes to the claude/merge-to-main branch
5. Pushes to trigger PR and deployment
6. Provides the PR URL for manual merge (or auto-merges if configured)

## Usage:

The user can invoke this skill by saying:
- "deploy to main"
- "push changes to production"
- "deploy these changes"

## Workflow:

```bash
# 1. Build the project
npm run build

# 2. Check current branch and changes
git status

# 3. Commit changes if there are any
# (Ask user for commit message or generate from changes)

# 4. Push to current claude/ branch
git push -u origin <current-claude-branch>

# 5. Switch to and merge into claude/merge-to-main branch
git checkout claude/merge-to-main-01V2MZUQUduMLjGusbs4Qs8J
git merge <previous-branch> -m "chore: merge changes for deployment"

# 6. Push merge-to-main branch
git push -u origin claude/merge-to-main-01V2MZUQUduMLjGusbs4Qs8J

# 7. Provide PR URL and next steps
echo "PR created: https://github.com/bselee/MuRP/pull/new/claude/merge-to-main-01V2MZUQUduMLjGusbs4Qs8J"
```

## When to use:

Use this skill whenever you've made changes and need to deploy them to production. This ensures:
- Code builds successfully before pushing
- Changes go through the proper branch workflow
- PRs are created automatically
- Deployment is triggered

## Auto-merge setup:

To enable auto-merge, we need to set up a GitHub Action that automatically merges PRs from claude/merge-to-main branches.
