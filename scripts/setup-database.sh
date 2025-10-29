#!/bin/bash
# Database setup and migration script
# Run this to set up your Supabase database

set -e

echo "🗄️  TGF MRP - Database Setup"
echo "============================"
echo ""

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

step() {
    echo -e "${BLUE}➜${NC} $1"
}

success() {
    echo -e "${GREEN}✓${NC} $1"
}

error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    error "Supabase CLI not found"
    echo ""
    echo "Install it with:"
    echo "  brew install supabase/tap/supabase"
    echo "  or"
    echo "  npm install -g supabase"
    echo ""
    exit 1
fi

success "Supabase CLI found"
echo ""

# Check if project is linked
step "Checking Supabase project..."
if [ ! -f ".supabase/config.toml" ]; then
    echo "Project not linked. Let's link it now."
    echo ""
    echo "You'll need your Supabase project reference ID."
    echo "Find it at: https://supabase.com/dashboard/project/YOUR-PROJECT/settings/general"
    echo ""
    read -p "Enter your project reference ID: " PROJECT_REF
    
    supabase link --project-ref "$PROJECT_REF"
    success "Project linked"
else
    success "Project already linked"
fi
echo ""

# Apply migrations
step "Applying database migrations..."
echo "This will create all tables and functions in your Supabase database."
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cancelled."
    exit 0
fi

supabase db push
success "Migrations applied"
echo ""

# Generate TypeScript types
step "Generating TypeScript types..."
supabase gen types typescript --local > types/database.ts
success "Types generated at types/database.ts"
echo ""

# Optional: Seed database
echo "Would you like to seed the database with test data?"
echo "(This will create sample inventory, vendors, etc.)"
read -p "Seed database? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    step "Seeding database..."
    
    # Check if seed script exists
    if [ -f "scripts/seed-database.sql" ]; then
        supabase db execute --file scripts/seed-database.sql
        success "Database seeded"
    else
        echo "⚠️  Seed script not found at scripts/seed-database.sql"
        echo "You can manually seed data through the Supabase dashboard."
    fi
fi
echo ""

echo "============================"
echo -e "${GREEN}✅ Database setup complete!${NC}"
echo ""
echo "Your database is ready with:"
echo "  ✓ All tables created"
echo "  ✓ Row-level security enabled"
echo "  ✓ Audit logging configured"
echo "  ✓ TypeScript types generated"
echo ""
echo "Next steps:"
echo "  1. Verify tables in Supabase dashboard"
echo "  2. Test auth by signing up in your app"
echo "  3. Check RLS policies are working"
echo ""
