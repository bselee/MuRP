#!/bin/bash
# Pre-deployment verification script
# Run this before deploying to catch issues early

set -e  # Exit on any error

echo "🔍 TGF MRP - Pre-Deployment Verification"
echo "========================================"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    exit 1
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# 1. Check Node.js version
echo "📦 Checking Node.js version..."
NODE_VERSION=$(node -v)
if [[ $NODE_VERSION == v20* ]] || [[ $NODE_VERSION == v18* ]]; then
    check_pass "Node.js version: $NODE_VERSION"
else
    check_warn "Node.js version $NODE_VERSION (recommend v18 or v20)"
fi
echo ""

# 2. Check if .env.local exists
echo "🔐 Checking environment configuration..."
if [ -f ".env.local" ]; then
    check_pass ".env.local file exists"
    
    # Check required variables
    REQUIRED_VARS=("VITE_SUPABASE_URL" "VITE_SUPABASE_ANON_KEY" "SUPABASE_SERVICE_ROLE_KEY" "GEMINI_API_KEY")
    for var in "${REQUIRED_VARS[@]}"; do
        if grep -q "^$var=" .env.local; then
            check_pass "$var is set"
        else
            check_fail "$var is missing in .env.local"
        fi
    done
else
    check_fail ".env.local file not found. Copy .env.example and fill in values."
fi
echo ""

# 3. Check dependencies
echo "📚 Checking dependencies..."
if [ -d "node_modules" ]; then
    check_pass "node_modules directory exists"
else
    check_warn "node_modules not found. Running npm install..."
    npm install
    check_pass "Dependencies installed"
fi
echo ""

# 4. Build test
echo "🔨 Testing production build..."
if npm run build > /dev/null 2>&1; then
    check_pass "Production build succeeds"
else
    check_fail "Production build failed. Run 'npm run build' to see errors."
fi
echo ""

# 5. Check for TypeScript errors
echo "🔍 Checking TypeScript..."
if npx tsc --noEmit > /dev/null 2>&1; then
    check_pass "No TypeScript errors"
else
    check_warn "TypeScript errors detected (not blocking deployment)"
fi
echo ""

# 6. Check git status
echo "📝 Checking git status..."
if [ -z "$(git status --porcelain)" ]; then
    check_pass "Working directory clean (all changes committed)"
else
    check_warn "Uncommitted changes detected:"
    git status --short
    echo ""
    read -p "Continue with uncommitted changes? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted. Commit your changes first."
        exit 1
    fi
fi
echo ""

# 7. Check Supabase CLI
echo "🗄️  Checking Supabase CLI..."
if command -v supabase &> /dev/null; then
    check_pass "Supabase CLI installed"
    
    # Check if project is linked
    if [ -f ".supabase/config.toml" ]; then
        check_pass "Supabase project linked"
    else
        check_warn "Supabase project not linked. Run 'supabase link --project-ref YOUR_REF'"
    fi
else
    check_warn "Supabase CLI not installed (optional but recommended)"
fi
echo ""

# 8. Check Vercel CLI
echo "☁️  Checking Vercel CLI..."
if command -v vercel &> /dev/null; then
    check_pass "Vercel CLI installed"
else
    check_warn "Vercel CLI not installed. Install with: npm i -g vercel"
fi
echo ""

# 9. File structure check
echo "📁 Checking file structure..."
REQUIRED_FILES=("package.json" "vercel.json" "tsconfig.json" "index.html" "App.tsx")
for file in "${REQUIRED_FILES[@]}"; do
    if [ -f "$file" ] || [ -f "src/$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file not found"
    fi
done
echo ""

# 10. Check API endpoints
echo "🔌 Checking API endpoints..."
API_FILES=("api/ai/query.ts" "api/external/sync.ts")
for file in "${API_FILES[@]}"; do
    if [ -f "$file" ]; then
        check_pass "$file exists"
    else
        check_fail "$file not found"
    fi
done
echo ""

# Summary
echo "========================================"
echo -e "${GREEN}✅ Pre-deployment verification complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Run: ./scripts/deploy.sh (to deploy to Vercel)"
echo "  2. Or manually: vercel --prod"
echo ""
echo "See DEPLOYMENT_GUIDE.md for detailed instructions."
