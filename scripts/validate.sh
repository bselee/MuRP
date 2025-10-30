#!/bin/bash

# Script to validate the codebase before committing
# Runs tests and builds to ensure everything works

set -e  # Exit on first error

echo "==================================="
echo "TGF MRP Validation"
echo "==================================="
echo ""

echo "Step 1: Running tests..."
npm test

echo ""
echo "Step 2: Building project..."
npm run build

echo ""
echo "==================================="
echo "✅ Validation Complete!"
echo "==================================="
echo ""
echo "All checks passed. Safe to commit!"
