# GitHub Copilot Operational Instructions

## CRITICAL: TODO Management (VERY IMPORTANT)

### Creating TODOs
Every TODO must follow this EXACT format:
````
// TODO: [PRIORITY] [DATE] [YOUR_NAME] - Description
// Context: Why this needs to be done
// Impact: What happens if not done
// Estimated: X hours/days
````

**Priority Levels:**
- `CRITICAL` - Blocks deployment, must be done immediately
- `HIGH` - Important for next release
- `MEDIUM` - Nice to have, plan for future sprint
- `LOW` - Technical debt, address when time permits

**Examples:**
````javascript
// TODO: [CRITICAL] 2025-10-29 John - Fix calculation bug in invoice totals
// Context: Rounding error causing $0.01 discrepancies in 15% of invoices
// Impact: Accounting reconciliation failures, customer complaints
// Estimated: 2 hours

// TODO: [HIGH] 2025-10-29 Sarah - Add validation for negative quantities
// Context: Users can enter negative values causing inventory errors
// Impact: Data integrity issues in inventory reports
// Estimated: 4 hours

// TODO: [MEDIUM] 2025-10-29 Mike - Refactor order processing service
// Context: Function too complex (150 lines), hard to maintain
// Impact: Slower development, harder debugging
// Estimated: 1 day

// TODO: [LOW] 2025-10-29 John - Add JSDoc comments to utils
// Context: Missing documentation for utility functions
// Impact: Team onboarding slower, harder to understand code
// Estimated: 3 hours
````

### When to Create TODOs

**ALWAYS create a TODO when:**
1. ✅ You identify a bug but can't fix it immediately
2. ✅ You notice missing error handling
3. ✅ You see hardcoded values that should be configurable
4. ✅ You find missing validation
5. ✅ You spot potential performance issues
6. ✅ You notice missing tests
7. ✅ You see outdated documentation
8. ✅ You implement a temporary workaround

**NEVER create a TODO for:**
1. ❌ Things you can fix right now in < 5 minutes
2. ❌ Style preferences without clear benefit
3. ❌ Vague "improve this" notes
4. ❌ Already completed work

### TODO Tracking File

**Location:** `/docs/TODO-TRACKER.md`

Update this file whenever you create or complete TODOs:
````markdown
# TODO Tracker

Last Updated: 2025-10-29 14:30 UTC

## Active TODOs by Priority

### CRITICAL (0)
None - clear for deployment ✅

### HIGH (3)
1. **Invoice Calculation Bug** `[services/invoice.ts:145]`
   - Created: 2025-10-29 by John
   - Impact: Accounting reconciliation
   - Status: In Progress - ETA: Today
   
2. **Missing Quantity Validation** `[controllers/order.ts:89]`
   - Created: 2025-10-28 by Sarah
   - Impact: Data integrity
   - Status: Blocked - waiting on schema update
   
3. **Add Rate Limiting** `[middleware/auth.ts]`
   - Created: 2025-10-27 by Mike
   - Impact: Security vulnerability
   - Status: Ready - assigned to Sarah

### MEDIUM (5)
...

### LOW (12)
...

## Completed This Week (Last 7 Days)
- ✅ 2025-10-28: Fixed tax calculation rounding - John
- ✅ 2025-10-27: Added vendor validation - Sarah
- ✅ 2025-10-26: Updated API documentation - Mike

## TODO Statistics
- Total Active: 20
- Avg Age: 4.2 days
- Oldest: 14 days (LOW priority refactoring)
````

### TODO Update Process

**Before starting work:**
1. Check `/docs/TODO-TRACKER.md` for assigned tasks
2. Update status to "In Progress"
3. Add your name if taking over someone else's TODO

**After completing a TODO:**
1. Remove the TODO comment from code
2. Move item to "Completed" section in tracker
3. Update statistics
4. Commit with message: `fix: resolve TODO - [brief description]`

**Daily TODO Review:**
Run this command to find all TODOs:
````bash
grep -r "TODO:" --include="*.ts" --include="*.js" --include="*.py" --include="*.go" . | wc -l
````

If count increases without tracker update, YOU MUST update the tracker immediately.

---

## Session Information & Restart Handling

### Before Ending a Codespace Session

**ALWAYS create a session file:** `.codespace-session.md`
````markdown
# Codespace Session Log

## Current Session: 2025-10-29 14:30 UTC

### What I Was Working On
- Feature: Adding bulk import for purchase orders
- Files Modified:
  - `src/services/import.service.ts` (in progress)
  - `src/controllers/import.controller.ts` (completed)
  - `tests/import.test.ts` (not started)

### Current State
- ✅ Completed: API endpoint structure
- 🟡 In Progress: File parsing logic (50% done)
- ⏳ Not Started: Validation rules, error handling, tests

### Next Steps When Resuming
1. Finish the `parseCSVFile()` function in import.service.ts
2. Add validation for required fields (vendor_id, amount, date)
3. Write unit tests for parsing logic
4. Test with sample CSV file in `/test-data/sample-po.csv`
5. Update API documentation

### Known Issues
- CSV parser failing on empty lines (need to filter)
- Need to handle special characters in vendor names
- Missing error response for invalid file format

### Environment State
- Branch: `feature/bulk-import`
- Database: Seeded with test data
- Running services: API server on :3000, DB on :5432
- Last commit: `feat: add import controller structure`

### Important Notes
- Don't forget to update the TODO tracker before deploying
- Mike needs to review before merge to master
- This feature needs approval from Sarah (accounting lead)

### Quick Resume Command
```bash
cd /workspaces/project
git status
npm run dev
```
````

**Auto-backup script** - Add to `.devcontainer/devcontainer.json`:
````json
{
  "postStartCommand": "cat .codespace-session.md || echo 'No previous session'",
  "postCreateCommand": "git config --global alias.save-session '!f() { git add -A && git stash save \"Session backup: $(date)\"; }; f'"
}
````

### When Resuming After Restart

**REQUIRED STEPS:**

1. **Read session file:**
````bash
cat .codespace-session.md
````

2. **Check git status:**
````bash
git status
git log --oneline -5
git diff
````

3. **Restore environment:**
````bash
# Restore uncommitted changes if needed
git stash list
git stash pop  # if you saved session state

# Restart services
docker-compose up -d
npm run dev
````

4. **Verify state:**
````bash
# Check database
psql -c "SELECT COUNT(*) FROM orders;"

# Check running processes
ps aux | grep node

# Test API
curl http://localhost:3000/health
````

5. **Continue from "Next Steps" in session file**

---

## Master Branch Deployment - SAFETY PROTOCOL

### Pre-Deployment Checklist

**YOU MUST complete ALL items before ANY merge to master:**
````markdown
## Deployment Readiness Checklist

### Code Quality
- [ ] All TODOs resolved or documented with HIGH+ priority
- [ ] No `console.log()` or debug statements in code
- [ ] No commented-out code blocks
- [ ] No hardcoded credentials or API keys
- [ ] All ESLint/linting warnings resolved

### Testing
- [ ] All unit tests passing: `npm test`
- [ ] All integration tests passing: `npm run test:integration`
- [ ] Manual testing completed for changed features
- [ ] Edge cases tested (empty data, invalid input, etc.)
- [ ] Error scenarios tested and handled gracefully

### Documentation
- [ ] README updated if setup changed
- [ ] API documentation updated if endpoints changed
- [ ] CHANGELOG.md updated with changes
- [ ] TODO-TRACKER.md updated
- [ ] Migration notes added if database changed

### Security
- [ ] No secrets in git history: `git log -p | grep -i "password\|api_key\|secret"`
- [ ] Input validation on all user inputs
- [ ] SQL queries parameterized (no string concatenation)
- [ ] Dependencies up to date: `npm audit`
- [ ] Environment variables documented in `.env.example`

### Database
- [ ] Migration scripts tested on staging database
- [ ] Rollback plan documented
- [ ] Backup verified before migration
- [ ] No breaking changes to existing data

### Performance
- [ ] No N+1 queries introduced
- [ ] Large operations paginated
- [ ] Indexes added for new query patterns
- [ ] Load tested if touching critical paths

### Code Review
- [ ] PR approved by at least 1 team member
- [ ] All review comments addressed
- [ ] No "LGTM" without actual review
````

### Deployment Commands - WITH SAFETY

**NEVER deploy directly. Always use this workflow:**
````bash
# 1. Verify you're on your feature branch
git branch --show-current
# Must NOT be 'master' or 'main'

# 2. Update from master
git fetch origin
git merge origin/master
# Resolve conflicts if any

# 3. Run full test suite
npm test && npm run test:integration
# MUST show all tests passing

# 4. Check for TODOs
grep -r "TODO: \[CRITICAL\]" src/
# MUST return empty - no critical TODOs

# 5. Lint check
npm run lint
# MUST show 0 errors, 0 warnings

# 6. Build check
npm run build
# MUST complete without errors

# 7. Create PR (don't push to master directly)
gh pr create --base master --head $(git branch --show-current) \
  --title "feat: your feature description" \
  --body "$(cat <<EOF
## Changes
- What you changed

## Testing
- How you tested

## Checklist
- [x] All tests passing
- [x] No critical TODOs
- [x] Documentation updated
- [x] Ready for review
EOF
)"

# 8. Wait for approval
# DO NOT merge your own PR
# MUST have at least 1 approval

# 9. After approval, merge via GitHub UI
# Use "Squash and merge" for clean history
# Use "Merge commit" for preserving history

# 10. Verify deployment
curl https://api.production.com/health
# Check monitoring dashboard
# Verify logs for errors
````

### Emergency Rollback

**If something breaks in production:**
````bash
# 1. IMMEDIATELY notify team
echo "🚨 PRODUCTION ISSUE - Rolling back"

# 2. Find last known good commit
git log --oneline master -10

# 3. Create rollback branch
git checkout -b rollback/emergency-$(date +%Y%m%d-%H%M%S)
git reset --hard <last-good-commit-sha>

# 4. Force push to master (only in emergency)
git push origin rollback/emergency-$(date +%Y%m%d-%H%M%S):master --force

# 5. Document in incident log
cat >> docs/INCIDENTS.md << EOF
## Incident: $(date)
- **Issue**: [describe what broke]
- **Rolled back to**: <commit-sha>
- **Root cause**: [what caused it]
- **Prevention**: [how to prevent]
EOF
````

---

## Documentation Housekeeping

### Files to Keep Updated
````
docs/
├── TODO-TRACKER.md           ← Update daily
├── API.md                    ← Update when endpoints change
├── CHANGELOG.md              ← Update before each deployment
├── ARCHITECTURE.md           ← Update when structure changes
├── INCIDENTS.md              ← Update after any production issue
└── RUNBOOK.md                ← Update when ops procedures change
````

### Weekly Documentation Tasks (Every Friday)

**Copilot should remind you:**
````markdown
# 📋 Weekly Documentation Checklist - Friday

## 1. Update TODO Tracker
```bash
# Find all TODOs in code
grep -r "TODO:" --include="*.ts" --include="*.js" src/ > /tmp/todos.txt

# Compare with tracker
diff /tmp/todos.txt docs/TODO-TRACKER.md
# Update tracker with any new TODOs
```

## 2. Clean Up Completed TODOs
- Remove TODO comments for completed work
- Move items to "Completed This Week"
- Update statistics

## 3. Update CHANGELOG
```markdown
# Add to docs/CHANGELOG.md

## Week of 2025-10-29

### Added
- Bulk import feature for purchase orders
- Rate limiting on authentication endpoints

### Fixed
- Invoice calculation rounding errors
- Vendor validation on order creation

### Changed
- Upgraded PostgreSQL to v15
- Improved error messages in API responses

### Removed
- Deprecated legacy import endpoint
```

## 4. Audit Documentation
- Check for broken links: `npm run docs:check`
- Verify code examples still work
- Update screenshots if UI changed
- Remove obsolete documentation

## 5. Review Open PRs
- Check for stale PRs (> 7 days old)
- Close or merge inactive PRs
- Comment on blocked PRs

## 6. Clean Git Branches
```bash
# List merged branches
git branch --merged master | grep -v "master"

# Delete locally
git branch -d <branch-name>

# Delete remotely
git push origin --delete <branch-name>
```

## 7. Update Dependencies
```bash
# Check for updates
npm outdated

# Update minor/patch versions
npm update

# Review and update major versions manually
npm install package@latest
```
````

### Before Each Commit - Auto-Checks

Add to `.husky/pre-commit`:
````bash
#!/bin/bash

echo "🔍 Running pre-commit checks..."

# 1. Check for TODO tracker updates
TODO_COUNT=$(grep -r "TODO:" --include="*.ts" --include="*.js" src/ | wc -l)
TRACKER_COUNT=$(grep -c "^\- \*\*" docs/TODO-TRACKER.md || echo "0")

if [ "$TODO_COUNT" != "$TRACKER_COUNT" ]; then
  echo "❌ ERROR: TODO count mismatch!"
  echo "   Code has $TODO_COUNT TODOs"
  echo "   Tracker has $TRACKER_COUNT TODOs"
  echo "   Please update docs/TODO-TRACKER.md"
  exit 1
fi

# 2. Check for console.log
if git diff --cached | grep -E "console\.(log|debug|info)"; then
  echo "❌ ERROR: Found console.log statements"
  echo "   Remove debug statements before commit"
  exit 1
fi

# 3. Check for hardcoded secrets
if git diff --cached | grep -iE "(password|api_key|secret|token)\s*=\s*['\"][^'\"]+['\"]"; then
  echo "❌ ERROR: Possible hardcoded secret detected"
  echo "   Use environment variables instead"
  exit 1
fi

# 4. Update session file
cat > .codespace-session.md << EOF
# Last Commit Session

Date: $(date)
Branch: $(git branch --show-current)
Files: $(git diff --cached --name-only | tr '\n' ', ')
Message: $(git log -1 --pretty=%B 2>/dev/null || echo "Initial commit")

To resume: git checkout $(git branch --show-current)
EOF

echo "✅ All pre-commit checks passed"
````

### Documentation Templates

**Create these files in `/docs/templates/`:**

#### `docs/templates/FEATURE.md`
````markdown
# Feature: [Feature Name]

## Overview
Brief description of what this feature does.

## User Story
As a [user type], I want to [action] so that [benefit].

## Technical Design
- Architecture changes
- Database schema changes
- API endpoints affected

## Implementation Checklist
- [ ] Write tests
- [ ] Implement core logic
- [ ] Add error handling
- [ ] Update documentation
- [ ] Add to CHANGELOG
- [ ] Deploy to staging
- [ ] QA testing
- [ ] Deploy to production

## Rollback Plan
How to undo if something goes wrong.

## Monitoring
What metrics to watch after deployment.
````

#### `docs/templates/BUG-REPORT.md`
````markdown
# Bug Report: [Brief Description]

Date: [YYYY-MM-DD]
Severity: [CRITICAL/HIGH/MEDIUM/LOW]
Reporter: [Name]

## Symptoms
What is the observable problem?

## Impact
- Who is affected?
- How many users?
- Business impact?

## Reproduction Steps
1. Step one
2. Step two
3. Observed behavior

## Expected Behavior
What should happen instead?

## Root Cause
Technical explanation of why it's happening.

## Fix
What needs to be changed?

## Prevention
How to prevent similar issues?
````

---

## Git Commit Message Standards

**Format:**
````
<type>: <subject>

<body>

<footer>
````

**Types:**
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `refactor:` Code change that neither fixes a bug nor adds a feature
- `test:` Adding or updating tests
- `chore:` Maintenance tasks

**Examples:**
````bash
# Good ✅
git commit -m "feat: add bulk import for purchase orders

- Parse CSV files with vendor, amount, date
- Validate required fields
- Handle errors gracefully
- Add unit tests

Closes #123"

# Good ✅
git commit -m "fix: resolve invoice calculation rounding error

Invoice totals were off by $0.01 due to floating point
arithmetic. Now using Decimal type for all calculations.

Fixes #456"

# Bad ❌
git commit -m "fixed stuff"

# Bad ❌
git commit -m "WIP"

# Bad ❌
git commit -m "updates"
````

---

## Quick Reference Commands

### Daily Workflow
````bash
# Start day
cat .codespace-session.md
git status
npm run dev

# Check TODOs
grep -r "TODO: \[CRITICAL\]" src/

# End day
# Update .codespace-session.md
git add .
git commit
git push
````

### Before Deployment
````bash
# Full check
npm test && npm run lint && npm run build

# TODO audit
grep -r "TODO:" src/ | tee /tmp/todos.txt
wc -l /tmp/todos.txt

# Security check
git log -p | grep -i "password\|api_key\|secret" || echo "Clean ✅"
````

### Emergency
````bash
# Rollback
git revert HEAD
git push

# Check production logs
kubectl logs -f deployment/api --tail=100

# Database backup
pg_dump production_db > backup_$(date +%Y%m%d_%H%M%S).sql
````
