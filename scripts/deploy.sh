#!/bin/bash
# Automated deployment script for Vercel
# Usage: ./scripts/deploy.sh [preview|production]

set -e

DEPLOY_TYPE="${1:-preview}"

echo "🚀 MuRP - Automated Deployment"
echo "=================================="
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() {
    echo -e "${BLUE}➜${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

# 1. Run pre-deployment checks
step "Running pre-deployment verification..."
if [ -f "scripts/verify-deployment.sh" ]; then
    bash scripts/verify-deployment.sh
else
    echo "⚠️  Skipping verification (script not found)"
fi
echo ""

# 2. Check if Vercel CLI is installed
step "Checking Vercel CLI..."
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI not found. Installing..."
    npm install -g vercel
fi
success "Vercel CLI ready"
echo ""

# 3. Login to Vercel (if not already)
step "Checking Vercel authentication..."
if vercel whoami > /dev/null 2>&1; then
    success "Already logged in to Vercel"
else
    echo "Please log in to Vercel:"
    vercel login
fi
echo ""

# 4. Build the project
step "Building project..."
npm run build
success "Build complete"
echo ""

# 5. Deploy based on type
if [ "$DEPLOY_TYPE" = "production" ]; then
    echo "🌐 Deploying to PRODUCTION..."
    echo "⚠️  This will update your live site!"
    echo ""
    read -p "Continue? (y/n) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
    
    step "Deploying to production..."
    vercel --prod
else
    echo "🔍 Deploying to PREVIEW..."
    step "Creating preview deployment..."
    vercel
fi

echo ""
echo "=================================="
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Visit the deployment URL shown above"
echo "  2. Test authentication (sign up / sign in)"
echo "  3. Verify data loads correctly"
echo "  4. Check Settings > External Data Sources"
echo "  5. Review logs: vercel logs"
echo ""

if [ "$DEPLOY_TYPE" != "production" ]; then
    echo "To deploy to production:"
    echo "  ./scripts/deploy.sh production"
    echo ""
fi
