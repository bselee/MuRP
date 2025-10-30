#!/bin/bash

# Script to check for console.log/error/warn statements in the codebase
# Helps identify areas that need cleanup

echo "==================================="
echo "Console Statement Analysis"
echo "==================================="
echo ""

TOTAL=$(grep -r "console\.\(log\|error\|warn\)" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules . | wc -l)

echo "Total console statements: $TOTAL"
echo ""
echo "Breakdown by type:"
echo "  console.log:   $(grep -r "console\.log" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules . | wc -l)"
echo "  console.error: $(grep -r "console\.error" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules . | wc -l)"
echo "  console.warn:  $(grep -r "console\.warn" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules . | wc -l)"
echo ""
echo "Top 10 files with console statements:"
grep -r "console\.\(log\|error\|warn\)" --include="*.ts" --include="*.tsx" --exclude-dir=node_modules . | cut -d: -f1 | sort | uniq -c | sort -rn | head -10
echo ""
echo "Recommendation: Replace console statements with the structured logger"
echo "  import { createLogger } from './lib/logger';"
echo "  const logger = createLogger('ComponentName');"
echo "  logger.debug('message', metadata);"
echo "  logger.error('message', error);"
